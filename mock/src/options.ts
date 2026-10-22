/**
 * Mock settings: one options object and/or `?yes2mock=` query params, kept in
 * localStorage so they survive reloads.
 *
 * Precedence (later wins): defaults < saved < options passed in code < query.
 * Whatever results is saved again.
 *
 * Query format, comma-separated; `key:value` pairs or bare shorthands:
 *   ?yes2mock=nofill                    adResult
 *   ?yes2mock=adblocked,dismissed       adResult + rewardedOutcome
 *   ?yes2mock=iap:cancel,overlay:off
 *   ?yes2mock=reset                     forget saved settings first
 */

/** What every ad does. Failures skip `beforeAd` and give `noFill` then `afterAd`. */
export type MockAdResult = "normal" | "nofill" | "adblocked" | "error";
/** How a normally-completing rewarded ad ends (the overlay buttons can override it). */
export type MockRewardedOutcome = "viewed" | "dismissed";
/** What purchases do. */
export type MockIapResult = "normal" | "fail" | "cancel";

export interface MockSettings {
    adResult: MockAdResult;
    rewardedOutcome: MockRewardedOutcome;
    /** Seconds an interstitial plays. Default 3. */
    interstitialSeconds: number;
    /** Seconds a rewarded ad plays. Default 5. */
    rewardedSeconds: number;
    /** On-screen overlay (blocks input) for ads and purchases. Default true in a browser. */
    overlay: boolean;
    iapResult: MockIapResult;
    /** Initial `session.isAudioEnabled()`. Default true. */
    audioEnabled: boolean;
    /** `session.getEntryPointData()`. Default {}. */
    entryPointData: Record<string, unknown>;
    /** Suppress console logs. Default false. */
    silent: boolean;
}

export type Yes2SDKMockOptions = Partial<MockSettings> & {
    /** Storage backend. Default: localStorage, or memory when unavailable. Not persisted. */
    storage?: Storage;
    /** Read `?yes2mock=` from this query string. Default: `location.search`. */
    query?: string;
    /** Save the resolved settings to storage. Default true. */
    persist?: boolean;
};

export const SETTINGS_KEY = "yes2sdk-mock-settings";

export const DEFAULT_SETTINGS: Readonly<MockSettings> = {
    adResult: "normal",
    rewardedOutcome: "viewed",
    interstitialSeconds: 3,
    rewardedSeconds: 5,
    overlay: typeof document !== "undefined",
    iapResult: "normal",
    audioEnabled: true,
    entryPointData: {},
    silent: false,
};

/** In-memory `Storage` used when localStorage is missing or throws (private mode, sandboxed iframes). */
export class MemoryStorage implements Storage {
    private readonly map = new Map<string, string>();

    get length(): number {
        return this.map.size;
    }

    clear(): void {
        this.map.clear();
    }

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.map.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    setItem(key: string, value: string): void {
        this.map.set(key, String(value));
    }
}

export function defaultStorage(): Storage {
    try {
        if (typeof localStorage !== "undefined") {
            const probe = "__yes2sdk_mock_probe__";
            localStorage.setItem(probe, "1");
            localStorage.removeItem(probe);
            return localStorage;
        }
    } catch {
        // fall through to memory
    }
    return new MemoryStorage();
}

const AD_RESULTS: readonly MockAdResult[] = ["normal", "nofill", "adblocked", "error"];
const REWARDED: readonly MockRewardedOutcome[] = ["viewed", "dismissed"];
const IAP_RESULTS: readonly MockIapResult[] = ["normal", "fail", "cancel"];

function parseBool(value: string): boolean | undefined {
    if (/^(1|true|on|yes)$/i.test(value)) {
        return true;
    }
    if (/^(0|false|off|no)$/i.test(value)) {
        return false;
    }
    return undefined;
}

function oneOf<T extends string>(list: readonly T[], value: string): T | undefined {
    return list.find((item) => item === value.toLowerCase());
}

/** Keep only well-typed fields from untrusted input (storage or query). */
export function sanitizeSettings(input: unknown): Partial<MockSettings> {
    if (typeof input !== "object" || input === null) {
        return {};
    }
    const raw = input as Record<string, unknown>;
    const out: Partial<MockSettings> = {};
    const str = (key: string): string | undefined => (typeof raw[key] === "string" ? (raw[key] as string) : undefined);
    const adResult = str("adResult");
    if (adResult !== undefined) {
        out.adResult = oneOf(AD_RESULTS, adResult);
    }
    const rewarded = str("rewardedOutcome");
    if (rewarded !== undefined) {
        out.rewardedOutcome = oneOf(REWARDED, rewarded);
    }
    const iap = str("iapResult");
    if (iap !== undefined) {
        out.iapResult = oneOf(IAP_RESULTS, iap);
    }
    for (const key of ["interstitialSeconds", "rewardedSeconds"] as const) {
        const value = raw[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            out[key] = value;
        }
    }
    for (const key of ["overlay", "audioEnabled", "silent"] as const) {
        if (typeof raw[key] === "boolean") {
            out[key] = raw[key] as boolean;
        }
    }
    if (typeof raw.entryPointData === "object" && raw.entryPointData !== null && !Array.isArray(raw.entryPointData)) {
        out.entryPointData = raw.entryPointData as Record<string, unknown>;
    }
    for (const key of Object.keys(out) as Array<keyof MockSettings>) {
        if (out[key] === undefined) {
            delete out[key];
        }
    }
    return out;
}

/** Parse `?yes2mock=` into settings, plus whether `reset` was asked for. */
export function parseQuery(search: string): { settings: Partial<MockSettings>; reset: boolean } {
    const value = new URLSearchParams(search).get("yes2mock");
    if (value === null) {
        return { settings: {}, reset: false };
    }
    const raw: Record<string, unknown> = {};
    let reset = false;
    for (const token of value.split(",").map((t) => t.trim()).filter((t) => t !== "")) {
        const [key, val] = token.includes(":") ? token.split(/:(.*)/s, 2) : [token, undefined];
        const k = (key ?? "").toLowerCase();
        if (val === undefined) {
            if (k === "reset") {
                reset = true;
            } else if (oneOf(AD_RESULTS, k) !== undefined) {
                raw.adResult = k;
            } else if (oneOf(REWARDED, k) !== undefined) {
                raw.rewardedOutcome = k;
            } else if (k === "mute" || k === "muted") {
                raw.audioEnabled = false;
            } else if (k === "nooverlay") {
                raw.overlay = false;
            }
            continue;
        }
        switch (k) {
            case "ad":
            case "adresult":
                raw.adResult = val;
                break;
            case "rewarded":
            case "rewardedoutcome":
                raw.rewardedOutcome = val;
                break;
            case "iap":
            case "iapresult":
                raw.iapResult = val;
                break;
            case "interstitial":
            case "interstitialseconds":
                raw.interstitialSeconds = Number(val);
                break;
            case "rewardedseconds":
                raw.rewardedSeconds = Number(val);
                break;
            case "overlay":
            case "audio":
            case "audioenabled":
            case "silent": {
                const b = parseBool(val);
                if (b !== undefined) {
                    raw[k === "audio" || k === "audioenabled" ? "audioEnabled" : k] = b;
                }
                break;
            }
            default:
                break;
        }
    }
    return { settings: sanitizeSettings(raw), reset };
}

export function readSavedSettings(storage: Storage): Partial<MockSettings> {
    try {
        const raw = storage.getItem(SETTINGS_KEY);
        return raw === null ? {} : sanitizeSettings(JSON.parse(raw));
    } catch {
        return {};
    }
}

export function saveSettings(storage: Storage, settings: MockSettings): void {
    try {
        storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // storage full or blocked: settings just won't persist
    }
}

/** Resolve settings from defaults, storage, options and the query string; persist the result. */
export function resolveSettings(options: Yes2SDKMockOptions, storage: Storage): MockSettings {
    const search = options.query ?? (typeof location !== "undefined" ? location.search : "");
    const query = parseQuery(search);
    if (query.reset) {
        try {
            storage.removeItem(SETTINGS_KEY);
        } catch {
            // ignore
        }
    }
    const { storage: _s, query: _q, persist, ...fromOptions } = options;
    const settings: MockSettings = {
        ...DEFAULT_SETTINGS,
        ...readSavedSettings(storage),
        ...sanitizeSettings(fromOptions),
        ...query.settings,
    };
    if (persist !== false) {
        saveSettings(storage, settings);
    }
    return settings;
}
