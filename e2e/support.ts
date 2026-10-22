/**
 * Shared E2E plumbing: where each template is served, the debug handle the templates
 * expose (`window.__yes2Template`), an SDK call recorder, and a fixture that fails any
 * test whose page logged a console error or threw.
 */

import { expect, test as base, type ConsoleMessage, type Page } from "@playwright/test";
import type { GameLifecycle } from "../src/lifecycle";
import type { Yes2SDK } from "../types/yes2sdk";

export const TEMPLATES = ["vanilla-js", "vanilla-ts", "phaser-ts", "threejs-ts"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

/** How the template is served. */
export type ServeKind = "dev" | "built" | "real";

export const STATIC_PORT = 4173;
export const DEV_PORTS: Readonly<Record<TemplateName, number>> = {
    "vanilla-js": 5181,
    "vanilla-ts": 5182,
    "phaser-ts": 5183,
    "threejs-ts": 5184,
};

export function gameUrl(kind: ServeKind, template: TemplateName, search = ""): string {
    const base = kind === "dev" ? `http://127.0.0.1:${DEV_PORTS[template]}/` : `http://127.0.0.1:${STATIC_PORT}/${kind}/${template}/`;
    return base + search;
}

export interface TemplateState {
    started: boolean;
    paused: boolean;
    muted: boolean;
    /** AudioContext state, or "none" before the template created one. */
    audio: AudioContextState | "none";
    coins: number;
}

/** What every template puts on `window.__yes2Template`. */
export interface TemplateHandle {
    template: TemplateName;
    lifecycle: GameLifecycle;
    /** phaser-ts only. */
    game?: { isPaused: boolean; sound: { mute: boolean } };
    audioContext(): BaseAudioContext | null;
    state(): TemplateState;
}

export interface SdkCall {
    name: string;
    arg?: unknown;
}

/** The globals the specs read inside `page.evaluate`. */
export interface E2EWindow {
    __yes2Template?: TemplateHandle;
    __sdkCalls?: SdkCall[];
    __adLog?: string[];
    Yes2SDK?: Yes2SDK & { isMock?: boolean };
    Yes2SDKMock?: { simulate(event: string, enabled?: boolean): void };
    __yes2sdkConfig?: { platform?: string; sdkVersion?: string };
}

/**
 * Runs in the page before any script (via `addInitScript`; it is serialised, so it must be
 * self-contained). Wraps `initializeAsync`, `setLoadingProgress` and `startGameAsync` on
 * whatever becomes `window.Yes2SDK`: the real SDK's UMD assigns it, the mock defines it with
 * `Object.defineProperty`. Calls land in `window.__sdkCalls`.
 */
export function installSdkRecorder(): void {
    type Fn = (...args: unknown[]) => unknown;
    const calls: Array<{ name: string; arg?: unknown }> = [];
    const win = window as unknown as Record<string, unknown>;
    win.__sdkCalls = calls;
    const seen = new WeakSet<object>();
    const instrument = (sdk: unknown): void => {
        if (typeof sdk !== "object" || sdk === null || seen.has(sdk)) {
            return;
        }
        seen.add(sdk);
        const target = sdk as Record<string, unknown>;
        for (const name of ["initializeAsync", "setLoadingProgress", "startGameAsync"]) {
            const original = target[name];
            if (typeof original !== "function") {
                continue;
            }
            target[name] = function (this: unknown, ...args: unknown[]): unknown {
                calls.push({ name, arg: args[0] });
                const result = (original as Fn).apply(this, args);
                if (typeof (result as Promise<unknown> | undefined)?.then === "function") {
                    (result as Promise<unknown>).then(
                        () => calls.push({ name: `${name}:resolved` }),
                        (error: unknown) =>
                            calls.push({ name: `${name}:rejected`, arg: (error as { code?: unknown } | null)?.code ?? String(error) })
                    );
                }
                return result;
            };
        }
    };
    let current: unknown;
    Object.defineProperty(window, "Yes2SDK", {
        configurable: true,
        enumerable: true,
        get: (): unknown => current,
        set: (value: unknown): void => {
            current = value;
            instrument(value);
        },
    });
    const define = Object.defineProperty;
    Object.defineProperty = function <T>(object: T, key: PropertyKey, descriptor: PropertyDescriptor & ThisType<unknown>): T {
        const result = define(object, key, descriptor);
        if ((object as unknown) === window && key === "Yes2SDK" && "value" in descriptor) {
            instrument(descriptor.value);
        }
        return result;
    } as typeof Object.defineProperty;
}

interface Fixtures {
    /** Console messages of type error and uncaught page errors; the test fails if any remain. */
    pageErrors: string[];
    /** Every console line, for assertions on log output. */
    consoleLines: string[];
}

export const test = base.extend<Fixtures>({
    consoleLines: async ({ page }, use) => {
        const lines: string[] = [];
        page.on("console", (message: ConsoleMessage) => lines.push(`${message.type()}: ${message.text()}`));
        await use(lines);
    },
    pageErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            page.on("console", (message: ConsoleMessage) => {
                if (message.type() === "error") {
                    errors.push(`console.error: ${message.text()}`);
                }
            });
            page.on("pageerror", (error: Error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
            await page.addInitScript(installSdkRecorder);
            await use(errors);
            expect(errors, "the page logged console errors or threw").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };

/** Open a template and wait until `startGameAsync()` has resolved in it. */
export async function openGame(page: Page, kind: ServeKind, template: TemplateName, search = ""): Promise<void> {
    await page.goto(gameUrl(kind, template, search));
    await waitForStarted(page);
}

export async function waitForStarted(page: Page): Promise<void> {
    await page.waitForFunction(() => (window as unknown as E2EWindow).__yes2Template?.state().started === true, undefined, {
        timeout: 20_000,
    });
}

export async function gameState(page: Page): Promise<TemplateState> {
    return page.evaluate(() => {
        const handle = (window as unknown as E2EWindow).__yes2Template;
        if (handle === undefined) {
            throw new Error("window.__yes2Template is missing");
        }
        return handle.state();
    });
}

export async function sdkCalls(page: Page): Promise<SdkCall[]> {
    return page.evaluate(() => (window as unknown as E2EWindow).__sdkCalls ?? []);
}

/** Point in game coordinates (Phaser's 800x450) to page coordinates. */
async function phaserPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
    const box = await page.locator("#game-canvas").boundingBox();
    if (box === null) {
        throw new Error("#game-canvas has no box");
    }
    return { x: box.x + (x * box.width) / 800, y: box.y + (y * box.height) / 450 };
}

/**
 * A real user gesture through Playwright's mouse, the way a player unlocks audio. vanilla:
 * "Play level" (creates the AudioContext and plays a blip); Phaser: an empty part of the
 * canvas (Phaser unlocks on it); three: the canvas (its "Play level" starts an 8 s level that
 * ends in an interstitial of its own, which would race the test's ads).
 */
export async function userGesture(page: Page, template: TemplateName): Promise<void> {
    if (template === "phaser-ts") {
        const point = await phaserPoint(page, 400, 300);
        await page.mouse.click(point.x, point.y);
        return;
    }
    if (template === "threejs-ts") {
        await page.locator("#game-canvas").click({ position: { x: 20, y: 200 } });
        return;
    }
    await page.locator("#play").click();
}

/** Press the template's own rewarded-ad button. */
export async function clickRewardButton(page: Page, template: TemplateName): Promise<void> {
    if (template === "phaser-ts") {
        const point = await phaserPoint(page, 540, 60);
        await page.mouse.click(point.x, point.y);
        return;
    }
    await page.locator("#reward").click();
}
