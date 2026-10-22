/**
 * Shared plumbing for the mock: logging, errors, events and timing.
 */

import type { ErrorCodeType, ErrorMessage, SDKEvents } from "../../types/yes2sdk";
import type { MockSettings } from "./options";

export const LOG_PREFIX = "[Yes2SDK] Mock:";

/** Replaced at build time with "<Core version the types came from>-mock". */
declare const __YES2SDK_MOCK_VERSION__: string | undefined;

export const MOCK_VERSION: string =
    typeof __YES2SDK_MOCK_VERSION__ !== "undefined" ? __YES2SDK_MOCK_VERSION__ : "0.0.0-mock";

/** localStorage prefix for `Yes2SDK.data`, the same one the SDK uses. */
export const DATA_PREFIX = "yes2sdk_";
/** Player data (kept outside DATA_PREFIX so `data.deleteAll()` leaves it alone). */
export const PLAYER_KEY = "yes2sdk-mock-player";

export interface MockLogger {
    info(message: string, ...details: unknown[]): void;
    warn(message: string, ...details: unknown[]): void;
}

export function createLogger(silent: () => boolean): MockLogger {
    return {
        info(message: string, ...details: unknown[]): void {
            if (!silent()) {
                console.info(`${LOG_PREFIX} ${message}`, ...details);
            }
        },
        warn(message: string, ...details: unknown[]): void {
            if (!silent()) {
                console.warn(`${LOG_PREFIX} ${message}`, ...details);
            }
        },
    };
}

/** Build an SDK-shaped error (the SDK rejects with plain objects, not Error instances). */
export function sdkError(code: ErrorCodeType, message: string, context: string): ErrorMessage {
    return { code, message, context };
}

export function notSupported(context: string): ErrorMessage {
    return sdkError("FEATURE_NOT_SUPPORTED", `${context} is not supported by the mock`, context);
}

/** Resolve on the next animation frame (or a 0 ms timer where rAF does not exist). */
export function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}

export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

type Listener<K extends keyof SDKEvents> = (data: SDKEvents[K]) => void;

/** Minimal typed emitter for `Yes2SDK.on(...)`. */
export class MockEvents {
    private readonly listeners = new Map<keyof SDKEvents, Set<(data: never) => void>>();

    on<K extends keyof SDKEvents>(event: K, listener: Listener<K>): { unsubscribe: () => void } {
        let set = this.listeners.get(event);
        if (set === undefined) {
            set = new Set();
            this.listeners.set(event, set);
        }
        const stored = listener as (data: never) => void;
        set.add(stored);
        return {
            unsubscribe: (): void => {
                set.delete(stored);
            },
        };
    }

    emit<K extends keyof SDKEvents>(event: K, data: SDKEvents[K]): void {
        const set = this.listeners.get(event);
        if (set === undefined) {
            return;
        }
        for (const listener of [...set]) {
            try {
                (listener as Listener<K>)(data);
            } catch (error) {
                console.error(`${LOG_PREFIX} listener for "${String(event)}" threw`, error);
            }
        }
    }
}

/** Mutable state shared by every mock module. */
export interface MockContext {
    settings: MockSettings;
    readonly storage: Storage;
    readonly log: MockLogger;
    readonly events: MockEvents;
    initialized: boolean;
    gameplayActive: boolean;
    audioEnabled: boolean;
    adShowing: boolean;
}
