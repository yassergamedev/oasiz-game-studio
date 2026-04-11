import { getBallAssets } from "./ballAssets";
import { createSuikaAudio } from "./gameAudio";
import { drawGameBg, drawGameplayAtmosphere, loadGameBgImage } from "./gameBg";
import { BottomSparkles } from "./bottomSparkles";
import { MergeFanfare } from "./mergeFanfare";
import { MergeJuice, mergeWordTier } from "./mergeJuice";
import { drawProceduralCupNet } from "./cupNetProcedural";
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

/**
 * Y coordinate of the cup top must be at least this value so the rim / net stay below the HTML HUD
 * (mirrors suika/index.html --settings-top + row height + gap).
 */
function measureTopHudClearancePx(w: number, h: number, pointerCoarse: boolean): number {
  const vmin = Math.min(w, h);
  const vh = h;
  const topInset = pointerCoarse
    ? Math.max(120, Math.min(0.38 * vmin, 0.26 * vmin + 0.01 * vh))
    : Math.max(45, Math.min(0.12 * vmin, 0.055 * vmin + 0.012 * vh));
  const hudRowH = Math.min(72, Math.max(44, 0.13 * vmin));
  const settingsBtnH = Math.min(56, Math.max(44, 0.115 * vmin));
  const blockH = Math.max(hudRowH, settingsBtnH);
  return topInset + blockH + 12;
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
/** Start menu ball pit — uses suika/assets sprites when available, else colored placeholders. */
function initStartMenuBallField(): void {
  const layer = document.querySelector("#startScreen .start-balls-layer");
  if (!layer) return;
  layer.innerHTML = "";
  const assets = getBallAssets();
  const useSprites = assets.length > 0;
  const colors = [
    "#ff9f43",
    "#ffb8c8",
    "#7dcc7a",
    "#ffe566",
    "#7ec8e3",
    "#c9a0ff",
    "#ff8b7a",
    "#98e0d0",
    "#ffd54d",
    "#a8e6cf",
    "#ffab91",
    "#80deea",
  ];
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cols = coarse ? 6 : 11;
  const rows = coarse ? 9 : 9;
  const total = cols * rows;
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const wave = col + row;
    const b = document.createElement("span");
    b.className = "menu-silly-ball";
    if (i % 3 === 0) b.classList.add("menu-silly-ball--rev");
    if (i % 5 === 0) b.classList.add("menu-silly-ball--wobble");
    b.setAttribute("aria-hidden", "true");
    const jx = Math.sin(i * 1.6180339) * 4.2;
    const jy = Math.cos(i * 2.7182818) * 4.2;
    let leftPct: number;
    let topPct: number;
    if (coarse) {
      const jitterX =
        Math.sin(i * 2.47) * cellW * 0.26 + Math.cos(i * 3.19) * cellW * 0.11;
      const jitterY =
        Math.cos(i * 1.91) * cellH * 0.22 + Math.sin(i * 2.73) * cellH * 0.09;
      leftPct = cellW * (col + 0.5) + jitterX;
      topPct = cellH * (row + 0.5) + jitterY;
    } else {
      leftPct = 2 + (col / Math.max(1, cols - 1)) * 96 + jx * 0.12;
      topPct = 3 + (row / Math.max(1, rows - 1)) * 94 + jy * 0.1;
    }
    const clampedLeft = Math.max(1, Math.min(99, leftPct));
    const clampedTop = Math.max(1, Math.min(99, topPct));
    b.style.left = clampedLeft + "%";
    b.style.top = clampedTop + "%";
    const sz = coarse
      ? 20 + (i % 5) * 4 + (wave % 3) * 3
      : 16 + (i % 8) * 5 + (wave % 4) * 3;
    b.style.width = sz + "px";
    b.style.height = sz + "px";
    const rotDeg = (i * 47) % 28 - 14;
    b.style.setProperty("--wave", String(wave));
    b.style.setProperty("--rot", rotDeg + "deg");
    const diagSigns: [number, number][] = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const [sx, sy] = diagSigns[i % 4];
    const diagMag = coarse ? 1.55 + (wave % 4) * 0.32 : 2.45 + (wave % 5) * 0.4;
    b.style.setProperty("--diag-x", sx * diagMag + "vmin");
    b.style.setProperty("--diag-y", sy * diagMag + "vmin");
    b.style.opacity = String(useSprites ? 0.42 + ((i + wave * 2) % 5) * 0.06 : 0.3 + ((i + wave * 2) % 5) * 0.07);
    b.style.zIndex = String(1 + (i % 4));
    if (useSprites) {
      b.classList.add("menu-silly-ball--sprite");
      const asset = assets[i % assets.length];
      const img = document.createElement("img");
      img.src = asset.url;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      b.appendChild(img);
    } else {
      b.style.background = colors[i % colors.length];
    }
    layer.appendChild(b);
  }
  console.log(
    "[initStartMenuBallField]",
    String(total),
    coarse ? "coarse layout" : "fine layout",
    useSprites ? "sprite orbs" : "placeholder orbs",
    useSprites ? "(" + String(assets.length) + " assets)" : "",
  );
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
  document.getElementById("gameplayShell")?.classList.add("hidden");
  document.getElementById("settingsModal")?.classList.add("hidden");
  runBoundsEditor();
} else {
  bootstrapGame();
}
function bootstrapGame(): void {
  let settings = loadSettings();
  const audio = createSuikaAudio();
  audio.applySettings(settings.music, settings.fx);
  audio.setGameplayActive(false);
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
  /** Logical (CSS px) coords in all draw calls; backing store = inner size × DPR. */
  let canvasDpr = 1;
  /** WebViews often skip pointerup or never grant capture; track the active pointer explicitly. */
  let canvasPointerActive = false;
  let canvasPointerId: number | null = null;
  const startScreen = document.getElementById("startScreen")!;
  const gameplayShell = document.getElementById("gameplayShell")!;
  const mergeJuiceRoot = document.getElementById("mergeJuiceRoot");
  const btnStart = document.getElementById("btnStart")!;
  const noAssetWarning = document.getElementById("noAssetWarning")!;
  const hud = document.getElementById("hud")!;
  const scoreValue = document.getElementById("scoreValue")!;
  const nextOrb = document.getElementById("nextOrb")!;
  const evolutionChain = document.getElementById("evolutionChain")!;
  const settingsBtn = document.getElementById("settingsBtn")!;
  const settingsModal = document.getElementById("settingsModal")!;
  const btnCloseSettings = document.getElementById("btnCloseSettings")!;
  const toggleMusic = document.getElementById("toggleMusic")!;
  const toggleFx = document.getElementById("toggleFx")!;
  const toggleHaptics = document.getElementById("toggleHaptics")!;
  const gameOverEl = document.getElementById("gameOver")!;
  const finalScoreEl = document.getElementById("finalScore")!;
  const btnRestart = document.getElementById("btnRestart")!;
  let game: SuikaGame | null = null;
  let playing = false;
  const GO_ZOOM_MS = 1180;
  const GO_FOG_MS = 720;
  const GO_PANEL_MS = 1950;
  const GO_MAX_ZOOM = 1.4;
  const MERGE_CELEBRATION_DEBOUNCE_MS = 85;
  type GameOverPhase = "none" | "dramatic" | "panel";
  let gameOverPhase: GameOverPhase = "none";
  let gameOverDramaStartedAt = 0;
  let gameOverPanelRevealPending = false;
  let mergeCelebrationTimer = 0;
  let pendingMergeCelebration:
    | {
        payload: {
          x: number;
          y: number;
          newTier: number;
          prevTier: number;
          scoreAdd: number;
        };
        tier: ReturnType<typeof mergeWordTier>;
      }
    | null = null;
  function smoothstep01(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }
  let gameBgImage: HTMLImageElement | null = null;
  void loadGameBgImage().then((im) => {
    gameBgImage = im;
  });
  const bottomSparkles = new BottomSparkles();
  const mergeJuice = new MergeJuice();
  const mergeFanfare = new MergeFanfare();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frameClockMs = performance.now();
  /** requestAnimationFrame id — cancel + reschedule on visibility so the loop survives app resume. */
  let renderRafId = 0;
  /** Cache DOM style strings to avoid redundant per-frame style writes (prevents zoom/jank stutter). */
  let mergeRootLastTransform = "";
  let mergeRootLastOrigin = "";
  /** Avoid forced reflow (`offsetWidth`) when restarting CSS animations during gameplay events. */
  const pendingAnimRestartFrames = new Map<string, number[]>();
  /** When > 0, cup net scales up from this time (gameplay intro). */
  let netIntroStartedAtMs = 0;
  let hudIntroClearTimer = 0;
  function applyToggleUi(btn: HTMLElement, on: boolean): void {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function syncSettingsUi(): void {
    applyToggleUi(toggleMusic, settings.music);
    applyToggleUi(toggleFx, settings.fx);
    applyToggleUi(toggleHaptics, settings.haptics);
    audio.applySettings(settings.music, settings.fx);
  }
  function restartCssAnimationClass(el: HTMLElement, className: string): void {
    const key = (el.id || "anon") + "::" + className;
    const pending = pendingAnimRestartFrames.get(key);
    if (pending) {
      for (const id of pending) {
        cancelAnimationFrame(id);
      }
    }
    el.classList.remove(className);
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        el.classList.add(className);
        pendingAnimRestartFrames.delete(key);
      });
      pendingAnimRestartFrames.set(key, [r1, r2]);
    });
    pendingAnimRestartFrames.set(key, [r1]);
  }
  function calculateLayout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const maxCupW = Math.min(w * 0.88, 420);
    const cupW = maxCupW;
    const cupX = (w - cupW) / 2;

    const topClear = measureTopHudClearancePx(w, h, coarse);
    const bottomPad = coarse ? Math.max(90, h * 0.2) : Math.max(68, h * 0.16);
    const verticalBudget = Math.max(0, h - topClear - bottomPad);

    const nominalCupH = Math.min(h * 0.58, cupW * 1.35);
    const MIN_CUP_H = 108;
    let cupH = Math.min(nominalCupH, verticalBudget);
    cupH = Math.max(cupH, Math.min(MIN_CUP_H, verticalBudget));

    let cupY = h * 0.14 + (h * 0.72 - cupH) / 2;
    cupY = Math.max(topClear, cupY);
    cupY = Math.min(cupY, h - bottomPad - cupH);

    const dangerY = cupY + 72;
    layout = { w, h, cupX, cupY, cupW, cupH, dangerY };
  }
  function resizeCanvas(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 3);
    canvasDpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    calculateLayout();
    game?.setLayout(layout);
    console.log("[resizeCanvas]", layout.w + "x" + layout.h + " @dpr " + dpr);
  }
  function drawCup(): void {
    const { w, h, cupX, cupY, cupW, cupH, dangerY } = layout;
    const cupR = 16;
    const bgImg = gameBgImage;
    if (
      game !== null &&
      bgImg !== null &&
      bgImg.complete &&
      bgImg.naturalWidth > 0
    ) {
      drawGameBg(ctx, bgImg, w, h);
    } else {
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
    }
    const mjFlash = mergeJuice.getFlash();
    if (mjFlash > 0.004) {
      const combo = mergeJuice.getCombo();
      ctx.fillStyle = "rgba(255, 247, 218," + (mjFlash * 0.32) + ")";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255, 205, 130," + (mjFlash * (0.12 + combo * 0.022)) + ")";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(170, 228, 255," + (mjFlash * (0.07 + combo * 0.012)) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    const infernoHeat = game !== null ? mergeJuice.getInfernoHeat() : 0;
    if (infernoHeat > 0.02) {
      ctx.fillStyle = "rgba(255, 95, 40, " + (infernoHeat * 0.38).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255, 40, 20, " + (infernoHeat * 0.22).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255, 200, 80, " + (infernoHeat * 0.12).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    if (game !== null) {
      drawGameplayAtmosphere(ctx, w, h);
    }
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
    const nowMs = performance.now();
    const dt = Math.min(0.055, (nowMs - frameClockMs) / 1000);
    frameClockMs = nowMs;
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    mergeJuice.update(dt);
    drawCup();
    mergeFanfare.update(dt);
    if (game) {
      if (playing && !game.isGameOver()) {
        game.update(0);
        game.stepPhysics();
      }
      if (playing || game.isGameOver()) {
        const loseRamp =
          gameOverPhase === "dramatic"
            ? smoothstep01((nowMs - gameOverDramaStartedAt) / 540)
            : 1;
        game.draw(ctx, layout, nowMs, loseRamp, reduceMotion);
        mergeFanfare.draw(ctx, layout.w, layout.h, nowMs);
        drawProceduralCupNet(
          ctx,
          layout,
          mergeJuice.getInfernoHeat(),
          nowMs,
          getNetIntroScale(nowMs),
        );
      }
    }
    if (gameOverPhase === "dramatic" && game !== null && game.isGameOver()) {
      const elapsed = nowMs - gameOverDramaStartedAt;
      const fogU = smoothstep01(elapsed / GO_FOG_MS);
      const fogA = fogU * 0.78;
      ctx.fillStyle = "rgba(6, 8, 18, " + fogA.toFixed(4) + ")";
      ctx.fillRect(0, 0, layout.w, layout.h);
      ctx.fillStyle = "rgba(0, 0, 0, " + (fogU * 0.22).toFixed(4) + ")";
      ctx.fillRect(0, 0, layout.w, layout.h);
      if (elapsed >= GO_PANEL_MS && !gameOverPanelRevealPending) {
        gameOverPanelRevealPending = true;
        revealGameOverPanel();
      }
    }
    const sparklesOn = !reduceMotion && game !== null && playing && !game.isGameOver();
    bottomSparkles.update(dt, layout, sparklesOn);
    if (sparklesOn) {
      bottomSparkles.draw(ctx, layout, true);
    }
    if (mergeJuiceRoot) {
      if (gameOverPhase === "dramatic" && game !== null && game.isGameOver() && !reduceMotion) {
        const elapsed = nowMs - gameOverDramaStartedAt;
        const zoomU = smoothstep01(elapsed / GO_ZOOM_MS);
        const zs = 1 + (GO_MAX_ZOOM - 1) * zoomU;
        const focus = game.getGameOverFocus();
        const ox = focus ? focus.cx : layout.cupX + layout.cupW * 0.5;
        const oy = focus ? focus.cy : layout.dangerY + (layout.cupY + layout.cupH - layout.dangerY) * 0.35;
        const nextOrigin = ox.toFixed(1) + "px " + oy.toFixed(1) + "px";
        const nextTransform = "scale(" + zs.toFixed(4) + ")";
        if (nextOrigin !== mergeRootLastOrigin) {
          mergeJuiceRoot.style.transformOrigin = nextOrigin;
          mergeRootLastOrigin = nextOrigin;
        }
        if (nextTransform !== mergeRootLastTransform) {
          mergeJuiceRoot.style.transform = nextTransform;
          mergeRootLastTransform = nextTransform;
        }
      } else {
        const juiceOn = !reduceMotion && game !== null && playing && !game.isGameOver();
        if (juiceOn) {
          const sh = mergeJuice.getShakePx();
          const ox = layout.cupX + layout.cupW * 0.5;
          const oy = layout.dangerY + (layout.cupY + layout.cupH - layout.dangerY) * 0.4;
          const nextOrigin = ox.toFixed(1) + "px " + oy.toFixed(1) + "px";
          const nextTransform = "translate(" + sh.x.toFixed(2) + "px," + sh.y.toFixed(2) + "px)";
          if (nextOrigin !== mergeRootLastOrigin) {
            mergeJuiceRoot.style.transformOrigin = nextOrigin;
            mergeRootLastOrigin = nextOrigin;
          }
          if (nextTransform !== mergeRootLastTransform) {
            mergeJuiceRoot.style.transform = nextTransform;
            mergeRootLastTransform = nextTransform;
          }
        } else {
          if (mergeRootLastOrigin !== "") {
            mergeJuiceRoot.style.transformOrigin = "";
            mergeRootLastOrigin = "";
          }
          if (mergeRootLastTransform !== "") {
            mergeJuiceRoot.style.transform = "";
            mergeRootLastTransform = "";
          }
        }
      }
    }
    renderRafId = requestAnimationFrame(drawFrame);
  }
  function kickRenderLoop(): void {
    cancelAnimationFrame(renderRafId);
    renderRafId = requestAnimationFrame(drawFrame);
  }
  function onAppForeground(): void {
    console.log("[bootstrapGame]", "foreground: reset clock, pointer, rAF");
    frameClockMs = performance.now();
    canvasPointerActive = false;
    canvasPointerId = null;
    game?.pointerLeave();
    resizeCanvas();
    audio.resumeAfterBackground();
    kickRenderLoop();
  }
  function openSettings(): void {
    syncSettingsUi();
    settingsModal.classList.remove("settings-modal-root--closed");
    settingsModal.classList.add("settings-modal-root--open");
    settingsModal.setAttribute("aria-hidden", "false");
  }
  function closeSettings(): void {
    settingsModal.classList.remove("settings-modal-root--open");
    settingsModal.classList.add("settings-modal-root--closed");
    settingsModal.setAttribute("aria-hidden", "true");
  }
  function revealGameOverPanel(): void {
    if (gameOverPhase !== "dramatic") return;
    gameOverPhase = "panel";
    gameOverEl.classList.remove("hidden");
    void gameOverEl.offsetWidth;
    gameOverEl.classList.add("game-over--reveal");
    hud.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    if (mergeJuiceRoot) {
      if (mergeRootLastOrigin !== "") {
        mergeJuiceRoot.style.transformOrigin = "";
        mergeRootLastOrigin = "";
      }
      if (mergeRootLastTransform !== "") {
        mergeJuiceRoot.style.transform = "";
        mergeRootLastTransform = "";
      }
    }
    console.log("[revealGameOverPanel]", "shown");
  }
  function beginGameOverDrama(score: number): void {
    finalScoreEl.textContent = String(Math.floor(score));
    playing = false;
    triggerHaptic("error", settings);
    audio.setGameplayActive(false);
    audio.enterGameOverMusic();
    audio.playGameOver();
    gameOverEl.classList.remove("game-over--reveal");
    if (reduceMotion) {
      gameOverPhase = "panel";
      gameOverPanelRevealPending = false;
      gameOverEl.classList.remove("hidden");
      void gameOverEl.offsetWidth;
      gameOverEl.classList.add("game-over--reveal");
      hud.classList.add("hidden");
      settingsBtn.classList.add("hidden");
      if (mergeJuiceRoot) {
        if (mergeRootLastOrigin !== "") {
          mergeJuiceRoot.style.transformOrigin = "";
          mergeRootLastOrigin = "";
        }
        if (mergeRootLastTransform !== "") {
          mergeJuiceRoot.style.transform = "";
          mergeRootLastTransform = "";
        }
      }
      console.log("[beginGameOverDrama]", "reduced motion, panel only");
      return;
    }
    gameOverPhase = "dramatic";
    gameOverDramaStartedAt = performance.now();
    gameOverPanelRevealPending = false;
    hud.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    console.log("[beginGameOverDrama]", "dramatic sequence");
  }
  function updateNextOrbPreview(_assetId: string, url: string): void {
    nextOrb.style.backgroundImage = "url(\"" + url + "\")";
    nextOrb.style.backgroundSize = "contain";
    nextOrb.style.backgroundPosition = "center";
    nextOrb.style.backgroundRepeat = "no-repeat";
    if (reduceMotion) return;
    restartCssAnimationClass(nextOrb, "next-orb--enter");
    const clearEnter = (): void => {
      nextOrb.classList.remove("next-orb--enter");
    };
    nextOrb.addEventListener("animationend", clearEnter, { once: true });
    window.setTimeout(clearEnter, 520);
  }
  function rebuildEvolutionHud(g: SuikaGame): void {
    const chain = g.getEvolutionChain();
    evolutionChain.innerHTML = "";
    if (chain.length === 0) return;
    const n = chain.length;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    for (let tier = 0; tier < n; tier++) {
      if (tier > 0) {
        const arrow = document.createElement("span");
        arrow.className = "hud-evolution-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.style.setProperty("--evo-arrow-delay", (tier - 1) * 0.22 + 0.06 + "s");
        evolutionChain.appendChild(arrow);
      }
      const url = chain[tier].url;
      const node = document.createElement("span");
      node.className = "hud-evolution-node";
      node.style.setProperty("--evo-delay", tier * 0.18 + "s");
      const sz = coarse
        ? n <= 1
          ? 24
          : Math.round(14 + (tier / (n - 1)) * 17)
        : n <= 1
          ? 30
          : Math.round(20 + (tier / (n - 1)) * 21);
      node.style.width = sz + "px";
      node.style.height = sz + "px";
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      node.appendChild(img);
      evolutionChain.appendChild(node);
    }
    console.log("[rebuildEvolutionHud]", String(chain.length), "steps");
  }
  function flushPendingMergeCelebration(): void {
    if (!pendingMergeCelebration) return;
    const { payload: p, tier } = pendingMergeCelebration;
    pendingMergeCelebration = null;
    mergeCelebrationTimer = 0;

    if (!reduceMotion) {
      mergeJuice.burstVisualsFromCurrentCombo();
      if (tier === "inferno") {
        mergeJuice.triggerInfernoPulse();
        mergeJuice.triggerNetZoom(1.48);
      } else if (tier === "good") {
        mergeJuice.triggerNetZoom(1);
      }
    }

    audio.playMerge(mergeJuice.getCombo());
    if (tier === "inferno") {
      triggerHaptic("success", settings);
    } else if (tier === "good") {
      triggerHaptic("medium", settings);
    } else {
      triggerHaptic("light", settings);
    }

    mergeFanfare.spawn(
      p,
      layout.w,
      layout.h,
      {
        cupX: layout.cupX,
        cupY: layout.cupY,
        cupW: layout.cupW,
        cupH: layout.cupH,
      },
      tier,
      reduceMotion,
    );

    restartCssAnimationClass(evolutionChain, "hud-evolution-scroll--merge-pulse");
    window.setTimeout(() => {
      evolutionChain.classList.remove("hud-evolution-scroll--merge-pulse");
    }, 700);
  }
  const GAMEPLAY_SLIDE_MS = 520;
  const NET_INTRO_MS = 420;
  const HUD_INTRO_CLASS_MS = 820;
  function hideStartAfterSlideIn(): void {
    startScreen.classList.add("hidden");
  }
  function getNetIntroScale(nowMs: number): number {
    if (reduceMotion || netIntroStartedAtMs <= 0) return 1;
    const u = (nowMs - netIntroStartedAtMs) / NET_INTRO_MS;
    if (u >= 1) return 1;
    return 0.74 + 0.26 * smoothstep01(u);
  }
  function beginGameplayIntroEffects(): void {
    if (reduceMotion) return;
    window.clearTimeout(hudIntroClearTimer);
    netIntroStartedAtMs = performance.now();
    hud.classList.remove("hud--intro-pop");
    settingsBtn.classList.remove("hud--intro-pop");
    void hud.offsetWidth;
    hud.classList.add("hud--intro-pop");
    settingsBtn.classList.add("hud--intro-pop");
    hudIntroClearTimer = window.setTimeout(() => {
      hudIntroClearTimer = 0;
      hud.classList.remove("hud--intro-pop");
      settingsBtn.classList.remove("hud--intro-pop");
      netIntroStartedAtMs = 0;
    }, HUD_INTRO_CLASS_MS);
    console.log("[beginGameplayIntroEffects]", "hud + net intro");
  }
  function startGameplayShellSlideIn(hideStartWhenDone: boolean): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gameplayShell.classList.add("gameplay-shell--in");
      });
    });
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      gameplayShell.removeEventListener("transitionend", onInEnd);
      window.clearTimeout(fallbackIn);
      if (hideStartWhenDone) hideStartAfterSlideIn();
      beginGameplayIntroEffects();
    };
    const onInEnd = (e: TransitionEvent): void => {
      if (e.target !== gameplayShell || e.propertyName !== "transform") return;
      finish();
    };
    gameplayShell.addEventListener("transitionend", onInEnd);
    const fallbackIn = window.setTimeout(finish, GAMEPLAY_SLIDE_MS + 100);
  }
  function runReplayShellOutThenIn(): void {
    void gameplayShell.offsetWidth;
    let outDone = false;
    const afterSlideOut = (): void => {
      if (outDone) return;
      outDone = true;
      gameplayShell.removeEventListener("transitionend", onOutEnd);
      window.clearTimeout(fallbackOut);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startGameplayShellSlideIn(false);
        });
      });
    };
    const onOutEnd = (e: TransitionEvent): void => {
      if (e.target !== gameplayShell || e.propertyName !== "transform") return;
      afterSlideOut();
    };
    gameplayShell.addEventListener("transitionend", onOutEnd);
    const fallbackOut = window.setTimeout(afterSlideOut, GAMEPLAY_SLIDE_MS + 100);
    gameplayShell.classList.remove("gameplay-shell--in");
  }
  async function onStart(): Promise<void> {
    canvasPointerActive = false;
    canvasPointerId = null;
    window.clearTimeout(hudIntroClearTimer);
    hudIntroClearTimer = 0;
    window.clearTimeout(mergeCelebrationTimer);
    mergeCelebrationTimer = 0;
    pendingMergeCelebration = null;
    hud.classList.remove("hud--intro-pop");
    settingsBtn.classList.remove("hud--intro-pop");
    /* Always leave game-over audio mode before a new run. */
    audio.exitGameOverMusic();
    triggerHaptic("light", settings);
    noAssetWarning.classList.add("hidden");
    calculateLayout();
    if (!game) {
      const g = new SuikaGame(layout, {
        /* HUD updates here; host score uses submitFinalScoreToPlatform() once on game over (AGENTS.md). */
        onScoreChange: (n) => {
          scoreValue.textContent = String(Math.floor(n));
        },
        onNextChange: (id, url) => updateNextOrbPreview(id, url),
        onGameOver: (s) => beginGameOverDrama(s),
        getSettings: () => ({ haptics: settings.haptics }),
        onMerge: (p) => {
          mergeJuice.trigger(false);
          const tier = mergeWordTier(p.scoreAdd, p.newTier);
          pendingMergeCelebration = { payload: p, tier };
          window.clearTimeout(mergeCelebrationTimer);
          mergeCelebrationTimer = window.setTimeout(
            flushPendingMergeCelebration,
            MERGE_CELEBRATION_DEBOUNCE_MS,
          );
        },
        onDrop: () => audio.playDrop(),
        onWallBounce: (sp) => {
          audio.playBounce(sp > 3.8);
          if (sp > 3.8) {
            triggerHaptic("medium", settings);
          } else if (sp > 0.85) {
            triggerHaptic("light", settings);
          }
        },
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
    rebuildEvolutionHud(game);
    playing = true;
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    scoreValue.textContent = "0";
    gameOverPhase = "none";
    gameOverPanelRevealPending = false;
    gameOverEl.classList.remove("game-over--reveal");
    gameOverEl.classList.add("hidden");
    hud.classList.remove("hidden");
    settingsBtn.classList.remove("hidden");
    const fromMainMenu = !startScreen.classList.contains("hidden");
    const replayFromGameOver =
      !fromMainMenu && !reduceMotion && gameplayShell.classList.contains("gameplay-shell--in");
    if (fromMainMenu && !reduceMotion) {
      startGameplayShellSlideIn(true);
    } else if (replayFromGameOver) {
      runReplayShellOutThenIn();
    } else {
      gameplayShell.classList.add("gameplay-shell--in");
      startScreen.classList.add("hidden");
      if (!reduceMotion) {
        beginGameplayIntroEffects();
      }
    }
    audio.setGameplayActive(true);
    console.log("[onStart]", "playing");
  }
  btnStart.addEventListener("click", () => {
    audio.playUi();
    void onStart();
  });
  btnRestart.addEventListener("click", () => {
    triggerHaptic("light", settings);
    audio.playUi();
    void onStart();
  });
  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light", settings);
    audio.playUi();
    openSettings();
  });
  btnCloseSettings.addEventListener("click", () => {
    triggerHaptic("light", settings);
    audio.playUi();
    closeSettings();
  });
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });
  function bindToggle(btn: HTMLElement, key: keyof Pick<Settings, "music" | "fx" | "haptics">): void {
    btn.addEventListener("click", () => {
      triggerHaptic("light", settings);
      audio.playUi();
      settings[key] = !settings[key];
      saveSettings(settings);
      applyToggleUi(btn, settings[key]);
      audio.applySettings(settings.music, settings.fx);
    });
  }
  bindToggle(toggleMusic, "music");
  bindToggle(toggleFx, "fx");
  bindToggle(toggleHaptics, "haptics");
  function releaseCanvasPointerCapture(pointerId: number): void {
    try {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore */
    }
  }
  function endCanvasPointerSession(e: PointerEvent, shouldDrop: boolean): void {
    if (!canvasPointerActive || canvasPointerId !== e.pointerId) {
      return;
    }
    canvasPointerActive = false;
    canvasPointerId = null;
    releaseCanvasPointerCapture(e.pointerId);
    if (!playing || !game) {
      return;
    }
    game.pointerLeave();
    if (shouldDrop && game.canDrop()) {
      game.tryDrop();
      triggerHaptic("medium", settings);
    }
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!playing || !game || game.isGameOver()) {
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") {
      return;
    }
    canvasPointerActive = true;
    canvasPointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      console.log("[bootstrapGame]", "setPointerCapture skipped");
    }
    triggerHaptic("light", settings);
    game.handlePointer(e.clientX, e.clientY, canvas);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!playing || !game) {
      return;
    }
    if (!canvasPointerActive || canvasPointerId !== e.pointerId) {
      return;
    }
    game.handlePointer(e.clientX, e.clientY, canvas);
  });
  canvas.addEventListener("pointerup", (e) => {
    endCanvasPointerSession(e, true);
  });
  /**
   * Mobile WebViews frequently send pointercancel (scroll heuristic, multitouch, focus)
   * without pointerup; still commit the drop so a tap does not feel like a long-press.
   */
  canvas.addEventListener("pointercancel", (e) => {
    endCanvasPointerSession(e, true);
  });
  canvas.addEventListener("lostpointercapture", (e) => {
    endCanvasPointerSession(e, true);
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      onAppForeground();
    }
  });
  window.addEventListener("pageshow", (ev) => {
    const e = ev as PageTransitionEvent;
    if (e.persisted) {
      onAppForeground();
    }
  });
  initStartMenuBallField();
  syncSettingsUi();
  resizeCanvas();
  renderRafId = requestAnimationFrame(drawFrame);
  console.log("[bootstrapGame]", "ready");
}