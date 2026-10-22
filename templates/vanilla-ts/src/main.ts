/**
 * Minimal Yes2SDK flow with the @yes2sdk/js runtime:
 *   initializeAsync -> loading progress (integer changes only) -> startGameAsync once playable
 *   gameplayStart / gameplayStop around actual play
 *   interstitial between levels, rewarded for a bonus (one ad at a time, watchdog-protected)
 *   pause/mute for ads and platform events; AudioContext resumed after every ad
 *   save/load with Yes2SDK.data
 */

import {
    ads,
    createGameLifecycle,
    createLoadingProgressReporter,
    installInputGuards,
    installSdkRejectionHandler,
    type Yes2SDK,
} from "@yes2sdk/js";
import { loadSdk } from "./sdk";

const COINS_KEY = "coins";

function el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (node === null) {
        throw new Error(`#${id} missing from index.html`);
    }
    return node as T;
}

const canvas = el<HTMLCanvasElement>("game");
const ctx2d = canvas.getContext("2d");
const status = el<HTMLParagraphElement>("status");
const coinsLabel = el<HTMLElement>("coins");
const playBtn = el<HTMLButtonElement>("play");
const finishBtn = el<HTMLButtonElement>("finish");
const rewardBtn = el<HTMLButtonElement>("reward");

let coins = 0;
let playing = false;
let paused = false;
let muted = false;
let x = 0;
let audio: AudioContext | null = null;
let started = false;

function setStatus(text: string): void {
    status.textContent = text;
}

function setCoins(sdk: Yes2SDK, value: number): void {
    coins = value;
    coinsLabel.textContent = String(coins);
    sdk.data.setInt(COINS_KEY, coins);
}

/** A tiny WebAudio blip, so muting and AudioContext resume have something to act on. */
function blip(): void {
    audio ??= new AudioContext();
    if (muted) {
        return;
    }
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.08);
}

function render(): void {
    if (ctx2d !== null) {
        if (playing && !paused) {
            x = (x + 3) % canvas.width;
        }
        ctx2d.fillStyle = "#1d2733";
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.fillStyle = paused ? "#666" : "#f5c542";
        ctx2d.beginPath();
        ctx2d.arc(x, canvas.height / 2, 20, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.fillStyle = "#eee";
        ctx2d.fillText(paused ? "paused" : playing ? `playing${muted ? " (muted)" : ""}` : "menu", 10, 20);
    }
    requestAnimationFrame(render);
}

async function loadAssets(onFraction: (f: number) => void): Promise<void> {
    // Stand-in for real loading: report as often as your loader likes; only integer changes are sent.
    for (let i = 0; i <= 50; i++) {
        onFraction(i / 50);
        el<HTMLElement>("progress").textContent = String(Math.floor((i / 50) * 100));
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function main(): Promise<void> {
    installInputGuards(canvas); // no page scrolling on space/arrows; canvas gets focus
    installSdkRejectionHandler(); // optional: quieten unhandled SDK { code, message } rejections

    const sdk = await loadSdk();
    await sdk.initializeAsync();

    const progress = createLoadingProgressReporter();
    await loadAssets(progress.fraction);
    setCoins(sdk, sdk.data.getInt(COINS_KEY, 0));

    const lifecycle = createGameLifecycle({
        onPause: () => (paused = true),
        onResume: () => (paused = false),
        onMuteChange: (m) => (muted = m),
        audioContext: () => audio,
    }).attach();

    // Debug handle: try `__yes2Template.state()` in the browser console. The repo's E2E suite
    // reads it too. Safe to delete.
    Object.defineProperty(window, "__yes2Template", {
        configurable: true,
        value: {
            template: "vanilla-ts",
            lifecycle,
            audioContext: (): AudioContext | null => audio,
            state: () => ({ started, playing, paused, muted, audio: audio?.state ?? "none", coins }),
        },
    });

    el<HTMLElement>("loading").hidden = true;
    el<HTMLElement>("hud").hidden = false;
    requestAnimationFrame(render);
    await sdk.startGameAsync(); // only now is the game playable
    started = true;

    playBtn.addEventListener("click", () => {
        playing = true;
        sdk.game.gameplayStart(); // the player is actually playing
        playBtn.disabled = true;
        finishBtn.disabled = false;
        blip();
        setStatus("Level started.");
    });

    finishBtn.addEventListener("click", () => {
        playing = false;
        sdk.game.gameplayStop(); // back to a menu
        sdk.game.happyTime();
        setCoins(sdk, coins + 1);
        finishBtn.disabled = true;
        setStatus("Level complete. Showing an interstitial…");
        void lifecycle.showInterstitial("level-complete").then(() => {
            playBtn.disabled = false;
            setStatus("Ready for the next level.");
        });
    });

    rewardBtn.addEventListener("click", () => {
        if (ads.isAdShowing()) {
            return;
        }
        rewardBtn.disabled = true;
        void lifecycle
            .showRewarded("bonus-coins", {
                adViewed: () => setCoins(sdk, coins + 10), // grant ONLY here
            })
            .then((outcome) => {
                setStatus(
                    outcome === "viewed" ? "Reward granted: +10 coins." : outcome === "noFill" ? "No ad right now." : "No reward."
                );
                rewardBtn.disabled = false;
            });
    });
}

main().catch((error: unknown) => {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "Failed to start.");
});
