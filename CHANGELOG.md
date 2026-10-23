# Changelog

All notable changes to `@yes2games/js` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.1](https://github.com/yes2games/yes2sdk-js/compare/v0.1.0...v0.1.1) (2026-10-23)


### Documentation

* make the README the developer-site landing page ([2aae23e](https://github.com/yes2games/yes2sdk-js/commit/2aae23e7d89a55c43f9b9adb8fbee76740b5c5fb))

## 0.1.0 (2026-10-22)

First release.

### Added

- Runtime layer (`@yes2games/js`), with the same behaviour as the Unity and Defold wrappers:
  a one-ad-at-a-time latch (`ads.isAdShowing()`), a frame-time watchdog (30 s to start,
  180 s to finish, 0.5 s frame cap), per-request ids with stale-callback drops, ordered
  `afterAd` delivery for retries made inside `noFill`, isolated game callbacks, support checks
  that never throw, de-duplicated loading progress, input guards, and an opt-in
  unhandled-rejection filter for SDK errors. Also available as a classic script
  (`dist/yes2-runtime.js`, `window.Yes2Runtime`).
- Lifecycle helpers: `createGameLifecycle` (generic hooks), `@yes2games/js/phaser` and
  `@yes2games/js/three`. They pause and mute around ads and the platform's pause events, and
  resume the AudioContext after every ad.
- `types/yes2sdk.d.ts`: public type declarations for `window.Yes2SDK`, generated from
  Yes2SDK Core v2.12.0.
- `@yes2games/js/mock`: a local-development mock of `window.Yes2SDK`, modelled on the Unity
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
