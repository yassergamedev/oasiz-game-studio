import { type Vec2, vec2Sub, vec2Len, vec2Normalize, vec2Scale, vec2Dot, vec2Add } from "./constants.ts";

export interface CircleBody {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  mass: number;
}

export interface RectBody {
  pos: Vec2;
  vel: Vec2;
  width: number;
  height: number;
  angle: number;
  mass: number;
}

export interface CollisionResult {
  hit: boolean;
  normal: Vec2;
  depth: number;
}

export function circleVsCircle(a: CircleBody, b: CircleBody): CollisionResult {
  const diff = vec2Sub(b.pos, a.pos);
  const dist = vec2Len(diff);
  const minDist = a.radius + b.radius;

  if (dist >= minDist || dist < 0.001) {
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  const normal = vec2Normalize(diff);
  return { hit: true, normal, depth: minDist - dist };
}

export function circleVsRect(circle: CircleBody, rect: RectBody): CollisionResult {
  const cos = Math.cos(-rect.angle);
  const sin = Math.sin(-rect.angle);

  const dx = circle.pos.x - rect.pos.x;
  const dy = circle.pos.y - rect.pos.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = rect.width / 2;
  const hh = rect.height / 2;

  const closestX = Math.max(-hw, Math.min(hw, localX));
  const closestY = Math.max(-hh, Math.min(hh, localY));

  const diffX = localX - closestX;
  const diffY = localY - closestY;
  const distSq = diffX * diffX + diffY * diffY;

  if (distSq >= circle.radius * circle.radius) {
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  const dist = Math.sqrt(distSq);
  let normalLocalX: number, normalLocalY: number;

  if (dist < 0.001) {
    const overlapX = hw - Math.abs(localX);
    const overlapY = hh - Math.abs(localY);
    if (overlapX < overlapY) {
      normalLocalX = localX > 0 ? 1 : -1;
      normalLocalY = 0;
    } else {
      normalLocalX = 0;
      normalLocalY = localY > 0 ? 1 : -1;
    }
  } else {
    normalLocalX = diffX / dist;
    normalLocalY = diffY / dist;
  }

  const cosR = Math.cos(rect.angle);
  const sinR = Math.sin(rect.angle);
  const worldNX = normalLocalX * cosR - normalLocalY * sinR;
  const worldNY = normalLocalX * sinR + normalLocalY * cosR;

  return {
    hit: true,
    normal: { x: worldNX, y: worldNY },
    depth: circle.radius - dist,
  };
}

export function circleVsTriangle(circle: CircleBody, triPos: Vec2, triWidth: number, triHeight: number, triAngle: number): CollisionResult {
  const cos = Math.cos(-triAngle);
  const sin = Math.sin(-triAngle);
  const dx = circle.pos.x - triPos.x;
  const dy = circle.pos.y - triPos.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = triWidth / 2;
  const hh = triHeight / 2;
  const verts = [
    { x: 0, y: -hh },
    { x: -hw, y: hh },
    { x: hw, y: hh },
  ];

  let closestDist = Infinity;
  let closestPoint = { x: 0, y: 0 };

  for (let i = 0; i < 3; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % 3];
    const cp = closestPointOnSegment({ x: localX, y: localY }, a, b);
    const d = vec2Len(vec2Sub({ x: localX, y: localY }, cp));
    if (d < closestDist) {
      closestDist = d;
      closestPoint = cp;
    }
  }

  if (closestDist >= circle.radius) {
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  let normalLocal: Vec2;
  if (closestDist < 0.001) {
    normalLocal = { x: 0, y: -1 };
  } else {
    normalLocal = vec2Normalize(vec2Sub({ x: localX, y: localY }, closestPoint));
  }

  const cosR = Math.cos(triAngle);
  const sinR = Math.sin(triAngle);

  return {
    hit: true,
    normal: {
      x: normalLocal.x * cosR - normalLocal.y * sinR,
      y: normalLocal.x * sinR + normalLocal.y * cosR,
    },
    depth: circle.radius - closestDist,
  };
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = vec2Sub(b, a);
  const ap = vec2Sub(p, a);
  let t = vec2Dot(ap, ab) / (vec2Dot(ab, ab) || 1);
  t = Math.max(0, Math.min(1, t));
  return vec2Add(a, vec2Scale(ab, t));
}

export function resolveShieldObstacleCollision(
  shieldPos: Vec2,
  shieldVel: Vec2,
  shieldRadius: number,
  obstaclePos: Vec2,
  obstacleVel: Vec2,
  normal: Vec2,
  depth: number,
  pushForce: number,
): Vec2 {
  const separationPadding = 8;
  const totalSep = depth + separationPadding;

  obstaclePos.x += normal.x * (totalSep * 0.8);
  obstaclePos.y += normal.y * (totalSep * 0.8);

  shieldPos.x -= normal.x * (totalSep * 0.2);
  shieldPos.y -= normal.y * (totalSep * 0.2);

  const relVel = vec2Sub(shieldVel, obstacleVel);
  const velAlongNormal = vec2Dot(relVel, normal);

  const minPush = pushForce * 0.8;
  const impulse = Math.max(velAlongNormal * 1.8, minPush);

  const newVel = vec2Add(obstacleVel, vec2Scale(normal, impulse));

  const minOutwardSpeed = 200;
  const currentAlongNormal = vec2Dot(newVel, normal);
  if (currentAlongNormal < minOutwardSpeed) {
    const boost = minOutwardSpeed - currentAlongNormal;
    return vec2Add(newVel, vec2Scale(normal, boost));
  }

  return newVel;
}

export function pointInCircle(point: Vec2, center: Vec2, radius: number): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return dx * dx + dy * dy <= radius * radius;
}
