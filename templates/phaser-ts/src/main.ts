import Phaser from "phaser";
import { createLoadingProgressReporter, installInputGuards } from "@yes2sdk/js";
import { createPhaserLifecycle } from "@yes2sdk/js/phaser";
import { BootScene, GameScene } from "./scenes";
import { loadSdk } from "./sdk";
import { setServices } from "./services";

async function main(): Promise<void> {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
    if (canvas === null) {
        throw new Error("#game-canvas missing from index.html");
    }
    installInputGuards(canvas);

    const sdk = await loadSdk();
    await sdk.initializeAsync(); // before the game boots

    new Phaser.Game({
        type: Phaser.WEBGL, // a provided canvas needs an explicit renderer type
        canvas,
        backgroundColor: "#1d2733",
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 450 },
        scene: [BootScene, GameScene],
        callbacks: {
            // Runs before any scene: the lifecycle pauses the game + mutes on beforeAd and the
            // platform's pause event, and resumes on afterAd / resume.
            preBoot: (game: Phaser.Game): void => {
                const lifecycle = createPhaserLifecycle(game).attach();
                setServices({ sdk, lifecycle, progress: createLoadingProgressReporter() });
            },
        },
    });
}

main().catch((error: unknown) => {
    console.error(error);
    document.body.textContent = error instanceof Error ? error.message : "Failed to start.";
});
