# Changelog

All notable changes to `@yes2sdk/js` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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
- Docs: getting started, runtime, mock, maintaining the types.
