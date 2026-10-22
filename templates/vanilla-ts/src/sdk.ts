/**
 * Getting hold of `window.Yes2SDK`.
 *
 * - `npm run dev`: no SDK on the page, so the mock from `@yes2games/js/mock` is
 *   installed. `import.meta.env.DEV` is `false` in `vite build`, so this branch
 *   and the mock are dropped from the production build.
 * - Dashboard-bundled build: the dashboard injects the real SDK before this
 *   script runs. Do not add any SDK <script> tag yourself.
 */

import { requireSdk, type Yes2SDK } from "@yes2games/js";

export async function loadSdk(): Promise<Yes2SDK> {
    if (import.meta.env.DEV) {
        const { installYes2SDKMock } = await import("@yes2games/js/mock");
        installYes2SDKMock();
    }
    return requireSdk();
}
