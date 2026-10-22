# @yes2sdk/js

The JavaScript/TypeScript wrapper for **`window.Yes2SDK`**, the Yes2Games runtime that handles
ads, saves, player data and platform lifecycle on every platform Yes2Games publishes to.
It works the same way as the Unity and Defold wrappers.

This package does **not** contain the SDK. You never bundle the SDK yourself:

1. **Write** your game against `window.Yes2SDK`, using this package's runtime helpers and
   types.
2. **Test** locally with the mock: fake ads (with an on-screen overlay), a mock IAP catalog,
   `localStorage` saves, and buttons to simulate platform events.
3. **Upload** a plain build (a zip with `index.html` at the top level) to the Yes2Games
   Dashboard. The dashboard injects the real SDK, configured for each target platform.

## What's here

| Path | What it is |
| --- | --- |
| `src/` → `@yes2sdk/js` | The **runtime layer** you bundle with your game: a one-ad-at-a-time latch with a watchdog, support checks that never throw, de-duplicated loading progress, pause/mute helpers, and input guards. It has no platform logic. See [docs/runtime.md](docs/runtime.md). |
| `@yes2sdk/js/phaser`, `@yes2sdk/js/three` | Engine helpers: pause and mute around ads and platform events, and resume the AudioContext after every ad. |
| `dist/yes2-runtime.js` | The same runtime as a classic `<script>` (`window.Yes2Runtime`), for games without a bundler. |
| `types/yes2sdk.d.ts` | The public SDK API: the `Yes2SDK` interface, every type it uses, and the `window.Yes2SDK` / `Yes2SDK` globals. It is generated from Core, then committed. |
| `mock/` → `@yes2sdk/js/mock` | The local-development mock. See [docs/mock.md](docs/mock.md). |
| `templates/` | `vanilla-js` (no build step), `vanilla-ts`, `phaser-ts` and `threejs-ts`, all on Vite. |
| `docs/` | [Getting started](docs/getting-started.md), [runtime](docs/runtime.md), [mock](docs/mock.md), [maintaining the types](docs/maintaining-types.md), [E2E tests](docs/e2e.md). |

## Quick start

```sh
git clone https://github.com/yes2games/yes2sdk-js.git
cd yes2sdk-js
npm install                          # also builds the runtime and the mock
npm run dev -w templates/phaser-ts   # or vanilla-ts, threejs-ts, vanilla-js
```

To build a template for upload:

```sh
npm run build -w templates/phaser-ts
# zip the CONTENTS of templates/phaser-ts/dist (index.html at the top of the zip)
```

## In a game

```ts
import { ads, createGameLifecycle, createLoadingProgressReporter, requireSdk } from "@yes2sdk/js";

if (import.meta.env.DEV) {
    (await import("@yes2sdk/js/mock")).installYes2SDKMock();   // local only
}
const sdk = requireSdk();
await sdk.initializeAsync();

const progress = createLoadingProgressReporter();
loader.on("progress", progress.fraction);             // only integer changes reach the SDK
await loadEverything();

const lifecycle = createGameLifecycle({ onPause: pauseGame, onResume: resumeGame }).attach();
await sdk.startGameAsync();                           // once the game is playable

sdk.game.gameplayStart();                             // real gameplay begins
const outcome = await lifecycle.showRewarded("extra-life");
if (outcome === "viewed") player.addLife();
```

TypeScript users get the `window.Yes2SDK` / `Yes2SDK` global types by importing
`@yes2sdk/js`, or with `"types": ["@yes2sdk/js"]` in `tsconfig.json`.

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

## Repo scripts

| Command | What it does |
| --- | --- |
| `npm install` | Installs every workspace and builds the runtime and the mock (`prepare`). |
| `npm run build` | Builds the runtime, the mock and every template, then checks the template builds. |
| `npm run typecheck` | Type-checks everything, including each template. |
| `npm test` | Runs the Vitest suites for the runtime and the mock. |
| `npm run test:e2e:mock` | Runs every template in headless Chromium against the mock, on the Vite dev server and as a production build. Needs `npm run build` and `npx playwright install chromium`. |
| `npm run e2e:prepare-core` / `test:e2e:core` | Real-browser tests against the real Core SDK, injected by the real Dashboard injector. Maintainers only: needs the private Core and Dashboard sources. See [docs/e2e.md](docs/e2e.md). |
| `npm run generate:types` / `check:types` | Regenerates the types, or fails if they are stale. Maintainers only: needs the private Core source. See [docs/maintaining-types.md](docs/maintaining-types.md). |

## License

[MIT](LICENSE) © 2026 Yes2Games
