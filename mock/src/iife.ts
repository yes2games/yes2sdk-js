/**
 * Entry for `yes2sdk-mock.js` (a classic <script>). Installs the mock on load,
 * unless the real SDK or the dashboard config is already on the page.
 *
 * Optional configuration, set before this script runs:
 *   <script>window.__yes2sdkMockOptions = { rewardedResult: "dismissed" };</script>
 */

import { installYes2SDKMock } from "./install";
import type { Yes2SDKMockOptions } from "./options";

const configured: unknown =
    typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>).__yes2sdkMockOptions;

installYes2SDKMock(typeof configured === "object" && configured !== null ? (configured as Yes2SDKMockOptions) : {});
