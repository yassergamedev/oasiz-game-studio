import {
  BRICK_HUES,
  BRICK_TIER_MAX_HP,
  type BrickHue,
  type BrickSizeTier,
  type BrickTextureAtlas,
  scoreForDestroyedBrick,
  tierForRow,
} from "./brickAssets";
import type { GameplayJuiceEvent } from "./gameplayJuice";
import { ProtoAudio } from "./protoAudio";

export type GamePhase = "ready" | "playing" | "level_complete" | "game_over" | "game_won";

export type CapsuleKind = "multiball" | "fastball";

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  /** From asset set brick-{hue}-{tier}.png */
  hue: BrickHue;
  tier: BrickSizeTier;
  hp: number;
  maxHp: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  stuckToPaddle: boolean;
}

export interface Capsule {
  x: number;
  y: number;
  vy: number;
  kind: CapsuleKind;
  r: number;
}

export interface LevelDef {
  name: string;
  /** Row strings: '#' = brick, '.' or space = empty */
  grid: string[];
}

const LEVELS: LevelDef[] = [
  {
    name: "1",
    grid: [
      "########",
      "########",
      "########",
      "########",
    ],
  },
  {
    name: "2",
    grid: [
      "..####..",
      ".######.",
      "########",
      "########",
      ".######.",
      "..####..",
    ],
  },
  {
    name: "3",
    grid: [
      "#.#.#.#.",
      ".#.#.#.#",
      "########",
      "##....##",
      "##....##",
      "########",
    ],
  },
];

const BASE_BALL_SPEED = 320;
const FAST_MULTIPLIER = 1.55;
const FAST_DURATION_MS = 8000;
const CAPSULE_DROP_CHANCE = 0.14;
const PADDLE_SPEED = 520;
const DEATH_MARGIN = 8;

function normSpeed(vx: number, vy: number, target: number): { vx: number; vy: number } {
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return { vx: 0, vy: -target };
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

export interface DrawIntroOpts {
  /** 0 = hidden, 1 = fully revealed */
  t: number;
}

export class BreakoutGame {
  w = 0;
  h = 0;
  phase: GamePhase = "ready";
  levelIndex = 0;
  lives = 3;
  score = 0;
  bricks: Brick[] = [];
  balls: Ball[] = [];
  capsules: Capsule[] = [];
  paddleX = 0;
  paddleW = 100;
  paddleH = 14;
  paddleY = 0;
  wallLeft = 0;
  wallRight = 0;
  wallTop = 0;
  fastBallUntil = 0;
  private reduceMotion = false;
  private wasFastBall = false;
  private brickAtlas: BrickTextureAtlas | null = null;
  private ballImage: HTMLImageElement | null = null;
  private paddleImage: HTMLImageElement | null = null;
  /** Extra top margin so bricks sit below canvas-drawn HUD frame. */
  private hudReservePx = 0;

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

  setHudReserve(px: number): void {
    this.hudReservePx = Math.max(0, px);
  }

  isFastBallActive(): boolean {
    return performance.now() < this.fastBallUntil;
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    const marginX = Math.max(12, width * 0.04);
    this.wallLeft = marginX;
    this.wallRight = width - marginX;
    this.wallTop = Math.max(this.hudReservePx, Math.max(72, height * 0.12));
    this.paddleY = height - Math.max(100, height * 0.14);
    this.paddleW = Math.min(140, Math.max(72, width * 0.22));
    this.paddleX = width / 2;
    if (this.balls.length === 0 || this.balls.every((b) => b.stuckToPaddle)) {
      this.syncStuckBallsToPaddle();
    } else {
      this.paddleX = Math.max(
        this.wallLeft + this.paddleW / 2 + 4,
        Math.min(this.wallRight - this.paddleW / 2 - 4, this.paddleX),
      );
    }
    this.syncBrickGeometry();
  }

  /** Repositions bricks after resize or HUD height change (order matches loadLevel). */
  private syncBrickGeometry(): void {
    if (this.bricks.length === 0) return;
    const def = LEVELS[this.levelIndex];
    const cols = Math.max(...def.grid.map((r) => r.length));
    const brickH = Math.min(28, Math.max(18, this.h * 0.035));
    const gap = 4;
    const totalW = this.wallRight - this.wallLeft - gap * (cols - 1);
    const brickW = totalW / cols;
    let y = this.wallTop;
    let idx = 0;
    for (let row = 0; row < def.grid.length; row++) {
      const line = def.grid[row].padEnd(cols, ".");
      for (let col = 0; col < cols; col++) {
        const ch = line[col];
        if (ch !== "#" && ch !== "X") continue;
        const b = this.bricks[idx];
        if (!b) return;
        b.x = this.wallLeft + col * (brickW + gap);
        b.y = y;
        b.w = brickW;
        b.h = brickH;
        idx += 1;
      }
      y += brickH + gap;
    }
  }

  loadLevel(idx: number): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const def = LEVELS[this.levelIndex];
    this.bricks = [];
    const cols = Math.max(...def.grid.map((r) => r.length));
    const brickH = Math.min(28, Math.max(18, this.h * 0.035));
    const gap = 4;
    const totalW = this.wallRight - this.wallLeft - gap * (cols - 1);
    const brickW = totalW / cols;
    const rowCount = def.grid.length;
    let y = this.wallTop;
    for (let row = 0; row < def.grid.length; row++) {
      const line = def.grid[row].padEnd(cols, ".");
      const tier = tierForRow(row, rowCount);
      const maxHp = BRICK_TIER_MAX_HP[tier];
      for (let col = 0; col < cols; col++) {
        const ch = line[col];
        if (ch !== "#" && ch !== "X") continue;
        const x = this.wallLeft + col * (brickW + gap);
        const hue = BRICK_HUES[(col + row) % BRICK_HUES.length];
        this.bricks.push({
          x,
          y,
          w: brickW,
          h: brickH,
          alive: true,
          hue,
          tier,
          hp: maxHp,
          maxHp,
        });
      }
      y += brickH + gap;
    }
    this.capsules = [];
    this.spawnInitialBall();
    this.setPhase("ready");
    console.log("[BreakoutGame]", "level", def.name, "bricks", this.bricks.filter((b) => b.alive).length);
  }

  startPlayOrLaunch(): void {
    if (this.phase === "game_over" || this.phase === "game_won") return;
    if (this.phase === "level_complete") return;
    if (this.phase === "ready") {
      this.setPhase("playing");
    }
    for (const b of this.balls) {
      if (b.stuckToPaddle) {
        b.stuckToPaddle = false;
        const angle = (-Math.PI / 2 + (Math.random() - 0.5) * 0.5) as number;
        const sp = this.currentBallSpeed();
        b.vx = Math.cos(angle) * sp;
        b.vy = Math.sin(angle) * sp;
      }
    }
  }

  private currentBallSpeed(): number {
    const m = performance.now() < this.fastBallUntil ? FAST_MULTIPLIER : 1;
    return BASE_BALL_SPEED * m;
  }

  private spawnInitialBall(): void {
    const r = Math.max(5, Math.min(9, this.w * 0.012));
    this.balls = [
      {
        x: this.paddleX,
        y: this.paddleY - this.paddleH / 2 - r - 2,
        vx: 0,
        vy: 0,
        r,
        stuckToPaddle: true,
      },
    ];
    this.syncStuckBallsToPaddle();
  }

  private syncStuckBallsToPaddle(): void {
    for (const b of this.balls) {
      if (!b.stuckToPaddle) continue;
      b.x = this.paddleX;
      b.y = this.paddleY - this.paddleH / 2 - b.r - 2;
      b.vx = 0;
      b.vy = 0;
    }
  }

  setPaddleTargetX(screenX: number): void {
    const half = this.paddleW / 2;
    this.paddleX = Math.max(
      this.wallLeft + half + 2,
      Math.min(this.wallRight - half - 2, screenX),
    );
    if (this.phase === "ready" || this.balls.some((b) => b.stuckToPaddle)) {
      this.syncStuckBallsToPaddle();
    }
  }

  nudgePaddle(dir: -1 | 1, dt: number): void {
    this.setPaddleTargetX(this.paddleX + dir * PADDLE_SPEED * dt);
  }

  private brickCountAlive(): number {
    let n = 0;
    for (const b of this.bricks) {
      if (b.alive) n++;
    }
    return n;
  }

  private maybeSpawnCapsule(cx: number, cy: number): void {
    if (Math.random() > CAPSULE_DROP_CHANCE) return;
    const kind: CapsuleKind = Math.random() < 0.5 ? "multiball" : "fastball";
    this.capsules.push({
      x: cx,
      y: cy,
      vy: 120,
      kind,
      r: Math.max(6, this.w * 0.014),
    });
  }

  private damageBrick(brick: Brick): void {
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
    this.score += scoreForDestroyedBrick(brick.tier);
    this.sfx(() => ProtoAudio.brickBreak());
    this.onHaptic?.("medium");
    this.onJuice?.({ type: "brick_break", x: cx, y: cy, hue: brick.hue, tier: brick.tier });
    this.maybeSpawnCapsule(cx, cy);
  }

  private reflectPaddle(ball: Ball): void {
    const half = this.paddleW / 2;
    const px = this.paddleX;
    const py = this.paddleY;
    const t = (ball.x - (px - half)) / this.paddleW;
    const clampedT = Math.max(0, Math.min(1, t));
    const angle = Math.PI * (0.15 + clampedT * 0.7);
    const sp = this.currentBallSpeed();
    ball.vx = Math.cos(angle) * sp;
    ball.vy = -Math.abs(Math.sin(angle) * sp);
    const n = normSpeed(ball.vx, ball.vy, sp);
    ball.vx = n.vx;
    ball.vy = n.vy;
    ball.y = py - this.paddleH / 2 - ball.r - 0.5;
    this.sfx(() => ProtoAudio.paddleHit());
    this.onHaptic?.("light");
    this.onJuice?.({ type: "paddle_hit", x: ball.x, y: ball.y });
  }

  private circleRectResolve(
    ball: Ball,
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

  update(dt: number): void {
    if (this.phase !== "playing") return;

    const now = performance.now();
    const fastActive = now < this.fastBallUntil;
    if (fastActive) {
      for (const b of this.balls) {
        if (b.stuckToPaddle) continue;
        const n = normSpeed(b.vx, b.vy, this.currentBallSpeed());
        b.vx = n.vx;
        b.vy = n.vy;
      }
    } else if (this.wasFastBall) {
      const sp = BASE_BALL_SPEED;
      for (const b of this.balls) {
        if (b.stuckToPaddle) continue;
        const n = normSpeed(b.vx, b.vy, sp);
        b.vx = n.vx;
        b.vy = n.vy;
      }
    }
    this.wasFastBall = fastActive;

    for (const c of this.capsules) {
      c.y += c.vy * dt;
    }

    const halfW = this.paddleW / 2;
    const paddleTop = this.paddleY - this.paddleH / 2;
    const paddleBot = this.paddleY + this.paddleH / 2;
    this.capsules = this.capsules.filter((cap) => {
      if (cap.y > this.h + cap.r + 20) return false;
      if (
        cap.y + cap.r >= paddleTop &&
        cap.y - cap.r <= paddleBot &&
        cap.x >= this.paddleX - halfW - cap.r &&
        cap.x <= this.paddleX + halfW + cap.r
      ) {
        this.onJuice?.({ type: "powerup", x: cap.x, y: cap.y, kind: cap.kind });
        this.applyCapsule(cap.kind);
        this.sfx(() => ProtoAudio.powerCollect());
        this.onHaptic?.("light");
        return false;
      }
      return true;
    });

    for (const ball of this.balls) {
      if (ball.stuckToPaddle) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

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
      if (ball.y - ball.r < this.wallTop) {
        ball.y = this.wallTop + ball.r;
        ball.vy = Math.abs(ball.vy);
        this.sfx(() => ProtoAudio.wallBounce());
        this.onJuice?.({ type: "wall_hit", x: ball.x, y: ball.y });
      }

      const padHit = this.circleRectResolve(
        ball,
        this.paddleX - this.paddleW / 2,
        this.paddleY - this.paddleH / 2,
        this.paddleW,
        this.paddleH,
      );
      if (padHit.hit && ball.vy > 0) {
        this.reflectPaddle(ball);
      }

      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const hit = this.circleRectResolve(ball, brick.x, brick.y, brick.w, brick.h);
        if (!hit.hit) continue;
        this.damageBrick(brick);
        if (Math.abs(hit.nx) > Math.abs(hit.ny)) {
          ball.vx *= -1;
        } else {
          ball.vy *= -1;
        }
        const sp = this.currentBallSpeed();
        const n = normSpeed(ball.vx, ball.vy, sp);
        ball.vx = n.vx;
        ball.vy = n.vy;
        break;
      }

      if (ball.y - ball.r > this.paddleY + this.paddleH + DEATH_MARGIN) {
        ball.y = this.h + 1000;
      }
    }

    this.balls = this.balls.filter((b) => b.y < this.h + 200);

    if (this.brickCountAlive() === 0) {
      this.onJuice?.({ type: "level_clear" });
      this.setPhase("level_complete");
      this.sfx(() => ProtoAudio.levelClear());
      return;
    }

    if (this.balls.length === 0) {
      this.lives -= 1;
      this.onJuice?.({ type: "lose_life" });
      this.sfx(() => ProtoAudio.loseLife());
      if (this.lives <= 0) {
        this.setPhase("game_over");
        return;
      }
      this.spawnInitialBall();
      this.setPhase("ready");
    }
  }

  private applyCapsule(kind: CapsuleKind): void {
    if (kind === "multiball") {
      const moving = this.balls.filter((b) => !b.stuckToPaddle);
      if (moving.length === 0) {
        const stuck = this.balls.find((b) => b.stuckToPaddle);
        if (stuck) {
          stuck.stuckToPaddle = false;
          const angle = (-Math.PI / 2 + (Math.random() - 0.5) * 0.4) as number;
          const sp = this.currentBallSpeed();
          stuck.vx = Math.cos(angle) * sp;
          stuck.vy = Math.sin(angle) * sp;
        }
        return;
      }
      const src = moving[0];
      const sp = this.currentBallSpeed();
      const angles = [-0.35, 0, 0.35];
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
          stuckToPaddle: false,
        });
      }
      this.onJuice?.({ type: "multiball_burst", x: src.x, y: src.y });
      console.log("[BreakoutGame]", "multiball");
    } else {
      this.fastBallUntil = Math.max(this.fastBallUntil, performance.now()) + FAST_DURATION_MS;
      this.onJuice?.({ type: "fastball_pulse" });
      console.log("[BreakoutGame]", "fastball until", this.fastBallUntil);
    }
  }

  advanceLevel(): void {
    if (this.levelIndex >= LEVELS.length - 1) {
      this.setPhase("game_won");
      this.sfx(() => ProtoAudio.gameWin());
      return;
    }
    this.loadLevel(this.levelIndex + 1);
  }

  restartFullGame(): void {
    this.lives = 3;
    this.score = 0;
    this.fastBallUntil = 0;
    this.loadLevel(0);
  }

  draw(ctx: CanvasRenderingContext2D, intro?: DrawIntroOpts): void {
    const flashFast = performance.now() < this.fastBallUntil;
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

      const img = this.brickAtlas?.[brick.hue]?.[brick.tier];
      const alpha = (0.48 + 0.52 * (brick.hp / brick.maxHp)) * appear;
      const cx = brick.x + brick.w / 2;
      const cy = brick.y + brick.h / 2;
      const sc = 0.18 + 0.82 * appear;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        ctx.drawImage(img, brick.x, brick.y, brick.w, brick.h);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = "#5eead4";
        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 2;
        pathRoundRect(ctx, brick.x, brick.y, brick.w, brick.h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    const ph = this.paddleH;
    const px = this.paddleX - this.paddleW / 2;
    const py = this.paddleY - ph / 2;
    let pAppear = 1;
    if (tIntro !== null) {
      pAppear = clamp01Intro((tIntro - 0.5) / 0.36);
      pAppear = easeOutBackIntro(pAppear);
    }
    if (pAppear > 0.008) {
      const pcx = this.paddleX;
      const pcy = this.paddleY;
      const psc = 0.2 + 0.8 * pAppear;
      const pImg = this.paddleImage;
      ctx.save();
      ctx.globalAlpha = pAppear;
      ctx.translate(pcx, pcy);
      ctx.scale(psc, psc);
      ctx.translate(-pcx, -pcy);
      if (pImg && pImg.complete && pImg.naturalWidth > 0) {
        ctx.drawImage(pImg, px, py, this.paddleW, ph);
      } else {
        ctx.fillStyle = "#38bdf8";
        ctx.strokeStyle = "#0369a1";
        ctx.lineWidth = 3;
        pathRoundRect(ctx, px, py, this.paddleW, ph, 6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const cap of this.capsules) {
      ctx.save();
      if (cap.kind === "multiball") {
        ctx.fillStyle = "#4ade80";
        ctx.strokeStyle = "#166534";
      } else {
        ctx.fillStyle = "#f87171";
        ctx.strokeStyle = "#991b1b";
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
      ballAppear = clamp01Intro((tIntro - 0.72) / 0.28);
      ballAppear = easeOutBackIntro(ballAppear);
    }

    const ballImg = this.ballImage;
    const useSprite = !!(ballImg && ballImg.complete && ballImg.naturalWidth > 0);
    for (const ball of this.balls) {
      if (ballAppear <= 0.006) continue;
      ctx.save();
      ctx.globalAlpha = ballAppear;
      const br = ball.r * (0.25 + 0.75 * ballAppear);
      const d = br * 2;
      const left = ball.x - br;
      const top = ball.y - br;
      if (useSprite) {
        if (flashFast) {
          ctx.shadowColor = "#facc15";
          ctx.shadowBlur = this.reduceMotion ? 0 : 14;
        }
        ctx.drawImage(ballImg, left, top, d, d);
      } else {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, br, 0, Math.PI * 2);
        if (flashFast) {
          ctx.fillStyle = "#fef08a";
          ctx.shadowColor = "#facc15";
          ctx.shadowBlur = this.reduceMotion ? 0 : 12;
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 2;
        }
        ctx.fill();
        if (!flashFast) {
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  maxLevels(): number {
    return LEVELS.length;
  }

  levelDisplayName(): string {
    return LEVELS[this.levelIndex]?.name ?? "?";
  }
}
