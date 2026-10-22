import { defineConfig, devices } from "@playwright/test";
import { DEV_PORTS, STATIC_PORT, TEMPLATES } from "./e2e/support";

/**
 * Real-browser E2E (Chromium, headless). `npm run test:e2e` runs:
 *   mock-dev    every template on its Vite dev server, with the mock
 *   mock-built  every template's production artifact, with the mock's script tag added
 *   real-core   every template after the real Dashboard injector added the real Core SDK.
 *               Opt-in: it needs the private Core and Dashboard sources, so it only runs
 *               after `npm run e2e:prepare-core` (see docs/e2e.md); otherwise each test
 *               is skipped with the reason.
 * Build first: `npm run build` (the runtime, the mock and every template's dist/).
 */

const CI = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
    testDir: "e2e",
    globalSetup: "./e2e/global-setup.ts",
    fullyParallel: true,
    forbidOnly: CI,
    retries: 0,
    workers: CI ? 2 : undefined,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
    outputDir: "test-results",
    use: {
        ...devices["Desktop Chrome"],
        headless: true,
        // No autoplay-policy flag: Playwright runs page.evaluate / waitForFunction with a user
        // gesture, so the page counts as activated as soon as a test polls it, and no flag can
        // reproduce a never-activated page. The audio assertions therefore suspend the
        // AudioContext during the ad themselves (e2e/ads.ts suspendAudio): only an explicit
        // resume() brings it back to "running", which is what the lifecycle must do.
        trace: "retain-on-failure",
    },
    projects: [
        { name: "mock-dev", testMatch: "mock.spec.ts" },
        { name: "mock-built", testMatch: "mock.spec.ts" },
        { name: "real-core", testMatch: "real-core.spec.ts" },
    ],
    webServer: [
        {
            command: `node e2e/server.ts ${STATIC_PORT}`,
            url: `http://127.0.0.1:${STATIC_PORT}/favicon.ico`,
            reuseExistingServer: !CI,
            stdout: "ignore",
        },
        ...TEMPLATES.map((template) => ({
            // Vite directly (not `npm run dev`), so vanilla-js's `--open` never launches a browser.
            command: `npx vite --host 127.0.0.1 --port ${DEV_PORTS[template]} --strictPort`,
            cwd: `templates/${template}`,
            url: `http://127.0.0.1:${DEV_PORTS[template]}/`,
            reuseExistingServer: !CI,
            stdout: "ignore" as const,
        })),
    ],
});
