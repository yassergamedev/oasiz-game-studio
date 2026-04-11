/**
 * Distant planet that drifts across the gameplay background occasionally.
 * Spawn timing uses deterministic functions of time (no Math.random in draw).
 */

export interface BgPlanetPassState {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
  ringAngle: number;
  hasRing: boolean;
}

let planet: BgPlanetPassState | null = null;
/** Next time we may attempt a spawn (ms). */
let nextEligibleMs = 0;

export function resetBgPlanetPass(nowMs: number): void {
  planet = null;
  nextEligibleMs = nowMs + 14000;
}

function spawnPlanet(nowMs: number, w: number, h: number): void {
  const r = Math.min(w, h) * (0.12 + (Math.sin(nowMs * 0.000071) * 0.5 + 0.5) * 0.11);
  const yFrac = 0.14 + (Math.cos(nowMs * 0.000083 + w * 0.0004) * 0.5 + 0.5) * 0.38;
  const y = h * yFrac;
  const hue = (nowMs * 0.031 + w * 0.19 + h * 0.07) % 360;
  const vx = 19 + (Math.sin(nowMs * 0.000095) * 0.5 + 0.5) * 16;
  const vy = (Math.cos(nowMs * 0.000088) * 0.5 + 0.5 - 0.5) * 9;
  planet = {
    x: -r * 1.55,
    y,
    r,
    vx,
    vy,
    hue,
    ringAngle: (Math.sin(nowMs * 0.00016) * 0.5 + 0.5) * 0.55,
    hasRing: Math.floor(nowMs / 4000 + w * 0.01) % 5 !== 0,
  };
}

export function tickBgPlanetPass(
  dt: number,
  nowMs: number,
  w: number,
  h: number,
  reduceMotion: boolean,
): void {
  if (reduceMotion || w < 80 || h < 80) {
    planet = null;
    return;
  }

  if (planet) {
    const p = planet;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const margin = p.r * 2;
    if (p.x > w + margin || p.y < -margin || p.y > h + margin) {
      planet = null;
      nextEligibleMs = nowMs + 24000 + ((nowMs * 11) % 32000);
    }
    return;
  }

  if (nowMs < nextEligibleMs) return;

  const roll = 0.5 + 0.5 * Math.sin(nowMs * 0.000103 + w * 0.0031 + h * 0.0027);
  if (roll > 0.82) {
    spawnPlanet(nowMs, w, h);
    nextEligibleMs = nowMs + 800;
  } else {
    nextEligibleMs = nowMs + 5200 + ((nowMs >> 5) % 4800);
  }
}

export function drawBgPlanetPass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const p = planet;
  if (!p) return;

  const light = "hsl(" + String((p.hue + 38) % 360) + ",58%,68%)";
  const mid = "hsl(" + String(p.hue) + ",52%,42%)";
  const dark = "hsl(" + String((p.hue + 210) % 360) + ",48%,12%)";

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.14;
  const halo = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r * 2.1);
  halo.addColorStop(0, "rgba(186, 230, 253, 0.35)");
  halo.addColorStop(0.45, "rgba(56, 189, 248, 0.08)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.globalCompositeOperation = "source-over";
  const body = ctx.createRadialGradient(
    p.x - p.r * 0.38,
    p.y - p.r * 0.28,
    Math.max(2, p.r * 0.06),
    p.x,
    p.y,
    p.r,
  );
  body.addColorStop(0, light);
  body.addColorStop(0.42, mid);
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
  ctx.lineWidth = Math.max(1, p.r * 0.04);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 0.98, 0, Math.PI * 2);
  ctx.stroke();

  if (p.hasRing) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ringAngle);
    ctx.scale(1, 0.32);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
    ctx.lineWidth = Math.max(1.2, p.r * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 1.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = Math.max(0.8, p.r * 0.035);
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 1.32, 0.5, Math.PI * 1.2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
