import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdCallbacks, ErrorMessage, Yes2SDK } from "../../types/yes2sdk";
import {
    createYes2SDKMock,
    DEFAULT_SETTINGS,
    MemoryStorage,
    MOCK_PRODUCTS,
    parseQuery,
    SETTINGS_KEY,
    type Yes2SDKMock,
    type Yes2SDKMockOptions,
} from "../src/index";

function makeMock(options: Yes2SDKMockOptions = {}): Yes2SDKMock {
    return createYes2SDKMock({ silent: true, overlay: false, storage: new MemoryStorage(), query: "", ...options });
}

async function expectCode(promise: Promise<unknown>, code: ErrorMessage["code"]): Promise<void> {
    await expect(promise).rejects.toMatchObject({ code });
}

function recorder(): { events: string[]; cb: AdCallbacks } {
    const events: string[] = [];
    return {
        events,
        cb: {
            beforeAd: () => events.push("beforeAd"),
            adViewed: () => events.push("adViewed"),
            adDismissed: () => events.push("adDismissed"),
            noFill: () => events.push("noFill"),
            afterAd: () => events.push("afterAd"),
        },
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
});

describe("core", () => {
    it("is assignable to the public Yes2SDK interface and reports the debug platform", () => {
        const sdk: Yes2SDK = makeMock();
        expect(sdk.getPlatform()).toBe("debug");
        expect(sdk.version).toMatch(/-mock$/);
    });

    it("init and startGame resolve on the next frame", async () => {
        const sdk = makeMock();
        const onInit = vi.fn();
        sdk.on("initialized", onInit);
        let resolved = false;
        void sdk.initializeAsync().then(() => (resolved = true));
        await Promise.resolve();
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(20);
        expect(resolved).toBe(true);
        expect(onInit).toHaveBeenCalledWith({ platform: "debug" });
        const started = vi.fn();
        sdk.on("gameStarted", started);
        const start = sdk.startGameAsync();
        await vi.advanceTimersByTimeAsync(20);
        await start;
        expect(started).toHaveBeenCalledTimes(1);
    });

    it("startGameAsync rejects with NOT_INITIALIZED before init", async () => {
        await expectCode(makeMock().startGameAsync(), "NOT_INITIALIZED");
    });

    it("setLoadingProgress throws INVALID_PARAM outside 0-100", () => {
        expect(() => makeMock().setLoadingProgress(101)).toThrow(expect.objectContaining({ code: "INVALID_PARAM" }));
    });
});

describe("session defaults", () => {
    it("en / desktop / landscape / audio on / direct / {}", async () => {
        const s = makeMock().session;
        expect(s.getLocale()).toBe("en");
        expect(s.getDevice()).toBe("desktop");
        expect(s.getOrientation()).toBe("landscape");
        expect(s.isAudioEnabled()).toBe(true);
        await expect(s.getEntryPointAsync()).resolves.toBe("direct");
        expect(s.getEntryPointData()).toEqual({});
        expect(s.getPlatform()).toBe("debug");
    });

    it("entry point data comes from settings", () => {
        expect(makeMock({ entryPointData: { room: "42" } }).session.getEntryPointData()).toEqual({ room: "42" });
    });
});

describe("ads", () => {
    it("interstitial: beforeAd, 3 s, afterAd", async () => {
        const sdk = makeMock();
        const { events, cb } = recorder();
        const done = sdk.ads.showInterstitial("p", cb);
        expect(events).toEqual(["beforeAd"]);
        await vi.advanceTimersByTimeAsync(2999);
        expect(events).toEqual(["beforeAd"]);
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(events).toEqual(["beforeAd", "afterAd"]);
    });

    it("rewarded: beforeAd, 5 s, adViewed, afterAd", async () => {
        const sdk = makeMock();
        const { events, cb } = recorder();
        const done = sdk.ads.showRewarded("p", cb);
        await vi.advanceTimersByTimeAsync(4999);
        expect(events).toEqual(["beforeAd"]);
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(events).toEqual(["beforeAd", "adViewed", "afterAd"]);
    });

    it("rewarded outcome 'dismissed'", async () => {
        const sdk = makeMock({ rewardedOutcome: "dismissed" });
        const { events, cb } = recorder();
        const done = sdk.ads.showRewarded("p", cb);
        await vi.advanceTimersByTimeAsync(5000);
        await done;
        expect(events).toEqual(["beforeAd", "adDismissed", "afterAd"]);
    });

    it("nofill: noFill then afterAd, no beforeAd, resolves", async () => {
        const sdk = makeMock({ adResult: "nofill" });
        const { events, cb } = recorder();
        const done = sdk.ads.showRewarded("p", cb);
        await vi.advanceTimersByTimeAsync(20);
        await done;
        expect(events).toEqual(["noFill", "afterAd"]);
    });

    it("adblocked: noFill then afterAd, rejects ADS_BLOCKED, isAdBlocked() true", async () => {
        const sdk = makeMock({ adResult: "adblocked" });
        expect(sdk.ads.isAdBlocked()).toBe(true);
        const { events, cb } = recorder();
        const done = sdk.ads.showInterstitial("p", cb);
        const check = expectCode(done, "ADS_BLOCKED");
        await vi.advanceTimersByTimeAsync(20);
        await check;
        expect(events).toEqual(["noFill", "afterAd"]);
    });

    it("error: noFill then afterAd, rejects PLATFORM_ERROR", async () => {
        const sdk = makeMock({ adResult: "error" });
        expect(sdk.ads.isAdBlocked()).toBe(false);
        const { events, cb } = recorder();
        const check = expectCode(sdk.ads.showInterstitial("p", cb), "PLATFORM_ERROR");
        await vi.advanceTimersByTimeAsync(20);
        await check;
        expect(events).toEqual(["noFill", "afterAd"]);
    });

    it("support checks are true", () => {
        const ads = makeMock().ads;
        expect(ads.isRewardedAdAvailable()).toBe(true);
        expect(ads.isInterstitialSupported()).toBe(true);
        expect(ads.isRewardedSupported()).toBe(true);
    });

    it("configure() changes the result at runtime", async () => {
        const sdk = makeMock();
        sdk.mock.configure({ adResult: "nofill" });
        const { events, cb } = recorder();
        const done = sdk.ads.showInterstitial("p", cb);
        await vi.advanceTimersByTimeAsync(20);
        await done;
        expect(events).toEqual(["noFill", "afterAd"]);
    });

    describe("overlay", () => {
        it("blocks input and offers Claim Reward / Skip for rewarded ads", async () => {
            const sdk = makeMock({ overlay: true });
            const { events, cb } = recorder();
            const done = sdk.ads.showRewarded("p", cb);
            const overlay = document.querySelector<HTMLElement>("[data-yes2sdk-mock-ad]");
            expect(overlay).not.toBeNull();
            const gameClick = vi.fn();
            document.body.addEventListener("pointerdown", gameClick);
            overlay?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            expect(gameClick).not.toHaveBeenCalled();
            const skip = [...document.querySelectorAll("button")].find((b) => b.textContent === "Skip");
            skip?.click();
            await done;
            expect(events).toEqual(["beforeAd", "adDismissed", "afterAd"]);
            expect(document.querySelector("[data-yes2sdk-mock-ad]")).toBeNull();
        });

        it("Claim Reward grants the reward", async () => {
            const sdk = makeMock({ overlay: true, rewardedOutcome: "dismissed" });
            const { events, cb } = recorder();
            const done = sdk.ads.showRewarded("p", cb);
            [...document.querySelectorAll("button")].find((b) => b.textContent === "Claim Reward")?.click();
            await done;
            expect(events).toEqual(["beforeAd", "adViewed", "afterAd"]);
        });

        it("interstitial Close ends it early", async () => {
            const sdk = makeMock({ overlay: true });
            const { events, cb } = recorder();
            const done = sdk.ads.showInterstitial("p", cb);
            [...document.querySelectorAll("button")].find((b) => b.textContent === "Close")?.click();
            await done;
            expect(events).toEqual(["beforeAd", "afterAd"]);
        });
    });
});

describe("IAP", () => {
    it("has the three mock products", async () => {
        const catalog = await makeMock().iap.getCatalogAsync();
        expect(catalog.map((p) => [p.productId, p.price])).toEqual([
            ["yes2.mock.coins.small", "$0.99"],
            ["yes2.mock.coins.large", "$4.99"],
            ["yes2.mock.noads", "$2.99"],
        ]);
        expect(MOCK_PRODUCTS).toHaveLength(3);
    });

    it("purchases last for the session and can be consumed", async () => {
        const sdk = makeMock();
        const buy = sdk.iap.purchaseAsync({ productId: "yes2.mock.noads" });
        await vi.advanceTimersByTimeAsync(20);
        const purchase = await buy;
        expect(purchase).toMatchObject({ productId: "yes2.mock.noads", isSandbox: true, priceAmount: 2.99 });
        await expect(sdk.iap.getPurchasesAsync()).resolves.toHaveLength(1);
        await sdk.iap.consumePurchaseAsync(purchase.purchaseToken);
        await expect(sdk.iap.getPurchasesAsync()).resolves.toHaveLength(0);
        await expect(makeMock().iap.getPurchasesAsync()).resolves.toHaveLength(0); // new session
    });

    it("a second purchase while one is open rejects (never dropped)", async () => {
        const sdk = makeMock();
        const first = sdk.iap.purchaseAsync({ productId: "yes2.mock.coins.small" });
        await expectCode(sdk.iap.purchaseAsync({ productId: "yes2.mock.coins.large" }), "INVALID_OPERATION");
        await vi.advanceTimersByTimeAsync(20);
        await expect(first).resolves.toMatchObject({ productId: "yes2.mock.coins.small" });
    });

    it("cancel and fail results", async () => {
        const cancel = makeMock({ iapResult: "cancel" }).iap.purchaseAsync({ productId: "yes2.mock.noads" });
        const cancelCheck = expectCode(cancel, "IAP_PURCHASE_CANCELLED");
        const fail = makeMock({ iapResult: "fail" }).iap.purchaseAsync({ productId: "yes2.mock.noads" });
        const failCheck = expectCode(fail, "IAP_PURCHASE_FAILED");
        await vi.advanceTimersByTimeAsync(20);
        await cancelCheck;
        await failCheck;
    });

    it("overlay: Buy / Cancel dialog", async () => {
        const sdk = makeMock({ overlay: true });
        const buy = sdk.iap.purchaseAsync({ productId: "yes2.mock.noads" });
        expect(document.querySelector("[data-yes2sdk-mock-iap]")).not.toBeNull();
        [...document.querySelectorAll("button")].find((b) => b.textContent === "Cancel")?.click();
        await expectCode(buy, "IAP_PURCHASE_CANCELLED");
    });

    it("unknown product rejects INVALID_PARAM", async () => {
        await expectCode(makeMock().iap.purchaseAsync({ productId: "nope" }), "INVALID_PARAM");
    });
});

describe("data", () => {
    it("stores under the yes2sdk_ prefix; confirmed writes resolve true", async () => {
        const storage = new MemoryStorage();
        const sdk = makeMock({ storage });
        sdk.data.setInt("coins", 41.9);
        expect(storage.getItem("yes2sdk_coins")).toBe("41");
        expect(sdk.data.getInt("coins")).toBe(41);
        await expect(sdk.data.setStringAsync("name", "hero")).resolves.toBe(true);
        expect(storage.getItem("yes2sdk_name")).toBe("hero");
        await expect(sdk.data.flushAsync()).resolves.toBe(true);
    });

    it("persists across instances; deleteAll keeps non-SDK keys", () => {
        const storage = new MemoryStorage();
        makeMock({ storage }).data.setString("level", "3");
        storage.setItem("game-owned", "keep");
        const sdk = makeMock({ storage });
        expect(sdk.data.getString("level")).toBe("3");
        sdk.data.deleteAll();
        expect(sdk.data.hasKey("level")).toBe(false);
        expect(storage.getItem("game-owned")).toBe("keep");
        expect(storage.getItem(SETTINGS_KEY)).not.toBeNull();
    });

    it("a failing write resolves false", async () => {
        const storage = new MemoryStorage();
        const sdk = makeMock({ storage });
        vi.spyOn(storage, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        await expect(sdk.data.setStringAsync("k", "v")).resolves.toBe(false);
    });
});

describe("unsupported modules", () => {
    it("leaderboard / stats / friends / auth sign-in reject FEATURE_NOT_SUPPORTED with isSupported() false", async () => {
        const sdk = makeMock();
        for (const supported of [
            sdk.leaderboard.isSupported(),
            sdk.stats.isSupported(),
            sdk.friends.isSupported(),
            sdk.auth.isSupported(),
        ]) {
            expect(supported).toBe(false);
        }
        await expectCode(sdk.leaderboard.setScoreAsync("main", 1), "FEATURE_NOT_SUPPORTED");
        await expectCode(sdk.stats.getStatsAsync(["a"]), "FEATURE_NOT_SUPPORTED");
        await expectCode(sdk.friends.listFriendsAsync(0, 10), "FEATURE_NOT_SUPPORTED");
        await expectCode(sdk.auth.signInAsync(), "FEATURE_NOT_SUPPORTED");
        expect(sdk.auth.getCurrentUser()).toBeNull();
    });
});

describe("manual triggers", () => {
    it("simulate() fires pause, resume, audioEnabledChange and exitRequested", () => {
        const sdk = makeMock();
        const seen: string[] = [];
        sdk.on("pause", () => seen.push("pause"));
        sdk.on("resume", () => seen.push("resume"));
        sdk.on("exitRequested", () => seen.push("exit"));
        sdk.on("audioEnabledChange", ({ enabled }) => seen.push(`audio:${String(enabled)}`));
        sdk.mock.simulate("pause");
        sdk.mock.simulate("resume");
        sdk.mock.simulate("audioEnabledChange"); // toggles
        expect(sdk.session.isAudioEnabled()).toBe(false);
        sdk.mock.simulate("audioEnabledChange", true);
        sdk.mock.simulate("exitRequested");
        expect(seen).toEqual(["pause", "resume", "audio:false", "audio:true", "exit"]);
    });
});

describe("settings", () => {
    it("parses ?yes2mock= shorthands and key:value pairs", () => {
        expect(parseQuery("?yes2mock=nofill,dismissed").settings).toEqual({ adResult: "nofill", rewardedOutcome: "dismissed" });
        expect(parseQuery("?yes2mock=iap:cancel,overlay:off,interstitial:1").settings).toEqual({
            iapResult: "cancel",
            overlay: false,
            interstitialSeconds: 1,
        });
        expect(parseQuery("?yes2mock=reset").reset).toBe(true);
        expect(parseQuery("?other=1").settings).toEqual({});
        expect(parseQuery("?yes2mock=bogus,ad:nonsense").settings).toEqual({});
    });

    it("query beats options beats saved; the result is kept in storage", () => {
        const storage = new MemoryStorage();
        storage.setItem(SETTINGS_KEY, JSON.stringify({ adResult: "error", rewardedOutcome: "dismissed" }));
        const sdk = createYes2SDKMock({ storage, silent: true, adResult: "nofill", query: "?yes2mock=adblocked" });
        expect(sdk.mock.settings.adResult).toBe("adblocked");
        expect(sdk.mock.settings.rewardedOutcome).toBe("dismissed");
        const next = createYes2SDKMock({ storage, silent: true, query: "" });
        expect(next.mock.settings.adResult).toBe("adblocked");
    });

    it("reset() and ?yes2mock=reset return to defaults", () => {
        const storage = new MemoryStorage();
        createYes2SDKMock({ storage, silent: true, adResult: "error", query: "" });
        const after = createYes2SDKMock({ storage, silent: true, query: "?yes2mock=reset" });
        expect(after.mock.settings.adResult).toBe(DEFAULT_SETTINGS.adResult);
        after.mock.configure({ adResult: "nofill" });
        after.mock.reset();
        expect(after.mock.settings.adResult).toBe("normal");
        expect(storage.getItem(SETTINGS_KEY)).toBeNull();
    });

    it("ignores corrupt saved settings", () => {
        const storage = new MemoryStorage();
        storage.setItem(SETTINGS_KEY, "{not json");
        expect(createYes2SDKMock({ storage, silent: true, query: "" }).mock.settings.adResult).toBe("normal");
    });
});

describe("logging", () => {
    it("prefixes every call with [Yes2SDK] Mock:", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const sdk = createYes2SDKMock({ overlay: false, storage: new MemoryStorage(), query: "", interstitialSeconds: 0 });
        const init = sdk.initializeAsync();
        await vi.advanceTimersByTimeAsync(20);
        await init;
        sdk.data.setInt("a", 1);
        sdk.analytics.logEvent("e");
        const ad = sdk.ads.showInterstitial("p");
        await vi.advanceTimersByTimeAsync(1);
        await ad;
        expect(info.mock.calls.length).toBeGreaterThan(4);
        for (const call of info.mock.calls) {
            expect(String(call[0])).toMatch(/^\[Yes2SDK\] Mock: /);
        }
    });

    it("silent suppresses logs", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        makeMock().setLoadingProgress(10);
        expect(info).not.toHaveBeenCalled();
    });
});
