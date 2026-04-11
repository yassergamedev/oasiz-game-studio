import bgMusicUrl from "../assets/bg_music.mp3";
import { loadBackgroundImage } from "./bgAssets";
import { drawBgPlanetPass, resetBgPlanetPass, tickBgPlanetPass } from "./bgPlanetPass";
import p1WinSrc from "../assets/p1Win.png";
import p2WinSrc from "../assets/p2Win.png";
import { loadStandardBallImage } from "./ballAssets";
import { loadBrickTextureAtlas } from "./brickAssets";
import { GameplayJuice } from "./gameplayJuice";
import {
  computeVersusHudLayout,
  computeVersusTopPillLayoutY,
  drawVersusHudChrome,
  type VersusHudLayout,
} from "./hudChromeDraw";
import { VersusBreakoutGame, type GamePhase } from "./versusBreakoutGame";
import { MenuAttract } from "./menuAttract";
import { ProtoAudio, resumeAudioContext } from "./protoAudio";
import { loadBreakoutUiPack, type BreakoutUiPack } from "./uiAssets";
import { TurnOwnerFx, type StuckOwner } from "./turnOwnerFx";

const STORAGE_KEY = "breakoutSettings";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
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

function submitMatchEndScore(): void {
  console.log("[main]", "submitMatchEndScore", 0);
  const fn = (window as unknown as { submitScore?: (s: number) => void }).submitScore;
  if (typeof fn === "function") fn(0);
}

let settings = loadSettings();
let scoreSubmitted = false;

/** Background music may start only after a user gesture (Play). */
let bgmAllowed = false;
let bgmEl: HTMLAudioElement | null = null;
const BGM_VOLUME = 0.34;

function getBgmElement(): HTMLAudioElement {
  if (!bgmEl) {
    bgmEl = new Audio(bgMusicUrl);
    bgmEl.loop = true;
    bgmEl.preload = "auto";
  }
  return bgmEl;
}

function applyBackgroundMusic(): void {
  const el = getBgmElement();
  el.volume = BGM_VOLUME;
  if (bgmAllowed && settings.music) {
    void el.play().catch((err) => {
      console.log("[main]", "bg music play failed", err);
    });
  } else {
    el.pause();
  }
}

const rootEl = document.getElementById("root")!;
const menuCanvas = document.getElementById("menuCanvas") as HTMLCanvasElement;
const menuCtx2d = menuCanvas.getContext("2d");
if (!menuCtx2d) throw new Error("Menu canvas 2D context unavailable");
const menuCtx: CanvasRenderingContext2D = menuCtx2d;

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("2D context unavailable");
const ctx: CanvasRenderingContext2D = ctx2d;

const versusHud = document.getElementById("versusHud")!;
const versusHudP1 = document.getElementById("versusHudP1")!;
const versusHudP2 = document.getElementById("versusHudP2")!;
const versusHudArena = document.getElementById("versusHudArena")!;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsModal = document.getElementById("settingsModal")!;
const toggleMusic = document.getElementById("toggleMusic") as HTMLInputElement;
const toggleFx = document.getElementById("toggleFx") as HTMLInputElement;
const toggleHaptics = document.getElementById("toggleHaptics") as HTMLInputElement;
const btnCloseSettings = document.getElementById("btnCloseSettings") as HTMLButtonElement;

const startOverlay = document.getElementById("startOverlay")!;
const winOverlay = document.getElementById("winOverlay")!;
const winBannerImg = document.getElementById("winBannerImg") as HTMLImageElement;

const btnPlay = document.getElementById("btnPlay") as HTMLButtonElement;
const btnWinRestart = document.getElementById("btnWinRestart") as HTMLButtonElement;
const btnWinNextArena = document.getElementById("btnWinNextArena") as HTMLButtonElement;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let canvasDpr = 1;

let uiPack: BreakoutUiPack | null = null;
let versusHudLayout: VersusHudLayout | null = null;
let useCanvasHud = false;
let bgImage: HTMLImageElement | null = null;

const juice = new GameplayJuice({ reduceMotion });
const turnOwnerFx = new TurnOwnerFx(reduceMotion);

const menuAttract = new MenuAttract({ reduceMotion });

const game = new VersusBreakoutGame({
  reduceMotion,
  getAudioEnabled: () => settings.fx,
  onPhaseChange: (phase) => {
    syncUiToPhase(phase);
  },
  onHaptic: (t) => triggerHaptic(t, settings),
  onJuice: (ev) => juice.handleEvent(ev),
});

type LevelIntro =
  | { stage: "menu_leave" }
  | { stage: "spawn"; startMs: number }
  | { stage: "countdown"; index: number; stepStartMs: number };

let levelIntro: LevelIntro | null = null;
let menuLeaveFinalized = false;

const SPAWN_INTRO_MS = 1000;
const COUNTDOWN_STEP_MS = 780;
const COUNTDOWN_LABELS = ["3", "2", "1", "GO!"];

function introBlocking(): boolean {
  return levelIntro !== null;
}

function getStuckBallOwner(): StuckOwner {
  for (const b of game.balls) {
    if (b.stuckTo !== 0) return b.stuckTo;
  }
  return 0;
}

function turnEmphasisEnabled(): boolean {
  return (
    !introBlocking() &&
    (game.phase === "ready" || game.phase === "playing")
  );
}

function syncUiToPhase(phase: GamePhase): void {
  if (phase === "game_won") {
    winOverlay.classList.remove("hidden");
    winOverlay.classList.remove("win-overlay--exiting");
    const w = game.winner;
    if (w === 2) {
      winBannerImg.src = p2WinSrc;
      winBannerImg.alt = "Player 2 wins";
    } else {
      winBannerImg.src = p1WinSrc;
      winBannerImg.alt = "Player 1 wins";
    }
    winBannerImg.classList.remove("hidden");
    settingsBtn.classList.add("hidden");
    if (!scoreSubmitted) {
      scoreSubmitted = true;
      submitMatchEndScore();
      triggerHaptic("success", settings);
    }
  } else {
    winOverlay.classList.add("hidden");
    winBannerImg.classList.add("hidden");
  }

  if (!startOverlay.classList.contains("hidden")) {
    settingsBtn.classList.add("hidden");
  } else if (introBlocking()) {
    settingsBtn.classList.add("hidden");
  } else if (phase === "playing" || phase === "ready") {
    settingsBtn.classList.remove("hidden");
  }

  refreshVersusHudVisibility();
}

function refreshVersusHudVisibility(): void {
  if (!startOverlay.classList.contains("hidden")) {
    versusHud.classList.add("hidden");
    return;
  }
  if (introBlocking()) {
    versusHud.classList.add("hidden");
    return;
  }
  if (game.phase === "game_won") {
    versusHud.classList.add("hidden");
    return;
  }
  if (useCanvasHud) {
    versusHud.classList.add("hidden");
    return;
  }
  versusHud.classList.remove("hidden");
}

function updateVersusHudDom(): void {
  if (useCanvasHud) return;
  const fmt = (rem: number, score: number, combo: number): string => {
    let s = rem + " left · " + score + " pts";
    if (combo >= 2) s += " · x" + String(combo);
    return s;
  };
  versusHudP1.textContent = fmt(game.remainingFor(1), game.scoreFor(1), game.liveComboCount(1));
  versusHudArena.textContent = "";
  versusHudP2.textContent = fmt(game.remainingFor(2), game.scoreFor(2), game.liveComboCount(2));
}

function onStartScreen(): boolean {
  if (startOverlay.classList.contains("hidden")) return false;
  if (rootEl.classList.contains("menu-leave-active")) return false;
  return true;
}

function resizeCanvas(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvasDpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * canvasDpr);
  canvas.height = Math.floor(h * canvasDpr);
  ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);

  menuCanvas.style.width = w + "px";
  menuCanvas.style.height = h + "px";
  menuCanvas.width = Math.floor(w * canvasDpr);
  menuCanvas.height = Math.floor(h * canvasDpr);
  menuCtx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const vl = computeVersusHudLayout(w, h, coarse);
  versusHudLayout = uiPack ? vl : null;
  game.setHudReserves(vl.topReserve, vl.bottomReserve);
  game.resize(w, h);
  if (game.bricks.length === 0) {
    game.loadMatch(0);
  }
  menuAttract.resize(w, h);
  juice.resize(w, h);
  syncDomChromeToPlayfield(vl);
}

/** Keep HTML HUD + settings aligned with the canvas P2 pill (not a separate formula). */
function syncDomChromeToPlayfield(layout: VersusHudLayout): void {
  const { pillOuterTop } = computeVersusTopPillLayoutY(layout, game.playfieldTop());
  versusHud.style.top = pillOuterTop + "px";
  const gearApproxH = 52;
  /** Clear air between gear bottom and top pill (avoids overlap with pill stroke/glow). */
  const gapGearBottomToPillTop = 14;
  const minTopSafe = layout.topSafeInset + 6;
  const pillCeiling = pillOuterTop - gapGearBottomToPillTop;
  const idealGearTop = pillCeiling - gearApproxH;
  let settingsTopPx = idealGearTop;
  if (minTopSafe > idealGearTop) {
    settingsTopPx = minTopSafe;
    if (settingsTopPx + gearApproxH > pillCeiling) {
      settingsTopPx = idealGearTop;
    }
  }
  settingsBtn.style.top = settingsTopPx + "px";
}

/** Offscreen buffer: downscale-then-upscale blur works where `ctx.filter` is unsupported (some WebViews). */
let bgBlurScratch: HTMLCanvasElement | null = null;

function drawGameplayBackground(): void {
  const w = game.w;
  const h = game.h;
  if (w < 2 || h < 2) return;

  const img = bgImage;
  const div = reduceMotion ? 4 : 6;
  const lowW = Math.max(40, Math.ceil(w / div));
  const lowH = Math.max(40, Math.ceil(h / div));

  if (!bgBlurScratch) {
    bgBlurScratch = document.createElement("canvas");
  }
  const low = bgBlurScratch;
  if (low.width !== lowW || low.height !== lowH) {
    low.width = lowW;
    low.height = lowH;
  }
  const sctx = low.getContext("2d");
  if (!sctx) return;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, lowW, lowH);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "low";

  if (img && img.complete && img.naturalWidth > 0) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(lowW / iw, lowH / ih) * 1.14;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (lowW - dw) / 2;
    const dy = (lowH - dh) / 2;
    sctx.filter = reduceMotion ? "none" : "saturate(1.15) brightness(0.72)";
    sctx.drawImage(img, dx, dy, dw, dh);
    sctx.filter = "none";
  } else {
    const g = sctx.createLinearGradient(0, 0, 0, lowH);
    g.addColorStop(0, "#334155");
    g.addColorStop(0.45, "#1e293b");
    g.addColorStop(1, "#020617");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, lowW, lowH);
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(low, 0, 0, lowW, lowH, 0, 0, w, h);

  if (!reduceMotion) {
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.28;
    ctx.drawImage(low, 0, 0, lowW, lowH, -10, 6, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();

  ctx.save();
  const vg = ctx.createRadialGradient(
    w * 0.5,
    h * 0.4,
    Math.min(w, h) * 0.05,
    w * 0.52,
    h * 0.55,
    Math.max(w, h) * 0.82,
  );
  vg.addColorStop(0, "rgba(15, 23, 42, 0)");
  vg.addColorStop(0.5, "rgba(2, 6, 23, 0.42)");
  vg.addColorStop(1, "rgba(0, 0, 0, 0.78)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const pfTop = game.paddle2Y - game.paddleH * 0.5 - 6;
  const pfBot = game.paddle1Y + game.paddleH * 0.5 + 6;
  const pfH = pfBot - pfTop;

  const t = performance.now() * 0.002;
  const pulse = reduceMotion ? 0.22 : 0.2 + Math.sin(t) * 0.1;
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, " + String(pulse) + ")";
  ctx.lineWidth = 2;
  if (!reduceMotion) {
    ctx.shadowColor = "rgba(56, 189, 248, 0.55)";
    ctx.shadowBlur = 18;
  }
  ctx.strokeRect(game.wallLeft, pfTop, game.wallRight - game.wallLeft, pfH);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(167, 139, 250, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 12]);
  const midY = pfTop + pfH * 0.5;
  ctx.beginPath();
  ctx.moveTo(game.wallLeft + 10, midY);
  ctx.lineTo(game.wallRight - 10, midY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function advanceLevelIntro(nowMs: number): void {
  if (!levelIntro) return;
  if (levelIntro.stage === "spawn") {
    const dur = reduceMotion ? 1 : SPAWN_INTRO_MS;
    if (nowMs - levelIntro.startMs >= dur) {
      levelIntro = { stage: "countdown", index: 0, stepStartMs: nowMs };
      if (settings.fx) ProtoAudio.wallBounce();
      triggerHaptic("light", settings);
    }
    return;
  }
  if (levelIntro.stage === "countdown") {
    const step = reduceMotion ? 1 : COUNTDOWN_STEP_MS;
    if (nowMs - levelIntro.stepStartMs >= step) {
      levelIntro.index += 1;
      levelIntro.stepStartMs = nowMs;
      if (levelIntro.index < 4) {
        if (settings.fx) ProtoAudio.brickChip();
        triggerHaptic("light", settings);
      }
      if (levelIntro.index >= 4) {
        if (settings.fx) ProtoAudio.powerCollect();
        triggerHaptic("success", settings);
        levelIntro = null;
        syncUiToPhase(game.phase);
      }
    }
  }
}

function getIntroSpawnT(nowMs: number): number {
  if (!levelIntro) return 1;
  if (levelIntro.stage === "menu_leave") return 0;
  if (levelIntro.stage === "spawn") {
    const dur = reduceMotion ? 1 : SPAWN_INTRO_MS;
    return Math.min(1, (nowMs - levelIntro.startMs) / dur);
  }
  return 1;
}

function getCountdownLabel(): string | null {
  if (!levelIntro || levelIntro.stage !== "countdown") return null;
  if (levelIntro.index >= COUNTDOWN_LABELS.length) return null;
  return COUNTDOWN_LABELS[levelIntro.index];
}

function drawCountdownOverlay(label: string, nowMs: number): void {
  const w = game.w;
  const h = game.h;
  const pulse = 0.93 + 0.07 * Math.sin(nowMs * 0.016);
  const cx = w * 0.5;
  const cy = h * 0.39;
  const fs = Math.min(w, h) * 0.21 * pulse;
  ctx.save();
  ctx.font = "900 " + String(fs * 0.95) + "px Orbitron,system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(2, 6, 23, 0.45)";
  ctx.fillText(label, cx + 4, cy + 5);
  const grd = ctx.createLinearGradient(cx - fs, cy - fs * 0.5, cx + fs, cy + fs * 0.5);
  grd.addColorStop(0, "#fcd34d");
  grd.addColorStop(0.45, "#38bdf8");
  grd.addColorStop(1, "#c4b5fd");
  ctx.fillStyle = grd;
  ctx.shadowColor = "rgba(56, 189, 248, 0.65)";
  ctx.shadowBlur = 32;
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function finalizeMenuLeave(): void {
  if (menuLeaveFinalized) return;
  if (levelIntro?.stage !== "menu_leave") return;
  menuLeaveFinalized = true;
  rootEl.classList.remove("menu-leave-active");
  startOverlay.classList.add("hidden");
  canvas.classList.remove("during-attract");
  menuCanvas.classList.add("menu-off");
  resetBgPlanetPass(performance.now());
  scoreSubmitted = false;
  juice.clear();
  game.restartMatch();
  levelIntro = { stage: "spawn", startMs: performance.now() };
  syncUiToPhase(game.phase);
}

function beginMenuToGameplay(): void {
  bgmAllowed = true;
  resumeAudioContext();
  applyBackgroundMusic();
  triggerHaptic("light", settings);
  menuLeaveFinalized = false;
  if (reduceMotion) {
    startOverlay.classList.add("hidden");
    canvas.classList.remove("during-attract");
    menuCanvas.classList.add("menu-off");
    resetBgPlanetPass(performance.now());
    scoreSubmitted = false;
    juice.clear();
    game.restartMatch();
    levelIntro = null;
    syncUiToPhase(game.phase);
    return;
  }
  levelIntro = { stage: "menu_leave" };
  rootEl.classList.add("menu-leave-active");
  const onAnimEnd = (ev: AnimationEvent): void => {
    if (ev.target !== canvas) return;
    finalizeMenuLeave();
  };
  canvas.addEventListener("animationend", onAnimEnd, { once: true });
  window.setTimeout(() => {
    if (levelIntro?.stage === "menu_leave") finalizeMenuLeave();
  }, 820);
}

let lastT = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (onStartScreen()) {
    menuAttract.tick(dt, now);
    menuAttract.draw(menuCtx);
  } else {
    const nowMs = performance.now();
    advanceLevelIntro(nowMs);

    game.update(dt);
    tickBgPlanetPass(dt, nowMs, game.w, game.h, reduceMotion);
    juice.update(dt);
    turnOwnerFx.tick(dt, getStuckBallOwner(), turnEmphasisEnabled());
    const ballsForTrails = game.balls.map((b) => ({
      x: b.x,
      y: b.y,
      r: b.r,
      vx: b.vx,
      vy: b.vy,
      stuckToPaddle: b.stuckTo !== 0,
    }));
    juice.tickBallTrails(ballsForTrails, !game.isSlowBallActive(), nowMs);

    const spawnT = getIntroSpawnT(nowMs);
    const sh = juice.getShakeOffset();
    const pv = juice.getPossessionViewTransform(game.w, game.h);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.translate(pv.focusX, pv.focusY);
    ctx.scale(pv.scale, pv.scale);
    ctx.translate(-pv.focusX, -pv.focusY);
    ctx.save();
    turnOwnerFx.applyTransform(ctx, game.w, game.h);
    drawGameplayBackground();
    juice.drawStars(ctx, nowMs);
    juice.drawAmbient(ctx, nowMs);
    const canTrail =
      !introBlocking() && (game.phase === "ready" || game.phase === "playing");
    if (canTrail) {
      juice.recordPaddleSample(game.paddle1X, game.paddle1Y, game.getPaddleW(1), game.paddleH, 0);
      juice.recordPaddleSample(game.paddle2X, game.paddle2Y, game.getPaddleW(2), game.paddleH, 1);
    } else {
      juice.clearPaddleTrail();
    }
    juice.drawPaddleTrail(ctx);
    const introDraw =
      levelIntro &&
      (levelIntro.stage === "menu_leave" || levelIntro.stage === "spawn")
        ? { t: spawnT }
        : undefined;
    game.draw(ctx, introDraw);
    juice.drawShockRings(ctx);
    juice.drawParticles(ctx);
    const rimTop = game.paddle2Y - game.paddleH * 0.5 - 6;
    const rimBot = game.paddle1Y + game.paddleH * 0.5 + 6;
    const wallW = game.wallRight - game.wallLeft;
    const wallH = rimBot - rimTop;
    turnOwnerFx.drawShine(ctx, game.wallLeft, game.wallRight, rimTop, rimBot, nowMs);
    juice.drawScreenFlashRim(ctx, game.wallLeft, rimTop, wallW, wallH);
    ctx.restore();
    ctx.restore();

    if (useCanvasHud && uiPack && versusHudLayout && !introBlocking()) {
      drawVersusHudChrome(
        ctx,
        uiPack,
        versusHudLayout,
        {
          r1: game.remainingFor(1),
          r2: game.remainingFor(2),
          s1: game.scoreFor(1),
          s2: game.scoreFor(2),
        },
        game.w,
        game.h,
        game.playfieldTop(),
        game.playfieldBottom(),
      );
    }

    const cd = getCountdownLabel();
    if (cd) drawCountdownOverlay(cd, nowMs);

    updateVersusHudDom();
  }
  requestAnimationFrame(frame);
}

function bindSettingsUi(): void {
  toggleMusic.checked = settings.music;
  toggleFx.checked = settings.fx;
  toggleHaptics.checked = settings.haptics;
  toggleMusic.addEventListener("change", () => {
    settings.music = toggleMusic.checked;
    saveSettings(settings);
    applyBackgroundMusic();
    console.log("[main]", "settings music", settings.music);
  });
  toggleFx.addEventListener("change", () => {
    settings.fx = toggleFx.checked;
    saveSettings(settings);
    console.log("[main]", "settings fx", settings.fx);
  });
  toggleHaptics.addEventListener("change", () => {
    settings.haptics = toggleHaptics.checked;
    saveSettings(settings);
    console.log("[main]", "settings haptics", settings.haptics);
  });
  function setSettingsModalOpen(open: boolean): void {
    settingsModal.classList.toggle("settings-modal--open", open);
    settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
  }

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light", settings);
    setSettingsModalOpen(true);
  });
  btnCloseSettings.addEventListener("click", () => {
    triggerHaptic("light", settings);
    setSettingsModalOpen(false);
  });
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      setSettingsModalOpen(false);
    }
  });
}

btnPlay.addEventListener("click", () => {
  beginMenuToGameplay();
});

let winOverlayExitBusy = false;

function playWinExitThen(run: () => void): void {
  if (winOverlay.classList.contains("hidden")) {
    run();
    return;
  }
  if (winOverlayExitBusy) return;
  if (reduceMotion) {
    run();
    return;
  }
  winOverlayExitBusy = true;
  winOverlay.classList.add("win-overlay--exiting");
  const stackEl = winOverlay.querySelector(".win-overlay-stack");
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    winOverlay.classList.remove("win-overlay--exiting");
    winOverlayExitBusy = false;
    run();
  };
  if (!stackEl) {
    finish();
    return;
  }
  const failSafe = window.setTimeout(finish, 440);
  const onEnd = (e: Event): void => {
    const te = e as TransitionEvent;
    if (e.target !== stackEl) return;
    if (te.propertyName !== "transform" && te.propertyName !== "opacity") return;
    window.clearTimeout(failSafe);
    stackEl.removeEventListener("transitionend", onEnd);
    finish();
  };
  stackEl.addEventListener("transitionend", onEnd);
}

function beginRematchOrArena(nextArena: boolean): void {
  triggerHaptic("light", settings);
  scoreSubmitted = false;
  juice.clear();
  winOverlay.classList.add("hidden");
  if (nextArena) {
    game.cycleLayout();
  } else {
    game.restartMatch();
  }
  if (reduceMotion) {
    levelIntro = null;
  } else {
    levelIntro = { stage: "spawn", startMs: performance.now() };
  }
  syncUiToPhase(game.phase);
}

btnWinRestart.addEventListener("click", () => {
  playWinExitThen(() => beginRematchOrArena(false));
});

btnWinNextArena.addEventListener("click", () => {
  playWinExitThen(() => beginRematchOrArena(true));
});

/** Pointer drag: paddle moves by finger delta from pivot — no teleport on touch. */
type PaddlePointerDrag = {
  player: 1 | 2;
  pivotCanvasX: number;
  paddleXAtPivot: number;
};

const pointerDragById = new Map<number, PaddlePointerDrag>();

canvas.addEventListener("pointerdown", (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const player: 1 | 2 = y < game.h * 0.5 ? 2 : 1;
  const paddleXAtPivot = player === 1 ? game.paddle1X : game.paddle2X;
  pointerDragById.set(e.pointerId, {
    player,
    pivotCanvasX: x,
    paddleXAtPivot,
  });
  if (!introBlocking() && (game.phase === "ready" || game.phase === "playing")) {
    const stuck = getStuckBallOwner();
    if (stuck === 0 || stuck === player) {
      game.startPlayOrLaunch();
    }
  }
});

canvas.addEventListener("pointermove", (e) => {
  const drag = pointerDragById.get(e.pointerId);
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const nextX = drag.paddleXAtPivot + (x - drag.pivotCanvasX);
  game.setPaddleTargetX(drag.player, nextX);
});

canvas.addEventListener("pointerup", (e) => {
  pointerDragById.delete(e.pointerId);
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
});

canvas.addEventListener("pointercancel", (e) => {
  pointerDragById.delete(e.pointerId);
});

let keysP1Left = false;
let keysP1Right = false;
let keysP2Left = false;
let keysP2Right = false;

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyA") keysP1Left = true;
  if (e.code === "KeyD") keysP1Right = true;
  if (e.code === "ArrowLeft") keysP2Left = true;
  if (e.code === "ArrowRight") keysP2Right = true;
  if (e.code === "Space") {
    e.preventDefault();
    if (!introBlocking() && (game.phase === "ready" || game.phase === "playing")) {
      const stuck = getStuckBallOwner();
      if (stuck === 0 || stuck === 1) {
        game.startPlayOrLaunch();
      }
    }
  }
  if (e.code === "Enter" || e.code === "NumpadEnter") {
    e.preventDefault();
    if (!introBlocking() && (game.phase === "ready" || game.phase === "playing")) {
      const stuck = getStuckBallOwner();
      if (stuck === 0 || stuck === 2) {
        game.startPlayOrLaunch();
      }
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyA") keysP1Left = false;
  if (e.code === "KeyD") keysP1Right = false;
  if (e.code === "ArrowLeft") keysP2Left = false;
  if (e.code === "ArrowRight") keysP2Right = false;
});

window.addEventListener("resize", () => {
  resizeCanvas();
});

bindSettingsUi();
resizeCanvas();
requestAnimationFrame(frame);

function pumpKeys(): void {
  if (game.phase === "playing" || game.phase === "ready") {
    const dt = 1 / 60;
    if (keysP1Left && !keysP1Right) game.nudgePaddle(1, -1, dt);
    if (keysP1Right && !keysP1Left) game.nudgePaddle(1, 1, dt);
    if (keysP2Left && !keysP2Right) game.nudgePaddle(2, -1, dt);
    if (keysP2Right && !keysP2Left) game.nudgePaddle(2, 1, dt);
  }
  requestAnimationFrame(pumpKeys);
}
requestAnimationFrame(pumpKeys);

void loadBackgroundImage()
  .then((img) => {
    bgImage = img;
    menuAttract.setBackgroundImage(img);
  })
  .catch((err) => {
    console.log("[main]", "bg.png failed, using gradient", err);
  });

void loadBrickTextureAtlas()
  .then((atlas) => {
    game.setBrickAtlas(atlas);
  })
  .catch((err) => {
    console.log("[main]", "brick textures failed, using fallback", err);
  });

void loadStandardBallImage()
  .then((img) => {
    game.setBallImage(img);
    menuAttract.setBallImage(img);
  })
  .catch((err) => {
    console.log("[main]", "ball texture failed, using fallback", err);
  });

void loadBreakoutUiPack()
  .then((pack) => {
    uiPack = pack;
    game.setPaddleImage(pack.paddle);
    useCanvasHud = true;
    resizeCanvas();
    refreshVersusHudVisibility();
    console.log("[main]", "canvas HUD + paddle sprite active");
  })
  .catch((err) => {
    console.log("[main]", "ui pack failed, using vector HUD/paddle", err);
    refreshVersusHudVisibility();
  });

const MENU_TITLE_WORD = "BREAKOUT";
const MENU_TITLE_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb923c",
  "#e879f9",
  "#22d3ee",
  "#fcd34d",
  "#e2e8f0",
];

function setupMenuTitleChaos(): void {
  const host = document.getElementById("menuTitleLetters");
  if (!host) {
    console.log("[setupMenuTitleChaos]", "missing menuTitleLetters");
    return;
  }

  if (reduceMotion) {
    host.textContent = "";
    for (let i = 0; i < MENU_TITLE_WORD.length; i++) {
      const sp = document.createElement("span");
      sp.className = "menu-title-letter";
      sp.textContent = MENU_TITLE_WORD[i].toUpperCase();
      sp.style.color = "#e0f2fe";
      host.appendChild(sp);
    }
    return;
  }

  host.textContent = "";
  const spans: HTMLSpanElement[] = [];
  for (let i = 0; i < MENU_TITLE_WORD.length; i++) {
    const sp = document.createElement("span");
    sp.className = "menu-title-letter";
    const ch = MENU_TITLE_WORD[i];
    if (!ch) continue;
    sp.textContent = ch.toUpperCase();
    sp.style.color = MENU_TITLE_COLORS[i % MENU_TITLE_COLORS.length];
    host.appendChild(sp);
    spans.push(sp);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(tick, delay);
  }

  function tick(): void {
    timer = null;
    if (startOverlay.classList.contains("hidden")) {
      scheduleNext(380);
      return;
    }

    const picks = 1 + Math.floor(Math.random() * 2);
    for (let p = 0; p < picks; p++) {
      const idx = Math.floor(Math.random() * spans.length);
      const sp = spans[idx];
      const base = MENU_TITLE_WORD[idx];
      if (!base || !sp) continue;
      sp.textContent = Math.random() < 0.5 ? base.toUpperCase() : base.toLowerCase();
      sp.style.color = MENU_TITLE_COLORS[Math.floor(Math.random() * MENU_TITLE_COLORS.length)];
      const glowHue = Math.floor(Math.random() * 360);
      sp.style.textShadow =
        "0 0 10px hsla(" +
        String(glowHue) +
        ",95%,65%,0.78), 0 0 26px hsla(" +
        String((glowHue + 48) % 360) +
        ",88%,58%,0.48)";
      if (Math.random() < 0.38) {
        sp.style.letterSpacing = (Math.random() * 0.34 - 0.02).toFixed(2) + "em";
      } else {
        sp.style.letterSpacing = "";
      }
      if (Math.random() < 0.22) {
        sp.style.transform = "translateY(" + (Math.random() * 8 - 4).toFixed(1) + "px)";
      } else if (Math.random() < 0.18) {
        sp.style.transform = "";
      }
    }

    if (Math.random() < 0.14) {
      const sweep = 2 + Math.floor(Math.random() * 4);
      for (let s = 0; s < sweep; s++) {
        const j = Math.floor(Math.random() * spans.length);
        const sp = spans[j];
        const base = MENU_TITLE_WORD[j];
        if (!base || !sp) continue;
        sp.textContent = Math.random() < 0.5 ? base.toUpperCase() : base.toLowerCase();
        sp.style.color = MENU_TITLE_COLORS[Math.floor(Math.random() * MENU_TITLE_COLORS.length)];
      }
    }

    scheduleNext(65 + Math.floor(Math.random() * 150));
  }

  scheduleNext(160);
}

setupMenuTitleChaos();

console.log("[main]", "Breakout bootstrap complete");
