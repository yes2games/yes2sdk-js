# The mock

The mock is a local-development stand-in for `window.Yes2SDK`, modelled on the Unity Editor
simulation. It was written from scratch and shares no code with the SDK. It reports its
platform as `"debug"`. Its TypeScript source is typed against `types/yes2sdk.d.ts`, so when
the SDK's API changes and the types are regenerated, the mock stops compiling until it is
updated.

Every call logs a line prefixed `[Yes2SDK] Mock:`.

## Installing

| Context | How |
| --- | --- |
| Bundler (Vite etc.) | `if (import.meta.env.DEV) { (await import("@yes2sdk/js/mock")).installYes2SDKMock(options) }` |
| Plain `<script>` | `<script src="yes2sdk-mock.js"></script>` before your game scripts. Options go in `window.__yes2sdkMockOptions = {...}`, set before the tag. |
| Unit tests | `createYes2SDKMock(options)` returns an instance without touching `window`. |

`installYes2SDKMock()` returns `null`, and does nothing, if `window.__yes2sdkConfig` or a
non-mock `window.Yes2SDK` already exists, so it never replaces the real SDK. Once installed,
the controls are on `window.Yes2SDKMock`.

## Behaviour

| Module | Mock behaviour |
| --- | --- |
| core | `initializeAsync` and `startGameAsync` resolve on the next frame. `getPlatform()` is `"debug"`. `startGameAsync` rejects with `NOT_INITIALIZED` before init. |
| session | Locale `"en"`, device `"desktop"`, orientation `"landscape"`, audio enabled, entry point `"direct"`, entry data `{}` (configurable), country `""`. |
| ads | **normal**: `beforeAd`, then 3 s (interstitial) or 5 s (rewarded), then the outcome (rewarded), then `afterAd`. **nofill / adblocked / error**: no `beforeAd`; `noFill` then `afterAd`. *adblocked* and *error* then reject with `ADS_BLOCKED` / `PLATFORM_ERROR` (as the SDK does), and *adblocked* makes `isAdBlocked()` true. `isRewardedAdAvailable`, `isInterstitialSupported` and `isRewardedSupported` are true. |
| ad overlay | Optional and on by default. A full-screen overlay that blocks input, with a countdown. Interstitials have **Close**; rewarded ads have **Claim Reward** (`adViewed`) and **Skip** (`adDismissed`). When the countdown ends, the configured outcome is used. |
| iap | Catalog: `yes2.mock.coins.small` $0.99, `yes2.mock.coins.large` $4.99, `yes2.mock.noads` $2.99. Purchases last for the session; `consumePurchaseAsync` removes one. With the overlay on, a Buy / Cancel dialog appears. The *fail* and *cancel* settings reject with `IAP_PURCHASE_FAILED` / `IAP_PURCHASE_CANCELLED`. A second purchase while one is open **rejects** with `INVALID_OPERATION`. Subscriptions are unsupported. |
| data | `localStorage` with the SDK's `yes2sdk_` prefix. Confirmed writes (`set*Async`, `flushAsync`) resolve `true`, or `false` if storage throws. |
| player | Anonymous player. `get/setDataAsync` use a JSON store. Connected players and bot avatars are unsupported. |
| leaderboard, stats, friends, auth sign-in, and achievements, tournament, context, notifications, referrals, config, review | `isSupported()` is `false`; async calls reject with `FEATURE_NOT_SUPPORTED`. |
| banners, score | Log only; `isSupported()` is `false`. |
| game, analytics | Log. Gameplay start/stop shares one flag between `game.*` and `analytics.logLevel*`. |

## Settings

All settings come from one options object and/or the `?yes2mock=` query parameter, and are
kept in `localStorage` (`yes2sdk-mock-settings`), so they survive reloads. Precedence:
defaults < saved < options in code < query.

| Setting | Values | Default |
| --- | --- | --- |
| `adResult` | `normal`, `nofill`, `adblocked`, `error` | `normal` |
| `rewardedOutcome` | `viewed`, `dismissed` | `viewed` |
| `interstitialSeconds` / `rewardedSeconds` | number | 3 / 5 |
| `overlay` | boolean | `true` in a browser |
| `iapResult` | `normal`, `fail`, `cancel` | `normal` |
| `audioEnabled` | boolean | `true` |
| `entryPointData` | object | `{}` |
| `silent` | boolean | `false` |

Query examples: `?yes2mock=nofill`, `?yes2mock=adblocked,dismissed`,
`?yes2mock=iap:cancel,overlay:off,interstitial:1`, and `?yes2mock=reset` (forget saved
settings).

## Controls

```js
Yes2SDKMock.simulate("pause");                 // also "resume", "exitRequested"
Yes2SDKMock.simulate("audioEnabledChange");    // toggles; or pass true / false
Yes2SDKMock.configure({ adResult: "nofill" }); // saved, like query settings
Yes2SDKMock.settings;                          // current settings
Yes2SDKMock.reset();                           // back to defaults
Yes2SDKMock.clearStorage();                    // remove saved game data
```

`window.Yes2SDK.isMock === true` tells you that you are running against the mock.
