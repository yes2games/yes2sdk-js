/** Shared handles the scenes use; filled in by main.ts before the game boots. */

import type { GameLifecycle, LoadingProgressReporter, Yes2SDK } from "@yes2sdk/js";

export interface Services {
    sdk: Yes2SDK;
    lifecycle: GameLifecycle;
    progress: LoadingProgressReporter;
}

let current: Services | null = null;

export function setServices(services: Services): void {
    current = services;
}

export function services(): Services {
    if (current === null) {
        throw new Error("services used before main.ts set them");
    }
    return current;
}
