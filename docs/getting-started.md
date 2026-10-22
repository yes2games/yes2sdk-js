# Getting started

## The workflow

```
your game code ──> calls window.Yes2SDK
       │
       ├── local dev:  the mock provides window.Yes2SDK (fake ads, localStorage saves)
       │
       └── upload:     plain build zip ──> Yes2Games Dashboard
                                             └── injects the real SDK for each platform
```

You never ship the SDK yourself, and you never write platform-specific code. A single
build is published to every platform the dashboard targets.

## The lifecycle every game needs

```ts
// 1. Initialize first. Nothing else is reliable before this resolves.
await Yes2SDK.initializeAsync();

// 2. Report loading progress while you load assets. The reporter forwards only
//    integer changes to Yes2SDK.setLoadingProgress, however often your loader fires.
const progress = createLoadingProgressReporter();   // from "@yes2sdk/js"
loader.onProgress = (fraction) => progress.fraction(fraction);

// 3. Tell the platform the game is ready, but only once it is actually playable.
await Yes2SDK.startGameAsync();

// 4. Bracket REAL gameplay (not menus, not loading screens), explicitly.
Yes2SDK.game.gameplayStart();   // level begins
Yes2SDK.game.gameplayStop();    // level over / pause menu / death
```

Call `gameplayStart()` and `gameplayStop()` yourself. On some platforms the SDK also stops
and restarts gameplay around ads, but the platforms' rules still require these calls. They
are idempotent, and `analytics.logLevelStart()`/`logLevelEnd()` share the same state, so
calling both never signals twice.

## Ads

Show ads through the runtime's `ads` (or an engine lifecycle helper), not `Yes2SDK.ads`
directly. The runtime adds the one-ad-at-a-time latch and the watchdog; see
[runtime.md](runtime.md). Pause and mute in `beforeAd`, resume in `afterAd`, and grant
rewards **only** in `adViewed`.

```ts
import { ads } from "@yes2sdk/js";

await ads.showInterstitial("level-complete", {
    beforeAd: () => game.pause(),
    afterAd: () => game.resume(),   // always called exactly once, even on no-fill
});

await ads.showRewarded("extra-life", {
    beforeAd: () => game.pause(),
    adViewed: () => player.addLife(),      // the ONLY place to grant the reward
    adDismissed: () => showToast("No reward"),
    noFill: () => showToast("No ad right now"),
    afterAd: () => game.resume(),
});
```

What the SDK guarantees:

- **Rewarded ads** end with exactly one of `adViewed`, `adDismissed` or `noFill`,
  followed by exactly one `afterAd`.
- **Interstitials** end with exactly one `afterAd`. When no ad can be shown, `noFill`
  comes first.

You still have to pause your own game loop and audio. `createGameLifecycle()`,
`@yes2sdk/js/phaser` and `@yes2sdk/js/three` do it for you, including the SDK's
pause/resume events and resuming the AudioContext after every ad.

## Platform pause, resume and mute

Some platforms require games to obey their pause and mute signals:

```ts
if (!Yes2SDK.session.isAudioEnabled()) audio.mute();
Yes2SDK.on("audioEnabledChange", ({ enabled }) => audio.setMuted(!enabled));
Yes2SDK.on("pause", () => game.pause());
Yes2SDK.on("resume", () => game.resume());
```

On platforms without a native pause signal, `pause` and `resume` follow page visibility.

## Saving data

```ts
Yes2SDK.data.setInt("coins", 120);
const coins = Yes2SDK.data.getInt("coins", 0);
await Yes2SDK.data.flushAsync();        // at checkpoints, to make sure it is persisted
```

Storage goes to the platform's cloud save where one exists, and to local storage
otherwise. The mock uses `localStorage` under a `yes2sdk-mock:` prefix.

## Optional features

Leaderboards, IAP, achievements, tournaments and the other optional modules exist only on
some platforms. Always check before using them:

```ts
if (Yes2SDK.leaderboard.isSupported()) {
    await Yes2SDK.leaderboard.setScoreAsync("main", score);
}
```

## Errors

The SDK throws, or rejects with, plain objects (`Yes2SDKError`), **not** `Error`
instances. Branch on `code`:

```ts
import type { Yes2SDKError } from "@yes2sdk/js";

try {
    await Yes2SDK.iap.purchaseAsync({ productId: "gems_100" });
} catch (e) {
    const err = e as Yes2SDKError;
    if (err.code === "FEATURE_NOT_SUPPORTED") hideShop();
}
```

## Preparing your upload

1. Build (`npm run build` in a Vite template), or use your folder as-is (vanilla-js).
2. Zip the **contents** of the build folder so that `index.html` sits at the top level of
   the zip.
3. Use **relative** URLs only (`./assets/x.js`, not `/assets/x.js`). Platforms serve games
   from a sub-path, so root-absolute URLs fail. The Vite templates set `base: "./"`.
4. Do not add SDK `<script>` tags or files; the dashboard injects them. (The mock tag in the
   vanilla-js template is fine; it steps aside.) Your own copy of `@yes2sdk/js`, bundled or
   as `yes2-runtime.js`, belongs in the zip.
5. Keep a `<canvas>` element in the page. The dashboard's screenshot tool looks for one.
6. Upload the zip to the Yes2Games Dashboard.
