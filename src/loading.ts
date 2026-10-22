/**
 * Loading-progress forwarding: report to `setLoadingProgress` only when the
 * integer percentage changes, however often the engine's loader fires.
 */

import type { Yes2SDK } from "../types/yes2sdk";
import { consoleLogger, describeError, getSdk, type RuntimeLogger } from "./sdk";

export interface LoadingProgressReporter {
    /** Report progress as a 0–1 fraction (as Phaser and three loaders give it). */
    fraction(value: number): void;
    /** Report progress as a 0–100 percentage. */
    percent(value: number): void;
    /** The last integer percentage sent, or -1. */
    readonly last: number;
}

export function createLoadingProgressReporter(
    sdkSource: () => Yes2SDK | undefined = getSdk,
    logger: RuntimeLogger = consoleLogger
): LoadingProgressReporter {
    let last = -1;
    const send = (percent: number): void => {
        if (!Number.isFinite(percent)) {
            return;
        }
        // The epsilon keeps float noise (29 / 50 * 100 = 57.999…) from losing a step.
        const value = Math.min(100, Math.max(0, Math.floor(percent + 1e-9)));
        if (value === last) {
            return;
        }
        last = value;
        try {
            sdkSource()?.setLoadingProgress(value);
        } catch (error) {
            logger.warn("setLoadingProgress failed:", describeError(error));
        }
    };
    return {
        fraction: (value: number): void => send(value * 100),
        percent: send,
        get last(): number {
            return last;
        },
    };
}
