# Changelog

All notable changes to `@yes2sdk/js` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.1.0 (2026-10-22)


### Features

* scaffold yes2sdk-js (types, runtime, mock, templates) ([96968e9](https://github.com/yes2games/yes2sdk-js/commit/96968e9622a84300d8f7e94e93679e369ec4437c))
* **templates:** mark the game canvas with data-yes2-canvas and add a debug handle ([0761002](https://github.com/yes2games/yes2sdk-js/commit/0761002c5c0044a7eb63aa39b2439cc87928ca00))


### Bug Fixes

* **ci:** parse npm pack JSON past prepare output on npm 10 ([4e862b0](https://github.com/yes2games/yes2sdk-js/commit/4e862b053cc2f95c9b2ab031b9939122815327d9))
* **package:** make declarations resolve under nodenext and check the tarball ([9fb6b8c](https://github.com/yes2games/yes2sdk-js/commit/9fb6b8cac70e7e36b5a91ac53440347c9d441404))
* **release:** start at 0.1.0 and keep breaking changes on minor before 1.0 ([be6175a](https://github.com/yes2games/yes2sdk-js/commit/be6175ad1c20e1696bc83ce69ba53439ab8f7769))
* **runtime:** report never-shown ads as noFill and stop engine helpers sticking muted ([d2213d0](https://github.com/yes2games/yes2sdk-js/commit/d2213d038225bdd36f323e0eeb85f70ad66228f4))

## [Unreleased]

### Added

- Runtime layer (`@yes2sdk/js`), with the same behaviour as the Unity and Defold wrappers:
  a one-ad-at-a-time latch (`ads.isAdShowing()`), a frame-time watchdog (30 s to start,
  180 s to finish, 0.5 s frame cap), per-request ids with stale-callback drops, ordered
  `afterAd` delivery for retries made inside `noFill`, isolated game callbacks, support checks
  that never throw, de-duplicated loading progress, input guards, and an opt-in
  unhandled-rejection filter for SDK errors. Also available as a classic script
  (`dist/yes2-runtime.js`, `window.Yes2Runtime`).
- Lifecycle helpers: `createGameLifecycle` (generic hooks), `@yes2sdk/js/phaser` and
  `@yes2sdk/js/three`. They pause and mute around ads and the platform's pause events, and
  resume the AudioContext after every ad.
- `types/yes2sdk.d.ts`: public type declarations for `window.Yes2SDK`, generated from
  Yes2SDK Core v2.12.0.
- `@yes2sdk/js/mock`: a local-development mock of `window.Yes2SDK`, modelled on the Unity
  Editor simulation. It has an ad overlay, configurable ad and IAP results, a mock catalog,
  `simulate()` triggers, and settings from options or `?yes2mock=` that persist across
  reloads. It never installs over the real SDK.
- Templates: `vanilla-js`, `vanilla-ts`, `phaser-ts` and `threejs-ts`.
- Docs: getting started, runtime, mock, maintaining the types, E2E tests.
- Real-browser E2E suite (Playwright, Chromium): every template against the mock (Vite dev server
  and production build) and, opt-in for maintainers, against the real Core SDK injected by the
  real Dashboard injector.
- Templates mark their game canvas with `data-yes2-canvas`, which the dashboard's screenshot
  capture prefers. `verify-builds` checks for it.

### Fixed

- Phaser and three helpers: an ad started from the previous ad's `afterAd` while the
  AudioContext was still suspended left the game muted for good. The helpers saved the game's
  mute state by reading `sound.mute` / `getMasterVolume()`, which lag behind writes. They now
  follow the game's own writes instead.
- Ads: `afterAd` with no `beforeAd` and no outcome (how Core settles a blocked or failed
  interstitial) resolved `"shown"`. It now gives `noFill` then `afterAd` and resolves `"noFill"`.
- Packaging: published declarations used extensionless relative imports, which
  `moduleResolution: node16/nodenext` rejects. `sideEffects` no longer marks the classic
  scripts (`yes2-runtime.js`, the mock IIFE) as side-effect free.
