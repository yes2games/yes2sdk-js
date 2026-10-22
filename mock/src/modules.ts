/**
 * Mock implementations of every Yes2SDK module.
 *
 * Each factory's return type is the generated public interface, so a module
 * gaining, losing or changing a member in Core breaks `tsc` here.
 *
 * Behaves like the Unity Editor simulation: ads, IAP, data and session work
 * locally; leaderboard, stats, friends and auth sign-in (and the other social
 * modules) report unsupported, which games must handle anyway.
 */

import type {
    AchievementsAPI,
    AdCallbacks,
    AdsAPI,
    AnalyticsAPI,
    AnalyticsParameters,
    AuthAPI,
    BannersAPI,
    ConfigAPI,
    ContextAPI,
    DataAPI,
    DeviceInfo,
    FriendsAPI,
    GameAPI,
    IAPAPI,
    LeaderboardAPI,
    NotificationsAPI,
    PlayerAPI,
    PlayerData,
    Product,
    Purchase,
    PurchaseConfig,
    ReferralsAPI,
    RegistrationPromptHandle,
    RegistrationPromptOptions,
    ReviewAPI,
    ScoreAPI,
    SessionAPI,
    StatsAPI,
    TournamentAPI,
    TrafficSource,
} from "../../types/yes2sdk";
import {
    DATA_PREFIX,
    MOCK_VERSION,
    nextFrame,
    notSupported,
    PLAYER_KEY,
    sdkError,
    wait,
    type MockContext,
} from "./internals";
import { showAdOverlay, showPurchaseDialog } from "./overlay";

const PLAYER_ID = "anonymous";

function unsupported<T>(ctx: MockContext, context: string): Promise<T> {
    ctx.log.info(`${context}() -> FEATURE_NOT_SUPPORTED`);
    return Promise.reject(notSupported(context));
}

function readJson<T>(ctx: MockContext, key: string, fallback: T): T {
    try {
        const raw = ctx.storage.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

function parseJsonObject(value: string, context: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw sdkError("INVALID_PARAM", "Expected a JSON object string", context);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw sdkError("INVALID_PARAM", "Expected a JSON object string", context);
    }
    return parsed as Record<string, unknown>;
}

function safe(ctx: MockContext, name: string, fn: (() => void) | undefined): void {
    try {
        fn?.();
    } catch (error) {
        ctx.log.warn(`${name} callback threw`, error);
    }
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export function createAds(ctx: MockContext): AdsAPI {
    async function play(kind: "interstitial" | "rewarded", placement: string, cb: AdCallbacks): Promise<void> {
        const context = kind === "interstitial" ? "ads.showInterstitial" : "ads.showRewarded";
        if (typeof placement !== "string" || placement.length === 0) {
            ctx.log.warn(`${context}() rejected: placement must be a non-empty string`);
            throw sdkError("INVALID_PARAM", "placement must be a non-empty string", context);
        }
        const fail = (reason: string): void => {
            ctx.log.info(`${context}("${placement}") -> ${reason}: noFill, afterAd`);
            safe(ctx, "noFill", cb.noFill);
            safe(ctx, "afterAd", cb.afterAd);
        };
        if (ctx.adShowing) {
            fail("another ad is showing");
            return;
        }
        const result = ctx.settings.adResult;
        if (result !== "normal") {
            await nextFrame();
            fail(result);
            if (result === "adblocked") {
                throw sdkError("ADS_BLOCKED", "Ad blocker detected (mock)", context);
            }
            if (result === "error") {
                throw sdkError("PLATFORM_ERROR", "Ad failed to load (mock)", context);
            }
            return;
        }
        ctx.adShowing = true;
        ctx.log.info(`${context}("${placement}") -> beforeAd`);
        safe(ctx, "beforeAd", cb.beforeAd);
        const seconds = kind === "interstitial" ? ctx.settings.interstitialSeconds : ctx.settings.rewardedSeconds;
        let ending: "completed" | "viewed" | "dismissed" = "completed";
        try {
            if (ctx.settings.overlay) {
                ending = await showAdOverlay(kind, placement, seconds);
            } else {
                await wait(seconds * 1000);
            }
        } finally {
            ctx.adShowing = false;
        }
        if (kind === "rewarded") {
            const outcome = ending === "completed" ? ctx.settings.rewardedOutcome : ending;
            ctx.log.info(`${context}("${placement}") -> ${outcome === "viewed" ? "adViewed" : "adDismissed"}`);
            safe(ctx, outcome === "viewed" ? "adViewed" : "adDismissed", outcome === "viewed" ? cb.adViewed : cb.adDismissed);
        }
        ctx.log.info(`${context}("${placement}") -> afterAd`);
        safe(ctx, "afterAd", cb.afterAd);
    }

    return {
        showInterstitial: (placement: string, callbacks: AdCallbacks = {}): Promise<void> =>
            play("interstitial", placement, callbacks),
        showRewarded: (placement: string, callbacks: AdCallbacks = {}): Promise<void> =>
            play("rewarded", placement, callbacks),
        showBanner(position = "bottom"): Promise<void> {
            ctx.log.info(`ads.showBanner("${position}")`);
            return Promise.resolve();
        },
        hideBanner(): void {
            ctx.log.info("ads.hideBanner()");
        },
        isInterstitialSupported: (): boolean => true,
        isRewardedSupported: (): boolean => true,
        isBannerSupported: (): boolean => true,
        isRewardedAdAvailable: (): boolean => true,
        isAdBlocked: (): boolean => ctx.settings.adResult === "adblocked",
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Game + analytics (share the gameplay state, like the SDK)
// ---------------------------------------------------------------------------

function setGameplay(ctx: MockContext, active: boolean, source: string): void {
    if (ctx.gameplayActive === active) {
        return;
    }
    ctx.gameplayActive = active;
    ctx.log.info(`${source}() -> gameplay ${active ? "started" : "stopped"}`);
}

export function createGame(ctx: MockContext): GameAPI {
    const log = (message: string, ...details: unknown[]): void => ctx.log.info(`game.${message}`, ...details);
    return {
        gameplayStart: (): void => setGameplay(ctx, true, "game.gameplayStart"),
        gameplayStop: (): void => setGameplay(ctx, false, "game.gameplayStop"),
        happyTime: (): void => log("happyTime()"),
        reportProgress(percentage: number): void {
            if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
                throw sdkError("INVALID_PARAM", "percentage must be within 0-100", "game.reportProgress");
            }
            log(`reportProgress(${percentage})`);
        },
        setGameContext(context: Record<string, unknown>): void {
            if (typeof context !== "object" || context === null || Array.isArray(context)) {
                throw sdkError("INVALID_PARAM", "context must be a plain object", "game.setGameContext");
            }
            log("setGameContext()", context);
        },
        clearGameContext: (): void => log("clearGameContext()"),
        inviteLink: () => unsupported(ctx, "game.inviteLink"),
        getInviteParam: (): string => "",
        showInviteButton: (paramsJson: string): void => log(`showInviteButton(${paramsJson})`),
        hideInviteButton: (): void => log("hideInviteButton()"),
        updateRoom: (roomId: string, isJoinable: boolean): void => log(`updateRoom("${roomId}", ${String(isJoinable)})`),
        leftRoom: (): void => log("leftRoom()"),
        isInstantMultiplayer: (): boolean => false,
        getInviteParams: (): Record<string, string> | null => null,
        getSettings: (): string => "{}",
        copyToClipboard(text: string): void {
            log("copyToClipboard()");
            if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
                navigator.clipboard.writeText(text).catch(() => undefined);
            }
        },
        getServerTimeAsync: (): Promise<number> => Promise.resolve(Date.now()),
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createAnalytics(ctx: MockContext): AnalyticsAPI {
    const log = (name: string, data?: unknown): void => {
        ctx.log.info(`analytics.${name}()`, ...(data === undefined ? [] : [data]));
    };
    return {
        logEvent(eventName: string, valueToSum?: number, parameters?: AnalyticsParameters): void {
            log("logEvent", { eventName, valueToSum, parameters });
        },
        logLevelStart(level: string): void {
            log("logLevelStart", { level });
            setGameplay(ctx, true, "analytics.logLevelStart");
        },
        logLevelEnd(level: string, score?: number, success?: boolean, durationSeconds?: number): void {
            log("logLevelEnd", { level, score, success, durationSeconds });
            setGameplay(ctx, false, "analytics.logLevelEnd");
        },
        logScore: (score: number, level?: string): void => log("logScore", { score, level }),
        logTutorial: (step: string, completed: boolean): void => log("logTutorial", { step, completed }),
        logPurchase: (productId: string, price: number, currency: string): void =>
            log("logPurchase", { productId, price, currency }),
        logTutorialStart: (): void => log("logTutorialStart"),
        logTutorialEnd: (): void => log("logTutorialEnd"),
        isSupported: (): boolean => true,
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function createSession(ctx: MockContext): SessionAPI {
    const trafficSource = (): TrafficSource => {
        const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
        const referrer = typeof document !== "undefined" && document.referrer !== "" ? document.referrer : null;
        return {
            referrer,
            utmCampaign: params.get("utm_campaign"),
            utmSource: params.get("utm_source"),
            utmMedium: params.get("utm_medium"),
        };
    };
    const deviceInfo = (): DeviceInfo => ({ type: "desktop", isMobile: false, isDesktop: true, isTablet: false, isTV: false });

    return {
        getCountry: (): string => "",
        getLocale: (): string => "en",
        getOrientation: () => "landscape",
        getDevice: () => "desktop",
        getDeviceInfo: deviceInfo,
        getEntryPointAsync: (): Promise<string> => Promise.resolve("direct"),
        getEntryPointData: (): Record<string, unknown> => ({ ...ctx.settings.entryPointData }),
        setSessionData: (data: Record<string, unknown>): void => ctx.log.info("session.setSessionData()", data),
        getTrafficSource: trafficSource,
        getTrafficSourceJson: (): string => JSON.stringify(trafficSource()),
        getEntryPointDataJson: (): string => JSON.stringify(ctx.settings.entryPointData),
        setSessionDataFromJson(data: string | Record<string, unknown>): void {
            const parsed = typeof data === "string" ? parseJsonObject(data, "session.setSessionDataFromJson") : data;
            ctx.log.info("session.setSessionDataFromJson()", parsed);
        },
        getPlatform: (): string => "debug",
        getSDKVersion: (): string => MOCK_VERSION,
        isAudioEnabled: (): boolean => ctx.audioEnabled,
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Player + data (localStorage)
// ---------------------------------------------------------------------------

export function createPlayer(ctx: MockContext): PlayerAPI {
    const player = { id: PLAYER_ID, name: null, photo: null };

    const toKeys = (keys: string[] | string): string[] => {
        if (Array.isArray(keys)) {
            return keys;
        }
        try {
            const parsed: unknown = JSON.parse(keys);
            return Array.isArray(parsed) ? parsed.map(String) : [keys];
        } catch {
            return [keys];
        }
    };

    return {
        getPlayer: () => Promise.resolve(player),
        getPlayerAsync: () => Promise.resolve(player),
        getUniqueId: (): Promise<string> => Promise.resolve(PLAYER_ID),
        getIDsPerGame: () => Promise.resolve([]),
        getPayingStatus: () => Promise.resolve("unknown"),
        getMode: () => Promise.resolve("lite"),
        getPhoto: (): Promise<string | null> => Promise.resolve(null),
        getBotAvatarAsync: () => unsupported(ctx, "player.getBotAvatarAsync"),
        isBotAvatarSupported: (): boolean => false,
        getConnectedPlayers: () => unsupported(ctx, "player.getConnectedPlayers"),
        getConnectedPlayersAsync: () => unsupported(ctx, "player.getConnectedPlayersAsync"),
        async getDataAsync(keys: string[] | string): Promise<PlayerData> {
            const all = readJson<PlayerData>(ctx, PLAYER_KEY, {});
            const result: PlayerData = {};
            for (const k of toKeys(keys)) {
                if (k in all) {
                    result[k] = all[k];
                }
            }
            ctx.log.info("player.getDataAsync()", result);
            return result;
        },
        async setDataAsync(data: PlayerData | string): Promise<void> {
            const patch = typeof data === "string" ? parseJsonObject(data, "player.setDataAsync") : data;
            ctx.storage.setItem(PLAYER_KEY, JSON.stringify({ ...readJson<PlayerData>(ctx, PLAYER_KEY, {}), ...patch }));
            ctx.log.info("player.setDataAsync()", patch);
        },
        flushDataAsync: (): Promise<void> => Promise.resolve(),
        getSignedPlayerInfoAsync: () => Promise.resolve({ playerId: "mock-player", signature: "mock-signature" }),
        isDataSupported: (): boolean => true,
        isConnectedPlayersSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createData(ctx: MockContext): DataAPI {
    const k = (key: string): string => DATA_PREFIX + key;
    const read = (key: string): string | null => ctx.storage.getItem(k(key));
    const write = (key: string, value: string): boolean => {
        try {
            ctx.storage.setItem(k(key), value);
            ctx.log.info(`data.set("${key}", ${JSON.stringify(value)})`);
            return true;
        } catch (error) {
            ctx.log.warn(`data write failed for "${key}"`, error);
            return false;
        }
    };
    const readNumber = (key: string, fallback: number, parse: (raw: string) => number): number => {
        const raw = read(key);
        if (raw === null) {
            return fallback;
        }
        const value = parse(raw);
        return Number.isNaN(value) ? fallback : value;
    };

    return {
        getInt: (key: string, defaultValue = 0): number => readNumber(key, defaultValue, (r) => parseInt(r, 10)),
        setInt(key: string, value: number): void {
            write(key, String(Math.trunc(value)));
        },
        getFloat: (key: string, defaultValue = 0): number => readNumber(key, defaultValue, parseFloat),
        setFloat(key: string, value: number): void {
            write(key, String(value));
        },
        getString: (key: string, defaultValue = ""): string => read(key) ?? defaultValue,
        setString(key: string, value: string): void {
            write(key, value);
        },
        hasKey: (key: string): boolean => read(key) !== null,
        deleteKey(key: string): void {
            ctx.storage.removeItem(k(key));
            ctx.log.info(`data.deleteKey("${key}")`);
        },
        deleteAll(): void {
            const doomed: string[] = [];
            for (let i = 0; i < ctx.storage.length; i++) {
                const key = ctx.storage.key(i);
                if (key !== null && key.startsWith(DATA_PREFIX)) {
                    doomed.push(key);
                }
            }
            doomed.forEach((key) => ctx.storage.removeItem(key));
            ctx.log.info(`data.deleteAll() removed ${doomed.length} key(s)`);
        },
        setStringAsync: (key: string, value: string): Promise<boolean> => Promise.resolve(write(key, value)),
        setIntAsync: (key: string, value: number): Promise<boolean> => Promise.resolve(write(key, String(Math.trunc(value)))),
        setFloatAsync: (key: string, value: number): Promise<boolean> => Promise.resolve(write(key, String(value))),
        flushAsync: (): Promise<boolean> => Promise.resolve(true),
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// IAP: a fixed catalog, purchases kept for the session
// ---------------------------------------------------------------------------

export const MOCK_PRODUCTS: readonly Product[] = [
    {
        productId: "yes2.mock.coins.small",
        title: "Small coin pack (mock)",
        description: "A handful of coins.",
        imageUri: "",
        price: "$0.99",
        priceCurrencyCode: "USD",
        priceAmount: 0.99,
    },
    {
        productId: "yes2.mock.coins.large",
        title: "Large coin pack (mock)",
        description: "A pile of coins.",
        imageUri: "",
        price: "$4.99",
        priceCurrencyCode: "USD",
        priceAmount: 4.99,
    },
    {
        productId: "yes2.mock.noads",
        title: "Remove ads (mock)",
        description: "No more interstitials.",
        imageUri: "",
        price: "$2.99",
        priceCurrencyCode: "USD",
        priceAmount: 2.99,
    },
];

export function createIap(ctx: MockContext): IAPAPI {
    let purchases: Purchase[] = [];
    let open = false;
    let counter = 0;

    async function purchase(config: PurchaseConfig): Promise<Purchase> {
        const context = "iap.purchaseAsync";
        if (open) {
            ctx.log.warn(`${context}("${config.productId}") rejected: a purchase is already open`);
            throw sdkError("INVALID_OPERATION", "Another purchase is already in progress", context);
        }
        const product = MOCK_PRODUCTS.find((p) => p.productId === config?.productId);
        if (product === undefined) {
            throw sdkError("INVALID_PARAM", `Unknown product "${String(config?.productId)}"`, context);
        }
        open = true;
        try {
            const result = ctx.settings.iapResult;
            let choice: "buy" | "cancel" = result === "cancel" ? "cancel" : "buy";
            if (result === "normal" && ctx.settings.overlay) {
                choice = await showPurchaseDialog(product.title, product.price);
            } else {
                await nextFrame();
            }
            if (choice === "cancel") {
                ctx.log.info(`${context}("${product.productId}") -> cancelled`);
                throw sdkError("IAP_PURCHASE_CANCELLED", "The player cancelled the purchase (mock)", context);
            }
            if (result === "fail") {
                ctx.log.info(`${context}("${product.productId}") -> failed`);
                throw sdkError("IAP_PURCHASE_FAILED", "Purchase failed (mock)", context);
            }
            counter += 1;
            const bought: Purchase = {
                purchaseToken: `mock-token-${counter}`,
                productId: product.productId,
                paymentId: `mock-payment-${counter}`,
                purchaseTime: new Date().toISOString(),
                developerPayload: config.developerPayload,
                isSandbox: true,
                priceAmount: product.priceAmount,
                priceCurrencyCode: product.priceCurrencyCode,
            };
            purchases = [...purchases, bought];
            ctx.log.info(`${context}("${product.productId}") -> purchased`, bought);
            return bought;
        } finally {
            open = false;
        }
    }

    return {
        getCatalogAsync: (): Promise<Product[]> => Promise.resolve([...MOCK_PRODUCTS]),
        getProductAsync: (productId: string): Promise<Product | null> =>
            Promise.resolve(MOCK_PRODUCTS.find((p) => p.productId === productId) ?? null),
        purchaseAsync: purchase,
        getPurchasesAsync: (): Promise<Purchase[]> => Promise.resolve([...purchases]),
        consumePurchaseAsync(purchaseToken: string): Promise<void> {
            const before = purchases.length;
            purchases = purchases.filter((p) => p.purchaseToken !== purchaseToken);
            if (purchases.length === before) {
                return Promise.reject(sdkError("INVALID_PARAM", "Unknown purchase token", "iap.consumePurchaseAsync"));
            }
            ctx.log.info(`iap.consumePurchaseAsync("${purchaseToken}")`);
            return Promise.resolve();
        },
        getSubscriptionStatusAsync: () => unsupported(ctx, "iap.getSubscriptionStatusAsync"),
        getSubscriptionsAsync: () => unsupported(ctx, "iap.getSubscriptionsAsync"),
        subscribeAsync: () => unsupported(ctx, "iap.subscribeAsync"),
        cancelSubscriptionAsync: () => unsupported(ctx, "iap.cancelSubscriptionAsync"),
        claimRetentionOfferAsync: () => unsupported(ctx, "iap.claimRetentionOfferAsync"),
        isSupported: (): boolean => true,
        isSubscriptionSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Auth: no sign-in locally
// ---------------------------------------------------------------------------

export function createAuth(ctx: MockContext): AuthAPI {
    return {
        getCurrentUser: () => null,
        getCurrentUserAsync: () => Promise.resolve(null),
        showAccountLinkPromptAsync: () => unsupported(ctx, "auth.showAccountLinkPromptAsync"),
        signInAsync: () => unsupported(ctx, "auth.signInAsync"),
        signOutAsync: () => unsupported(ctx, "auth.signOutAsync"),
        getTokenAsync: () => unsupported(ctx, "auth.getTokenAsync"),
        linkAccountAsync: () => unsupported(ctx, "auth.linkAccountAsync"),
        showRegistrationPrompt(options?: RegistrationPromptOptions): RegistrationPromptHandle {
            ctx.log.info("auth.showRegistrationPrompt() (no UI in the mock)");
            let closed = false;
            const close = (): void => {
                if (!closed) {
                    closed = true;
                    options?.onClose?.();
                }
            };
            return { login: close, close };
        },
        isAuthenticated: (): boolean => false,
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Banners, score: log only, reported unsupported (as on many platforms)
// ---------------------------------------------------------------------------

export function createBanners(ctx: MockContext): BannersAPI {
    const log = (message: string): void => ctx.log.info(`banners.${message}`);
    return {
        showBanner(id: string, size: string): Promise<void> {
            log(`showBanner("${id}", "${size}")`);
            return Promise.resolve();
        },
        showResponsiveBanner: () => unsupported(ctx, "banners.showResponsiveBanner"),
        hideBanner: (id: string): void => log(`hideBanner("${id}")`),
        hideAllBanners: (): void => log("hideAllBanners()"),
        refreshBanners: (): void => log("refreshBanners()"),
        getBannerStatusAsync: () => Promise.resolve({ isShowing: false }),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createScore(ctx: MockContext): ScoreAPI {
    return {
        addScore: (score: number): void => ctx.log.info(`score.addScore(${score})`),
        submitScore: (encryptedScore: string): void => ctx.log.info(`score.submitScore("${encryptedScore}")`),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

// ---------------------------------------------------------------------------
// Unsupported in the mock
// ---------------------------------------------------------------------------

export function createFriends(ctx: MockContext): FriendsAPI {
    return {
        listFriendsAsync: () => unsupported(ctx, "friends.listFriendsAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createLeaderboard(ctx: MockContext): LeaderboardAPI {
    return {
        getLeaderboardAsync: () => unsupported(ctx, "leaderboard.getLeaderboardAsync"),
        setScoreAsync: () => unsupported(ctx, "leaderboard.setScoreAsync"),
        getEntriesAsync: () => unsupported(ctx, "leaderboard.getEntriesAsync"),
        getPlayerEntryAsync: () => unsupported(ctx, "leaderboard.getPlayerEntryAsync"),
        getConnectedPlayerEntriesAsync: () => unsupported(ctx, "leaderboard.getConnectedPlayerEntriesAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createStats(ctx: MockContext): StatsAPI {
    return {
        getStatsAsync: () => unsupported(ctx, "stats.getStatsAsync"),
        setStatsAsync: () => unsupported(ctx, "stats.setStatsAsync"),
        incrementStatsAsync: () => unsupported(ctx, "stats.incrementStatsAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createConfig(ctx: MockContext): ConfigAPI {
    return {
        getFlagsAsync: () => unsupported(ctx, "config.getFlagsAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createReview(ctx: MockContext): ReviewAPI {
    return {
        canReviewAsync: () => Promise.resolve({ canReview: false, reason: "UNSUPPORTED" }),
        requestReviewAsync: () => unsupported(ctx, "review.requestReviewAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createAchievements(ctx: MockContext): AchievementsAPI {
    return {
        getAchievementsAsync: () => unsupported(ctx, "achievements.getAchievementsAsync"),
        unlockAsync: () => unsupported(ctx, "achievements.unlockAsync"),
        setProgressAsync: () => unsupported(ctx, "achievements.setProgressAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createTournament(ctx: MockContext): TournamentAPI {
    return {
        getCurrentAsync: () => unsupported(ctx, "tournament.getCurrentAsync"),
        getAllAsync: () => unsupported(ctx, "tournament.getAllAsync"),
        createAsync: () => unsupported(ctx, "tournament.createAsync"),
        postScoreAsync: () => unsupported(ctx, "tournament.postScoreAsync"),
        shareAsync: () => unsupported(ctx, "tournament.shareAsync"),
        joinAsync: () => unsupported(ctx, "tournament.joinAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createContext(ctx: MockContext): ContextAPI {
    return {
        getContext: () => ({ id: null, type: "SOLO" }),
        getType: () => "SOLO",
        getPlayersAsync: () => unsupported(ctx, "context.getPlayersAsync"),
        switchAsync: () => unsupported(ctx, "context.switchAsync"),
        chooseAsync: () => unsupported(ctx, "context.chooseAsync"),
        createAsync: () => unsupported(ctx, "context.createAsync"),
        isSizeBetween: (min: number, max: number) => ({ answer: false, minSize: min, maxSize: max }),
        shareAsync: () => unsupported(ctx, "context.shareAsync"),
        updateAsync: () => unsupported(ctx, "context.updateAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createNotifications(ctx: MockContext): NotificationsAPI {
    return {
        scheduleAsync: () => unsupported(ctx, "notifications.scheduleAsync"),
        cancelAsync: () => unsupported(ctx, "notifications.cancelAsync"),
        cancelAllAsync: () => unsupported(ctx, "notifications.cancelAllAsync"),
        canSubscribeBotAsync: (): Promise<boolean> => Promise.resolve(false),
        subscribeBotAsync: () => unsupported(ctx, "notifications.subscribeBotAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}

export function createReferrals(ctx: MockContext): ReferralsAPI {
    return {
        shareAsync: () => unsupported(ctx, "referrals.shareAsync"),
        listAsync: () => unsupported(ctx, "referrals.listAsync"),
        isSupported: (): boolean => false,
        isAvailable: (): boolean => ctx.initialized,
    };
}
