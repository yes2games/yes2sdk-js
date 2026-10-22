/**
 * Frame time source for the ad watchdog and next-frame delivery.
 *
 * Time is counted in animation frames, not wall-clock time: a hidden tab
 * produces no frames, so an ad cannot be timed out while the player is away.
 */

/** Calls `onFrame(dtSeconds)` once per frame until the returned function is called. */
export interface FrameClock {
    subscribe(onFrame: (dtSeconds: number) => void): () => void;
}

function now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** `requestAnimationFrame` clock, with a ~60 Hz timer fallback where rAF does not exist. */
export const animationFrameClock: FrameClock = {
    subscribe(onFrame: (dtSeconds: number) => void): () => void {
        let active = true;
        let last: number | undefined;
        const step = (time: number): void => {
            const dt = last === undefined ? 0 : Math.max(0, (time - last) / 1000);
            last = time;
            onFrame(dt);
        };
        if (typeof requestAnimationFrame === "function") {
            let handle = 0;
            const tick = (time: number): void => {
                if (!active) {
                    return;
                }
                step(time);
                if (active) {
                    handle = requestAnimationFrame(tick);
                }
            };
            handle = requestAnimationFrame(tick);
            return (): void => {
                active = false;
                cancelAnimationFrame(handle);
            };
        }
        const interval = setInterval(() => {
            if (active) {
                step(now());
            }
        }, 16);
        return (): void => {
            active = false;
            clearInterval(interval);
        };
    },
};

/** Run `fn` on the next frame of `clock`. Returns a canceller. */
export function onNextFrame(clock: FrameClock, fn: () => void): () => void {
    let done = false;
    let unsubscribe: (() => void) | null = null;
    unsubscribe = clock.subscribe(() => {
        if (done) {
            return;
        }
        done = true;
        unsubscribe?.();
        fn();
    });
    return (): void => {
        done = true;
        unsubscribe?.();
    };
}

/** A clock you advance by hand, for tests. */
export class ManualFrameClock implements FrameClock {
    private readonly listeners = new Set<(dtSeconds: number) => void>();

    subscribe(onFrame: (dtSeconds: number) => void): () => void {
        this.listeners.add(onFrame);
        return (): void => {
            this.listeners.delete(onFrame);
        };
    }

    /** Advance one frame of `dtSeconds`. */
    tick(dtSeconds = 1 / 60): void {
        for (const listener of [...this.listeners]) {
            if (this.listeners.has(listener)) {
                listener(dtSeconds);
            }
        }
    }

    /** Advance `seconds` in frames of `frameSeconds`. */
    advance(seconds: number, frameSeconds = 0.25): void {
        let left = seconds;
        while (left > 1e-9) {
            const dt = Math.min(frameSeconds, left);
            this.tick(dt);
            left -= dt;
        }
    }

    /** Number of active subscriptions (watchdogs and pending next-frame calls). */
    get pending(): number {
        return this.listeners.size;
    }
}
