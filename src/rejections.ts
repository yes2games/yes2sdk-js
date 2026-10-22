/**
 * Opt-in: quieten unhandled rejections that are SDK errors.
 *
 * The SDK rejects with plain `{ code, message }` objects. A game that calls an
 * async SDK method without `.catch` otherwise gets a noisy "Uncaught (in
 * promise) Object" in the console (and in some platform QA tools). This handler
 * logs those as a single warning and marks them handled. Anything else
 * (including real `Error`s) is left alone.
 */

import { consoleLogger, type RuntimeLogger } from "./sdk";

/** True for SDK-shaped errors: a non-Error object with string `code` and `message`. */
export function isSdkError(value: unknown): value is { code: string; message: string; context?: string } {
    return (
        typeof value === "object" &&
        value !== null &&
        !(value instanceof Error) &&
        typeof (value as { code?: unknown }).code === "string" &&
        typeof (value as { message?: unknown }).message === "string"
    );
}

/** Install the handler. Returns a function that removes it. Does nothing outside a browser. */
export function installSdkRejectionHandler(logger: RuntimeLogger = consoleLogger): () => void {
    if (typeof window === "undefined") {
        return (): void => undefined;
    }
    const handler = (event: PromiseRejectionEvent): void => {
        if (isSdkError(event.reason)) {
            event.preventDefault();
            logger.warn(`unhandled SDK rejection ${event.reason.code}: ${event.reason.message}`);
        }
    };
    window.addEventListener("unhandledrejection", handler);
    return (): void => window.removeEventListener("unhandledrejection", handler);
}
