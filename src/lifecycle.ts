/**
 * Pause/mute around ads and platform lifecycle events, for any engine.
 *
 * The game is paused while an ad is on screen (`beforeAd` -> `afterAd`) and while
 * the platform says so (the SDK's `pause` -> `resume` events). Each source is
 * tracked separately, so an ad ending during a platform pause does not resume
 * the game early. Audio is muted for the same reasons, plus the platform mute
 * switch (`audioEnabledChange`). After every ad the engine's AudioContext is
 * resumed: browsers often leave it suspended after a fullscreen ad.
 *
 * Only the SDK's own events are used. This does not add a visibilitychange
 * fallback, audio suspension or gameplay signalling; the SDK does those.
 */

import type { AdCallbacks, Yes2SDK } from "../types/yes2sdk";
import { ads as defaultAds, type AdOutcome, type AdRuntime } from "./ads";
import { consoleLogger, describeError, getSdk, safeCall, type RuntimeLogger } from "./sdk";

/** What the controller drives. Every member is optional. */
export interface LifecycleTarget {
    /** Stop the game loop / simulation. */
    pause?(): void;
    /** Restart it. */
    resume?(): void;
    /** Mute or unmute all game audio. */
    setMuted?(muted: boolean): void;
    /** AudioContexts to `resume()` after every ad. */
    audioContexts?(): ReadonlyArray<BaseAudioContext | null | undefined>;
}

export interface GameLifecycleOptions {
    /** Ad runtime to use. Default: the shared page-wide one. */
    ads?: AdRuntime;
    /** Where the SDK comes from. Default: `window.Yes2SDK` at call time. */
    getSdk?: () => Yes2SDK | undefined;
    logger?: RuntimeLogger;
}

type PauseReason = "ad" | "platform";
type MuteReason = "ad" | "platform-pause" | "platform-audio";

export class GameLifecycle {
    private readonly target: LifecycleTarget;
    private readonly adRuntime: AdRuntime;
    private readonly sdkSource: () => Yes2SDK | undefined;
    private readonly logger: RuntimeLogger;
    private readonly pauseReasons = new Set<PauseReason>();
    private readonly muteReasons = new Set<MuteReason>();
    private subscriptions: Array<{ unsubscribe: () => void }> = [];

    constructor(target: LifecycleTarget, options: GameLifecycleOptions = {}) {
        this.target = target;
        this.adRuntime = options.ads ?? defaultAds;
        this.sdkSource = options.getSdk ?? getSdk;
        this.logger = options.logger ?? consoleLogger;
    }

    /** Whether the game is currently paused by an ad or the platform. */
    get paused(): boolean {
        return this.pauseReasons.size > 0;
    }

    /** Whether audio is currently muted by an ad, a platform pause or the platform mute switch. */
    get muted(): boolean {
        return this.muteReasons.size > 0;
    }

    /** The ad runtime this lifecycle uses (for `isAdShowing()` and support checks). */
    get ads(): AdRuntime {
        return this.adRuntime;
    }

    /**
     * Subscribe to the SDK's `pause`, `resume` and `audioEnabledChange` events and
     * apply the platform's current mute state. Call after `initializeAsync`.
     */
    attach(): this {
        this.detach();
        const sdk = this.sdkSource();
        try {
            if (sdk !== undefined && typeof sdk.session?.isAudioEnabled === "function") {
                this.setMute("platform-audio", !sdk.session.isAudioEnabled());
            }
        } catch (error) {
            this.logger.warn("session.isAudioEnabled() failed:", describeError(error));
        }
        if (sdk === undefined || typeof sdk.on !== "function") {
            this.logger.warn("Yes2SDK.on is not available; platform pause/resume/mute events are not tracked.");
            return this;
        }
        this.subscriptions = [
            sdk.on("pause", () => {
                this.setPause("platform", true);
                this.setMute("platform-pause", true);
            }),
            sdk.on("resume", () => {
                this.setPause("platform", false);
                this.setMute("platform-pause", false);
            }),
            sdk.on("audioEnabledChange", ({ enabled }) => this.setMute("platform-audio", !enabled)),
        ];
        return this;
    }

    /** Drop the SDK subscriptions. */
    detach(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
        this.subscriptions = [];
    }

    /** Your callbacks, wrapped so the game pauses/mutes for the ad's duration. Yours run after the lifecycle's. */
    adCallbacks(extra: AdCallbacks = {}): AdCallbacks {
        return {
            ...extra,
            beforeAd: (): void => {
                this.setPause("ad", true);
                this.setMute("ad", true);
                safeCall(this.logger, "beforeAd", extra.beforeAd);
            },
            afterAd: (): void => {
                this.endAd();
                safeCall(this.logger, "afterAd", extra.afterAd);
            },
        };
    }

    /** Show an interstitial through the ad runtime with pause/mute/audio handling. Never rejects. */
    showInterstitial(placement: string, extra: AdCallbacks = {}): Promise<AdOutcome> {
        return this.adRuntime.showInterstitial(placement, this.adCallbacks(extra)).finally(() => this.resumeAudio());
    }

    /** Show a rewarded ad. Resolves `"viewed"` only when the reward should be granted. Never rejects. */
    showRewarded(placement: string, extra: AdCallbacks = {}): Promise<AdOutcome> {
        return this.adRuntime.showRewarded(placement, this.adCallbacks(extra)).finally(() => this.resumeAudio());
    }

    /** Resume every suspended AudioContext of the target. Safe to call any time. */
    resumeAudio(): void {
        let contexts: ReadonlyArray<BaseAudioContext | null | undefined> = [];
        try {
            contexts = this.target.audioContexts?.() ?? [];
        } catch (error) {
            this.logger.warn("reading the AudioContext failed:", describeError(error));
        }
        for (const context of contexts) {
            const resumable = context as (BaseAudioContext & { resume?: () => Promise<void> }) | null | undefined;
            if (resumable?.state === "suspended" && typeof resumable.resume === "function") {
                resumable.resume().catch((error: unknown) => {
                    this.logger.warn("AudioContext.resume() failed:", describeError(error));
                });
            }
        }
    }

    private endAd(): void {
        this.setPause("ad", false);
        this.setMute("ad", false);
        this.resumeAudio();
    }

    private setPause(reason: PauseReason, on: boolean): void {
        const was = this.paused;
        if (on) {
            this.pauseReasons.add(reason);
        } else {
            this.pauseReasons.delete(reason);
        }
        if (this.paused === was) {
            return;
        }
        safeCall(this.logger, this.paused ? "pause" : "resume", this.paused ? this.target.pause?.bind(this.target) : this.target.resume?.bind(this.target));
    }

    private setMute(reason: MuteReason, on: boolean): void {
        const was = this.muted;
        if (on) {
            this.muteReasons.add(reason);
        } else {
            this.muteReasons.delete(reason);
        }
        if (this.muted === was || this.target.setMuted === undefined) {
            return;
        }
        const muted = this.muted;
        safeCall(this.logger, "setMuted", () => this.target.setMuted?.(muted));
    }
}

export interface VanillaLifecycleOptions extends GameLifecycleOptions {
    onPause?: () => void;
    onResume?: () => void;
    onMuteChange?: (muted: boolean) => void;
    /** Your AudioContext(s), resumed after every ad. */
    audioContext?: BaseAudioContext | (() => BaseAudioContext | null | undefined);
}

/** Generic hooks for engines without a dedicated helper (canvas, DOM, custom loops). */
export function createGameLifecycle(options: VanillaLifecycleOptions = {}): GameLifecycle {
    const { onPause, onResume, onMuteChange, audioContext, ...rest } = options;
    const target: LifecycleTarget = {
        pause: onPause,
        resume: onResume,
        setMuted: onMuteChange,
        audioContexts: (): ReadonlyArray<BaseAudioContext | null | undefined> => [
            typeof audioContext === "function" ? audioContext() : audioContext,
        ],
    };
    return new GameLifecycle(target, rest);
}
