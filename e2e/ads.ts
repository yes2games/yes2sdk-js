/** Driving ads through a template's lifecycle with recording callbacks, shared by every spec. */

import type { Page } from "@playwright/test";
import type { E2EWindow } from "./support";

export type AdKind = "interstitial" | "rewarded";

/**
 * Start an ad through the template's own `GameLifecycle` (so the game's pause/mute hooks
 * run) without awaiting it. Every callback and the resolved outcome are appended to
 * `window.__adLog`, prefixed with `tag`.
 */
export async function startAd(page: Page, kind: AdKind, placement: string, tag = ""): Promise<void> {
    await page.evaluate(
        ([adKind, adPlacement, prefix]) => {
            const win = window as unknown as E2EWindow;
            const log = (win.__adLog ??= []);
            const handle = win.__yes2Template;
            if (handle === undefined) {
                throw new Error("window.__yes2Template is missing");
            }
            const record =
                (name: string): (() => void) =>
                (): void => {
                    log.push(`${prefix}${name}`);
                };
            const callbacks = {
                beforeAd: record("beforeAd"),
                adViewed: record("adViewed"),
                adDismissed: record("adDismissed"),
                noFill: record("noFill"),
                afterAd: record("afterAd"),
            };
            const shown =
                adKind === "interstitial"
                    ? handle.lifecycle.showInterstitial(adPlacement, callbacks)
                    : handle.lifecycle.showRewarded(adPlacement, callbacks);
            void shown.then((outcome) => log.push(`${prefix}resolved:${outcome}`));
        },
        [kind, placement, tag] as const
    );
}

/**
 * Interstitial "1:" whose afterAd immediately starts interstitial "2:", the documented way to
 * chain ads. Both go through the template's lifecycle.
 */
export async function startChainedAds(page: Page): Promise<void> {
    await page.evaluate(() => {
        const win = window as unknown as E2EWindow;
        const log = (win.__adLog ??= []);
        const handle = win.__yes2Template;
        if (handle === undefined) {
            throw new Error("window.__yes2Template is missing");
        }
        const lifecycle = handle.lifecycle;
        void lifecycle
            .showInterstitial("chain-1", {
                beforeAd: () => log.push("1:beforeAd"),
                afterAd: () => {
                    log.push("1:afterAd");
                    void lifecycle
                        .showInterstitial("chain-2", {
                            beforeAd: () => log.push("2:beforeAd"),
                            afterAd: () => log.push("2:afterAd"),
                        })
                        .then((outcome) => log.push(`2:resolved:${outcome}`));
                },
            })
            .then((outcome) => log.push(`1:resolved:${outcome}`));
    });
}

export async function adLog(page: Page): Promise<string[]> {
    return page.evaluate(() => [...((window as unknown as E2EWindow).__adLog ?? [])]);
}

/** Wait until `window.__adLog` contains `entry`. */
export async function waitForAdLog(page: Page, entry: string): Promise<void> {
    await page.waitForFunction((wanted) => ((window as unknown as E2EWindow).__adLog ?? []).includes(wanted), entry);
}

/**
 * Suspend the template's AudioContext, as browsers and fullscreen ads leave it. The lifecycle
 * has to bring it back to "running" after the ad.
 */
export async function suspendAudio(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const context = (window as unknown as E2EWindow).__yes2Template?.audioContext();
        if (context === null || context === undefined) {
            throw new Error("the template has no AudioContext yet");
        }
        await (context as AudioContext).suspend();
    });
}
