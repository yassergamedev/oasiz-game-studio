import {
  type Vec2,
  type ObstacleShape,
  GRAVITY,
  OBSTACLE_FRICTION,
  OBSTACLE_COLORS,
  WAVE_PATTERNS,
  SPAWN_AHEAD_DISTANCE,
  SPAWN_INTERVAL_BASE,
  SPAWN_INTERVAL_MIN,
  DESPAWN_BEHIND_DISTANCE,
  MAX_OBSTACLES,
  DIFFICULTY_RAMP_TIME,
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
  private gameTime = 0;
  private screenWidth = 0;
  private patternIndex = 0;
  private usedPatterns: Set<number> = new Set();

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  reset(screenWidth: number, balloonY: number): void {
    this.obstacles = [];
    this.spawnTimer = 0;
    this.lastSpawnY = balloonY - SPAWN_AHEAD_DISTANCE;
    this.gameTime = 0;
    this.screenWidth = screenWidth;
    this.patternIndex = 0;
    this.usedPatterns.clear();
    nextId = 0;
  }

  update(dt: number, cameraY: number, balloonY: number): void {
    this.gameTime += dt;
    this.screenWidth = window.innerWidth;

    const difficulty = Math.min(1, this.gameTime / DIFFICULTY_RAMP_TIME);
    const spawnInterval = SPAWN_INTERVAL_BASE - (SPAWN_INTERVAL_BASE - SPAWN_INTERVAL_MIN) * difficulty;

    this.spawnTimer += dt;
    if (this.spawnTimer >= spawnInterval && this.obstacles.length < MAX_OBSTACLES) {
      this.spawnTimer = 0;
      this.spawnWave(balloonY, difficulty);
    }

    for (const obs of this.obstacles) {
      updateObstacle(obs, dt);
    }

    const despawnY = cameraY + DESPAWN_BEHIND_DISTANCE;
    this.obstacles = this.obstacles.filter((obs) => obs.pos.y < despawnY);
  }

  private spawnWave(balloonY: number, difficulty: number): void {
    const spawnY = balloonY - SPAWN_AHEAD_DISTANCE;

    const availablePatterns = this.getAvailablePatterns(difficulty);
    const pattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];

    for (const def of pattern.obstacles) {
      const x = def.xRatio * this.screenWidth;
      const y = spawnY + def.yOffset;

      const scaleFactor = 1 + difficulty * 0.3;
      const w = def.width * scaleFactor;
      const h = def.height * scaleFactor;
      const r = def.radius * scaleFactor;
      const mass = def.mass * (1 + difficulty * 0.5);

      const vx = (def.vx || 0) * (1 + difficulty * 0.5);
      const vy = (def.vy || 0);
      const angVel = (def.angularVel || 0) * (1 + difficulty * 0.3);

      this.obstacles.push(
        createObstacle(def.shape, x, y, w, h, r, mass, vx, vy, angVel),
      );
    }

    this.lastSpawnY = spawnY;
    this.patternIndex++;
  }

  private getAvailablePatterns(difficulty: number) {
    const maxIdx = Math.min(
      WAVE_PATTERNS.length,
      Math.floor(3 + difficulty * (WAVE_PATTERNS.length - 3)),
    );
    return WAVE_PATTERNS.slice(0, maxIdx);
  }
}
