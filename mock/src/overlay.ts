/**
 * On-screen overlays for mock ads and purchases. They cover the page and block
 * input to the game, like a real fullscreen ad.
 */

import { LOG_PREFIX } from "./internals";

const OVERLAY_STYLE = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:16px",
    "background:rgba(0,0,0,0.88)",
    "color:#fff",
    "font:600 18px/1.4 system-ui,sans-serif",
    "text-align:center",
    "padding:24px",
].join(";");

const BUTTON_STYLE = "font:inherit;padding:8px 18px;border-radius:6px;border:0;cursor:pointer";

export type AdOverlayResult = "completed" | "viewed" | "dismissed";

function canUseDom(): boolean {
    return typeof document !== "undefined" && document.body !== null;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.style.cssText = BUTTON_STYLE;
    el.addEventListener("click", onClick);
    return el;
}

function shell(attr: string, title: string): { root: HTMLDivElement; text: HTMLDivElement; buttons: HTMLDivElement } {
    const root = document.createElement("div");
    root.setAttribute(attr, "");
    root.style.cssText = OVERLAY_STYLE;
    // Swallow input so nothing reaches the game underneath.
    for (const type of ["pointerdown", "pointerup", "click", "keydown", "keyup", "touchstart", "wheel"]) {
        root.addEventListener(type, (event) => event.stopPropagation());
    }
    const heading = document.createElement("div");
    heading.textContent = `${LOG_PREFIX} ${title}`;
    const text = document.createElement("div");
    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:12px";
    root.append(heading, text, buttons);
    document.body.appendChild(root);
    return { root, text, buttons };
}

/**
 * Show a mock ad with a countdown. Interstitial: Close. Rewarded: Claim Reward /
 * Skip. When the countdown ends the ad completes by itself.
 * Without a DOM, just waits.
 */
export function showAdOverlay(kind: "interstitial" | "rewarded", placement: string, seconds: number): Promise<AdOverlayResult> {
    return new Promise((resolve) => {
        if (!canUseDom()) {
            setTimeout(() => resolve("completed"), seconds * 1000);
            return;
        }
        const { root, text, buttons } = shell("data-yes2sdk-mock-ad", `${kind} ad "${placement}"`);
        let left = Math.ceil(seconds);
        let done = false;
        const finish = (result: AdOverlayResult): void => {
            if (done) {
                return;
            }
            done = true;
            clearInterval(interval);
            clearTimeout(timeout);
            root.remove();
            resolve(result);
        };
        const render = (): void => {
            text.textContent = left > 0 ? `Ends in ${left}s` : "Ending…";
        };
        render();
        const interval = setInterval(() => {
            left = Math.max(0, left - 1);
            render();
        }, 1000);
        const timeout = setTimeout(() => finish("completed"), seconds * 1000);
        if (kind === "interstitial") {
            buttons.append(button("Close", () => finish("completed")));
        } else {
            buttons.append(
                button("Claim Reward", () => finish("viewed")),
                button("Skip", () => finish("dismissed"))
            );
        }
    });
}

/** Buy / Cancel dialog for a mock purchase. Without a DOM, resolves "buy" on the next tick. */
export function showPurchaseDialog(title: string, price: string): Promise<"buy" | "cancel"> {
    return new Promise((resolve) => {
        if (!canUseDom()) {
            setTimeout(() => resolve("buy"), 0);
            return;
        }
        const { root, text, buttons } = shell("data-yes2sdk-mock-iap", "purchase");
        text.textContent = `${title} for ${price}`;
        const finish = (result: "buy" | "cancel"): void => {
            root.remove();
            resolve(result);
        };
        buttons.append(
            button("Buy", () => finish("buy")),
            button("Cancel", () => finish("cancel"))
        );
    });
}
