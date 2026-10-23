# @yes2games/js

[![npm](https://img.shields.io/npm/v/@yes2games/js)](https://www.npmjs.com/package/@yes2games/js)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/yes2games/yes2sdk-js/blob/main/LICENSE)

The JavaScript/TypeScript wrapper for **`window.Yes2SDK`**, the Yes2Games runtime that handles
ads, saves, player data and platform lifecycle on every platform Yes2Games publishes to.
It works the same way as the Unity and Defold wrappers, for any HTML5 game: plain
JavaScript, TypeScript, Phaser or three.js.

This package does **not** contain the SDK. You never bundle the SDK yourself:

1. **Write** your game against `window.Yes2SDK`, using this package's runtime helpers and
   types.
2. **Test** locally with the mock: fake ads (with an on-screen overlay), a mock IAP catalog,
   `localStorage` saves, and controls to simulate platform events.
3. **Upload** a plain build (a zip with `index.html` at the top level) to the Yes2Games
   Dashboard. The dashboard injects the real SDK, configured for each target platform.

## Install

```sh
npm i @yes2games/js
```

Node 22.18 or later. The package has no runtime dependencies, and the Phaser and three.js
helpers do not import Phaser or three.

| Import | What it is |
| --- | --- |
| `@yes2games/js` | The runtime layer you bundle with your game: the `ads` wrapper (one ad at a time, a watchdog, stale callbacks dropped), support checks that never throw, `createGameLifecycle`, the loading-progress reporter and input guards. Importing it also brings the `window.Yes2SDK` / `Yes2SDK` global types. |
| `@yes2games/js/phaser` | `createPhaserLifecycle(game)`: pause and mute a Phaser 3 game around ads and platform events. |
| `@yes2games/js/three` | `createThreeLifecycle({ listener, onPauseChange })`: a pause flag for your render loop and a muted `AudioListener`. |
| `@yes2games/js/mock` | The local-development mock of `window.Yes2SDK`. |
| `dist/yes2-runtime.js`, `mock/dist/yes2sdk-mock.js` | The runtime (`window.Yes2Runtime`) and the mock as classic `<script>` files, for games without a bundler. |
| `@yes2games/js/types` | The public SDK API (`types/yes2sdk.d.ts`), generated from Core. |

## 5-minute quickstart

### Start from a template

The templates live in this repo, not in the npm package: `vanilla-js` (no build step),
`vanilla-ts`, `phaser-ts` and `threejs-ts`, all on Vite.

```sh
git clone https://github.com/yes2games/yes2sdk-js.git
cd yes2sdk-js
npm install                          # also builds the runtime and the mock
npm run dev -w templates/phaser-ts   # or vanilla-ts, threejs-ts, vanilla-js
```

The game runs against the mock. Try `?yes2mock=nofill` in the URL to check that your game
resumes when no ad is available. To use a template outside this repo, copy its folder and
change `"@yes2games/js": "file:../.."` in its `package.json` to the published version.

### Or add it to your own game

```ts
import { ads, createGameLifecycle, createLoadingProgressReporter, requireSdk } from "@yes2games/js";

// 1. Get the SDK. Locally, the mock provides it; it is left out of `vite build`.
if (import.meta.env.DEV) {
    (await import("@yes2games/js/mock")).installYes2SDKMock();
}
const sdk = requireSdk();
await sdk.initializeAsync();

// 2. Report loading progress. Only integer changes reach the SDK.
const progress = createLoadingProgressReporter();
loader.on("progress", progress.fraction);           // 0..1
await loadEverything();

// 3. Pause and mute around ads and platform pause events, then signal ready.
const lifecycle = createGameLifecycle({ onPause: pauseGame, onResume: resumeGame }).attach();
await sdk.startGameAsync();                         // once the game is playable

// 4. Bracket real gameplay, and show ads between levels.
sdk.game.gameplayStart();
// ...level ends
sdk.game.gameplayStop();
await lifecycle.showInterstitial("level-complete");

// 5. Grant rewards only on "viewed".
const outcome = await lifecycle.showRewarded("extra-life");
if (outcome === "viewed") player.addLife();
```

TypeScript users get the `window.Yes2SDK` / `Yes2SDK` global types by importing
`@yes2games/js`, or with `"types": ["@yes2games/js"]` in `tsconfig.json`.

Add `data-yes2-canvas` to your game's `<canvas>` so the dashboard's screenshot capture picks
the right one, and add no SDK `<script>` tags: the dashboard injects them.

## Upload

1. Set `base: "./"` in `vite.config.ts` so every asset URL is relative. Platforms serve
   games from a sub-path, so root-absolute URLs (`/assets/x.js`) fail, and the dashboard
   warns about them.
2. `npm run build`, then zip the **contents** of `dist/` so `index.html` is at the top of
   the zip.
3. Upload the zip on your game page in the
   [Yes2Games Dashboard](https://dashboard.yes2games.com). It detects the build as
   **HTML5 / JavaScript**, injects the real SDK for each platform when it bundles, and
   removes the mock if a `yes2sdk-mock.js` tag is still in the page.
4. Test the build in the dashboard's Inspector, then request publishing.

## Guides

On the developer site, [developer.yes2games.com](https://developer.yes2games.com/docs):

- [Phaser](https://developer.yes2games.com/docs/javascript-phaser): `createPhaserLifecycle`,
  loader progress and the boot order.
- [three.js](https://developer.yes2games.com/docs/javascript-threejs): the pause flag in your
  render loop and the muted `AudioListener`.
- [Testing with the mock](https://developer.yes2games.com/docs/javascript-mock): settings,
  `?yes2mock=` query options, simulated platform events and a test pass before you upload.
- [Ad runtime and engine parity](https://developer.yes2games.com/docs/javascript-ads-runtime):
  what the `ads` wrapper guarantees, and how its no-fill handling compares with Unity and
  Defold.
- [Vite build settings](https://developer.yes2games.com/docs/javascript-vite-build): the
  config, root-absolute path warnings and what the dashboard does with your upload.
- [API reference](https://developer.yes2games.com/docs/api) and the per-platform
  quickstarts, for example [Poki](https://developer.yes2games.com/docs/poki).

In this repo: [getting started](https://github.com/yes2games/yes2sdk-js/blob/main/docs/getting-started.md),
[runtime](https://github.com/yes2games/yes2sdk-js/blob/main/docs/runtime.md),
[mock](https://github.com/yes2games/yes2sdk-js/blob/main/docs/mock.md),
[maintaining the types](https://github.com/yes2games/yes2sdk-js/blob/main/docs/maintaining-types.md)
and [E2E tests](https://github.com/yes2games/yes2sdk-js/blob/main/docs/e2e.md).

## How the mock stays out of real builds

When the dashboard bundles your game, it inserts the real SDK **before your first
`<script>` tag**. The first script it adds sets `window.__yes2sdkConfig`, and the second
loads `window.Yes2SDK`. The mock refuses to install if either global exists, so it can never
replace the real SDK:

- **Vite templates**: the mock is imported only under `import.meta.env.DEV`, so it is not in
  `dist/` at all. `npm run build` checks this; see `scripts/verify-builds.ts`.
- **vanilla-js template**: the `<script src="yes2sdk-mock.js">` tag may stay in the uploaded
  build. The dashboard removes the tag and deletes the file when it bundles your game. Even
  if it survived, it would run after the injected SDK, see it, and do nothing.

Templates never add SDK `<script>` tags of their own. Each marks its game canvas with
`data-yes2-canvas`: mark your game canvas so the dashboard captures the right one.

## What's in this repo

| Path | What it is |
| --- | --- |
| `src/` | The runtime layer, published as `@yes2games/js`, `/phaser` and `/three`. It has no platform logic. |
| `types/yes2sdk.d.ts` | The `Yes2SDK` interface, every type it uses, and the `window.Yes2SDK` / `Yes2SDK` globals. Generated from Core, then committed. |
| `mock/` | The local-development mock, published as `@yes2games/js/mock`. |
| `templates/` | `vanilla-js`, `vanilla-ts`, `phaser-ts` and `threejs-ts`. Not part of the npm package. |
| `docs/` | Repo-level docs, linked above. |

## Repo scripts

| Command | What it does |
| --- | --- |
| `npm install` | Installs every workspace and builds the runtime and the mock (`prepare`). |
| `npm run build` | Builds the runtime, the mock and every template, then checks the template builds. |
| `npm run typecheck` | Type-checks everything, including each template. |
| `npm test` | Runs the Vitest suites for the runtime and the mock. |
| `npm run test:e2e:mock` | Runs every template in headless Chromium against the mock, on the Vite dev server and as a production build. Needs `npm run build` and `npx playwright install chromium`. |
| `npm run e2e:prepare-core` / `test:e2e:core` | Real-browser tests against the real Core SDK, injected by the real Dashboard injector. Maintainers only: needs the private Core and Dashboard sources. See [docs/e2e.md](https://github.com/yes2games/yes2sdk-js/blob/main/docs/e2e.md). |
| `npm run generate:types` / `check:types` | Regenerates the types, or fails if they are stale. Maintainers only: needs the private Core source. See [docs/maintaining-types.md](https://github.com/yes2games/yes2sdk-js/blob/main/docs/maintaining-types.md). |

## License

[MIT](https://github.com/yes2games/yes2sdk-js/blob/main/LICENSE) © 2026 Yes2Games
