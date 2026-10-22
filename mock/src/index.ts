/**
 * `@yes2sdk/js/mock`: a local-development stand-in for `window.Yes2SDK`.
 *
 * @example
 * ```ts
 * if (import.meta.env.DEV) {
 *     const { installYes2SDKMock } = await import("@yes2sdk/js/mock");
 *     installYes2SDKMock({ adResult: "nofill" });
 * }
 * ```
 */

export { createYes2SDKMock, MOCK_PLATFORM } from "./create-mock";
export type { SimulatedEvent, Yes2SDKMock, Yes2SDKMockControls } from "./create-mock";
export { installYes2SDKMock, mockSkipReason } from "./install";
export type { MockSkipReason } from "./install";
export { DATA_PREFIX, LOG_PREFIX, MOCK_VERSION } from "./internals";
export { MOCK_PRODUCTS } from "./modules";
export { DEFAULT_SETTINGS, MemoryStorage, parseQuery, SETTINGS_KEY } from "./options";
export type { MockAdResult, MockIapResult, MockRewardedOutcome, MockSettings, Yes2SDKMockOptions } from "./options";
