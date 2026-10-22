/**
 * `@yes2sdk/js`: the runtime layer games bundle themselves.
 *
 * It wraps the injected `window.Yes2SDK` (it never contains the SDK, nor any
 * platform logic) and adds what the Unity and Defold wrappers add: a one-ad-at-a-time
 * latch with a watchdog, never-throwing support checks, loading-progress
 * de-duplication, pause/mute helpers and input hygiene.
 *
 * Importing this module also brings the `window.Yes2SDK` / `Yes2SDK` global types.
 */

export type * from "../types/yes2sdk";

export { ads, AdRuntime } from "./ads";
export type { AdKind, AdOutcome, AdRuntimeOptions } from "./ads";
export { animationFrameClock, ManualFrameClock, onNextFrame } from "./frame-clock";
export type { FrameClock } from "./frame-clock";
export { installInputGuards } from "./input";
export type { InputGuardOptions } from "./input";
export { createGameLifecycle, GameLifecycle } from "./lifecycle";
export type { GameLifecycleOptions, LifecycleTarget, VanillaLifecycleOptions } from "./lifecycle";
export { createLoadingProgressReporter } from "./loading";
export type { LoadingProgressReporter } from "./loading";
export { installSdkRejectionHandler, isSdkError } from "./rejections";
export { consoleLogger, getSdk, LOG_PREFIX, requireSdk } from "./sdk";
export type { RuntimeLogger } from "./sdk";
export { hasMethod, isModuleSupported } from "./support";
export type { SupportModule } from "./support";
