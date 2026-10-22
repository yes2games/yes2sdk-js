/**
 * `@yes2games/js/three`: pause/mute a three.js game around ads and platform events.
 *
 * three.js has no game loop of its own, so the helper exposes a pause flag
 * (`lifecycle.paused`) for your render loop to check, plus an optional
 * `onPauseChange` hook (e.g. to reset a `THREE.Timer`). Audio routed through a
 * `THREE.AudioListener` is muted via its master volume, and its AudioContext is
 * resumed after every ad. The helper wraps `listener.setMasterVolume` to follow the
 * volume your game sets (see `threeMute`), so keep calling it as usual.
 *
 * Typed structurally, so this module does not import three.
 *
 * @example
 * ```ts
 * const lifecycle = createThreeLifecycle({ listener }).attach(); // after initializeAsync
 * renderer.setAnimationLoop((t) => {
 *     if (lifecycle.paused) return;
 *     update(t);
 *     renderer.render(scene, camera);
 * });
 * ```
 */

import { GameLifecycle, type GameLifecycleOptions } from "./lifecycle";

/** The parts of `THREE.AudioListener` the helper uses. */
export interface AudioListenerLike {
    readonly context: BaseAudioContext;
    getMasterVolume(): number;
    setMasterVolume(value: number): unknown;
}

export interface ThreeLifecycleOptions extends GameLifecycleOptions {
    listener?: AudioListenerLike;
    /** Called whenever the pause flag flips. */
    onPauseChange?: (paused: boolean) => void;
}

/**
 * Mutes an `AudioListener` for the lifecycle and gives the game its own volume back afterwards.
 *
 * The volume is never read back once the helper has written it: three's `setMasterVolume()` ramps
 * (`setTargetAtTime`) and `getMasterVolume()` returns the live gain, which lags every write and does
 * not move at all while the AudioContext is suspended, as it often is after an ad. Reading it to save
 * the game's volume would save 0 whenever an ad starts from inside the previous ad's `afterAd`, and
 * the game would stay silent for good. Instead the listener's `setMasterVolume` is wrapped to follow
 * the volume the game asks for; while the helper holds the listener muted, the game's new volume is
 * applied when it unmutes.
 */
function threeMute(listener: AudioListenerLike): (muted: boolean) => void {
    let wanted = listener.getMasterVolume(); // nothing of ours has been written yet
    let held = false;
    const apply = listener.setMasterVolume.bind(listener);
    listener.setMasterVolume = (value: number): unknown => {
        wanted = value;
        return held ? listener : apply(value);
    };
    return (muted: boolean): void => {
        held = muted;
        apply(muted ? 0 : wanted);
    };
}

export function createThreeLifecycle(options: ThreeLifecycleOptions = {}): GameLifecycle {
    const { listener, onPauseChange, ...rest } = options;
    const setMuted = listener === undefined ? undefined : threeMute(listener);
    return new GameLifecycle(
        {
            pause: (): void => onPauseChange?.(true),
            resume: (): void => onPauseChange?.(false),
            setMuted: (muted: boolean): void => setMuted?.(muted),
            audioContexts: (): ReadonlyArray<BaseAudioContext | undefined> => [listener?.context],
        },
        rest
    );
}

export { GameLifecycle } from "./lifecycle";
export type { AdOutcome } from "./ads";
