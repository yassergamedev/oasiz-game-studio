/**
 * Simple dotted aim line: first segment to the next brick or side wall,
 * one bounce (same rules as versus for wall / dominant-axis brick), then
 * a short straight segment (capped by playfield clip in main).
 */

export interface TrajectoryBrick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrajectoryInput {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  r: number;
  speed: number;
  wallLeft: number;
  wallRight: number;
  wallYTop: number;
  wallYBot: number;
  /** Playfield Y bounds (same as `playfieldTop` / `playfieldBottom` on the game). */
  clipMinY: number;
  clipMaxY: number;
  bricks: TrajectoryBrick[];
}

function normSpeed(vx: number, vy: number, target: number): { vx: number; vy: number } {
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return { vx: 0, vy: target };
  const s = target / len;
  return { vx: vx * s, vy: vy * s };
}

/** Ray vs axis-aligned box (expanded by ball radius). Entry distance along unit direction. */
function rayExpandedAabbEnter(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  r: number,
): { t: number; nx: number; ny: number } | null {
  const minX = bx - r;
  const minY = by - r;
  const maxX = bx + bw + r;
  const maxY = by + bh + r;

  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(ux) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / ux;
    const t1 = (minX - ox) * inv;
    const t2 = (maxX - ox) * inv;
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tMin = Math.max(tMin, tNear);
    tMax = Math.min(tMax, tFar);
  }

  if (Math.abs(uy) < 1e-12) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / uy;
    const t1 = (minY - oy) * inv;
    const t2 = (maxY - oy) * inv;
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tMin = Math.max(tMin, tNear);
    tMax = Math.min(tMax, tFar);
  }

  if (tMin > tMax) return null;
  let tHit: number;
  if (tMin >= 1e-3) tHit = tMin;
  else if (tMax >= 1e-3) tHit = tMax;
  else return null;
  if (tHit > tMax + 1e-5) return null;

  const hx = ox + ux * tHit;
  const hy = oy + uy * tHit;
  const faceE = Math.max(bw, bh, r) * 1e-4 + 1e-3;
  let nx = 0;
  let ny = 0;
  if (Math.abs(hx - minX) < faceE) {
    nx = -1;
    ny = 0;
  } else if (Math.abs(hx - maxX) < faceE) {
    nx = 1;
    ny = 0;
  } else if (Math.abs(hy - minY) < faceE) {
    nx = 0;
    ny = -1;
  } else if (Math.abs(hy - maxY) < faceE) {
    nx = 0;
    ny = 1;
  } else {
    if (Math.abs(ux) >= Math.abs(uy)) {
      nx = ux > 0 ? -1 : 1;
      ny = 0;
    } else {
      nx = 0;
      ny = uy > 0 ? -1 : 1;
    }
  }
  return { t: tHit, nx, ny };
}

function reflectBrickVelocity(
  vx: number,
  vy: number,
  nx: number,
  ny: number,
  speed: number,
): { vx: number; vy: number } {
  let nxv = vx;
  let nyv = vy;
  if (Math.abs(nx) > Math.abs(ny)) nxv *= -1;
  else nyv *= -1;
  return normSpeed(nxv, nyv, speed);
}

function rayVerticalWall(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  wallX: number,
  y0: number,
  y1: number,
): number | null {
  if (Math.abs(ux) < 1e-12) return null;
  const t = (wallX - ox) / ux;
  if (t < 1e-3) return null;
  const y = oy + t * uy;
  const ymin = Math.min(y0, y1);
  const ymax = Math.max(y0, y1);
  if (y < ymin - 1e-4 || y > ymax + 1e-4) return null;
  return t;
}

type HitKind =
  | { kind: "wall"; t: number }
  | { kind: "brick"; t: number; nx: number; ny: number };

function hitTime(h: HitKind | null): number {
  return h ? h.t : Infinity;
}

/** Positive t where ray (ox,oy)+t*(ux,uy) leaves axis-aligned box [minX,maxX]x[minY,maxY]. */
function rayExitBox(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let tExit = Infinity;
  if (Math.abs(ux) > 1e-12) {
    if (ux > 0) {
      const t = (maxX - ox) / ux;
      if (t > 1e-3) {
        const y = oy + t * uy;
        if (y >= minY - 1e-3 && y <= maxY + 1e-3) tExit = Math.min(tExit, t);
      }
    } else {
      const t = (minX - ox) / ux;
      if (t > 1e-3) {
        const y = oy + t * uy;
        if (y >= minY - 1e-3 && y <= maxY + 1e-3) tExit = Math.min(tExit, t);
      }
    }
  }
  if (Math.abs(uy) > 1e-12) {
    if (uy > 0) {
      const t = (maxY - oy) / uy;
      if (t > 1e-3) {
        const x = ox + t * ux;
        if (x >= minX - 1e-3 && x <= maxX + 1e-3) tExit = Math.min(tExit, t);
      }
    } else {
      const t = (minY - oy) / uy;
      if (t > 1e-3) {
        const x = ox + t * ux;
        if (x >= minX - 1e-3 && x <= maxX + 1e-3) tExit = Math.min(tExit, t);
      }
    }
  }
  return tExit === Infinity ? 400 : tExit;
}

/**
 * Returns 2–3 vertices: start, first impact, optional end after one bounce (inside clip box).
 */
export function computeVersusTrajectoryPolyline(input: TrajectoryInput): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const minX = input.wallLeft;
  const maxX = input.wallRight;
  const minY = input.clipMinY;
  const maxY = input.clipMaxY;

  let ox = input.ox;
  let oy = input.oy;
  let vx = input.vx;
  let vy = input.vy;
  const r = input.r;
  const speed = input.speed;
  const len0 = Math.hypot(vx, vy);
  if (len0 < 1e-4) return out;

  let ux = vx / len0;
  let uy = vy / len0;
  out.push({ x: ox, y: oy });

  let best: HitKind | null = null;

  const tL = rayVerticalWall(ox, oy, ux, uy, input.wallLeft + r, input.wallYTop, input.wallYBot);
  if (tL !== null && ux < -1e-6 && tL < hitTime(best) - 1e-4) best = { kind: "wall", t: tL };

  const tR = rayVerticalWall(ox, oy, ux, uy, input.wallRight - r, input.wallYTop, input.wallYBot);
  if (tR !== null && ux > 1e-6 && tR < hitTime(best) - 1e-4) best = { kind: "wall", t: tR };

  for (const b of input.bricks) {
    const hit = rayExpandedAabbEnter(ox, oy, ux, uy, b.x, b.y, b.w, b.h, r);
    if (hit && hit.t < hitTime(best) - 1e-4) {
      best = { kind: "brick", t: hit.t, nx: hit.nx, ny: hit.ny };
    }
  }

  const tNoHit = rayExitBox(ox, oy, ux, uy, minX, minY, maxX, maxY);
  if (!best) {
    const t = Math.min(tNoHit, 520);
    out.push({ x: ox + ux * t, y: oy + uy * t });
    return out;
  }

  ox += ux * best.t;
  oy += uy * best.t;
  out.push({ x: ox, y: oy });

  const nudge = 0.6;
  if (best.kind === "wall") {
    vx = -vx;
    const nrmW = normSpeed(vx, vy, speed);
    vx = nrmW.vx;
    vy = nrmW.vy;
  } else {
    const refl = reflectBrickVelocity(vx, vy, best.nx, best.ny, speed);
    vx = refl.vx;
    vy = refl.vy;
  }
  const l = Math.hypot(vx, vy);
  if (l > 1e-6) {
    ox += (vx / l) * nudge;
    oy += (vy / l) * nudge;
  }
  const nrm = normSpeed(vx, vy, speed);
  vx = nrm.vx;
  vy = nrm.vy;
  const spd2 = Math.hypot(vx, vy);
  if (spd2 < 1e-6) return out;
  ux = vx / spd2;
  uy = vy / spd2;

  const t2 = Math.min(rayExitBox(ox, oy, ux, uy, minX, minY, maxX, maxY), 720);
  out.push({ x: ox + ux * t2, y: oy + uy * t2 });

  return out;
}

export function drawTrajectoryPolyline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  opts: { stroke: string; lineWidth: number; dash: number[]; dashOffset: number; globalAlpha: number },
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = opts.stroke;
  ctx.lineWidth = opts.lineWidth;
  ctx.setLineDash(opts.dash);
  ctx.lineDashOffset = opts.dashOffset;
  ctx.globalAlpha = opts.globalAlpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}
