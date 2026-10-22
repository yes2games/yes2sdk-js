import { describe, expect, it, vi } from "vitest";
import type { AdCallbacks, SDKEvents, Yes2SDK } from "../types/yes2sdk";
import {
    AdRuntime,
    createGameLifecycle,
    createLoadingProgressReporter,
    hasMethod,
    installInputGuards,
    installSdkRejectionHandler,
    isModuleSupported,
    isSdkError,
    ManualFrameClock,
    type RuntimeLogger,
} from "../src/index";
import { createPhaserLifecycle } from "../src/phaser";
import { createThreeLifecycle } from "../src/three";

type Listener = (data: unknown) => void;

/** Fake SDK with controllable ads and events. */
function fakeSdk(audioEnabled = true) {
    const listeners = new Map<string, Set<Listener>>();
    const adCalls: Array<{ cb: AdCallbacks; resolve: () => void }> = [];
    const show = (_placement: string, cb: AdCallbacks = {}): Promise<void> =>
        new Promise<void>((resolve) => adCalls.push({ cb, resolve }));
    const sdk = {
        ads: { showInterstitial: show, showRewarded: show },
        session: { isAudioEnabled: (): boolean => audioEnabled },
        on<K extends keyof SDKEvents>(event: K, listener: (data: SDKEvents[K]) => void): { unsubscribe: () => void } {
            let set = listeners.get(event);
            if (set === undefined) {
                set = new Set();
                listeners.set(event, set);
            }
            set.add(listener as Listener);
            return { unsubscribe: (): void => void set.delete(listener as Listener) };
        },
        setLoadingProgress: vi.fn(),
    };
    const emit = (event: keyof SDKEvents, data?: unknown): void => listeners.get(event)?.forEach((l) => l(data));
    return { sdk: sdk as unknown as Yes2SDK & { setLoadingProgress: ReturnType<typeof vi.fn> }, emit, adCalls, listeners };
}

const quiet: RuntimeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function fakeAudioContext(state: AudioContextState = "suspended") {
    const ctx = { state, resume: vi.fn(() => Promise.resolve()) };
    return ctx as unknown as BaseAudioContext & { resume: ReturnType<typeof vi.fn> };
}

describe("GameLifecycle (vanilla hooks)", () => {
    function make() {
        const f = fakeSdk();
        const ads = new AdRuntime({ getSdk: () => f.sdk, clock: new ManualFrameClock(), logger: quiet });
        const log: string[] = [];
        const audio = fakeAudioContext();
        const lifecycle = createGameLifecycle({
            ads,
            getSdk: () => f.sdk,
            logger: quiet,
            onPause: () => log.push("pause"),
            onResume: () => log.push("resume"),
            onMuteChange: (m) => log.push(m ? "mute" : "unmute"),
            audioContext: audio,
        }).attach();
        return { ...f, lifecycle, log, audio };
    }

    it("pauses + mutes on beforeAd, resumes + unmutes on afterAd, and resumes the AudioContext", async () => {
        const { lifecycle, adCalls, log, audio } = make();
        const done = lifecycle.showInterstitial("p");
        adCalls[0]!.cb.beforeAd?.();
        expect(log).toEqual(["pause", "mute"]);
        adCalls[0]!.cb.afterAd?.();
        expect(log).toEqual(["pause", "mute", "resume", "unmute"]);
        expect(audio.resume).toHaveBeenCalledTimes(1); // from afterAd
        await done;
        expect(audio.resume).toHaveBeenCalledTimes(2); // and again when the promise settles
    });

    it("follows the SDK pause/resume events", () => {
        const { emit, log } = make();
        emit("pause");
        emit("resume");
        expect(log).toEqual(["pause", "mute", "resume", "unmute"]);
    });

    it("an ad ending during a platform pause does not resume the game early", () => {
        const { lifecycle, adCalls, emit, log } = make();
        void lifecycle.showInterstitial("p");
        adCalls[0]!.cb.beforeAd?.();
        emit("pause");
        adCalls[0]!.cb.afterAd?.();
        expect(lifecycle.paused).toBe(true);
        expect(log).toEqual(["pause", "mute"]);
        emit("resume");
        expect(log).toEqual(["pause", "mute", "resume", "unmute"]);
    });

    it("tracks the platform mute switch and the initial audio state", () => {
        const f = fakeSdk(false);
        const muted: boolean[] = [];
        createGameLifecycle({ getSdk: () => f.sdk, logger: quiet, onMuteChange: (m) => muted.push(m) }).attach();
        expect(muted).toEqual([true]);
        f.emit("audioEnabledChange", { enabled: true });
        expect(muted).toEqual([true, false]);
    });

    it("detach() removes the subscriptions", () => {
        const { lifecycle, listeners } = make();
        lifecycle.detach();
        expect([...listeners.values()].every((s) => s.size === 0)).toBe(true);
    });

    it("works (no-ops) when the SDK has no on()", () => {
        expect(() => createGameLifecycle({ getSdk: () => undefined, logger: quiet }).attach()).not.toThrow();
    });
});

describe("Phaser helper", () => {
    it("uses game.pause/resume, sound.mute and sound.context", async () => {
        const f = fakeSdk();
        const context = fakeAudioContext();
        const game = { pause: vi.fn(), resume: vi.fn(), sound: { mute: false, context } };
        const ads = new AdRuntime({ getSdk: () => f.sdk, clock: new ManualFrameClock(), logger: quiet });
        const lifecycle = createPhaserLifecycle(game, { ads, getSdk: () => f.sdk, logger: quiet }).attach();
        const done = lifecycle.showRewarded("p");
        f.adCalls[0]!.cb.beforeAd?.();
        expect(game.pause).toHaveBeenCalledTimes(1);
        expect(game.sound.mute).toBe(true);
        f.adCalls[0]!.cb.adViewed?.();
        f.adCalls[0]!.cb.afterAd?.();
        expect(game.resume).toHaveBeenCalledTimes(1);
        expect(game.sound.mute).toBe(false);
        await expect(done).resolves.toBe("viewed");
        expect(context.resume).toHaveBeenCalledTimes(2);
    });

    it("restores a mute the player had set before the ad", () => {
        const f = fakeSdk();
        const game = { pause: vi.fn(), resume: vi.fn(), sound: { mute: true } };
        createPhaserLifecycle(game, { getSdk: () => f.sdk, logger: quiet }).attach();
        f.emit("pause");
        f.emit("resume");
        expect(game.sound.mute).toBe(true);
    });
});

describe("three helper", () => {
    it("exposes a pause flag, mutes the listener and resumes its context", async () => {
        const f = fakeSdk();
        const context = fakeAudioContext();
        let volume = 0.8;
        const listener = { context, getMasterVolume: () => volume, setMasterVolume: (v: number) => (volume = v) };
        const changes: boolean[] = [];
        const ads = new AdRuntime({ getSdk: () => f.sdk, clock: new ManualFrameClock(), logger: quiet });
        const lifecycle = createThreeLifecycle({
            ads,
            getSdk: () => f.sdk,
            logger: quiet,
            listener,
            onPauseChange: (p) => changes.push(p),
        }).attach();
        const done = lifecycle.showInterstitial("p");
        f.adCalls[0]!.cb.beforeAd?.();
        expect(lifecycle.paused).toBe(true);
        expect(volume).toBe(0);
        f.adCalls[0]!.cb.afterAd?.();
        expect(lifecycle.paused).toBe(false);
        expect(volume).toBe(0.8);
        expect(changes).toEqual([true, false]);
        await done;
        expect(context.resume).toHaveBeenCalled();
    });
});

describe("loading progress", () => {
    it("forwards only integer changes", () => {
        const f = fakeSdk();
        const report = createLoadingProgressReporter(() => f.sdk, quiet);
        for (const v of [0, 0.001, 0.004, 0.011, 0.5, 0.501, 0.999, 1]) {
            report.fraction(v);
        }
        expect(f.sdk.setLoadingProgress.mock.calls.map((c) => c[0])).toEqual([0, 1, 50, 99, 100]);
        report.percent(100);
        report.percent(Number.NaN);
        expect(f.sdk.setLoadingProgress).toHaveBeenCalledTimes(5);
        expect(report.last).toBe(100);
    });

    it("never throws when the SDK is missing or rejects the value", () => {
        expect(() => createLoadingProgressReporter(() => undefined, quiet).percent(5)).not.toThrow();
        const throwing = {
            setLoadingProgress: () => {
                throw new Error("x");
            },
        } as unknown as Yes2SDK;
        expect(() => createLoadingProgressReporter(() => throwing, quiet).percent(5)).not.toThrow();
    });
});

describe("support helpers", () => {
    it("isModuleSupported / hasMethod are false for missing pieces", () => {
        const sdk = {
            leaderboard: { isSupported: () => true },
            stats: {},
            iap: {
                isSupported: () => {
                    throw new Error("x");
                },
            },
        } as unknown as Yes2SDK;
        expect(isModuleSupported("leaderboard", sdk)).toBe(true);
        expect(isModuleSupported("stats", sdk)).toBe(false);
        expect(isModuleSupported("iap", sdk)).toBe(false);
        expect(isModuleSupported("referrals", sdk)).toBe(false);
        expect(isModuleSupported("leaderboard", undefined)).toBe(false);
        expect(hasMethod("leaderboard", "isSupported", sdk)).toBe(true);
        expect(hasMethod("leaderboard", "setScoreAsync", sdk)).toBe(false);
    });
});

describe("unhandled SDK rejections (opt-in)", () => {
    it("recognises SDK-shaped errors only", () => {
        expect(isSdkError({ code: "X", message: "m" })).toBe(true);
        expect(isSdkError(Object.assign(new Error("m"), { code: "X" }))).toBe(false);
        expect(isSdkError("x")).toBe(false);
    });

    it("quietens SDK rejections and leaves others alone", () => {
        const logger: RuntimeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const remove = installSdkRejectionHandler(logger);
        const sdkEvent = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
        Object.defineProperty(sdkEvent, "reason", { value: { code: "ADS_BLOCKED", message: "blocked" } });
        window.dispatchEvent(sdkEvent);
        expect(sdkEvent.defaultPrevented).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ADS_BLOCKED"));
        const other = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
        Object.defineProperty(other, "reason", { value: new Error("real bug") });
        window.dispatchEvent(other);
        expect(other.defaultPrevented).toBe(false);
        remove();
        const after = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
        Object.defineProperty(after, "reason", { value: { code: "X", message: "m" } });
        window.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });
});

describe("input guards", () => {
    it("prevents page scrolling keys and focuses the canvas", () => {
        const canvas = document.createElement("canvas");
        document.body.appendChild(canvas);
        const remove = installInputGuards(canvas);
        expect(document.activeElement).toBe(canvas);
        const space = new KeyboardEvent("keydown", { key: " ", cancelable: true });
        window.dispatchEvent(space);
        expect(space.defaultPrevented).toBe(true);
        const letter = new KeyboardEvent("keydown", { key: "a", cancelable: true });
        window.dispatchEvent(letter);
        expect(letter.defaultPrevented).toBe(false);
        remove();
        const later = new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true });
        window.dispatchEvent(later);
        expect(later.defaultPrevented).toBe(false);
        canvas.remove();
    });
});
