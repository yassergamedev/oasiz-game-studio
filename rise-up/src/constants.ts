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
export type ObstacleShape = "circle" | "rect" | "triangle" | "diamond" | "hexagon" | "plus" | "pill" | "tower" | "pyramid";

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
export const SPAWN_AHEAD_DISTANCE = 400;
export const DESPAWN_BEHIND_DISTANCE = 400;
export const MAX_OBSTACLES = 50;

// ─── Difficulty Tiers (score-based) ───
export interface DifficultyTier {
  name: string;
  minScore: number;
  spawnInterval: number;
  patternStart: number;
  patternEnd: number;
  scaleFactor: number;
  massMultiplier: number;
  speedMultiplier: number;
}

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  {
    name: "easy",
    minScore: 0,
    spawnInterval: 2.0,
    patternStart: 0,
    patternEnd: 5,
    scaleFactor: 1.0,
    massMultiplier: 1.0,
    speedMultiplier: 1.0,
  },
  {
    name: "medium",
    minScore: 10,
    spawnInterval: 1.7,
    patternStart: 0,
    patternEnd: 19,
    scaleFactor: 1.05,
    massMultiplier: 1.1,
    speedMultiplier: 1.1,
  },
  {
    name: "hard",
    minScore: 20,
    spawnInterval: 1.4,
    patternStart: 5,
    patternEnd: 37,
    scaleFactor: 1.15,
    massMultiplier: 1.25,
    speedMultiplier: 1.25,
  },
  {
    name: "expert",
    minScore: 30,
    spawnInterval: 1.1,
    patternStart: 10,
    patternEnd: 50,
    scaleFactor: 1.25,
    massMultiplier: 1.4,
    speedMultiplier: 1.4,
  },
  {
    name: "insane",
    minScore: 40,
    spawnInterval: 0.8,
    patternStart: 15,
    patternEnd: 50,
    scaleFactor: 1.35,
    massMultiplier: 1.6,
    speedMultiplier: 1.6,
  },
];

// ─── Colors ───
export const OBSTACLE_COLORS = [
  "#ff1a1a", // Vibrant Red
  "#1a8aff", // Vibrant Blue
  "#ffdd00", // Vibrant Yellow
  "#00cc44", // Vibrant Green
  "#ff8800", // Vibrant Orange
  "#cc22aa", // Vibrant Magenta
  "#00ddcc", // Vibrant Teal
  "#ff66aa", // Vibrant Pink
];

export const BG_COLOR = "#7EECD4";

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
  // ─── EASY (indices 0-4) ───

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
  // Small tower
  {
    obstacles: [
      { shape: "tower", xRatio: 0.5, yOffset: 0, width: 30, height: 60, radius: 0, mass: 3 },
    ],
  },
  // Small pyramid
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.5, yOffset: 0, width: 60, height: 45, radius: 0, mass: 3 },
    ],
  },

  // ─── MEDIUM (indices 5-14) ───

  // Single tower
  {
    obstacles: [
      { shape: "tower", xRatio: 0.5, yOffset: 0, width: 40, height: 80, radius: 0, mass: 4 },
    ],
  },
  // Narrow gap
  {
    obstacles: [
      { shape: "rect", xRatio: 0.15, yOffset: 0, width: 100, height: 25, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.85, yOffset: 0, width: 100, height: 25, radius: 0, mass: 3 },
    ],
  },
  // Brick wall - 3 bricks in a row
  {
    obstacles: [
      { shape: "rect", xRatio: 0.2, yOffset: 0, width: 55, height: 22, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 55, height: 22, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.8, yOffset: 0, width: 55, height: 22, radius: 0, mass: 2 },
    ],
  },
  // Double brick wall - offset rows
  {
    obstacles: [
      { shape: "rect", xRatio: 0.25, yOffset: 0, width: 50, height: 18, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.55, yOffset: 0, width: 50, height: 18, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.85, yOffset: 0, width: 50, height: 18, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.15, yOffset: -24, width: 50, height: 18, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.4, yOffset: -24, width: 50, height: 18, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.7, yOffset: -24, width: 50, height: 18, radius: 0, mass: 2 },
    ],
  },
  // Small pyramid
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.5, yOffset: 0, width: 80, height: 60, radius: 0, mass: 5 },
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
  // Twin small towers
  {
    obstacles: [
      { shape: "tower", xRatio: 0.3, yOffset: 0, width: 30, height: 70, radius: 0, mass: 3.5 },
      { shape: "tower", xRatio: 0.7, yOffset: 0, width: 30, height: 70, radius: 0, mass: 3.5 },
    ],
  },
  // Pyramid with side blocks
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.5, yOffset: 0, width: 70, height: 55, radius: 0, mass: 4 },
      { shape: "rect", xRatio: 0.15, yOffset: 0, width: 40, height: 20, radius: 0, mass: 1.5 },
      { shape: "rect", xRatio: 0.85, yOffset: 0, width: 40, height: 20, radius: 0, mass: 1.5 },
    ],
  },
  // Tower and pyramid pair
  {
    obstacles: [
      { shape: "tower", xRatio: 0.35, yOffset: 0, width: 30, height: 75, radius: 0, mass: 4 },
      { shape: "pyramid", xRatio: 0.7, yOffset: 0, width: 65, height: 50, radius: 0, mass: 3.5 },
    ],
  },
  // Hexagon cluster
  {
    obstacles: [
      { shape: "hexagon", xRatio: 0.35, yOffset: 0, width: 0, height: 0, radius: 22, mass: 2.5 },
      { shape: "hexagon", xRatio: 0.65, yOffset: 0, width: 0, height: 0, radius: 22, mass: 2.5 },
      { shape: "hexagon", xRatio: 0.5, yOffset: -38, width: 0, height: 0, radius: 22, mass: 2.5 },
    ],
  },
  // Diamond gate
  {
    obstacles: [
      { shape: "diamond", xRatio: 0.2, yOffset: 0, width: 40, height: 55, radius: 0, mass: 2 },
      { shape: "diamond", xRatio: 0.8, yOffset: 0, width: 40, height: 55, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.5, yOffset: -40, width: 60, height: 14, radius: 0, mass: 2 },
    ],
  },
  // Moving blocks
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 50, height: 30, radius: 0, mass: 2, vx: 40 },
      { shape: "rect", xRatio: 0.7, yOffset: -30, width: 50, height: 30, radius: 0, mass: 2, vx: -40 },
    ],
  },

  // ─── HARD (indices 15-29) ───

  // Big circle
  {
    obstacles: [
      { shape: "circle", xRatio: 0.5, yOffset: 0, width: 0, height: 0, radius: 35, mass: 5 },
    ],
  },
  // Spinning bar
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 120, height: 16, radius: 0, mass: 3, angularVel: 1.5 },
    ],
  },
  // Spinning plus
  {
    obstacles: [
      { shape: "plus", xRatio: 0.5, yOffset: 0, width: 80, height: 80, radius: 0, mass: 4, angularVel: 1.2 },
    ],
  },
  // Pillar gate - two tall pills with gap
  {
    obstacles: [
      { shape: "pill", xRatio: 0.2, yOffset: 0, width: 22, height: 80, radius: 0, mass: 3 },
      { shape: "pill", xRatio: 0.8, yOffset: 0, width: 22, height: 80, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.5, yOffset: 45, width: 100, height: 14, radius: 0, mass: 2 },
    ],
  },
  // Pyramid - stacked rows
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 40, height: 20, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.35, yOffset: -25, width: 40, height: 20, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.65, yOffset: -25, width: 40, height: 20, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.2, yOffset: -50, width: 40, height: 20, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.5, yOffset: -50, width: 40, height: 20, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.8, yOffset: -50, width: 40, height: 20, radius: 0, mass: 2 },
    ],
  },
  // Zigzag wall
  {
    obstacles: [
      { shape: "rect", xRatio: 0.2, yOffset: 0, width: 70, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.6, yOffset: -30, width: 70, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.3, yOffset: -60, width: 70, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.7, yOffset: -90, width: 70, height: 16, radius: 0, mass: 2 },
    ],
  },
  // Circle chain
  {
    obstacles: [
      { shape: "circle", xRatio: 0.15, yOffset: 0, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.3, yOffset: -10, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.45, yOffset: -20, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.6, yOffset: -30, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.75, yOffset: -40, width: 0, height: 0, radius: 14, mass: 1 },
      { shape: "circle", xRatio: 0.9, yOffset: -50, width: 0, height: 0, radius: 14, mass: 1 },
    ],
  },
  // Archway - two pillars with a lintel
  {
    obstacles: [
      { shape: "rect", xRatio: 0.25, yOffset: 0, width: 20, height: 60, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.75, yOffset: 0, width: 20, height: 60, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.5, yOffset: -35, width: 140, height: 16, radius: 0, mass: 3 },
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
  // Cross barricade
  {
    obstacles: [
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 160, height: 14, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.35, yOffset: 0, width: 14, height: 60, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.65, yOffset: 0, width: 14, height: 60, radius: 0, mass: 2 },
    ],
  },
  // Diamond rain
  {
    obstacles: [
      { shape: "diamond", xRatio: 0.15, yOffset: 0, width: 30, height: 40, radius: 0, mass: 1.5 },
      { shape: "diamond", xRatio: 0.4, yOffset: -25, width: 30, height: 40, radius: 0, mass: 1.5 },
      { shape: "diamond", xRatio: 0.65, yOffset: -50, width: 30, height: 40, radius: 0, mass: 1.5 },
      { shape: "diamond", xRatio: 0.85, yOffset: -75, width: 30, height: 40, radius: 0, mass: 1.5 },
    ],
  },
  // Converging pills
  {
    obstacles: [
      { shape: "pill", xRatio: 0.2, yOffset: 0, width: 80, height: 22, radius: 0, mass: 2.5, vx: 30 },
      { shape: "pill", xRatio: 0.8, yOffset: -30, width: 80, height: 22, radius: 0, mass: 2.5, vx: -30 },
      { shape: "pill", xRatio: 0.2, yOffset: -60, width: 80, height: 22, radius: 0, mass: 2.5, vx: 30 },
    ],
  },
  // Hexagon wall
  {
    obstacles: [
      { shape: "hexagon", xRatio: 0.15, yOffset: 0, width: 0, height: 0, radius: 20, mass: 2 },
      { shape: "hexagon", xRatio: 0.38, yOffset: 0, width: 0, height: 0, radius: 20, mass: 2 },
      { shape: "hexagon", xRatio: 0.62, yOffset: 0, width: 0, height: 0, radius: 20, mass: 2 },
      { shape: "hexagon", xRatio: 0.85, yOffset: 0, width: 0, height: 0, radius: 20, mass: 2 },
    ],
  },
  // Twin towers
  {
    obstacles: [
      { shape: "tower", xRatio: 0.3, yOffset: 0, width: 35, height: 90, radius: 0, mass: 5 },
      { shape: "tower", xRatio: 0.7, yOffset: 0, width: 35, height: 90, radius: 0, mass: 5 },
    ],
  },
  // Large pyramid
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.5, yOffset: 0, width: 120, height: 90, radius: 0, mass: 8 },
    ],
  },
  // Tower with flanking blocks
  {
    obstacles: [
      { shape: "tower", xRatio: 0.5, yOffset: 0, width: 40, height: 100, radius: 0, mass: 6 },
      { shape: "rect", xRatio: 0.2, yOffset: 0, width: 50, height: 25, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.8, yOffset: 0, width: 50, height: 25, radius: 0, mass: 2 },
    ],
  },

  // ─── EXPERT (indices 30+) ───

  // Full wall with keyhole gap
  {
    obstacles: [
      { shape: "rect", xRatio: 0.12, yOffset: 0, width: 80, height: 20, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.88, yOffset: 0, width: 80, height: 20, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.35, yOffset: 0, width: 50, height: 20, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.65, yOffset: 0, width: 50, height: 20, radius: 0, mass: 3 },
    ],
  },
  // Double spinning bars
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 90, height: 14, radius: 0, mass: 3, angularVel: 1.8 },
      { shape: "rect", xRatio: 0.7, yOffset: -40, width: 90, height: 14, radius: 0, mass: 3, angularVel: -1.8 },
    ],
  },
  // Fortress - box structure
  {
    obstacles: [
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 14, height: 70, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.7, yOffset: 0, width: 14, height: 70, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.5, yOffset: -40, width: 120, height: 14, radius: 0, mass: 3 },
      { shape: "rect", xRatio: 0.5, yOffset: 40, width: 120, height: 14, radius: 0, mass: 3 },
    ],
  },
  // Staircase
  {
    obstacles: [
      { shape: "rect", xRatio: 0.15, yOffset: 0, width: 55, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.35, yOffset: -22, width: 55, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.55, yOffset: -44, width: 55, height: 16, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.75, yOffset: -66, width: 55, height: 16, radius: 0, mass: 2 },
    ],
  },
  // Spinning plus pair
  {
    obstacles: [
      { shape: "plus", xRatio: 0.3, yOffset: 0, width: 70, height: 70, radius: 0, mass: 3.5, angularVel: 1.5 },
      { shape: "plus", xRatio: 0.7, yOffset: -40, width: 70, height: 70, radius: 0, mass: 3.5, angularVel: -1.5 },
    ],
  },
  // Funnel
  {
    obstacles: [
      { shape: "rect", xRatio: 0.1, yOffset: -60, width: 80, height: 16, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.9, yOffset: -60, width: 80, height: 16, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.2, yOffset: -30, width: 60, height: 16, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.8, yOffset: -30, width: 60, height: 16, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.3, yOffset: 0, width: 50, height: 16, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.7, yOffset: 0, width: 50, height: 16, radius: 0, mass: 2.5 },
    ],
  },
  // Checkerboard
  {
    obstacles: [
      { shape: "rect", xRatio: 0.2, yOffset: 0, width: 35, height: 35, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.5, yOffset: 0, width: 35, height: 35, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.8, yOffset: 0, width: 35, height: 35, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.35, yOffset: -40, width: 35, height: 35, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.65, yOffset: -40, width: 35, height: 35, radius: 0, mass: 2 },
    ],
  },
  // Mixed shape gauntlet
  {
    obstacles: [
      { shape: "hexagon", xRatio: 0.2, yOffset: 0, width: 0, height: 0, radius: 18, mass: 2 },
      { shape: "diamond", xRatio: 0.5, yOffset: -30, width: 40, height: 50, radius: 0, mass: 2 },
      { shape: "plus", xRatio: 0.8, yOffset: -60, width: 55, height: 55, radius: 0, mass: 2.5 },
      { shape: "pill", xRatio: 0.35, yOffset: -90, width: 60, height: 20, radius: 0, mass: 2 },
    ],
  },
  // Triple archway
  {
    obstacles: [
      { shape: "rect", xRatio: 0.1, yOffset: 0, width: 16, height: 50, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.38, yOffset: 0, width: 16, height: 50, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.62, yOffset: 0, width: 16, height: 50, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.9, yOffset: 0, width: 16, height: 50, radius: 0, mass: 2.5 },
      { shape: "rect", xRatio: 0.24, yOffset: -30, width: 80, height: 14, radius: 0, mass: 2 },
      { shape: "rect", xRatio: 0.76, yOffset: -30, width: 80, height: 14, radius: 0, mass: 2 },
    ],
  },
  // V-formation
  {
    obstacles: [
      { shape: "circle", xRatio: 0.5, yOffset: 0, width: 0, height: 0, radius: 16, mass: 1.5 },
      { shape: "circle", xRatio: 0.35, yOffset: -30, width: 0, height: 0, radius: 16, mass: 1.5 },
      { shape: "circle", xRatio: 0.65, yOffset: -30, width: 0, height: 0, radius: 16, mass: 1.5 },
      { shape: "circle", xRatio: 0.2, yOffset: -60, width: 0, height: 0, radius: 16, mass: 1.5 },
      { shape: "circle", xRatio: 0.8, yOffset: -60, width: 0, height: 0, radius: 16, mass: 1.5 },
    ],
  },
  // Pyramid fortress
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.3, yOffset: 0, width: 90, height: 70, radius: 0, mass: 6 },
      { shape: "pyramid", xRatio: 0.7, yOffset: 0, width: 90, height: 70, radius: 0, mass: 6 },
    ],
  },
  // Tower gauntlet
  {
    obstacles: [
      { shape: "tower", xRatio: 0.15, yOffset: 0, width: 30, height: 80, radius: 0, mass: 4 },
      { shape: "tower", xRatio: 0.4, yOffset: -30, width: 30, height: 100, radius: 0, mass: 5 },
      { shape: "tower", xRatio: 0.65, yOffset: -15, width: 30, height: 90, radius: 0, mass: 4.5 },
      { shape: "tower", xRatio: 0.85, yOffset: -45, width: 30, height: 70, radius: 0, mass: 3.5 },
    ],
  },
  // Pyramid with tower crown
  {
    obstacles: [
      { shape: "pyramid", xRatio: 0.5, yOffset: 0, width: 140, height: 100, radius: 0, mass: 10 },
      { shape: "tower", xRatio: 0.5, yOffset: -90, width: 30, height: 60, radius: 0, mass: 3 },
    ],
  },
];

// ─── Floor ───
export const FLOOR_SCROLL_DIVISOR = 1000;

// ─── Score Config ───
export const SCORE_ANCHORS = [
  { raw: 50, normalized: 100 as const },
  { raw: 200, normalized: 300 as const },
  { raw: 500, normalized: 600 as const },
  { raw: 1500, normalized: 950 as const },
];
