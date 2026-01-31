/**
 * WAVE MODE (Geometry Dash inspired)
 * - Hold (mouse/touch/space) = move up at 45°
 * - Release = move down at 45°
 * - Auto-scrolls endlessly
 * - Collision is computed from rendered geometry (walls + spikes + blocks)
 *
 * Notes:
 * - Settings are persisted (music/fx/haptics + debug bounds).
 * - We do NOT persist or track high scores locally (platform owns leaderboards).
 *
 * MAP GENERATION RULES:
 * See MAP_GENERATION_RULES.md for comprehensive rules based on frame analysis.
 * Key principles: 45° angles only, spikes on flat segments, difficulty scaling,
 * color theme switching (purple→red), geometric obstacle patterns.
 */
 
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface VisualSettings {
  showBounds: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Wheel {
  x: number;
  y: number;
  radius: number;
}

interface Chunk {
  xStart: number;
  xEnd: number;
  top: Point[];
  bottom: Point[];
  spikes: SpikeTri[];
  blocks: Block[];
  wheels: Wheel[];
}

interface SpikeTri {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
}

interface Block {
  x: number; // world center
  y: number; // world top
  w: number;
  h: number;
  spikes: SpikeTri[];
}


interface TrailPoint {
  x: number; // world
  y: number; // world
  a: number;
}

const CONFIG = {
  // Physics
  WAVE_SIZE: 18,
  // Keep X and Y equal to preserve perfect 45° wave motion
  WAVE_SPEED_X: 420, // px/s (dialed down)
  WAVE_SPEED_Y: 420, // px/s (dialed down)

  // Camera
  CAMERA_SMOOTH: 0.14,

  // Level geometry
  CHUNK_WIDTH: 900,
  SEG_DX: 90, // corridors are built from 0° or 45° segments only
  WALL_MARGIN: 70, // keep corridor away from extreme edges
  MIN_HEIGHT: 150,
  MAX_HEIGHT: 320,

  // Spikes
  SPIKE_W: 34,
  SPIKE_H: 34,
  SPIKE_SPACING: 34,
  SPIKE_SCALE_MIN: 0.6,
  SPIKE_SCALE_MAX: 1.4,

  // Difficulty
  DIFF_START_EASY_METERS: 120,
  DIFF_RAMP_METERS: 2200,
  SPEED_BASE: 1.0,
  SPEED_MAX: 1.8,

  // Visuals (calmer synthwave, not eye-searing)
  BG_TOP: "#12061f",
  BG_BOTTOM: "#04222f",
  GRID_COLOR: "rgba(255,255,255,0.06)",
  STAR_COUNT: 140,
  WALL_FILL: "#15102a",
  WALL_PATTERN: "rgba(120, 80, 255, 0.10)",
  WALL_OUTLINE: "rgba(255,255,255,0.95)",
  SPIKE_FILL: "#ffffff",
  SPIKE_STROKE: "rgba(0,0,0,0.70)",
  WAVE_FILL: "#e9fbff",
  WAVE_GLOW: "rgba(0, 255, 255, 0.55)",
  WAVE_OUTLINE: "rgba(0, 0, 0, 0.8)",
  TRAIL: "rgba(0, 255, 255, 0.35)",
  TRAIL_OUTLINE: "rgba(255, 255, 255, 1.0)", // White outline

  // FX
  SHAKE_MS: 140,
  SHAKE_PX: 10,
  DEATH_FLASH_MS: 120,
};

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pointInTri(px: number, py: number, t: SpikeTri): boolean {
  // Barycentric technique
  const v0x = t.cx - t.ax;
  const v0y = t.cy - t.ay;
  const v1x = t.bx - t.ax;
  const v1y = t.by - t.ay;
  const v2x = px - t.ax;
  const v2y = py - t.ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-6) return false;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function pointSegDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 1e-6) return dist2(px, py, ax, ay);
  const t = clamp((apx * abx + apy * aby) / abLen2, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return dist2(px, py, cx, cy);
}

function circleIntersectsTri(cx: number, cy: number, r: number, t: SpikeTri): boolean {
  if (pointInTri(cx, cy, t)) return true;
  const r2 = r * r;
  if (pointSegDistSq(cx, cy, t.ax, t.ay, t.bx, t.by) <= r2) return true;
  if (pointSegDistSq(cx, cy, t.bx, t.by, t.cx, t.cy) <= r2) return true;
  if (pointSegDistSq(cx, cy, t.cx, t.cy, t.ax, t.ay) <= r2) return true;
  return false;
}

function circleIntersectsRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number): boolean {
  // rect is top-left (x,y)
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return dist2(cx, cy, nx, ny) <= r * r;
}

function triggerHaptic(settings: Settings, type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

class AudioFx {
  private ctx: AudioContext | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private enabled = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopHum();
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  public startHum(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.humOsc) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.value = 0.0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.12);
    this.humOsc = osc;
    this.humGain = gain;
  }

  public stopHum(): void {
    if (!this.ctx || !this.humOsc || !this.humGain) return;
    const ctx = this.ctx;
    const osc = this.humOsc;
    const gain = this.humGain;
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.08);
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // ignore
    }
    this.humOsc = null;
    this.humGain = null;
  }

  public click(type: "death" | "ui"): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = type === "death" ? 210 : 420;
    gain.gain.value = 0.0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.linearRampToValueAtTime(type === "death" ? 0.11 : 0.07, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.07);
    osc.stop(ctx.currentTime + 0.09);
  }
}

class LevelGen {
  private topY = 0;
  private botY = 0;

  public reset(width: number, height: number): void {
    const h = clamp(height * 0.58, CONFIG.MIN_HEIGHT + 40, CONFIG.MAX_HEIGHT);
    this.topY = height * 0.5 - h * 0.5;
    this.botY = this.topY + h;
  }

  public nextChunk(xStart: number, canvasW: number, canvasH: number, meters: number, isEmpty: boolean): Chunk {
    const dx = CONFIG.SEG_DX;
    const steps = Math.floor(CONFIG.CHUNK_WIDTH / dx);
    const top: Point[] = [{ x: xStart, y: this.topY }];
    const bottom: Point[] = [{ x: xStart, y: this.botY }];

    const diff = this.difficulty01(meters);
    const maxStepChance = lerp(0.25, 0.55, diff); // how often we turn slopes
    const heightTighten = lerp(0, 1, diff);

    const minH = lerp(CONFIG.MAX_HEIGHT, CONFIG.MIN_HEIGHT, heightTighten);
    const maxH = lerp(CONFIG.MAX_HEIGHT, CONFIG.MIN_HEIGHT + 110, heightTighten);

    const marginTop = CONFIG.WALL_MARGIN;
    const marginBot = canvasH - CONFIG.WALL_MARGIN;

    let x = xStart;
    for (let i = 0; i < steps; i++) {
      const x2 = x + dx;

      let dyTop = 0;
      let dyBot = 0;

      // Choose changes in {-dx,0,dx} so edges are 0° or 45° only
      if (Math.random() < maxStepChance) {
        dyTop = this.pickDy(dx, diff);
      }
      if (Math.random() < maxStepChance) {
        dyBot = this.pickDy(dx, diff);
      }

      let t2 = this.topY + dyTop;
      let b2 = this.botY + dyBot;

      // Enforce bounds
      t2 = clamp(t2, marginTop, marginBot - minH);
      b2 = clamp(b2, marginTop + minH, marginBot);

      // Enforce corridor height window
      let h = b2 - t2;
      if (h < minH) {
        const push = (minH - h) * 0.5;
        t2 = clamp(t2 - push, marginTop, marginBot - minH);
        b2 = clamp(b2 + push, marginTop + minH, marginBot);
        h = b2 - t2;
      }
      if (h > maxH) {
        const pull = (h - maxH) * 0.5;
        t2 = clamp(t2 + pull, marginTop, marginBot - minH);
        b2 = clamp(b2 - pull, marginTop + minH, marginBot);
      }

      // Re-quantize to keep 45°/flat: make deltas exactly -dx/0/+dx relative to previous
      t2 = this.quantizeStep(this.topY, t2, dx);
      b2 = this.quantizeStep(this.botY, b2, dx);

      // Final safety for min height after quantization
      if (b2 - t2 < minH) {
        // prefer moving bottom away from top
        const need = minH - (b2 - t2);
        b2 = clamp(b2 + need, marginTop + minH, marginBot);
        b2 = this.quantizeStep(this.botY, b2, dx);
        if (b2 - t2 < minH) {
          // fallback: flatten both
          t2 = this.topY;
          b2 = this.botY;
        }
      }

      this.topY = t2;
      this.botY = b2;
      top.push({ x: x2, y: this.topY });
      bottom.push({ x: x2, y: this.botY });
      x = x2;
    }

    const chunk: Chunk = {
      xStart,
      xEnd: xStart + CONFIG.CHUNK_WIDTH,
      top,
      bottom,
      spikes: [],
      blocks: [],
      wheels: [],
    };

    if (!isEmpty) {
      this.addSurfaceSpikes(chunk, meters);
      this.addBlocks(chunk, meters, canvasH, minH);
      this.addWheels(chunk, meters, canvasH, minH);
    }

    return chunk;
  }

  private difficulty01(meters: number): number {
    if (meters <= CONFIG.DIFF_START_EASY_METERS) return 0;
    return clamp((meters - CONFIG.DIFF_START_EASY_METERS) / CONFIG.DIFF_RAMP_METERS, 0, 1);
  }

  private pickDy(dx: number, diff: number): number {
    // Early game: more flats; later: more up/down turns
    const r = Math.random();
    const turnBias = lerp(0.18, 0.45, diff);
    if (r < 1 - turnBias) return 0;
    return Math.random() < 0.5 ? -dx : dx;
  }

  private quantizeStep(prevY: number, targetY: number, dx: number): number {
    const dy = targetY - prevY;
    if (dy > dx * 0.5) return prevY + dx;
    if (dy < -dx * 0.5) return prevY - dx;
    return prevY;
  }

  private addSurfaceSpikes(chunk: Chunk, meters: number): void {
    const diff = this.difficulty01(meters);
    const pStrip = lerp(0.25, 0.65, diff);

    // spikes only on flat segments (matches frames readability)
    const addStrip = (a: Point, b: Point, isTop: boolean): void => {
      const len = b.x - a.x;
      const count = Math.floor((len - CONFIG.SPIKE_W) / CONFIG.SPIKE_SPACING);
      if (count <= 0) return;
      const inset = CONFIG.SPIKE_W * 0.7;
      for (let i = 0; i < count; i++) {
        const cx = a.x + inset + i * CONFIG.SPIKE_SPACING;
        const baseY = isTop ? a.y : a.y;
        chunk.spikes.push(this.makeSpike(cx, baseY, isTop));
      }
    };

    for (let i = 0; i < chunk.top.length - 1; i++) {
      const a = chunk.top[i];
      const b = chunk.top[i + 1];
      if (Math.abs(b.y - a.y) < 0.1 && Math.random() < pStrip) {
        addStrip(a, b, true);
      }
    }

    for (let i = 0; i < chunk.bottom.length - 1; i++) {
      const a = chunk.bottom[i];
      const b = chunk.bottom[i + 1];
      if (Math.abs(b.y - a.y) < 0.1 && Math.random() < pStrip) {
        addStrip(a, b, false);
      }
    }
  }

  private addBlocks(chunk: Chunk, meters: number, canvasH: number, minH: number): void {
    const diff = this.difficulty01(meters);
    const pBlock = lerp(0.10, 0.34, diff);
    if (Math.random() > pBlock) return;

    // place one readable block per chunk max
    const x = chunk.xStart + CONFIG.CHUNK_WIDTH * lerp(0.55, 0.45, diff);
    const c = this.corridorAtX(chunk, x);

    const corridorH = c.bottomY - c.topY;
    const maxBlockH = corridorH - minH * 0.55;
    if (maxBlockH < 80) return;

    const w = lerp(120, 180, Math.random());
    const h = clamp(lerp(90, maxBlockH, Math.random()), 80, 260);
    const y = c.topY + lerp(28, corridorH - h - 28, Math.random());

    const block: Block = { x, y, w, h, spikes: [] };

    // Optional spikes on top/bottom edges of block (frame vibe)
    const pEdgeSpikes = lerp(0.20, 0.55, diff);
    if (Math.random() < pEdgeSpikes) {
      const spacing = CONFIG.SPIKE_SPACING;
      const count = Math.max(2, Math.floor((w - 20) / spacing));
      const x0 = x - w * 0.5 + 14;
      for (let i = 0; i < count; i++) {
        const sx = x0 + i * spacing;
        block.spikes.push(this.makeSpike(sx, y, false)); // top edge points up
      }
    }
    if (Math.random() < pEdgeSpikes) {
      const spacing = CONFIG.SPIKE_SPACING;
      const count = Math.max(2, Math.floor((w - 20) / spacing));
      const x0 = x - w * 0.5 + 14;
      for (let i = 0; i < count; i++) {
        const sx = x0 + i * spacing;
        block.spikes.push(this.makeSpike(sx, y + h, true)); // bottom edge points down
      }
    }

    // Safety: keep block within corridor
    if (y < c.topY + 10) return;
    if (y + h > c.bottomY - 10) return;
    if (x - w * 0.5 < chunk.xStart + 40) return;
    if (x + w * 0.5 > chunk.xEnd - 40) return;

    chunk.blocks.push(block);
    for (const s of block.spikes) chunk.spikes.push(s);
  }

  // Rolling spike wheels (static in world, visually rotating)
  private addWheels(chunk: Chunk, meters: number, canvasH: number, minH: number): void {
    // Low chance early, higher chance later
    const diff = this.difficulty01(meters);
    const pWheel = lerp(0.05, 0.18, diff);
    if (Math.random() > pWheel) return;

    const x = chunk.xStart + CONFIG.CHUNK_WIDTH * lerp(0.4, 0.7, Math.random());
    const c = this.corridorAtX(chunk, x);
    const corridorH = c.bottomY - c.topY;

    // Radius based on corridor height (leave margin)
    const maxRadius = (corridorH - minH * 0.4) * 0.5;
    if (maxRadius < 24) return;
    const radius = lerp(26, Math.min(60, maxRadius), Math.random());

    const y = c.topY + corridorH * 0.5;

    // Safety margins
    if (y - radius < c.topY + 10) return;
    if (y + radius > c.bottomY - 10) return;

    chunk.wheels.push({ x, y, radius });
  }

  private corridorAtX(chunk: Chunk, x: number): { topY: number; bottomY: number } {
    const sample = (path: Point[]): number => {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (x >= a.x && x <= b.x) {
          const t = (x - a.x) / (b.x - a.x || 1);
          return lerp(a.y, b.y, t);
        }
      }
      return path[path.length - 1].y;
    };
    return { topY: sample(chunk.top), bottomY: sample(chunk.bottom) };
  }

  private makeSpike(cx: number, baseY: number, fromTop: boolean): SpikeTri {
    const scale = CONFIG.SPIKE_SCALE_MIN + Math.random() * (CONFIG.SPIKE_SCALE_MAX - CONFIG.SPIKE_SCALE_MIN);
    const w = CONFIG.SPIKE_W * scale;
    const h = CONFIG.SPIKE_H * scale;
    if (fromTop) {
      // base on top surface, tip down into corridor
      return {
        ax: cx,
        ay: baseY + h,
        bx: cx - w * 0.5,
        by: baseY,
        cx: cx + w * 0.5,
        cy: baseY,
      };
    }
    // base on bottom surface, tip up into corridor
    return {
      ax: cx,
      ay: baseY - h,
      bx: cx - w * 0.5,
      by: baseY,
      cx: cx + w * 0.5,
      cy: baseY,
    };
  }
}

class WaveModeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private state: GameState = "START";
  private lastT = performance.now();

  private settings: Settings = { music: true, fx: true, haptics: true };
  private visual: VisualSettings = { showBounds: false };

  private audio = new AudioFx();

  private waveX = 0;
  private waveY = 0;
  private holding = false;
  private scrollX = 0;
  private meters = 0;
  private speedMul = 1;
  private isSlidingOnSurface = false; // true when clamped to roof/ground

  private camY = 0;
  private shakeT = 0;
  private shakeX = 0;
  private shakeY = 0;
  private deathFlashT = 0;

  private trail: TrailPoint[] = [];
  private stars: Array<{
    x: number;
    y: number;
    size: number;
    twinkle: number;
    speed: number;
    baseAlpha: number;
  }> = [];

  private gen = new LevelGen();
  private chunks: Chunk[] = [];

  // UI
  private startOverlay = document.getElementById("startOverlay") as HTMLElement;
  private gameOverOverlay = document.getElementById("gameOverOverlay") as HTMLElement;
  private pauseOverlay = document.getElementById("pauseOverlay") as HTMLElement;
  private distanceEl = document.getElementById("distance") as HTMLElement;
  private highScoreEl = document.getElementById("highScore") as HTMLElement;
  private finalDistanceEl = document.getElementById("finalDistance") as HTMLElement;
  private pauseBtn = document.getElementById("pauseBtn") as HTMLElement;
  private settingsBtn = document.getElementById("settingsBtn") as HTMLElement;
  private settingsPanel = document.getElementById("settingsPanel") as HTMLElement;
  private settingsToggleBtn = document.getElementById("settingsToggleBtn") as HTMLElement;
  private toggleMusic = document.getElementById("toggleMusic") as HTMLElement;
  private toggleFx = document.getElementById("toggleFx") as HTMLElement;
  private toggleHaptics = document.getElementById("toggleHaptics") as HTMLElement;
  private toggleShowBounds = document.getElementById("toggleShowBounds") as HTMLElement;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;

    this.loadSettings();
    this.applySettingsToUI();

    this.onResize();
    this.generateStars();
    window.addEventListener("resize", () => this.onResize());

    this.setupInput();
    this.setupUI();

    this.resetRun();
    requestAnimationFrame(() => this.loop());
  }

  private onResize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Regenerate stars for new viewport size
    this.generateStars();

    if (this.chunks.length === 0) {
      this.resetRun();
    }
  }

  private resetRun(): void {
    this.scrollX = 0;
    this.meters = 0;
    this.speedMul = CONFIG.SPEED_BASE;
    this.waveX = window.innerWidth * 0.22;
    this.waveY = window.innerHeight * 0.52;
    this.camY = 0;
    this.trail = [];
    this.holding = false;

    this.gen.reset(window.innerWidth, window.innerHeight);
    this.chunks = [];
    // 2 easy chunks
    let x = 0;
    for (let i = 0; i < 6; i++) {
      const empty = i < 2;
      const c = this.gen.nextChunk(x, window.innerWidth, window.innerHeight, this.meters, empty);
      this.chunks.push(c);
      x += CONFIG.CHUNK_WIDTH;
    }
  }

  // Create a star field for the background (twinkling, slight parallax).
  private generateStars(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.stars = [];
    for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.6 + 0.4, // small dots
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.05, // slow parallax
        baseAlpha: 0.25 + Math.random() * 0.35,
      });
    }
  }

  private setupUI(): void {
    const playBtn = document.getElementById("playBtn");
    const restartBtn = document.getElementById("restartBtn");
    const resumeBtn = document.getElementById("resumeBtn");

    playBtn?.addEventListener("click", () => {
      this.uiClick();
      this.start();
    });
    restartBtn?.addEventListener("click", () => {
      this.uiClick();
      this.restart();
    });
    resumeBtn?.addEventListener("click", () => {
      this.uiClick();
      this.resume();
    });

    this.pauseBtn.addEventListener("click", () => {
      this.uiClick();
      if (this.state === "PLAYING") this.pause();
      else if (this.state === "PAUSED") this.resume();
    });

    this.settingsBtn.addEventListener("click", () => {
      this.uiClick();
      this.toggleSettings();
    });

    this.settingsToggleBtn.addEventListener("click", () => {
      this.uiClick();
      this.toggleSettings();
    });

    const toggle = (el: HTMLElement, key: keyof Settings) => {
      el.addEventListener("click", () => {
        (this.settings as any)[key] = !this.settings[key];
        this.saveSettings();
        this.applySettingsToUI();
        triggerHaptic(this.settings, "light");
        if (key === "music") {
          this.audio.setEnabled(this.settings.music);
          if (this.state === "PLAYING" && this.settings.music) this.audio.startHum();
          if (!this.settings.music) this.audio.stopHum();
        }
      });
    };
    toggle(this.toggleMusic, "music");
    toggle(this.toggleFx, "fx");
    toggle(this.toggleHaptics, "haptics");

    this.toggleShowBounds.addEventListener("click", () => {
      this.visual.showBounds = !this.visual.showBounds;
      localStorage.setItem("waveModeVisual", JSON.stringify(this.visual));
      this.applySettingsToUI();
      triggerHaptic(this.settings, "light");
    });
  }

  private uiClick(): void {
    if (this.settings.fx) this.audio.click("ui");
  }

  private toggleSettings(): void {
    const isHidden = this.settingsPanel.classList.contains("settingsPanelHidden");
    if (isHidden) this.settingsPanel.classList.remove("settingsPanelHidden");
    else this.settingsPanel.classList.add("settingsPanelHidden");
  }

  private applySettingsToUI(): void {
    this.toggleMusic.classList.toggle("active", this.settings.music);
    this.toggleFx.classList.toggle("active", this.settings.fx);
    this.toggleHaptics.classList.toggle("active", this.settings.haptics);
    this.toggleShowBounds.classList.toggle("active", this.visual.showBounds);
    this.highScoreEl.textContent = "Best: —";
  }

  private loadSettings(): void {
    try {
      const s = localStorage.getItem("waveModeSettings");
      if (s) this.settings = { ...this.settings, ...JSON.parse(s) };
    } catch {
      // ignore
    }
    try {
      const v = localStorage.getItem("waveModeVisual");
      if (v) this.visual = { ...this.visual, ...JSON.parse(v) };
    } catch {
      // ignore
    }
    this.audio.setEnabled(this.settings.music);
  }

  private saveSettings(): void {
    localStorage.setItem("waveModeSettings", JSON.stringify(this.settings));
  }

  private setupInput(): void {
    // More reliable “previous” style controls:
    // - Pointer + Space are tracked independently
    // - Press on START begins the run immediately
    // - Press on GAME_OVER restarts immediately (no extra click)
    // - Press on PAUSED resumes immediately
    let pointerDown = false;
    let spaceDown = false;

    const syncHolding = (): void => {
      this.holding = pointerDown || spaceDown;
    };

    const handlePress = (e: Event): void => {
      // Start/restart/resume on press (feels snappy like the old version)
      if (this.state === "START") {
        this.start();
      } else if (this.state === "GAME_OVER") {
        this.restart();
      } else if (this.state === "PAUSED") {
        this.resume();
      }
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent): void => {
      pointerDown = true;
      handlePress(e);
      syncHolding();
    };
    const onPointerUp = (e: PointerEvent): void => {
      pointerDown = false;
      e.preventDefault();
      syncHolding();
    };

    // Pointer events cover mouse + touch + pen and handle multi-device better.
    window.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    window.addEventListener("pointercancel", onPointerUp, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        spaceDown = true;
        handlePress(e);
        syncHolding();
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        if (this.state === "PLAYING") this.pause();
        else if (this.state === "PAUSED") this.resume();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        spaceDown = false;
        e.preventDefault();
        syncHolding();
      }
    });

    window.addEventListener("blur", () => {
      pointerDown = false;
      spaceDown = false;
      syncHolding();
    });
  }

  private start(): void {
    this.state = "PLAYING";
    this.startOverlay.classList.add("hidden");
    this.gameOverOverlay.classList.add("hidden");
    this.pauseOverlay.classList.add("hidden");

    // hide gameplay buttons on start overlay rule: we show only during play
    this.pauseBtn.classList.remove("hidden");
    this.settingsBtn.classList.remove("hidden");

    if (this.settings.music) this.audio.startHum();
    triggerHaptic(this.settings, "light");
  }

  private restart(): void {
    this.resetRun();
    this.start();
  }

  private pause(): void {
    if (this.state !== "PLAYING") return;
    this.state = "PAUSED";
    this.pauseOverlay.classList.remove("hidden");
    this.audio.stopHum();
    triggerHaptic(this.settings, "light");
  }

  private resume(): void {
    if (this.state !== "PAUSED") return;
    this.state = "PLAYING";
    this.pauseOverlay.classList.add("hidden");
    if (this.settings.music) this.audio.startHum();
    triggerHaptic(this.settings, "light");
  }

  private gameOver(): void {
    if (this.state === "GAME_OVER") return;
    this.state = "GAME_OVER";
    this.audio.stopHum();
    if (this.settings.fx) this.audio.click("death");
    triggerHaptic(this.settings, "error");

    const final = Math.max(0, Math.floor(this.meters));
    console.log("[WaveModeGame] Game over. Distance:", final);
    this.finalDistanceEl.textContent = `Distance: ${final}m`;
    this.gameOverOverlay.classList.remove("hidden");
    this.pauseOverlay.classList.add("hidden");

    // Submit score to platform (no local highscore tracking)
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(final);
    }
  }

  private loop(): void {
    const now = performance.now();
    const dt = Math.min(0.033, (now - this.lastT) / 1000);
    this.lastT = now;

    this.update(dt);
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  private update(dt: number): void {
    if (this.deathFlashT > 0) this.deathFlashT -= dt * 1000;

    if (this.state !== "PLAYING") {
      this.updateShake(dt);
      return;
    }

    this.meters = this.scrollX / 10;
    const diff = clamp((this.meters - CONFIG.DIFF_START_EASY_METERS) / CONFIG.DIFF_RAMP_METERS, 0, 1);
    this.speedMul = lerp(CONFIG.SPEED_BASE, CONFIG.SPEED_MAX, diff);

    const vx = CONFIG.WAVE_SPEED_X * this.speedMul;
    const vy = (this.holding ? -1 : 1) * CONFIG.WAVE_SPEED_Y * this.speedMul;

    this.scrollX += vx * dt;
    this.waveY += vy * dt;

    // ensure chunks ahead
    this.ensureChunks();

    // Camera follows corridor center vertically (so path stays centered as it slopes)
    const worldX = this.scrollX + this.waveX;
    const currentChunk = this.findChunk(worldX);
    if (currentChunk) {
      const bounds = this.corridorAtX(currentChunk, worldX);
      const corridorCenter = (bounds.topY + bounds.bottomY) * 0.5;
      const targetCamY = corridorCenter - window.innerHeight * 0.5;
      this.camY += (targetCamY - this.camY) * CONFIG.CAMERA_SMOOTH;
    }

    // Clamp to corridor bounds so player can slide along ground/roof without dying.
    // This keeps the wave inside the corridor defined by the current chunk,
    // but we do NOT treat touching these bounds as lethal.
    let worldY = this.waveY + this.camY;
    this.isSlidingOnSurface = false;
    if (currentChunk) {
      const bounds = this.corridorAtX(currentChunk, worldX);
      const margin = CONFIG.WAVE_SIZE * 0.6;
      const minY = bounds.topY + margin;
      const maxY = bounds.bottomY - margin;
      const clampedWorldY = clamp(worldY, minY, maxY);
      if (clampedWorldY !== worldY) {
        worldY = clampedWorldY;
        // Update waveY so the triangle and trail visually slide along the wall.
        this.waveY = worldY - this.camY;
        this.isSlidingOnSurface = true; // Mark as sliding on roof/ground
      }
    }

    // Trail uses world X (forward motion) and screen Y (dart Y) so the path
    // is a perfect 45° zig-zag relative to the scrolling level.
    const trailX = worldX;
    const trailY = this.waveY;
    this.trail.push({ x: trailX, y: trailY, a: 1 });
    if (this.trail.length > 46) this.trail.shift();
    for (const p of this.trail) p.a *= 0.92;

    this.updateShake(dt);

    if (this.checkCollision(worldX, worldY)) {
      this.shakeT = CONFIG.SHAKE_MS;
      this.deathFlashT = CONFIG.DEATH_FLASH_MS;
      this.gameOver();
    }

    this.distanceEl.textContent = `${Math.floor(this.meters)}m`;
  }

  private updateShake(dt: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= dt * 1000;
      const t = clamp(this.shakeT / CONFIG.SHAKE_MS, 0, 1);
      const amp = CONFIG.SHAKE_PX * t;
      this.shakeX = (Math.random() - 0.5) * amp;
      this.shakeY = (Math.random() - 0.5) * amp;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  private ensureChunks(): void {
    if (this.chunks.length === 0) return;
    const last = this.chunks[this.chunks.length - 1];
    const needX = this.scrollX + window.innerWidth * 1.6;
    if (needX > last.xEnd - 200) {
      const meters = this.scrollX / 10;
      const c = this.gen.nextChunk(last.xEnd, window.innerWidth, window.innerHeight, meters, false);
      this.chunks.push(c);
      while (this.chunks.length > 10) this.chunks.shift();
    }
  }

  private findChunk(worldX: number): Chunk | null {
    for (const c of this.chunks) {
      if (worldX >= c.xStart && worldX <= c.xEnd) return c;
    }
    return null;
  }

  private checkCollision(worldX: number, worldY: number): boolean {
    const chunk = this.findChunk(worldX);
    if (!chunk) return false;

    const r = CONFIG.WAVE_SIZE * 0.55;

    // NOTE: Ground / roof (top & bottom polylines) are now NON-lethal.
    // Only spikes and solid blocks kill the player.

    // Blocks (solid rectangular obstacles)
    for (const b of chunk.blocks) {
      const x0 = b.x - b.w * 0.5;
      const y0 = b.y;
      if (circleIntersectsRect(worldX, worldY, r, x0, y0, b.w, b.h)) return true;
    }

    // Spikes (including block spikes)
    for (const s of chunk.spikes) {
      if (circleIntersectsTri(worldX, worldY, r, s)) return true;
    }

    // Rolling wheels (circular hazard)
    for (const w of chunk.wheels) {
      if (dist2(worldX, worldY, w.x, w.y) <= (w.radius + r) * (w.radius + r)) return true;
    }

    return false;
  }

  private hitPolyline(worldX: number, worldY: number, r: number, path: Point[]): boolean {
    const r2 = r * r;
    // only check nearby segments
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (worldX < a.x - 120 || worldX > b.x + 120) continue;
      if (pointSegDistSq(worldX, worldY, a.x, a.y, b.x, b.y) <= r2) return true;
    }
    return false;
  }

  // Sample corridor bounds (top & bottom Y) at a given world X.
  // Duplicates LevelGen.corridorAtX so we can clamp the player to slide along walls.
  private corridorAtX(chunk: Chunk, x: number): { topY: number; bottomY: number } {
    const sample = (path: Point[]): number => {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (x >= a.x && x <= b.x) {
          const t = (x - a.x) / (b.x - a.x || 1);
          return lerp(a.y, b.y, t);
        }
      }
      return path[path.length - 1].y;
    };
    return { topY: sample(chunk.top), bottomY: sample(chunk.bottom) };
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    this.drawBackground();
    this.drawWorld();
    this.drawWave();
    this.drawDeathFlash();
    ctx.restore();
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, CONFIG.BG_TOP);
    g.addColorStop(1, CONFIG.BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Starry twinkling background (behind grid)
    const t = performance.now() * 0.001;
    ctx.save();
    for (const s of this.stars) {
      // Parallax: stars drift slightly with scroll
      const sx = (s.x - this.scrollX * s.speed) % w;
      const sy = s.y;
      const x = sx < 0 ? sx + w : sx;

      // Twinkle: alpha oscillates around baseAlpha
      const tw = 0.45 + 0.55 * Math.sin(t * 2.3 + s.twinkle);
      const alpha = s.baseAlpha * tw;

      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // subtle diamond grid, parallax
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = CONFIG.GRID_COLOR;
    ctx.lineWidth = 1;
    const size = 34;
    const ox = -((this.scrollX * 0.08) % size);
    const oy = -((this.camY * 0.08) % size);
    for (let x = ox - size; x < w + size; x += size) {
      for (let y = oy - size; y < h + size; y += size) {
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.5);
        ctx.lineTo(x + size * 0.5, y);
        ctx.lineTo(x + size, y + size * 0.5);
        ctx.lineTo(x + size * 0.5, y + size);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawWorld(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(-this.scrollX, -this.camY);

    // draw walls for visible chunks
    const visibleStart = this.scrollX - 200;
    const visibleEnd = this.scrollX + window.innerWidth + 600;

    for (const c of this.chunks) {
      if (c.xEnd < visibleStart || c.xStart > visibleEnd) continue;
      this.drawWalls(c);
      for (const b of c.blocks) this.drawBlock(b);
      this.drawSpikes(c.spikes);
      this.drawWheels(c.wheels);
      if (this.visual.showBounds) this.drawDebug(c);
    }

    ctx.restore();
  }

  private drawWalls(c: Chunk): void {
    const ctx = this.ctx;
    const h = window.innerHeight;
    // Extend walls far beyond screen bounds to ensure full coverage when camera moves
    const topExtend = -2000; // Extend far up
    const bottomExtend = h + 2000; // Extend far down

    // Top fill - extend far beyond screen
    ctx.fillStyle = CONFIG.WALL_FILL;
    ctx.beginPath();
    ctx.moveTo(c.top[0].x, topExtend);
    for (const p of c.top) ctx.lineTo(p.x, p.y);
    ctx.lineTo(c.top[c.top.length - 1].x, topExtend);
    ctx.closePath();
    ctx.fill();
    this.drawWallPatternClip(c.top, true, topExtend);

    // Bottom fill - extend far beyond screen
    ctx.beginPath();
    ctx.moveTo(c.bottom[0].x, bottomExtend);
    for (const p of c.bottom) ctx.lineTo(p.x, p.y);
    ctx.lineTo(c.bottom[c.bottom.length - 1].x, bottomExtend);
    ctx.closePath();
    ctx.fill();
    this.drawWallPatternClip(c.bottom, false, bottomExtend);

    // Outline inner edges
    ctx.save();
    ctx.strokeStyle = CONFIG.WALL_OUTLINE;
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(255,255,255,0.35)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(c.top[0].x, c.top[0].y);
    for (const p of c.top) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.bottom[0].x, c.bottom[0].y);
    for (const p of c.bottom) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawWheels(wheels: Wheel[]): void {
    const ctx = this.ctx;
    const time = performance.now() * 0.003;

    ctx.save();
    for (const w of wheels) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(time); // constant rotation

      // Outer circle
      ctx.fillStyle = "#0b0718";
      ctx.strokeStyle = CONFIG.WALL_OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, w.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner hub
      ctx.fillStyle = CONFIG.SPIKE_FILL;
      ctx.beginPath();
      ctx.arc(0, 0, w.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Spikes around rim
      const spokeCount = 12;
      ctx.fillStyle = CONFIG.SPIKE_FILL;
      ctx.strokeStyle = CONFIG.SPIKE_STROKE;
      ctx.lineWidth = 2;
      for (let i = 0; i < spokeCount; i++) {
        const angle = (i / spokeCount) * Math.PI * 2;
        const innerR = w.radius * 0.7;
        const outerR = w.radius * 1.1;
        const x1 = Math.cos(angle) * innerR;
        const y1 = Math.sin(angle) * innerR;
        const x2 = Math.cos(angle + 0.12) * outerR;
        const y2 = Math.sin(angle + 0.12) * outerR;
        const x3 = Math.cos(angle - 0.12) * outerR;
        const y3 = Math.sin(angle - 0.12) * outerR;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  private drawWallPatternClip(path: Point[], isTop: boolean, extendY: number): void {
    const ctx = this.ctx;
    const h = window.innerHeight;
    ctx.save();
    ctx.globalAlpha = 0.4;
    
    // Create clipping path
    ctx.beginPath();
    if (isTop) {
      ctx.moveTo(path[0].x, extendY);
      for (const p of path) ctx.lineTo(p.x, p.y);
      ctx.lineTo(path[path.length - 1].x, extendY);
    } else {
      ctx.moveTo(path[0].x, extendY);
      for (const p of path) ctx.lineTo(p.x, p.y);
      ctx.lineTo(path[path.length - 1].x, extendY);
    }
    ctx.closePath();
    ctx.clip();

    // Improved geometric pattern design
    const patternSize = 24;
    const startX = Math.floor(path[0].x / patternSize) * patternSize - patternSize;
    const endX = path[path.length - 1].x + patternSize * 2;
    const startY = isTop ? extendY : Math.floor(path[0].y / patternSize) * patternSize;
    const endY = isTop ? Math.floor(path[path.length - 1].y / patternSize) * patternSize : extendY;

    ctx.fillStyle = CONFIG.WALL_PATTERN;
    ctx.strokeStyle = CONFIG.WALL_PATTERN;
    ctx.lineWidth = 1;

    for (let x = startX; x < endX; x += patternSize) {
      for (let y = startY; y < endY; y += patternSize) {
        const gridX = Math.floor(x / patternSize);
        const gridY = Math.floor(y / patternSize);
        const cx = x + patternSize * 0.5;
        const cy = y + patternSize * 0.5;
        const halfSize = patternSize * 0.4;

        // Alternating geometric shapes for visual interest
        if ((gridX + gridY) % 4 === 0) {
          // Diamond shape
          ctx.beginPath();
          ctx.moveTo(cx, cy - halfSize);
          ctx.lineTo(cx + halfSize, cy);
          ctx.lineTo(cx, cy + halfSize);
          ctx.lineTo(cx - halfSize, cy);
          ctx.closePath();
          ctx.fill();
        } else if ((gridX + gridY) % 4 === 1) {
          // Small circle
          ctx.beginPath();
          ctx.arc(cx, cy, halfSize * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if ((gridX + gridY) % 4 === 2) {
          // Cross pattern
          ctx.beginPath();
          ctx.moveTo(cx - halfSize, cy);
          ctx.lineTo(cx + halfSize, cy);
          ctx.moveTo(cx, cy - halfSize);
          ctx.lineTo(cx, cy + halfSize);
          ctx.stroke();
        } else {
          // Small square
          ctx.fillRect(cx - halfSize * 0.5, cy - halfSize * 0.5, halfSize, halfSize);
        }
      }
    }
    ctx.restore();
  }

  private drawBlock(b: Block): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#0e0b1f";
    ctx.strokeStyle = CONFIG.WALL_OUTLINE;
    ctx.lineWidth = 3;
    const x0 = b.x - b.w * 0.5;
    ctx.fillRect(x0, b.y, b.w, b.h);
    ctx.strokeRect(x0, b.y, b.w, b.h);
    ctx.restore();
  }

  private drawSpikes(spikes: SpikeTri[]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = CONFIG.SPIKE_FILL;
    ctx.strokeStyle = CONFIG.SPIKE_STROKE;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,255,255,0.18)";
    ctx.shadowBlur = 10;
    for (const t of spikes) {
      ctx.beginPath();
      ctx.moveTo(t.ax, t.ay);
      ctx.lineTo(t.bx, t.by);
      ctx.lineTo(t.cx, t.cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWave(): void {
    const ctx = this.ctx;

    // trail (diagonal zig-zag, 45° segments relative to scrolling level)
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      
      // Pulsing white outline (beats on and off)
      const time = performance.now() * 0.003;
      const pulse = 0.5 + 0.5 * Math.sin(time); // Oscillates between 0 and 1
      const outlineAlpha = pulse;
      
      // Draw outline first (thicker, pulsing white)
      ctx.lineWidth = 16;
      ctx.strokeStyle = `rgba(255, 255, 255, ${outlineAlpha})`;
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const sx = p.x - this.scrollX;
        const sy = p.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      
      // Draw main trail on top (thinner, brighter)
      ctx.lineWidth = 12;
      ctx.strokeStyle = CONFIG.TRAIL;
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const sx = p.x - this.scrollX;
        const sy = p.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // wave triangle (screen space) - equilateral-style, visually balanced
    const size = CONFIG.WAVE_SIZE;
    const x = this.waveX;
    const y = this.waveY;
    ctx.save();
    ctx.translate(x, y);
    // Point forward when sliding on roof/ground, otherwise point at 45° up/down
    if (this.isSlidingOnSurface) {
      ctx.rotate(0); // Point forward (horizontal)
    } else {
      const dirUp = this.holding;
      ctx.rotate(dirUp ? -Math.PI / 4 : Math.PI / 4);
    }
    ctx.fillStyle = CONFIG.WAVE_FILL;
    ctx.strokeStyle = CONFIG.WAVE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.shadowColor = CONFIG.WAVE_GLOW;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    // Equally-angled triangle: tip forward, symmetric base
    // Apex at (size, 0), base corners at (-size * 0.6, ±size * 0.8)
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, size * 0.8);
    ctx.lineTo(-size * 0.6, -size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke(); // Draw outline
    ctx.restore();
  }

  private drawDeathFlash(): void {
    if (this.deathFlashT <= 0) return;
    const ctx = this.ctx;
    const a = clamp(this.deathFlashT / CONFIG.DEATH_FLASH_MS, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.25 * a;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.restore();
  }

  private drawDebug(c: Chunk): void {
    const ctx = this.ctx;
    // draw collision polylines + wave circle
    ctx.save();
    ctx.strokeStyle = "rgba(0,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.top[0].x, c.top[0].y);
    for (const p of c.top) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.bottom[0].x, c.bottom[0].y);
    for (const p of c.bottom) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }
}

// Boot
console.log("[WaveModeGame] Boot");
new WaveModeGame();

