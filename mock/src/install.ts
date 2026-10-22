/**
 * Installing the mock on `window` — guarded so it can never shadow the real SDK.
 *
 * The Yes2Games Dashboard injects, ahead of the game's first <script>:
 *   1. yes2sdk-data.js   -> sets window.__yes2sdkConfig
 *   2. yes2sdk.umd.js    -> sets window.Yes2SDK (the real SDK)
 * So in any dashboard-bundled build, by the time a mock script or import runs,
 * at least one of those globals exists. Either one disables the mock.
 */

import type { Yes2SDK } from "../../types/yes2sdk";
import { createYes2SDKMock, type Yes2SDKMock, type Yes2SDKMockControls } from "./create-mock";
import { LOG_PREFIX } from "./internals";
import type { Yes2SDKMockOptions } from "./options";

/** Why the mock declined to install, or `null` when it may install. */
export type MockSkipReason = "no-window" | "dashboard-config-present" | "real-sdk-present";

interface MockableWindow {
    Yes2SDK?: Yes2SDK | Yes2SDKMock;
    __yes2sdkConfig?: unknown;
    Yes2SDKMock?: Yes2SDKMockControls;
}

function isMock(sdk: unknown): sdk is Yes2SDKMock {
    return typeof sdk === "object" && sdk !== null && "isMock" in sdk && sdk.isMock === true;
}

/** Decide whether the mock may install into `win`. */
export function mockSkipReason(win: MockableWindow | undefined): MockSkipReason | null {
    if (win === undefined) {
        return "no-window";
    }
    if (win.__yes2sdkConfig !== undefined) {
        return "dashboard-config-present";
    }
    if (win.Yes2SDK !== undefined && !isMock(win.Yes2SDK)) {
        return "real-sdk-present";
    }
    return null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0", ""]);

/**
 * Install the mock as `window.Yes2SDK` (and its controls as `window.Yes2SDKMock`) unless the real SDK (or the dashboard's
 * injected config) is present.
 *
 * @returns The installed (or already-installed) mock, or `null` when skipped.
 */
export function installYes2SDKMock(options: Yes2SDKMockOptions = {}): Yes2SDKMock | null {
    const win = typeof window === "undefined" ? undefined : (window as unknown as MockableWindow);
    const reason = mockSkipReason(win);
    if (reason !== null || win === undefined) {
        if (reason !== "no-window" && options.silent !== true) {
            console.info(`${LOG_PREFIX} not installed (${String(reason)}); the real Yes2SDK is in charge.`);
        }
        return null;
    }
    if (isMock(win.Yes2SDK)) {
        return win.Yes2SDK;
    }
    const sdk = createYes2SDKMock(options);
    Object.defineProperty(win, "Yes2SDK", { value: sdk, configurable: true, writable: true, enumerable: true });
    // Console-friendly controls: window.Yes2SDKMock.simulate("pause"), .configure({...}), ...
    Object.defineProperty(win, "Yes2SDKMock", { value: sdk.mock, configurable: true, writable: true, enumerable: true });
    if (options.silent !== true) {
        const host = typeof location !== "undefined" ? location.hostname : "";
        const local = LOCAL_HOSTS.has(host) || host.endsWith(".local") || /^(10|192\.168)\./.test(host);
        const log = local ? console.info : console.warn;
        log(
            `${LOG_PREFIX} installed as window.Yes2SDK${local ? "" : ` on "${host}"`}. ` +
                "This is a local-development stub; upload your build to the Yes2Games Dashboard to get the real SDK."
        );
    }
    return sdk;
}
