# The runtime layer (`@yes2sdk/js`)

A thin layer you bundle with your game. It wraps the injected `window.Yes2SDK` and adds
what the Unity and Defold wrappers add. It contains no platform logic. Everything the SDK
already does (callback ordering, gameplay bracketing around ads, visibility-based pause,
audio suspension, letterboxing, preroll, platform detection, placement validation, data
prefixing and flushing) is left to the SDK.

## Ads: `ads.showInterstitial` / `ads.showRewarded`

```ts
import { ads } from "@yes2sdk/js";

const outcome = await ads.showRewarded("extra-life", {
    beforeAd: pause,
    adViewed: grantReward,   // the only place to grant (or check outcome === "viewed")
    afterAd: resume,         // always last, exactly once
});
```

The promise never rejects. It resolves `"shown"` (interstitial), `"viewed"`, `"dismissed"`
or `"noFill"`.

| Guarantee | Behaviour |
| --- | --- |
| One ad at a time | From a `show*` call until its ad is released, `ads.isAdShowing()` is `true`. A concurrent `show*` call gets **`noFill` only**: no `afterAd`, which would resume your game while the first ad is still on screen. The first ad is never affected. |
| Watchdog | The ad gets **30 s** to reach `beforeAd`, then **180 s** from `beforeAd` to `afterAd`. Time is counted in animation-frame time, with each frame adding **at most 0.5 s**, so a hidden tab cannot trip it. When it fires, the latch is released, then you get `noFill` → `afterAd` (the ad never started) or just `afterAd` (it had started). A rewarded ad with no outcome gets `adDismissed` first; `adViewed` is never invented. |
| Request ids | Each call is its own request. Callbacks that arrive after their request was released (for example, a platform answering after the watchdog fired) are dropped and never reach a newer ad. |
| Retry inside `noFill` | The latch is free in `noFill`, so you may retry from there. The first ad's `afterAd` is delivered **before** the retry starts, exactly once. |
| Isolated callbacks | Each of your callbacks runs in its own try/catch. A throw is logged as `[Yes2SDK] <name> callback threw:` with the stack, and the next callback still runs. The latch is released before your `afterAd`/`noFill` runs, so you can chain another ad from there. |
| No fill | `noFill` then `afterAd`, the same as Core and Defold. |
| SDK call failed | If the SDK rejects without calling back (for example, before `initializeAsync`), you get `noFill` then `afterAd` on the following frames. If it rejects after settling the ad (blocked or error), nothing extra is delivered. |
| Ad that never showed | `afterAd` with no `beforeAd` and no outcome means the ad never appeared; Core settles a blocked or failed interstitial that way. You get `noFill` then `afterAd`, and the promise resolves `"noFill"`, not `"shown"`. |

### Support checks

`ads.isInterstitialSupported()`, `isRewardedSupported()`, `isBannerSupported()`,
`isRewardedAdAvailable()` and `isAdBlocked()`, plus `isModuleSupported("leaderboard")` and
`hasMethod("player", "getBotAvatarAsync")`, all return **false**, and never throw, when the
injected runtime is older than the method or missing entirely.

## Pause, mute and audio: `createGameLifecycle`, `/phaser`, `/three`

```ts
const lifecycle = createGameLifecycle({ onPause, onResume, onMuteChange, audioContext }).attach();
await lifecycle.showInterstitial("level-complete");
```

- Pauses and mutes on `beforeAd` and the SDK's `pause` event. Resumes on `afterAd` and
  `resume`. Each source is tracked separately, so an ad that ends during a platform pause
  does not resume early.
- Follows the platform mute switch (`audioEnabledChange`, plus the initial
  `session.isAudioEnabled()`).
- Resumes the AudioContext after every ad, from `afterAd` and again when the show promise
  settles.
- `@yes2sdk/js/phaser`: `createPhaserLifecycle(game)` uses `game.pause()`/`resume()`,
  `game.sound.mute` and `game.sound.context`. It follows your own mute choice through the sound
  manager's `"mute"` event and restores that afterwards. It never reads `sound.mute` back,
  because that getter lags behind writes while the AudioContext is suspended.
- `@yes2sdk/js/three`: `createThreeLifecycle({ listener, onPauseChange })` exposes
  `lifecycle.paused` for your render loop, mutes the `AudioListener` and resumes its context. It
  wraps `listener.setMasterVolume` to follow the volume you set, because three's volume ramps
  and `getMasterVolume()` lags. A volume you set while the game is muted applies when it
  unmutes.

Call `attach()` after `initializeAsync()`.

## Other helpers

- `createLoadingProgressReporter()`: `.fraction(0..1)` / `.percent(0..100)` forward to
  `setLoadingProgress` only when the integer percentage changes.
- `installInputGuards(canvas)`: stops space, arrow and page keys from scrolling the host page,
  and focuses the canvas on load and on click.
- `installSdkRejectionHandler()` (opt-in): turns unhandled SDK `{ code, message }` rejections
  into a single warning. Other rejections are untouched.
- `requireSdk()` / `getSdk()`: the injected SDK, with a clear error, or `undefined`.

## Without a bundler

Load `dist/yes2-runtime.js` with a classic `<script>` tag and use `window.Yes2Runtime` (see
`templates/vanilla-js`). Use either the classic script or the ES module on one page, not
both: each has its own ad latch.
