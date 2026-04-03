/**
 * Merge VFX: burst particles, floating score, punch-in words (outside cup, diagonal).
 */

import type { MergeWordTier } from "./mergeJuice";

export interface MergeFanfarePayload {
  x: number;
  y: number;
  newTier: number;
  prevTier: number;
  scoreAdd: number;
}

export interface CupBoundsForWords {
  cupX: number;
  cupY: number;
  cupW: number;
  cupH: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  sz: number;
  r: number;
  g: number;
  b: number;
}

interface ScoreFloater {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
}

interface PunchWord {
  text: string;
  fromLeft: boolean;
  anchorX: number;
  anchorY: number;
  angleRad: number;
  punchOff: number;
  t: number;
  duration: number;
  tier: MergeWordTier;
  birth: number;
}

const WORD_CASUAL = ["Nice!", "Sweet!", "Yes!", "Cool!", "Let's go!", "Got it!"];
const WORD_SOLID = ["Great!", "Strong!", "Big one!", "On fire!", "Keep rolling!", "Solid!"];
const WORD_BIG = ["Amazing!", "Huge!", "Fantastic!", "Unstoppable!", "Monster merge!", "Legendary!", "Wow!"];
const WORD_INFERNO = ["INFERNO!", "SCORCHING!", "BLAZING!", "TOO HOT!", "MEGA!", "APOCALYPSE!"];

const MAX_PARTICLES = 96;
const MAX_FLOATERS = 8;
const MAX_WORDS = 4;

function pickWord(tier: MergeWordTier): string {
  if (tier === "inferno") return WORD_INFERNO[(Math.random() * WORD_INFERNO.length) | 0];
  if (tier === "good") {
    const pool = Math.random() < 0.55 ? WORD_SOLID : WORD_BIG;
    return pool[(Math.random() * pool.length) | 0];
  }
  return WORD_CASUAL[(Math.random() * WORD_CASUAL.length) | 0];
}

function anchorOutsideCup(
  fromLeft: boolean,
  cup: CupBoundsForWords,
  viewW: number,
  viewH: number,
): { ax: number; ay: number; angleRad: number } {
  const { cupX, cupY, cupW, cupH } = cup;
  const margin = 18;
  const ay = cupY + cupH * (0.28 + Math.random() * 0.44);
  const clampY = Math.max(96, Math.min(viewH - 100, ay));
  if (fromLeft) {
    const ax = Math.max(44, cupX - margin - 8 - Math.random() * 28);
    return { ax, ay: clampY, angleRad: -0.38 - Math.random() * 0.18 };
  }
  const ax = Math.min(viewW - 44, cupX + cupW + margin + 8 + Math.random() * 28);
  return { ax, ay: clampY, angleRad: 0.38 + Math.random() * 0.18 };
}

export class MergeFanfare {
  private particles: Particle[] = [];
  private floaters: ScoreFloater[] = [];
  private words: PunchWord[] = [];

  spawn(
    payload: MergeFanfarePayload,
    viewW: number,
    viewH: number,
    cup: CupBoundsForWords,
    wordTier: MergeWordTier,
    reducedMotion: boolean,
  ): void {
    const { x, y, newTier, scoreAdd } = payload;

    const jx = (Math.random() - 0.5) * 14;
    const jy = (Math.random() - 0.5) * 10;
    this.floaters.push({
      x: x + jx,
      y: y + jy - 8,
      vy: -42 - Math.random() * 28,
      life: 0,
      maxLife: reducedMotion ? 0.55 : 0.95 + Math.random() * 0.25,
      text: "+" + String(scoreAdd),
    });
    if (this.floaters.length > MAX_FLOATERS) {
      this.floaters.splice(0, this.floaters.length - MAX_FLOATERS);
    }

    if (reducedMotion) return;

    const n = wordTier === "inferno" ? 32 : wordTier === "good" ? 26 : 20;
    const n2 = n + ((Math.random() * 8) | 0);
    for (let i = 0; i < n2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 2.2 + Math.random() * 5.8;
      let r = 255;
      let g = 220;
      let b = 120;
      if (wordTier === "inferno") {
        r = 255;
        g = 80 + ((Math.random() * 80) | 0);
        b = 30 + ((Math.random() * 40) | 0);
      } else {
        const pal = (Math.random() * 3) | 0;
        if (pal === 1) {
          r = 255;
          g = 140;
          b = 100;
        } else if (pal === 2) {
          r = 180;
          g = 230;
          b = 255;
        }
      }
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.2,
        life: 0,
        maxLife: 0.38 + Math.random() * 0.35,
        sz: 2 + Math.random() * 3.2,
        r,
        g,
        b,
      });
    }
    while (this.particles.length > MAX_PARTICLES) {
      this.particles.shift();
    }

    const fromLeft = Math.random() < 0.5;
    const { ax, ay, angleRad } = anchorOutsideCup(fromLeft, cup, viewW, viewH);
    const text = pickWord(wordTier);
    this.words.push({
      text,
      fromLeft,
      anchorX: ax,
      anchorY: ay,
      angleRad,
      punchOff: 34 + Math.random() * 10,
      t: 0,
      duration: 0.38 + Math.random() * 0.06,
      tier: wordTier,
      birth: performance.now(),
    });
    if (this.words.length > MAX_WORDS) {
      this.words.splice(0, this.words.length - MAX_WORDS);
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt * 52;
      p.y += p.vy * dt * 52;
      p.vy += 120 * dt;
      p.vx *= Math.pow(0.988, dt * 60);
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    for (const f of this.floaters) {
      f.life += dt;
      f.y += f.vy * dt;
      f.vy *= 0.92;
    }
    this.floaters = this.floaters.filter((f) => f.life < f.maxLife);

    for (const w of this.words) {
      w.t += dt;
    }
    this.words = this.words.filter((w) => w.t < w.duration + 0.95);
  }

  draw(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, nowMs: number): void {
    ctx.save();

    for (const p of this.particles) {
      const u = p.life / p.maxLife;
      const a = (1 - u) * (1 - u) * 0.85;
      if (a < 0.02) continue;
      ctx.fillStyle = "rgba(" + p.r + "," + p.g + "," + p.b + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz * (0.85 + 0.15 * (1 - u)), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const f of this.floaters) {
      const u = f.life / f.maxLife;
      const a = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / (1 - 0.12);
      const fade = Math.max(0, Math.min(1, a)) * (1 - u * 0.35);
      if (fade < 0.04) continue;
      ctx.font = "800 20px Fredoka, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255, 253, 247, " + (fade * 0.95).toFixed(3) + ")";
      ctx.fillStyle = "rgba(245, 134, 31, " + fade.toFixed(3) + ")";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }

    for (const w of this.words) {
      const punchT = 0.14;
      const punchEase = w.t < punchT ? 1 - Math.pow(1 - w.t / punchT, 2.8) : 1;
      const off = w.punchOff * (1 - punchEase);
      const dir = w.fromLeft ? -1 : 1;
      const x = w.anchorX + dir * off;
      const y = w.anchorY;

      const p = Math.min(1, w.t / w.duration);
      const back = p < 0.72 ? 1 + 0.22 * Math.sin((p / 0.72) * Math.PI) : 1 - 0.06 * Math.sin(((p - 0.72) / 0.28) * Math.PI);
      const pop = 0.35 + 0.65 * punchEase * back;

      let alphaOut = 1;
      if (w.t > w.duration) {
        alphaOut = 1 - (w.t - w.duration) / 0.95;
      }
      if (alphaOut <= 0.02) continue;

      const flick = w.tier === "inferno" ? Math.sin(nowMs * 0.018 + w.birth * 0.003) * 0.5 + 0.5 : 0;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alphaOut));
      ctx.translate(x, y);
      ctx.rotate(w.angleRad);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fs = w.tier === "inferno" ? 24 : 22;
      ctx.font = "800 " + fs + "px Fredoka, system-ui, sans-serif";

      if (w.tier === "inferno") {
        const g = ctx.createLinearGradient(-44, -14, 44, 14);
        g.addColorStop(0, "rgba(255, 255, 200, 1)");
        g.addColorStop(0.35, "rgba(255, 200, 60, 1)");
        g.addColorStop(0.65, "rgba(255, 100, 30, 1)");
        g.addColorStop(1, "rgba(220, 40, 10, 1)");
        ctx.fillStyle = g;
        ctx.fillText(w.text, 0, 0);
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 5;
        ctx.strokeText(w.text, 0, 0);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255, 220, 100, " + (0.35 + flick * 0.45).toFixed(3) + ")";
        ctx.fillText(w.text, 0, 0);
        ctx.fillStyle = "rgba(255, 80, 30, " + (0.2 + flick * 0.28).toFixed(3) + ")";
        ctx.fillText(w.text, 0, 0);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 4;
        ctx.strokeText(w.text, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(w.text, 0, 0);
        if (w.tier === "good") {
          const gl = Math.sin(nowMs * 0.012 + w.birth * 0.002) * 0.5 + 0.5;
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "rgba(255, 230, 150, " + (0.12 + gl * 0.18).toFixed(3) + ")";
          ctx.fillText(w.text, 0, 0);
          ctx.globalCompositeOperation = "source-over";
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
