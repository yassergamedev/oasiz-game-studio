// ─── Vec2 ───
export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function vec2Len(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Len(v);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

// ─── Game States ───
export type GameState = "MENU" | "PLAYING" | "PAUSED" | "GAME_OVER";

// ─── Balloon ───
export const BALLOON_RADIUS = 22;
export const BALLOON_RISE_SPEED = 60;
export const BALLOON_RISE_ACCEL = 0.15;
export const BALLOON_MAX_RISE_SPEED = 140;
export const BALLOON_START_Y = 200;

// ─── Shield ───
export const SHIELD_RADIUS = 28;
export const SHIELD_FOLLOW_SPEED = 18;
export const SHIELD_PUSH_FORCE = 800;
export const SHIELD_TETHER_LENGTH = 180;

// ─── Obstacle Shapes ───
export type ObstacleShape = "circle" | "rect" | "triangle";

export interface ObstacleDef {
  shape: ObstacleShape;
  width: number;
  height: number;
  radius: number;
  mass: number;
  color: string;
}

// ─── Physics ───
export const GRAVITY = 120;
export const OBSTACLE_FRICTION = 0.98;
export const OBSTACLE_RESTITUTION = 0.4;

// ─── Spawning ───
export const SPAWN_AHEAD_DISTANCE = 600;
export const SPAWN_INTERVAL_BASE = 1.2;
export const SPAWN_INTERVAL_MIN = 0.4;
export const DESPAWN_BEHIND_DISTANCE = 400;
export const MAX_OBSTACLES = 40;

// ─── Difficulty ───
export const DIFFICULTY_RAMP_TIME = 120;

// ─── Colors ───
export const OBSTACLE_COLORS = [
  "#ffffff", "#f0f0f0", "#e8e8e8", "#f5f5f5",
  "#ebebeb", "#f8f8f8", "#ededed", "#f2f2f2",
];

export const BG_COLOR = "#87CEEB";

// ─── Wave Patterns ───
export interface WavePattern {
  obstacles: Array<{
    shape: ObstacleShape;
    xRatio: number;
    yOffset: number;
    width: number;
    height: number;
    radius: number;
    mass: number;
    vx?: number;
    vy?: number;
    angularVel?: number;
  }>;
}

export const WAVE_PATTERNS: WavePattern[] = [
  // Single block
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 60, height: 30, radius: 0, mass: 2 },
    ],
  },
  // Two blocks side by side
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 50, height: 25, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.7, yOffset: 0, width: 50, height: 25, radius: 0, mass: 2 },
    ],
  },
  // Three circles
  {
    obstacles: [
      { shape: "circle", xRatio: 0.2, yOffset: 0, width: 0, height: 0, radius: 18, mass: 1.5 },
      { shape: "circle", xRatio: 0.5, yOffset: -20, width: 0, height: 0, radius: 22, mass: 2 },
      { shape: "circle", xRatio: 0.8, yOffset: 0, width: 0, height: 0, radius: 18, mass: 1.5 },
    ],
  },
  // Wide bar
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 180, height: 20, radius: 0, mass: 4 },
    ],
  },
  // Diagonal scatter
  {
    obstacles: [
      { shape: "circle", xRatio: 0.2, yOffset: 0, width: 0, height: 0, radius: 16, mass: 1.2 },
      { shape: "rect", xRatio: 0.5, yOffset: -40, width: 40, height: 40, radius: 0, mass: 2.5 },
      { shape: "circle", xRatio: 0.8, yOffset: -80, width: 0, height: 0, radius: 16, mass: 1.2 },
    ],
  },
  // Triangle formation
  {
    obstacles: [
      { shape: "triangle", xRatio: 0.5, yOffset: 0, width: 50, height: 45, radius: 0, mass: 2 },
      { shape: "triangle", xRatio: 0.3, yOffset: -50, width: 40, height: 35, radius: 0, mass: 1.5 },
      { shape: "triangle", xRatio: 0.7, yOffset: -50, width: 40, height: 35, radius: 0, mass: 1.5 },
    ],
  },
  // Narrow gap
  {
    obstacles: [
      { shape: "rect", xRatio: 0.15, yOffset: 0, width: 100, height: 25, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.85, yOffset: 0, width: 100, height: 25, radius: 0, mass: 3 },
    ],
  },
  // Moving blocks
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 50, height: 30, radius: 0, mass: 2, vx: 40 },
      { shape: "rect", xRatio: 0.7, yOffset: -30, width: 50, height: 30, radius: 0, mass: 2, vx: -40 },
    ],
  },
  // Big circle
  {
    obstacles: [
      { shape: "circle", xRatio: 0.5, yOffset: 0, width: 0, height: 0, radius: 35, mass: 5 },
    ],
  },
  // Dense scatter
  {
    obstacles: [
      { shape: "circle", xRatio: 0.15, yOffset: 0, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.38, yOffset: -15, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.62, yOffset: -30, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.85, yOffset: -45, width: 0, height: 0, radius: 14, mass: 1 },
    ],
  },
  // Spinning bar (angular velocity)
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 120, height: 16, radius: 0, mass: 3, angularVel: 1.5 },
    ],
  },
  // Mixed shapes cluster
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 45, height: 45, radius: 0, mass: 2.5 },
      { shape: "circle", xRatio: 0.55, yOffset: -20, width: 0, height: 0, radius: 20, mass: 1.8 },
      { shape: "triangle", xRatio: 0.78, yOffset: -40, width: 45, height: 40, radius: 0, mass: 2 },
    ],
  },
];

// ─── Score Config ───
export const SCORE_ANCHORS = [
  { raw: 50, normalized: 100 as const },
  { raw: 200, normalized: 300 as const },
  { raw: 500, normalized: 600 as const },
  { raw: 1500, normalized: 950 as const },
];
