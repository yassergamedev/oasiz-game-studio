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
      normalLocalX = localX > 0 ? -1 : 1;
      normalLocalY = 0;
    } else {
      normalLocalX = 0;
      normalLocalY = localY > 0 ? -1 : 1;
    }
  } else {
    normalLocalX = -diffX / dist;
    normalLocalY = -diffY / dist;
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
    normalLocal = { x: 0, y: 1 };
  } else {
    normalLocal = vec2Normalize(vec2Sub(closestPoint, { x: localX, y: localY }));
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

export function circleVsPolygon(circle: CircleBody, polyPos: Vec2, verts: Vec2[], polyAngle: number): CollisionResult {
  const cos = Math.cos(-polyAngle);
  const sin = Math.sin(-polyAngle);
  const dx = circle.pos.x - polyPos.x;
  const dy = circle.pos.y - polyPos.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  let closestDist = Infinity;
  let closestPoint = { x: 0, y: 0 };
  const n = verts.length;

  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
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
    normalLocal = vec2Normalize(vec2Sub(polyPos, circle.pos));
    const cosR = Math.cos(polyAngle);
    const sinR = Math.sin(polyAngle);
    return {
      hit: true,
      normal: { x: normalLocal.x, y: normalLocal.y },
      depth: circle.radius,
    };
  } else {
    normalLocal = vec2Normalize(vec2Sub(closestPoint, { x: localX, y: localY }));
  }

  const cosR = Math.cos(polyAngle);
  const sinR = Math.sin(polyAngle);

  return {
    hit: true,
    normal: {
      x: normalLocal.x * cosR - normalLocal.y * sinR,
      y: normalLocal.x * sinR + normalLocal.y * cosR,
    },
    depth: circle.radius - closestDist,
  };
}

export function circleVsPill(circle: CircleBody, pillPos: Vec2, pillWidth: number, pillHeight: number, pillAngle: number): CollisionResult {
  const cos = Math.cos(-pillAngle);
  const sin = Math.sin(-pillAngle);
  const dx = circle.pos.x - pillPos.x;
  const dy = circle.pos.y - pillPos.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfLen = Math.max(pillWidth, pillHeight) / 2;
  const capRadius = Math.min(pillWidth, pillHeight) / 2;
  const isHorizontal = pillWidth >= pillHeight;

  let nearestX: number, nearestY: number;
  if (isHorizontal) {
    const clamped = Math.max(-halfLen + capRadius, Math.min(halfLen - capRadius, localX));
    nearestX = clamped;
    nearestY = 0;
  } else {
    const clamped = Math.max(-halfLen + capRadius, Math.min(halfLen - capRadius, localY));
    nearestX = 0;
    nearestY = clamped;
  }

  const diffX = localX - nearestX;
  const diffY = localY - nearestY;
  const dist = Math.sqrt(diffX * diffX + diffY * diffY);
  const minDist = circle.radius + capRadius;

  if (dist >= minDist || dist < 0.001) {
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  const nlx = -diffX / dist;
  const nly = -diffY / dist;
  const cosR = Math.cos(pillAngle);
  const sinR = Math.sin(pillAngle);

  return {
    hit: true,
    normal: {
      x: nlx * cosR - nly * sinR,
      y: nlx * sinR + nly * cosR,
    },
    depth: minDist - dist,
  };
}

export function circleVsPlus(circle: CircleBody, plusPos: Vec2, plusWidth: number, plusHeight: number, plusAngle: number): CollisionResult {
  const armW = plusWidth * 0.35;
  const hRect = { pos: plusPos, vel: { x: 0, y: 0 }, width: plusWidth, height: armW, angle: plusAngle, mass: 1 };
  const vRect = { pos: plusPos, vel: { x: 0, y: 0 }, width: armW, height: plusHeight, angle: plusAngle, mass: 1 };

  const r1 = circleVsRect(circle, hRect);
  const r2 = circleVsRect(circle, vRect);

  if (r1.hit && r2.hit) {
    return r1.depth > r2.depth ? r1 : r2;
  }
  if (r1.hit) return r1;
  if (r2.hit) return r2;
  return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
}

export function getDiamondVerts(hw: number, hh: number): Vec2[] {
  return [
    { x: 0, y: -hh },
    { x: hw, y: 0 },
    { x: 0, y: hh },
    { x: -hw, y: 0 },
  ];
}

export function getHexagonVerts(r: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return verts;
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

function getObstacleBounds(pos: Vec2, width: number, height: number, radius: number, shape: string): { minX: number; maxX: number; minY: number; maxY: number } {
  if (shape === "circle" || shape === "hexagon") {
    const r = radius;
    return { minX: pos.x - r, maxX: pos.x + r, minY: pos.y - r, maxY: pos.y + r };
  }
  if (shape === "pill") {
    const hw = Math.max(width, height) / 2;
    return { minX: pos.x - hw, maxX: pos.x + hw, minY: pos.y - hw, maxY: pos.y + hw };
  }
  const hw = width / 2;
  const hh = height / 2;
  return { minX: pos.x - hw, maxX: pos.x + hw, minY: pos.y - hh, maxY: pos.y + hh };
}

export interface ObstacleCollisionBody {
  pos: Vec2;
  vel: Vec2;
  width: number;
  height: number;
  radius: number;
  mass: number;
  shape: string;
}

export function testObstacleVsObstacle(a: ObstacleCollisionBody, b: ObstacleCollisionBody): CollisionResult {
  const boundsA = getObstacleBounds(a.pos, a.width, a.height, a.radius, a.shape);
  const boundsB = getObstacleBounds(b.pos, b.width, b.height, b.radius, b.shape);

  const overlapX = Math.min(boundsA.maxX, boundsB.maxX) - Math.max(boundsA.minX, boundsB.minX);
  const overlapY = Math.min(boundsA.maxY, boundsB.maxY) - Math.max(boundsA.minY, boundsB.minY);

  if (overlapX <= 0 || overlapY <= 0) {
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;

  let normal: Vec2;
  let depth: number;

  if (overlapX < overlapY) {
    depth = overlapX;
    normal = { x: dx > 0 ? 1 : -1, y: 0 };
  } else {
    depth = overlapY;
    normal = { x: 0, y: dy > 0 ? 1 : -1 };
  }

  return { hit: true, normal, depth };
}

export function resolveObstacleCollision(
  a: ObstacleCollisionBody,
  b: ObstacleCollisionBody,
  normal: Vec2,
  depth: number,
  restitution: number,
): void {
  const totalMass = a.mass + b.mass;
  const aRatio = b.mass / totalMass;
  const bRatio = a.mass / totalMass;

  a.pos.x -= normal.x * depth * aRatio;
  a.pos.y -= normal.y * depth * aRatio;
  b.pos.x += normal.x * depth * bRatio;
  b.pos.y += normal.y * depth * bRatio;

  const relVel = vec2Sub(a.vel, b.vel);
  const velAlongNormal = vec2Dot(relVel, normal);

  if (velAlongNormal > 0) return;

  const j = -(1 + restitution) * velAlongNormal / totalMass;

  a.vel.x += normal.x * j * b.mass;
  a.vel.y += normal.y * j * b.mass;
  b.vel.x -= normal.x * j * a.mass;
  b.vel.y -= normal.y * j * a.mass;
}
