/**
 * Dotted aim line: raycast to the next brick, side wall, or paddle face, one bounce
 * (brick/wall: dominant-axis reflection; paddle: same offset angle as versus paddles), then
 * a second segment toward bricks, paddles, walls, or playfield clip (capped at three points).
 */

export interface TrajectoryBrick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bottom (P1) / top (P2) paddle hit as a horizontal segment at ball-center depth. */
export interface TrajectoryPaddleFace {
  cx: number;
  yFace: number;
  halfW: number;
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
  /** When set, downward rays can hit P1 paddle top face (toward bottom player). */
  paddleBottom?: TrajectoryPaddleFace;
  /** When set, upward rays can hit P2 paddle bottom face (toward top player). */
  paddleTop?: TrajectoryPaddleFace;
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
  | { kind: "brick"; t: number; nx: number; ny: number }
  | { kind: "paddle"; t: number; face: "bottom" | "top" };

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

/** Ball center moving down (uy>0) hits horizontal segment at yLine within paddle width + r. */
function rayPaddleTopFaceFromAbove(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  ballR: number,
  yLine: number,
  cx: number,
  halfW: number,
): number | null {
  if (uy < 1e-6) return null;
  if (oy > yLine - 1e-2) return null;
  const t = (yLine - oy) / uy;
  if (t < 1e-3) return null;
  const x = ox + t * ux;
  const minX = cx - halfW - ballR;
  const maxX = cx + halfW + ballR;
  if (x < minX - 1e-2 || x > maxX + 1e-2) return null;
  return t;
}

/** Ball center moving up (uy<0) hits horizontal segment at yLine within paddle width + r. */
function rayPaddleBottomFaceFromBelow(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  ballR: number,
  yLine: number,
  cx: number,
  halfW: number,
): number | null {
  if (uy > -1e-6) return null;
  if (oy < yLine + 1e-2) return null;
  const t = (yLine - oy) / uy;
  if (t < 1e-3) return null;
  const x = ox + t * ux;
  const minX = cx - halfW - ballR;
  const maxX = cx + halfW + ballR;
  if (x < minX - 1e-2 || x > maxX + 1e-2) return null;
  return t;
}

function collectNextHit(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  input: TrajectoryInput,
  ballR: number,
  includeBricks: boolean,
): HitKind | null {
  let best: HitKind | null = null;

  const tL = rayVerticalWall(ox, oy, ux, uy, input.wallLeft + ballR, input.wallYTop, input.wallYBot);
  if (tL !== null && ux < -1e-6 && tL < hitTime(best) - 1e-4) best = { kind: "wall", t: tL };

  const tR = rayVerticalWall(ox, oy, ux, uy, input.wallRight - ballR, input.wallYTop, input.wallYBot);
  if (tR !== null && ux > 1e-6 && tR < hitTime(best) - 1e-4) best = { kind: "wall", t: tR };

  if (includeBricks) {
    for (const b of input.bricks) {
      const hit = rayExpandedAabbEnter(ox, oy, ux, uy, b.x, b.y, b.w, b.h, ballR);
      if (hit && hit.t < hitTime(best) - 1e-4) {
        best = { kind: "brick", t: hit.t, nx: hit.nx, ny: hit.ny };
      }
    }
  }

  const pb = input.paddleBottom;
  if (pb) {
    const tP = rayPaddleTopFaceFromAbove(ox, oy, ux, uy, ballR, pb.yFace, pb.cx, pb.halfW);
    if (tP !== null && tP < hitTime(best) - 1e-4) {
      best = { kind: "paddle", t: tP, face: "bottom" };
    }
  }
  const pt = input.paddleTop;
  if (pt) {
    const tP2 = rayPaddleBottomFaceFromBelow(ox, oy, ux, uy, ballR, pt.yFace, pt.cx, pt.halfW);
    if (tP2 !== null && tP2 < hitTime(best) - 1e-4) {
      best = { kind: "paddle", t: tP2, face: "top" };
    }
  }
  return best;
}

/** Matches `reflectBottomPaddle` in versus (hit position along paddle width). */
function velocityAfterBottomPaddle(
  impactBallCenterX: number,
  paddleCx: number,
  halfW: number,
  speed: number,
): { vx: number; vy: number } {
  const w = Math.max(1e-6, halfW * 2);
  const t = (impactBallCenterX - (paddleCx - halfW)) / w;
  const clampedT = Math.max(0, Math.min(1, t));
  const angle = Math.PI * (0.15 + clampedT * 0.7);
  let vx = Math.cos(angle) * speed;
  let vy = -Math.abs(Math.sin(angle) * speed);
  return normSpeed(vx, vy, speed);
}

/** Matches `reflectTopPaddle` in versus. */
function velocityAfterTopPaddle(
  impactBallCenterX: number,
  paddleCx: number,
  halfW: number,
  speed: number,
): { vx: number; vy: number } {
  const w = Math.max(1e-6, halfW * 2);
  const t = (impactBallCenterX - (paddleCx - halfW)) / w;
  const clampedT = Math.max(0, Math.min(1, t));
  const angle = Math.PI * (0.15 + clampedT * 0.7);
  let vx = Math.cos(angle) * speed;
  let vy = Math.abs(Math.sin(angle) * speed);
  return normSpeed(vx, vy, speed);
}

function applyBounceAtHit(
  rayOx: number,
  rayOy: number,
  rayUx: number,
  rayUy: number,
  vx: number,
  vy: number,
  hit: HitKind,
  speed: number,
  input: TrajectoryInput,
): { vx: number; vy: number } {
  if (hit.kind === "wall") {
    vx = -vx;
    return normSpeed(vx, vy, speed);
  }
  if (hit.kind === "paddle") {
    const impactX = rayOx + rayUx * hit.t;
    if (hit.face === "bottom") {
      const pb = input.paddleBottom;
      if (!pb) return reflectBrickVelocity(vx, vy, 0, -1, speed);
      return velocityAfterBottomPaddle(impactX, pb.cx, pb.halfW, speed);
    }
    const pt = input.paddleTop;
    if (!pt) return reflectBrickVelocity(vx, vy, 0, 1, speed);
    return velocityAfterTopPaddle(impactX, pt.cx, pt.halfW, speed);
  }
  return reflectBrickVelocity(vx, vy, hit.nx, hit.ny, speed);
}

/**
 * Start, first impact, then one more segment (max three points — paddle / brick / wall / clip).
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

  const best = collectNextHit(ox, oy, ux, uy, input, r, true);
  const tNoHit = rayExitBox(ox, oy, ux, uy, minX, minY, maxX, maxY);
  if (!best) {
    const t = Math.min(tNoHit, 520);
    out.push({ x: ox + ux * t, y: oy + uy * t });
    return out;
  }
  if (best.t > tNoHit + 1e-3) {
    const t = Math.min(tNoHit, 520);
    out.push({ x: ox + ux * t, y: oy + uy * t });
    return out;
  }

  const rayOx = ox;
  const rayOy = oy;
  const rayUx = ux;
  const rayUy = uy;
  ox += ux * best.t;
  oy += uy * best.t;
  out.push({ x: ox, y: oy });

  const nudge = 0.6;
  const bounced = applyBounceAtHit(rayOx, rayOy, rayUx, rayUy, vx, vy, best, speed, input);
  vx = bounced.vx;
  vy = bounced.vy;
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

  const best2 = collectNextHit(ox, oy, ux, uy, input, r, true);
  const tExit2 = Math.min(rayExitBox(ox, oy, ux, uy, minX, minY, maxX, maxY), 720);

  if (!best2 || best2.t > tExit2 + 1e-3) {
    out.push({ x: ox + ux * tExit2, y: oy + uy * tExit2 });
    return out;
  }

  ox += ux * best2.t;
  oy += uy * best2.t;
  out.push({ x: ox, y: oy });
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
