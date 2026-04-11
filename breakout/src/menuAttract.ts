/**
 * Start-screen "messy breakout" attract: ball vs floating bricks, breaks, respawns, ambient dust.
 * No Math.random() inside draw(); phases pre-seeded at spawn.
 */

export interface MenuAttractOptions {
  reduceMotion: boolean;
}

interface FloatBrick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hue: number;
  alive: boolean;
  respawnAt: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
}

interface StarDot {
  bx: number;
  by: number;
  tw: number;
}

const BRICK_COLORS = ["#5eead4", "#a78bfa", "#fb923c", "#7dd3fc", "#f472b6"] as const;
const NUM_BRICKS = 14;
const NUM_STARS = 96;
const NUM_DUST = 48;
const MAX_SPARKS = 64;

function circleRectHit(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

export class MenuAttract {
  w = 0;
  h = 0;
  private reduceMotion: boolean;
  private bricks: FloatBrick[] = [];
  private ballX = 0;
  private ballY = 0;
  private ballVx = 180;
  private ballVy = 140;
  private ballR = 8;
  private sparks: Spark[] = [];
  private dust: DustMote[] = [];
  private stars: StarDot[] = [];
  private ballImg: HTMLImageElement | null = null;
  private bgImg: HTMLImageElement | null = null;
  private t = 0;
  private layoutReady = false;

  constructor(opts: MenuAttractOptions) {
    this.reduceMotion = opts.reduceMotion;
  }

  setBallImage(img: HTMLImageElement | null): void {
    this.ballImg = img;
  }

  setBackgroundImage(img: HTMLImageElement | null): void {
    this.bgImg = img;
  }

  resize(width: number, height: number): void {
    const prevW = this.w;
    const prevH = this.h;
    this.w = width;
    this.h = height;
    this.ballR = Math.max(6, Math.min(11, width * 0.018));
    const speed = Math.max(220, Math.min(380, (Math.min(width, height) / 700) * 320));
    const len = Math.hypot(this.ballVx, this.ballVy) || 1;
    this.ballVx = (this.ballVx / len) * speed;
    this.ballVy = (this.ballVy / len) * speed;

    if (!this.layoutReady || this.bricks.length === 0) {
      this.seedStarsAndDust();
      this.spawnAllBricks(performance.now());
      this.ballX = width * 0.5;
      this.ballY = height * 0.62;
      this.layoutReady = true;
      return;
    }

    const sx = prevW > 1 ? width / prevW : 1;
    const sy = prevH > 1 ? height / prevH : 1;
    this.ballX = Math.min(width - 6 - this.ballR, Math.max(6 + this.ballR, this.ballX * sx));
    this.ballY = Math.min(height - 6 - this.ballR, Math.max(6 + this.ballR, this.ballY * sy));
    for (const b of this.bricks) {
      b.x *= sx;
      b.y *= sy;
      b.x = Math.min(width - b.w - 8, Math.max(8, b.x));
      b.y = Math.min(height - b.h - 8, Math.max(8, b.y));
    }
  }

  private seedStarsAndDust(): void {
    this.stars = [];
    for (let i = 0; i < NUM_STARS; i++) {
      const sx = ((i * 9973) % 1000) / 1000;
      const sy = ((i * 7919) % 1000) / 1000;
      this.stars.push({
        bx: sx,
        by: sy,
        tw: ((i * 17) % 314) / 100,
      });
    }
    this.dust = [];
    for (let i = 0; i < NUM_DUST; i++) {
      this.dust.push({
        x: (((i * 433) % 1000) / 1000) * Math.max(400, this.w || 800),
        y: (((i * 877) % 1000) / 1000) * Math.max(600, this.h || 1200),
        vx: -8 - ((i * 3) % 20),
        vy: ((i % 7) - 3) * 2,
        r: 0.8 + ((i * 13) % 7) * 0.35,
        phase: i * 0.71,
      });
    }
  }

  private spawnAllBricks(now: number): void {
    this.bricks = [];
    const W = Math.max(this.w, 400);
    const H = Math.max(this.h, 600);
    for (let i = 0; i < NUM_BRICKS; i++) {
      const w = 36 + ((i * 17) % 24);
      const h = 16 + ((i * 11) % 10);
      this.bricks.push({
        id: i,
        x: ((i * 137) % 100) / 100 * (W - w - 20) + 10,
        y: ((i * 89) % 100) / 100 * (H * 0.55 - h) + H * 0.08,
        w,
        h,
        vx: (((i * 5) % 11) - 5) * 12,
        vy: (((i * 7) % 9) - 4) * 10,
        hue: i % BRICK_COLORS.length,
        alive: true,
        respawnAt: 0,
      });
    }
  }

  private randomBrickSpot(id: number, now: number): FloatBrick {
    const W = this.w;
    const H = this.h;
    const w = 32 + ((Math.floor(now / 50) + id * 13) % 28);
    const h = 14 + ((id * 7) % 12);
    const t = now * 0.001 + id;
    const x = (Math.sin(t * 1.7 + id) * 0.35 + 0.5) * (W - w - 24) + 12;
    const y = (Math.cos(t * 1.3 + id * 0.4) * 0.25 + 0.38) * (H * 0.65 - h) + H * 0.06;
    return {
      id,
      x,
      y,
      w,
      h,
      vx: Math.sin(t * 2.1) * 45,
      vy: Math.cos(t * 1.9 + id) * 38,
      hue: (Math.floor(now / 80) + id) % BRICK_COLORS.length,
      alive: true,
      respawnAt: 0,
    };
  }

  private emitSparks(x: number, y: number, color: string): void {
    for (let k = 0; k < 10 && this.sparks.length < MAX_SPARKS; k++) {
      const a = (k / 10) * Math.PI * 2 + this.t * 0.01;
      const sp = 60 + (k % 5) * 22;
      const ml = 0.26 + (k % 4) * 0.05;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: ml,
        maxLife: ml,
        color,
      });
    }
    if (this.sparks.length > MAX_SPARKS) {
      this.sparks.splice(0, this.sparks.length - MAX_SPARKS);
    }
  }

  tick(dt: number, now: number): void {
    this.t += dt;
    const W = this.w;
    const H = this.h;
    if (W < 8 || H < 8) return;

    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < -20) d.x = W + 10;
      if (d.x > W + 20) d.x = -10;
      if (d.y < -10) d.y = H + 5;
      if (d.y > H + 10) d.y = -5;
    }

    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    for (const b of this.bricks) {
      if (!b.alive) {
        if (now >= b.respawnAt) {
          Object.assign(b, this.randomBrickSpot(b.id, now));
          b.alive = true;
        }
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 8) {
        b.x = 8;
        b.vx = Math.abs(b.vx);
      } else if (b.x + b.w > W - 8) {
        b.x = W - 8 - b.w;
        b.vx = -Math.abs(b.vx);
      }
      if (b.y < 8) {
        b.y = 8;
        b.vy = Math.abs(b.vy);
      } else if (b.y + b.h > H - 8) {
        b.y = H - 8 - b.h;
        b.vy = -Math.abs(b.vy);
      }
    }

    this.ballX += this.ballVx * dt;
    this.ballY += this.ballVy * dt;
    if (this.ballX - this.ballR < 6) {
      this.ballX = 6 + this.ballR;
      this.ballVx = Math.abs(this.ballVx);
    } else if (this.ballX + this.ballR > W - 6) {
      this.ballX = W - 6 - this.ballR;
      this.ballVx = -Math.abs(this.ballVx);
    }
    if (this.ballY - this.ballR < 6) {
      this.ballY = 6 + this.ballR;
      this.ballVy = Math.abs(this.ballVy);
    } else if (this.ballY + this.ballR > H - 6) {
      this.ballY = H - 6 - this.ballR;
      this.ballVy = -Math.abs(this.ballVy);
    }

    for (const b of this.bricks) {
      if (!b.alive) continue;
      if (!circleRectHit(this.ballX, this.ballY, this.ballR, b.x, b.y, b.w, b.h)) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const nx = this.ballX - cx;
      const ny = this.ballY - cy;
      const nlen = Math.hypot(nx, ny) || 1;
      const nnx = nx / nlen;
      const nny = ny / nlen;
      this.ballX += nnx * 3;
      this.ballY += nny * 3;
      const dot = this.ballVx * nnx + this.ballVy * nny;
      this.ballVx -= 2 * dot * nnx;
      this.ballVy -= 2 * dot * nny;
      b.alive = false;
      b.respawnAt = now + 180 + ((b.hue * 37) % 220);
      this.emitSparks(b.x + b.w / 2, b.y + b.h / 2, BRICK_COLORS[b.hue]);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const W = this.w;
    const H = this.h;
    const img = this.bgImg;
    if (img && img.complete && img.naturalWidth > 0) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a0f1c");
      g.addColorStop(0.5, "#111827");
      g.addColorStop(1, "#060912");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (!this.reduceMotion) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const x = s.bx * W;
        const y = s.by * H;
        const tw = 0.35 + Math.sin(this.t * 1.2 + s.tw) * 0.25;
        ctx.fillStyle = "rgba(226,232,240," + tw.toFixed(3) + ")";
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else {
      ctx.fillStyle = "rgba(226,232,240,0.35)";
      for (let i = 0; i < this.stars.length; i += 3) {
        const s = this.stars[i];
        ctx.fillRect(s.bx * W, s.by * H, 1.2, 1.2);
      }
    }

    ctx.fillStyle = "rgba(56,189,248,0.12)";
    for (const d of this.dust) {
      const a = 0.15 + Math.sin(this.t * 0.8 + d.phase) * 0.08;
      ctx.globalAlpha = Math.max(0.06, Math.min(0.35, a));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const b of this.bricks) {
      if (!b.alive) continue;
      const c = BRICK_COLORS[b.hue];
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "rgba(15,23,42,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      ctx.globalAlpha = 1;
    }

    for (const s of this.sparks) {
      const k = s.life / s.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.2));
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2 + (1 - k) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const bi = this.ballImg;
    const d = this.ballR * 2;
    if (bi && bi.complete && bi.naturalWidth > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(56,189,248,0.85)";
      ctx.shadowBlur = this.reduceMotion ? 6 : 14;
      ctx.drawImage(bi, this.ballX - this.ballR, this.ballY - this.ballR, d, d);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(this.ballX, this.ballY, this.ballR, 0, Math.PI * 2);
      ctx.fillStyle = "#f8fafc";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = this.reduceMotion ? 0 : 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}
