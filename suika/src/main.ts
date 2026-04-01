import { runBoundsEditor } from "./boundsEditor";
import { SuikaGame } from "./suikaGame";

const STORAGE_KEY = "suikaSettings";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Layout {
  w: number;
  h: number;
  cupX: number;
  cupY: number;
  cupW: number;
  cupH: number;
  dangerY: number;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { music: true, fx: true, haptics: true };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      music: parsed.music !== false,
      fx: parsed.fx !== false,
      haptics: parsed.haptics !== false,
    };
  } catch {
    return { music: true, fx: true, haptics: true };
  }
}

function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error", settings: Settings): void {
  if (!settings.haptics) return;
  const fn = (window as unknown as { triggerHaptic?: (t: string) => void }).triggerHaptic;
  if (typeof fn === "function") fn(type);
}

function wantsBoundsEditor(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (q.has("bounds")) return true;
  const h = window.location.hash.replace(/^#/, "");
  if (h) {
    const hq = new URLSearchParams(h);
    if (hq.has("bounds")) return true;
  }
  return false;
}

if (wantsBoundsEditor()) {
  document.getElementById("startScreen")?.classList.add("hidden");
  document.getElementById("hud")?.classList.add("hidden");
  document.getElementById("settingsBtn")?.classList.add("hidden");
  document.getElementById("settingsModal")?.classList.add("hidden");
  document.getElementById("gameCanvas")?.classList.add("hidden");
  runBoundsEditor();
} else {
  bootstrapGame();
}

function bootstrapGame(): void {
  let settings = loadSettings();
  let layout: Layout = {
    w: 0,
    h: 0,
    cupX: 0,
    cupY: 0,
    cupW: 0,
    cupH: 0,
    dangerY: 0,
  };

  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  const ctx: CanvasRenderingContext2D =
    canvas.getContext("2d") ??
    (() => {
      throw new Error("2D context unavailable");
    })();
  const startScreen = document.getElementById("startScreen")!;
  const btnStart = document.getElementById("btnStart")!;
  const noAssetWarning = document.getElementById("noAssetWarning")!;
  const hud = document.getElementById("hud")!;
  const scoreValue = document.getElementById("scoreValue")!;
  const nextOrb = document.getElementById("nextOrb")!;
  const settingsBtn = document.getElementById("settingsBtn")!;
  const settingsModal = document.getElementById("settingsModal")!;
  const btnCloseSettings = document.getElementById("btnCloseSettings")!;
  const toggleMusic = document.getElementById("toggleMusic")!;
  const toggleFx = document.getElementById("toggleFx")!;
  const toggleHaptics = document.getElementById("toggleHaptics")!;
  const gameOverEl = document.getElementById("gameOver")!;
  const finalScoreEl = document.getElementById("finalScore")!;
  const btnRestart = document.getElementById("btnRestart")!;
  const btnDrop = document.getElementById("btnDrop")!;

  let game: SuikaGame | null = null;
  let playing = false;

  function applyToggleUi(btn: HTMLElement, on: boolean): void {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncSettingsUi(): void {
    applyToggleUi(toggleMusic, settings.music);
    applyToggleUi(toggleFx, settings.fx);
    applyToggleUi(toggleHaptics, settings.haptics);
  }

  function calculateLayout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxCupW = Math.min(w * 0.88, 420);
    const cupW = maxCupW;
    const cupH = Math.min(h * 0.58, cupW * 1.35);
    const cupX = (w - cupW) / 2;
    const cupY = h * 0.14 + (h * 0.72 - cupH) / 2;
    const dangerY = cupY + 72;
    layout = { w, h, cupX, cupY, cupW, cupH, dangerY };
  }

  function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    calculateLayout();
    game?.setLayout(layout);
    console.log("[resizeCanvas]", layout.w + "x" + layout.h);
  }

  function drawCup(): void {
    const { w, h, cupX, cupY, cupW, cupH, dangerY } = layout;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#a8ddff");
    sky.addColorStop(0.42, "#d8f0ff");
    sky.addColorStop(0.75, "#e5f8ef");
    sky.addColorStop(1, "#c5ecba");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sun = ctx.createRadialGradient(w * 0.88, h * 0.06, 0, w * 0.88, h * 0.06, h * 0.38);
    sun.addColorStop(0, "rgba(255, 236, 160, 0.5)");
    sun.addColorStop(1, "rgba(255, 236, 160, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    const cupR = 16;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2d4a6e";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cupX, cupY, cupW, cupH, cupR);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cupX, cupY, cupW, cupH, cupR);
    ctx.stroke();

    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "#ff8b7a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cupX + 10, dangerY);
    ctx.lineTo(cupX + cupW - 10, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#3a4f6c";
    ctx.font = "700 13px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Stay below!", cupX + cupW / 2, dangerY - 10);
  }

  function drawFrame(): void {
    drawCup();
    if (game) {
      if (playing && !game.isGameOver()) {
        game.update(0);
        game.stepPhysics();
      }
      if (playing || game.isGameOver()) {
        game.draw(ctx, layout);
      }
    }
    requestAnimationFrame(drawFrame);
  }

  function openSettings(): void {
    syncSettingsUi();
    settingsModal.classList.remove("hidden");
  }

  function closeSettings(): void {
    settingsModal.classList.add("hidden");
  }

  function showGameOver(score: number): void {
    playing = false;
    finalScoreEl.textContent = String(Math.floor(score));
    gameOverEl.classList.remove("hidden");
    hud.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    btnDrop.classList.add("hidden");
  }

  function updateNextOrbPreview(_assetId: string, url: string): void {
    nextOrb.style.backgroundImage = "url(\"" + url + "\")";
    nextOrb.style.backgroundSize = "contain";
    nextOrb.style.backgroundPosition = "center";
    nextOrb.style.backgroundRepeat = "no-repeat";
  }

  async function onStart(): Promise<void> {
    triggerHaptic("light", settings);
    noAssetWarning.classList.add("hidden");
    calculateLayout();

    if (!game) {
      const g = new SuikaGame(layout, {
        onScoreChange: (n) => {
          scoreValue.textContent = String(Math.floor(n));
        },
        onNextChange: (id, url) => updateNextOrbPreview(id, url),
        onGameOver: (s) => showGameOver(s),
        getSettings: () => ({ haptics: settings.haptics }),
      });
      try {
        const ok = await g.loadAssets();
        if (!ok) {
          g.dispose();
          noAssetWarning.classList.remove("hidden");
          console.log("[onStart]", "no assets");
          return;
        }
        game = g;
      } catch (e) {
        g.dispose();
        noAssetWarning.classList.remove("hidden");
        console.log("[onStart]", "load failed", e);
        return;
      }
    }

    game.resetRound(layout);
    playing = true;
    scoreValue.textContent = "0";
    startScreen.classList.add("hidden");
    gameOverEl.classList.add("hidden");
    hud.classList.remove("hidden");
    settingsBtn.classList.remove("hidden");
    btnDrop.classList.remove("hidden");
    console.log("[onStart]", "playing");
  }

  function sessionScoreUi(): void {
    /* score only in HUD */
  }

  btnStart.addEventListener("click", () => {
    void onStart();
  });

  btnRestart.addEventListener("click", () => {
    triggerHaptic("light", settings);
    void onStart();
  });

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light", settings);
    openSettings();
  });

  btnCloseSettings.addEventListener("click", () => {
    triggerHaptic("light", settings);
    closeSettings();
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  function bindToggle(btn: HTMLElement, key: keyof Pick<Settings, "music" | "fx" | "haptics">): void {
    btn.addEventListener("click", () => {
      triggerHaptic("light", settings);
      settings[key] = !settings[key];
      saveSettings(settings);
      applyToggleUi(btn, settings[key]);
    });
  }

  bindToggle(toggleMusic, "music");
  bindToggle(toggleFx, "fx");
  bindToggle(toggleHaptics, "haptics");

  canvas.addEventListener("pointerdown", (e) => {
    if (!playing || !game || game.isGameOver()) return;
    canvas.setPointerCapture(e.pointerId);
    game.handlePointer(e.clientX, e.clientY, canvas);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!playing || !game) return;
    if (!canvas.hasPointerCapture(e.pointerId)) return;
    game.handlePointer(e.clientX, e.clientY, canvas);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!playing || !game) return;
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    game.pointerLeave();
    if (game.canDrop()) {
      game.tryDrop();
      triggerHaptic("medium", settings);
    }
  });
  canvas.addEventListener("pointercancel", (e) => {
    game?.pointerLeave();
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  btnDrop.addEventListener("click", () => {
    if (!playing || !game) return;
    if (game.canDrop()) {
      game.tryDrop();
      triggerHaptic("medium", settings);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (!playing || !game || game.isGameOver()) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      game.nudgeDropper(canvas, -14);
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      game.nudgeDropper(canvas, 14);
    } else if (e.code === "Space") {
      e.preventDefault();
      if (game.canDrop()) {
        game.tryDrop();
        triggerHaptic("medium", settings);
      }
    }
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  syncSettingsUi();
  resizeCanvas();
  requestAnimationFrame(drawFrame);

  console.log("[bootstrapGame]", "ready");
}
