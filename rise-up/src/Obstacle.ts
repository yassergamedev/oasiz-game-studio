import {
  type Vec2,
  type ObstacleShape,
  type DifficultyTier,
  GRAVITY,
  OBSTACLE_FRICTION,
  OBSTACLE_COLORS,
  WAVE_PATTERNS,
  SPAWN_AHEAD_DISTANCE,
  DESPAWN_BEHIND_DISTANCE,
  MAX_OBSTACLES,
  DIFFICULTY_TIERS,
} from "./constants.ts";

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
  mass: number;
  color: string;
  shadowOffset: number;
  cornerRadius: number;
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
    mass,
    color: OBSTACLE_COLORS[colorIdx],
    shadowOffset: 3 + Math.random() * 2,
    cornerRadius: shape === "rect" ? 4 + Math.random() * 4 : 0,
  };
}

export function updateObstacle(obs: Obstacle, dt: number): void {
  obs.vel.y += GRAVITY * dt;

  obs.vel.x *= Math.pow(OBSTACLE_FRICTION, dt * 60);

  obs.pos.x += obs.vel.x * dt;
  obs.pos.y += obs.vel.y * dt;
  obs.angle += obs.angularVel * dt;
}

export class ObstacleSpawner {
  private obstacles: Obstacle[] = [];
  private spawnTimer = 0;
  private lastSpawnY = 0;
  private screenWidth = 0;
  private currentTier: DifficultyTier = DIFFICULTY_TIERS[0];

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  getCurrentTier(): DifficultyTier {
    return this.currentTier;
  }

  reset(screenWidth: number, balloonY: number): void {
    this.obstacles = [];
    this.spawnTimer = 0;
    this.lastSpawnY = balloonY - SPAWN_AHEAD_DISTANCE;
    this.screenWidth = screenWidth;
    this.currentTier = DIFFICULTY_TIERS[0];
    nextId = 0;
  }

  update(dt: number, cameraY: number, balloonY: number, score: number): void {
    this.screenWidth = window.innerWidth;
    this.currentTier = this.getTierForScore(score);

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.currentTier.spawnInterval && this.obstacles.length < MAX_OBSTACLES) {
      this.spawnTimer = 0;
      this.spawnWave(balloonY);
    }

    for (const obs of this.obstacles) {
      updateObstacle(obs, dt);
    }

    const despawnY = cameraY + DESPAWN_BEHIND_DISTANCE;
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

  private spawnWave(balloonY: number): void {
    const spawnY = balloonY - SPAWN_AHEAD_DISTANCE;
    const tier = this.currentTier;

    const end = Math.min(tier.patternEnd, WAVE_PATTERNS.length);
    const start = Math.min(tier.patternStart, end);
    const available = WAVE_PATTERNS.slice(start, end);
    if (available.length === 0) return;

    const pattern = available[Math.floor(Math.random() * available.length)];

    for (const def of pattern.obstacles) {
      const x = def.xRatio * this.screenWidth;
      const y = spawnY + def.yOffset;

      const w = def.width * tier.scaleFactor;
      const h = def.height * tier.scaleFactor;
      const r = def.radius * tier.scaleFactor;
      const mass = def.mass * tier.massMultiplier;

      const vx = (def.vx || 0) * tier.speedMultiplier;
      const vy = (def.vy || 0);
      const angVel = (def.angularVel || 0) * tier.speedMultiplier;

      this.obstacles.push(
        createObstacle(def.shape, x, y, w, h, r, mass, vx, vy, angVel),
      );
    }

    this.lastSpawnY = spawnY;
  }
}
