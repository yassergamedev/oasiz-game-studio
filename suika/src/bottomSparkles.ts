/**
 * Soft rising sparkles along the bottom of the canvas (spawn-time random only).
 */

export interface BottomSparklesLayout {
  w: number;
  h: number;
}

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  twinkle0: number;
  warm: number;
}

const POOL = 48;

function spawn(s: Sparkle, w: number, h: number, bandTop: number): void {
  s.x = Math.random() * w;
  s.y = bandTop + Math.random() * (h - bandTop);
  s.vx = (Math.random() - 0.5) * 14;
  s.vy = -10 - Math.random() * 28;
  s.maxLife = 1.1 + Math.random() * 1.9;
  s.life = s.maxLife;
  s.size = 1.8 + Math.random() * 4.2;
  s.twinkle0 = Math.random() * Math.PI * 2;
  s.warm = Math.random();
  s.active = true;
}

export class BottomSparkles {
  private readonly list: Sparkle[] = [];
  private t = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.list.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        twinkle0: 0,
        warm: 0,
      });
    }
  }

  update(dt: number, layout: BottomSparklesLayout, enabled: boolean): void {
    const { w, h } = layout;
    if (!enabled || w < 40 || h < 40) {
      for (const s of this.list) s.active = false;
      return;
    }

    this.t += dt;
    const bandTop = h * (1 - 0.22);

    let activeN = 0;
    for (const s of this.list) {
      if (s.active) activeN++;
    }
    const want = Math.min(34, 14 + Math.floor(w / 38));
    for (let a = 0; a < 3 && activeN < want; a++) {
      const i = (Math.random() * POOL) | 0;
      const s = this.list[i];
      if (!s.active) {
        spawn(s, w, h, bandTop);
        activeN++;
      }
    }

    for (const s of this.list) {
      if (!s.active) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - 0.35 * dt;
      if (s.life <= 0 || s.y < bandTop - 50 || s.x < -24 || s.x > w + 24) {
        s.active = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, layout: BottomSparklesLayout, enabled: boolean): void {
    if (!enabled) return;
    const { w, h } = layout;
    const bandTop = h * (1 - 0.24);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop - 30, w, h - bandTop + 40);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.list) {
      if (!s.active) continue;
      const u = s.life / s.maxLife;
      const fade = u * u;
      const tw = 0.55 + 0.45 * Math.sin(s.twinkle0 + this.t * 5.2);
      const alpha = fade * tw * 0.42;
      if (alpha < 0.02) continue;
      const r = s.size * (0.85 + 0.25 * tw);
      const cx = s.x;
      const cy = s.y;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      const warm = s.warm;
      const cr = Math.floor(200 + warm * 55);
      const cg = Math.floor(230 - warm * 40);
      const cb = Math.floor(255);
      g.addColorStop(0, "rgba(" + cr + "," + cg + "," + cb + "," + alpha + ")");
      g.addColorStop(0.45, "rgba(255,255,255," + (alpha * 0.35) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
