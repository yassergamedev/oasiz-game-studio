import {
  type Vec2,
  type ObstacleShape,
  type DifficultyTier,
  OBSTACLE_COLORS,
  WAVE_PATTERNS,
  SPAWN_AHEAD_DISTANCE,
  DESPAWN_BEHIND_DISTANCE,
  DIFFICULTY_TIERS,
} from "./constants.ts";

const OBSTACLE_SCALE = 0.7;

export interface Obstacle {
  id: number;
  shape: ObstacleShape;
  pos: Vec2;
  vel: Vec2;
  width: number;
  height: number;
  radius: number;
  angle: number;
  angularVel: number;
  heightY: number;
  velY: number;
  tiltX: number;
  tiltZ: number;
  spinX: number;
  spinZ: number;
  grounded: boolean;
  mass: number;
  color: string;
  shadowOffset: number;
  cornerRadius: number;
  isStatic: boolean;
  isDebris: boolean;
}

let nextId = 0;

export function createObstacle(
  shape: ObstacleShape,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  mass: number,
  vx: number,
  vy: number,
  angularVel: number,
): Obstacle {
  const colorIdx = Math.floor(Math.random() * OBSTACLE_COLORS.length);
  return {
    id: nextId++,
    shape,
    pos: { x, y },
    vel: { x: vx, y: vy },
    width,
    height,
    radius,
    angle: 0,
    angularVel,
    heightY: 0,
    velY: 0,
    tiltX: 0,
    tiltZ: 0,
    spinX: 0,
    spinZ: 0,
    grounded: true,
    mass,
    color: OBSTACLE_COLORS[colorIdx],
    shadowOffset: 3 + Math.random() * 2,
    cornerRadius: shape === "rect" ? 4 + Math.random() * 4 : 0,
    isStatic: true,
    isDebris: false,
  };
}

export function createDebrisBrick(
  x: number,
  y: number,
  color: string,
  vx: number,
  vy: number,
): Obstacle {
  return {
    id: nextId++,
    shape: "rect",
    pos: { x, y },
    vel: { x: vx, y: vy },
    width: 18,
    height: 18,
    radius: 0,
    angle: Math.random() * Math.PI * 2,
    angularVel: (Math.random() - 0.5) * 4,
    heightY: 8 + Math.random() * 20,
    velY: 60 + Math.random() * 100,
    tiltX: (Math.random() - 0.5) * 1.0,
    tiltZ: (Math.random() - 0.5) * 1.0,
    spinX: (Math.random() - 0.5) * 6,
    spinZ: (Math.random() - 0.5) * 6,
    grounded: false,
    mass: 1.2,
    color,
    shadowOffset: 2,
    cornerRadius: 0,
    isStatic: false,
    isDebris: true,
  };
}

const DYNAMIC_FRICTION = 0.97;
const VERTICAL_GRAVITY = 280;
const BOUNCE_RESTITUTION = 0.35;
const GROUND_LEVEL = 0;

export function updateObstacle(obs: Obstacle, dt: number): void {
  if (obs.isStatic) return;

  const fPow = Math.pow(DYNAMIC_FRICTION, dt * 60);

  obs.vel.x *= fPow;
  obs.vel.y *= fPow;

  obs.pos.x += obs.vel.x * dt;
  obs.pos.y += obs.vel.y * dt;
  obs.angle += obs.angularVel * dt;
  obs.angularVel *= Math.pow(0.98, dt * 60);

  if (!obs.grounded) {
    obs.velY -= VERTICAL_GRAVITY * dt;
    obs.heightY += obs.velY * dt;

    obs.tiltX += obs.spinX * dt;
    obs.tiltZ += obs.spinZ * dt;

    if (obs.heightY <= GROUND_LEVEL) {
      obs.heightY = GROUND_LEVEL;
      obs.velY = -obs.velY * BOUNCE_RESTITUTION;

      obs.spinX *= 0.5;
      obs.spinZ *= 0.5;
      obs.angularVel *= 0.5;
      obs.vel.x *= 0.7;
      obs.vel.y *= 0.7;

      if (Math.abs(obs.velY) < 5) {
        obs.velY = 0;
        obs.heightY = GROUND_LEVEL;
        obs.grounded = true;
        obs.spinX = 0;
        obs.spinZ = 0;
        obs.tiltX = 0;
        obs.tiltZ = 0;
      }
    }
  }

  if (obs.grounded) {
    obs.tiltX *= Math.pow(0.05, dt * 60);
    obs.tiltZ *= Math.pow(0.05, dt * 60);
    if (Math.abs(obs.tiltX) < 0.01) obs.tiltX = 0;
    if (Math.abs(obs.tiltZ) < 0.01) obs.tiltZ = 0;
  }
}

function getObstacleBounds(x: number, y: number, w: number, h: number, r: number, shape: ObstacleShape): { cx: number; cy: number; halfW: number; halfH: number } {
  if (shape === "circle" || shape === "hexagon") {
    return { cx: x, cy: y, halfW: r, halfH: r };
  }
  if (shape === "pill") {
    return { cx: x, cy: y, halfW: Math.max(w, h) / 2, halfH: Math.max(w, h) / 2 };
  }
  return { cx: x, cy: y, halfW: w / 2, halfH: h / 2 };
}

function boundsOverlap(
  a: { cx: number; cy: number; halfW: number; halfH: number },
  b: { cx: number; cy: number; halfW: number; halfH: number },
  padding: number,
): boolean {
  return (
    Math.abs(a.cx - b.cx) < a.halfW + b.halfW + padding &&
    Math.abs(a.cy - b.cy) < a.halfH + b.halfH + padding
  );
}

export class ObstacleSpawner {
  private obstacles: Obstacle[] = [];
  private nextSpawnY = 0;
  private screenWidth = 0;
  private currentTier: DifficultyTier = DIFFICULTY_TIERS[0];

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  getCurrentTier(): DifficultyTier {
    return this.currentTier;
  }

  reset(screenWidth: number, balloonY: number, screenHeight: number): void {
    this.obstacles = [];
    this.nextSpawnY = balloonY - screenHeight - 100;
    this.screenWidth = screenWidth;
    this.currentTier = DIFFICULTY_TIERS[0];
    nextId = 0;
  }

  addObstacle(obs: Obstacle): void {
    this.obstacles.push(obs);
  }

  removeObstacle(id: number): void {
    this.obstacles = this.obstacles.filter((o) => o.id !== id);
  }

  update(dt: number, cameraTopY: number, cameraBottomY: number, balloonY: number, score: number, screenWidth?: number): void {
    if (screenWidth !== undefined) {
      this.screenWidth = screenWidth;
    }
    this.currentTier = this.getTierForScore(score);

    const spawnHorizon = balloonY - SPAWN_AHEAD_DISTANCE;
    const offScreenY = cameraTopY - 80;

    let safety = 0;
    while (this.nextSpawnY >= spawnHorizon && this.obstacles.length < this.currentTier.maxObstacles && safety < 10) {
      if (this.nextSpawnY < offScreenY) {
        this.spawnWave(this.nextSpawnY);
      }
      this.nextSpawnY -= this.currentTier.spawnDistance;
      safety++;
    }

    for (const obs of this.obstacles) {
      updateObstacle(obs, dt);
    }

    const despawnY = cameraBottomY + DESPAWN_BEHIND_DISTANCE;
    this.obstacles = this.obstacles.filter((obs) => obs.pos.y < despawnY);
  }

  private getTierForScore(score: number): DifficultyTier {
    let tier = DIFFICULTY_TIERS[0];
    for (const t of DIFFICULTY_TIERS) {
      if (score >= t.minScore) tier = t;
      else break;
    }
    return tier;
  }

  private spawnWave(spawnY: number): void {
    const tier = this.currentTier;

    const end = Math.min(tier.patternEnd, WAVE_PATTERNS.length);
    const start = Math.min(tier.patternStart, end);
    const available = WAVE_PATTERNS.slice(start, end);
    if (available.length === 0) return;

    const pattern = available[Math.floor(Math.random() * available.length)];

    const priorBounds = this.obstacles
      .filter((o) => !o.isDebris)
      .map((o) => getObstacleBounds(o.pos.x, o.pos.y, o.width, o.height, o.radius, o.shape));

    const OVERLAP_PAD = 30;

    const waveCandidates: Array<{ obs: Obstacle; bounds: { cx: number; cy: number; halfW: number; halfH: number } }> = [];

    for (const def of pattern.obstacles) {
      const x = def.xRatio * this.screenWidth;
      const y = spawnY + def.yOffset;

      const w = def.width * tier.scaleFactor * OBSTACLE_SCALE;
      const h = def.height * tier.scaleFactor * OBSTACLE_SCALE;
      const r = def.radius * tier.scaleFactor * OBSTACLE_SCALE;
      const mass = def.mass * tier.massMultiplier;

      const newBounds = getObstacleBounds(x, y, w, h, r, def.shape);
      let overlaps = false;
      for (const eb of priorBounds) {
        if (boundsOverlap(newBounds, eb, OVERLAP_PAD)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      const vx = (def.vx || 0) * tier.speedMultiplier;
      const vy = (def.vy || 0);
      const angVel = (def.angularVel || 0) * tier.speedMultiplier;

      const obs = createObstacle(def.shape, x, y, w, h, r, mass, vx, vy, angVel);
      waveCandidates.push({ obs, bounds: getObstacleBounds(obs.pos.x, obs.pos.y, obs.width, obs.height, obs.radius, obs.shape) });
    }

    if (waveCandidates.length === 0) return;

    for (const c of waveCandidates) {
      this.obstacles.push(c.obs);
      priorBounds.push(c.bounds);
    }
  }
}
