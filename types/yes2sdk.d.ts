/**
 * Yes2SDK public type declarations.
 *
 * Generated from Yes2SDK Core v2.12.0 by scripts/generate-types.ts.
 * DO NOT EDIT BY HAND: run `npm run generate:types` with Core available.
 */

/**
 * The Yes2SDK runtime, available as `window.Yes2SDK` (or bare `Yes2SDK`).
 *
 * @remarks Games never bundle the real SDK. Write against this interface, use the `@yes2games/js`
 * mock during local development, and upload a plain build to the Yes2Games Dashboard, which injects
 * the real SDK for each target platform.
 *
 * @example
 * ```ts
 * await Yes2SDK.initializeAsync();
 * Yes2SDK.setLoadingProgress(100);
 * await Yes2SDK.startGameAsync();
 * await Yes2SDK.ads.showInterstitial("level-complete", {
 *     beforeAd: pauseGame,
 *     afterAd: resumeGame,
 * });
 * ```
 */
export interface Yes2SDK {
    /**
     * Whether the SDK has been initialized.
     */
    readonly isInitialized: boolean;

    /**
     * SDK version (semver), sourced from the package version at build time.
     *
     * @remarks Exposed on the runtime instance so host environments and engine bridges can read
     * `window.Yes2SDK.version` to detect integration and check version compatibility without
     * substring-matching the bundle.
     */
    readonly version: string;

    /**
     * Ads module API. Lazy-initialized on first access.
     */
    readonly ads: AdsAPI;

    /**
     * Session module API. Lazy-initialized on first access.
     */
    readonly session: SessionAPI;

    /**
     * Analytics module API. Lazy-initialized on first access.
     */
    readonly analytics: AnalyticsAPI;

    /**
     * Player module API. Lazy-initialized on first access.
     */
    readonly player: PlayerAPI;

    /**
     * Auth module API. Lazy-initialized on first access.
     */
    readonly auth: AuthAPI;

    /**
     * Data module API. Lazy-initialized on first access.
     */
    readonly data: DataAPI;

    /**
     * Game module API. Lazy-initialized on first access.
     */
    readonly game: GameAPI;

    /**
     * Banners module API. Lazy-initialized on first access.
     */
    readonly banners: BannersAPI;

    /**
     * Friends module API. Lazy-initialized on first access.
     */
    readonly friends: FriendsAPI;

    /**
     * Score module API. Lazy-initialized on first access.
     */
    readonly score: ScoreAPI;

    /**
     * IAP module API. Lazy-initialized on first access.
     */
    readonly iap: IAPAPI;

    /**
     * Leaderboard module API. Lazy-initialized on first access.
     */
    readonly leaderboard: LeaderboardAPI;

    /**
     * Stats module API. Lazy-initialized on first access.
     */
    readonly stats: StatsAPI;

    /**
     * Config (remote configuration / feature flags) module API. Lazy-initialized on first access.
     */
    readonly config: ConfigAPI;

    /**
     * Review (game rating / feedback prompt) module API. Lazy-initialized on first access.
     */
    readonly review: ReviewAPI;

    /**
     * Achievements module API. Lazy-initialized on first access.
     */
    readonly achievements: AchievementsAPI;

    /**
     * Tournament module API. Lazy-initialized on first access.
     */
    readonly tournament: TournamentAPI;

    /**
     * Context module API. Lazy-initialized on first access.
     */
    readonly context: ContextAPI;

    /**
     * Notifications module API. Lazy-initialized on first access.
     */
    readonly notifications: NotificationsAPI;

    /**
     * Referrals module API. Lazy-initialized on first access.
     */
    readonly referrals: ReferralsAPI;

    /**
     * Initialize the SDK.
     *
     * @remarks This must be called before any other SDK functions. It detects the current platform,
     * loads platform-specific code, and initializes the platform SDK.
     *
     * @param options - Optional initialization configuration.
     * @returns Promise that resolves when initialization completes.
     */
    initializeAsync(options?: InitializationOptions): Promise<void>;

    /**
     * Start the game after loading is complete.
     *
     * @remarks This signals to the platform that the game is ready to be displayed. Should be
     * called after all game assets are loaded.
     *
     * @returns Promise that resolves when the game starts.
     */
    startGameAsync(): Promise<void>;

    /**
     * Set the loading progress for the game.
     *
     * @param progress - Loading progress between 0 and 100.
     */
    setLoadingProgress(progress: number): void;

    /**
     * Perform haptic feedback if supported.
     */
    performHapticFeedback(): void;

    /**
     * Get the current platform.
     * @returns The detected platform, or null if not initialized.
     */
    getPlatform(): Platform | null;

    /**
     * Subscribe to SDK events.
     * @param event - The event to subscribe to.
     * @param listener - The listener function.
     * @returns A subscription that can be unsubscribed.
     */
    on<K extends keyof SDKEvents>(event: K, listener: (data: SDKEvents[K]) => void): { unsubscribe: () => void };
}

/**
 * Ads module API.
 */
export interface AdsAPI {
    /**
     * Show an interstitial (full-screen) ad.
     *
     * @param placement - Placement identifier for analytics tracking.
     * @param callbacks - Optional callbacks for ad lifecycle events.
     * @returns Promise that resolves when the ad finishes.
     *
     * @remarks `afterAd` is delivered exactly once, even if the platform never calls it or calls it
     * more than once.
     */
    showInterstitial(placement: string, callbacks?: AdCallbacks): Promise<void>;

    /**
     * Show a rewarded video ad.
     *
     * @param placement - Placement identifier for analytics tracking.
     * @param callbacks - Optional callbacks for ad lifecycle events.
     * @returns Promise that resolves when the ad finishes.
     *
     * @remarks The ad always ends with exactly one of `adViewed`, `adDismissed` or `noFill`,
     * followed by exactly one `afterAd`, whatever the platform does. A missing outcome is reported
     * as `adDismissed` (or `noFill` when the ad request failed), never `adViewed`, so an ambiguous
     * ad never grants a reward.
     */
    showRewarded(placement: string, callbacks?: AdCallbacks): Promise<void>;

    /**
     * Show a banner ad.
     *
     * @param position - Position of the banner on screen ('top' or 'bottom').
     * @returns Promise that resolves when the banner is displayed.
     */
    showBanner(position?: BannerPosition): Promise<void>;

    /**
     * Hide the currently displayed banner ad.
     */
    hideBanner(): void;

    /**
     * Check if interstitial ads are supported on the current platform.
     * @returns True if supported.
     */
    isInterstitialSupported(): boolean;

    /**
     * Check if rewarded ads are supported on the current platform.
     * @returns True if supported.
     */
    isRewardedSupported(): boolean;

    /**
     * Check if banner ads are supported on the current platform.
     * @returns True if supported.
     */
    isBannerSupported(): boolean;

    /**
     * Best-effort check whether a rewarded ad is currently available to show.
     *
     * @remarks Most platform SDKs don't expose an explicit readiness API — this falls back to "true
     * if the platform SDK is loaded". Treat the result as a hint for gating UI; calling
     * showRewarded after a true result can still fail (e.g. no fill from the ad network).
     *
     * @returns True if a rewarded ad appears to be available.
     */
    isRewardedAdAvailable(): boolean;

    /**
     * Check if ads are being blocked by an ad blocker.
     *
     * @remarks Returns false before initialization or when the platform cannot tell (assumes no
     * blocking).
     *
     * @returns True if an ad blocker is detected.
     */
    isAdBlocked(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Session module API.
 */
export interface SessionAPI {
    /**
     * Get the player's country code.
     *
     * @returns ISO 3166-1 alpha-2 country code (e.g., "US", "JP").
     *
     * @example
     * ```typescript
     * const country = Yes2SDK.session.getCountry();
     * if (country === 'JP') {
     *     showJapaneseContent();
     * }
     * ```
     */
    getCountry(): string;

    /**
     * Get the player's locale.
     *
     * @returns Locale string (e.g., "en_US", "ja_JP").
     *
     * @example
     * ```typescript
     * const locale = Yes2SDK.session.getLocale();
     * i18n.setLocale(locale);
     * ```
     */
    getLocale(): string;

    /**
     * Get the current device orientation.
     *
     * @returns The device orientation ('portrait' or 'landscape').
     *
     * @example
     * ```typescript
     * const orientation = Yes2SDK.session.getOrientation();
     * if (orientation === 'portrait') {
     *     showPortraitUI();
     * }
     * ```
     */
    getOrientation(): DeviceOrientation;

    /**
     * Get the device type.
     *
     * @returns The device type ('desktop', 'mobile', 'tablet', 'tv', or 'unknown').
     *
     * @example
     * ```typescript
     * const device = Yes2SDK.session.getDevice();
     * if (device === 'mobile') {
     *     enableTouchControls();
     * }
     * ```
     */
    getDevice(): DeviceType;

    /**
     * Get rich device information.
     *
     * @returns Device info: the resolved {@link DeviceType} plus boolean class flags (`isMobile` /
     * `isDesktop` / `isTablet` / `isTV`).
     *
     * @example
     * ```typescript
     * const device = Yes2SDK.session.getDeviceInfo();
     * if (device.isMobile || device.isTablet) {
     *     enableTouchControls();
     * }
     * ```
     */
    getDeviceInfo(): DeviceInfo;

    /**
     * Get the entry point (how the game was launched).
     *
     * @returns Promise that resolves with the entry point string.
     *
     * @example
     * ```typescript
     * const entryPoint = await Yes2SDK.session.getEntryPointAsync();
     * analytics.track('game_launch', { entryPoint });
     * ```
     */
    getEntryPointAsync(): Promise<string>;

    /**
     * Get data passed when launching the game.
     *
     * @returns Entry point data object, or empty object if none.
     *
     * @remarks This data is typically passed through share links or invites.
     *
     * @example
     * ```typescript
     * const data = Yes2SDK.session.getEntryPointData();
     * if (data.challengeId) {
     *     loadChallenge(data.challengeId as string);
     * }
     * ```
     */
    getEntryPointData(): EntryPointData;

    /**
     * Set session data for the current play session.
     *
     * @param data - Data to set for the session.
     *
     * @example
     * ```typescript
     * Yes2SDK.session.setSessionData({
     *     currentLevel: 'level-5',
     *     score: 1000
     * });
     * ```
     */
    setSessionData(data: Record<string, unknown>): void;

    /**
     * Get traffic source information.
     *
     * @returns Traffic source data including referrer and UTM parameters.
     *
     * @example
     * ```typescript
     * const source = Yes2SDK.session.getTrafficSource();
     * if (source.utmCampaign) {
     *     analytics.track('campaign_visit', { campaign: source.utmCampaign });
     * }
     * ```
     */
    getTrafficSource(): TrafficSource;

    /**
     * Get traffic source information as a JSON string.
     *
     * @remarks Engine-wrapper compatibility alias. Returns JSON.stringify of getTrafficSource().
     *
     * @returns JSON string of traffic source data.
     */
    getTrafficSourceJson(): string;

    /**
     * Get entry point data as a JSON string.
     *
     * @remarks Engine-wrapper compatibility alias. Returns JSON.stringify of getEntryPointData().
     *
     * @returns JSON string of entry point data.
     */
    getEntryPointDataJson(): string;

    /**
     * Set session data, accepting either an object or a JSON string.
     *
     * @param data - Data object or JSON string to set for the session.
     *
     * @remarks Accepts a JSON string for engine wrappers that cannot pass objects.
     */
    setSessionDataFromJson(data: string | Record<string, unknown>): void;

    /**
     * Get the platform identifier string.
     *
     * @returns Platform identifier (e.g., "IOS", "ANDROID", "WEB").
     */
    getPlatform(): string;

    /**
     * Get the SDK version string.
     *
     * @returns SDK version (e.g., "1.0.0").
     */
    getSDKVersion(): string;

    /**
     * Check whether audio is currently enabled by the platform.
     *
     * @remarks Required by YouTube Playables certification — games must read this at startup to set
     * their initial mute state, then subscribe to the SDK event "audioEnabledChange" for runtime
     * updates:
     *
     * ```ts
     * if (!Yes2SDK.session.isAudioEnabled()) game.mute();
     * Yes2SDK.on("audioEnabledChange", ({ enabled }) => game.setMute(!enabled));
     * ```
     *
     * On platforms without a native audio-enabled signal (Poki, CrazyGames, Yandex,
     * GameDistribution), this returns true. Before initialization it returns true to avoid muting
     * games during early initialization.
     *
     * @returns True if audio is enabled.
     */
    isAudioEnabled(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Analytics module API.
 */
export interface AnalyticsAPI {
    /**
     * Log a custom analytics event.
     *
     * @param eventName - Name of the event.
     * @param valueToSum - Optional value for aggregation.
     * @param parameters - Optional event parameters.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logEvent('item_purchased', 100, {
     *     item_id: 'sword_01',
     *     currency: 'coins'
     * });
     * ```
     */
    logEvent(eventName: string, valueToSum?: number, parameters?: AnalyticsParameters): void;

    /**
     * Log a level start event.
     *
     * @param level - Level identifier.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logLevelStart('world-1-level-5');
     * ```
     */
    logLevelStart(level: string): void;

    /**
     * Log a level end event.
     *
     * @param level - Level identifier.
     * @param score - Optional score achieved.
     * @param success - Whether the level was completed successfully.
     * @param durationSeconds - Optional duration of the level in seconds. Useful for time-based
     * games (racing, time-attack).
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logLevelEnd('world-1-level-5', 9500, true);
     * Yes2SDK.analytics.logLevelEnd('world-1-level-5', 9500, true, 87.3);
     * ```
     */
    logLevelEnd(level: string, score?: number, success?: boolean, durationSeconds?: number): void;

    /**
     * Log a score event.
     *
     * @param score - The score value.
     * @param level - Optional level context.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logScore(9999, 'endless-mode');
     * ```
     */
    logScore(score: number, level?: string): void;

    /**
     * Log a tutorial event.
     *
     * @param step - Tutorial step identifier.
     * @param completed - Whether the tutorial was completed.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logTutorial('movement-intro', false);
     * Yes2SDK.analytics.logTutorial('tutorial-complete', true);
     * ```
     */
    logTutorial(step: string, completed: boolean): void;

    /**
     * Log a purchase event.
     *
     * @remarks On platforms with first-party analytics, a successful `iap.purchaseAsync` already
     * reports the purchase, so this call is optional there. Calling it anyway is safe: a manual
     * call for the same product close to the automatic report is dropped, so the purchase is
     * counted once.
     *
     * @param productId - Product identifier.
     * @param price - Price paid.
     * @param currency - Currency code (e.g., "USD").
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logPurchase('gold_pack_100', 4.99, 'USD');
     * ```
     */
    logPurchase(productId: string, price: number, currency: string): void;

    /**
     * Log a tutorial start event.
     *
     * @remarks Engine-wrapper compatibility alias. Internally calls logTutorial with
     * completed=false.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logTutorialStart();
     * ```
     */
    logTutorialStart(): void;

    /**
     * Log a tutorial end event.
     *
     * @remarks Engine-wrapper compatibility alias. Internally calls logTutorial with
     * completed=true.
     *
     * @example
     * ```typescript
     * Yes2SDK.analytics.logTutorialEnd();
     * ```
     */
    logTutorialEnd(): void;

    /**
     * Check if analytics is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Player module API.
 */
export interface PlayerAPI {
    /**
     * Get the current player's information.
     *
     * @returns Promise that resolves with the player object.
     *
     * @example
     * ```typescript
     * const player = await Yes2SDK.player.getPlayer();
     * console.log(`Player ID: ${player.id}`);
     * console.log(`Name: ${player.name ?? 'Anonymous'}`);
     * ```
     */
    getPlayer(): Promise<Player>;

    /**
     * Alias for getPlayer() (engine-wrapper compatibility alias).
     * @returns Promise that resolves with the player object.
     */
    getPlayerAsync(): Promise<Player>;

    /**
     * Get the current player's permanent unique identifier.
     *
     * @returns Promise that resolves with the unique id. Resolves with `"anonymous"` on platforms
     * that cannot identify the player.
     *
     * @example
     * ```typescript
     * const id = await Yes2SDK.player.getUniqueId();
     * ```
     */
    getUniqueId(): Promise<string>;

    /**
     * Get the player's identity across the developer's other games on the current platform.
     *
     * @returns Promise that resolves with the cross-game identity entries. Resolves with an empty
     * array on platforms without cross-game identity.
     *
     * @remarks Currently only Yandex Games exposes cross-game identity. Other platforms resolve
     * with an empty array.
     *
     * @example
     * ```typescript
     * const identities = await Yes2SDK.player.getIDsPerGame();
     * identities.forEach(({ appId, userId }) => {
     *     console.log(`App ${appId}: ${userId}`);
     * });
     * ```
     */
    getIDsPerGame(): Promise<GameIdentity[]>;

    /**
     * Get the player's monetization / paying status.
     *
     * @returns Promise that resolves with the paying status. Resolves with `"unknown"` on platforms
     * that do not expose one.
     *
     * @example
     * ```typescript
     * const status = await Yes2SDK.player.getPayingStatus();
     * if (status === "paying") {
     *     // tailor offers for paying players
     * }
     * ```
     */
    getPayingStatus(): Promise<PayingStatus>;

    /**
     * Get the player's session / authorization mode.
     *
     * @returns Promise that resolves with the mode (`"lite"` for anonymous, `"authorized"` for
     * logged-in). Resolves with `"unknown"` on platforms that cannot determine it.
     *
     * @example
     * ```typescript
     * const mode = await Yes2SDK.player.getMode();
     * if (mode === "lite") {
     *     // prompt the player to log in to save progress
     * }
     * ```
     */
    getMode(): Promise<PlayerMode>;

    /**
     * Get the current player's profile photo URL at the requested size.
     *
     * @param size - Desired photo size. Defaults to `"medium"`.
     * @returns Promise that resolves with the photo URL, or `null` when no photo is available.
     *
     * @example
     * ```typescript
     * const photoUrl = await Yes2SDK.player.getPhoto("large");
     * ```
     */
    getPhoto(size?: PlayerPhotoSize): Promise<string | null>;

    /**
     * Get a platform-generated avatar for a bot or NPC player, for games that fill a lobby or
     * leaderboard with computer-controlled players.
     *
     * @param username - The bot's display name. It seeds the avatar, so the same name always gets
     * the same picture.
     * @param size - Desired avatar size. Defaults to `"medium"`.
     * @returns Promise that resolves with the avatar URL.
     *
     * @remarks Only Jest generates bot avatars. Elsewhere this rejects with FEATURE_NOT_SUPPORTED;
     * check {@link isBotAvatarSupported} first and use the game's own art as the fallback.
     *
     * @example
     * ```typescript
     * const avatarUrl = Yes2SDK.player.isBotAvatarSupported()
     *     ? await Yes2SDK.player.getBotAvatarAsync("RoboRita", "small")
     *     : "assets/bots/default.png";
     * ```
     */
    getBotAvatarAsync(username: string, size?: PlayerPhotoSize): Promise<string>;

    /**
     * Check if the current platform generates bot avatars (see {@link getBotAvatarAsync}).
     * @returns True if supported. False before initialization.
     */
    isBotAvatarSupported(): boolean;

    /**
     * Get connected players (friends) who also play this game.
     *
     * @returns Promise that resolves with an array of connected players.
     *
     * @remarks Not all platforms support connected players. Check `isConnectedPlayersSupported()`
     * before calling this method.
     *
     * @example
     * ```typescript
     * const friends = await Yes2SDK.player.getConnectedPlayers();
     * friends.forEach(friend => {
     *     console.log(`Friend: ${friend.name}`);
     * });
     * ```
     */
    getConnectedPlayers(): Promise<ConnectedPlayer[]>;

    /**
     * Alias for getConnectedPlayers() (engine-wrapper compatibility alias).
     * @returns Promise that resolves with an array of connected players.
     */
    getConnectedPlayersAsync(): Promise<ConnectedPlayer[]>;

    /**
     * Get player data from cloud storage.
     *
     * @param keys - Array of keys to retrieve, or a JSON string of keys.
     * @returns Promise that resolves with the requested data.
     *
     * @example
     * ```typescript
     * const data = await Yes2SDK.player.getDataAsync(['level', 'coins', 'inventory']);
     * console.log(`Level: ${data.level}`);
     * console.log(`Coins: ${data.coins}`);
     * ```
     */
    getDataAsync(keys: string[] | string): Promise<PlayerData>;

    /**
     * Save player data to cloud storage.
     *
     * @param data - Object containing key-value pairs to save.
     * @returns Promise that resolves when data is saved.
     *
     * @remarks Data is automatically synced to the platform's cloud storage. Use `flushDataAsync()`
     * to ensure data is persisted immediately.
     *
     * @example
     * ```typescript
     * await Yes2SDK.player.setDataAsync({
     *     level: 5,
     *     coins: 1000,
     *     inventory: ['sword', 'shield']
     * });
     * ```
     */
    setDataAsync(data: PlayerData | string): Promise<void>;

    /**
     * Flush pending data writes to ensure they are persisted.
     *
     * @returns Promise that resolves when data is flushed.
     *
     * @example
     * ```typescript
     * await Yes2SDK.player.setDataAsync({ score: 9999 });
     * await Yes2SDK.player.flushDataAsync(); // Ensure it's saved
     * ```
     */
    flushDataAsync(): Promise<void>;

    /**
     * Get signed player info for server-side verification.
     *
     * @param payload - Optional payload to include in the signature.
     * @returns Promise that resolves with signed player info.
     *
     * @remarks Use this for secure server-side verification of player identity.
     *
     * @example
     * ```typescript
     * const signedInfo = await Yes2SDK.player.getSignedPlayerInfoAsync('my-payload');
     * // Send signedInfo.signature to your server for verification
     * ```
     */
    getSignedPlayerInfoAsync(payload?: string): Promise<SignedPlayerInfo>;

    /**
     * Check if player data storage is available to the game.
     *
     * @returns True if data can be persisted.
     *
     * @remarks This reports whether save/load will work, NOT specifically whether the platform
     * offers cloud save. When the platform reports no data support, PlayerAPI transparently falls
     * back to local web storage (localStorage), so this method returns `true` as long as the SDK is
     * wired — games that gate save/load on this method will then actually persist. Support may
     * therefore be backed by local web storage rather than the platform's cloud save.
     */
    isDataSupported(): boolean;

    /**
     * Check if connected players are supported on the current platform.
     * @returns True if supported.
     */
    isConnectedPlayersSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Auth module API.
 */
export interface AuthAPI {
    /**
     * Get the current authenticated user.
     * @returns The current user or null if not authenticated.
     */
    getCurrentUser(): AuthUser | null;

    /**
     * Async alias for getCurrentUser() (engine-wrapper compatibility alias).
     * @returns Promise that resolves with the current user or null.
     */
    getCurrentUserAsync(): Promise<AuthUser | null>;

    /**
     * Alias for linkAccountAsync() (engine-wrapper compatibility alias). Uses platform default
     * provider.
     * @returns Promise that resolves when the account link prompt completes.
     */
    showAccountLinkPromptAsync(): Promise<void>;

    /**
     * Sign in the user.
     * @param provider - Optional authentication provider.
     * @returns Promise that resolves with the authenticated user.
     */
    signInAsync(provider?: AuthProvider): Promise<AuthUser>;

    /**
     * Sign out the current user.
     */
    signOutAsync(): Promise<void>;

    /**
     * Get the authentication token.
     * @returns Promise that resolves with the auth token.
     */
    getTokenAsync(): Promise<AuthToken>;

    /**
     * Link an additional account provider.
     * @param provider - Provider to link.
     */
    linkAccountAsync(provider: AuthProvider): Promise<void>;

    /**
     * Show the platform's registration prompt and get handlers for the game's own login and close
     * buttons. Throws FEATURE_NOT_SUPPORTED where the platform has no such prompt. Guests only: a
     * registered player is rejected with INVALID_OPERATION, and platforms may reject an invalid
     * custom message with INVALID_PARAM before the platform SDK is called.
     * @param options - Optional prompt options.
     * @returns Handlers for the game's login and close buttons.
     */
    showRegistrationPrompt(options?: RegistrationPromptOptions): RegistrationPromptHandle;

    /**
     * Check if the user is authenticated.
     * @returns True if authenticated.
     */
    isAuthenticated(): boolean;

    /**
     * Check if auth is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Data storage module API.
 */
export interface DataAPI {
    /**
     * Get an integer value from storage.
     *
     * @param key - The storage key.
     * @param defaultValue - Value to return if the key doesn't exist.
     * @returns The stored integer value, or defaultValue if not found.
     */
    getInt(key: string, defaultValue?: number): number;

    /**
     * Set an integer value in storage.
     *
     * @param key - The storage key.
     * @param value - The integer value to store.
     */
    setInt(key: string, value: number): void;

    /**
     * Get a float value from storage.
     *
     * @param key - The storage key.
     * @param defaultValue - Value to return if the key doesn't exist.
     * @returns The stored float value, or defaultValue if not found.
     */
    getFloat(key: string, defaultValue?: number): number;

    /**
     * Set a float value in storage.
     *
     * @param key - The storage key.
     * @param value - The float value to store.
     */
    setFloat(key: string, value: number): void;

    /**
     * Get a string value from storage.
     *
     * @param key - The storage key.
     * @param defaultValue - Value to return if the key doesn't exist.
     * @returns The stored string value, or defaultValue if not found.
     */
    getString(key: string, defaultValue?: string): string;

    /**
     * Set a string value in storage.
     *
     * @param key - The storage key.
     * @param value - The string value to store.
     */
    setString(key: string, value: string): void;

    /**
     * Check if a key exists in storage.
     *
     * @param key - The storage key.
     * @returns True if the key exists.
     */
    hasKey(key: string): boolean;

    /**
     * Delete a key from storage.
     *
     * @param key - The storage key to delete.
     */
    deleteKey(key: string): void;

    /**
     * Delete all keys from storage.
     */
    deleteAll(): void;

    /**
     * Set a string value in storage and await platform confirmation.
     *
     * @remarks On platforms with cloud-backed storage (CrazyGames, Yandex), the promise resolves
     * with `true` only after the platform confirms the write. On platforms backed by localStorage
     * (Poki, GameDistribution, YouTube) it resolves immediately with `true` unless the write throws
     * (e.g. quota exceeded), in which case it resolves with `false`.
     *
     * @param key - The storage key.
     * @param value - The string value to store.
     * @returns Promise resolving with success boolean.
     */
    setStringAsync(key: string, value: string): Promise<boolean>;

    /**
     * Set an integer value in storage and await platform confirmation.
     *
     * @param key - The storage key.
     * @param value - The integer value to store.
     * @returns Promise resolving with success boolean.
     */
    setIntAsync(key: string, value: number): Promise<boolean>;

    /**
     * Set a float value in storage and await platform confirmation.
     *
     * @param key - The storage key.
     * @param value - The float value to store.
     * @returns Promise resolving with success boolean.
     */
    setFloatAsync(key: string, value: number): Promise<boolean>;

    /**
     * Force a durable flush of all pending data to the platform's backing store.
     *
     * @remarks Synchronous `setInt`/`setString`/etc. writes may be batched (e.g. Yandex debounces
     * cloud writes to coalesce rapid changes). Call this at critical checkpoints — or before the
     * game may close — to await confirmation that everything is persisted. On platforms with no
     * pending batch (localStorage-backed, or a platform without batched writes) it resolves
     * immediately with `true`.
     *
     * @returns Promise that resolves with success boolean.
     */
    flushAsync(): Promise<boolean>;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Game lifecycle module API.
 */
export interface GameAPI {
    /**
     * Signal that gameplay has started. Call this when the player begins active gameplay (not
     * menus/loading).
     *
     * @remarks Idempotent: repeated calls are ignored. `analytics.logLevelStart()` shares the same
     * gameplay state, so calling both never signals the platform twice.
     */
    gameplayStart(): void;

    /**
     * Signal that gameplay has stopped. Call this when the player stops active gameplay (death,
     * pause, menu).
     *
     * @remarks Idempotent: repeated calls are ignored. `analytics.logLevelEnd()` shares the same
     * gameplay state.
     */
    gameplayStop(): void;

    /**
     * Signal a positive moment in the game. Used by platforms like Poki for engagement tracking
     * (level complete, etc.).
     */
    happyTime(): void;

    /**
     * Report the player's overall completion progress through the game.
     *
     * @remarks Best-effort, fire-and-forget signal used by platforms (currently CrazyGames) to feed
     * discovery and engagement systems. Platforms without a progression API silently no-op. Call it
     * as the player advances (e.g. after finishing a level or reaching a milestone) with a
     * monotonically increasing value.
     *
     * @param percentage - Completion percentage in the inclusive range 0–100. Values outside this
     * range (or non-finite values such as `NaN`/`Infinity`) are rejected with an `INVALID_PARAM`
     * error.
     *
     * @example
     * ```typescript
     * Yes2SDK.game.reportProgress(42); // player is 42% through the game
     * ```
     */
    reportProgress(percentage: number): void;

    /**
     * Attach metadata to player feedback reports.
     *
     * @remarks Best-effort, fire-and-forget signal used by platforms (currently CrazyGames) to
     * enrich player-reported feedback so studios can triage issues more easily (e.g.
     * `{ level: 12 }` tells you which level the player was on). Platforms without a feedback
     * context API silently no-op. To remove the context, call {@link GameAPI.clearGameContext} — do
     * not pass `null`.
     *
     * @param context - A plain, JSON-serializable metadata object. Rejected with an `INVALID_PARAM`
     * error if it is not a plain object (arrays and `null` are rejected), is not JSON-serializable
     * (e.g. contains circular references), or if its JSON serialization exceeds the CrazyGames
     * limit of 1000 characters.
     *
     * @example
     * ```typescript
     * Yes2SDK.game.setGameContext({ level: 12, mode: "hardcore" });
     * ```
     */
    setGameContext(context: Record<string, unknown>): void;

    /**
     * Remove any previously set feedback-report metadata.
     *
     * @remarks Best-effort, fire-and-forget signal. Clears the context set by
     * {@link GameAPI.setGameContext} (currently consumed by CrazyGames via
     * `game.clearGameContext`); platforms without a feedback context API silently no-op.
     *
     * @example
     * ```typescript
     * Yes2SDK.game.clearGameContext();
     * ```
     */
    clearGameContext(): void;

    /**
     * Generate an invite link with embedded parameters.
     *
     * @param paramsJson - JSON string of parameters to embed in the invite link.
     * @returns Promise that resolves with the invite link URL.
     */
    inviteLink(paramsJson: string): Promise<string>;

    /**
     * Get a parameter from the invite link that launched the game.
     *
     * @param key - The parameter key to retrieve.
     * @returns The parameter value, or empty string if not found.
     */
    getInviteParam(key: string): string;

    /**
     * Show a platform invite button with the given parameters.
     *
     * @param paramsJson - JSON string of parameters for the invite button.
     */
    showInviteButton(paramsJson: string): void;

    /**
     * Hide the platform invite button.
     */
    hideInviteButton(): void;

    /**
     * Report the game's current instant-multiplayer room state.
     *
     * @remarks Best-effort reporting signal for instant-multiplayer games — the game tells the
     * platform which room the player is in and whether other players may join. Currently consumed
     * by CrazyGames (`sdk.game.updateRoom`), which coalesces rapid calls so the platform's 250ms
     * throttle can never crash the game (latest state wins); platforms without instant multiplayer
     * silently no-op. Call it whenever the room's joinability or invite params change.
     *
     * @param roomId - Non-empty identifier of the room the player is in.
     * @param isJoinable - Whether other players may join the room.
     * @param inviteParams - Optional key-value params to embed in invite links generated for the
     * room. Rejected with an `INVALID_PARAM` error if it is not a plain object or any value is not
     * a string.
     *
     * @example
     * ```typescript
     * Yes2SDK.game.updateRoom("room-42", true, { mode: "coop" });
     * ```
     */
    updateRoom(roomId: string, isJoinable: boolean, inviteParams?: Record<string, string>): void;

    /**
     * Report that the player left the instant-multiplayer room.
     *
     * @remarks Best-effort reporting signal. Currently consumed by CrazyGames (`sdk.game.leftRoom`,
     * sharing the same 250ms throttle as {@link GameAPI.updateRoom}); platforms without instant
     * multiplayer no-op.
     */
    leftRoom(): void;

    /**
     * Whether the game was launched in instant-multiplayer mode.
     *
     * @remarks Reads CrazyGames' `game.isInstantMultiplayer`; returns `false` on platforms without
     * instant multiplayer.
     *
     * @returns True if the game was launched in instant-multiplayer mode.
     */
    isInstantMultiplayer(): boolean;

    /**
     * Get the invite params the game was launched with.
     *
     * @remarks Reads CrazyGames' `game.inviteParams`; returns `null` on platforms without invite
     * links, or when the game was not launched from an invite.
     *
     * @returns The startup invite params, or `null` when absent.
     */
    getInviteParams(): Record<string, string> | null;

    /**
     * Get platform-specific game settings.
     *
     * @returns JSON string of platform settings.
     */
    getSettings(): string;

    /**
     * Copy text to the user's clipboard.
     *
     * @param text - The text to copy.
     */
    copyToClipboard(text: string): void;

    /**
     * Get the current server time as Unix epoch milliseconds.
     *
     * @remarks On platforms with a tamper-proof server clock (e.g. Yandex) this returns
     * synchronized server time; on others it falls back to the local device clock (`Date.now()`).
     *
     * @returns Promise that resolves with Unix epoch milliseconds.
     */
    getServerTimeAsync(): Promise<number>;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Banners display module API.
 */
export interface BannersAPI {
    /**
     * Show a banner ad at the specified position.
     *
     * @param id - Unique identifier for the banner placement.
     * @param size - Size of the banner (e.g., '300x250', '728x90').
     * @param x - Optional X coordinate for custom positioning.
     * @param y - Optional Y coordinate for custom positioning.
     * @returns Promise that resolves when the banner is displayed.
     */
    showBanner(id: string, size: string, x?: number, y?: number): Promise<void>;

    /**
     * Show a responsive banner in a page container element.
     *
     * @remarks The platform measures the DOM element identified by `containerId` and auto-picks a
     * fitting banner size. This is currently a CrazyGames-specific capability; other platforms
     * reject with a `FEATURE_NOT_SUPPORTED` error. To clear a responsive banner, call
     * {@link BannersAPI.hideBanner} with the same container ID.
     *
     * @param containerId - The id of the DOM element to fill with the banner.
     * @returns Promise that resolves when the responsive banner is displayed.
     *
     * @example
     * ```typescript
     * await Yes2SDK.banners.showResponsiveBanner('banner-container');
     * // later
     * Yes2SDK.banners.hideBanner('banner-container');
     * ```
     */
    showResponsiveBanner(containerId: string): Promise<void>;

    /**
     * Hide a specific banner by its ID.
     *
     * @param id - The banner placement ID to hide.
     */
    hideBanner(id: string): void;

    /**
     * Hide all currently displayed banners.
     */
    hideAllBanners(): void;

    /**
     * Refresh all currently displayed banners.
     */
    refreshBanners(): void;

    /**
     * Query the current banner display status.
     *
     * @remarks On platforms with an explicit status API (e.g. Yandex sticky banners) this reflects
     * the live SDK state and may include a platform-supplied reason. Platforms without a status API
     * resolve to `{ isShowing: false }`.
     *
     * @returns Promise resolving to the current banner status.
     */
    getBannerStatusAsync(): Promise<BannerStatus>;

    /**
     * Check if banners are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Friends module API.
 */
export interface FriendsAPI {
    /**
     * List friends who also play this game.
     *
     * @param page - The page number to retrieve (0-based).
     * @param size - The number of friends per page.
     * @returns Promise that resolves with the friends result.
     */
    listFriendsAsync(page: number, size: number): Promise<FriendsResult>;

    /**
     * Check if friends is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Score module API.
 */
export interface ScoreAPI {
    /**
     * Add a score value.
     *
     * @param score - The score value to add.
     */
    addScore(score: number): void;

    /**
     * Submit an encrypted score for anti-cheat verification.
     *
     * @param encryptedScore - The encrypted score string.
     */
    submitScore(encryptedScore: string): void;

    /**
     * Check if score submission is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * IAP module API.
 */
export interface IAPAPI {
    /**
     * Get the product catalog.
     *
     * @returns Promise that resolves with available products.
     *
     * @example
     * ```typescript
     * const products = await Yes2SDK.iap.getCatalogAsync();
     * products.forEach(product => {
     *     console.log(`${product.title}: ${product.price}`);
     * });
     * ```
     */
    getCatalogAsync(): Promise<Product[]>;

    /**
     * Get a specific product by ID.
     *
     * @param productId - Product identifier.
     * @returns Promise that resolves with the product, or null if not found.
     *
     * @example
     * ```typescript
     * const product = await Yes2SDK.iap.getProductAsync('gold_100');
     * if (product) {
     *     showPurchaseDialog(product);
     * }
     * ```
     */
    getProductAsync(productId: string): Promise<Product | null>;

    /**
     * Initiate a purchase.
     *
     * @remarks On platforms with first-party analytics, a successful purchase is also reported to
     * analytics automatically. The price is the one the platform says was paid
     * (`Purchase.priceAmount`, Jest), else the catalog entry this module already returned
     * (`getCatalogAsync` or `getProductAsync`). Load the catalog before selling on platforms that
     * do not report the paid price; without any price the report is skipped. Sandbox and zero-price
     * purchases are never reported. The report never delays or changes the purchase result.
     *
     * @param config - Purchase configuration.
     * @returns Promise that resolves with the purchase.
     *
     * @example
     * ```typescript
     * try {
     *     const purchase = await Yes2SDK.iap.purchaseAsync({
     *         productId: 'gold_100',
     *         developerPayload: 'user_123'
     *     });
     *     grantGold(100);
     *     await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
     * } catch (error) {
     *     console.log('Purchase failed:', error.message);
     * }
     * ```
     */
    purchaseAsync(config: PurchaseConfig): Promise<Purchase>;

    /**
     * Get all unconsumed purchases.
     *
     * @returns Promise that resolves with purchases.
     *
     * @remarks Use this to restore purchases or check for unconsumed items.
     *
     * @example
     * ```typescript
     * const purchases = await Yes2SDK.iap.getPurchasesAsync();
     * for (const purchase of purchases) {
     *     grantProduct(purchase.productId);
     *     await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
     * }
     * ```
     */
    getPurchasesAsync(): Promise<Purchase[]>;

    /**
     * Consume a purchase (for consumable products).
     *
     * @param purchaseToken - Token of the purchase to consume.
     * @returns Promise that resolves when consumed.
     *
     * @remarks Always consume purchases after granting the item to the player.
     *
     * @example
     * ```typescript
     * await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
     * ```
     */
    consumePurchaseAsync(purchaseToken: string): Promise<void>;

    /**
     * Get subscription status.
     *
     * @param productId - Subscription product ID.
     * @returns Promise that resolves with subscription status.
     *
     * @remarks On platforms that list subscriptions (Jest), an unknown product id rejects with
     * `IAP_NOT_AVAILABLE` for a registered player rather than reporting inactive. A guest is
     * reported as `{ isActive: false }` for any product id, because Jest lists no subscriptions for
     * guests.
     *
     * @example
     * ```typescript
     * const status = await Yes2SDK.iap.getSubscriptionStatusAsync('premium_monthly');
     * if (status.isActive) {
     *     enablePremiumFeatures();
     * }
     * ```
     */
    getSubscriptionStatusAsync(productId: string): Promise<SubscriptionStatus>;

    /**
     * List subscription offers with the player's entitlement.
     *
     * @returns Promise that resolves with the subscriptions. Grant access when `isActive` is true.
     * @throws FEATURE_NOT_SUPPORTED when the platform has no subscriptions.
     *
     * @remarks Jest returns an empty list for guests, so do not build offer UI for guests from this
     * list.
     */
    getSubscriptionsAsync(): Promise<Subscription[]>;

    /**
     * Start a subscription checkout.
     *
     * @param productId - Subscription product ID.
     * @returns `{ status: "subscribed", subscription }`, or `{ status: "cancelled" }` when the
     * player closes checkout.
     * @remarks Guests get a PLAYER_NOT_AUTHENTICATED error.
     */
    subscribeAsync(productId: string): Promise<SubscribeResult>;

    /**
     * Ask the platform to cancel a subscription.
     *
     * @param productId - Subscription product ID.
     * @returns True when the player confirmed the cancellation, false when they dismissed the
     * dialog.
     */
    cancelSubscriptionAsync(productId: string): Promise<boolean>;

    /**
     * Claim the one-time retention discount for a subscription.
     *
     * @param productId - Subscription product ID.
     * @returns Promise that resolves with the refreshed subscription.
     */
    claimRetentionOfferAsync(productId: string): Promise<Subscription>;

    /**
     * Check if IAP is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Check if subscriptions are supported on the current platform.
     * @returns True if supported.
     */
    isSubscriptionSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Leaderboard module API.
 */
export interface LeaderboardAPI {
    /**
     * Get a leaderboard by name.
     *
     * @param name - Leaderboard name/identifier.
     * @returns Promise that resolves with the leaderboard.
     *
     * @example
     * ```typescript
     * const leaderboard = await Yes2SDK.leaderboard.getLeaderboardAsync('weekly-scores');
     * console.log(`Entries: ${leaderboard.entries.length}`);
     * ```
     */
    getLeaderboardAsync(name: string): Promise<Leaderboard>;

    /**
     * Submit a score to a leaderboard.
     *
     * @param name - Leaderboard name/identifier.
     * @param score - Score to submit.
     * @param metadata - Optional metadata to attach.
     * @returns Promise that resolves with the player's entry.
     *
     * @example
     * ```typescript
     * const entry = await Yes2SDK.leaderboard.setScoreAsync('high-scores', 9999);
     * console.log(`Your rank: ${entry.rank}`);
     * ```
     */
    setScoreAsync(name: string, score: number, metadata?: string): Promise<LeaderboardEntry>;

    /**
     * Get leaderboard entries.
     *
     * @param name - Leaderboard name/identifier.
     * @param count - Number of entries to fetch (default: 10).
     * @param offset - Offset from the top (default: 0).
     * @returns Promise that resolves with entries.
     *
     * @example
     * ```typescript
     * // Get top 10
     * const top10 = await Yes2SDK.leaderboard.getEntriesAsync('high-scores', 10);
     *
     * // Get entries 11-20
     * const next10 = await Yes2SDK.leaderboard.getEntriesAsync('high-scores', 10, 10);
     * ```
     */
    getEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>;

    /**
     * Get the current player's leaderboard entry.
     *
     * @param name - Leaderboard name/identifier.
     * @returns Promise that resolves with the player's entry, or null if not ranked.
     *
     * @example
     * ```typescript
     * const myEntry = await Yes2SDK.leaderboard.getPlayerEntryAsync('high-scores');
     * if (myEntry) {
     *     console.log(`Your rank: ${myEntry.rank}, Score: ${myEntry.score}`);
     * }
     * ```
     */
    getPlayerEntryAsync(name: string): Promise<LeaderboardEntry | null>;

    /**
     * Get leaderboard entries for connected players (friends).
     *
     * @param name - Leaderboard name/identifier.
     * @param count - Number of entries to fetch (default: 10).
     * @param offset - Offset (default: 0).
     * @returns Promise that resolves with friend entries.
     *
     * @example
     * ```typescript
     * const friendScores = await Yes2SDK.leaderboard.getConnectedPlayerEntriesAsync('high-scores');
     * friendScores.forEach(entry => {
     *     console.log(`${entry.playerName}: ${entry.score}`);
     * });
     * ```
     */
    getConnectedPlayerEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>;

    /**
     * Check if leaderboards are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Stats module API.
 */
export interface StatsAPI {
    /**
     * Get stats by keys.
     * @param keys - Stat keys to retrieve.
     * @returns Promise that resolves with stats.
     */
    getStatsAsync(keys: string[]): Promise<Record<string, number>>;

    /**
     * Set stats.
     * @param stats - Stats to set as name-value pairs.
     */
    setStatsAsync(stats: Record<string, number>): Promise<void>;

    /**
     * Increment stats.
     * @param increments - Stats to increment as name-delta pairs.
     * @returns Promise that resolves with updated stats.
     */
    incrementStatsAsync(increments: Record<string, number>): Promise<Record<string, number>>;

    /**
     * Check if stats are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Config module API.
 */
export interface ConfigAPI {
    /**
     * Get remote feature flags.
     * @param options - Optional defaults and client features for flag resolution.
     * @returns Promise that resolves with the flag map.
     */
    getFlagsAsync(options?: GetFlagsOptions): Promise<ConfigFlags>;

    /**
     * Check if remote configuration is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Review module API.
 */
export interface ReviewAPI {
    /**
     * Check whether the player can currently be shown the rating prompt.
     * @returns Promise that resolves with the eligibility result.
     */
    canReviewAsync(): Promise<ReviewEligibility>;

    /**
     * Request the in-game rating / feedback prompt.
     * @returns Promise that resolves with the review result.
     */
    requestReviewAsync(): Promise<ReviewResult>;

    /**
     * Check if the rating prompt is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Achievements module API.
 */
export interface AchievementsAPI {
    /**
     * Get all achievements.
     * @returns Promise that resolves with achievements.
     */
    getAchievementsAsync(): Promise<Achievement[]>;

    /**
     * Unlock an achievement.
     * @param achievementId - Achievement identifier.
     */
    unlockAsync(achievementId: string): Promise<void>;

    /**
     * Set achievement progress.
     * @param achievementId - Achievement identifier.
     * @param progress - Progress value (0-100).
     */
    setProgressAsync(achievementId: string, progress: number): Promise<void>;

    /**
     * Check if achievements are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Tournament module API.
 */
export interface TournamentAPI {
    /**
     * Get the current tournament.
     * @returns Promise that resolves with the current tournament or null.
     */
    getCurrentAsync(): Promise<Tournament | null>;

    /**
     * Get all available tournaments.
     * @returns Promise that resolves with tournaments.
     */
    getAllAsync(): Promise<Tournament[]>;

    /**
     * Create a new tournament.
     * @param options - Tournament creation options.
     * @returns Promise that resolves with the created tournament.
     */
    createAsync(options: CreateTournamentOptions): Promise<Tournament>;

    /**
     * Post a score to the current tournament.
     * @param score - Score to post.
     */
    postScoreAsync(score: number): Promise<void>;

    /**
     * Share the tournament with a score.
     * @param score - Score to share.
     * @param data - Optional data payload.
     */
    shareAsync(score: number, data?: Record<string, unknown>): Promise<void>;

    /**
     * Join a tournament.
     * @param tournamentId - Tournament ID to join.
     */
    joinAsync(tournamentId: string): Promise<void>;

    /**
     * Check if tournaments are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Context module API.
 */
export interface ContextAPI {
    /**
     * Get the current context.
     * @returns The current context object.
     */
    getContext(): Context;

    /**
     * Get the context type.
     * @returns The context type.
     */
    getType(): ContextType;

    /**
     * Get players in the current context.
     * @returns Promise that resolves with context players.
     */
    getPlayersAsync(): Promise<ContextPlayer[]>;

    /**
     * Switch to a different context.
     * @param contextId - ID of the context to switch to.
     */
    switchAsync(contextId: string): Promise<void>;

    /**
     * Show context chooser dialog.
     * @param options - Options for choosing a context.
     */
    chooseAsync(options?: ChooseContextOptions): Promise<void>;

    /**
     * Create a new context with a specific player.
     * @param playerId - ID of the player to create context with.
     */
    createAsync(playerId: string): Promise<void>;

    /**
     * Check if context size is within range.
     * @param min - Minimum size.
     * @param max - Maximum size.
     * @returns Size check result.
     */
    isSizeBetween(min: number, max: number): ContextSizeResult;

    /**
     * Share to the current context.
     * @param payload - Share payload.
     */
    shareAsync(payload: SharePayload): Promise<void>;

    /**
     * Send an update to the current context.
     * @param payload - Update payload.
     */
    updateAsync(payload: UpdatePayload): Promise<void>;

    /**
     * Check if context is supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Notifications module API.
 */
export interface NotificationsAPI {
    /**
     * Schedule a notification.
     * @param options - Notification options.
     * @returns Promise that resolves with the scheduled notification.
     */
    scheduleAsync(options: ScheduleNotificationOptions): Promise<ScheduledNotification>;

    /**
     * Cancel a scheduled notification.
     * @param notificationId - Notification identifier.
     */
    cancelAsync(notificationId: string): Promise<void>;

    /**
     * Cancel all scheduled notifications.
     */
    cancelAllAsync(): Promise<void>;

    /**
     * Check if the player can subscribe to the bot.
     * @returns Promise that resolves with true if can subscribe.
     */
    canSubscribeBotAsync(): Promise<boolean>;

    /**
     * Subscribe to the bot for notifications.
     */
    subscribeBotAsync(): Promise<void>;

    /**
     * Check if notifications are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * Referrals module API.
 */
export interface ReferralsAPI {
    /**
     * Open the platform share dialog with a referral link.
     *
     * @param options - Share options. `reference` is required. `onboardingSlug` and
     * `notificationTemplates` are Jest options; they are validated here so a malformed value fails
     * with INVALID_PARAM instead of a platform error.
     * @returns Promise that resolves with `{ canceled }`.
     *
     * @example
     * ```typescript
     * await Yes2SDK.referrals.shareAsync({
     *     reference: "unlock_party_mode_v1",
     *     text: "Join me, I want to unlock Party Mode.",
     *     notificationTemplates: [
     *         { minConversionCount: 1, variants: [{ body: "A friend joined!", ctaText: "Play" }] },
     *     ],
     * });
     * ```
     */
    shareAsync(options: ShareReferralOptions): Promise<{ canceled: boolean }>;

    /**
     * List the current player's referral conversions, grouped by reference.
     * @returns Promise that resolves with the referral list.
     */
    listAsync(): Promise<ReferralList>;

    /**
     * Check if referrals are supported on the current platform.
     * @returns True if supported.
     */
    isSupported(): boolean;

    /**
     * Whether this module is connected to a platform implementation (true once `initializeAsync`
     * has finished).
     * @returns True once the module is ready.
     */
    isAvailable(): boolean;
}

/**
 * SDK initialization options.
 */
export interface InitializationOptions {
    /**
     * Enable debug mode for additional logging.
     * @default false
     */
    debug?: boolean;

    /**
     * Skip automatic platform SDK initialization. When true, you must manually initialize the
     * platform SDK.
     * @default false
     */
    manualInit?: boolean;

    /**
     * Custom game ID override. Some platforms allow specifying a custom game identifier.
     */
    gameId?: string;

    /**
     * Skip ad preloading during initialization.
     * @default false
     */
    skipAdPreload?: boolean;

    /**
     * Ads configuration (e.g. auto preroll). Merged with `window.__yes2sdkConfig.ads`; values here
     * take precedence.
     */
    ads?: AdsConfig;
}

/**
 * Platform identifier for supported gaming platforms.
 *
 * @remarks Each platform has a unique identifier used throughout the SDK to determine
 * platform-specific behavior.
 */
export type Platform =
    | "facebook"
    | "yandex"
    | "poki"
    | "crazygames"
    | "gamedistribution"
    | "youtube"
    | "jest"
    | "debug"
    | "portal";

/**
 * SDK events that can be subscribed to.
 */
export interface SDKEvents {
    initialized: { platform: Platform };
    gameStarted: void;
    error: { context: string; error: unknown };
    loadingProgress: { progress: number };
    /**
     * Fired when the platform requests the game to pause (user backgrounded the game, opened the
     * platform overlay, etc.). Required by YouTube Playables. On platforms without a native signal,
     * falls back to document.visibilitychange.
     */
    pause: void;
    /**
     * Fired when the platform allows the game to resume. Resumption is not guaranteed — the game
     * may receive pause without a matching resume.
     */
    resume: void;
    /**
     * Fired when the platform's audio-enabled state changes (user muted/unmuted via platform UI).
     * Required by YouTube Playables. The game MUST update its audio state to match. Only emitted on
     * platforms that expose a native signal.
     */
    audioEnabledChange: { enabled: boolean };
    /**
     * Fired when the platform's account-selection dialog opens. Yandex-only
     * (ACCOUNT_SELECTION_DIALOG_OPENED); no-op on all other platforms. Games typically pause
     * gameplay/audio while the dialog is open.
     */
    accountDialogOpen: void;
    /**
     * Fired when the platform starts its exit flow (back navigation, platform close control). The
     * player has not confirmed yet: do not tear the game down. Save recent progress synchronously
     * inside the handler (for example `Yes2SDK.data.setString`); Yes2SDK flushes the data store
     * right after the handler returns and the platform waits for that flush where it can. Async
     * work started in the handler is not awaited. Jest-only today; no-op on other platforms.
     */
    exitRequested: void;
    /**
     * Fired when the platform's account-selection dialog closes. Yandex-only
     * (ACCOUNT_SELECTION_DIALOG_CLOSED); no-op on all other platforms. Games typically resume
     * gameplay/audio once the dialog is closed.
     */
    accountDialogClose: void;
    /**
     * Fired when the platform reports the signed-in user changed during gameplay (login or logout).
     * CrazyGames-only (`user.addAuthListener`); no-op on all other platforms. `user` carries the
     * mapped Yes2SDK user, or `null` when the player signed out. Games typically refresh any UI
     * that shows the player's name/avatar and re-read player identity.
     */
    authStateChanged: { user: AuthUser | null };
    /**
     * Fired when an invited player accepts an invite and joins the game's instant-multiplayer room
     * while the game is running. CrazyGames-only (`game.addJoinRoomListener`); no-op on all other
     * platforms. `inviteParams` carries the joining player's invite params so the game can place
     * them into the current match.
     */
    invitedPlayerJoined: { inviteParams: Record<string, string> };
}

/**
 * Standardized error message structure used throughout Yes2SDK.
 *
 * @remarks All errors in the SDK follow this structure to provide consistent error handling and
 * debugging information.
 */
export interface ErrorMessage {
    /**
     * The error code identifying the type of error.
     * @see ErrorCodeType
     */
    code: ErrorCodeType;

    /**
     * Human-readable error message describing what went wrong.
     */
    message: string;

    /**
     * The API context where the error occurred. Typically the API method name.
     */
    context: string;

    /**
     * URL to documentation for this error (if available).
     */
    url?: string;

    /**
     * Original error from the platform SDK (if available).
     */
    originalError?: unknown;
}

/**
 * Type for error codes.
 */
export type ErrorCodeType =
    | "INITIALIZATION_ERROR"
    | "CLIENT_UNSUPPORTED"
    | "NOT_INITIALIZED"
    | "INVALID_PARAM"
    | "INVALID_OPERATION"
    | "NETWORK_FAILURE"
    | "TIMEOUT"
    | "PLATFORM_ERROR"
    | "PLATFORM_NOT_SUPPORTED"
    | "FEATURE_NOT_SUPPORTED"
    | "ADS_NOT_LOADED"
    | "ADS_NO_FILL"
    | "ADS_BLOCKED"
    | "ADS_FREQUENCY_LIMITED"
    | "PLAYER_NOT_AUTHENTICATED"
    | "PLAYER_DATA_CORRUPTED"
    | "STORAGE_ERROR"
    | "STORAGE_QUOTA_EXCEEDED"
    | "IAP_NOT_AVAILABLE"
    | "IAP_PURCHASE_FAILED"
    | "IAP_PURCHASE_CANCELLED"
    | "IAP_ALREADY_PURCHASED"
    | "LEADERBOARD_NOT_FOUND"
    | "UNKNOWN_ERROR";

/**
 * Ads configuration for the SDK.
 *
 * @remarks Typically injected by the dashboard bundler via `window.__yes2sdkConfig.ads`, but may
 * also be passed directly to {@link InitializationOptions}. Options passed to `initializeAsync`
 * take precedence over the injected config.
 */
export interface AdsConfig {
    /**
     * Automatically show an interstitial ad as soon as the platform SDK is ready, without the game
     * having to call anything. Skipped on platforms that do not support interstitials, and never
     * blocks initialization.
     * @default false
     */
    preroll?: boolean;

    /**
     * Placement identifier used for the auto preroll ad (analytics tracking).
     * @default "preroll"
     */
    prerollPlacement?: string;
}

/**
 * Callbacks for ad events.
 *
 * @remarks Delivery guarantee (enforced by the SDK for every platform):
 *
 * - **Rewarded ads** always end with **exactly one** of `adViewed`, `adDismissed` or `noFill`,
 * followed by **exactly one** `afterAd`. `afterAd` is the last callback. An ambiguous platform
 * result is reported as `adDismissed`, never `adViewed`, so grant rewards only in `adViewed`.
 * - **Interstitial ads** always end with **exactly one** `afterAd`. When the ad fails, `noFill` is
 * called first, then `afterAd`.
 *
 * Callbacks the platform sends after `afterAd` (or duplicates) are dropped.
 */
export interface AdCallbacks {
    /**
     * Called before the ad starts showing (pause game here).
     */
    beforeAd?: () => void;

    /**
     * Called exactly once after the ad finishes, whatever the result (resume game here). Always the
     * last callback; for rewarded ads it follows the single outcome callback.
     */
    afterAd?: () => void;

    /**
     * Rewarded ads: called when the user did not earn the reward (closed the ad early) or the
     * platform result was ambiguous. Do not grant a reward.
     */
    adDismissed?: () => void;

    /**
     * Rewarded ads: called when the user watched the full ad. The only callback in which a reward
     * should be granted.
     */
    adViewed?: () => void;

    /**
     * Called when no ad could be shown (no fill, ad blocker or request failure). For rewarded ads
     * this is the outcome; do not grant a reward.
     */
    noFill?: () => void;
}

/**
 * Banner ad position options.
 */
export type BannerPosition = "top" | "bottom";

/**
 * Device orientation options.
 */
export type DeviceOrientation = "portrait" | "landscape";

/**
 * Device types.
 */
export type DeviceType = "desktop" | "mobile" | "tablet" | "tv" | "unknown";

/**
 * Rich device information.
 *
 * @remarks `type` reuses {@link DeviceType} (which adds `"unknown"` for environments where no
 * device signal is available); the boolean flags reflect the four primary categories. At most one
 * of `isMobile` / `isDesktop` / `isTablet` / `isTV` is `true` (all `false` when `type` is
 * `"unknown"`).
 */
export interface DeviceInfo {
    /**
     * The resolved device type.
     */
    readonly type: DeviceType;

    /**
     * True if the device is a phone-class mobile device.
     */
    readonly isMobile: boolean;

    /**
     * True if the device is a desktop/laptop computer.
     */
    readonly isDesktop: boolean;

    /**
     * True if the device is a tablet.
     */
    readonly isTablet: boolean;

    /**
     * True if the device is a TV / large-screen device.
     */
    readonly isTV: boolean;
}

/**
 * Entry point data passed when launching the game.
 */
export type EntryPointData = Record<string, unknown>;

/**
 * Traffic source information.
 */
export interface TrafficSource {
    /**
     * The referring URL or domain.
     */
    readonly referrer: string | null;

    /**
     * UTM campaign parameter.
     */
    readonly utmCampaign: string | null;

    /**
     * UTM source parameter.
     */
    readonly utmSource: string | null;

    /**
     * UTM medium parameter.
     */
    readonly utmMedium: string | null;
}

/**
 * Analytics event parameters.
 */
export type AnalyticsParameters = Record<string, string | number | boolean>;

/**
 * Represents a player in the game.
 */
export interface Player {
    /**
     * Unique player identifier.
     */
    readonly id: string;

    /**
     * Player's display name, or null if not available.
     */
    readonly name: string | null;

    /**
     * URL to player's profile photo, or null if not available.
     */
    readonly photo: string | null;
}

/**
 * Cross-game identity entry returned by {@link Player} identity lookups.
 *
 * @remarks Mirrors a single element of Yandex `player.getIDsPerGame()`, mapping a platform app to
 * the player's stable per-game user id. Lets a developer who owns several games on the same
 * platform recognize a returning player.
 */
export interface GameIdentity {
    /**
     * Platform application id that owns this user id.
     */
    readonly appId: number;

    /**
     * The player's stable user id within that application.
     */
    readonly userId: string;
}

/**
 * Player monetization / paying status.
 *
 * @remarks Mirrors Yandex `player.getPayingStatus()`. Platforms that do not expose a paying status
 * report `"unknown"`.
 */
export type PayingStatus = "paying" | "partially_paying" | "not_paying" | "unknown";

/**
 * Player session / authorization mode.
 *
 * @remarks Mirrors Yandex `player.getMode()`. `"lite"` is an anonymous (non-logged-in) player,
 * `"authorized"` is a logged-in player with a platform account. Platforms that cannot determine the
 * mode report `"unknown"`.
 */
export type PlayerMode = "lite" | "authorized" | "unknown";

/**
 * Supported sizes for a player's profile photo.
 */
export type PlayerPhotoSize = "small" | "medium" | "large";

/**
 * Represents a connected player (friend).
 */
export interface ConnectedPlayer {
    /**
     * Unique player identifier.
     */
    readonly id: string;

    /**
     * Player's display name, or null if not available.
     */
    readonly name: string | null;

    /**
     * URL to player's profile photo, or null if not available.
     */
    readonly photo: string | null;
}

/**
 * Player data storage entry.
 */
export type PlayerData = Record<string, unknown>;

/**
 * Signed player information for server-side verification.
 */
export interface SignedPlayerInfo {
    /**
     * The player's unique identifier.
     */
    readonly playerId: string;

    /**
     * The cryptographic signature for verification.
     */
    readonly signature: string;
}

/**
 * Authenticated user information.
 */
export interface AuthUser {
    /**
     * Unique user identifier.
     */
    readonly id: string;

    /**
     * Display name, or null if not available.
     */
    readonly name: string | null;

    /**
     * Email address, or null if not available.
     */
    readonly email: string | null;

    /**
     * Profile photo URL, or null if not available.
     */
    readonly photo: string | null;

    /**
     * Authentication provider used.
     */
    readonly provider: AuthProvider;

    /**
     * Whether the user is authenticated (vs anonymous).
     */
    readonly isAuthenticated: boolean;
}

/**
 * Authentication provider types.
 */
export type AuthProvider = "facebook" | "google" | "apple" | "platform" | "anonymous";

/**
 * Authentication token information.
 */
export interface AuthToken {
    /**
     * The access token.
     */
    readonly accessToken: string;

    /**
     * Token expiration time (Unix timestamp in ms).
     */
    readonly expiresAt: number;

    /**
     * Refresh token, if available.
     */
    readonly refreshToken?: string;
}

/**
 * Options for a platform registration prompt.
 */
export interface RegistrationPromptOptions {
    readonly theme?: "light" | "dark";
    /**
     * Data available via session.getEntryPointData() after the player registers.
     */
    readonly data?: Record<string, unknown>;
    /**
     * Pre-filled message; must contain {{registrationCode}} once (platform-specific).
     */
    readonly message?: string;
    readonly onClose?: () => void;
}

/**
 * Handlers the game wires into its own registration UI.
 */
export interface RegistrationPromptHandle {
    readonly login: () => void;
    readonly close: () => void;
}

/**
 * Status of the currently displayed banner(s) on the platform.
 *
 * @remarks Returned by {@link BannersAPI.getBannerStatusAsync}. On platforms that expose an
 * explicit status query (e.g. Yandex `getBannerAdvStatus()`) the `isShowing` flag reflects the live
 * SDK state and `reason` carries the platform-supplied reason a banner is not showing. On platforms
 * without a status API this resolves to `{ isShowing: false }`.
 */
export interface BannerStatus {
    /**
     * Whether a banner is currently being displayed.
     */
    isShowing: boolean;

    /**
     * Optional platform-supplied reason a banner is not showing (e.g. Yandex
     * `'ADV_IS_NOT_CONNECTED'` or `'UNKNOWN'`).
     */
    reason?: string;
}

/**
 * Result from listing friends.
 */
export interface FriendsResult {
    /**
     * Array of friends on the current page.
     */
    friends: Friend[];

    /**
     * Whether there are more pages available.
     */
    hasMore: boolean;
}

/**
 * A product available for purchase.
 */
export interface Product {
    /**
     * Unique product identifier.
     */
    readonly productId: string;

    /**
     * Display title of the product.
     */
    readonly title: string;

    /**
     * Description of the product.
     */
    readonly description: string;

    /**
     * URL to the product image.
     */
    readonly imageUri: string;

    /**
     * Formatted price string (e.g., "$4.99").
     */
    readonly price: string;

    /**
     * ISO 4217 currency code (e.g., "USD").
     */
    readonly priceCurrencyCode: string;

    /**
     * Numeric price in major currency units (e.g., 4.99 for "$4.99"), when the platform reports
     * one. Jest and Yandex both report whole-unit decimals.
     */
    readonly priceAmount?: number;
}

/**
 * Configuration for initiating a purchase.
 */
export interface PurchaseConfig {
    /**
     * Product ID to purchase.
     */
    readonly productId: string;

    /**
     * Optional developer payload for verification.
     */
    readonly developerPayload?: string;
}

/**
 * A completed purchase.
 */
export interface Purchase {
    /**
     * Unique purchase token for verification.
     */
    readonly purchaseToken: string;

    /**
     * Product that was purchased.
     */
    readonly productId: string;

    /**
     * Payment identifier from the platform.
     */
    readonly paymentId: string;

    /**
     * ISO 8601 timestamp of the purchase.
     */
    readonly purchaseTime: string;

    /**
     * Optional developer payload passed during purchase.
     */
    readonly developerPayload?: string;

    /**
     * Signed request for server verification (platform-specific).
     */
    readonly signedRequest?: string;

    /**
     * True when no real money changed hands (sandbox tester or platform simulator). Grant the item
     * as usual, but keep it out of revenue reporting.
     */
    readonly isSandbox?: boolean;

    /**
     * Price the player actually paid, in major currency units (e.g., 4.99), when the platform
     * reports it with the purchase (Jest). Absent elsewhere; use the catalog `Product.priceAmount`
     * instead.
     */
    readonly priceAmount?: number;

    /**
     * ISO 4217 currency code of {@link Purchase.priceAmount} (e.g., "USD"), when the platform
     * reports it with the purchase (Jest).
     */
    readonly priceCurrencyCode?: string;
}

/**
 * Subscription status information.
 */
export interface SubscriptionStatus {
    /**
     * Whether the subscription is currently active.
     */
    readonly isActive: boolean;

    /**
     * Product ID of the subscription.
     */
    readonly productId: string;

    /**
     * Expiration timestamp (Unix timestamp in ms).
     */
    readonly expiresAt?: number;

    /**
     * Whether auto-renewal is enabled.
     */
    readonly willRenew?: boolean;
}

/**
 * A subscription offer plus the current player's entitlement for it.
 */
export interface Subscription {
    readonly productId: string;
    readonly title: string;
    readonly description: string;
    /**
     * Formatted price, e.g. "4.99 USD".
     */
    readonly price: string;
    readonly priceAmount: number;
    readonly priceCurrencyCode: string;
    readonly billingPeriod: "weekly" | "monthly" | "yearly";
    /**
     * Grant the entitlement when true.
     */
    readonly isActive: boolean;
    /**
     * Show "start free trial" copy only when true.
     */
    readonly trialEligible: boolean;
    readonly introOffer: { readonly priceAmount: number; readonly durationPeriods: number } | null;
    readonly retentionOffer: { readonly priceAmount: number; readonly durationPeriods: number } | null;
    readonly isSandbox?: boolean;
    /**
     * Platform-signed payload for server verification.
     */
    readonly signedRequest?: string;
}

/**
 * Outcome of starting a subscription checkout.
 */
export type SubscribeResult =
    | { readonly status: "subscribed"; readonly subscription: Subscription }
    | { readonly status: "cancelled" };

/**
 * Leaderboard information.
 */
export interface Leaderboard {
    /**
     * Leaderboard name/identifier.
     */
    readonly name: string;

    /**
     * Context ID if this is a context-specific leaderboard.
     */
    readonly contextId: string | null;

    /**
     * Entries on this leaderboard.
     */
    readonly entries: LeaderboardEntry[];
}

/**
 * A single entry on a leaderboard.
 */
export interface LeaderboardEntry {
    /**
     * Player's rank on the leaderboard (1-indexed).
     */
    readonly rank: number;

    /**
     * Unique player identifier.
     */
    readonly playerId: string;

    /**
     * Player's display name.
     */
    readonly playerName: string;

    /**
     * URL to player's profile photo, or null if not available.
     */
    readonly playerPhoto: string | null;

    /**
     * Raw score value.
     */
    readonly score: number;

    /**
     * Formatted score string for display.
     */
    readonly formattedScore: string;

    /**
     * Timestamp when the score was recorded (Unix timestamp in ms).
     */
    readonly timestamp: number;

    /**
     * Optional metadata attached to this entry.
     */
    readonly metadata?: string;
}

/**
 * Options for fetching feature flags.
 */
export interface GetFlagsOptions {
    /**
     * Default values returned for flags that are not configured remotely. On platforms without a
     * remote-config service, these are returned as-is.
     */
    defaults?: Record<string, string>;

    /**
     * Client features used by the platform to resolve segment-targeted flags.
     */
    clientFeatures?: Array<{ name: string; value: string }>;
}

/**
 * A flat map of feature-flag names to their string values.
 */
export type ConfigFlags = Record<string, string>;

/**
 * Whether the player can currently be shown the rating prompt.
 */
export interface ReviewEligibility {
    /**
     * True if the review prompt may be requested.
     */
    readonly canReview: boolean;

    /**
     * Optional reason the prompt is unavailable (platform-defined code).
     */
    readonly reason?: string;
}

/**
 * Result of a review request.
 */
export interface ReviewResult {
    /**
     * True if the player submitted feedback / completed the rating flow.
     */
    readonly feedbackSent: boolean;
}

/**
 * An achievement definition.
 */
export interface Achievement {
    /**
     * Unique achievement identifier.
     */
    readonly id: string;

    /**
     * Display name of the achievement.
     */
    readonly name: string;

    /**
     * Description of how to earn the achievement.
     */
    readonly description: string;

    /**
     * URL to the achievement icon.
     */
    readonly iconUrl: string | null;

    /**
     * Current status of the achievement.
     */
    readonly status: AchievementStatus;

    /**
     * Progress towards the achievement (0-100).
     */
    readonly progress?: number;

    /**
     * Timestamp when the achievement was unlocked (Unix timestamp in ms).
     */
    readonly unlockedAt?: number;
}

/**
 * A tournament instance.
 */
export interface Tournament {
    /**
     * Unique tournament identifier.
     */
    readonly id: string;

    /**
     * Display title of the tournament.
     */
    readonly title: string;

    /**
     * Context ID if this is a context-specific tournament.
     */
    readonly contextId: string | null;

    /**
     * End time of the tournament (Unix timestamp in ms).
     */
    readonly endTime: number;

    /**
     * Payload data attached to the tournament.
     */
    readonly payload?: Record<string, unknown>;
}

/**
 * Options for creating a tournament.
 */
export interface CreateTournamentOptions {
    /**
     * Initial score for the tournament.
     */
    initialScore: number;

    /**
     * Configuration for the tournament.
     */
    config: TournamentConfig;

    /**
     * Payload data to attach to the tournament.
     */
    data?: Record<string, unknown>;
}

/**
 * Context information.
 */
export interface Context {
    /**
     * Unique context identifier, or null if playing solo.
     */
    readonly id: string | null;

    /**
     * Type of context.
     */
    readonly type: ContextType;
}

/**
 * Context type options.
 */
export type ContextType = "POST" | "THREAD" | "GROUP" | "SOLO";

/**
 * A player within a context.
 */
export interface ContextPlayer {
    /**
     * Unique player identifier.
     */
    readonly id: string;

    /**
     * Player's display name, or null if not available.
     */
    readonly name: string | null;

    /**
     * URL to player's profile photo, or null if not available.
     */
    readonly photo: string | null;
}

/**
 * Options for choosing a new context.
 */
export interface ChooseContextOptions {
    /**
     * Filters to apply when choosing contexts.
     */
    filters?: ContextFilter[];

    /**
     * Maximum number of participants.
     */
    maxSize?: number;

    /**
     * Minimum number of participants.
     */
    minSize?: number;
}

/**
 * Result of checking context size.
 */
export interface ContextSizeResult {
    /**
     * Whether the context size is within the specified range.
     */
    readonly answer: boolean;

    /**
     * Minimum size that was checked.
     */
    readonly minSize: number;

    /**
     * Maximum size that was checked.
     */
    readonly maxSize: number;
}

/**
 * Payload for sharing to a context.
 */
export interface SharePayload {
    /**
     * Intent of the share (e.g., "INVITE", "REQUEST", "CHALLENGE").
     */
    intent: "INVITE" | "REQUEST" | "CHALLENGE" | "SHARE";

    /**
     * Image to share. Usually a URL; on Jest it must be a base64 PNG or a
     * `data:image/png;base64,...` URL (a plain URL fails there).
     */
    image?: string;

    /**
     * Text message to share.
     */
    text?: string;

    /**
     * Data to pass to the recipient.
     */
    data?: Record<string, unknown>;
}

/**
 * Update payload for context updates.
 */
export interface UpdatePayload {
    /**
     * Action type for the update.
     */
    action: "CUSTOM" | "LEADERBOARD_UPDATE" | "SCORE";

    /**
     * Template identifier.
     */
    template?: string;

    /**
     * Image URL for the update.
     */
    image?: string;

    /**
     * Text for the update.
     */
    text?: string;

    /**
     * Data to include in the update.
     */
    data?: Record<string, unknown>;

    /**
     * How the platform should deliver the update.
     */
    strategy?: "IMMEDIATE" | "LAST" | "IMMEDIATE_CLEAR";
}

/**
 * Notification scheduling options.
 */
export interface ScheduleNotificationOptions {
    /**
     * Stable id. Scheduling again with the same id replaces the notification on platforms that
     * support it. Generated when omitted.
     */
    id?: string;

    /**
     * Title of the notification. May be empty: Jest then sends the notification without a title.
     */
    title: string;

    /**
     * Body text of the notification.
     */
    body: string;

    /**
     * URL to the notification icon.
     */
    iconUrl?: string;

    /**
     * Id of a pre-approved image in the platform's image library (Jest: Developer Console Image
     * Library). Provide this OR imageDataUrl, not both. Ignored on platforms without notification
     * images.
     */
    imageAssetId?: string;

    /**
     * Image rendered at runtime as a base64 data URL (PNG, JPEG or WebP, at most 2 MiB encoded; the
     * data URL prefix must be lowercase, as canvas.toDataURL produces). Provide this OR
     * imageAssetId, not both. Ignored on platforms without notification images.
     */
    imageDataUrl?: string;

    /**
     * Delay in seconds before showing the notification. Provide this OR scheduledInDays, not both.
     */
    delaySeconds?: number;

    /**
     * Fuzzy delivery: whole days from now (0 to 7). The platform picks the best time inside that
     * day. Provide this OR delaySeconds, not both.
     */
    scheduledInDays?: number;

    /**
     * Call-to-action label (1 to 50 chars). Required by some platforms; a platform default is used
     * when omitted.
     */
    ctaText?: string;

    /**
     * Delivery weight where the platform rations notifications. Default "medium".
     */
    priority?: "low" | "medium" | "high" | "critical";

    /**
     * Data payload to pass when the notification is opened.
     */
    data?: Record<string, unknown>;
}

/**
 * A scheduled notification.
 */
export interface ScheduledNotification {
    /**
     * Unique notification identifier.
     */
    readonly id: string;

    /**
     * Title of the notification.
     */
    readonly title: string;

    /**
     * Body text of the notification.
     */
    readonly body: string;

    /**
     * Scheduled time (Unix timestamp in ms).
     */
    readonly scheduledAt: number;
}

/**
 * Options for sharing a referral link.
 */
export interface ShareReferralOptions {
    /**
     * Stable campaign key used to group conversions, e.g. "unlock_party_mode_v1".
     */
    readonly reference: string;
    /**
     * Data delivered to the invited player via session.getEntryPointData().
     */
    readonly data?: Record<string, unknown>;
    readonly title?: string;
    readonly text?: string;
    /**
     * Base64 data URL (PNG, JPEG, WebP), at most 2 MB.
     */
    readonly image?: string;
    /**
     * Game slug that invited players are routed through first, for an onboarding game. Jest only.
     */
    readonly onboardingSlug?: string;
    /**
     * Notifications sent to the referrer as invited players convert. The platform uses the template
     * with the highest `minConversionCount` the referrer has reached and picks one of its variants.
     * Jest only.
     */
    readonly notificationTemplates?: readonly ReferralNotificationTemplate[];
}

/**
 * All conversions for the current player, grouped by reference.
 */
export interface ReferralList {
    readonly referrals: Readonly<Record<string, readonly ReferralConversion[]>>;
    /**
     * Platform-signed payload for server verification before granting rewards.
     */
    readonly signedRequest: string;
}

/**
 * A friend entry returned from the friends list.
 */
export interface Friend {
    /**
     * Unique identifier for the friend.
     */
    id: string;

    /**
     * Display name of the friend.
     */
    name: string;

    /**
     * URL to the friend's profile image.
     */
    profilePictureUrl?: string;
}

/**
 * Achievement status.
 */
export type AchievementStatus = "locked" | "unlocked" | "in_progress";

/**
 * Tournament configuration.
 */
export interface TournamentConfig {
    /**
     * Title of the tournament.
     */
    title: string;

    /**
     * URL to the tournament image.
     */
    image?: string;

    /**
     * Sort order for scores.
     */
    sortOrder?: TournamentSortOrder;

    /**
     * Format for displaying scores.
     */
    scoreFormat?: TournamentScoreFormat;

    /**
     * Duration of the tournament in seconds.
     */
    endTime?: number;
}

/**
 * Context filter options for choosing a context.
 */
export type ContextFilter = "NEW_CONTEXT_ONLY" | "INCLUDE_EXISTING_CHALLENGES" | "NEW_PLAYERS_ONLY";

/**
 * Referral conversion notifications that apply from a conversion count up.
 */
export interface ReferralNotificationTemplate {
    /**
     * Conversions the referrer needs before this template applies.
     */
    readonly minConversionCount: number;
    /**
     * Wordings to pick from; at least one.
     */
    readonly variants: readonly ReferralNotificationVariant[];
}

/**
 * A player who joined through a referral link.
 */
export interface ReferralConversion {
    readonly playerId: string;
    /**
     * ISO 8601 timestamp.
     */
    readonly joinedAt: string;
}

/**
 * Tournament sort order options.
 */
export type TournamentSortOrder = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

/**
 * Tournament score format options.
 */
export type TournamentScoreFormat = "NUMERIC" | "TIME";

/**
 * One wording of a referral conversion notification.
 */
export interface ReferralNotificationVariant {
    readonly title?: string | null;
    readonly body: string;
    readonly ctaText: string;
    /**
     * Id of a pre-approved image in the platform's image library.
     */
    readonly imageReference?: string | null;
}

/**
 * Alias for the error shape the SDK rejects/throws with. SDK errors are plain objects, not `Error`
 * instances: check `code` rather than using `instanceof`.
 *
 * @example
 * ```ts
 * try {
 *     await Yes2SDK.leaderboard.setScoreAsync("main", 100);
 * } catch (e) {
 *     const err = e as Yes2SDKError;
 *     if (err.code === "FEATURE_NOT_SUPPORTED") { ... }
 * }
 * ```
 */
export type Yes2SDKError = ErrorMessage;

/**
 * Configuration the Yes2Games Dashboard injects as `window.__yes2sdkConfig` when it bundles a build
 * for a platform.
 *
 * @remarks Read-only from the game's point of view: never set it yourself. Its presence means the
 * page is a dashboard-bundled build running the real SDK.
 */
export interface Yes2SDKInjectedConfig {
    /**
     * Platform-side game identifier.
     */
    readonly gameId?: string;
    /**
     * The studio's own build version (not the SDK version).
     */
    readonly version?: string;
    /**
     * Platform this bundle was built for.
     */
    readonly platform?: string;
    /**
     * Version of the injected SDK. Mirrors `window.Yes2SDK.version`.
     */
    readonly sdkVersion?: string;
    /**
     * Whether verbose SDK logging is enabled.
     */
    readonly debug?: boolean;
    /**
     * Designed orientation the bundle is letterboxed to.
     */
    readonly orientation?: "portrait" | "landscape" | "both";
    /**
     * Auto-ads configuration.
     */
    readonly ads?: AdsConfig;
    /**
     * Other dashboard-owned fields. Do not depend on them.
     */
    readonly [key: string]: unknown;
}

declare global {
    interface Window {
        /**
         * The Yes2SDK runtime (injected by the dashboard, or the local mock).
         */
        Yes2SDK: Yes2SDK;
        /**
         * Present only in dashboard-bundled builds.
         */
        __yes2sdkConfig?: Yes2SDKInjectedConfig;
    }

    /**
     * The Yes2SDK runtime (injected by the dashboard, or the local mock).
     */
    const Yes2SDK: Yes2SDK;
}
