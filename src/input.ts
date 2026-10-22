/**
 * Keyboard and focus hygiene for games embedded in a platform page (an iframe):
 * stop space/arrow keys from scrolling the host page, and give the canvas focus
 * so key events reach the game.
 */

const SCROLL_KEYS = new Set([" ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);

export interface InputGuardOptions {
    /** Call `preventDefault` on space/arrow/page keys. Default true. */
    preventScrollKeys?: boolean;
    /** Focus the canvas now and on every pointer down. Default true. */
    focusCanvas?: boolean;
}

/** Install the guards. Returns a function that removes them. */
export function installInputGuards(canvas: HTMLCanvasElement | null, options: InputGuardOptions = {}): () => void {
    if (typeof window === "undefined") {
        return (): void => undefined;
    }
    const cleanups: Array<() => void> = [];
    if (options.preventScrollKeys !== false) {
        const onKey = (event: KeyboardEvent): void => {
            const target = event.target as HTMLElement | null;
            const editing = target !== null && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            if (!editing && SCROLL_KEYS.has(event.key)) {
                event.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey, { passive: false });
        cleanups.push(() => window.removeEventListener("keydown", onKey));
    }
    if (canvas !== null && options.focusCanvas !== false) {
        if (!canvas.hasAttribute("tabindex")) {
            canvas.setAttribute("tabindex", "0");
        }
        const focus = (): void => canvas.focus({ preventScroll: true });
        focus();
        canvas.addEventListener("pointerdown", focus);
        cleanups.push(() => canvas.removeEventListener("pointerdown", focus));
    }
    return (): void => cleanups.forEach((fn) => fn());
}
