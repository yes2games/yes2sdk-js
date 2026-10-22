# Yes2SDK template: three.js + TypeScript + Vite

```sh
npm run dev       # local play with the Yes2SDK mock
npm run build     # production build in dist/ (no mock, relative paths)
```

`src/sdk.ts` installs the mock only under `import.meta.env.DEV`, so Vite leaves it out of
`dist/`. In a dashboard-bundled build, the real SDK is already on the page before your code
runs. The template adds no SDK `<script>` tags of its own, and `index.html` keeps a `<canvas>`
for the dashboard's screenshot tool.

`createThreeLifecycle({ listener, onPauseChange })` from `@yes2sdk/js/three` exposes `lifecycle.paused` (the render loop skips frames while it is true), mutes the `AudioListener`, and resumes its AudioContext after every ad.

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

Change `"@yes2sdk/js": "file:../.."` in `package.json` to the published version of
`@yes2sdk/js`.
