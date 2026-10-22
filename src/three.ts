/**
 * `@yes2sdk/js/three`: pause/mute a three.js game around ads and platform events.
 *
 * three.js has no game loop of its own, so the helper exposes a pause flag
 * (`lifecycle.paused`) for your render loop to check, plus an optional
 * `onPauseChange` hook (e.g. to reset a `THREE.Timer`). Audio routed through a
 * `THREE.AudioListener` is muted via its master volume, and its AudioContext is
 * resumed after every ad.
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
    setMasterVolume(value: number): void;
}

export interface ThreeLifecycleOptions extends GameLifecycleOptions {
    listener?: AudioListenerLike;
    /** Called whenever the pause flag flips. */
    onPauseChange?: (paused: boolean) => void;
}

export function createThreeLifecycle(options: ThreeLifecycleOptions = {}): GameLifecycle {
    const { listener, onPauseChange, ...rest } = options;
    let volumeBefore = 1;
    return new GameLifecycle(
        {
            pause: (): void => onPauseChange?.(true),
            resume: (): void => onPauseChange?.(false),
            setMuted: (muted: boolean): void => {
                if (listener === undefined) {
                    return;
                }
                if (muted) {
                    volumeBefore = listener.getMasterVolume();
                    listener.setMasterVolume(0);
                } else {
                    listener.setMasterVolume(volumeBefore);
                }
            },
            audioContexts: (): ReadonlyArray<BaseAudioContext | undefined> => [listener?.context],
        },
        rest
    );
}

export { GameLifecycle } from "./lifecycle";
export type { AdOutcome } from "./ads";
