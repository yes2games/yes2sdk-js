/**
 * `@yes2sdk/js/phaser`: pause/mute a Phaser 3 game around ads and platform events.
 *
 * - `beforeAd` and the SDK's `pause` event: `game.pause()` and `game.sound.mute = true`.
 * - `afterAd` and `resume`: `game.resume()` and the game's own mute choice. While the helper
 *   holds the game muted, a write of `sound.mute = false` by the game is applied only when the
 *   helper unmutes.
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
    readonly sound: {
        mute: boolean;
        readonly context?: BaseAudioContext;
        /** Phaser's sound managers are event emitters: `"mute"` fires on every write to `mute`. */
        on?(event: "mute", listener: (manager: unknown, muted: boolean) => void): unknown;
    };
}

/**
 * Mutes `game.sound` for the lifecycle and gives the game its own mute choice back afterwards.
 *
 * The choice is never read back from `game.sound.mute` once the helper has written to it: with
 * WebAudio that getter reads a gain node, which only changes when the AudioContext renders. Right
 * after a write, and for as long as the context is suspended (as it often is after an ad), it
 * returns the old value. Reading it to save the game's state would then save "muted" whenever an ad
 * starts from inside the previous ad's `afterAd`, and the game would stay muted for good. Instead
 * the game's own writes are followed through the sound manager's `"mute"` event.
 */
function phaserMute(game: PhaserGameLike): (muted: boolean) => void {
    let gameMuted: boolean | null = null; // the game's own choice; null until first needed
    let held = false; // the lifecycle is muting the game
    let writing = false;
    const write = (muted: boolean): void => {
        writing = true;
        try {
            game.sound.mute = muted;
        } finally {
            writing = false;
        }
    };
    const follow = (): boolean => {
        if (gameMuted !== null) {
            return true;
        }
        if (typeof game.sound.on !== "function") {
            return false;
        }
        gameMuted = game.sound.mute; // nothing of ours has been written yet, so this is the game's
        game.sound.on("mute", (_manager: unknown, muted: boolean): void => {
            if (writing) {
                return;
            }
            gameMuted = muted;
            if (held && !muted) {
                write(true); // keep quiet until the lifecycle unmutes; the game's choice applies then
            }
        });
        return true;
    };
    let fallbackBefore = false; // without "mute" events: the old read-back behaviour
    return (muted: boolean): void => {
        const following = follow();
        held = muted;
        if (muted) {
            if (!following) {
                fallbackBefore = game.sound.mute;
            }
            write(true);
        } else {
            write(following ? (gameMuted ?? false) : fallbackBefore);
        }
    };
}

export function createPhaserLifecycle(game: PhaserGameLike, options: GameLifecycleOptions = {}): GameLifecycle {
    const setMuted = phaserMute(game);
    return new GameLifecycle(
        {
            pause: (): void => game.pause(),
            resume: (): void => game.resume(),
            setMuted,
            audioContexts: (): ReadonlyArray<BaseAudioContext | undefined> => [game.sound.context],
        },
        options
    );
}

export { GameLifecycle } from "./lifecycle";
export type { AdOutcome } from "./ads";
