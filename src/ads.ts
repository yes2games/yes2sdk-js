/**
 * Ad runtime: an in-flight latch, a frame-time watchdog and per-request ids
 * around `window.Yes2SDK.ads`. Same contract as the Unity and Defold wrappers.
 *
 * What this adds on top of the SDK (and nothing else; no platform logic):
 * - One ad at a time. A `show*` call while an ad is in flight gets `noFill`
 *   only. It never gets `afterAd`, which would resume the game while the first
 *   ad is still on screen.
 * - A watchdog. An ad gets 30 s (frame time) to reach `beforeAd`, then 180 s to
 *   finish. Each frame counts at most 0.5 s, so a hidden tab cannot trip it. On
 *   firing, the latch is released, then `noFill` and `afterAd` are delivered (or
 *   just `afterAd` when the ad had started or already has an outcome).
 * - Request ids. Callbacks that arrive after their request was released are
 *   dropped, so a late platform callback can never touch a newer ad.
 * - A retry started from inside `noFill` first gets the pending `afterAd` of the
 *   ad that no-filled, so the game resumes before the new ad's `beforeAd`.
 * - Every game callback runs in its own try/catch. The latch is released before
 *   the game's terminal callback runs, so it may start another ad from there.
 *
 * Callback order is `beforeAd` -> one outcome -> `afterAd` (always last). The
 * SDK already guarantees that on the real path; the wrapper only keeps it true
 * for the paths it creates itself (concurrent rejection, watchdog, a rejected
 * SDK call).
 */

import type { AdCallbacks, Yes2SDK } from "../types/yes2sdk";
import { animationFrameClock, onNextFrame, type FrameClock } from "./frame-clock";
import { consoleLogger, describeError, getSdk, safeCall, type RuntimeLogger } from "./sdk";

export type AdKind = "interstitial" | "rewarded";

/**
 * How an ad call ended, as seen by the game:
 * - `"shown"`: an interstitial finished.
 * - `"viewed"`: a rewarded ad was watched; grant the reward (also via `adViewed`).
 * - `"dismissed"`: a rewarded ad was closed early or its result was unclear.
 * - `"noFill"`: no ad was shown (no fill, blocked, error, timeout, or another ad was in flight).
 */
export type AdOutcome = "shown" | "viewed" | "dismissed" | "noFill";

export interface AdRuntimeOptions {
    /** Where the SDK comes from. Default: `window.Yes2SDK`, read at call time. */
    getSdk?: () => Yes2SDK | undefined;
    /** Frame clock for the watchdog and next-frame delivery. Default: requestAnimationFrame. */
    clock?: FrameClock;
    logger?: RuntimeLogger;
    /** Seconds (frame time) for the ad to reach `beforeAd`. Default 30. */
    startTimeoutSeconds?: number;
    /** Seconds (frame time) from `beforeAd` to `afterAd`. Default 180. */
    playingTimeoutSeconds?: number;
    /** Largest delta one frame may add. Default 0.5. */
    maxFrameSeconds?: number;
}

type Outcome = "viewed" | "dismissed" | "noFill";

interface AdRequest {
    readonly id: number;
    readonly kind: AdKind;
    readonly callbacks: AdCallbacks;
    readonly resolve: (outcome: AdOutcome) => void;
    started: boolean;
    outcome: Outcome | null;
    afterDone: boolean;
    released: boolean;
    elapsed: number;
    deadline: number;
    stopWatchdog: (() => void) | null;
    awaitingAfter: boolean;
    cancelAfterTimer: (() => void) | null;
    beforeDropped: boolean;
}

export class AdRuntime {
    private readonly sdkSource: () => Yes2SDK | undefined;
    private readonly clock: FrameClock;
    private readonly logger: RuntimeLogger;
    private readonly startTimeout: number;
    private readonly playingTimeout: number;
    private readonly maxFrame: number;
    private inFlight = false;
    private active: AdRequest | null = null;
    private awaiting: AdRequest | null = null;
    private requestCount = 0;

    constructor(options: AdRuntimeOptions = {}) {
        this.sdkSource = options.getSdk ?? getSdk;
        this.clock = options.clock ?? animationFrameClock;
        this.logger = options.logger ?? consoleLogger;
        this.startTimeout = options.startTimeoutSeconds ?? 30;
        this.playingTimeout = options.playingTimeoutSeconds ?? 180;
        this.maxFrame = options.maxFrameSeconds ?? 0.5;
    }

    /** True from a `show*` call until that ad is released (`afterAd`, `noFill` or the watchdog). */
    isAdShowing(): boolean {
        return this.inFlight;
    }

    /** Show an interstitial. Resolves after `afterAd` (or at once with `"noFill"` if another ad is in flight). Never rejects. */
    showInterstitial(placement: string, callbacks: AdCallbacks = {}): Promise<AdOutcome> {
        return this.show("interstitial", placement, callbacks);
    }

    /** Show a rewarded ad. Grant the reward in `adViewed` or when this resolves `"viewed"`. Never rejects. */
    showRewarded(placement: string, callbacks: AdCallbacks = {}): Promise<AdOutcome> {
        return this.show("rewarded", placement, callbacks);
    }

    // -- Support checks: false (never a throw) when the SDK is missing or older than the method. --

    isInterstitialSupported(): boolean {
        return this.adsCheck("isInterstitialSupported");
    }

    isRewardedSupported(): boolean {
        return this.adsCheck("isRewardedSupported");
    }

    isBannerSupported(): boolean {
        return this.adsCheck("isBannerSupported");
    }

    isRewardedAdAvailable(): boolean {
        return this.adsCheck("isRewardedAdAvailable");
    }

    isAdBlocked(): boolean {
        return this.adsCheck("isAdBlocked");
    }

    private adsCheck(
        method: "isInterstitialSupported" | "isRewardedSupported" | "isBannerSupported" | "isRewardedAdAvailable" | "isAdBlocked"
    ): boolean {
        try {
            const ads = this.sdkSource()?.ads as Partial<Yes2SDK["ads"]> | undefined;
            const fn = ads?.[method];
            return typeof fn === "function" ? fn.call(ads) === true : false;
        } catch (error) {
            this.logger.warn(`ads.${method}() threw; treating as false.`, describeError(error));
            return false;
        }
    }

    // -- Request lifecycle --

    private show(kind: AdKind, placement: string, callbacks: AdCallbacks): Promise<AdOutcome> {
        this.settleAwaiting();
        if (this.inFlight) {
            this.logger.warn(
                `show${kind === "interstitial" ? "Interstitial" : "Rewarded"}("${placement}") rejected: another ad is ` +
                    "already in flight (AdAlreadyShowing). This call gets noFill only. Wait for afterAd or noFill " +
                    "before showing another ad."
            );
            safeCall(this.logger, "noFill", callbacks.noFill);
            return Promise.resolve("noFill");
        }
        return new Promise<AdOutcome>((resolve) => {
            this.requestCount += 1;
            const request: AdRequest = {
                id: this.requestCount,
                kind,
                callbacks,
                resolve,
                started: false,
                outcome: null,
                afterDone: false,
                released: false,
                elapsed: 0,
                deadline: this.startTimeout,
                stopWatchdog: null,
                awaitingAfter: false,
                cancelAfterTimer: null,
                beforeDropped: false,
            };
            this.active = request;
            this.inFlight = true;
            this.startWatchdog(request);
            this.callSdk(request, placement);
        });
    }

    private callSdk(request: AdRequest, placement: string): void {
        const ads = this.sdkSource()?.ads as Partial<Yes2SDK["ads"]> | undefined;
        const method = request.kind === "interstitial" ? ads?.showInterstitial : ads?.showRewarded;
        if (ads === undefined || typeof method !== "function") {
            this.failSdkCall(request, new Error("window.Yes2SDK.ads is not available"));
            return;
        }
        const wrapped: AdCallbacks = {
            beforeAd: (): void => this.onBeforeAd(request),
            afterAd: (): void => this.onAfterAd(request),
            noFill: (): void => this.onNoFill(request),
        };
        if (request.kind === "rewarded") {
            wrapped.adViewed = (): void => this.onOutcome(request, "viewed", "adViewed");
            wrapped.adDismissed = (): void => this.onOutcome(request, "dismissed", "adDismissed");
        }
        try {
            const result: unknown = method.call(ads, placement, wrapped);
            Promise.resolve(result).catch((error: unknown) => this.failSdkCall(request, error));
        } catch (error) {
            this.failSdkCall(request, error);
        }
    }

    /**
     * The SDK call threw or rejected. If it already settled the request (the SDK
     * delivers noFill + afterAd before rejecting a failed ad) this only logs.
     * Otherwise noFill then afterAd follow on the next frame; the latch is held
     * until then so a same-frame second call is rejected as concurrent.
     */
    private failSdkCall(request: AdRequest, error: unknown): void {
        if (request.released || request !== this.active) {
            this.logger.warn(`ad ${request.id} call rejected after it settled:`, describeError(error));
            return;
        }
        this.logger.warn(`ad ${request.id} call failed, reporting noFill:`, describeError(error));
        onNextFrame(this.clock, () => {
            if (this.release(request)) {
                this.endWithNoFill(request);
            }
        });
    }

    private startWatchdog(request: AdRequest): void {
        request.stopWatchdog = this.clock.subscribe((dt) => {
            if (request.released) {
                request.stopWatchdog?.();
                return;
            }
            request.elapsed += Math.min(Math.max(dt, 0), this.maxFrame);
            if (request.elapsed < request.deadline) {
                return;
            }
            const phase = request.started ? "playing" : "start";
            const seconds = request.deadline;
            if (!this.release(request)) {
                return;
            }
            if (phase === "start" && request.outcome === null) {
                this.logger.warn(
                    `ad watchdog: no beforeAd after ${seconds}s, releasing ad ${request.id} and reporting noFill.`
                );
                this.endWithNoFill(request);
            } else {
                this.logger.warn(
                    `ad watchdog: ${phase === "playing" ? `no afterAd ${seconds}s after beforeAd` : `no beforeAd after ${seconds}s`}, ` +
                        `releasing ad ${request.id} and reporting afterAd.`
                );
                this.deliverAfterAd(request);
            }
        });
    }

    /** Release `request` exactly once, and only if it still owns the latch. */
    private release(request: AdRequest): boolean {
        if (request.released || request !== this.active) {
            return false;
        }
        request.released = true;
        request.stopWatchdog?.();
        request.stopWatchdog = null;
        this.active = null;
        this.inFlight = false;
        return true;
    }

    private onBeforeAd(request: AdRequest): void {
        if (request.released) {
            if (!request.beforeDropped) {
                request.beforeDropped = true;
                this.logger.warn(`beforeAd dropped for ad ${request.id}: the ad was already released.`);
            }
            return;
        }
        request.started = true;
        request.elapsed = 0;
        request.deadline = this.playingTimeout;
        safeCall(this.logger, "beforeAd", request.callbacks.beforeAd);
    }

    private onOutcome(request: AdRequest, outcome: Outcome, name: string): void {
        if (request.afterDone) {
            this.logger.warn(`${name} dropped for ad ${request.id}: it already ended.`);
            return;
        }
        this.deliverOutcome(request, outcome, name);
    }

    /** First outcome wins; later ones are dropped. */
    private deliverOutcome(request: AdRequest, outcome: Outcome, name: string): void {
        if (request.outcome !== null) {
            this.logger.warn(`${name} dropped for ad ${request.id}: its outcome was already ${request.outcome}.`);
            return;
        }
        request.outcome = outcome;
        const fn =
            outcome === "viewed"
                ? request.callbacks.adViewed
                : outcome === "dismissed"
                  ? request.callbacks.adDismissed
                  : request.callbacks.noFill;
        safeCall(this.logger, name, fn);
    }

    private onAfterAd(request: AdRequest): void {
        if (this.release(request)) {
            this.deliverAfterAd(request);
        } else if (request.awaitingAfter && !request.afterDone) {
            this.deliverAfterAd(request);
        } else {
            this.logger.warn(`afterAd dropped for ad ${request.id}: it was already released.`);
        }
    }

    private onNoFill(request: AdRequest): void {
        if (request.outcome !== null) {
            this.deliverOutcome(request, "noFill", "noFill"); // logs the drop
            return;
        }
        if (this.release(request)) {
            this.endWithNoFill(request);
        } else {
            this.logger.warn(`noFill dropped for ad ${request.id}: it was already released.`);
        }
    }

    /**
     * The request is released (so the game may retry from inside noFill). The
     * SDK's own afterAd normally follows; if none arrives by the next frame it is
     * delivered here.
     */
    private endWithNoFill(request: AdRequest): void {
        request.awaitingAfter = true;
        this.awaiting = request;
        this.deliverOutcome(request, "noFill", "noFill");
        if (request.afterDone || request.cancelAfterTimer !== null) {
            return;
        }
        request.cancelAfterTimer = onNextFrame(this.clock, () => {
            request.cancelAfterTimer = null;
            if (!request.afterDone) {
                this.deliverAfterAd(request);
            }
        });
    }

    private deliverAfterAd(request: AdRequest): void {
        if (request.afterDone) {
            this.logger.warn(`afterAd dropped for ad ${request.id}: it was already delivered.`);
            return;
        }
        request.afterDone = true;
        if (this.awaiting === request) {
            this.awaiting = null;
        }
        request.cancelAfterTimer?.();
        request.cancelAfterTimer = null;
        if (request.kind === "rewarded" && request.outcome === null) {
            // Only reachable on the wrapper's own paths (watchdog). Never invent adViewed.
            this.logger.warn(`rewarded ad ${request.id} ended with no outcome, reporting adDismissed.`);
            this.deliverOutcome(request, "dismissed", "adDismissed");
        }
        safeCall(this.logger, "afterAd", request.callbacks.afterAd);
        request.resolve(request.outcome ?? "shown");
    }

    /** A new show* while an earlier ad still awaits its post-noFill afterAd: deliver that afterAd first. */
    private settleAwaiting(): void {
        const request = this.awaiting;
        this.awaiting = null;
        if (request === null || request.afterDone) {
            return;
        }
        this.logger.info(`a new ad was requested while ad ${request.id} awaited afterAd; delivering that afterAd first.`);
        this.deliverAfterAd(request);
    }
}

/** The page-wide ad runtime. All engine helpers share it, so there is one latch per page. */
export const ads: AdRuntime = new AdRuntime();
