import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installYes2SDKMock, mockSkipReason } from "../src/index";

const MOCK_IIFE = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "yes2sdk-mock.js");

/** Untyped view of a window so tests can plant/remove globals freely. */
type TestWindow = { Yes2SDK?: unknown; __yes2sdkConfig?: unknown };

function testWindow(): TestWindow {
    return window as unknown as TestWindow;
}

function reset(): void {
    const w = testWindow();
    delete w.Yes2SDK;
    delete w.__yes2sdkConfig;
}

describe("installYes2SDKMock", () => {
    afterEach(reset);

    it("installs on a clean page and exposes window.Yes2SDKMock", () => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        const sdk = installYes2SDKMock({ silent: true });
        expect(sdk).not.toBeNull();
        expect(testWindow().Yes2SDK).toBe(sdk);
        expect((window as unknown as { Yes2SDKMock?: unknown }).Yes2SDKMock).toBe(sdk?.mock);
    });

    it("is idempotent: a second install returns the same mock", () => {
        const first = installYes2SDKMock({ silent: true });
        expect(installYes2SDKMock({ silent: true })).toBe(first);
    });

    it("never replaces a real SDK already on window", () => {
        const real = { version: "2.9.1" };
        testWindow().Yes2SDK = real;
        expect(installYes2SDKMock({ silent: true })).toBeNull();
        expect(testWindow().Yes2SDK).toBe(real);
    });

    it("stays out when the dashboard config is present, even before the real SDK loads", () => {
        testWindow().__yes2sdkConfig = { platform: "poki" };
        expect(installYes2SDKMock({ silent: true })).toBeNull();
        expect(testWindow().Yes2SDK).toBeUndefined();
    });

    it("logs why it skipped", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        testWindow().__yes2sdkConfig = {};
        installYes2SDKMock();
        expect(String(info.mock.calls[0]?.[0])).toContain("dashboard-config-present");
    });

    it("mockSkipReason covers every case", () => {
        expect(mockSkipReason(undefined)).toBe("no-window");
        expect(mockSkipReason({})).toBeNull();
        expect(mockSkipReason({ __yes2sdkConfig: {} })).toBe("dashboard-config-present");
        expect(mockSkipReason({ Yes2SDK: { version: "x" } as never })).toBe("real-sdk-present");
    });
});

/**
 * Run the built IIFE inside a page shaped like a dashboard bundle. The injector
 * puts yes2sdk-data.js + yes2sdk.umd.js BEFORE the game's first <script>, which
 * in the vanilla-js template is the mock tag.
 */
describe("yes2sdk-mock.js (IIFE) in a page", () => {
    let iife = "";
    beforeAll(() => {
        iife = readFileSync(MOCK_IIFE, "utf8");
    });

    function run(headScripts: string[]): TestWindow {
        const html = `<!doctype html><html><head>${headScripts.join("\n")}</head><body></body></html>`;
        const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
        return dom.window as unknown as TestWindow;
    }

    const mockTag = (): string => `<script>${iife}</script>`;
    const dataTag = `<script>window.__yes2sdkConfig = { platform: "poki", gameId: "g" };</script>`;
    const fakeUmdTag = `<script>window.Yes2SDK = { version: "2.9.1", real: true };</script>`;

    it("installs when it is alone (local development)", () => {
        const w = run([`<script>window.__yes2sdkMockOptions = { silent: true };</script>`, mockTag()]);
        expect((w.Yes2SDK as { isMock?: boolean }).isMock).toBe(true);
    });

    it("does nothing in the dashboard injection order (data.js, umd, then the game's mock tag)", () => {
        const w = run([dataTag, fakeUmdTag, mockTag()]);
        expect((w.Yes2SDK as { real?: boolean }).real).toBe(true);
    });

    it("does nothing when only the dashboard config precedes it", () => {
        const w = run([dataTag, mockTag()]);
        expect(w.Yes2SDK).toBeUndefined();
    });

    it("honours window.__yes2sdkMockOptions", async () => {
        const w = run([
            `<script>window.__yes2sdkMockOptions = { silent: true, rewardedOutcome: "dismissed", rewardedSeconds: 0, overlay: false };</script>`,
            mockTag(),
        ]);
        const sdk = w.Yes2SDK as {
            ads: { showRewarded(p: string, cb: { adDismissed: () => void }): Promise<void> };
        };
        const dismissed = vi.fn();
        await sdk.ads.showRewarded("x", { adDismissed: dismissed });
        expect(dismissed).toHaveBeenCalled();
    });
});
