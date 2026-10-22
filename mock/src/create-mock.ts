/**
 * The mock `Yes2SDK` object.
 */

import type { InitializationOptions, Platform, SDKEvents, Yes2SDK } from "../../types/yes2sdk";
import { createLogger, DATA_PREFIX, MockEvents, MOCK_VERSION, nextFrame, PLAYER_KEY, sdkError, type MockContext } from "./internals";
import {
    createAchievements,
    createAds,
    createAnalytics,
    createAuth,
    createBanners,
    createConfig,
    createContext,
    createData,
    createFriends,
    createGame,
    createIap,
    createLeaderboard,
    createNotifications,
    createPlayer,
    createReferrals,
    createReview,
    createScore,
    createSession,
    createStats,
    createTournament,
} from "./modules";
import {
    DEFAULT_SETTINGS,
    defaultStorage,
    resolveSettings,
    sanitizeSettings,
    saveSettings,
    SETTINGS_KEY,
    type MockSettings,
    type Yes2SDKMockOptions,
} from "./options";

/** The platform id the mock reports. Part of Core's `Platform` union. */
export const MOCK_PLATFORM: Platform = "debug";

/** Platform events you can trigger by hand. */
export type SimulatedEvent = "pause" | "resume" | "audioEnabledChange" | "exitRequested";

/** Dev/test controls that exist only on the mock (also on `window.Yes2SDKMock`). */
export interface Yes2SDKMockControls {
    /**
     * Fire a platform event. `audioEnabledChange` takes the new state, or
     * toggles when omitted.
     */
    simulate(event: SimulatedEvent, enabled?: boolean): void;
    /** Change settings at runtime. They are saved, like `?yes2mock=` ones. */
    configure(settings: Partial<MockSettings>): void;
    /** Current settings. */
    readonly settings: Readonly<MockSettings>;
    /** Forget saved settings and go back to the defaults. */
    reset(): void;
    /** Remove saved game data (`yes2sdk_*`) and mock player data. */
    clearStorage(): void;
    /** Whether a gameplay session is currently active. */
    readonly gameplayActive: boolean;
}

/** A `Yes2SDK` that is the mock. */
export interface Yes2SDKMock extends Yes2SDK {
    /** Always `true`; lets code and tests tell the mock from the real SDK. */
    readonly isMock: true;
    readonly mock: Yes2SDKMockControls;
}

/**
 * Maps every key of `T` to the matching `Yes2SDK` member type, or `never` when
 * `Yes2SDK` has no such key. Assigning the module table to this type makes
 * `tsc` fail if Core drops or renames a module the mock still provides
 * (spreading into the root object would otherwise skip excess-property checks).
 */
type OnlyYes2SDKMembers<T> = { [K in keyof T]: K extends keyof Yes2SDK ? Yes2SDK[K] : never };

/** Create a mock instance without touching `window`. */
export function createYes2SDKMock(options: Yes2SDKMockOptions = {}): Yes2SDKMock {
    const storage = options.storage ?? defaultStorage();
    const persist = options.persist !== false;
    const settings = resolveSettings(options, storage);
    const ctx: MockContext = {
        settings,
        storage,
        log: createLogger(() => ctx.settings.silent),
        events: new MockEvents(),
        initialized: false,
        gameplayActive: false,
        audioEnabled: settings.audioEnabled,
        adShowing: false,
    };

    let initPromise: Promise<void> | null = null;
    let gameStarted = false;

    const allModules = {
        ads: createAds(ctx),
        session: createSession(ctx),
        analytics: createAnalytics(ctx),
        player: createPlayer(ctx),
        auth: createAuth(ctx),
        data: createData(ctx),
        game: createGame(ctx),
        banners: createBanners(ctx),
        friends: createFriends(ctx),
        score: createScore(ctx),
        iap: createIap(ctx),
        leaderboard: createLeaderboard(ctx),
        stats: createStats(ctx),
        config: createConfig(ctx),
        review: createReview(ctx),
        achievements: createAchievements(ctx),
        tournament: createTournament(ctx),
        context: createContext(ctx),
        notifications: createNotifications(ctx),
        referrals: createReferrals(ctx),
    };
    const modules: OnlyYes2SDKMembers<typeof allModules> = allModules;

    const save = (): void => {
        if (persist) {
            saveSettings(storage, ctx.settings);
        }
    };

    const sdk: Yes2SDKMock = {
        isMock: true,
        get isInitialized(): boolean {
            return ctx.initialized;
        },
        version: MOCK_VERSION,
        ...modules,

        initializeAsync(initOptions?: InitializationOptions): Promise<void> {
            if (ctx.initialized) {
                ctx.log.warn("initializeAsync() called again; already initialized");
                return Promise.resolve();
            }
            if (initPromise !== null) {
                return initPromise;
            }
            ctx.log.info("initializeAsync()", initOptions ?? {});
            initPromise = nextFrame().then(() => {
                ctx.initialized = true;
                ctx.log.info(`initialized (platform "${MOCK_PLATFORM}", version ${MOCK_VERSION})`, ctx.settings);
                ctx.events.emit("initialized", { platform: MOCK_PLATFORM });
            });
            return initPromise;
        },

        async startGameAsync(): Promise<void> {
            if (!ctx.initialized && initPromise !== null) {
                await initPromise;
            }
            if (!ctx.initialized) {
                throw sdkError("NOT_INITIALIZED", "Call initializeAsync() before startGameAsync()", "startGameAsync");
            }
            if (gameStarted) {
                ctx.log.warn("startGameAsync() called again; game already started");
                return;
            }
            await nextFrame();
            gameStarted = true;
            ctx.log.info("startGameAsync()");
            ctx.events.emit("gameStarted", undefined);
        },

        setLoadingProgress(progress: number): void {
            if (typeof progress !== "number" || !(progress >= 0 && progress <= 100)) {
                throw sdkError(
                    "INVALID_PARAM",
                    `Progress must be between 0 and 100, received: ${String(progress)}`,
                    "setLoadingProgress"
                );
            }
            ctx.log.info(`setLoadingProgress(${progress})`);
            ctx.events.emit("loadingProgress", { progress });
        },

        performHapticFeedback(): void {
            ctx.log.info("performHapticFeedback()");
        },

        getPlatform(): Platform | null {
            return MOCK_PLATFORM;
        },

        on<K extends keyof SDKEvents>(event: K, listener: (data: SDKEvents[K]) => void): { unsubscribe: () => void } {
            return ctx.events.on(event, listener);
        },

        mock: {
            simulate(event: SimulatedEvent, enabled?: boolean): void {
                if (event === "audioEnabledChange") {
                    ctx.audioEnabled = enabled ?? !ctx.audioEnabled;
                    ctx.log.info(`simulate("audioEnabledChange") -> enabled: ${String(ctx.audioEnabled)}`);
                    ctx.events.emit("audioEnabledChange", { enabled: ctx.audioEnabled });
                    return;
                }
                ctx.log.info(`simulate("${event}")`);
                ctx.events.emit(event, undefined);
            },
            configure(next: Partial<MockSettings>): void {
                const clean = sanitizeSettings(next);
                ctx.settings = { ...ctx.settings, ...clean };
                if (clean.audioEnabled !== undefined) {
                    ctx.audioEnabled = clean.audioEnabled;
                }
                save();
                ctx.log.info("configure()", ctx.settings);
            },
            get settings(): Readonly<MockSettings> {
                return ctx.settings;
            },
            reset(): void {
                try {
                    storage.removeItem(SETTINGS_KEY);
                } catch {
                    // ignore
                }
                ctx.settings = { ...DEFAULT_SETTINGS };
                ctx.audioEnabled = ctx.settings.audioEnabled;
                ctx.log.info("reset() -> default settings");
            },
            clearStorage(): void {
                const doomed: string[] = [];
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key !== null && (key.startsWith(DATA_PREFIX) || key === PLAYER_KEY)) {
                        doomed.push(key);
                    }
                }
                doomed.forEach((key) => storage.removeItem(key));
                ctx.log.info(`clearStorage() removed ${doomed.length} key(s)`);
            },
            get gameplayActive(): boolean {
                return ctx.gameplayActive;
            },
        },
    };
    return sdk;
}
