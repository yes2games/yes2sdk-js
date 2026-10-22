import Phaser from "phaser";
import { services } from "./services";

const COINS_KEY = "coins";
const LEVEL_SECONDS = 8;

/** Loads assets, forwards loader progress, then starts the game once it is playable. */
export class BootScene extends Phaser.Scene {
    constructor() {
        super("Boot");
    }

    preload(): void {
        const { progress } = services();
        this.load.on("progress", (value: number) => progress.fraction(value)); // only integer changes reach the SDK
        // Real games load images/audio here; this template draws its own texture.
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xf5c542).fillCircle(24, 24, 24).generateTexture("coin", 48, 48).destroy();
    }

    create(): void {
        services().progress.percent(100);
        this.scene.start("Game");
    }
}

/** Menu -> level -> interstitial; rewarded ad for bonus coins; coins saved with Yes2SDK.data. */
export class GameScene extends Phaser.Scene {
    private coins = 0;
    private playing = false;
    private timeLeft = 0;
    private coinsText!: Phaser.GameObjects.Text;
    private infoText!: Phaser.GameObjects.Text;
    private coin!: Phaser.GameObjects.Image;

    constructor() {
        super("Game");
    }

    async create(): Promise<void> {
        const { sdk, lifecycle } = services();
        const { width, height } = this.scale;

        this.coins = sdk.data.getInt(COINS_KEY, 0);
        this.coinsText = this.add.text(16, 16, "", { fontSize: "22px", color: "#fff" });
        this.infoText = this.add.text(width / 2, height - 40, "", { fontSize: "18px", color: "#ccc" }).setOrigin(0.5);
        this.updateCoins(0);

        this.coin = this.add.image(width / 2, height / 2, "coin").setInteractive({ useHandCursor: true }).setVisible(false);
        this.coin.on("pointerdown", () => {
            this.updateCoins(1);
            this.coin.setPosition(Phaser.Math.Between(40, width - 40), Phaser.Math.Between(80, height - 80));
        });

        const play = this.button(width / 2 - 140, 60, "Play level", () => {
            play.setVisible(false);
            this.startLevel();
        });
        const reward = this.button(width / 2 + 140, 60, "+10 coins (ad)", async () => {
            if (lifecycle.ads.isAdShowing()) {
                return;
            }
            reward.disableInteractive();
            // The lifecycle pauses the game and mutes sound for the ad, then resumes the AudioContext.
            const outcome = await lifecycle.showRewarded("bonus-coins");
            if (outcome === "viewed") {
                this.updateCoins(10); // grant only when the ad was watched
            }
            this.infoText.setText(outcome === "viewed" ? "Reward granted." : "No reward.");
            reward.setInteractive({ useHandCursor: true });
        });
        this.events.on("level-over", () => play.setVisible(true));
        this.infoText.setText("Press Play.");

        await sdk.startGameAsync(); // the menu is up and interactive: the game is playable
        services().started = true;
    }

    override update(_time: number, delta: number): void {
        if (!this.playing) {
            return;
        }
        this.timeLeft -= delta / 1000;
        this.infoText.setText(`Click the coin! ${Math.ceil(this.timeLeft)}s`);
        if (this.timeLeft <= 0) {
            void this.endLevel();
        }
    }

    private startLevel(): void {
        this.playing = true;
        this.timeLeft = LEVEL_SECONDS;
        this.coin.setVisible(true);
        services().sdk.game.gameplayStart();
    }

    private async endLevel(): Promise<void> {
        const { sdk, lifecycle } = services();
        this.playing = false;
        this.coin.setVisible(false);
        sdk.game.gameplayStop();
        sdk.game.happyTime();
        this.infoText.setText("Level complete!");
        await lifecycle.showInterstitial("level-complete");
        this.events.emit("level-over");
    }

    private updateCoins(delta: number): void {
        this.coins += delta;
        services().coins = this.coins;
        this.coinsText.setText(`Coins: ${this.coins}`);
        services().sdk.data.setInt(COINS_KEY, this.coins);
    }

    private button(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
        return this.add
            .text(x, y, label, { fontSize: "20px", color: "#000", backgroundColor: "#f5c542", padding: { x: 12, y: 6 } })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", onClick);
    }
}
