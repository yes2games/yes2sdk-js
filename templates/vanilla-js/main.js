// @ts-check
/**
 * Minimal Yes2SDK flow, plain JavaScript, no build step, using the
 * @yes2games/js runtime (window.Yes2Runtime):
 *   initializeAsync -> loading progress (integer changes only) -> startGameAsync once playable
 *   gameplayStart / gameplayStop around actual play
 *   interstitial between levels, rewarded for a bonus (one ad at a time, watchdog-protected)
 *   pause/mute for ads and platform events; AudioContext resumed after every ad
 *   save/load with Yes2SDK.data
 *
 * `// @ts-check` + jsconfig.json give editor autocompletion and type errors
 * without compiling anything.
 */

(function () {
    "use strict";

    var COINS_KEY = "coins";
    var R = window.Yes2Runtime;

    /**
     * @template {HTMLElement} T
     * @param {string} id
     * @returns {T}
     */
    function el(id) {
        var node = document.getElementById(id);
        if (node === null) {
            throw new Error("#" + id + " missing from index.html");
        }
        return /** @type {T} */ (node);
    }

    var canvas = /** @type {HTMLCanvasElement} */ (el("game"));
    var ctx2d = canvas.getContext("2d");
    var statusEl = el("status");
    var coinsLabel = el("coins");
    var playBtn = /** @type {HTMLButtonElement} */ (el("play"));
    var finishBtn = /** @type {HTMLButtonElement} */ (el("finish"));
    var rewardBtn = /** @type {HTMLButtonElement} */ (el("reward"));

    var coins = 0;
    var playing = false;
    var paused = false;
    var muted = false;
    var x = 0;
    /** @type {AudioContext | null} */
    var audio = null;
    var started = false;

    /** @param {string} text */
    function setStatus(text) {
        statusEl.textContent = text;
    }

    /** @param {number} value */
    function setCoins(value) {
        coins = value;
        coinsLabel.textContent = String(coins);
        Yes2SDK.data.setInt(COINS_KEY, coins);
    }

    /** A tiny WebAudio blip, so muting and AudioContext resume have something to act on. */
    function blip() {
        if (audio === null) {
            audio = new AudioContext();
        }
        if (muted) {
            return;
        }
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        gain.gain.value = 0.05;
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.08);
    }

    function render() {
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
            ctx2d.fillText(paused ? "paused" : playing ? "playing" + (muted ? " (muted)" : "") : "menu", 10, 20);
        }
        requestAnimationFrame(render);
    }

    /** @param {number} ms */
    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function main() {
        R.installInputGuards(canvas);
        var sdk = R.requireSdk(); // throws a clear message when neither the SDK nor the mock is present
        await sdk.initializeAsync();

        var progress = R.createLoadingProgressReporter();
        var progressLabel = el("progress");
        for (var i = 0; i <= 50; i++) {
            progress.fraction(i / 50); // only integer changes reach the SDK
            progressLabel.textContent = String(Math.floor((i / 50) * 100));
            await wait(10); // stand-in for real asset loading
        }
        setCoins(sdk.data.getInt(COINS_KEY, 0));

        var lifecycle = R.createGameLifecycle({
            onPause: function () {
                paused = true;
            },
            onResume: function () {
                paused = false;
            },
            onMuteChange: function (m) {
                muted = m;
            },
            audioContext: function () {
                return audio;
            },
        }).attach();

        // Debug handle: try `__yes2Template.state()` in the browser console. The repo's E2E
        // suite reads it too. Safe to delete.
        Object.defineProperty(window, "__yes2Template", {
            configurable: true,
            value: {
                template: "vanilla-js",
                lifecycle: lifecycle,
                audioContext: function () {
                    return audio;
                },
                state: function () {
                    return {
                        started: started,
                        playing: playing,
                        paused: paused,
                        muted: muted,
                        audio: audio === null ? "none" : audio.state,
                        coins: coins,
                    };
                },
            },
        });

        el("loading").hidden = true;
        el("hud").hidden = false;
        requestAnimationFrame(render);
        await sdk.startGameAsync(); // only now is the game playable
        started = true;

        playBtn.addEventListener("click", function () {
            playing = true;
            sdk.game.gameplayStart();
            playBtn.disabled = true;
            finishBtn.disabled = false;
            blip();
            setStatus("Level started.");
        });

        finishBtn.addEventListener("click", function () {
            playing = false;
            sdk.game.gameplayStop();
            sdk.game.happyTime();
            setCoins(coins + 1);
            finishBtn.disabled = true;
            setStatus("Level complete. Showing an interstitial…");
            lifecycle.showInterstitial("level-complete").then(function () {
                playBtn.disabled = false;
                setStatus("Ready for the next level.");
            });
        });

        rewardBtn.addEventListener("click", function () {
            if (R.ads.isAdShowing()) {
                return;
            }
            rewardBtn.disabled = true;
            lifecycle
                .showRewarded("bonus-coins", {
                    adViewed: function () {
                        setCoins(coins + 10); // grant ONLY here
                    },
                })
                .then(function (outcome) {
                    setStatus(outcome === "viewed" ? "Reward granted: +10 coins." : outcome === "noFill" ? "No ad right now." : "No reward.");
                    rewardBtn.disabled = false;
                });
        });
    }

    main().catch(function (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : "Failed to start.");
    });
})();
