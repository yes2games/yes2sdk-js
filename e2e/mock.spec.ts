/**
 * Mock mode, in Chromium, for every template:
 * - "dev":   the Vite dev server (vanilla-js: Vite as a static server), the mock imported
 *            under import.meta.env.DEV;
 * - "built": the production artifact (templates/<t>/dist, or the vanilla-js folder), with the
 *            mock's classic script tag added the way a developer would (e2e/server.ts).
 * The serve kind comes from the Playwright project (playwright.config.ts).
 */

import type { Page } from "@playwright/test";
import { adLog, startAd, startChainedAds, suspendAudio, waitForAdLog } from "./ads";
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
    type ServeKind,
    type TemplateName,
} from "./support";

const AD_OVERLAY = "[data-yes2sdk-mock-ad]";

function serveKind(projectName: string): ServeKind {
    if (projectName === "mock-dev") {
        return "dev";
    }
    if (projectName === "mock-built") {
        return "built";
    }
    throw new Error(`mock.spec.ts does not run in project ${projectName}`);
}

/** Phaser's own flags, read straight off `Phaser.Game`. */
async function phaserFlags(page: Page): Promise<{ isPaused: boolean; mute: boolean } | null> {
    return page.evaluate(() => {
        const game = (window as unknown as E2EWindow).__yes2Template?.game;
        return game === undefined ? null : { isPaused: game.isPaused, mute: game.sound.mute };
    });
}

async function expectPausedAndMuted(page: Page, template: TemplateName, on: boolean): Promise<void> {
    await expect.poll(async () => {
        const state = await gameState(page);
        return { paused: state.paused, muted: state.muted };
    }).toEqual({ paused: on, muted: on });
    if (template === "phaser-ts") {
        expect(await phaserFlags(page)).toEqual({ isPaused: on, mute: on });
    }
}

for (const template of TEMPLATES) {
    test.describe(template, () => {
        let kind: ServeKind;
        test.beforeEach(({}, testInfo) => {
            kind = serveKind(testInfo.project.name);
        });

        test("init, then loading progress, then startGameAsync", async ({ page }) => {
            await openGame(page, kind, template);
            const calls = await sdkCalls(page);
            const names = calls.map((c) => c.name);
            expect(names[0]).toBe("initializeAsync");
            const initDone = names.indexOf("initializeAsync:resolved");
            const progress = calls.filter((c) => c.name === "setLoadingProgress").map((c) => c.arg as number);
            const firstProgress = names.indexOf("setLoadingProgress");
            const lastProgress = names.lastIndexOf("setLoadingProgress");
            const start = names.indexOf("startGameAsync");
            expect(initDone).toBeGreaterThan(0);
            expect(firstProgress).toBeGreaterThan(initDone);
            expect(start).toBeGreaterThan(lastProgress);
            expect(names).toContain("startGameAsync:resolved");
            // Integer percentages, strictly increasing (the reporter drops repeats), ending at 100.
            expect(progress.every((p) => Number.isInteger(p))).toBe(true);
            expect(progress.every((p, i) => i === 0 || p > (progress[i - 1] ?? -1))).toBe(true);
            expect(progress.at(-1)).toBe(100);
            expect(names.filter((n) => n === "startGameAsync")).toHaveLength(1);
            const isMock = await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDK?.isMock === true);
            expect(isMock).toBe(true);
            // The dashboard's screenshot capture prefers the marked canvas.
            expect(await page.locator("canvas[data-yes2-canvas]").count()).toBe(1);
        });

        test("interstitial: paused and muted during the ad, resumed after, AudioContext running", async ({ page }) => {
            await openGame(page, kind, template);
            await userGesture(page, template);
            await expectPausedAndMuted(page, template, false);

            await startAd(page, "interstitial", "e2e-interstitial");
            const overlay = page.locator(AD_OVERLAY);
            await expect(overlay).toBeVisible();
            await expectPausedAndMuted(page, template, true);
            await suspendAudio(page);

            await overlay.getByRole("button", { name: "Close" }).click();
            await waitForAdLog(page, "resolved:shown");
            expect(await adLog(page)).toEqual(["beforeAd", "afterAd", "resolved:shown"]);
            await expect(overlay).toHaveCount(0);
            await expectPausedAndMuted(page, template, false);
            await expect.poll(async () => (await gameState(page)).audio).toBe("running");
        });

        test("rewarded via the template's button: Claim Reward grants, Skip does not", async ({ page }) => {
            await openGame(page, kind, template);
            await userGesture(page, template);
            const before = (await gameState(page)).coins;
            const overlay = page.locator(AD_OVERLAY);

            await clickRewardButton(page, template);
            await expect(overlay).toBeVisible();
            await expectPausedAndMuted(page, template, true);
            await overlay.getByRole("button", { name: "Claim Reward" }).click();
            await expect.poll(async () => (await gameState(page)).coins).toBe(before + 10);
            await expectPausedAndMuted(page, template, false);

            await clickRewardButton(page, template);
            await expect(overlay).toBeVisible();
            await overlay.getByRole("button", { name: "Skip" }).click();
            await expect(overlay).toHaveCount(0);
            await expectPausedAndMuted(page, template, false);
            // Give a wrongly granted reward time to show up before asserting it did not.
            await page.waitForTimeout(250);
            expect((await gameState(page)).coins).toBe(before + 10);
        });

        test("rewarded callbacks: viewed and dismissed, each in order", async ({ page }) => {
            await openGame(page, kind, template);
            const overlay = page.locator(AD_OVERLAY);

            await startAd(page, "rewarded", "e2e-viewed", "v:");
            await overlay.getByRole("button", { name: "Claim Reward" }).click();
            await waitForAdLog(page, "v:resolved:viewed");

            await startAd(page, "rewarded", "e2e-dismissed", "d:");
            await overlay.getByRole("button", { name: "Skip" }).click();
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
        });

        test("a concurrent ad gets noFill only; the first ad is unaffected", async ({ page }) => {
            await openGame(page, kind, template);
            await startAd(page, "rewarded", "first", "A:");
            await startAd(page, "interstitial", "second", "B:");
            await waitForAdLog(page, "B:resolved:noFill");
            expect(await adLog(page)).toEqual(["A:beforeAd", "B:noFill", "B:resolved:noFill"]);
            await expect(page.locator(AD_OVERLAY)).toHaveCount(1);
            await expectPausedAndMuted(page, template, true);

            await page.locator(AD_OVERLAY).getByRole("button", { name: "Claim Reward" }).click();
            await waitForAdLog(page, "A:resolved:viewed");
            expect(await adLog(page)).toEqual([
                "A:beforeAd",
                "B:noFill",
                "B:resolved:noFill",
                "A:adViewed",
                "A:afterAd",
                "A:resolved:viewed",
            ]);
            await expectPausedAndMuted(page, template, false);
        });

        test("an ad that runs out its countdown ends with the configured outcome", async ({ page }) => {
            await openGame(page, kind, template, "?yes2mock=rewardedseconds:1,interstitial:1,dismissed");
            await startAd(page, "rewarded", "timed", "r:");
            await waitForAdLog(page, "r:resolved:dismissed");
            await startAd(page, "interstitial", "timed", "i:");
            await waitForAdLog(page, "i:resolved:shown");
            expect(await adLog(page)).toEqual([
                "r:beforeAd",
                "r:adDismissed",
                "r:afterAd",
                "r:resolved:dismissed",
                "i:beforeAd",
                "i:afterAd",
                "i:resolved:shown",
            ]);
        });

        test("a blocked ad resolves noFill (noFill, then afterAd) and never rejects", async ({ page }) => {
            await openGame(page, kind, template, "?yes2mock=adblocked");
            await startAd(page, "rewarded", "blocked", "r:");
            await waitForAdLog(page, "r:resolved:noFill");
            await startAd(page, "interstitial", "blocked", "i:");
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

        test("the platform mute switch: starts muted, then follows audioEnabledChange", async ({ page }) => {
            await openGame(page, kind, template, "?yes2mock=mute");
            await userGesture(page, template);
            await expect.poll(async () => (await gameState(page)).muted).toBe(true);
            expect((await gameState(page)).paused).toBe(false);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("audioEnabledChange", true));
            await expect.poll(async () => (await gameState(page)).muted).toBe(false);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("audioEnabledChange", false));
            await expect.poll(async () => (await gameState(page)).muted).toBe(true);
            // An ad while the platform has audio off must not unmute the game when it ends.
            await startAd(page, "interstitial", "muted-ad");
            await page.locator(AD_OVERLAY).getByRole("button", { name: "Close" }).click();
            await waitForAdLog(page, "resolved:shown");
            await page.waitForTimeout(250);
            expect((await gameState(page)).muted).toBe(true);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("audioEnabledChange", true));
            await expect.poll(async () => (await gameState(page)).muted).toBe(false);
        });

        test("Yes2SDKMock.simulate('pause' | 'resume') pauses and resumes the game", async ({ page }) => {
            await openGame(page, kind, template);
            await userGesture(page, template);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("pause"));
            await expectPausedAndMuted(page, template, true);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("resume"));
            await expectPausedAndMuted(page, template, false);
        });

        test("an ad that ends during a platform pause does not resume the game early", async ({ page }) => {
            await openGame(page, kind, template);
            await startAd(page, "interstitial", "during-pause");
            await expect(page.locator(AD_OVERLAY)).toBeVisible();
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("pause"));
            await page.locator(AD_OVERLAY).getByRole("button", { name: "Close" }).click();
            await waitForAdLog(page, "resolved:shown");
            await expectPausedAndMuted(page, template, true);
            await page.evaluate(() => (window as unknown as E2EWindow).Yes2SDKMock?.simulate("resume"));
            await expectPausedAndMuted(page, template, false);
        });

        test("an ad chained from afterAd while the AudioContext is suspended leaves the game unmuted", async ({ page }) => {
            await openGame(page, kind, template);
            await userGesture(page, template);
            await startChainedAds(page);
            const overlay = page.locator(AD_OVERLAY);
            await expect(overlay).toBeVisible();
            await expectPausedAndMuted(page, template, true);
            // The first ad leaves the context suspended; its afterAd starts the second ad before
            // the lifecycle's resume() has gone through.
            await suspendAudio(page);
            await overlay.getByRole("button", { name: "Close" }).click();
            await waitForAdLog(page, "2:beforeAd");
            await overlay.getByRole("button", { name: "Close" }).click();
            await waitForAdLog(page, "2:resolved:shown");
            const log = await adLog(page);
            expect(log.filter((entry) => entry.startsWith("1:"))).toEqual(["1:beforeAd", "1:afterAd", "1:resolved:shown"]);
            expect(log.filter((entry) => entry.startsWith("2:"))).toEqual(["2:beforeAd", "2:afterAd", "2:resolved:shown"]);
            expect(log.indexOf("2:beforeAd")).toBeGreaterThan(log.indexOf("1:afterAd"));
            await expectPausedAndMuted(page, template, false);
            await expect.poll(async () => (await gameState(page)).audio).toBe("running");
        });

        test("saved data survives a reload", async ({ page }) => {
            await openGame(page, kind, template);
            expect((await gameState(page)).coins).toBe(0);
            await clickRewardButton(page, template);
            await page.locator(AD_OVERLAY).getByRole("button", { name: "Claim Reward" }).click();
            await expect.poll(async () => (await gameState(page)).coins).toBe(10);

            await page.reload();
            await waitForStarted(page);
            expect((await gameState(page)).coins).toBe(10);
        });
    });
}
