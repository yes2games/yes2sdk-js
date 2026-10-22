/**
 * Access to the injected runtime and shared logging.
 *
 * The SDK itself is never bundled: the dashboard injects it as `window.Yes2SDK`
 * (or the mock provides it locally). Everything here reads it lazily, at call
 * time, so it works whichever loads first.
 */

import type { Yes2SDK } from "../types/yes2sdk";

export const LOG_PREFIX = "[Yes2SDK]";

/** The injected `window.Yes2SDK`, or `undefined` when none is on the page (yet). */
export function getSdk(): Yes2SDK | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    const sdk = (window as unknown as { Yes2SDK?: Yes2SDK }).Yes2SDK;
    return typeof sdk === "object" && sdk !== null ? sdk : undefined;
}

/** Where the runtime layer writes its log lines. Swap it to silence or capture logs. */
export interface RuntimeLogger {
    info(message: string, ...details: unknown[]): void;
    warn(message: string, ...details: unknown[]): void;
    error(message: string, ...details: unknown[]): void;
}

export const consoleLogger: RuntimeLogger = {
    info: (message: string, ...details: unknown[]): void => console.info(`${LOG_PREFIX} ${message}`, ...details),
    warn: (message: string, ...details: unknown[]): void => console.warn(`${LOG_PREFIX} ${message}`, ...details),
    error: (message: string, ...details: unknown[]): void => console.error(`${LOG_PREFIX} ${message}`, ...details),
};

/** Best-effort stack (or message) for logging a thrown value. */
export function describeError(error: unknown): unknown {
    if (error instanceof Error) {
        return error.stack ?? `${error.name}: ${error.message}`;
    }
    return error;
}

/** Call a game callback in its own try/catch; a throw is logged with its stack and never propagates. */
export function safeCall(logger: RuntimeLogger, name: string, fn: (() => void) | undefined): void {
    if (fn === undefined) {
        return;
    }
    try {
        fn();
    } catch (error) {
        logger.error(`${name} callback threw:`, describeError(error));
    }
}

/**
 * The injected `window.Yes2SDK`; throws a clear error when it is missing (the
 * build was not bundled by the dashboard, and no mock was installed).
 */
export function requireSdk(): Yes2SDK {
    const sdk = getSdk();
    if (sdk === undefined) {
        throw new Error(
            "window.Yes2SDK is missing. Upload this build to the Yes2Games Dashboard, which injects the SDK, " +
                "or install the @yes2games/js mock for local development."
        );
    }
    return sdk;
}
