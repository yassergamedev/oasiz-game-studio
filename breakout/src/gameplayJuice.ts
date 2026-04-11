import type { BrickHue, BrickSizeTier } from "./brickAssets";

export type GameplayJuiceEvent =
  | { type: "brick_chip"; x: number; y: number; hue: BrickHue }
  | { type: "brick_break"; x: number; y: number; hue: BrickHue; tier: BrickSizeTier }
  | { type: "paddle_hit"; x: number; y: number; player?: 1 | 2 }
  | { type: "wall_hit"; x: number; y: number }
  | { type: "powerup"; x: number; y: number; kind: "multiball" | "fastball" }
  | { type: "powerup_collect"; x: number; y: number; kind: string }
  | { type: "multiball_burst"; x: number; y: number }
  | { type: "fastball_pulse" }
  | { type: "slow_ball_pulse" }
  | { type: "paddle_resize"; player: 1 | 2; big: boolean }
  | { type: "super_reverse" }
  | { type: "super_convert"; player: 1 | 2 }
  | { type: "versus_win"; player: 1 | 2 }
  /** Ball crossed past one paddle; this player receives possession on their paddle. */
  | { type: "possession_recover"; player: 1 | 2 }
  | { type: "lose_life" }
  | { type: "level_clear" };

const HUE_RGB: Record<BrickHue, [number, number, number]> = {
  blue: [56, 189, 248],
  green: [52, 211, 153],
  orange: [251, 146, 60],
  violet: [167, 139, 250],
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  life: number;
  maxLife: number;
  r0: number;
  r1: number;
  cr: number;
  cg: number;
  cb: number;
  drag: number;
}

interface ShockRing {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  cr: number;
  cg: number;
  cb: number;
  w: number;
}

interface AmbientMote {
  nx: number;
  yPx: number;
  vy: number;
  phase: number;
  drift: number;
  baseR: number;
}

interface Star {
  xNx: number;
  yPx: number;
  vy: number;
  phase: number;
  twinkle: number;
  baseR: number;
  cr: number;
  cg: number;
  cb: number;
  wobbleHz: number;
  streakLen: number;
}

function pathRoundRectJuice(
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

const MAX_PARTICLES = 720;
const MAX_RINGS = 48;
const PADDLE_TRAIL_CAP = 36;
/** Trail segments older than this are dropped; draw alpha also fades by age. */
const PADDLE_TRAIL_MAX_AGE_MS = 920;
/** Ignore micro-movement noise but keep dense samples for smooth ribbons. */
const PADDLE_TRAIL_MIN_DIST = 0.38;

interface PaddleTrailSeg {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
}

export class GameplayJuice {
  private reduceMotion: boolean;
  private w = 0;
  private h = 0;
  private particles: Particle[] = [];
  private rings: ShockRing[] = [];
  private ambient: AmbientMote[] = [];
  private shakeAmp = 0;
  private shakePhase = 0;
  private hitFlash = 0;
  private rimPulse = 0;
  private levelCelebrationT = 0;
  private lastWallJuiceMs = 0;
  private stars: Star[] = [];
  private paddleTrails: [PaddleTrailSeg[], PaddleTrailSeg[]] = [[], []];
  /** Short zoom + shake toward the player who just gained the ball (versus miss). */
  private possessionRecoverPlayer: 0 | 1 | 2 = 0;
  private possessionRecoverElapsedMs = 0;
  private static readonly POSSESSION_ZOOM_MS = 430;

  constructor(opts: { reduceMotion: boolean }) {
    this.reduceMotion = opts.reduceMotion;
  }

  setReduceMotion(v: boolean): void {
    this.reduceMotion = v;
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuildAmbient();
    this.rebuildStars();
  }

  private rebuildStars(): void {
    this.stars = [];
    const area = this.w * this.h;
    if (area < 100) return;
    const n = this.reduceMotion
      ? Math.min(40, Math.max(16, Math.floor(area / 42000)))
      : Math.min(200, Math.max(72, Math.floor(area / 8500)));
    const h = Math.max(1, this.h);
    for (let i = 0; i < n; i++) {
      const t = i * 2.718281828 + 0.414;
      const slot = i * 0.793;
      const xNx = (Math.sin(t * 1.31) * 0.5 + 0.5) * 0.96 + 0.02;
      const spreadT = (t * 0.413 + i * 0.211) % 1;
      const yPx = spreadT * (h + 100) - 50;
      const layer = i % 3;
      const vyJitter = 1 + ((i * 11) % 7) * 0.07 + ((i * 3) % 5) * 0.04;
      const vyBase = this.reduceMotion
        ? layer === 0
          ? 18
          : layer === 1
            ? 32
            : 48
        : layer === 0
          ? 42 + (i % 5) * 9
          : layer === 1
            ? 95 + (i % 6) * 14
            : 165 + (i % 8) * 22;
      const vy = vyBase * vyJitter;
      const twinkle = 0.52 + (i % 7) * 0.1;
      const baseR = 0.42 + (i % 5) * 0.32;
      const cr = 198 + Math.floor(57 * Math.sin(slot));
      const cg = 208 + Math.floor(47 * Math.cos(slot * 1.27));
      const cb = 255;
      const wobbleHz = 0.11 + (i % 5) * 0.034;
      const streakRoll = (i * 1.414213562 + t) % 1;
      const streakLen = !this.reduceMotion && streakRoll > 0.82 ? 6 + (i % 6) * 2.2 : 0;
      this.stars.push({
        xNx,
        yPx,
        vy,
        phase: t * 8.17,
        twinkle,
        baseR,
        cr,
        cg,
        cb,
        wobbleHz,
        streakLen,
      });
    }
  }

  private rebuildAmbient(): void {
    if (this.reduceMotion) {
      this.ambient = [];
      return;
    }
    const n = Math.min(56, Math.max(24, Math.floor((this.w * this.h) / 18000)));
    const h = Math.max(1, this.h);
    this.ambient = [];
    for (let i = 0; i < n; i++) {
      const t = i * 1.6180339887;
      const spread = (t * 0.37 + i * 0.19) % 1;
      const yPx = spread * (h + 80) - 40;
      const vy = 10 + (i % 11) * 3.2 + ((i * 5) % 4) * 2;
      this.ambient.push({
        nx: (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.92 + 0.04,
        yPx,
        vy,
        phase: t * 12.7,
        drift: 0.35 + (i % 7) * 0.08,
        baseR: 0.6 + (i % 5) * 0.22,
      });
    }
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.shakeAmp = 0;
    this.hitFlash = 0;
    this.rimPulse = 0;
    this.levelCelebrationT = 0;
    this.paddleTrails[0] = [];
    this.paddleTrails[1] = [];
    this.possessionRecoverPlayer = 0;
    this.possessionRecoverElapsedMs = 0;
  }

  clearPaddleTrail(): void {
    this.paddleTrails[0] = [];
    this.paddleTrails[1] = [];
  }

  recordPaddleSample(px: number, py: number, pw: number, ph: number, slot: 0 | 1 = 0): void {
    if (this.reduceMotion) return;
    const trail = this.paddleTrails[slot];
    const last = trail[trail.length - 1];
    if (last && Math.hypot(last.x - px, last.y - py) < PADDLE_TRAIL_MIN_DIST) return;
    trail.push({ x: px, y: py, w: pw, h: ph, t: performance.now() });
    while (trail.length > PADDLE_TRAIL_CAP) trail.shift();
  }

  /** Light 3-tap blur on trail centers for smoother motion paths (no randomness). */
  private smoothPaddleTrailCenters(trail: PaddleTrailSeg[]): PaddleTrailSeg[] {
    const n = trail.length;
    if (n <= 2) return trail;
    const out: PaddleTrailSeg[] = [];
    out.push(trail[0]);
    for (let i = 1; i < n - 1; i++) {
      const p = trail[i];
      if (!p) continue;
      const prev = trail[i - 1];
      const next = trail[i + 1];
      if (!prev || !next) continue;
      out.push({
        x: (prev.x + 2 * p.x + next.x) * 0.25,
        y: (prev.y + 2 * p.y + next.y) * 0.25,
        w: p.w,
        h: p.h,
        t: p.t,
      });
    }
    const last = trail[n - 1];
    if (last) out.push(last);
    return out;
  }

  private decayPaddleTrails(): void {
    if (this.reduceMotion) return;
    const now = performance.now();
    for (let s = 0; s < 2; s++) {
      const tr = this.paddleTrails[s];
      while (tr.length > 0 && now - tr[0].t > PADDLE_TRAIL_MAX_AGE_MS) {
        tr.shift();
      }
    }
  }

  private pushParticle(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES + 1);
    }
    this.particles.push(p);
  }

  private pushRing(r: ShockRing): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push(r);
  }

  private addShake(amount: number): void {
    if (this.reduceMotion) return;
    this.shakeAmp = Math.min(22, this.shakeAmp + amount);
  }

  handleEvent(ev: GameplayJuiceEvent): void {
    if (this.reduceMotion) {
      if (ev.type === "brick_break") this.addShake(2);
      if (ev.type === "lose_life") this.addShake(4);
      if (ev.type === "versus_win") this.addShake(5);
      if (ev.type === "super_reverse" || ev.type === "super_convert") this.addShake(4);
      if (ev.type === "possession_recover") this.addShake(3.5);
      return;
    }

    switch (ev.type) {
      case "brick_chip":
        this.spawnBrickSparks(ev.x, ev.y, ev.hue, 10, 90, 140);
        this.addShake(1.2);
        this.hitFlash = Math.min(0.45, this.hitFlash + 0.04);
        break;
      case "brick_break": {
        const tierMul = ev.tier === "big" ? 1.35 : ev.tier === "mid" ? 1.1 : 1;
        const n = Math.floor(26 * tierMul);
        this.spawnBrickSparks(ev.x, ev.y, ev.hue, n, 160, 320);
        this.spawnDebris(ev.x, ev.y, ev.hue, Math.floor(14 * tierMul));
        this.pushRing({
          x: ev.x,
          y: ev.y,
          r: 6,
          vr: 220,
          life: 0,
          maxLife: 0.38,
          ...this.rgb(ev.hue),
          w: 2.5,
        });
        this.pushRing({
          x: ev.x,
          y: ev.y,
          r: 4,
          vr: 380,
          life: 0,
          maxLife: 0.22,
          ...this.rgb(ev.hue),
          w: 1.5,
        });
        this.addShake(5 + tierMul * 2);
        this.hitFlash = Math.min(1, this.hitFlash + 0.14);
        this.rimPulse = Math.min(1, this.rimPulse + 0.55);
        break;
      }
      case "paddle_hit":
        this.spawnPaddleSparks(ev.x, ev.y);
        this.addShake(2.2);
        break;
      case "wall_hit": {
        const t = performance.now();
        if (t - this.lastWallJuiceMs >= 48) {
          this.lastWallJuiceMs = t;
          this.spawnWallSparks(ev.x, ev.y);
          this.addShake(1.4);
        }
        break;
      }
      case "powerup":
        this.spawnWallSparks(ev.x, ev.y);
        this.addShake(2.8);
        this.hitFlash = Math.min(1, this.hitFlash + 0.05);
        break;
      case "multiball_burst":
        this.spawnRadial(ev.x, ev.y, 40, 200, 420, 255, 255, 255);
        this.addShake(6);
        this.hitFlash = Math.min(1, this.hitFlash + 0.12);
        break;
      case "fastball_pulse":
        this.rimPulse = Math.min(1, this.rimPulse + 0.4);
        this.addShake(3);
        break;
      case "lose_life":
        this.addShake(12);
        this.hitFlash = Math.min(1, this.hitFlash + 0.22);
        this.spawnRadial(this.w * 0.5, this.h * 0.45, 48, 80, 200, 248, 113, 113);
        break;
      case "level_clear":
        this.levelCelebrationT = 1.15;
        this.addShake(7);
        this.hitFlash = Math.min(1, this.hitFlash + 0.18);
        this.spawnRadial(this.w * 0.5, this.h * 0.28, 72, 120, 280, 250, 204, 21);
        break;
      case "powerup_collect":
        this.spawnRadial(ev.x, ev.y, 28, 80, 220, 255, 255, 255);
        this.addShake(3.5);
        this.hitFlash = Math.min(1, this.hitFlash + 0.08);
        break;
      case "slow_ball_pulse":
        this.rimPulse = Math.min(1, this.rimPulse + 0.35);
        this.addShake(2.5);
        this.hitFlash = Math.min(1, this.hitFlash + 0.06);
        break;
      case "paddle_resize":
        this.addShake(ev.big ? 4 : 3);
        this.hitFlash = Math.min(1, this.hitFlash + 0.07);
        this.spawnRadial(
          this.w * (ev.player === 1 ? 0.5 : 0.5),
          this.h * (ev.player === 1 ? 0.88 : 0.12),
          22,
          60,
          180,
          ev.player === 1 ? 56 : 167,
          ev.player === 1 ? 189 : 139,
          ev.player === 1 ? 248 : 250,
        );
        break;
      case "super_reverse":
        this.addShake(14);
        this.hitFlash = Math.min(1, this.hitFlash + 0.35);
        this.levelCelebrationT = 0.9;
        this.spawnRadial(this.w * 0.5, this.h * 0.5, 90, 100, 340, 232, 121, 249);
        this.spawnRadial(this.w * 0.5, this.h * 0.5, 60, 150, 400, 56, 189, 248);
        break;
      case "super_convert":
        this.addShake(16);
        this.hitFlash = Math.min(1, this.hitFlash + 0.28);
        this.spawnRadial(
          this.w * 0.5,
          this.h * 0.48,
          100,
          120,
          400,
          ev.player === 1 ? 56 : 192,
          ev.player === 1 ? 189 : 132,
          ev.player === 1 ? 248 : 252,
        );
        break;
      case "versus_win":
        this.levelCelebrationT = 1.4;
        this.addShake(11);
        this.hitFlash = Math.min(1, this.hitFlash + 0.2);
        this.spawnRadial(
          this.w * 0.5,
          this.h * (ev.player === 1 ? 0.82 : 0.18),
          80,
          140,
          360,
          250,
          230,
          120,
        );
        break;
      case "possession_recover": {
        this.possessionRecoverPlayer = ev.player;
        this.possessionRecoverElapsedMs = 0;
        this.addShake(9);
        this.hitFlash = Math.min(0.4, this.hitFlash + 0.07);
        const py = this.h * (ev.player === 1 ? 0.79 : 0.21);
        this.spawnRadial(
          this.w * 0.5,
          py,
          26,
          90,
          220,
          ev.player === 1 ? 56 : 192,
          ev.player === 1 ? 189 : 132,
          ev.player === 1 ? 248 : 252,
        );
        break;
      }
      default:
        break;
    }
  }

  private rgb(hue: BrickHue): { cr: number; cg: number; cb: number } {
    const [cr, cg, cb] = HUE_RGB[hue];
    return { cr, cg, cb };
  }

  private spawnBrickSparks(
    x: number,
    y: number,
    hue: BrickHue,
    count: number,
    speedMin: number,
    speedMax: number,
  ): void {
    const { cr, cg, cb } = this.rgb(hue);
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.9;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      this.pushParticle({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ay: 140 + Math.random() * 80,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.42,
        r0: 1.2 + Math.random() * 2.2,
        r1: 0.2,
        cr: cr + Math.floor(Math.random() * 40 - 20),
        cg: cg + Math.floor(Math.random() * 40 - 20),
        cb: cb + Math.floor(Math.random() * 40 - 20),
        drag: 2.4 + Math.random() * 1.2,
      });
    }
  }

  private spawnDebris(x: number, y: number, hue: BrickHue, count: number): void {
    const { cr, cg, cb } = this.rgb(hue);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - 40,
        ay: 420 + Math.random() * 200,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.55,
        r0: 2 + Math.random() * 3,
        r1: 0.8,
        cr,
        cg,
        cb,
        drag: 1.2,
      });
    }
  }

  private spawnPaddleSparks(x: number, y: number): void {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 0.7 + (Math.random() - 0.5) * 0.35;
      const sp = 60 + Math.random() * 140;
      this.pushParticle({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        ay: 180,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.28,
        r0: 1.5 + Math.random() * 2,
        r1: 0.15,
        cr: 120 + Math.floor(Math.random() * 80),
        cg: 200 + Math.floor(Math.random() * 55),
        cb: 255,
        drag: 3.2,
      });
    }
  }

  private spawnWallSparks(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 90;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ay: 0,
        life: 0,
        maxLife: 0.12 + Math.random() * 0.16,
        r0: 1 + Math.random() * 1.6,
        r1: 0.1,
        cr: 180,
        cg: 220,
        cb: 255,
        drag: 5,
      });
    }
  }

  private spawnRadial(
    x: number,
    y: number,
    count: number,
    spMin: number,
    spMax: number,
    cr: number,
    cg: number,
    cb: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.4;
      const sp = spMin + Math.random() * (spMax - spMin);
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ay: 60,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.45,
        r0: 2 + Math.random() * 2.5,
        r1: 0.2,
        cr: Math.min(255, cr + Math.floor(Math.random() * 40)),
        cg: Math.min(255, cg + Math.floor(Math.random() * 40)),
        cb: Math.min(255, cb + Math.floor(Math.random() * 40)),
        drag: 1.8,
      });
    }
  }

  /**
   * Smooth comet trail behind moving balls: aligned to velocity, emitted every frame, no draw-loop RNG.
   * `trailActive` is typically true when the ball is not in a slow debuff.
   */
  tickBallTrails(
    balls: ReadonlyArray<{
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      stuckToPaddle: boolean;
    }>,
    trailActive: boolean,
    nowMs: number,
  ): void {
    if (this.reduceMotion || !trailActive) return;
    let idx = 0;
    for (const b of balls) {
      if (b.stuckToPaddle) continue;
      const len = Math.hypot(b.vx, b.vy);
      if (len < 6) continue;
      const nx = b.vx / len;
      const ny = b.vy / len;
      const px = -ny;
      const py = nx;
      const wob = Math.sin(nowMs * 0.0025 + idx * 2.13) * b.r * 0.18;
      const braid = Math.cos(nowMs * 0.0017 + idx * 1.53) * b.r * 0.07;
      const side = Math.sin(nowMs * 0.0031 + idx * 0.91) * 5.5;

      const pushWisp = (
        back: number,
        rScale: number,
        maxLife: number,
        speedBack: number,
        cr: number,
        cg: number,
      ): void => {
        const bx = b.x - nx * b.r * back + px * wob + py * braid;
        const by = b.y - ny * b.r * back - px * braid + py * wob * 0.35;
        this.pushParticle({
          x: bx,
          y: by,
          vx: -nx * speedBack + px * side * 0.35,
          vy: -ny * speedBack + py * side * 0.35,
          ay: -10,
          life: 0,
          maxLife,
          r0: b.r * rScale,
          r1: 0.05,
          cr,
          cg,
          cb: 255,
          drag: 2.65,
        });
      };

      pushWisp(0.48, 0.44, 0.26 + (idx % 3) * 0.022, 52, 168, 228);
      pushWisp(0.82, 0.28, 0.19 + (idx % 4) * 0.018, 36, 210, 242);
      idx += 1;
    }
  }

  update(dt: number): void {
    const decay = Math.pow(0.08, dt * 6.5);
    this.shakeAmp *= decay;
    if (this.shakeAmp < 0.08) this.shakeAmp = 0;
    this.shakePhase += dt * 48;

    this.hitFlash *= Math.pow(0.02, dt * 9);
    if (this.hitFlash < 0.004) this.hitFlash = 0;

    this.rimPulse *= Math.pow(0.06, dt * 5);
    if (this.rimPulse < 0.02) this.rimPulse = 0;

    if (this.levelCelebrationT > 0) {
      this.levelCelebrationT = Math.max(0, this.levelCelebrationT - dt);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 0.01) {
        const nx = p.vx / sp;
        const ny = p.vy / sp;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx = nx * sp * damp;
        p.vy = ny * sp * damp;
      }
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      r.r += r.vr * dt;
      if (r.life >= r.maxLife) this.rings.splice(i, 1);
    }

    this.decayPaddleTrails();
    this.advanceSpaceField(dt);

    if (this.possessionRecoverPlayer !== 0) {
      this.possessionRecoverElapsedMs += dt * 1000;
      if (this.possessionRecoverElapsedMs >= GameplayJuice.POSSESSION_ZOOM_MS) {
        this.possessionRecoverPlayer = 0;
        this.possessionRecoverElapsedMs = 0;
      }
    }
  }

  /** Stars and ambient drift downward (simulates flying upward); wrap with chaotic respawn. */
  private advanceSpaceField(dt: number): void {
    const h = this.h;
    const w = this.w;
    if (h < 8 || w < 8) return;

    const wrapY = h + 28;
    for (const s of this.stars) {
      s.yPx += s.vy * dt;
      if (s.yPx > wrapY) {
        const u = (s.phase * 1.6180339887 + s.yPx * 0.017) % 1;
        s.xNx = 0.02 + u * 0.96;
        s.yPx = -35 - (s.phase * 3.7) % 55;
        s.phase += 2.718;
      }
    }

    for (const m of this.ambient) {
      m.yPx += m.vy * dt;
      if (m.yPx > wrapY) {
        const u = (m.phase * 0.927 + m.yPx * 0.013) % 1;
        m.nx = 0.04 + u * 0.92;
        m.yPx = -30 - (m.phase * 2.9) % 48;
        m.phase += 1.414;
      }
    }
  }

  getShakeOffset(): { x: number; y: number } {
    if (this.reduceMotion || this.shakeAmp <= 0) return { x: 0, y: 0 };
    const a = this.shakeAmp;
    const p = this.shakePhase;
    const x = Math.sin(p * 1.9) * a * 0.85 + Math.sin(p * 3.1) * a * 0.35;
    const y = Math.cos(p * 1.4) * a * 0.75 + Math.sin(p * 2.7) * a * 0.4;
    return { x, y };
  }

  /**
   * Camera-style zoom toward the receiving paddle after a miss (versus mode).
   * Apply after shake: translate(focus) → scale → translate(-focus).
   */
  getPossessionViewTransform(w: number, h: number): { focusX: number; focusY: number; scale: number } {
    const cx = w * 0.5;
    const cy = h * 0.5;
    if (this.reduceMotion || this.possessionRecoverPlayer === 0 || w < 8 || h < 8) {
      return { focusX: cx, focusY: cy, scale: 1 };
    }
    const T = GameplayJuice.POSSESSION_ZOOM_MS;
    const e = this.possessionRecoverElapsedMs;
    const t = Math.max(0, Math.min(1, e / T));
    const attack = 0.24;
    let zoom = 1;
    if (t < attack) {
      const u = t / attack;
      zoom = 1 + 0.062 * u * u;
    } else {
      const u = (t - attack) / (1 - attack);
      const ease = 1 - Math.pow(1 - u, 2.15);
      zoom = 1.062 - 0.062 * ease;
    }
    const fy = this.possessionRecoverPlayer === 1 ? h * 0.77 : h * 0.23;
    return { focusX: cx, focusY: fy, scale: zoom };
  }

  drawStars(ctx: CanvasRenderingContext2D, nowMs: number): void {
    if (this.stars.length === 0) return;
    const w = this.w;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const wob =
        Math.sin(nowMs * 0.00038 * s.wobbleHz + s.phase) * (4 + s.streakLen * 0.08) +
        Math.sin(nowMs * 0.00021 + s.phase * 1.7) * 2;
      const x = s.xNx * w + wob;
      const y = s.yPx;
      const speed = this.reduceMotion ? 0.00032 : 0.00088;
      const blink = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(nowMs * speed * s.twinkle + s.phase));
      const peak = this.reduceMotion ? 0.38 : 0.58;
      const a = blink * peak;
      const r = s.baseR * (0.62 + 0.38 * blink);
      if (s.streakLen > 0.5) {
        const tail = s.streakLen * (0.85 + 0.15 * blink);
        ctx.strokeStyle =
          "rgba(" + String(s.cr) + "," + String(s.cg) + "," + String(s.cb) + "," + String(a * 0.95) + ")";
        ctx.lineWidth = Math.max(0.9, r * 0.35);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - tail);
        ctx.stroke();
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
        grd.addColorStop(
          0,
          "rgba(" + String(s.cr) + "," + String(s.cg) + "," + String(s.cb) + "," + String(a) + ")",
        );
        grd.addColorStop(1, "rgba(" + String(s.cr) + "," + String(s.cg) + "," + String(s.cb) + ",0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        grd.addColorStop(
          0,
          "rgba(" + String(s.cr) + "," + String(s.cg) + "," + String(s.cb) + "," + String(a) + ")",
        );
        grd.addColorStop(1, "rgba(" + String(s.cr) + "," + String(s.cg) + "," + String(s.cb) + ",0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawPaddleTrail(ctx: CanvasRenderingContext2D): void {
    if (this.reduceMotion) return;
    const now = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const timeFade = (ageMs: number): number =>
      Math.pow(Math.max(0, 1 - ageMs / PADDLE_TRAIL_MAX_AGE_MS), 1.28);

    for (let slot = 0; slot < 2; slot++) {
      const raw = this.paddleTrails[slot];
      if (raw.length < 1) continue;
      const trail = this.smoothPaddleTrailCenters(raw);
      const n = trail.length;

      if (n === 1) {
        const seg = trail[0];
        if (!seg) continue;
        const ageMs = now - seg.t;
        const tf = timeFade(ageMs);
        let alpha = 0.5 * tf;
        if (alpha < 0.02) continue;
        const along = 1;
        const cr = slot === 0 ? Math.floor(36 + along * 95) : Math.floor(120 + along * 75);
        const cg = slot === 0 ? Math.floor(150 + along * 88) : Math.floor(90 + along * 62);
        const cb = 255;
        const x = seg.x - seg.w / 2;
        const y = seg.y - seg.h / 2;
        const rr = Math.min(8, seg.h * 0.45);
        ctx.fillStyle =
          "rgba(" + String(cr) + "," + String(cg) + "," + String(cb) + "," + String(alpha) + ")";
        pathRoundRectJuice(ctx, x, y, seg.w, seg.h, rr);
        ctx.fill();
        continue;
      }

      const denom = Math.max(1, n - 1);
      for (let pass = 0; pass < 2; pass++) {
        const glow = pass === 0;
        for (let i = 0; i < n - 1; i++) {
          const a = trail[i];
          const b = trail[i + 1];
          if (!a || !b) continue;
          const ageA = now - a.t;
          const ageB = now - b.t;
          const tf = (timeFade(ageA) + timeFade(ageB)) * 0.5;
          const along = (i + 0.5) / denom;
          const tailFade = Math.pow(along, 1.05);
          const baseA = glow ? 0.22 : 0.52;
          let alpha = baseA * tf * tailFade;
          if (alpha < 0.012) continue;
          const lw = Math.max(
            5.5,
            glow ? (a.h + b.h) * 0.62 : (a.h + b.h) * 0.46,
          );
          const cr = slot === 0 ? Math.floor(40 + along * 92) : Math.floor(125 + along * 72);
          const cg = slot === 0 ? Math.floor(155 + along * 85) : Math.floor(95 + along * 58);
          const cb = 255;
          ctx.strokeStyle =
            "rgba(" + String(cr) + "," + String(cg) + "," + String(cb) + "," + String(alpha) + ")";
          ctx.lineWidth = lw;
          if (!glow) {
            ctx.shadowColor = slot === 0 ? "rgba(56, 189, 248, 0.35)" : "rgba(167, 139, 250, 0.32)";
            ctx.shadowBlur = 10;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawAmbient(ctx: CanvasRenderingContext2D, nowMs: number): void {
    if (this.reduceMotion || this.ambient.length === 0) return;
    const w = this.w;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of this.ambient) {
      const ox = Math.sin(nowMs * 0.00042 * m.drift + m.phase) * 16;
      const oy = Math.cos(nowMs * 0.00034 * m.drift + m.phase * 1.1) * 10;
      const x = m.nx * w + ox;
      const y = m.yPx + oy;
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs * 0.002 + m.phase));
      const r = m.baseR * (1.2 + 0.8 * pulse);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
      g.addColorStop(0, "rgba(56, 189, 248, " + String(0.08 * pulse) + ")");
      g.addColorStop(0.5, "rgba(99, 102, 241, " + String(0.038 * pulse) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawShockRings(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of this.rings) {
      const t = r.life / r.maxLife;
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.4));
      ctx.strokeStyle =
        "rgba(" +
        String(r.cr) +
        "," +
        String(r.cg) +
        "," +
        String(r.cb) +
        "," +
        String(0.78 * fade) +
        ")";
      ctx.lineWidth = r.w * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawScreenFlashRim(
    ctx: CanvasRenderingContext2D,
    wallLeft: number,
    wallTop: number,
    wallW: number,
    wallH: number,
  ): void {
    if (this.hitFlash > 0.001) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, " + String(this.hitFlash * 0.11) + ")";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    const rim = this.rimPulse;
    if (rim > 0.01) {
      ctx.save();
      ctx.strokeStyle = "rgba(250, 204, 21, " + String(rim * 0.45) + ")";
      ctx.lineWidth = 3 + rim * 4;
      ctx.shadowColor = "rgba(250, 204, 21, 0.55)";
      ctx.shadowBlur = 18 * rim;
      ctx.strokeRect(wallLeft - 2, wallTop - 2, wallW + 4, wallH + 4);
      ctx.restore();
    }

    const celeb = this.levelCelebrationT;
    if (celeb > 0 && !this.reduceMotion) {
      ctx.save();
      const wave = Math.sin(celeb * 22) * 0.5 + 0.5;
      const g = ctx.createLinearGradient(0, 0, this.w, this.h);
      g.addColorStop(0, "rgba(250, 204, 21, " + String(0.06 * wave * celeb) + ")");
      g.addColorStop(0.5, "rgba(56, 189, 248, " + String(0.05 * wave * celeb) + ")");
      g.addColorStop(1, "rgba(167, 139, 250, " + String(0.06 * wave * celeb) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const u = Math.min(1, t);
      const fade = Math.sin(Math.PI * u) * (1 - u * 0.12);
      const rad = p.r0 + (p.r1 - p.r0) * u;
      const a = Math.min(1, fade * 1.05);
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2.85);
      grd.addColorStop(
        0,
        "rgba(" + String(p.cr) + "," + String(p.cg) + "," + String(p.cb) + "," + String(a) + ")",
      );
      grd.addColorStop(1, "rgba(" + String(p.cr) + "," + String(p.cg) + "," + String(p.cb) + ",0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 2.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
