/**
 * Real-Core mode: every template's production artifact after the REAL Dashboard injector
 * added the REAL Core SDK (platform "debug"), served from e2e/.real-core/ (prepared by
 * scripts/prepare-real-core.ts). Proves the runtime layer works against Core itself, not
 * only against the mock.
 *
 * Core's debug ads finish when the page receives {type: "yes2sdk:ad-dismissed"} (what the QA
 * Inspector sends), and take their outcome from {type: "yes2sdk:mock", setting, value}.
 * The debug platform has no native pause signal, so Core falls back to visibilitychange.
 */

import type { Page } from "@playwright/test";
import { adLog, startAd, startChainedAds, suspendAudio, waitForAdLog } from "./ads";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertFresh, REAL_CORE_DIR, readRealCoreManifest, type RealCoreManifest } from "./real-core-manifest";
import {
    clickRewardButton,
    expect,
    gameState,
    openGame,
    sdkCalls,
    TEMPLATES,
    test,
    userGesture,
    waitForStarted,
    type E2EWindow,
    type TemplateName,
} from "./support";

/** Drop the console errors a test provoked on purpose; any other error still fails the test. */
function allowErrors(errors: string[], pattern: RegExp): void {
    const kept = errors.filter((error) => !pattern.test(error));
    errors.splice(0, errors.length, ...kept);
}

/** End the debug adapter's current ad, as the QA Inspector does. */
async function dismissAd(page: Page): Promise<void> {
    await page.evaluate(() => window.postMessage({ type: "yes2sdk:ad-dismissed" }, "*"));
}

/** Flip one of the debug adapter's mock settings (adFillEnabled, rewardedAdComplete, ...). */
async function debugSetting(page: Page, setting: string, value: boolean): Promise<void> {
    await page.evaluate(([name, on]) => window.postMessage({ type: "yes2sdk:mock", setting: name, value: on }, "*"), [
        setting,
        value,
    ] as const);
    // postMessage is async; let it land before the next ad call.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Emulate the tab being hidden or shown again. */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
    await page.evaluate((isHidden) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isHidden ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
}

async function expectPausedAndMuted(page: Page, template: TemplateName, on: boolean): Promise<void> {
    await expect.poll(async () => {
        const state = await gameState(page);
        return { paused: state.paused, muted: state.muted };
    }).toEqual({ paused: on, muted: on });
    if (template === "phaser-ts") {
        const flags = await page.evaluate(() => {
            const game = (window as unknown as E2EWindow).__yes2Template?.game;
            return { isPaused: game?.isPaused, mute: game?.sound.mute };
        });
        expect(flags).toEqual({ isPaused: on, mute: on });
    }
}

for (const template of TEMPLATES) {
    test.describe(template, () => {
        let manifest: RealCoreManifest;
        test.beforeEach(() => {
            const status = readRealCoreManifest(template);
            test.skip(!status.ok, status.ok ? "" : status.reason);
            if (status.ok) {
                manifest = status.manifest;
                assertFresh(manifest, template);
            }
        });

        test("the real SDK is in charge: the mock stands down, version and platform match Core", async ({
            page,
            consoleLines,
        }) => {
            await openGame(page, "real", template);
            const facts = await page.evaluate(() => {
                const win = window as unknown as E2EWindow;
                return {
                    isMock: win.Yes2SDK?.isMock ?? null,
                    mockControls: win.Yes2SDKMock !== undefined,
                    version: win.Yes2SDK?.version,
                    platform: win.Yes2SDK?.getPlatform(),
                    configPlatform: win.__yes2sdkConfig?.platform,
                    initialized: win.Yes2SDK?.isInitialized,
                };
            });
            expect(facts).toEqual({
                isMock: null,
                mockControls: false,
                version: manifest.coreVersion,
                platform: "debug",
                configPlatform: "debug",
                initialized: true,
            });
            if (template === "vanilla-js") {
                // Newer injectors strip the mock tag and file; older ones leave
                // the tag after the injected SDK, where the mock must see it and step aside.
                const html = readFileSync(join(REAL_CORE_DIR, template, "index.html"), "utf8");
                if (html.includes('src="yes2sdk-mock.js"')) {
                    expect(consoleLines.join("\n")).toContain("[Yes2SDK] Mock: not installed (dashboard-config-present)");
                } else {
                    expect(existsSync(join(REAL_CORE_DIR, template, "yes2sdk-mock.js"))).toBe(false);
                }
            }
            expect(await page.locator("canvas[data-yes2-canvas]").count()).toBe(1);
            expect(consoleLines.join("\n")).not.toContain("installed as window.Yes2SDK");

            const calls = await sdkCalls(page);
            const names = calls.map((c) => c.name);
            expect(names[0]).toBe("initializeAsync");
            expect(names).toContain("initializeAsync:resolved");
            expect(names).toContain("startGameAsync:resolved");
            expect(names.filter((n) => n.endsWith(":rejected"))).toEqual([]);
            expect(names.indexOf("startGameAsync")).toBeGreaterThan(names.lastIndexOf("setLoadingProgress"));
            expect(calls.filter((c) => c.name === "setLoadingProgress").at(-1)?.arg).toBe(100);
        });

        test("interstitial through the runtime: callback order, pause/mute, AudioContext running", async ({ page }) => {
            await openGame(page, "real", template);
            await userGesture(page, template);
            await startAd(page, "interstitial", "e2e-interstitial");
            await waitForAdLog(page, "beforeAd");
            await expectPausedAndMuted(page, template, true);
            await suspendAudio(page);
            await dismissAd(page);
            await waitForAdLog(page, "resolved:shown");
            expect(await adLog(page)).toEqual(["beforeAd", "afterAd", "resolved:shown"]);
            await expectPausedAndMuted(page, template, false);
            await expect.poll(async () => (await gameState(page)).audio).toBe("running");
        });

        test("rewarded through the runtime: viewed, then dismissed", async ({ page }) => {
            await openGame(page, "real", template);
            await startAd(page, "rewarded", "e2e-viewed", "v:");
            await waitForAdLog(page, "v:beforeAd");
            await dismissAd(page);
            await waitForAdLog(page, "v:resolved:viewed");

            await debugSetting(page, "rewardedAdComplete", false);
            await startAd(page, "rewarded", "e2e-dismissed", "d:");
            await waitForAdLog(page, "d:beforeAd");
            await dismissAd(page);
            await waitForAdLog(page, "d:resolved:dismissed");

            expect(await adLog(page)).toEqual([
                "v:beforeAd",
                "v:adViewed",
                "v:afterAd",
                "v:resolved:viewed",
                "d:beforeAd",
                "d:adDismissed",
                "d:afterAd",
                "d:resolved:dismissed",
            ]);
            await expectPausedAndMuted(page, template, false);
        });

        test("no fill: noFill then afterAd, and the game never pauses", async ({ page }) => {
            await openGame(page, "real", template);
            await debugSetting(page, "adFillEnabled", false);
            await startAd(page, "rewarded", "e2e-nofill", "r:");
            await waitForAdLog(page, "r:resolved:noFill");
            await startAd(page, "interstitial", "e2e-nofill", "i:");
            await waitForAdLog(page, "i:resolved:noFill");
            expect(await adLog(page)).toEqual([
                "r:noFill",
                "r:afterAd",
                "r:resolved:noFill",
                "i:noFill",
                "i:afterAd",
                "i:resolved:noFill",
            ]);
            await expectPausedAndMuted(page, template, false);
        });

        test("an ad chained from afterAd while the AudioContext is suspended leaves the game unmuted", async ({ page }) => {
            await openGame(page, "real", template);
            await userGesture(page, template);
            await startChainedAds(page);
            await waitForAdLog(page, "1:beforeAd");
            await expectPausedAndMuted(page, template, true);
            await suspendAudio(page);
            await dismissAd(page);
            await waitForAdLog(page, "2:beforeAd");
            await dismissAd(page);
            await waitForAdLog(page, "2:resolved:shown");
            const log = await adLog(page);
            expect(log.filter((entry) => entry.startsWith("1:"))).toEqual(["1:beforeAd", "1:afterAd", "1:resolved:shown"]);
            expect(log.filter((entry) => entry.startsWith("2:"))).toEqual(["2:beforeAd", "2:afterAd", "2:resolved:shown"]);
            await expectPausedAndMuted(page, template, false);
            await expect.poll(async () => (await gameState(page)).audio).toBe("running");
        });

        test("a blocked ad: noFill then afterAd, and the runtime's promise never rejects", async ({ page, pageErrors }) => {
            await openGame(page, "real", template);
            await debugSetting(page, "adBlockSimulation", true);
            await startAd(page, "rewarded", "e2e-blocked", "r:");
            await waitForAdLog(page, "r:resolved:noFill");
            await startAd(page, "interstitial", "e2e-blocked", "i:");
            await waitForAdLog(page, "i:resolved:noFill");
            expect(await adLog(page)).toEqual([
                "r:noFill",
                "r:afterAd",
                "r:resolved:noFill",
                "i:noFill",
                "i:afterAd",
                "i:resolved:noFill",
            ]);
            await expectPausedAndMuted(page, template, false);
            // Core logs every rejected API call with console.error; here the block is the point.
            allowErrors(pageErrors, /\[Yes2SDK\] API error: ads\.show(Rewarded|Interstitial) - ADS_BLOCKED/);
        });

        test("the latch rejects a concurrent ad; the first ad is unaffected", async ({ page }) => {
            await openGame(page, "real", template);
            await startAd(page, "rewarded", "first", "A:");
            await startAd(page, "interstitial", "second", "B:");
            await waitForAdLog(page, "B:resolved:noFill");
            await waitForAdLog(page, "A:beforeAd");
            await dismissAd(page);
            await waitForAdLog(page, "A:resolved:viewed");
            const log = await adLog(page);
            expect(log.filter((entry) => entry.startsWith("B:"))).toEqual(["B:noFill", "B:resolved:noFill"]);
            expect(log.filter((entry) => entry.startsWith("A:"))).toEqual([
                "A:beforeAd",
                "A:adViewed",
                "A:afterAd",
                "A:resolved:viewed",
            ]);
            await expectPausedAndMuted(page, template, false);
        });

        test("Core's pause/resume events (visibility on debug) pause and resume the game", async ({ page }) => {
            await openGame(page, "real", template);
            await userGesture(page, template);
            await setHidden(page, true);
            await expectPausedAndMuted(page, template, true);
            await setHidden(page, false);
            await expectPausedAndMuted(page, template, false);
        });

        test("saved data survives a reload", async ({ page }) => {
            await openGame(page, "real", template);
            expect((await gameState(page)).coins).toBe(0);
            await clickRewardButton(page, template);
            await expect.poll(async () => (await gameState(page)).paused).toBe(true);
            await dismissAd(page);
            await expect.poll(async () => (await gameState(page)).coins).toBe(10);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDK?.data.flushAsync());
            await page.reload();
            await waitForStarted(page);
            expect((await gameState(page)).coins).toBe(10);
        });
    });
}
