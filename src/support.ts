/**
 * Feature checks that never throw.
 *
 * A game built today may run against an older injected runtime. Any check
 * whose module or method is missing there reports `false` instead of throwing.
 */

import type { Yes2SDK } from "../types/yes2sdk";
import { getSdk } from "./sdk";

/** Module names on `window.Yes2SDK` that expose `isSupported()`. */
export type SupportModule = {
    [K in keyof Yes2SDK]: Yes2SDK[K] extends { isSupported(): boolean } ? K : never;
}[keyof Yes2SDK];

/** `Yes2SDK[module].isSupported()`, or false when the SDK, module or method is missing (or throws). */
export function isModuleSupported(module: SupportModule, sdk: Yes2SDK | undefined = getSdk()): boolean {
    try {
        const target = (sdk as Partial<Record<string, unknown>> | undefined)?.[module] as
            | { isSupported?: unknown }
            | undefined;
        return typeof target?.isSupported === "function" ? (target.isSupported as () => unknown)() === true : false;
    } catch {
        return false;
    }
}

/** Whether `Yes2SDK[module][method]` exists as a function in the injected runtime. */
export function hasMethod(module: keyof Yes2SDK, method: string, sdk: Yes2SDK | undefined = getSdk()): boolean {
    try {
        const target = (sdk as Partial<Record<string, unknown>> | undefined)?.[module];
        return typeof target === "object" && target !== null && typeof (target as Record<string, unknown>)[method] === "function";
    } catch {
        return false;
    }
}
