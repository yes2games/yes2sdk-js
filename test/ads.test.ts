import { describe, expect, it, vi } from "vitest";
import type { AdCallbacks, Yes2SDK } from "../types/yes2sdk";
import { AdRuntime, ManualFrameClock, type RuntimeLogger } from "../src/index";

/** One ad call the fake SDK received; the test drives its callbacks by hand. */
interface FakeCall {
    kind: "interstitial" | "rewarded";
    placement: string;
    cb: AdCallbacks;
    resolve: () => void;
    reject: (error: unknown) => void;
}

function setup(options: { sdk?: "present" | "missing"; adsOverrides?: Record<string, unknown> } = {}) {
    const calls: FakeCall[] = [];
    const showFor =
        (kind: FakeCall["kind"]) =>
        (placement: string, cb: AdCallbacks = {}): Promise<void> =>
            new Promise<void>((resolve, reject) => calls.push({ kind, placement, cb, resolve, reject }));
    const fakeAds = {
        showInterstitial: showFor("interstitial"),
        showRewarded: showFor("rewarded"),
        isInterstitialSupported: (): boolean => true,
        isRewardedSupported: (): boolean => true,
        isBannerSupported: (): boolean => false,
        isRewardedAdAvailable: (): boolean => true,
        isAdBlocked: (): boolean => false,
        ...options.adsOverrides,
    };
    const sdk = { ads: fakeAds } as unknown as Yes2SDK;
    const clock = new ManualFrameClock();
    const logger: RuntimeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = new AdRuntime({ getSdk: () => (options.sdk === "missing" ? undefined : sdk), clock, logger });
    const events: string[] = [];
    const record = (tag: string): AdCallbacks => ({
        beforeAd: () => events.push(`${tag}:beforeAd`),
        afterAd: () => events.push(`${tag}:afterAd`),
        noFill: () => events.push(`${tag}:noFill`),
        adViewed: () => events.push(`${tag}:adViewed`),
        adDismissed: () => events.push(`${tag}:adDismissed`),
    });
    return { calls, clock, logger, runtime, events, record };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("normal path", () => {
    it("passes beforeAd -> adViewed -> afterAd through and resolves the outcome", async () => {
        const { calls, runtime, events, record } = setup();
        const done = runtime.showRewarded("p", record("a"));
        expect(runtime.isAdShowing()).toBe(true);
        const call = calls[0]!;
        call.cb.beforeAd?.();
        call.cb.adViewed?.();
        call.cb.afterAd?.();
        call.resolve();
        await expect(done).resolves.toBe("viewed");
        expect(events).toEqual(["a:beforeAd", "a:adViewed", "a:afterAd"]);
        expect(runtime.isAdShowing()).toBe(false);
    });

    it("interstitial resolves 'shown'", async () => {
        const { calls, runtime } = setup();
        const done = runtime.showInterstitial("p");
        calls[0]!.cb.beforeAd?.();
        calls[0]!.cb.afterAd?.();
        await expect(done).resolves.toBe("shown");
    });

    it("SDK no-fill: noFill then afterAd, once each", async () => {
        const { calls, runtime, events, record, clock } = setup();
        const done = runtime.showInterstitial("p", record("a"));
        calls[0]!.cb.noFill?.();
        expect(runtime.isAdShowing()).toBe(false); // released at noFill
        calls[0]!.cb.afterAd?.();
        calls[0]!.cb.afterAd?.(); // duplicate dropped
        clock.tick();
        await expect(done).resolves.toBe("noFill");
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
    });

    it("synthesizes afterAd on the next frame when the SDK sends only noFill", () => {
        const { calls, runtime, events, record, clock } = setup();
        void runtime.showInterstitial("p", record("a"));
        calls[0]!.cb.noFill?.();
        expect(events).toEqual(["a:noFill"]);
        clock.tick();
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
    });
});

describe("in-flight latch", () => {
    it("a concurrent call gets noFill only, never afterAd, and never resumes the first ad", async () => {
        const { calls, runtime, events, record } = setup();
        const first = runtime.showInterstitial("first", record("a"));
        calls[0]!.cb.beforeAd?.();
        const second = runtime.showRewarded("second", record("b"));
        await expect(second).resolves.toBe("noFill");
        expect(events).toEqual(["a:beforeAd", "b:noFill"]);
        expect(calls).toHaveLength(1); // the SDK never saw the second call
        expect(runtime.isAdShowing()).toBe(true);
        calls[0]!.cb.afterAd?.();
        await expect(first).resolves.toBe("shown");
        expect(events).toEqual(["a:beforeAd", "b:noFill", "a:afterAd"]);
    });

    it("releases the latch before the game's afterAd runs, so it can chain another ad", () => {
        const { calls, runtime, events, record } = setup();
        let showingInside: boolean | undefined;
        void runtime.showInterstitial("a", {
            ...record("a"),
            afterAd: () => {
                showingInside = runtime.isAdShowing();
                events.push("a:afterAd");
                void runtime.showInterstitial("b", record("b"));
            },
        });
        calls[0]!.cb.beforeAd?.();
        calls[0]!.cb.afterAd?.();
        expect(showingInside).toBe(false);
        expect(calls).toHaveLength(2);
        expect(runtime.isAdShowing()).toBe(true);
    });
});

describe("watchdog", () => {
    it("start phase: no beforeAd within 30s of frame time -> release, noFill, afterAd", async () => {
        const { runtime, events, record, clock, logger } = setup();
        const done = runtime.showInterstitial("p", record("a"));
        clock.advance(29.9);
        expect(runtime.isAdShowing()).toBe(true);
        clock.advance(0.2);
        expect(runtime.isAdShowing()).toBe(false);
        expect(events).toEqual(["a:noFill"]);
        clock.tick();
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
        await expect(done).resolves.toBe("noFill");
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("watchdog"));
    });

    it("caps each frame at 0.5s, so a long hidden-tab frame cannot trip it", () => {
        const { runtime, clock } = setup();
        void runtime.showInterstitial("p");
        clock.tick(10_000); // tab hidden for ~3 hours
        expect(runtime.isAdShowing()).toBe(true);
        for (let i = 0; i < 58; i++) {
            clock.tick(10_000);
        }
        expect(runtime.isAdShowing()).toBe(true); // 59 frames * 0.5 = 29.5 s
        clock.tick(10_000);
        expect(runtime.isAdShowing()).toBe(false); // 30 s
    });

    it("playing phase: 180s after beforeAd -> afterAd only (no noFill)", () => {
        const { calls, runtime, events, record, clock } = setup();
        void runtime.showInterstitial("p", record("a"));
        clock.advance(20);
        calls[0]!.cb.beforeAd?.();
        clock.advance(179); // the phase timer restarted at beforeAd
        expect(runtime.isAdShowing()).toBe(true);
        clock.advance(1.1);
        expect(events).toEqual(["a:beforeAd", "a:afterAd"]);
        expect(runtime.isAdShowing()).toBe(false);
    });

    it("rewarded that times out while playing gets adDismissed then afterAd (never adViewed)", async () => {
        const { calls, runtime, events, record, clock } = setup();
        const done = runtime.showRewarded("p", record("a"));
        calls[0]!.cb.beforeAd?.();
        clock.advance(181);
        expect(events).toEqual(["a:beforeAd", "a:adDismissed", "a:afterAd"]);
        await expect(done).resolves.toBe("dismissed");
    });

    it("stops counting once the ad is released", () => {
        const { calls, runtime, clock } = setup();
        void runtime.showInterstitial("p");
        calls[0]!.cb.beforeAd?.();
        calls[0]!.cb.afterAd?.();
        expect(clock.pending).toBe(0);
    });
});

describe("request ids and stale callbacks", () => {
    it("drops late callbacks of a released ad, without touching the newer ad", () => {
        const { calls, runtime, events, record, clock } = setup();
        void runtime.showRewarded("old", record("a"));
        clock.advance(31); // watchdog: noFill
        clock.tick(); // + afterAd
        void runtime.showRewarded("new", record("b"));
        expect(runtime.isAdShowing()).toBe(true);
        // The platform finally answers for the OLD request:
        calls[0]!.cb.beforeAd?.();
        calls[0]!.cb.adViewed?.();
        calls[0]!.cb.afterAd?.();
        calls[0]!.cb.noFill?.();
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
        expect(runtime.isAdShowing()).toBe(true); // the new ad still owns the latch
        calls[1]!.cb.beforeAd?.();
        calls[1]!.cb.adViewed?.();
        calls[1]!.cb.afterAd?.();
        expect(events).toEqual(["a:noFill", "a:afterAd", "b:beforeAd", "b:adViewed", "b:afterAd"]);
    });

    it("only the first outcome counts", () => {
        const { calls, runtime, events, record } = setup();
        void runtime.showRewarded("p", record("a"));
        calls[0]!.cb.beforeAd?.();
        calls[0]!.cb.adDismissed?.();
        calls[0]!.cb.adViewed?.();
        calls[0]!.cb.afterAd?.();
        expect(events).toEqual(["a:beforeAd", "a:adDismissed", "a:afterAd"]);
    });
});

describe("retry from inside noFill", () => {
    it("delivers the first ad's afterAd before the retry starts, and only once", () => {
        const { calls, runtime, events, record } = setup();
        void runtime.showInterstitial("first", {
            ...record("a"),
            noFill: () => {
                events.push("a:noFill");
                void runtime.showInterstitial("retry", record("b"));
            },
        });
        calls[0]!.cb.noFill?.();
        // The retry reached the SDK, after the first ad's afterAd:
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
        expect(calls).toHaveLength(2);
        // The SDK's own afterAd for the first ad arrives late: dropped.
        calls[0]!.cb.afterAd?.();
        calls[1]!.cb.beforeAd?.();
        calls[1]!.cb.afterAd?.();
        expect(events).toEqual(["a:noFill", "a:afterAd", "b:beforeAd", "b:afterAd"]);
    });
});

describe("SDK failures", () => {
    it("a rejection with no callbacks (e.g. before init) gives noFill then afterAd on the next frame", async () => {
        const { calls, runtime, events, record, clock } = setup();
        const done = runtime.showInterstitial("p", record("a"));
        calls[0]!.reject({ code: "NOT_INITIALIZED", message: "x", context: "ads" });
        await flush();
        expect(runtime.isAdShowing()).toBe(true); // latch held until the next frame
        await expect(runtime.showInterstitial("same-frame", record("b"))).resolves.toBe("noFill");
        clock.tick();
        expect(events).toEqual(["b:noFill", "a:noFill"]);
        clock.tick();
        expect(events).toEqual(["b:noFill", "a:noFill", "a:afterAd"]);
        await expect(done).resolves.toBe("noFill");
    });

    it("afterAd with no beforeAd and no outcome (Core's blocked interstitial) is a noFill: noFill then afterAd", async () => {
        const { calls, runtime, events, record } = setup();
        const interstitial = runtime.showInterstitial("p", record("i"));
        calls[0]!.cb.afterAd?.(); // Core's guard settles a failed interstitial with afterAd alone
        calls[0]!.reject({ code: "ADS_BLOCKED", message: "blocked" });
        await expect(interstitial).resolves.toBe("noFill");
        const rewarded = runtime.showRewarded("p", record("r"));
        calls[1]!.cb.afterAd?.();
        await expect(rewarded).resolves.toBe("noFill");
        expect(events).toEqual(["i:noFill", "i:afterAd", "r:noFill", "r:afterAd"]);
    });

    it("a retry from inside that noFill still gets the first ad's afterAd before it starts", () => {
        const { calls, runtime, events, record } = setup();
        void runtime.showInterstitial("p", {
            ...record("a"),
            noFill: () => {
                events.push("a:noFill");
                void runtime.showInterstitial("retry", record("b"));
            },
        });
        calls[0]!.cb.afterAd?.();
        calls[1]!.cb.beforeAd?.();
        expect(events).toEqual(["a:noFill", "a:afterAd", "b:beforeAd"]);
    });

    it("a rejection after the SDK already settled (blocked / error) adds nothing", async () => {
        const { calls, runtime, events, record, clock } = setup();
        const done = runtime.showInterstitial("p", record("a"));
        calls[0]!.cb.noFill?.();
        calls[0]!.cb.afterAd?.();
        calls[0]!.reject({ code: "ADS_BLOCKED", message: "blocked", context: "ads" });
        await flush();
        clock.advance(2);
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
        await expect(done).resolves.toBe("noFill");
    });

    it("no window.Yes2SDK: noFill then afterAd, never a throw", async () => {
        const { runtime, events, record, clock } = setup({ sdk: "missing" });
        const done = runtime.showRewarded("p", record("a"));
        clock.tick();
        clock.tick();
        await expect(done).resolves.toBe("noFill");
        expect(events).toEqual(["a:noFill", "a:afterAd"]);
    });
});

describe("game callbacks are isolated", () => {
    it("a throwing callback is logged with [Yes2SDK] and its stack; the next callback still runs", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const clock = new ManualFrameClock();
        const calls: AdCallbacks[] = [];
        const sdk = {
            ads: {
                showRewarded: (_p: string, cb: AdCallbacks): Promise<void> => {
                    calls.push(cb);
                    return new Promise(() => undefined);
                },
            },
        } as unknown as Yes2SDK;
        const runtime = new AdRuntime({ getSdk: () => sdk, clock }); // default console logger
        const after = vi.fn();
        void runtime.showRewarded("p", {
            adViewed: () => {
                throw new Error("boom");
            },
            afterAd: after,
        });
        calls[0]!.beforeAd?.();
        calls[0]!.adViewed?.();
        calls[0]!.afterAd?.();
        expect(after).toHaveBeenCalledTimes(1);
        const [message, detail] = errorSpy.mock.calls[0] ?? [];
        expect(String(message)).toMatch(/^\[Yes2SDK\] adViewed callback threw/);
        expect(String(detail)).toContain("Error: boom");
        expect(String(detail)).toContain("ads.test.ts"); // stack
    });
});

describe("support checks", () => {
    it("return false, never throw, for a missing SDK, a missing method or a throwing one", () => {
        expect(setup({ sdk: "missing" }).runtime.isRewardedAdAvailable()).toBe(false);
        const old = setup({ adsOverrides: { isRewardedAdAvailable: undefined, isAdBlocked: undefined } }).runtime;
        expect(old.isRewardedAdAvailable()).toBe(false);
        expect(old.isAdBlocked()).toBe(false);
        expect(old.isInterstitialSupported()).toBe(true);
        const throwing = setup({
            adsOverrides: {
                isRewardedSupported: () => {
                    throw new Error("x");
                },
            },
        }).runtime;
        expect(throwing.isRewardedSupported()).toBe(false);
    });
});
