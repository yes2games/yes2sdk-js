# Yes2SDK template: Phaser 3 + TypeScript + Vite

```sh
npm run dev       # local play with the Yes2SDK mock
npm run build     # production build in dist/ (no mock, relative paths)
```

`src/sdk.ts` installs the mock only under `import.meta.env.DEV`, so Vite leaves it out of
`dist/`. In a dashboard-bundled build, the real SDK is already on the page before your code
runs. The template adds no SDK `<script>` tags of its own. Its `<canvas>` carries
`data-yes2-canvas`: mark your game canvas so the dashboard captures the right one.

`createPhaserLifecycle(game)` from `@yes2games/js/phaser` pauses the game (`game.pause()`) and mutes `game.sound` on `beforeAd` and the platform's `pause` event. It resumes on `afterAd` / `resume`, and resumes `game.sound.context` after every ad. Scenes call `lifecycle.showInterstitial()` / `showRewarded()`; `showRewarded` resolves `"viewed"` only when the reward should be granted.

The flow: `initializeAsync`, loader progress through `createLoadingProgressReporter` (integer
changes only), `startGameAsync` once playable, explicit `gameplayStart`/`gameplayStop`, an
interstitial after each level, a rewarded ad for bonus coins, and saves through
`Yes2SDK.data`. `installInputGuards` stops space and arrow keys from scrolling the host page
and focuses the canvas.

## Upload

Zip the **contents** of `dist/` (`index.html` at the top of the zip) and upload the zip to the
Yes2Games Dashboard. `vite.config.ts` sets `base: "./"`, so every asset URL is relative, as
platforms require.

## Using this template outside the yes2sdk-js repo

Change `"@yes2games/js": "file:../.."` in `package.json` to the published version of
`@yes2games/js`.
