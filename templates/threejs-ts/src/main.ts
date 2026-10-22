/**
 * three.js + Yes2SDK: init -> loading progress -> startGame once playable, a timed
 * "level" bracketed by gameplayStart/Stop, an interstitial after each level, a
 * rewarded ad for bonus coins, coins saved with Yes2SDK.data. The render loop
 * honours `lifecycle.paused` (ads and platform pause events).
 */

import * as THREE from "three";
import { createLoadingProgressReporter, installInputGuards } from "@yes2games/js";
import { createThreeLifecycle } from "@yes2games/js/three";
import { loadSdk } from "./sdk";

const COINS_KEY = "coins";
const LEVEL_SECONDS = 8;

function el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (node === null) {
        throw new Error(`#${id} missing from index.html`);
    }
    return node as T;
}

const canvas = el<HTMLCanvasElement>("game-canvas");
const status = el<HTMLParagraphElement>("status");
const coinsLabel = el<HTMLElement>("coins");
const playBtn = el<HTMLButtonElement>("play");
const rewardBtn = el<HTMLButtonElement>("reward");

async function main(): Promise<void> {
    installInputGuards(canvas);
    const sdk = await loadSdk();
    await sdk.initializeAsync();

    // Real loading goes through THREE.LoadingManager; forward its progress the same way.
    const progress = createLoadingProgressReporter();
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total): void => progress.fraction(total > 0 ? loaded / total : 1);
    for (let p = 0; p <= 100; p += 10) {
        progress.percent(p); // stand-in for assets loading
        status.textContent = `Loading… ${p}%`;
        await new Promise((resolve) => setTimeout(resolve, 40));
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d2733);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 5);
    const listener = new THREE.AudioListener(); // attach THREE.Audio sources to this
    camera.add(listener);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xf5c542 }));
    scene.add(cube);

    const timer = new THREE.Timer();
    // Pause flag for the loop + listener mute + AudioContext resume after every ad.
    const lifecycle = createThreeLifecycle({
        listener,
        onPauseChange: (paused) => {
            if (!paused) {
                timer.reset(); // no time jump on the first frame after an ad
            }
        },
    }).attach();

    let coins = sdk.data.getInt(COINS_KEY, 0);
    let playing = false;
    let timeLeft = 0;
    let started = false;

    // Debug handle: try `__yes2Template.state()` in the browser console. The repo's E2E suite
    // reads it too. Safe to delete.
    Object.defineProperty(window, "__yes2Template", {
        configurable: true,
        value: {
            template: "threejs-ts",
            lifecycle,
            audioContext: (): BaseAudioContext => listener.context,
            state: () => ({
                started,
                playing,
                paused: lifecycle.paused,
                muted: listener.getMasterVolume() === 0,
                audio: listener.context.state,
                coins,
            }),
        },
    });
    const setCoins = (value: number): void => {
        coins = value;
        coinsLabel.textContent = String(coins);
        sdk.data.setInt(COINS_KEY, coins);
    };
    setCoins(coins);

    async function endLevel(): Promise<void> {
        playing = false;
        sdk.game.gameplayStop();
        sdk.game.happyTime();
        status.textContent = "Level complete!";
        await lifecycle.showInterstitial("level-complete");
        playBtn.disabled = false;
    }

    renderer.setAnimationLoop((time) => {
        if (lifecycle.paused) {
            return; // ad on screen or platform pause: no simulation, no rendering
        }
        timer.update(time);
        const dt = timer.getDelta();
        cube.rotation.x += dt * (playing ? 2 : 0.4);
        cube.rotation.y += dt * (playing ? 3 : 0.6);
        if (playing) {
            timeLeft -= dt;
            status.textContent = `Click the cube! ${Math.ceil(timeLeft)}s`;
            if (timeLeft <= 0) {
                void endLevel();
            }
        }
        renderer.render(scene, camera);
    });

    const raycaster = new THREE.Raycaster();
    canvas.addEventListener("pointerdown", (event) => {
        if (!playing || lifecycle.paused) {
            return;
        }
        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObject(cube).length > 0) {
            setCoins(coins + 1);
        }
    });

    playBtn.addEventListener("click", () => {
        playing = true;
        timeLeft = LEVEL_SECONDS;
        playBtn.disabled = true;
        sdk.game.gameplayStart();
    });

    rewardBtn.addEventListener("click", () => {
        if (lifecycle.ads.isAdShowing()) {
            return;
        }
        rewardBtn.disabled = true;
        void lifecycle.showRewarded("bonus-coins").then((outcome) => {
            if (outcome === "viewed") {
                setCoins(coins + 10); // grant only when the ad was watched
            }
            status.textContent = outcome === "viewed" ? "Reward granted." : "No reward.";
            rewardBtn.disabled = false;
        });
    });

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    el<HTMLElement>("ui").hidden = false;
    status.textContent = "Press Play.";
    await sdk.startGameAsync(); // rendering and interactive: the game is playable
    started = true;
}

main().catch((error: unknown) => {
    console.error(error);
    status.textContent = error instanceof Error ? error.message : "Failed to start.";
});
