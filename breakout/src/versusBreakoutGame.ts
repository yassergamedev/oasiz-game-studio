import {
  BRICK_TIER_MAX_HP,
  type BrickHue,
  type BrickSizeTier,
  type BrickTextureAtlas,
  scoreForDestroyedBrick,
  tierForRow,
} from "./brickAssets";
import { computeVersusTrajectoryPolyline, type TrajectoryBrick } from "./ballTrajectoryPreview";
import type { VersusCapsuleImageSet } from "./capsuleAssets";
import { getMinColors, isMinimalBreakoutVisual } from "./breakoutMinimalStyle";
import type { GameplayJuiceEvent } from "./gameplayJuice";
import { ProtoAudio } from "./protoAudio";

export type PlayerId = 1 | 2;

export type GamePhase = "ready" | "playing" | "game_won";

/** Power-ups / debuffs / supers dropped from bricks */
export type VersusCapsuleKind =
  | "multiball"
  | "paddle_big"
  | "paddle_small"
  | "slow_ball"
  | "reverse_colors"
  | "convert_colors";

export interface VersusBrick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  owner: PlayerId;
  hue: BrickHue;
  tier: BrickSizeTier;
  hp: number;
  maxHp: number;
}

export interface VersusBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0 = in play */
  stuckTo: 0 | PlayerId;
}

export interface VersusCapsule {
  x: number;
  y: number;
  vy: number;
  kind: VersusCapsuleKind;
  r: number;
}

export interface VersusLayoutDef {
  name: string;
  /** '1' = P1 (bottom) color, '2' = P2 (top) color, '.' empty */
  grid: string[];
}

const P1_HUE: BrickHue = "blue";
const P2_HUE: BrickHue = "violet";

/**
 * Each row is 12 cells: `1` = P1 brick, `2` = P2, `.` = empty.
 * Every arena has **equal** total `1` and `2` counts (fair win race).
 * Mix dense walls, gaps, phase shifts, and sparse “constellation” rows so “Next arena” feels different.
 */
function assertBalancedVersusLayout(name: string, grid: string[]): void {
  let n1 = 0;
  let n2 = 0;
  for (const row of grid) {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === "1") n1 += 1;
      else if (ch === "2") n2 += 1;
    }
  }
  if (n1 !== n2) {
    console.log("[assertBalancedVersusLayout]", "unbalanced arena", name, "p1", n1, "p2", n2);
  }
}

const LAYOUTS: VersusLayoutDef[] = [
  {
    name: "Citadel",
    grid: [
      "111222111222",
      "212121212121",
      "221122112211",
      "112211221122",
      "121212121212",
      "211221122112",
      "222111222111",
      "111222111222",
    ],
  },
  {
    name: "Rift",
    grid: [
      "1111....2222",
      "2222....1111",
      "1111....2222",
      "2222....1111",
      "11..22..11..",
      "22..11..22..",
      "1.1.2.2.1.2.",
      "2.2.1.1.2.1.",
    ],
  },
  {
    name: "Tempest",
    grid: [
      "121122211212",
      "212211122121",
      "112122121221",
      "221211212112",
      "122121221211",
      "211212112122",
      "122112212121",
      "121221211221",
    ],
  },
  {
    name: "Bastion",
    grid: [
      "111222111222",
      "222111222111",
      "121212121212",
      "212121212121",
      "112211221122",
      "221122112211",
      "122121212211",
      "211212121122",
    ],
  },
  {
    name: "Blitz",
    grid: [
      "112211221122",
      "221122112211",
      "121212121212",
      "212121212121",
      "111222111222",
      "222111222111",
      "122122121211",
    ],
  },
  {
    name: "Labyrinth",
    grid: [
      "111...222...",
      "222...111...",
      "111...222...",
      "222...111...",
      "1122..1122..",
      "..1122..1122",
      "121212121212",
      "212121212121",
      "122112211221",
      "211221122112",
    ],
  },
  {
    name: "Mosaic",
    grid: [
      "111122221122",
      "222211112211",
      "121121212212",
      "212212121121",
      "112211221122",
      "221122112211",
      "111222111222",
      "222111222111",
      "121212121212",
    ],
  },
  {
    name: "Vortex",
    grid: [
      "111222111222",
      "222111222111",
      "121212121212",
      "212121212121",
      "121122211212",
      "212211122121",
      "112122121221",
      "221211212112",
    ],
  },
  {
    name: "Shattered",
    grid: [
      "1111....2222",
      "....22221111",
      "2222....1111",
      "....11112222",
      "11..22..11..",
      "..22..11..22",
      "1.1.1.2.2.2.",
      "2.2.2.1.1.1.",
      "1122....1122",
      "....2211....",
    ],
  },
  {
    name: "Crown",
    grid: [
      "122112211221",
      "211221122112",
      "112112221221",
      "212112211221",
      "111222111222",
      "121212121212",
      "221122112211",
      "112211221122",
    ],
  },
];

for (const def of LAYOUTS) {
  assertBalancedVersusLayout(def.name, def.grid);
}

const BASE_BALL_SPEED = 415;
const SLOW_MULT = 0.5;
const PADDLE_BIG_SCALE = 1.62;
const PADDLE_SMALL_SCALE = 0.52;
const EFFECT_MS = 8000;
const CAPSULE_DROP = 0.16;
const PADDLE_SPEED = 560;
const DEAD_PAD = 10;
/** Consecutive brick destroys within this window stack combo multiplier (per player). */
const COMBO_WINDOW_MS = 980;
const COMBO_MULT_CAP = 8;

function normSpeed(vx: number, vy: number, target: number): { vx: number; vy: number } {
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return { vx: 0, vy: target };
  const s = target / len;
  return { vx: vx * s, vy: vy * s };
}

function pathRoundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function clamp01Intro(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function easeOutBackIntro(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Stable seed from brick position — deterministic cracks (no draw-loop RNG). */
function brickCrackSeed(brick: VersusBrick): number {
  return ((brick.x * 73856093) ^ (brick.y * 19349663) ^ (brick.w * 83492791)) >>> 0;
}

function crackFrac(seed: number, salt: number): number {
  const x = Math.sin(seed * 0.0000157 + salt * 91.171) * 43758.5453;
  return x - Math.floor(x);
}

/** Fracture lines scale with damage — reads clearly on flat B/W bricks. */
function drawVersusBrickCracks(
  ctx: CanvasRenderingContext2D,
  brick: VersusBrick,
  seed: number,
  strokeA: string,
  strokeB: string,
): void {
  const dmg = brick.maxHp > 0 ? 1 - brick.hp / brick.maxHp : 0;
  const chipped = brick.hp < brick.maxHp;
  if (!chipped && dmg < 0.02) return;
  const count = Math.min(12, 2 + Math.floor(dmg * 9) + (chipped ? 1 : 0));
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const u2 = crackFrac(seed, i * 3 + 2);
    const edge = i % 4;
    let x0 = brick.x + brick.w * (0.1 + crackFrac(seed, i * 3) * 0.8);
    let y0 = brick.y + brick.h * (0.1 + crackFrac(seed, i * 3 + 1) * 0.8);
    if (edge === 0) {
      x0 = brick.x + u2 * brick.w;
      y0 = brick.y + 0.5;
    } else if (edge === 1) {
      x0 = brick.x + brick.w - 0.5;
      y0 = brick.y + u2 * brick.h;
    } else if (edge === 2) {
      x0 = brick.x + u2 * brick.w;
      y0 = brick.y + brick.h - 0.5;
    } else {
      x0 = brick.x + 0.5;
      y0 = brick.y + u2 * brick.h;
    }
    const cx = brick.x + brick.w * (0.22 + crackFrac(seed, 100 + i) * 0.56);
    const cy = brick.y + brick.h * (0.22 + crackFrac(seed, 200 + i) * 0.56);
    const jx = (crackFrac(seed, 300 + i) - 0.5) * brick.w * 0.28;
    const jy = (crackFrac(seed, 400 + i) - 0.5) * brick.h * 0.32;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(cx + jx, cy + jy);
    ctx.strokeStyle = i % 2 === 0 ? strokeA : strokeB;
    ctx.lineWidth = 1.05 + dmg * 0.65;
    ctx.globalAlpha = 0.48 + dmg * 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Flat black / white bricks plus damage cracks (no glitter / glass gradients). */
function drawVersusBrickSimple(ctx: CanvasRenderingContext2D, brick: VersusBrick): void {
  const minimal = isMinimalBreakoutVisual();
  const mc = minimal ? getMinColors() : null;
  const rr = Math.min(4, brick.w * 0.12, brick.h * 0.14);
  let fill: string;
  let stroke: string;
  let lw: number;
  if (minimal && mc) {
    fill = brick.owner === 1 ? mc.brickP1Fill : mc.brickP2Fill;
    stroke = brick.owner === 1 ? mc.brickP1Stroke : mc.brickP2Stroke;
    lw = brick.owner === 1 ? 1.5 : 1.65;
  } else {
    fill = brick.owner === 1 ? "#0a0a0a" : "#b91c1c";
    stroke = brick.owner === 1 ? "#ef4444" : "#0a0a0a";
    lw = 2;
  }
  ctx.fillStyle = fill;
  pathRoundRect(ctx, brick.x, brick.y, brick.w, brick.h, rr);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  pathRoundRect(ctx, brick.x, brick.y, brick.w, brick.h, rr);
  ctx.stroke();

  const seed = brickCrackSeed(brick);
  if (minimal && mc) {
    if (brick.owner === 1) {
      drawVersusBrickCracks(ctx, brick, seed, "rgba(239,68,68,0.92)", "rgba(248,113,113,0.62)");
    } else {
      drawVersusBrickCracks(ctx, brick, seed, "rgba(10,10,10,0.9)", "rgba(127,29,29,0.78)");
    }
  } else {
    drawVersusBrickCracks(
      ctx,
      brick,
      seed,
      brick.owner === 1 ? "rgba(239,68,68,0.88)" : "rgba(10,10,10,0.88)",
      brick.owner === 1 ? "rgba(127,29,29,0.68)" : "rgba(185,28,28,0.72)",
    );
  }
}

export interface DrawIntroOpts {
  t: number;
}

interface VersusScorePopup {
  x: number;
  y: number;
  startMs: number;
  main: string;
  comboLine: string;
  player: PlayerId;
}

export class VersusBreakoutGame {
  w = 0;
  h = 0;
  phase: GamePhase = "ready";
  layoutIndex = 0;
  winner: PlayerId | null = null;
  bricks: VersusBrick[] = [];
  balls: VersusBall[] = [];
  capsules: VersusCapsule[] = [];
  paddle1X = 0;
  paddle2X = 0;
  paddle1Y = 0;
  paddle2Y = 0;
  basePaddleW = 100;
  paddleH = 14;
  wallLeft = 0;
  wallRight = 0;
  wallYTop = 0;
  wallYBot = 0;
  topMissY = 0;
  botMissY = 0;
  brickBandTop = 0;
  brickBandBot = 0;

  /** Points earned by destroying the opponent's bricks. */
  scoreP1 = 0;
  scoreP2 = 0;
  private comboCount: Record<PlayerId, number> = { 1: 0, 2: 0 };
  private comboExpireAt: Record<PlayerId, number> = { 1: 0, 2: 0 };
  private scorePopups: VersusScorePopup[] = [];

  slowBallUntil = 0;
  paddleBigUntil: Record<PlayerId, number> = { 1: 0, 2: 0 };
  paddleSmallUntil: Record<PlayerId, number> = { 1: 0, 2: 0 };
  /** Animate paddle width lerp 0..1 */
  paddleAnimScale: Record<PlayerId, number> = { 1: 1, 2: 1 };
  private paddleAnimTarget: Record<PlayerId, number> = { 1: 1, 2: 1 };

  private reduceMotion = false;
  private wasSlow = false;
  private brickAtlas: BrickTextureAtlas | null = null;
  private ballImage: HTMLImageElement | null = null;
  private paddleImage: HTMLImageElement | null = null;
  private capsuleSprites: Partial<Record<VersusCapsuleKind, HTMLImageElement>> = {};
  private hudTopReserve = 0;
  private hudBotReserve = 0;

  private onPhaseChange?: (phase: GamePhase) => void;
  private getAudioEnabled: () => boolean;
  private onHaptic?: (t: "light" | "medium" | "heavy" | "success" | "error") => void;
  private onJuice?: (ev: GameplayJuiceEvent) => void;

  constructor(opts: {
    onPhaseChange?: (phase: GamePhase) => void;
    getAudioEnabled: () => boolean;
    reduceMotion?: boolean;
    onHaptic?: (t: "light" | "medium" | "heavy" | "success" | "error") => void;
    onJuice?: (ev: GameplayJuiceEvent) => void;
  }) {
    this.onPhaseChange = opts.onPhaseChange;
    this.getAudioEnabled = opts.getAudioEnabled;
    this.reduceMotion = opts.reduceMotion ?? false;
    this.onHaptic = opts.onHaptic;
    this.onJuice = opts.onJuice;
  }

  private sfx(fn: () => void): void {
    if (!this.getAudioEnabled()) return;
    fn();
  }

  private setPhase(p: GamePhase): void {
    this.phase = p;
    this.onPhaseChange?.(p);
  }

  setBrickAtlas(atlas: BrickTextureAtlas | null): void {
    this.brickAtlas = atlas;
  }

  setBallImage(img: HTMLImageElement | null): void {
    this.ballImage = img;
  }

  setPaddleImage(img: HTMLImageElement | null): void {
    this.paddleImage = img;
  }

  /** Art for all versus capsule kinds; pass null to clear and use vector fallback. */
  setVersusCapsuleImages(imgs: VersusCapsuleImageSet | null): void {
    if (!imgs) {
      this.capsuleSprites = {};
      return;
    }
    this.capsuleSprites = {
      multiball: imgs.multiball,
      paddle_big: imgs.paddle_big,
      paddle_small: imgs.paddle_small,
      slow_ball: imgs.slow_ball,
      reverse_colors: imgs.reverse_colors,
      convert_colors: imgs.convert_colors,
    };
  }

  setHudReserves(topPx: number, bottomPx: number): void {
    this.hudTopReserve = Math.max(0, topPx);
    this.hudBotReserve = Math.max(0, bottomPx);
  }

  isSlowBallActive(): boolean {
    return performance.now() < this.slowBallUntil;
  }

  /** Dotted aim path in playfield space (same transform as `draw`). */
  getBallTrajectoryPolyline(ball: VersusBall): { x: number; y: number }[] {
    if (ball.stuckTo !== 0) return [];
    if (Math.hypot(ball.vx, ball.vy) < 8) return [];
    const bricks: TrajectoryBrick[] = [];
    for (let i = 0; i < this.bricks.length; i++) {
      const b = this.bricks[i];
      if (!b.alive) continue;
      bricks.push({ id: i, x: b.x, y: b.y, w: b.w, h: b.h });
    }
    return computeVersusTrajectoryPolyline({
      ox: ball.x,
      oy: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      r: ball.r,
      speed: this.currentBallSpeed(),
      wallLeft: this.wallLeft,
      wallRight: this.wallRight,
      wallYTop: this.wallYTop,
      wallYBot: this.wallYBot,
      clipMinY: this.playfieldTop(),
      clipMaxY: this.playfieldBottom(),
      bricks,
    });
  }

  getPaddleW(p: PlayerId): number {
    const now = performance.now();
    let m = 1;
    if (now < this.paddleBigUntil[p]) m *= PADDLE_BIG_SCALE;
    if (now < this.paddleSmallUntil[p]) m *= PADDLE_SMALL_SCALE;
    const target = Math.min(
      this.w * 0.42,
      Math.max(this.w * 0.12, this.basePaddleW * m),
    );
    const vis = this.paddleAnimScale[p];
    return target * vis;
  }

  private updatePaddleAnim(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const p of [1, 2] as const) {
      const t = this.paddleAnimTarget[p];
      this.paddleAnimScale[p] += (t - this.paddleAnimScale[p]) * k;
    }
  }

  private setPaddleVisualTarget(p: PlayerId): void {
    const now = performance.now();
    let m = 1;
    if (now < this.paddleBigUntil[p]) m *= PADDLE_BIG_SCALE;
    if (now < this.paddleSmallUntil[p]) m *= PADDLE_SMALL_SCALE;
    this.paddleAnimTarget[p] = Math.min(
      1.15,
      Math.max(0.45, m / Math.max(PADDLE_BIG_SCALE, 1)),
    );
  }

  /** Top Y of the glowing playfield stroke (above top paddle). */
  playfieldTop(): number {
    return this.paddle2Y - this.paddleH * 0.5 - 6;
  }

  /** Bottom Y of the glowing playfield stroke (below bottom paddle). */
  playfieldBottom(): number {
    return this.paddle1Y + this.paddleH * 0.5 + 6;
  }

  remainingFor(p: PlayerId): number {
    let n = 0;
    for (const b of this.bricks) {
      if (b.alive && b.owner === p) n++;
    }
    return n;
  }

  scoreFor(p: PlayerId): number {
    return p === 1 ? this.scoreP1 : this.scoreP2;
  }

  /** Current combo chain length if the combo window is still active (for HUD). */
  liveComboCount(p: PlayerId): number {
    const now = performance.now();
    if (now > this.comboExpireAt[p]) return 0;
    return this.comboCount[p];
  }

  private resetVersusScoring(): void {
    this.scoreP1 = 0;
    this.scoreP2 = 0;
    this.comboCount = { 1: 0, 2: 0 };
    this.comboExpireAt = { 1: 0, 2: 0 };
    this.scorePopups = [];
  }

  private tickScorePopups(): void {
    const now = performance.now();
    const maxAge = this.reduceMotion ? 560 : 960;
    this.scorePopups = this.scorePopups.filter((p) => now - p.startMs < maxAge);
  }

  private drawScorePopups(ctx: CanvasRenderingContext2D, nowMs: number): void {
    const THUMP = this.reduceMotion ? 85 : 195;
    const LIFE = this.reduceMotion ? 520 : 900;
    const fsBase = Math.max(15, Math.min(30, this.w * 0.044));

    for (const pop of this.scorePopups) {
      const elapsed = nowMs - pop.startMs;
      if (elapsed < 0 || elapsed > LIFE) continue;

      let scale: number;
      if (elapsed < THUMP) {
        const u = elapsed / THUMP;
        scale = this.reduceMotion
          ? 0.5 + 0.5 * u
          : 0.18 + 0.82 * easeOutBackIntro(Math.min(1, u));
      } else {
        scale = 1;
      }

      const drift = Math.max(0, elapsed - THUMP * 0.55) * (this.reduceMotion ? 0.065 : 0.048);
      const fadeT = Math.max(0, elapsed - THUMP * 0.25) / (LIFE - THUMP * 0.25);
      const alpha = elapsed < THUMP * 0.2 ? Math.min(1, elapsed / (THUMP * 0.2)) : Math.max(0, 1 - fadeT * 1.12);

      const x = pop.x;
      const y = pop.y + drift;
      const fs = fsBase * (pop.comboLine ? 1 : 1.05);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.translate(-x, -y);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 " + String(fs * 0.95) + "px Orbitron,system-ui,sans-serif";

      if (isMinimalBreakoutVisual()) {
        const mc = getMinColors();
        ctx.shadowBlur = 0;
        ctx.fillStyle = mc.scorePopupShadow;
        ctx.fillText(pop.main, x + 2, y + 3);
        ctx.fillStyle = mc.text;
        ctx.fillText(pop.main, x, y);
        ctx.strokeStyle = mc.accent;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.35;
        ctx.strokeText(pop.main, x, y);
        ctx.globalAlpha = alpha;
      } else {
        const grd = ctx.createLinearGradient(x - fs * 2.2, y - fs * 0.6, x + fs * 2.2, y + fs * 0.85);
        grd.addColorStop(0, "#fcd34d");
        grd.addColorStop(0.42, "#38bdf8");
        grd.addColorStop(0.78, "#c4b5fd");
        grd.addColorStop(1, "#e2e8f0");

        ctx.shadowColor =
          pop.player === 1 ? "rgba(239, 68, 68, 0.45)" : "rgba(220, 38, 38, 0.5)";
        ctx.shadowBlur = this.reduceMotion ? 0 : 14;
        ctx.fillStyle = "rgba(2, 6, 23, 0.5)";
        ctx.fillText(pop.main, x + 2, y + 3);
        ctx.fillStyle = grd;
        ctx.fillText(pop.main, x, y);
        ctx.shadowBlur = 0;
      }

      if (pop.comboLine) {
        const cfs = fs * 0.4;
        ctx.font = "800 " + String(cfs) + "px Orbitron,system-ui,sans-serif";
        if (isMinimalBreakoutVisual()) {
          const mc = getMinColors();
          ctx.fillStyle = mc.scoreComboShadow;
          ctx.fillText(pop.comboLine, x + 1, y + fs * 0.72 + 2);
          ctx.fillStyle = mc.accentSoft;
          ctx.fillText(pop.comboLine, x, y + fs * 0.72);
        } else {
          const cg = ctx.createLinearGradient(x - fs, y + fs * 0.35, x + fs, y + fs * 1.1);
          cg.addColorStop(0, "#fde68a");
          cg.addColorStop(0.5, "#f472b6");
          cg.addColorStop(1, "#a78bfa");
          ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
          ctx.fillText(pop.comboLine, x + 1, y + fs * 0.72 + 2);
          ctx.fillStyle = cg;
          ctx.fillText(pop.comboLine, x, y + fs * 0.72);
        }
      }

      ctx.restore();
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    const marginX = Math.max(10, width * 0.035);
    this.wallLeft = marginX;
    this.wallRight = width - marginX;

    const paddleClear = Math.max(6, height * 0.01);
    const hudArenaPad = Math.max(22, height * 0.028);
    const topBand = this.hudTopReserve + Math.max(paddleClear, hudArenaPad);
    const botBand = this.hudBotReserve + Math.max(paddleClear, hudArenaPad);
    this.paddle2Y = topBand + this.paddleH * 0.5;
    this.paddle1Y = height - botBand - this.paddleH * 0.5;

    this.topMissY = this.paddle2Y - this.paddleH * 0.5 - DEAD_PAD;
    this.botMissY = this.paddle1Y + this.paddleH * 0.5 + DEAD_PAD;
    this.wallYTop = this.topMissY + 16;
    this.wallYBot = this.botMissY - 16;

    const faceGap =
      this.paddle1Y - this.paddleH * 0.5 - (this.paddle2Y + this.paddleH * 0.5);
    const desiredBrickPad = Math.max(120, height * 0.19);
    const minBrickBand = 56;
    const maxPadForBand = Math.max(0, (faceGap - minBrickBand) * 0.5);
    const brickPad = Math.max(8, Math.min(desiredBrickPad, maxPadForBand));
    this.brickBandTop = this.paddle2Y + this.paddleH * 0.5 + brickPad;
    this.brickBandBot = this.paddle1Y - this.paddleH * 0.5 - brickPad;

    this.basePaddleW = Math.min(130, Math.max(68, width * 0.22));
    this.paddle1X = width / 2;
    this.paddle2X = width / 2;

    this.syncBrickGeometry();
    this.syncStuckBalls();
  }

  /**
   * One shared brick field between both paddles, vertically centered in the play band.
   * Two colors in the grid; first to clear all bricks of their color wins.
   */
  private centeredBrickLayoutParams(def: VersusLayoutDef): {
    cols: number;
    rowCount: number;
    brickH: number;
    brickW: number;
    gap: number;
    yStart: number;
  } | null {
    const innerTop = this.brickBandTop;
    const innerBot = this.brickBandBot;
    const innerH = innerBot - innerTop;
    if (innerH < 40) return null;

    const cols = Math.max(...def.grid.map((r) => r.length));
    const rowCount = def.grid.length;
    if (rowCount === 0) return null;

    const gap = 4;
    const rowGaps = gap * Math.max(0, rowCount - 1);
    /** Larger glass bricks; still shrink if the face band is tight. */
    let brickH = Math.min(40, Math.max(17, (innerH - rowGaps) / rowCount));
    let totalStack = rowCount * brickH + rowGaps;
    if (totalStack > innerH + 0.5) {
      brickH = Math.max(11, (innerH - rowGaps) / rowCount);
      totalStack = rowCount * brickH + rowGaps;
    }
    const yStart = innerTop + Math.max(0, (innerH - totalStack) * 0.5);
    const totalW = this.wallRight - this.wallLeft - gap * (cols - 1);
    const brickW = totalW / cols;
    return { cols, rowCount, brickH, brickW, gap, yStart };
  }

  private syncBrickGeometry(): void {
    if (this.bricks.length === 0) return;
    const def = LAYOUTS[this.layoutIndex];
    const p = this.centeredBrickLayoutParams(def);
    if (!p) return;

    const { cols, rowCount, brickH, brickW, gap, yStart } = p;
    let idx = 0;
    for (let row = 0; row < rowCount; row++) {
      const line = def.grid[row].padEnd(cols, ".");
      const y = yStart + row * (brickH + gap);
      for (let col = 0; col < cols; col++) {
        const ch = line[col];
        if (ch !== "1" && ch !== "2") continue;
        const b = this.bricks[idx];
        if (!b) return;
        b.x = this.wallLeft + col * (brickW + gap);
        b.y = y;
        b.w = brickW;
        b.h = brickH;
        idx += 1;
      }
    }
  }

  loadMatch(idx = 0): void {
    this.layoutIndex = Math.max(0, Math.min(LAYOUTS.length - 1, idx));
    this.winner = null;
    this.resetVersusScoring();
    const def = LAYOUTS[this.layoutIndex];
    this.bricks = [];
    const p = this.centeredBrickLayoutParams(def);
    if (!p) {
      this.capsules = [];
      this.spawnInitialBall();
      this.setPhase("ready");
      console.log("[VersusBreakoutGame]", "layout", def.name, "bricks 0 (band too small)");
      return;
    }

    const { cols, rowCount, brickH, brickW, gap, yStart } = p;

    for (let row = 0; row < rowCount; row++) {
      const line = def.grid[row].padEnd(cols, ".");
      const tier = tierForRow(row, rowCount);
      const maxHp = BRICK_TIER_MAX_HP[tier];
      const y = yStart + row * (brickH + gap);
      for (let col = 0; col < cols; col++) {
        const ch = line[col];
        if (ch !== "1" && ch !== "2") continue;
        const owner: PlayerId = ch === "1" ? 1 : 2;
        const hue = owner === 1 ? P1_HUE : P2_HUE;
        const x = this.wallLeft + col * (brickW + gap);
        this.bricks.push({
          x,
          y,
          w: brickW,
          h: brickH,
          alive: true,
          owner,
          hue,
          tier,
          hp: maxHp,
          maxHp,
        });
      }
    }
    this.capsules = [];
    this.slowBallUntil = 0;
    this.paddleBigUntil = { 1: 0, 2: 0 };
    this.paddleSmallUntil = { 1: 0, 2: 0 };
    this.paddleAnimScale = { 1: 1, 2: 1 };
    this.paddleAnimTarget = { 1: 1, 2: 1 };
    this.spawnInitialBall();
    this.setPhase("ready");
    console.log("[VersusBreakoutGame]", "layout", def.name, "bricks", this.bricks.length);
  }

  restartMatch(): void {
    this.loadMatch(this.layoutIndex);
  }

  cycleLayout(): void {
    this.loadMatch((this.layoutIndex + 1) % LAYOUTS.length);
  }

  private spawnInitialBall(): void {
    const r = Math.max(5, Math.min(9, this.w * 0.011));
    this.balls = [
      {
        x: this.paddle1X,
        y: this.paddle1Y - this.paddleH * 0.5 - r - 2,
        vx: 0,
        vy: 0,
        r,
        stuckTo: 1,
      },
    ];
    this.syncStuckBalls();
  }

  private syncStuckBalls(): void {
    for (const b of this.balls) {
      if (b.stuckTo === 1) {
        b.x = this.paddle1X;
        b.y = this.paddle1Y - this.paddleH * 0.5 - b.r - 2;
        b.vx = 0;
        b.vy = 0;
      } else if (b.stuckTo === 2) {
        b.x = this.paddle2X;
        b.y = this.paddle2Y + this.paddleH * 0.5 + b.r + 2;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  setPaddleTargetX(p: PlayerId, screenX: number): void {
    const w = this.getPaddleW(p);
    const half = w / 2;
    const x = Math.max(
      this.wallLeft + half + 2,
      Math.min(this.wallRight - half - 2, screenX),
    );
    if (p === 1) this.paddle1X = x;
    else this.paddle2X = x;
    if (this.phase === "ready" || this.balls.some((b) => b.stuckTo !== 0)) {
      this.syncStuckBalls();
    }
  }

  nudgePaddle(p: PlayerId, dir: -1 | 1, dt: number): void {
    const cx = p === 1 ? this.paddle1X : this.paddle2X;
    this.setPaddleTargetX(p, cx + dir * PADDLE_SPEED * dt);
  }

  startPlayOrLaunch(): void {
    if (this.phase === "game_won") return;
    if (this.phase === "ready") this.setPhase("playing");
    const sp = this.currentBallSpeed();
    for (const b of this.balls) {
      if (b.stuckTo === 0) continue;
      const up = b.stuckTo === 1;
      b.stuckTo = 0;
      const angle = up
        ? -Math.PI * 0.5 + (Math.random() - 0.5) * 0.55
        : Math.PI * 0.5 + (Math.random() - 0.5) * 0.55;
      b.vx = Math.cos(angle) * sp;
      b.vy = Math.sin(angle) * sp;
      const n = normSpeed(b.vx, b.vy, sp);
      b.vx = n.vx;
      b.vy = n.vy;
    }
  }

  private currentBallSpeed(): number {
    const m = performance.now() < this.slowBallUntil ? SLOW_MULT : 1;
    return BASE_BALL_SPEED * m;
  }

  private pickCapsuleKind(): VersusCapsuleKind {
    const r = Math.random();
    if (r < 0.22) return "multiball";
    if (r < 0.4) return "paddle_big";
    if (r < 0.55) return "paddle_small";
    if (r < 0.7) return "slow_ball";
    if (r < 0.84) return "reverse_colors";
    return "convert_colors";
  }

  private maybeSpawnCapsule(cx: number, cy: number): void {
    if (Math.random() > CAPSULE_DROP) return;
    const speed = 95 + Math.random() * 40;
    const down = Math.random() < 0.5;
    this.capsules.push({
      x: cx,
      y: cy,
      vy: down ? speed : -speed,
      kind: this.pickCapsuleKind(),
      r: Math.max(9, this.w * 0.018),
    });
  }

  private damageBrick(brick: VersusBrick): void {
    if (!brick.alive || brick.hp <= 0) return;
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    brick.hp -= 1;
    if (brick.hp > 0) {
      this.sfx(() => ProtoAudio.brickChip());
      this.onHaptic?.("light");
      this.onJuice?.({ type: "brick_chip", x: cx, y: cy, hue: brick.hue });
      return;
    }
    brick.alive = false;
    this.sfx(() => ProtoAudio.brickBreak());
    this.onHaptic?.("medium");
    this.onJuice?.({ type: "brick_break", x: cx, y: cy, hue: brick.hue, tier: brick.tier });
    this.maybeSpawnCapsule(cx, cy);

    const now = performance.now();
    const scorer: PlayerId = brick.owner === 1 ? 2 : 1;
    if (now > this.comboExpireAt[scorer]) {
      this.comboCount[scorer] = 0;
    }
    this.comboCount[scorer] = Math.min(COMBO_MULT_CAP, this.comboCount[scorer] + 1);
    this.comboExpireAt[scorer] = now + COMBO_WINDOW_MS;
    const base = scoreForDestroyedBrick(brick.tier);
    const mult = this.comboCount[scorer];
    const pts = base * mult;
    if (scorer === 1) this.scoreP1 += pts;
    else this.scoreP2 += pts;
    const main = "+" + String(pts);
    const comboLine = mult >= 2 ? "x" + String(mult) + " COMBO" : "";
    this.scorePopups.push({
      x: cx,
      y: cy,
      startMs: now,
      main,
      comboLine,
      player: scorer,
    });

    this.checkWin();
  }

  private checkWin(): void {
    const r1 = this.remainingFor(1);
    const r2 = this.remainingFor(2);
    if (r1 === 0 && r2 === 0) {
      this.winner = Math.random() < 0.5 ? 1 : 2;
      this.setPhase("game_won");
      this.sfx(() => ProtoAudio.versusWin());
      this.onHaptic?.("success");
      this.onJuice?.({ type: "versus_win", player: this.winner });
      return;
    }
    if (r1 === 0) {
      this.winner = 1;
      this.setPhase("game_won");
      this.sfx(() => ProtoAudio.versusWin());
      this.onHaptic?.("success");
      this.onJuice?.({ type: "versus_win", player: 1 });
      return;
    }
    if (r2 === 0) {
      this.winner = 2;
      this.setPhase("game_won");
      this.sfx(() => ProtoAudio.versusWin());
      this.onHaptic?.("success");
      this.onJuice?.({ type: "versus_win", player: 2 });
    }
  }

  private reflectBottomPaddle(ball: VersusBall): void {
    const w = this.getPaddleW(1);
    const half = w / 2;
    const px = this.paddle1X;
    const py = this.paddle1Y;
    const t = (ball.x - (px - half)) / w;
    const clampedT = Math.max(0, Math.min(1, t));
    const angle = Math.PI * (0.15 + clampedT * 0.7);
    const sp = this.currentBallSpeed();
    ball.vx = Math.cos(angle) * sp;
    ball.vy = -Math.abs(Math.sin(angle) * sp);
    const n = normSpeed(ball.vx, ball.vy, sp);
    ball.vx = n.vx;
    ball.vy = n.vy;
    ball.y = py - this.paddleH * 0.5 - ball.r - 0.5;
    this.sfx(() => ProtoAudio.paddleHit());
    this.onHaptic?.("light");
    this.onJuice?.({ type: "paddle_hit", x: ball.x, y: ball.y, player: 1 });
  }

  private reflectTopPaddle(ball: VersusBall): void {
    const w = this.getPaddleW(2);
    const half = w / 2;
    const px = this.paddle2X;
    const py = this.paddle2Y;
    const t = (ball.x - (px - half)) / w;
    const clampedT = Math.max(0, Math.min(1, t));
    const angle = Math.PI * (0.15 + clampedT * 0.7);
    const sp = this.currentBallSpeed();
    ball.vx = Math.cos(angle) * sp;
    ball.vy = Math.abs(Math.sin(angle) * sp);
    const n = normSpeed(ball.vx, ball.vy, sp);
    ball.vx = n.vx;
    ball.vy = n.vy;
    ball.y = py + this.paddleH * 0.5 + ball.r + 0.5;
    this.sfx(() => ProtoAudio.paddleHit());
    this.onHaptic?.("light");
    this.onJuice?.({ type: "paddle_hit", x: ball.x, y: ball.y, player: 2 });
  }

  private circleRectResolve(
    ball: VersusBall,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ): { hit: boolean; nx: number; ny: number } {
    const cx = ball.x;
    const cy = ball.y;
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= ball.r * ball.r) return { hit: false, nx: 0, ny: 0 };
    const d = Math.sqrt(d2) || 0.0001;
    return { hit: true, nx: dx / d, ny: dy / d };
  }

  private capsuleHitsPaddle(
    cap: VersusCapsule,
    px: number,
    py: number,
    pw: number,
  ): boolean {
    const halfW = pw / 2;
    const top = py - this.paddleH * 0.5;
    const bot = py + this.paddleH * 0.5;
    return (
      cap.y + cap.r >= top &&
      cap.y - cap.r <= bot &&
      cap.x >= px - halfW - cap.r &&
      cap.x <= px + halfW + cap.r
    );
  }

  private applyCapsule(kind: VersusCapsuleKind, collector: PlayerId): void {
    const now = performance.now();
    const opp: PlayerId = collector === 1 ? 2 : 1;
    switch (kind) {
      case "multiball": {
        const moving = this.balls.filter((b) => b.stuckTo === 0);
        if (moving.length === 0) {
          const stuck = this.balls.find((b) => b.stuckTo !== 0);
          if (stuck) {
            stuck.stuckTo = 0;
            const up = stuck.y > this.h * 0.5;
            const angle = up
              ? -Math.PI * 0.5 + (Math.random() - 0.5) * 0.4
              : Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
            const sp = this.currentBallSpeed();
            stuck.vx = Math.cos(angle) * sp;
            stuck.vy = Math.sin(angle) * sp;
          }
          return;
        }
        const src = moving[0];
        const sp = this.currentBallSpeed();
        const angles = [-0.32, 0, 0.32];
        this.balls = [];
        for (const da of angles) {
          const a = Math.atan2(src.vy, src.vx) + da;
          const n = normSpeed(Math.cos(a), Math.sin(a), sp);
          this.balls.push({
            x: src.x,
            y: src.y,
            vx: n.vx,
            vy: n.vy,
            r: src.r,
            stuckTo: 0,
          });
        }
        this.onJuice?.({ type: "multiball_burst", x: src.x, y: src.y });
        break;
      }
      case "paddle_big":
        this.paddleBigUntil[collector] = Math.max(this.paddleBigUntil[collector], now) + EFFECT_MS;
        this.paddleSmallUntil[collector] = 0;
        this.setPaddleVisualTarget(collector);
        this.onJuice?.({ type: "paddle_resize", player: collector, big: true });
        break;
      case "paddle_small":
        this.paddleBigUntil[collector] = 0;
        this.paddleSmallUntil[collector] = Math.max(this.paddleSmallUntil[collector], now) + EFFECT_MS * 0.85;
        this.setPaddleVisualTarget(collector);
        this.onJuice?.({ type: "paddle_resize", player: collector, big: false });
        break;
      case "slow_ball":
        this.slowBallUntil = Math.max(this.slowBallUntil, now) + EFFECT_MS;
        this.onJuice?.({ type: "slow_ball_pulse" });
        break;
      case "reverse_colors":
        for (const b of this.bricks) {
          if (!b.alive) continue;
          b.owner = b.owner === 1 ? 2 : 1;
          b.hue = b.owner === 1 ? P1_HUE : P2_HUE;
        }
        this.sfx(() => ProtoAudio.superReverse());
        this.onHaptic?.("heavy");
        this.onJuice?.({ type: "super_reverse" });
        break;
      case "convert_colors":
        for (const b of this.bricks) {
          if (!b.alive) continue;
          if (b.owner === opp) {
            b.owner = collector;
            b.hue = collector === 1 ? P1_HUE : P2_HUE;
          }
        }
        this.sfx(() => ProtoAudio.superConvert());
        this.onHaptic?.("heavy");
        this.onJuice?.({ type: "super_convert", player: collector });
        this.checkWin();
        break;
      default:
        break;
    }
  }

  /** Power-ups keep moving while waiting on a paddle (`ready`), only freeze on match end. */
  private tickCapsules(dt: number): void {
    for (const c of this.capsules) {
      c.y += c.vy * dt;
    }
    const w1 = this.getPaddleW(1);
    const w2 = this.getPaddleW(2);
    this.capsules = this.capsules.filter((cap) => {
      if (cap.y > this.h + cap.r + 30) return false;
      if (cap.y < -cap.r - 30) return false;
      if (this.capsuleHitsPaddle(cap, this.paddle1X, this.paddle1Y, w1)) {
        this.onJuice?.({ type: "powerup_collect", x: cap.x, y: cap.y, kind: cap.kind });
        this.applyCapsule(cap.kind, 1);
        this.sfx(() => ProtoAudio.powerCollect());
        this.onHaptic?.("light");
        return false;
      }
      if (this.capsuleHitsPaddle(cap, this.paddle2X, this.paddle2Y, w2)) {
        this.onJuice?.({ type: "powerup_collect", x: cap.x, y: cap.y, kind: cap.kind });
        this.applyCapsule(cap.kind, 2);
        this.sfx(() => ProtoAudio.powerCollect());
        this.onHaptic?.("light");
        return false;
      }
      return true;
    });
  }

  update(dt: number): void {
    this.updatePaddleAnim(dt);
    this.tickScorePopups();
    if (this.phase === "game_won") return;

    if (this.phase === "playing") {
    const now = performance.now();
    const slowActive = now < this.slowBallUntil;
    if (slowActive) {
      for (const b of this.balls) {
        if (b.stuckTo !== 0) continue;
        const n = normSpeed(b.vx, b.vy, this.currentBallSpeed());
        b.vx = n.vx;
        b.vy = n.vy;
      }
    } else if (this.wasSlow) {
      const sp = BASE_BALL_SPEED;
      for (const b of this.balls) {
        if (b.stuckTo !== 0) continue;
        const n = normSpeed(b.vx, b.vy, sp);
        b.vx = n.vx;
        b.vy = n.vy;
      }
    }
    this.wasSlow = slowActive;

    const w1 = this.getPaddleW(1);
    const w2 = this.getPaddleW(2);

    /** Who receives the ball after a miss (opponent of the player who let it through). */
    let missPossessionReceiver: PlayerId | null = null;

    for (const ball of this.balls) {
      if (ball.stuckTo !== 0) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.y >= this.wallYTop && ball.y <= this.wallYBot) {
        if (ball.x - ball.r < this.wallLeft) {
          ball.x = this.wallLeft + ball.r;
          ball.vx = Math.abs(ball.vx);
          this.sfx(() => ProtoAudio.wallBounce());
          this.onJuice?.({ type: "wall_hit", x: ball.x, y: ball.y });
        } else if (ball.x + ball.r > this.wallRight) {
          ball.x = this.wallRight - ball.r;
          ball.vx = -Math.abs(ball.vx);
          this.sfx(() => ProtoAudio.wallBounce());
          this.onJuice?.({ type: "wall_hit", x: ball.x, y: ball.y });
        }
      }

      const b1 = this.circleRectResolve(
        ball,
        this.paddle1X - w1 / 2,
        this.paddle1Y - this.paddleH * 0.5,
        w1,
        this.paddleH,
      );
      if (b1.hit && ball.vy > 0) this.reflectBottomPaddle(ball);

      const b2 = this.circleRectResolve(
        ball,
        this.paddle2X - w2 / 2,
        this.paddle2Y - this.paddleH * 0.5,
        w2,
        this.paddleH,
      );
      if (b2.hit && ball.vy < 0) this.reflectTopPaddle(ball);

      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const hit = this.circleRectResolve(ball, brick.x, brick.y, brick.w, brick.h);
        if (!hit.hit) continue;
        this.damageBrick(brick);
        if (Math.abs(hit.nx) > Math.abs(hit.ny)) ball.vx *= -1;
        else ball.vy *= -1;
        const sp = this.currentBallSpeed();
        const n = normSpeed(ball.vx, ball.vy, sp);
        ball.vx = n.vx;
        ball.vy = n.vy;
        break;
      }

      if (ball.y + ball.r < this.topMissY) {
        ball.y = -1000;
        missPossessionReceiver = 1;
      } else if (ball.y - ball.r > this.botMissY) {
        ball.y = this.h + 1000;
        missPossessionReceiver = 2;
      }
    }

    this.balls = this.balls.filter((b) => b.y > -500 && b.y < this.h + 500);

    if (this.balls.length === 0 && this.phase === "playing") {
      const receiver: PlayerId = missPossessionReceiver ?? 1;
      this.spawnBallForPlayer(receiver);
      this.onJuice?.({ type: "possession_recover", player: receiver });
      this.onHaptic?.("medium");
      this.setPhase("ready");
    }
    }

    this.tickCapsules(dt);
  }

  private spawnBallForPlayer(p: PlayerId): void {
    const r = Math.max(5, Math.min(9, this.w * 0.011));
    this.balls = [
      {
        x: p === 1 ? this.paddle1X : this.paddle2X,
        y:
          p === 1
            ? this.paddle1Y - this.paddleH * 0.5 - r - 2
            : this.paddle2Y + this.paddleH * 0.5 + r + 2,
        vx: 0,
        vy: 0,
        r,
        stuckTo: p,
      },
    ];
    this.syncStuckBalls();
  }

  layoutName(): string {
    return LAYOUTS[this.layoutIndex]?.name ?? "?";
  }

  maxLayouts(): number {
    return LAYOUTS.length;
  }

  draw(ctx: CanvasRenderingContext2D, intro?: DrawIntroOpts): void {
    const nowMs = performance.now();
    const flashSlow = nowMs < this.slowBallUntil;
    const tIntro = intro && intro.t < 0.999 ? intro.t : null;
    const aliveBricks = this.bricks.filter((b) => b.alive);
    const brickCount = aliveBricks.length;
    let brickVisualIndex = 0;

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      let appear = 1;
      if (tIntro !== null && brickCount > 0) {
        const staggerWindow = 0.74;
        const delay = (brickVisualIndex / Math.max(1, brickCount - 1)) * staggerWindow;
        appear = clamp01Intro((tIntro - delay) / (1 - staggerWindow + 0.0001));
        appear = easeOutBackIntro(appear);
        brickVisualIndex += 1;
      }
      if (appear <= 0.004) continue;

      const alpha = (0.5 + 0.5 * (brick.hp / brick.maxHp)) * appear;
      const cx = brick.x + brick.w / 2;
      const cy = brick.y + brick.h / 2;
      const sc = 0.18 + 0.82 * appear;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      ctx.translate(-cx, -cy);
      ctx.filter = "none";
      drawVersusBrickSimple(ctx, brick);
      ctx.restore();
    }

    const paddleHasStuckBall = (p: PlayerId): boolean =>
      this.balls.some((b) => b.stuckTo === p);

    /** Sway offset for the player serving / holding the ball (screen px, after intro scale). */
    const possessionSway = (p: PlayerId): { dx: number; dy: number } => {
      if (!paddleHasStuckBall(p) || this.reduceMotion) return { dx: 0, dy: 0 };
      const tt = nowMs * 0.001;
      const side = p === 1 ? 1 : -1;
      return {
        dx: Math.sin(tt * 2.85) * 3.4 + Math.sin(tt * 4.6) * 0.9,
        dy: Math.sin(tt * 3.55) * 1.55 * side + Math.cos(tt * 2.2) * 0.55 * side,
      };
    };

    const drawPaddle = (
      px: number,
      py: number,
      pw: number,
      p: PlayerId,
      appear: number,
    ): void => {
      if (appear <= 0.008) return;
      const ph = this.paddleH;
      const x0 = px - pw / 2;
      const y0 = py - ph / 2;
      const pcx = px;
      const pcy = py;
      const psc = 0.2 + 0.8 * appear;
      const { dx, dy } = possessionSway(p);
      const hasBall = paddleHasStuckBall(p);
      const pImg = this.paddleImage;
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(pcx, pcy);
      ctx.scale(psc, psc);
      if (dx !== 0 || dy !== 0) {
        ctx.translate(dx / psc, dy / psc);
      }
      ctx.translate(-pcx, -pcy);
      const minimal = isMinimalBreakoutVisual();
      const glow = minimal
        ? getMinColors().paddleShadowGlow
        : p === 1
          ? "rgba(239, 68, 68, 0.35)"
          : "rgba(220, 38, 38, 0.4)";
      ctx.shadowColor = glow;
      ctx.shadowBlur = this.reduceMotion || minimal ? 0 : hasBall ? 20 : 12;
      if (!minimal && pImg && pImg.complete && pImg.naturalWidth > 0) {
        ctx.drawImage(pImg, x0, y0, pw, ph);
      } else {
        if (minimal) {
          const mc = getMinColors();
          if (p === 1) {
            ctx.fillStyle = mc.paddleP1Fill;
            ctx.strokeStyle = mc.paddleP1Stroke;
          } else {
            ctx.fillStyle = mc.paddleP2Fill;
            ctx.strokeStyle = mc.paddleP2Stroke;
          }
          ctx.lineWidth = p === 1 ? 2.5 : 2;
          pathRoundRect(ctx, x0, y0, pw, ph, 6);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = p === 1 ? "#0a0a0a" : "#b91c1c";
          ctx.strokeStyle = p === 1 ? "#ef4444" : "#0a0a0a";
          ctx.lineWidth = 3;
          pathRoundRect(ctx, x0, y0, pw, ph, 6);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (hasBall && !this.reduceMotion) {
        const pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.0042);
        ctx.globalCompositeOperation = minimal ? "source-over" : "screen";
        ctx.globalAlpha = minimal ? 0.55 * pulse * appear : 0.22 * pulse * appear;
        ctx.strokeStyle = minimal
          ? getMinColors().accent
          : p === 1
            ? "rgba(239, 68, 68, 0.9)"
            : "rgba(254, 202, 202, 0.95)";
        ctx.lineWidth = minimal ? 2 : 2.5;
        pathRoundRect(ctx, x0 - 1, y0 - 1, pw + 2, ph + 2, 8);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = appear;
      }
      ctx.restore();
    };

    let p2Appear = 1;
    let p1Appear = 1;
    if (tIntro !== null) {
      p2Appear = easeOutBackIntro(clamp01Intro((tIntro - 0.42) / 0.34));
      p1Appear = easeOutBackIntro(clamp01Intro((tIntro - 0.52) / 0.36));
    }
    drawPaddle(this.paddle2X, this.paddle2Y, this.getPaddleW(2), 2, p2Appear);
    drawPaddle(this.paddle1X, this.paddle1Y, this.getPaddleW(1), 1, p1Appear);

    const capMinimal = isMinimalBreakoutVisual();
    for (const cap of this.capsules) {
      ctx.save();
      const k = cap.kind;
      const sprite = this.capsuleSprites[k];
      const useSprite = !!(sprite && sprite.complete && sprite.naturalWidth > 0);
      if (useSprite && sprite) {
        const iw = sprite.naturalWidth;
        const ih = sprite.naturalHeight;
        const box = cap.r * 2;
        const scale = Math.min(box / iw, box / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(sprite, cap.x - dw * 0.5, cap.y - dh * 0.5, dw, dh);
        ctx.restore();
        continue;
      }
      if (capMinimal) {
        if (k === "multiball") {
          ctx.fillStyle = "rgba(239, 68, 68, 0.92)";
          ctx.strokeStyle = "#450a0a";
        } else if (k === "paddle_big") {
          ctx.fillStyle = "#e5e5e5";
          ctx.strokeStyle = "#0a0a0a";
        } else if (k === "paddle_small") {
          ctx.fillStyle = "#404040";
          ctx.strokeStyle = "#fafafa";
        } else if (k === "slow_ball") {
          ctx.fillStyle = "#a3a3a3";
          ctx.strokeStyle = "#171717";
        } else if (k === "reverse_colors") {
          ctx.fillStyle = "#262626";
          ctx.strokeStyle = "#ef4444";
        } else {
          ctx.fillStyle = "#fafafa";
          ctx.strokeStyle = "#ef4444";
        }
      } else if (k === "multiball") {
        ctx.fillStyle = "#4ade80";
        ctx.strokeStyle = "#166534";
      } else if (k === "paddle_big") {
        ctx.fillStyle = "#38bdf8";
        ctx.strokeStyle = "#075985";
      } else if (k === "paddle_small") {
        ctx.fillStyle = "#fb923c";
        ctx.strokeStyle = "#9a3412";
      } else if (k === "slow_ball") {
        ctx.fillStyle = "#93c5fd";
        ctx.strokeStyle = "#1e3a8a";
      } else if (k === "reverse_colors") {
        ctx.fillStyle = "#e879f9";
        ctx.strokeStyle = "#86198f";
      } else {
        ctx.fillStyle = "#fcd34d";
        ctx.strokeStyle = "#a16207";
      }
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    let ballAppear = 1;
    if (tIntro !== null) {
      ballAppear = easeOutBackIntro(clamp01Intro((tIntro - 0.72) / 0.28));
    }
    const ballImg = this.ballImage;
    const useSprite =
      !isMinimalBreakoutVisual() && !!(ballImg && ballImg.complete && ballImg.naturalWidth > 0);
    for (const ball of this.balls) {
      if (ballAppear <= 0.006) continue;
      ctx.save();
      ctx.globalAlpha = ballAppear;
      const br = ball.r * (0.25 + 0.75 * ballAppear);
      const sw = ball.stuckTo !== 0 ? possessionSway(ball.stuckTo) : { dx: 0, dy: 0 };
      const bx = ball.x + sw.dx;
      const by = ball.y + sw.dy;
      const d = br * 2;
      if (useSprite) {
        if (flashSlow) {
          ctx.shadowColor = "#93c5fd";
          ctx.shadowBlur = this.reduceMotion ? 0 : 12;
        }
        const biw = ballImg!.naturalWidth;
        const bih = ballImg!.naturalHeight;
        const bscale = Math.min(d / biw, d / bih);
        const bdw = biw * bscale;
        const bdh = bih * bscale;
        ctx.drawImage(ballImg!, bx - bdw * 0.5, by - bdh * 0.5, bdw, bdh);
      } else {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        if (isMinimalBreakoutVisual()) {
          const mc = getMinColors();
          ctx.fillStyle = flashSlow ? mc.ballSlow : mc.ball;
          ctx.strokeStyle = flashSlow ? mc.ballStrokeSlow : mc.ballStroke;
          ctx.lineWidth = 2;
          if (!this.reduceMotion && !flashSlow) {
            ctx.shadowColor = "rgba(239, 68, 68, 0.55)";
            ctx.shadowBlur = 10;
          }
        } else {
          ctx.fillStyle = flashSlow ? "#bfdbfe" : "#ffffff";
          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 2;
        }
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    this.drawScorePopups(ctx, nowMs);
  }
}
