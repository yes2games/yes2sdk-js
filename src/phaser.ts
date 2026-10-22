/**
 * `@yes2sdk/js/phaser`: pause/mute a Phaser 3 game around ads and platform events.
 *
 * - `beforeAd` and the SDK's `pause` event: `game.pause()` and `game.sound.mute = true`.
 * - `afterAd` and `resume`: `game.resume()` and the previous mute state.
 * - After every ad (from `afterAd` and again when the show promise settles):
 *   `game.sound.context.resume()` if the WebAudio context was left suspended.
 *
 * Typed structurally, so this module does not import Phaser.
 *
 * @example
 * ```ts
 * const lifecycle = createPhaserLifecycle(game).attach(); // after initializeAsync
 * const outcome = await lifecycle.showRewarded("extra-life");
 * if (outcome === "viewed") player.addLife();
 * ```
 */

import { GameLifecycle, type GameLifecycleOptions } from "./lifecycle";

/** The parts of `Phaser.Game` the helper uses. */
export interface PhaserGameLike {
    pause(): void;
    resume(): void;
    readonly sound: { mute: boolean; readonly context?: BaseAudioContext };
}

export function createPhaserLifecycle(game: PhaserGameLike, options: GameLifecycleOptions = {}): GameLifecycle {
    let mutedBefore = false;
    return new GameLifecycle(
        {
            pause: (): void => game.pause(),
            resume: (): void => game.resume(),
            setMuted: (muted: boolean): void => {
                if (muted) {
                    mutedBefore = game.sound.mute;
                    game.sound.mute = true;
                } else {
                    game.sound.mute = mutedBefore;
                }
            },
            audioContexts: (): ReadonlyArray<BaseAudioContext | undefined> => [game.sound.context],
        },
        options
    );
}

export { GameLifecycle } from "./lifecycle";
export type { AdOutcome } from "./ads";
