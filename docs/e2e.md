# End-to-end tests (Playwright, Chromium)

The E2E suite runs every template in headless Chromium, against the mock and against the real
SDK. Playwright is pinned to an exact version in `package.json`.

```sh
npm run build                     # runtime, mock, and every template's dist/
npx playwright install chromium   # once per machine (CI: --with-deps)
npm run test:e2e:mock             # mock-dev + mock-built
npm run test:e2e                  # every project; real-core skips unless prepared
```

## Projects

| Project | What is served | How |
| --- | --- | --- |
| `mock-dev` | Each template's Vite dev server, with the mock imported under `import.meta.env.DEV` (vanilla-js: Vite as a static server). This is the developer experience. | Playwright starts `vite` on ports 5181 to 5184. |
| `mock-built` | Each template's production artifact: `templates/<t>/dist`, or the vanilla-js folder itself. Vite builds leave the mock out, so `e2e/server.ts` adds `<script src="yes2sdk-mock.js">` before the first script, as a developer would to try a build locally. | `node e2e/server.ts` on port 4173, `/built/<t>/`. |
| `real-core` | The production artifact after the **real** Dashboard injector added the **real** Core SDK, configured for platform `debug`. Opt-in, see below. | The same server, `/real/<t>/`. |

Each template exposes a small debug handle, `window.__yes2Template` (`state()`, `lifecycle`,
`audioContext()`, plus `game` in Phaser). The specs read it to see the game's pause, mute and
audio state. Phaser checks also read `game.isPaused` and `game.sound.mute` directly.

What every template is checked for, in both mock projects:

- `initializeAsync` → integer loading progress up to 100 → `startGameAsync`, once each, in order.
- An interstitial pauses and mutes the game while it shows, resumes it after, and leaves the
  AudioContext `running` (the test suspends it during the ad, so only the lifecycle's
  `resume()` can bring it back).
- Rewarded ads through the template's own button: **Claim Reward** grants, **Skip** does not.
  Callback order for viewed and dismissed, and for ads that run out their countdown.
- A concurrent ad gets `noFill` only, and the first ad is unaffected.
- `Yes2SDKMock.simulate("pause" | "resume")` pauses and resumes the game. An ad ending during a
  platform pause does not resume it early.
- Blocked ads, the platform mute switch (starting muted too), and an ad chained from `afterAd`
  while the AudioContext is still suspended.
- Saved data survives a reload. The game canvas carries `data-yes2-canvas`.
- No `console.error` and no uncaught exception on the page (a fixture fails the test otherwise).

## Real-Core mode (maintainers)

The real-Core project needs the private Core and Dashboard sources, so it is opt-in. Prepare
the injected builds, then run it:

```sh
npm run build
YES2SDK_CORE_REF=origin/main npm run e2e:prepare-core   # or YES2SDK_CORE_DIST=<a Core build>
npm run test:e2e:core
```

`scripts/prepare-real-core.ts`:

1. Gets Core. With `YES2SDK_CORE_DIST` it copies an existing build's `yes2sdk.umd.js` and
   chunks. Otherwise it checks `YES2SDK_CORE_REF` (default `HEAD`) of the Core repo
   (`YES2SDK_CORE_DIR`, default `../Core`) out with `git worktree add` into a temp dir, runs
   `npm ci && npm run build` there, and removes the worktree. Core's own working tree is never
   touched.
2. Bundles the Dashboard's `api/src/utils/sdk-injector.ts` (`YES2SDK_DASHBOARD_DIR`, default
   `../Dashboard`) with esbuild into a temp file and calls its `injectSDK` unchanged, with
   platform `debug`, on a copy of each template's artifact.
3. Writes the result to `e2e/.real-core/` (git-ignored) with a manifest: the Core version and
   commit, the Dashboard commit, and a hash of each template build. If a template is rebuilt
   afterwards, its tests fail and ask you to prepare again.

Why `debug`: it is the platform Core loads for local hosts and the QA Inspector, and the only one
that runs without a third-party SDK. The dashboard writes it into
`window.__yes2sdkConfig.platform`, which Core's platform detection reads before any host rule.

What real-Core mode checks, per template: the mock stands down (`Yes2SDK.isMock` is unset and
there is no `Yes2SDKMock`), `Yes2SDK.version` equals the prepared Core version, the platform is
`debug`, and init and start succeed. It also checks interstitial, rewarded (viewed and
dismissed), no-fill, blocked and chained ads through the runtime with the right callback order,
that the latch rejects a concurrent ad, and that pause and resume work through Core's
`on("pause")` path. The debug platform has no native pause signal, so Core uses
`visibilitychange`, which the test emulates. Saved data survives a reload. Debug ads end when
the page receives `{ type: "yes2sdk:ad-dismissed" }`, the message the QA Inspector sends, and
take their outcome from `{ type: "yes2sdk:mock", setting, value }`.

Without a prepared `e2e/.real-core/`, every real-Core test is skipped and the run prints why.
CI cannot run this project, because Core is private.

## Notes

- Playwright runs `page.evaluate` and `waitForFunction` with a user gesture, so the page counts
  as activated once a test polls it. An autoplay-policy flag therefore cannot reproduce a page
  that was never activated. The templates are still clicked through Playwright's mouse first,
  as a player would, and the audio assertions suspend the context during the ad themselves.
- Phaser resumes its own WebAudio context when the game resumes. For Phaser, the "running after
  the ad" check therefore shows the end state, but it does not single out the runtime's
  `resume()`. The vanilla and three templates do.
