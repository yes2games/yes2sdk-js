/**
 * Classic-script build of the runtime (`dist/yes2-runtime.js`) for games without
 * a bundler. Exposes everything from `@yes2games/js` as `window.Yes2Runtime`.
 * Use either this or the ES module in one page, not both: each has its own ad latch.
 */

import * as runtime from "./index";

export type Yes2Runtime = typeof runtime;

declare global {
    interface Window {
        /** The `@yes2games/js` runtime layer (classic-script build). */
        Yes2Runtime: Yes2Runtime;
    }
    /** The `@yes2games/js` runtime layer (classic-script build). */
    const Yes2Runtime: Yes2Runtime;
}

if (typeof window !== "undefined") {
    window.Yes2Runtime = runtime;
}
