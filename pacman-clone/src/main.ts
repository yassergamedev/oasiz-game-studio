/**
 * DASH BRO
 * Fast-paced dash-based maze game with 3D rotating cube player
 * 
 * Features:
 * - Tile-based endless maze system
 * - Instant dash movement
 * - 3D rotating cube player with wiggly animation
 * - 3D trail with cubes
 * - Dynamic color-shifting
 * - Water rising hazard
 * - Score system
 */

import bgImageUrl from "../assets/Bg.png";
import bgMusicUrl from "../assets/Desert Glass Reverie.mp3";
import coinSoundUrl from "../assets/coin.wav";
import swooshSoundUrl from "../assets/swoosh.wav";

// Player sprites (single-frame idle and dash)
import playerIdleSpriteUrl from "../assets/player_idle/idle.png";
import playerDashSpriteUrl from "../assets/player_dashing/dash.png";

// Items
import coinSprite from "../assets/items/coin.png";
import bounceSprite from "../assets/items/bounce.png";

// Props

// Platforms
import platformTile from "../assets/platforms/2.png";
import platformCorner from "../assets/platforms/1.png";
import spikeSprite from "../assets/platforms/spike.png";
import tileSprite from "../assets/platforms/tile.png";
import wall8Sprite from "../assets/platforms/wall8.png";
import wall5Sprite from "../assets/platforms/wall5.png";
import wall2Sprite from "../assets/platforms/wall2.png";
import wall12Sprite from "../assets/platforms/wall12.png";

// UI Elements
import pauseButtonSprite from "../assets/ui/pause.png";
import settingsButtonSprite from "../assets/ui/settings.png";
import scoreBadgeSprite from "../assets/ui/score_bagde.png";
import pausedPanelSprite from "../assets/ui/paused.png";
import resumeButtonSprite from "../assets/ui/resume.png";
import menuButtonSprite from "../assets/ui/menu.png";
import restartButtonSprite from "../assets/ui/restart.png";
import settingsPanelSprite from "../assets/ui/settings_panel.png";
import onToggleSprite from "../assets/ui/On.png";
import offToggleSprite from "../assets/ui/off.png";
import menuBgSprite from "../assets/ui/bg.png";
import titleSprite from "../assets/ui/title.png";
import startButtonSprite from "../assets/ui/start.png";
import optionsButtonSprite from "../assets/ui/options.png";
import musicLabelSprite from "../assets/ui/music.png";
import sfxLabelSprite from "../assets/ui/sfx.png";
import hapticsLabelSprite from "../assets/ui/haptics.png";
import gameOverPanelSprite from "../assets/ui/game_over.png";

type GameState = "START" | "PLAYING" | "PAUSED" | "DYING" | "GAME_OVER";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

type Direction = "up" | "down" | "left" | "right";

type TileType = "wall" | "empty" | "dot" | "power";

interface TrailPoint {
  x: number;
  y: number;
  z: number; // 3D depth position
  alpha: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "dash" | "landing";
}

interface DashFlash {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  duration: number;
  elapsed: number;
  hitWall: boolean;
  clothStartX: number; // Where the cloth was thrown from (player's back)
  clothStartY: number;
}

interface DashEnd {
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  hitWall: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function waterWaveY(baseY: number, worldX: number, timeS: number): number {
  const w1 = Math.sin(timeS * 1.35 + worldX * 0.020) * 7.5;
  const w2 = Math.sin(timeS * 0.85 + worldX * 0.011) * 4.0;
  const w3 = Math.sin(timeS * 2.10 + worldX * 0.006) * 2.0;
  return baseY + w1 + w2 + w3;
}

function sandDuneY(baseY: number, worldX: number, timeS: number): number {
  // Create dune-like waves - larger, slower, more organic
  const dune1 = Math.sin(timeS * 0.3 + worldX * 0.008) * 25.0; // Large primary dunes
  const dune2 = Math.sin(timeS * 0.5 + worldX * 0.015) * 12.0; // Medium secondary dunes
  const dune3 = Math.sin(timeS * 0.8 + worldX * 0.025) * 6.0;  // Small surface ripples
  const dune4 = Math.sin(timeS * 0.15 + worldX * 0.004) * 35.0; // Very large slow dunes
  return baseY + dune1 + dune2 + dune3 + dune4;
}

// Color-shifting functions for Egyptian pharaoh theme
function getColorShift(time: number, offset: number = 0): { r: number; g: number; b: number } {
  // Egyptian color palette: golds, sandy oranges, deep blues, warm ambers
  const hue = (time * 0.2 + offset) % (Math.PI * 2);
  // Gold/amber tones (warm yellows and oranges)
  const r = Math.floor(220 + Math.sin(hue) * 35 + Math.cos(hue * 1.2) * 20);
  const g = Math.floor(180 + Math.sin(hue + Math.PI * 0.5) * 50 + Math.cos(hue * 0.9) * 30);
  const b = Math.floor(100 + Math.sin(hue + Math.PI) * 40 + Math.cos(hue * 1.1) * 25);
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function getColorString(r: number, g: number, b: number, alpha: number = 1.0): string {
  return `rgba(${r},${g},${b},${alpha})`;
}

const CONFIG = {
  TILE_SIZE: 30,
  TILE_SPACING: 0, // Spacing between tiles (in pixels). Keep at 0 for game logic.
  TILE_OVERLAP: 5, // Visual overlap (in pixels). Tiles render this much larger to create seamless walls.
  MAZE_COLS: 19,
  MAZE_ROWS: 21,
  MIN_WIDTH_COLS: 7, // Minimum playable width (narrow sections)
  MAX_WIDTH_COLS: 17, // Maximum playable width (wide sections)
  ZOOM: 1.5,
  WATER_RISE_PX_PER_S: 4, // Slow rising sand dunes
  PLAYER_BODY: 30,
  PLAYER_SPEED: 20,
  TRAIL_DURATION: 0.4, // Shorter-lived trail
  TRAIL_COUNT: 12, // Fewer points for a shorter trail
  TRAIL_INTERVAL: 1 / 60,
  DASH_FLASH_DURATION: 0.32,
  WALL_HIT_SHAKE: 1.5, // Reduced shake intensity
  WALL_HIT_BOUNCE_DURATION: 0.15,
  BG_TOP: "#1a1626", // Deep purple-blue sky
  BG_BOTTOM: "#2d1a0a", // Dark sandy brown
  WALL_FILL: "#1a1408", // Dark stone/sandstone
  WALL_OUTLINE: "rgba(255, 200, 100, 0.70)", // Golden outline
  DOT_COLOR: "rgba(255, 220, 120, 0.95)", // Gold coins
  WATER_COLOR: "rgba(194, 178, 128, 1.0)", // Sandy beige
  WATER_GLOW: "rgba(194, 178, 128, 0.55)",
  WATER_SURFACE_PADDING_PX: 2,
  GRID_COLOR: "rgba(255, 200, 100, 0.12)", // Golden grid
  // Player bandage palette
  PLAYER_COLOR: "#D8CBB0", // Mid-tone bandage
  PLAYER_GLOW: "rgba(243, 234, 214, 0.60)", // Highlight bandage glow
  TRAIL_COLOR: "#F3EAD6", // Highlight
  TRAIL_GLOW: "#B3A27F", // Shadow
  SMOOTH_RENDER: true,
  BLOOM_ENABLED: true,
  BLOOM_BLUR_PX: 12,
  BLOOM_STRENGTH: 0.22,
};

class AudioFx {
  private fxEnabled = true;
  private audioContext: AudioContext | null = null;
  private musicEnabled = true;
  private bgm: HTMLAudioElement | null = null;
  private coinSound: HTMLAudioElement | null = null;
  private swooshSound: HTMLAudioElement | null = null;

  constructor() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.log("[AudioFx] WebAudio not available");
    }
    
    // Load sound effects
    this.coinSound = new Audio(coinSoundUrl);
    this.coinSound.preload = "auto";
    this.coinSound.volume = 0.6;
    
    this.swooshSound = new Audio(swooshSoundUrl);
    this.swooshSound.preload = "auto";
    this.swooshSound.volume = 0.5;
  }

  setFxEnabled(enabled: boolean): void {
    this.fxEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled && this.bgm) {
      this.bgm.pause();
    } else if (enabled && this.bgm && this.bgm.paused) {
      this.bgm.play().catch(() => {
        // Ignore autoplay blocks
      });
    }
  }

  startMusic(): void {
    if (!this.musicEnabled) return;
    if (!this.bgm) {
      this.bgm = new Audio(bgMusicUrl);
      this.bgm.loop = true;
      this.bgm.preload = "auto";
      this.bgm.volume = 0.4;
    }
    const p = this.bgm.play();
    if (p) {
      p.catch(() => {
        // Ignore autoplay blocks; next user gesture will succeed
        console.log("[AudioFx] Music autoplay blocked, will play on user interaction");
      });
    }
  }

  stopMusic(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = "sine"): void {
    if (!this.fxEnabled || !this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }

  click(type: "dot" | "power" | "death"): void {
    if (type === "dot") {
      // Play coin sound effect
      this.playCoinSound();
    } else if (type === "power") {
      this.playTone(600, 0.15, "sine");
    } else if (type === "death") {
      this.playTone(200, 0.3, "sawtooth");
    }
  }
  
  playCoinSound(): void {
    if (!this.fxEnabled || !this.coinSound) return;
    try {
      // Reset to start and play
      this.coinSound.currentTime = 0;
      this.coinSound.play().catch(() => {
        // Ignore autoplay blocks
      });
    } catch (e) {
      // Ignore audio errors
    }
  }
  
  playSwooshSound(): void {
    if (!this.fxEnabled || !this.swooshSound) return;
    try {
      // Reset to start and play
      this.swooshSound.currentTime = 0;
      this.swooshSound.play().catch(() => {
        // Ignore autoplay blocks
      });
    } catch (e) {
      // Ignore audio errors
    }
  }
}

class DashBroGame {
  private canvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private renderCanvas: HTMLCanvasElement | null = null;
  private renderCtx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private noisePattern: CanvasPattern | null = null;
  private wallPattern: CanvasPattern | null = null;
  private bgImage: HTMLImageElement | null = null;
  private hieroglyphPattern: CanvasPattern | null = null;

  // Sprite assets
  private playerIdleSprite: HTMLImageElement | null = null;
  private playerDashSprite: HTMLImageElement | null = null;
  private coinImage: HTMLImageElement | null = null;
  private bounceImage: HTMLImageElement | null = null;
  private platformTileImage: HTMLImageElement | null = null;
  private platformCornerImage: HTMLImageElement | null = null;
  private spikeImage: HTMLImageElement | null = null;
  private tileImage: HTMLImageElement | null = null;
  private wall8Image: HTMLImageElement | null = null;
  private wall5Image: HTMLImageElement | null = null;
  private wall2Image: HTMLImageElement | null = null;
  private wall12Image: HTMLImageElement | null = null;
  
  // UI Elements
  private pauseButtonImage: HTMLImageElement | null = null;
  private settingsButtonImage: HTMLImageElement | null = null;
  private scoreBadgeImage: HTMLImageElement | null = null;
  private pausedPanelImage: HTMLImageElement | null = null;
  private resumeButtonImage: HTMLImageElement | null = null;
  private menuButtonImage: HTMLImageElement | null = null;
  private settingsPanelImage: HTMLImageElement | null = null;
  private onToggleImage: HTMLImageElement | null = null;
  private offToggleImage: HTMLImageElement | null = null;
  private menuBgImage: HTMLImageElement | null = null;
  private titleImage: HTMLImageElement | null = null;
  private startButtonImage: HTMLImageElement | null = null;
  private optionsButtonImage: HTMLImageElement | null = null;
  private musicLabelImage: HTMLImageElement | null = null;
  private sfxLabelImage: HTMLImageElement | null = null;
  private hapticsLabelImage: HTMLImageElement | null = null;
  private gameOverPanelImage: HTMLImageElement | null = null;
  private restartButtonImage: HTMLImageElement | null = null;
  
  // Props
  
  // Player animation state
  private playerAnimationState: "idle" | "dashing" | "landing" = "idle";
  private playerAnimationFrame = 0;
  private playerAnimationTimer = 0;
  private playerAnimationSpeed = 0.1; // seconds per frame

  private state: GameState = "START";
  private lastT = performance.now();
  private settings: Settings = { music: true, fx: true, haptics: true };
  private audio = new AudioFx();

  // Endless maze
  private rows = new Map<number, TileType[]>();
  private spineXByRow = new Map<number, number>();
  private globalSeed = (Math.random() * 1e9) | 0;
  private minRowCached = 0;
  private maxRowCached = 0;
  private chunkCache = new Map<number, number>(); // rowY -> chunkId
  private chunkWidthFactor = new Map<number, number>(); // chunkId -> width factor (0-1)
  private nextChunkId = 0;
  

  // Player
  private playerX = 0;
  private playerY = 0;
  private playerTileX = 0;
  private playerTileY = 0;
  private playerDirection: Direction = "right";
  private nextDirection: Direction | null = null;
  private trail: TrailPoint[] = [];
  private trailTimer = 0;
  
  // Particles
  private particles: Particle[] = [];
  private isMoving = false;
  private dashFlash: DashFlash | null = null;
  
  // Death animation
  private deathTimer = 0;
  private deathDuration = 0.6; // 0.6 seconds
  private deathParticles: Particle[] = [];
  
  private playerSpawnX = 9; // Column 10 (1-indexed), matches P position in pattern
  private playerSpawnY = 15; // Row 16 (1-indexed), matches player spawn row

  // Water hazard
  private waterSurfaceY = 0;

  // Game state
  private score = 0;
  private lives = 3;
  private level = 1;

  // Camera
  private cameraX = 0;
  private cameraY = 0;
  
  // Screen shake
  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private shakeDecay = 8.0;
  
  // Player animation
  private wallHitBounce = 0; // 0-1, decays over time
  private wallHitDirection: Direction | null = null;

  // Viewport
  private _viewW = window.innerWidth;
  private _viewH = window.innerHeight;

  // UI
  private startOverlay = document.getElementById("startOverlay") as HTMLElement;
  private gameOverOverlay = document.getElementById("gameOverOverlay") as HTMLElement;
  private pauseOverlay = document.getElementById("pauseOverlay") as HTMLElement;
  private hudEl = document.getElementById("hud") as HTMLElement;
  private distanceEl: HTMLElement | null = null;
  private pauseBtn = document.getElementById("pauseBtn") as HTMLElement;
  private settingsBtn = document.getElementById("settingsBtn") as HTMLElement;
  private settingsPanel = document.getElementById("settingsPanel") as HTMLElement;
  private settingsBackdrop = document.getElementById("settingsBackdrop") as HTMLElement;
  
  private settingsCloseBtn = document.getElementById("settingsCloseBtn") as HTMLElement;
  private toggleMusic = document.getElementById("toggleMusic") as HTMLElement;
  private toggleFx = document.getElementById("toggleFx") as HTMLElement;
  private toggleHaptics = document.getElementById("toggleHaptics") as HTMLElement;
  private finalDistanceEl = document.getElementById("finalDistance") as HTMLElement;
  private bestDistanceEl = document.getElementById("bestDistance") as HTMLElement;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const dctx = this.canvas.getContext("2d");
    if (!dctx) throw new Error("Canvas 2D context not available");
    this.displayCtx = dctx;
    this.ctx = dctx;

    this.loadSettings();
    this.applySettingsToUI();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());

    this.setupUI();
    this.setupInput();
    this.resetGame();
    
    // Load all sprites
    this.loadSprites();

    requestAnimationFrame(() => this.loop());
  }

  private viewW(): number {
    return this._viewW;
  }

  private viewH(): number {
    return this._viewH;
  }

  private onResize(): void {
    this._viewW = window.innerWidth;
    this._viewH = window.innerHeight;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = this._viewW * this.dpr;
    this.canvas.height = this._viewH * this.dpr;
    this.canvas.style.width = `${this._viewW}px`;
    this.canvas.style.height = `${this._viewH}px`;

    if (this.displayCtx) {
      this.displayCtx.scale(this.dpr, this.dpr);
    }

    if (CONFIG.SMOOTH_RENDER) {
      this.renderCanvas = document.createElement("canvas");
      this.renderCanvas.width = this._viewW;
      this.renderCanvas.height = this._viewH;
      this.renderCtx = this.renderCanvas.getContext("2d");
      if (this.renderCtx) {
        this.ctx = this.renderCtx;
      }
    }

    this.buildPatterns();
  }

  private loadSprites(): void {
    // Load background
    this.bgImage = new Image();
    this.bgImage.src = bgImageUrl;

    // Load player sprites (single-frame)
    this.playerIdleSprite = new Image();
    this.playerIdleSprite.src = playerIdleSpriteUrl;

    this.playerDashSprite = new Image();
    this.playerDashSprite.src = playerDashSpriteUrl;

    // Load items
    this.coinImage = new Image();
    this.coinImage.src = coinSprite;
    
    this.bounceImage = new Image();
    this.bounceImage.src = bounceSprite;

    // Load platforms
    this.platformTileImage = new Image();
    this.platformTileImage.src = platformTile;
    
    this.platformCornerImage = new Image();
    this.platformCornerImage.src = platformCorner;
    
    
    this.spikeImage = new Image();
    this.spikeImage.src = spikeSprite;
    
    this.tileImage = new Image();
    this.tileImage.src = tileSprite;
    
    // Load side wall sprites
    this.wall8Image = new Image();
    this.wall8Image.src = wall8Sprite;
    
    this.wall5Image = new Image();
    this.wall5Image.src = wall5Sprite;
    
    this.wall2Image = new Image();
    this.wall2Image.src = wall2Sprite;
    
    this.wall12Image = new Image();
    this.wall12Image.src = wall12Sprite;
    
    // Load UI elements
    this.pauseButtonImage = new Image();
    this.pauseButtonImage.src = pauseButtonSprite;
    
    this.settingsButtonImage = new Image();
    this.settingsButtonImage.src = settingsButtonSprite;
    
    this.scoreBadgeImage = new Image();
    this.scoreBadgeImage.src = scoreBadgeSprite;
    
    // Set up UI button images once loaded
    this.pauseButtonImage.onload = () => {
      this.updateUIButtons();
    };
    this.settingsButtonImage.onload = () => {
      this.updateUIButtons();
    };
    this.scoreBadgeImage.onload = () => {
      this.updateScoreBadge();
    };
    
    // Load pause overlay UI elements
    this.pausedPanelImage = new Image();
    this.pausedPanelImage.src = pausedPanelSprite;
    
    this.resumeButtonImage = new Image();
    this.resumeButtonImage.src = resumeButtonSprite;
    
    this.menuButtonImage = new Image();
    this.menuButtonImage.src = menuButtonSprite;
    
    // Load settings panel assets
    this.settingsPanelImage = new Image();
    this.settingsPanelImage.src = settingsPanelSprite;
    
    this.onToggleImage = new Image();
    this.onToggleImage.src = onToggleSprite;
    
    this.offToggleImage = new Image();
    this.offToggleImage.src = offToggleSprite;
    
    // Update settings panel UI once images are loaded
    this.settingsPanelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.onToggleImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.offToggleImage.onload = () => {
      this.updateSettingsPanel();
    };
    
    // Load menu assets
    this.menuBgImage = new Image();
    this.menuBgImage.src = menuBgSprite;
    
    this.titleImage = new Image();
    this.titleImage.src = titleSprite;
    
    this.startButtonImage = new Image();
    this.startButtonImage.src = startButtonSprite;
    
    this.optionsButtonImage = new Image();
    this.optionsButtonImage.src = optionsButtonSprite;
    
    // Update menu once images are loaded
    this.menuBgImage.onload = () => {
      this.updateStartMenu();
    };
    this.titleImage.onload = () => {
      this.updateStartMenu();
    };
    this.startButtonImage.onload = () => {
      this.updateStartMenu();
    };
    this.optionsButtonImage.onload = () => {
      this.updateStartMenu();
    };
    
    // Load settings label images
    this.musicLabelImage = new Image();
    this.musicLabelImage.src = musicLabelSprite;
    
    this.sfxLabelImage = new Image();
    this.sfxLabelImage.src = sfxLabelSprite;
    
    this.hapticsLabelImage = new Image();
    this.hapticsLabelImage.src = hapticsLabelSprite;
    
    // Update settings panel once label images are loaded
    this.musicLabelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.sfxLabelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.hapticsLabelImage.onload = () => {
      this.updateSettingsPanel();
    };
    
    this.pausedPanelImage.onload = () => {
      this.updatePauseOverlay();
    };
    this.resumeButtonImage.onload = () => {
      this.updatePauseOverlay();
    };
    this.menuButtonImage.onload = () => {
      this.updatePauseOverlay();
    };
    
    // Load restart button
    this.restartButtonImage = new Image();
    this.restartButtonImage.src = restartButtonSprite;
    this.restartButtonImage.onload = () => {
      this.updatePauseOverlay();
      this.updateGameOverOverlay();
    };
    
    // Load game over panel
    this.gameOverPanelImage = new Image();
    this.gameOverPanelImage.src = gameOverPanelSprite;
    this.gameOverPanelImage.onload = () => {
      this.updateGameOverOverlay();
    };
  }
  
  private updateUIButtons(): void {
    const pauseBtn = document.getElementById("pauseBtn");
    const settingsBtn = document.getElementById("settingsBtn");
    
    if (pauseBtn && this.pauseButtonImage && this.pauseButtonImage.complete) {
      pauseBtn.innerHTML = "";
      const img = document.createElement("img");
      img.src = this.pauseButtonImage.src;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      pauseBtn.appendChild(img);
    }
    
    if (settingsBtn && this.settingsButtonImage && this.settingsButtonImage.complete) {
      settingsBtn.innerHTML = "";
      const img = document.createElement("img");
      img.src = this.settingsButtonImage.src;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      settingsBtn.appendChild(img);
    }
  }
  
  private updateScoreBadge(): void {
    const distanceEl = document.getElementById("distance");
    if (distanceEl && this.scoreBadgeImage && this.scoreBadgeImage.complete) {
      const hud = document.getElementById("hud");
      if (hud) {
        hud.innerHTML = "";
        const badgeContainer = document.createElement("div");
        badgeContainer.style.position = "relative";
        badgeContainer.style.display = "inline-block";
        
        const badgeImg = document.createElement("img");
        badgeImg.src = this.scoreBadgeImage.src;
        badgeImg.style.width = "auto";
        badgeImg.style.height = "60px";
        badgeImg.style.objectFit = "contain";
        
        const scoreText = document.createElement("div");
        scoreText.id = "distance";
        scoreText.style.position = "absolute";
        scoreText.style.top = "50%";
        scoreText.style.left = "50%";
        scoreText.style.transform = "translate(-50%, -50%)";
        scoreText.style.color = "#ffffff"; // White text
        scoreText.style.fontSize = "20px";
        scoreText.style.fontWeight = "bold";
        scoreText.style.fontFamily = "'Press Start 2P', monospace"; // Hieroglyphics-style font
        scoreText.style.textShadow = "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000"; // Black outline
        scoreText.textContent = "0m";
        
        badgeContainer.appendChild(badgeImg);
        badgeContainer.appendChild(scoreText);
        hud.appendChild(badgeContainer);
      }
    }
  }

  private updatePauseOverlay(): void {
    const pauseOverlay = document.getElementById("pauseOverlay");
    if (!pauseOverlay) return;
    
    // Only update if all images are loaded
    if (!this.pausedPanelImage || !this.pausedPanelImage.complete) return;
    if (!this.resumeButtonImage || !this.resumeButtonImage.complete) return;
    if (!this.menuButtonImage || !this.menuButtonImage.complete) return;
    
    // Clear existing content
    pauseOverlay.innerHTML = "";
    
    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "pauseBackdrop";
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    backdrop.style.zIndex = "0";
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing on backdrop click
    });
    pauseOverlay.appendChild(backdrop);
    
    // Create panel container
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";
    panelContainer.style.animation = "panelSlideIn 0.4s ease-out";
    panelContainer.style.zIndex = "10";
    
    // Add paused panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.pausedPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";
    
    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.position = "absolute";
    buttonContainer.style.top = "50%";
    buttonContainer.style.left = "50%";
    buttonContainer.style.transform = "translate(-50%, -50%)";
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "column";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.width = "100%";
    buttonContainer.style.paddingTop = "40px"; // Raised menu button up
    buttonContainer.style.zIndex = "20"; // Ensure buttons are above panel image
    buttonContainer.style.pointerEvents = "auto"; // Ensure buttons are clickable
    
    // Resume button
    const resumeBtn = document.createElement("button");
    resumeBtn.id = "resumeBtn";
    resumeBtn.style.background = "transparent";
    resumeBtn.style.border = "none";
    resumeBtn.style.padding = "0";
    resumeBtn.style.cursor = "pointer";
    resumeBtn.style.display = "block";
    
    const resumeImg = document.createElement("img");
    resumeImg.src = this.resumeButtonImage.src;
    resumeImg.style.width = "auto";
    resumeImg.style.height = "35px"; // Significantly smaller
    resumeImg.style.objectFit = "contain";
    resumeImg.style.display = "block";
    resumeBtn.appendChild(resumeImg);
    
    // Re-attach event listener
    resumeBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.resume();
    });
    
    buttonContainer.appendChild(resumeBtn);
    
    // Menu button
    const menuBtn = document.createElement("button");
    menuBtn.id = "menuBtn";
    menuBtn.style.background = "transparent";
    menuBtn.style.border = "none";
    menuBtn.style.padding = "0";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.display = "block";
    
    const menuImg = document.createElement("img");
    menuImg.src = this.menuButtonImage.src;
    menuImg.style.width = "auto";
    menuImg.style.height = "30px"; // Even smaller
    menuImg.style.objectFit = "contain";
    menuImg.style.display = "block";
    menuBtn.appendChild(menuImg);
    
    // Re-attach event listener
    menuBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });
    
    buttonContainer.appendChild(menuBtn);
    
    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(buttonContainer);
    
    // Create a wrapper div
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);
    
    pauseOverlay.appendChild(wrapper);
  }
  
  private updateGameOverOverlay(distance: number = 0): void {
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    if (!gameOverOverlay) return;
    
    // Only update if all images are loaded
    if (!this.gameOverPanelImage || !this.gameOverPanelImage.complete) return;
    if (!this.menuButtonImage || !this.menuButtonImage.complete) return;
    if (!this.restartButtonImage || !this.restartButtonImage.complete) return;
    
    // Clear existing content
    gameOverOverlay.innerHTML = "";
    
    // Remove overlay background
    gameOverOverlay.style.background = "transparent";
    
    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "gameOverBackdrop";
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    backdrop.style.zIndex = "0";
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing on backdrop click
    });
    gameOverOverlay.appendChild(backdrop);
    
    // Create panel container
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";
    panelContainer.style.zIndex = "10";
    panelContainer.style.animation = "panelSlideIn 0.4s ease-out";
    
    // Add game over panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.gameOverPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";
    
    // Create content container (positioned absolutely over the panel)
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "absolute";
    contentContainer.style.top = "0";
    contentContainer.style.left = "0";
    contentContainer.style.width = "100%";
    contentContainer.style.height = "100%";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.justifyContent = "flex-end";
    contentContainer.style.alignItems = "center";
    contentContainer.style.zIndex = "15"; // Above panel image
    contentContainer.style.pointerEvents = "none"; // Allow clicks to pass through to buttons
    
    // Distance counter (center bottom - in the empty spot)
    const distanceContainer = document.createElement("div");
    distanceContainer.id = "finalDistance";
    distanceContainer.style.position = "absolute";
    distanceContainer.style.bottom = "80px"; // Lowered position in the empty spot
    distanceContainer.style.left = "50%";
    distanceContainer.style.transform = "translateX(-50%)";
    distanceContainer.style.color = "#ffffff";
    distanceContainer.style.fontSize = "32px";
    distanceContainer.style.fontWeight = "bold";
    distanceContainer.style.fontFamily = "'Press Start 2P', monospace";
    distanceContainer.style.textShadow = "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000";
    distanceContainer.style.zIndex = "20";
    distanceContainer.style.pointerEvents = "none"; // Don't block clicks
    distanceContainer.textContent = `${distance}m`;
    
    // Button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.position = "absolute";
    buttonContainer.style.bottom = "20px"; // Position at bottom of panel
    buttonContainer.style.left = "50%";
    buttonContainer.style.transform = "translateX(-50%)";
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "row";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.justifyContent = "center";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.zIndex = "20"; // Ensure buttons are above panel image
    buttonContainer.style.pointerEvents = "auto"; // Ensure buttons are clickable
    
    // Menu button (from pause menu)
    const menuBtn = document.createElement("button");
    menuBtn.id = "gameOverMenuBtn";
    menuBtn.style.background = "transparent";
    menuBtn.style.border = "none";
    menuBtn.style.padding = "0";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.display = "block";
    
    const menuImg = document.createElement("img");
    menuImg.src = this.menuButtonImage.src;
    menuImg.style.width = "auto";
    menuImg.style.height = "auto";
    menuImg.style.maxWidth = "min(200px, 30vw)";
    menuImg.style.maxHeight = "min(60px, 8vh)";
    menuImg.style.objectFit = "contain";
    menuImg.style.display = "block";
    menuBtn.appendChild(menuImg);
    
    menuBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });
    
    buttonContainer.appendChild(menuBtn);
    
    // Restart button
    const restartBtn = document.createElement("button");
    restartBtn.id = "gameOverRestartBtn";
    restartBtn.style.background = "transparent";
    restartBtn.style.border = "none";
    restartBtn.style.padding = "0";
    restartBtn.style.cursor = "pointer";
    restartBtn.style.display = "block";
    
    const restartImg = document.createElement("img");
    restartImg.src = this.restartButtonImage.src;
    restartImg.style.width = "auto";
    restartImg.style.height = "auto";
    restartImg.style.maxWidth = "min(200px, 30vw)";
    restartImg.style.maxHeight = "min(60px, 8vh)";
    restartImg.style.objectFit = "contain";
    restartImg.style.display = "block";
    restartBtn.appendChild(restartImg);
    
    restartBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.restart();
    });
    
    buttonContainer.appendChild(restartBtn);
    
    contentContainer.appendChild(distanceContainer);
    
    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(contentContainer);
    panelContainer.appendChild(buttonContainer); // Add button container directly to panelContainer so it's above everything
    
    // Create wrapper div
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);
    
    gameOverOverlay.appendChild(wrapper);
  }
  
  private updateSettingsPanel(): void {
    const settingsPanel = document.getElementById("settingsPanel");
    if (!settingsPanel) return;
    
    // Only update if all images are loaded
    if (!this.settingsPanelImage || !this.settingsPanelImage.complete) return;
    if (!this.onToggleImage || !this.onToggleImage.complete) return;
    if (!this.offToggleImage || !this.offToggleImage.complete) return;
    
    // Check if already updated
    if (settingsPanel.querySelector("img[src*='settings_panel']")) return;
    
    // Clear the entire settings panel structure and rebuild like pause panel
    settingsPanel.innerHTML = "";
    
    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "settingsBackdrop";
    backdrop.id = "settingsBackdrop";
    backdrop.addEventListener("click", () => {
      this.setSettingsOpen(false);
    });
    settingsPanel.appendChild(backdrop);
    
    // Create panel container (similar to pause panel)
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";
    
    // Add settings panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.settingsPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";
    
    // Create content container (positioned absolutely over the panel)
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "absolute";
    contentContainer.style.top = "50%";
    contentContainer.style.left = "50%";
    contentContainer.style.transform = "translate(-50%, -50%)";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.gap = "30px";
    contentContainer.style.alignItems = "center";
    contentContainer.style.width = "100%";
    contentContainer.style.paddingTop = "40px";
    
    // Create settings toggles
    const createToggleRow = (labelImage: HTMLImageElement | null, settingKey: keyof Settings) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.width = "80%";
      row.style.marginBottom = "10px";
      
      // Label (using image instead of text)
      const labelEl = document.createElement("label");
      labelEl.style.cursor = "pointer";
      labelEl.style.display = "flex";
      labelEl.style.alignItems = "center";
      
      if (labelImage) {
        const labelImg = document.createElement("img");
        labelImg.src = labelImage.src;
        labelImg.style.width = "auto";
        labelImg.style.height = "auto";
        labelImg.style.maxWidth = "min(120px, 20vw)";
        labelImg.style.maxHeight = "min(30px, 5vh)";
        labelImg.style.objectFit = "contain";
        labelImg.style.display = "block";
        labelEl.appendChild(labelImg);
      }
      
      // Toggle button (using sprite)
      const toggleBtn = document.createElement("button");
      toggleBtn.id = `toggle${settingKey.charAt(0).toUpperCase() + settingKey.slice(1)}`;
      toggleBtn.style.background = "transparent";
      toggleBtn.style.border = "none";
      toggleBtn.style.padding = "0";
      toggleBtn.style.cursor = "pointer";
      toggleBtn.style.display = "block";
      
      const toggleImg = document.createElement("img");
      const isActive = this.settings[settingKey];
      toggleImg.src = isActive ? this.onToggleImage!.src : this.offToggleImage!.src;
      toggleImg.style.width = "auto";
      toggleImg.style.height = "50px"; // Larger toggle
      toggleImg.style.objectFit = "contain";
      toggleImg.style.display = "block";
      toggleBtn.appendChild(toggleImg);
      
      // Update toggle on click
      toggleBtn.addEventListener("click", () => {
        this.triggerHaptic("light");
        (this.settings as any)[settingKey] = !this.settings[settingKey];
        this.saveSettings();
        this.applySettingsToUI();
        
        // Update toggle image
        const isActive = this.settings[settingKey];
        toggleImg.src = isActive ? this.onToggleImage!.src : this.offToggleImage!.src;
        
        if (settingKey === "fx") {
          this.audio.setFxEnabled(this.settings.fx);
        } else if (settingKey === "music") {
          this.audio.setMusicEnabled(this.settings.music);
          if (this.settings.music && this.state === "PLAYING") {
            this.audio.startMusic();
          } else if (!this.settings.music) {
            this.audio.stopMusic();
          }
        }
      });
      
      // Make label clickable
      labelEl.addEventListener("click", () => {
        toggleBtn.click();
      });
      
      row.appendChild(labelEl);
      row.appendChild(toggleBtn);
      return row;
    };
    
    contentContainer.appendChild(createToggleRow(this.musicLabelImage, "music"));
    contentContainer.appendChild(createToggleRow(this.sfxLabelImage, "fx"));
    contentContainer.appendChild(createToggleRow(this.hapticsLabelImage, "haptics"));
    
    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.id = "settingsCloseBtn";
    closeBtn.className = "settingsClose";
    closeBtn.textContent = "X";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "20px";
    closeBtn.style.right = "20px";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#ffffff";
    closeBtn.style.fontSize = "24px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.width = "40px";
    closeBtn.style.height = "40px";
    closeBtn.style.display = "flex";
    closeBtn.style.alignItems = "center";
    closeBtn.style.justifyContent = "center";
    closeBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.setSettingsOpen(false);
    });
    
    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(contentContainer);
    panelContainer.appendChild(closeBtn);
    
    // Create a wrapper div similar to pause overlay structure
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);
    
    settingsPanel.appendChild(wrapper);
    
    // Store references for applySettingsToUI
    this.toggleMusic = document.getElementById("toggleMusic") as HTMLElement;
    this.toggleFx = document.getElementById("toggleFx") as HTMLElement;
    this.toggleHaptics = document.getElementById("toggleHaptics") as HTMLElement;
    this.settingsCloseBtn = closeBtn;
    this.settingsBackdrop = backdrop;
  }
  
  private updateStartMenu(): void {
    const startOverlay = document.getElementById("startOverlay");
    if (!startOverlay) return;
    
    // Only update if all images are loaded
    if (!this.menuBgImage || !this.menuBgImage.complete) {
      console.log("[Menu] Waiting for bg image to load");
      return;
    }
    if (!this.titleImage || !this.titleImage.complete) {
      console.log("[Menu] Waiting for title image to load");
      return;
    }
    if (!this.startButtonImage || !this.startButtonImage.complete) {
      console.log("[Menu] Waiting for start button image to load");
      return;
    }
    if (!this.optionsButtonImage || !this.optionsButtonImage.complete) {
      console.log("[Menu] Waiting for options button image to load");
      return;
    }
    
    // Always update - clear existing content first
    startOverlay.innerHTML = "";
    
    // Remove overlay background so bg.png shows through
    startOverlay.style.background = "transparent";
    
    // Create background
    const bgImg = document.createElement("img");
    bgImg.src = this.menuBgImage.src;
    bgImg.style.position = "absolute";
    bgImg.style.top = "0";
    bgImg.style.left = "0";
    bgImg.style.width = "100%";
    bgImg.style.height = "100%";
    bgImg.style.objectFit = "cover";
    bgImg.style.zIndex = "0";
    startOverlay.appendChild(bgImg);
    
    // Create content container
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "relative";
    contentContainer.style.width = "100%";
    contentContainer.style.height = "100%";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.alignItems = "center";
    contentContainer.style.justifyContent = "center";
    contentContainer.style.gap = "40px";
    contentContainer.style.zIndex = "10";
    contentContainer.style.pointerEvents = "auto";
    
    // Create title with up/down animation
    const titleContainer = document.createElement("div");
    titleContainer.style.position = "relative";
    titleContainer.style.display = "flex";
    titleContainer.style.justifyContent = "center";
    titleContainer.style.alignItems = "center";
    
    const titleImg = document.createElement("img");
    titleImg.src = this.titleImage.src;
    titleImg.style.width = "auto";
    titleImg.style.height = "auto";
    titleImg.style.maxWidth = "min(900px, 95vw)";
    titleImg.style.maxHeight = "min(350px, 40vh)";
    titleImg.style.objectFit = "contain";
    titleImg.style.display = "block";
    titleImg.id = "menuTitle";
    titleImg.className = "menuTitle";
    titleImg.style.animation = "titleFloat 2.2s ease-in-out infinite";
    titleContainer.appendChild(titleImg);
    
    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "column";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.pointerEvents = "auto";
    buttonContainer.style.position = "relative";
    buttonContainer.style.zIndex = "10";
    
    // Start button with zoom animation
    const startBtn = document.createElement("button");
    startBtn.id = "playBtn";
    startBtn.className = "menuBtn primary";
    startBtn.style.background = "transparent";
    startBtn.style.border = "none";
    startBtn.style.padding = "0";
    startBtn.style.cursor = "pointer";
    startBtn.style.display = "block";
    startBtn.style.animation = "startPulse 1.3s ease-in-out infinite";
    startBtn.style.pointerEvents = "auto";
    startBtn.style.position = "relative";
    startBtn.style.zIndex = "10";
    
    const startImg = document.createElement("img");
    startImg.src = this.startButtonImage.src;
    startImg.style.width = "auto";
    startImg.style.height = "auto";
    startImg.style.maxWidth = "min(400px, 60vw)";
    startImg.style.maxHeight = "min(120px, 15vh)";
    startImg.style.objectFit = "contain";
    startImg.style.display = "block";
    startImg.style.visibility = "visible";
    startImg.style.opacity = "1";
    startImg.onerror = () => {
      console.error("[Menu] Failed to load start button image:", startImg.src);
    };
    startBtn.appendChild(startImg);
    
    // Re-attach event listener
    startBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.start();
    });
    
    buttonContainer.appendChild(startBtn);
    
    // Options button
    const optionsBtn = document.createElement("button");
    optionsBtn.id = "optionsBtn";
    optionsBtn.className = "menuBtn";
    optionsBtn.style.background = "transparent";
    optionsBtn.style.border = "none";
    optionsBtn.style.padding = "0";
    optionsBtn.style.cursor = "pointer";
    optionsBtn.style.display = "block";
    optionsBtn.style.pointerEvents = "auto";
    optionsBtn.style.position = "relative";
    optionsBtn.style.zIndex = "10";
    
    const optionsImg = document.createElement("img");
    optionsImg.src = this.optionsButtonImage.src;
    optionsImg.style.width = "auto";
    optionsImg.style.height = "auto";
    optionsImg.style.maxWidth = "min(350px, 55vw)";
    optionsImg.style.maxHeight = "min(100px, 12vh)";
    optionsImg.style.objectFit = "contain";
    optionsImg.style.display = "block";
    optionsImg.style.visibility = "visible";
    optionsImg.style.opacity = "1";
    optionsImg.onerror = () => {
      console.error("[Menu] Failed to load options button image:", optionsImg.src);
    };
    optionsBtn.appendChild(optionsImg);
    
    // Re-attach event listener
    optionsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.toggleSettings();
    });
    
    buttonContainer.appendChild(optionsBtn);
    
    contentContainer.appendChild(titleContainer);
    contentContainer.appendChild(buttonContainer);
    startOverlay.appendChild(contentContainer);
    
    // Ensure content container has pointer events and is visible
    contentContainer.style.pointerEvents = "auto";
    contentContainer.style.visibility = "visible";
    contentContainer.style.opacity = "1";
    
    // Ensure buttons and images are visible
    startBtn.style.visibility = "visible";
    startBtn.style.opacity = "1";
    optionsBtn.style.visibility = "visible";
    optionsBtn.style.opacity = "1";
    startImg.style.visibility = "visible";
    startImg.style.opacity = "1";
    optionsImg.style.visibility = "visible";
    optionsImg.style.opacity = "1";
    
    // Ensure button container is visible
    buttonContainer.style.visibility = "visible";
    buttonContainer.style.opacity = "1";
    
    console.log("[Menu] Menu updated - buttons created", {
      hasStartBtn: !!startBtn,
      hasOptionsBtn: !!optionsBtn,
      startBtnVisible: startBtn.style.display !== "none",
      optionsBtnVisible: optionsBtn.style.display !== "none",
      startImgSrc: startImg.src,
      optionsImgSrc: optionsImg.src,
      startImgComplete: startImg.complete,
      optionsImgComplete: optionsImg.complete,
      buttonContainerChildren: buttonContainer.children.length,
      contentContainerChildren: contentContainer.children.length
    });
  }
  
  private buildPatterns(): void {
    // Noise pattern
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const nctx = noiseCanvas.getContext("2d");
    if (nctx) {
      const imgData = nctx.createImageData(256, 256);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const v = Math.random() * 255;
        imgData.data[i] = v;
        imgData.data[i + 1] = v;
        imgData.data[i + 2] = v;
        imgData.data[i + 3] = 255;
      }
      nctx.putImageData(imgData, 0, 0);
      this.noisePattern = nctx.createPattern(noiseCanvas, "repeat");
    }

    // Egyptian hieroglyphic pattern
    const hieroCanvas = document.createElement("canvas");
    hieroCanvas.width = 64;
    hieroCanvas.height = 64;
    const hctx = hieroCanvas.getContext("2d");
    if (hctx) {
      hctx.fillStyle = "rgba(255, 220, 150, 0.15)"; // Golden hieroglyphic symbols
      hctx.strokeStyle = "rgba(255, 200, 100, 0.25)";
      hctx.lineWidth = 1.5;
      
      // Draw simple hieroglyphic-like symbols
      for (let y = 0; y < 64; y += 16) {
        for (let x = 0; x < 64; x += 16) {
          const symbol = (x + y * 4) % 4;
          hctx.save();
          hctx.translate(x + 8, y + 8);
          
          if (symbol === 0) {
            // Eye symbol
            hctx.beginPath();
            hctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            hctx.stroke();
            hctx.fillRect(-1, -1, 2, 2);
          } else if (symbol === 1) {
            // Ankh-like cross
            hctx.beginPath();
            hctx.moveTo(0, -4);
            hctx.lineTo(0, 4);
            hctx.moveTo(-3, 0);
            hctx.lineTo(3, 0);
            hctx.arc(0, -2, 2, 0, Math.PI);
            hctx.stroke();
          } else if (symbol === 2) {
            // Pyramid triangle
            hctx.beginPath();
            hctx.moveTo(0, -4);
            hctx.lineTo(-4, 4);
            hctx.lineTo(4, 4);
            hctx.closePath();
            hctx.stroke();
          } else {
            // Scarab circle
            hctx.beginPath();
            hctx.arc(0, 0, 3, 0, Math.PI * 2);
            hctx.stroke();
            hctx.fillRect(-1, -1, 2, 2);
          }
          
          hctx.restore();
        }
      }
      this.hieroglyphPattern = hctx.createPattern(hieroCanvas, "repeat");
    }

    // Wall pattern (simpler grid)
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = 100;
    wallCanvas.height = 100;
    const wctx = wallCanvas.getContext("2d");
    if (wctx) {
      wctx.strokeStyle = "rgba(255,200,100,0.20)"; // Golden pattern
      wctx.lineWidth = 1;
      for (let i = 0; i < 100; i += 8) {
        wctx.beginPath();
        wctx.moveTo(i, 0);
        wctx.lineTo(i, 100);
        wctx.stroke();
        wctx.beginPath();
        wctx.moveTo(0, i);
        wctx.lineTo(100, i);
        wctx.stroke();
      }
      this.wallPattern = wctx.createPattern(wallCanvas, "repeat");
    }
  }


  private wrapX(x: number): number {
    while (x < 0) x += CONFIG.MAZE_COLS;
    while (x >= CONFIG.MAZE_COLS) x -= CONFIG.MAZE_COLS;
    return x;
  }

  private getChunkIdForRow(rowY: number): number {
    if (this.chunkCache.has(rowY)) {
      return this.chunkCache.get(rowY)!;
    }
    // Determine chunk based on row position
    // Chunks are 8-14 rows tall, average ~10
    // Player spawn is at row 15, so rows above that are negative chunk IDs
    const chunkId = Math.floor((rowY - 15) / 10);
    this.chunkCache.set(rowY, chunkId);
    return chunkId;
  }

  private generateChunk(chunkId: number, startRow: number, height: number): void {
    // Use seeded random for consistency
    const rng = (seed: number) => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    let seed = this.globalSeed + chunkId * 1000;
    const random = () => rng(seed++);
    
    // Fixed width - no variation
    const effectiveWidth = CONFIG.MAX_WIDTH_COLS;
    
    // Calculate left and right margins to center the playable area
    const leftMargin = Math.floor((CONFIG.MAZE_COLS - effectiveWidth) / 2);
    const rightMargin = CONFIG.MAZE_COLS - leftMargin - effectiveWidth;
    const playableStart = leftMargin;
    const playableEnd = CONFIG.MAZE_COLS - rightMargin;
    
    // Store fixed width factor for rendering
    this.chunkWidthFactor.set(chunkId, 1.0);
    
    // Build grid for whole chunk first (local coordinates: 0 to height-1)
    type GridCell = "wall" | "dot" | "power" | "bounce" | "spike";
    const grid: GridCell[][] = [];
    for (let localY = 0; localY < height; localY++) {
      grid[localY] = [];
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        // Always walls on edges
        if (x === 0 || x === CONFIG.MAZE_COLS - 1) {
          grid[localY][x] = "wall";
        } else if (x < playableStart || x >= playableEnd) {
          // Margins are walls
          grid[localY][x] = "wall";
        } else {
          // Start with walls in playable area
          grid[localY][x] = "wall";
        }
      }
    }
    
    // Choose pattern: Pattern A (Rooms) for most chunks, Pattern C (Setpieces) every 3rd chunk
    const useSetpiece = (chunkId % 3 === 0);
    
    if (useSetpiece) {
      // Pattern C: Gates & Switchbacks
      this.generatePatternC(grid, height, playableStart, playableEnd, random);
    } else {
      // Pattern A: Carved Rooms + Connectors
      this.generatePatternA(grid, height, playableStart, playableEnd, random);
    }
    
    // Ensure connectivity: BFS flood fill from bottom entry
    this.ensureConnectivity(grid, height, playableStart, playableEnd);
    
    // Ensure no vertical gap larger than 5 cells (generation-level constraint)
    this.ensureMaxVerticalGap(grid, height, playableStart, playableEnd);
    
    // Re-ensure connectivity after gap enforcement (in case we broke paths)
    this.ensureConnectivity(grid, height, playableStart, playableEnd);
    
    // Add coins and power-ups in rooms/pockets
    this.addCollectibles(grid, height, playableStart, playableEnd, random);
    
    // Convert grid to rows and store
    for (let localY = 0; localY < height; localY++) {
      const ry = startRow + localY;
      const row: TileType[] = new Array(CONFIG.MAZE_COLS);
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        const cell = grid[localY][x];
        if (cell === "power" || cell === "bounce") {
          row[x] = "power";
        } else if (cell === "spike") {
          row[x] = "wall"; // Spikes are walls for collision
        } else {
          row[x] = cell;
        }
      }
      this.rows.set(ry, row);
      
      // Store spine X (center of playable area for reference)
      const spineX = Math.floor(playableStart + (playableEnd - playableStart) / 2);
      this.spineXByRow.set(ry, spineX);
    }
  }
  
  // Pattern A: Horizontal corridors with vertical connections
  private generatePatternA(grid: ("wall" | "dot" | "power" | "bounce" | "spike")[][], height: number, playableStart: number, playableEnd: number, random: () => number): void {
    const playableWidth = playableEnd - playableStart;
    const playableCenter = playableStart + Math.floor(playableWidth / 2);
    
    // Create horizontal corridors every 2-3 rows for left/right/center movement
    for (let y = 0; y < height; y++) {
      // Every row gets horizontal movement options
      const corridorType = Math.floor(random() * 3);
      
      if (corridorType === 0) {
        // Full horizontal corridor (left to right)
        for (let x = playableStart; x < playableEnd; x++) {
          grid[y][x] = "dot";
        }
      } else if (corridorType === 1) {
        // Left and center corridor
        for (let x = playableStart; x <= playableCenter + 1; x++) {
          grid[y][x] = "dot";
        }
        // Add right connection sometimes
        if (random() < 0.5 && playableCenter + 2 < playableEnd) {
          grid[y][playableCenter + 2] = "dot";
          if (playableCenter + 3 < playableEnd) grid[y][playableCenter + 3] = "dot";
        }
      } else {
        // Center and right corridor
        for (let x = playableCenter - 1; x < playableEnd; x++) {
          grid[y][x] = "dot";
        }
        // Add left connection sometimes
        if (random() < 0.5 && playableCenter - 2 >= playableStart) {
          grid[y][playableCenter - 2] = "dot";
          if (playableCenter - 3 >= playableStart) grid[y][playableCenter - 3] = "dot";
        }
      }
      
      // Add vertical connections to ensure upward movement
      // Create vertical paths at left, center, and right
      const leftPathX = playableStart + Math.floor(playableWidth * 0.25);
      const rightPathX = playableStart + Math.floor(playableWidth * 0.75);
      
      // Always ensure vertical connectivity
      grid[y][playableCenter] = "dot"; // Center path always open
      if (y > 0) {
        // Connect to previous row
        if (grid[y - 1][playableCenter] === "dot") {
          grid[y][playableCenter] = "dot";
        }
        // Also connect left and right paths
        if (grid[y - 1][leftPathX] === "dot") {
          grid[y][leftPathX] = "dot";
        }
        if (grid[y - 1][rightPathX] === "dot") {
          grid[y][rightPathX] = "dot";
        }
      }
      
      // Add some vertical paths randomly
      if (random() < 0.4) {
        grid[y][leftPathX] = "dot";
      }
      if (random() < 0.4) {
        grid[y][rightPathX] = "dot";
      }
    }
    
    // Add some rooms/pockets for variety
    for (let i = 0; i < 2; i++) {
      const roomY = 1 + Math.floor(random() * (height - 3));
      const roomX = playableStart + 1 + Math.floor(random() * (playableWidth - 4));
      const roomW = 2 + Math.floor(random() * 3);
      const roomH = 1 + Math.floor(random() * 2);
      
      for (let dy = 0; dy < roomH && roomY + dy < height; dy++) {
        for (let dx = 0; dx < roomW && roomX + dx < playableEnd; dx++) {
          grid[roomY + dy][roomX + dx] = "dot";
        }
      }
    }
  }
  
  // Pattern C: Gates & Switchbacks (with horizontal movement)
  private generatePatternC(grid: ("wall" | "dot" | "power" | "bounce" | "spike")[][], height: number, playableStart: number, playableEnd: number, random: () => number): void {
    const playableCenter = playableStart + Math.floor((playableEnd - playableStart) / 2);
    const setpieceType = Math.floor(random() * 3);
    
    if (setpieceType === 0) {
      // Switchbacks: alternating horizontal corridors with vertical connections
      for (let y = 0; y < height; y++) {
        const isHorizontal = (y % 4 < 2); // 2 rows horizontal, 2 rows vertical
        if (isHorizontal) {
          // Full horizontal corridor for left/right movement
          for (let x = playableStart; x < playableEnd; x++) {
            grid[y][x] = "dot";
          }
        } else {
          // Vertical drops: ensure center path and connections
          grid[y][playableCenter] = "dot";
          if (playableCenter > playableStart) grid[y][playableCenter - 1] = "dot";
          if (playableCenter < playableEnd - 1) grid[y][playableCenter + 1] = "dot";
          // Also add left and right vertical paths
          const leftX = playableStart + Math.floor((playableEnd - playableStart) * 0.25);
          const rightX = playableStart + Math.floor((playableEnd - playableStart) * 0.75);
          grid[y][leftX] = "dot";
          grid[y][rightX] = "dot";
        }
      }
    } else if (setpieceType === 1) {
      // Gate rows: mostly walls with 2-3 openings, but ensure horizontal movement
      for (let y = 0; y < height; y++) {
        const numGates = 2 + Math.floor(random() * 2); // 2-3 gates
        const gateWidth = 2;
        const gateSpacing = Math.floor((playableEnd - playableStart) / (numGates + 1));
        
        for (let g = 0; g < numGates; g++) {
          const gateX = playableStart + gateSpacing * (g + 1) + Math.floor(random() * 3 - 1);
          for (let dx = 0; dx < gateWidth; dx++) {
            if (gateX + dx >= playableStart && gateX + dx < playableEnd) {
              grid[y][gateX + dx] = "dot";
            }
          }
        }
        
        // Always ensure center path for vertical movement
        grid[y][playableCenter] = "dot";
        if (playableCenter > playableStart) grid[y][playableCenter - 1] = "dot";
        if (playableCenter < playableEnd - 1) grid[y][playableCenter + 1] = "dot";
      }
    } else {
      // Zigzag: diagonal movement with horizontal corridors
      let currentX = playableCenter;
      for (let y = 0; y < height; y++) {
        // Carve horizontal corridor at current position
        for (let dx = -2; dx <= 2; dx++) {
          const x = currentX + dx;
          if (x >= playableStart && x < playableEnd) {
            grid[y][x] = "dot";
          }
        }
        
        // Move diagonally for next row
        if (y < height - 1) {
          if (random() < 0.5 && currentX > playableStart + 2) {
            currentX -= 1;
          } else if (currentX < playableEnd - 2) {
            currentX += 1;
          }
        }
        
        // Always ensure center vertical path
        grid[y][playableCenter] = "dot";
      }
    }
  }
  
  // Ensure connectivity: always ensure vertical paths (can go up) and horizontal paths (left/right/center)
  private ensureConnectivity(grid: ("wall" | "dot" | "power" | "bounce" | "spike")[][], height: number, playableStart: number, playableEnd: number): void {
    const playableCenter = playableStart + Math.floor((playableEnd - playableStart) / 2);
    
    // Helper: check if a cell is traversable (not a wall)
    const isTraversable = (y: number, x: number): boolean => {
      if (y < 0 || y >= height || x < playableStart || x >= playableEnd) return false;
      const cell = grid[y][x];
      return cell === "dot" || cell === "power" || cell === "bounce" || cell === "spike";
    };
    
    // CRITICAL: Ensure vertical connectivity - always can go up
    // Create vertical paths at left, center, and right
    const leftPathX = playableStart + Math.floor((playableEnd - playableStart) * 0.25);
    const rightPathX = playableStart + Math.floor((playableEnd - playableStart) * 0.75);
    
    // Center path always connects bottom to top
    for (let y = 0; y < height; y++) {
      grid[y][playableCenter] = "dot";
      if (playableCenter > playableStart) grid[y][playableCenter - 1] = "dot";
      if (playableCenter < playableEnd - 1) grid[y][playableCenter + 1] = "dot";
    }
    
    // Ensure every row has horizontal movement (left/right/center)
    for (let y = 0; y < height; y++) {
      // Check if row has horizontal connectivity
      let hasHorizontalPath = false;
      for (let x = playableStart; x < playableEnd - 1; x++) {
        if (isTraversable(y, x) && isTraversable(y, x + 1)) {
          hasHorizontalPath = true;
          break;
        }
      }
      
      // If no horizontal path, create one
      if (!hasHorizontalPath) {
        // Create horizontal corridor connecting left, center, and right
        for (let x = playableStart; x < playableEnd; x++) {
          grid[y][x] = "dot";
        }
      }
    }
    
    // Ensure bottom row has at least one entry point
    let hasBottomEntry = false;
    for (let x = playableStart; x < playableEnd; x++) {
      if (isTraversable(0, x)) {
        hasBottomEntry = true;
        break;
      }
    }
    
    if (!hasBottomEntry) {
      // Create entry point at center
      grid[0][playableCenter] = "dot";
      if (playableCenter > playableStart) grid[0][playableCenter - 1] = "dot";
      if (playableCenter < playableEnd - 1) grid[0][playableCenter + 1] = "dot";
    }
    
    // BFS to verify connectivity from bottom to top (checking all traversable cells)
    let entryX = playableCenter;
    for (let x = playableStart; x < playableEnd; x++) {
      if (isTraversable(0, x)) {
        entryX = x;
        break;
      }
    }
    
    const visited = new Set<string>();
    const queue: Array<[number, number]> = [[0, entryX]];
    visited.add(`0,${entryX}`);
    
    while (queue.length > 0) {
      const [y, x] = queue.shift()!;
      
      const neighbors = [
        [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]
      ];
      
      for (const [ny, nx] of neighbors) {
        if (ny >= 0 && ny < height && nx >= playableStart && nx < playableEnd) {
          const key = `${ny},${nx}`;
          if (!visited.has(key) && isTraversable(ny, nx)) {
            visited.add(key);
            queue.push([ny, nx]);
          }
        }
      }
    }
    
    // If top not reachable, ensure vertical tunnel
    let topReachable = false;
    for (let x = playableStart; x < playableEnd; x++) {
      if (visited.has(`${height - 1},${x}`)) {
        topReachable = true;
        break;
      }
    }
    
    if (!topReachable) {
      // Carve vertical tunnel at center (guaranteed path)
      for (let y = 0; y < height; y++) {
        grid[y][playableCenter] = "dot";
        if (playableCenter > playableStart) grid[y][playableCenter - 1] = "dot";
        if (playableCenter < playableEnd - 1) grid[y][playableCenter + 1] = "dot";
      }
      
      // Also ensure top row has exit
      for (let x = playableStart; x < playableEnd; x++) {
        if (x >= playableCenter - 1 && x <= playableCenter + 1) {
          grid[height - 1][x] = "dot";
        }
      }
    }
    
    // Final verification: ensure there's always a path from bottom to top
    // Re-run BFS after fixes
    const finalVisited = new Set<string>();
    const finalQueue: Array<[number, number]> = [];
    
    // Find all bottom entry points
    for (let x = playableStart; x < playableEnd; x++) {
      if (isTraversable(0, x)) {
        finalQueue.push([0, x]);
        finalVisited.add(`0,${x}`);
      }
    }
    
    // BFS from all bottom entries
    while (finalQueue.length > 0) {
      const [y, x] = finalQueue.shift()!;
      
      const neighbors = [
        [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]
      ];
      
      for (const [ny, nx] of neighbors) {
        if (ny >= 0 && ny < height && nx >= playableStart && nx < playableEnd) {
          const key = `${ny},${nx}`;
          if (!finalVisited.has(key) && isTraversable(ny, nx)) {
            finalVisited.add(key);
            finalQueue.push([ny, nx]);
          }
        }
      }
    }
    
    // If still not connected, force a complete vertical path
    let finalTopReachable = false;
    for (let x = playableStart; x < playableEnd; x++) {
      if (finalVisited.has(`${height - 1},${x}`)) {
        finalTopReachable = true;
        break;
      }
    }
    
    if (!finalTopReachable) {
      // Last resort: create a guaranteed vertical path
      for (let y = 0; y < height; y++) {
        for (let x = playableStart; x < playableEnd; x++) {
          if (x >= playableCenter - 1 && x <= playableCenter + 1) {
            grid[y][x] = "dot";
          }
        }
      }
    }
  }
  
  // Ensure no vertical gap larger than 5 cells (generation-level constraint)
  private ensureMaxVerticalGap(grid: ("wall" | "dot" | "power" | "bounce" | "spike")[][], height: number, playableStart: number, playableEnd: number): void {
    const MAX_GAP = 5; // Maximum vertical gap between platforms
    
    // Helper: check if a cell is traversable
    const isTraversable = (y: number, x: number): boolean => {
      if (y < 0 || y >= height || x < playableStart || x >= playableEnd) return false;
      const cell = grid[y][x];
      return cell === "dot" || cell === "power" || cell === "bounce" || cell === "spike";
    };
    
    // Check each column for gaps larger than MAX_GAP
    for (let x = playableStart; x < playableEnd; x++) {
      let lastWallY = -1;
      
      // Scan from bottom to top
      for (let y = 0; y < height; y++) {
        if (grid[y][x] === "wall") {
          lastWallY = y;
        } else {
          // Check if gap is too large
          if (lastWallY >= 0 && y - lastWallY > MAX_GAP) {
            // Need to place a wall to break this gap
            // Place it at MAX_GAP distance from last wall
            const wallY = lastWallY + MAX_GAP;
            if (wallY < height) {
              // Before placing wall, ensure at least one adjacent column has an open path
              // This keeps the maze solvable
              let canPlaceWall = false;
              
              // Check if at least one adjacent column (left or right) is open at this Y
              if (x > playableStart && isTraversable(wallY, x - 1)) {
                canPlaceWall = true;
              } else if (x < playableEnd - 1 && isTraversable(wallY, x + 1)) {
                canPlaceWall = true;
              } else {
                // Check if there's any open path in a 3-column range
                for (let checkX = Math.max(playableStart, x - 1); checkX <= Math.min(playableEnd - 1, x + 1); checkX++) {
                  if (isTraversable(wallY, checkX)) {
                    canPlaceWall = true;
                    break;
                  }
                }
              }
              
              if (canPlaceWall) {
                grid[wallY][x] = "wall";
                lastWallY = wallY;
              } else {
                // Can't place wall safely, but we need to break the gap
                // Place wall anyway but ensure adjacent columns are open
                grid[wallY][x] = "wall";
                // Ensure left or right is open
                if (x > playableStart) {
                  grid[wallY][x - 1] = "dot";
                }
                if (x < playableEnd - 1) {
                  grid[wallY][x + 1] = "dot";
                }
                lastWallY = wallY;
              }
            }
          }
        }
      }
      
      // Also check from top down to catch gaps from the top
      let lastWallFromTop = height;
      for (let y = height - 1; y >= 0; y--) {
        if (grid[y][x] === "wall") {
          lastWallFromTop = y;
        } else {
          // Check if gap is too large from top
          if (lastWallFromTop < height && lastWallFromTop - y > MAX_GAP) {
            const wallY = lastWallFromTop - MAX_GAP;
            if (wallY >= 0) {
              // Similar logic: ensure path remains open
              let canPlaceWall = false;
              if (x > playableStart && isTraversable(wallY, x - 1)) {
                canPlaceWall = true;
              } else if (x < playableEnd - 1 && isTraversable(wallY, x + 1)) {
                canPlaceWall = true;
              }
              
              if (canPlaceWall) {
                grid[wallY][x] = "wall";
                lastWallFromTop = wallY;
              } else {
                grid[wallY][x] = "wall";
                if (x > playableStart) grid[wallY][x - 1] = "dot";
                if (x < playableEnd - 1) grid[wallY][x + 1] = "dot";
                lastWallFromTop = wallY;
              }
            }
          }
        }
      }
    }
  }

  // Add collectibles in rooms/pockets
  private addCollectibles(grid: ("wall" | "dot" | "power" | "bounce" | "spike")[][], height: number, playableStart: number, playableEnd: number, random: () => number): void {
    // Add coins in open areas
    for (let y = 0; y < height; y++) {
      for (let x = playableStart; x < playableEnd; x++) {
        if (grid[y][x] === "dot" && random() < 0.15) {
          grid[y][x] = "power";
        }
      }
    }
  }

  private ensureRow(rowY: number): TileType[] {
    if (this.rows.has(rowY)) {
      return this.rows.get(rowY)!;
    }

    // Bottom boundary (row 16 and below)
    if (rowY >= 16) {
      const row: TileType[] = new Array(CONFIG.MAZE_COLS);
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        row[x] = "wall";
      }
      this.rows.set(rowY, row);
      return row;
    }

    // Generate chunk if needed
    const chunkId = this.getChunkIdForRow(rowY);
    // Calculate chunk start row - ensure it's correct for negative chunk IDs
    const chunkStartRow = chunkId * 10 + 15;
    const chunkHeight = 8 + (Math.abs(chunkId) % 7); // 8-14 rows per chunk
    
    // Ensure we don't generate rows that are already boundaries
    if (chunkStartRow >= 16) {
      // This chunk is in the boundary area, just return boundary row
      const row: TileType[] = new Array(CONFIG.MAZE_COLS);
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        row[x] = "wall";
      }
      this.rows.set(rowY, row);
      return row;
    }
    
    // Generate the entire chunk
    this.generateChunk(chunkId, chunkStartRow, chunkHeight);

    // Get the row - it should exist now after generateChunk
    const row = this.rows.get(rowY);
    if (!row) {
      // Fallback: create a simple open row if generation failed
      const fallbackRow: TileType[] = new Array(CONFIG.MAZE_COLS);
      fallbackRow[0] = "wall";
      fallbackRow[CONFIG.MAZE_COLS - 1] = "wall";
      for (let x = 1; x < CONFIG.MAZE_COLS - 1; x++) {
        fallbackRow[x] = "dot";
      }
      this.rows.set(rowY, fallbackRow);
      return fallbackRow;
    }
    
    return row;
  }

  private getTileType(tileX: number, tileY: number): TileType {
    const row = this.ensureRow(tileY);
    return row[this.wrapX(tileX)] ?? "wall";
  }

  private setTileType(tileX: number, tileY: number, next: TileType): void {
    const row = this.ensureRow(tileY);
    row[this.wrapX(tileX)] = next;
  }

  private canMove(tileX: number, tileY: number, dir: Direction): boolean {
    let nextX = tileX;
    let nextY = tileY;

    if (dir === "up") nextY--;
    else if (dir === "down") nextY++;
    else if (dir === "left") nextX--;
    else if (dir === "right") nextX++;

    // Check for side walls outside normal range (columns -2, -1, >= MAZE_COLS + 1)
    // These are always walls (but allow wrapping for -1 and MAZE_COLS)
    if (nextX < -1 || nextX > CONFIG.MAZE_COLS) {
      return false;
    }
    
    // Handle wrapping for normal playable area
    // Wrap -1 to MAZE_COLS - 1, and MAZE_COLS to 0
    if (nextX === -1) nextX = CONFIG.MAZE_COLS - 1;
    else if (nextX === CONFIG.MAZE_COLS) nextX = 0;
    else if (nextX < 0) nextX = CONFIG.MAZE_COLS - 1;
    else if (nextX >= CONFIG.MAZE_COLS) nextX = 0;

    const t = this.getTileType(nextX, nextY);
    return t !== "wall";
  }

  private calculateDashEnd(tileX: number, tileY: number, dir: Direction): DashEnd {
    let currentTileX = tileX;
    let currentTileY = tileY;
    let endTileX = tileX;
    let endTileY = tileY;

    let hitWall = false;
    
    while (this.canMove(currentTileX, currentTileY, dir)) {
      let nextTileX = currentTileX;
      let nextTileY = currentTileY;
      
      if (dir === "up") {
        nextTileY--;
      } else if (dir === "down") {
        nextTileY++;
      } else if (dir === "left") {
        nextTileX--;
        if (nextTileX < 0) nextTileX = CONFIG.MAZE_COLS - 1;
      } else if (dir === "right") {
        nextTileX++;
        if (nextTileX >= CONFIG.MAZE_COLS) nextTileX = 0;
      }

      // Safety check: prevent going to invalid rows
      if (nextTileY < -1000 || nextTileY > 1000) {
        console.log("[DashBroGame] calculateDashEnd: Invalid tileY, stopping dash");
        hitWall = true;
        break;
      }

      const nextType = this.getTileType(nextTileX, nextTileY);
      if (nextType === "wall") {
        hitWall = true;
        break;
      }

      endTileX = nextTileX;
      endTileY = nextTileY;
      currentTileX = nextTileX;
      currentTileY = nextTileY;
    }

    if (this.getTileType(endTileX, endTileY) === "wall") {
      endTileX = tileX;
      endTileY = tileY;
    }

    const tileSize = CONFIG.TILE_SIZE;
    const spacing = CONFIG.TILE_SPACING;
    
    // Ensure tileX is wrapped to valid range before calculating pixel position
    const wrappedTileX = this.wrapX(endTileX);
    
    return {
      tileX: wrappedTileX,
      tileY: endTileY,
      x: Math.round(wrappedTileX * (tileSize + spacing) + tileSize / 2),
      y: Math.round(endTileY * (tileSize + spacing) + tileSize / 2),
      hitWall,
    };
  }

  private ensureRowsForView(): void {
    const tileSize = CONFIG.TILE_SIZE;
    const zoom = CONFIG.ZOOM;
    const viewY0 = this.cameraY;
    const viewY1 = viewY0 + this.viewH() / zoom;
    const row0 = Math.floor(viewY0 / tileSize) - 5;
    const row1 = Math.floor(viewY1 / tileSize) + 5;

    for (let ry = row0; ry <= row1; ry++) {
      this.ensureRow(ry);
    }

    this.minRowCached = Math.min(this.minRowCached, row0);
    this.maxRowCached = Math.max(this.maxRowCached, row1);
  }

  private updateCamera(): void {
    const zoom = CONFIG.ZOOM;
    // Viewport dimensions in world coordinates (after zoom is applied)
    const viewW = this.viewW() / zoom;
    const viewH = this.viewH() / zoom;
    
    // Always center the player in the view (camera position is in world coordinates)
    const targetCameraX = this.playerX - viewW * 0.5;
    const targetCameraY = this.playerY - viewH * 0.5;
    
    // Smooth interpolation for camera movement
    const cameraLerp = 0.15;
    
    // Update camera to center player
    this.cameraX += (targetCameraX - this.cameraX) * cameraLerp;
    this.cameraY += (targetCameraY - this.cameraY) * cameraLerp;
  }

  private updateWater(dt: number): void {
    this.waterSurfaceY -= CONFIG.WATER_RISE_PX_PER_S * dt;

    const timeS = performance.now() * 0.001;
    const localSurfaceY = sandDuneY(this.waterSurfaceY, this.playerX, timeS);
    const r = CONFIG.PLAYER_BODY * 0.55 + CONFIG.WATER_SURFACE_PADDING_PX;
    if (this.playerY + r >= localSurfaceY && this.state === "PLAYING") {
      // Start death animation
      this.state = "DYING";
      this.deathTimer = 0;
      this.audio.click("death");
      this.triggerHaptic("error");
      
      // Spawn death particles
      this.spawnDeathParticles(this.playerX, this.playerY);
    }
  }

  private updatePlayer(dt: number): void {
    const tileSize = CONFIG.TILE_SIZE;

    // Only generate trail when moving
    if (this.isMoving || this.dashFlash) {
      this.trailTimer += dt;
      if (this.trailTimer >= CONFIG.TRAIL_INTERVAL) {
        this.trailTimer = 0;
        
        // Calculate trail start position from player's back (opposite of direction)
        let backOffsetX = 0;
        let backOffsetY = 0;
        const backOffset = CONFIG.PLAYER_BODY * 0.4; // Offset from center to back
        if (this.playerDirection === "right") {
          backOffsetX = -backOffset;
        } else if (this.playerDirection === "left") {
          backOffsetX = backOffset;
        } else if (this.playerDirection === "up") {
          backOffsetY = backOffset;
        } else if (this.playerDirection === "down") {
          backOffsetY = -backOffset;
        }
        
        this.trail.push({
          x: this.playerX + backOffsetX,
          y: this.playerY + backOffsetY,
          z: 0,
          alpha: 1.0,
          size: Math.max(8, Math.floor(CONFIG.PLAYER_BODY * 0.55)),
        });

        if (this.trail.length > CONFIG.TRAIL_COUNT) {
          this.trail.shift();
        }
      }
    } else {
      // Clear trail when not moving
      this.trail = [];
    }

    // Fade trail points over time
    const fadeRate = dt / CONFIG.TRAIL_DURATION;
    for (const point of this.trail) {
      point.alpha -= fadeRate;
      point.size *= 0.995; // Slower size decay for longer trail
    }
    this.trail = this.trail.filter((p) => p.alpha > 0.01);

    // Update screen shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
    this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
    
    // Update wall hit bounce
    if (this.wallHitBounce > 0) {
      this.wallHitBounce = Math.max(0, this.wallHitBounce - dt / CONFIG.WALL_HIT_BOUNCE_DURATION);
    }
    
    if (this.dashFlash) {
      this.dashFlash.elapsed += dt;
      this.dashFlash.progress = Math.min(1, this.dashFlash.elapsed / this.dashFlash.duration);
      
      // Smoothly lerp player position during dash
      let targetX = this.dashFlash.endX;
      let targetY = this.dashFlash.endY;
      
      if (this.dashFlash.hitWall) {
        const spacing = CONFIG.TILE_SPACING;
        const cellLeft = this.playerTileX * (tileSize + spacing);
        const cellRight = (this.playerTileX + 1) * (tileSize + spacing);
        const cellTop = this.playerTileY * (tileSize + spacing);
        const cellBottom = (this.playerTileY + 1) * (tileSize + spacing);
        
        if (this.playerDirection === "right") {
          targetX = cellRight;
        } else if (this.playerDirection === "left") {
          targetX = cellLeft;
        } else if (this.playerDirection === "down") {
          targetY = cellBottom;
        } else if (this.playerDirection === "up") {
          targetY = cellTop;
        }
        
        // Trigger wall hit effects
        if (this.dashFlash.progress >= 0.95 && this.wallHitBounce === 0) {
          this.shakeIntensity = CONFIG.WALL_HIT_SHAKE;
          this.wallHitBounce = 1.0;
          this.wallHitDirection = this.playerDirection;
          this.triggerHaptic("heavy");
        }
      }
      
      // Mummy cloth pull effect: start slow (cloth extends), then accelerate (being pulled)
      // Use ease-in for pulling effect - starts slow then speeds up
      let easedProgress: number;
      
      if (this.dashFlash.progress < 0.3) {
        // First 30%: cloth extends forward (slow movement)
        const throwPhase = this.dashFlash.progress / 0.3;
        easedProgress = throwPhase * throwPhase * 0.2; // Slow extension
      } else {
        // Remaining 70%: player gets pulled by cloth (accelerating)
        const pullPhase = (this.dashFlash.progress - 0.3) / 0.7;
        const pullEase = pullPhase * pullPhase * pullPhase; // Cubic ease-in for acceleration
        easedProgress = 0.2 + pullEase * 0.8; // From 20% to 100%
      }
      
      // Add bounce effect when hitting wall
      if (this.dashFlash.hitWall && this.dashFlash.progress > 0.8) {
        const bouncePhase = (this.dashFlash.progress - 0.8) / 0.2;
        const bounceAmount = Math.sin(bouncePhase * Math.PI) * 0.15;
        easedProgress = Math.min(1, easedProgress + bounceAmount);
      }
      
      this.playerX = this.dashFlash.startX + (targetX - this.dashFlash.startX) * easedProgress;
      this.playerY = this.dashFlash.startY + (targetY - this.dashFlash.startY) * easedProgress;
      
      if (this.dashFlash.progress >= 1) {
        // Snap to final position when complete
        this.playerX = targetX;
        this.playerY = targetY;
        
        // Spawn landing particles
        this.spawnLandingParticles(this.playerX, this.playerY);
        
        this.dashFlash = null;
        this.isMoving = false;
      } else {
        // Spawn dash particles during dash
        if (Math.random() < 0.3) { // 30% chance per frame
          this.spawnDashParticles(this.playerX, this.playerY, this.playerDirection);
        }
      }
    }

    const spacing = CONFIG.TILE_SPACING;
    const centerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    const centerY = this.playerTileY * (tileSize + spacing) + tileSize / 2;
    const distToCenter = Math.sqrt((this.playerX - centerX) ** 2 + (this.playerY - centerY) ** 2);
    const isStopped = !this.isMoving && !this.dashFlash && distToCenter < 2;

    if (isStopped && this.nextDirection && this.nextDirection !== this.playerDirection) {
      if (this.canMove(this.playerTileX, this.playerTileY, this.nextDirection)) {
        const dashEnd = this.calculateDashEnd(this.playerTileX, this.playerTileY, this.nextDirection);
        
        // Calculate cloth start position (from player's back, opposite of direction)
        let clothOffsetX = 0;
        let clothOffsetY = 0;
        if (this.nextDirection === "right") {
          clothOffsetX = -CONFIG.PLAYER_BODY * 0.4; // Back of player
        } else if (this.nextDirection === "left") {
          clothOffsetX = CONFIG.PLAYER_BODY * 0.4;
        } else if (this.nextDirection === "down") {
          clothOffsetY = -CONFIG.PLAYER_BODY * 0.4;
        } else if (this.nextDirection === "up") {
          clothOffsetY = CONFIG.PLAYER_BODY * 0.4;
        }
        
        this.dashFlash = {
          startX: this.playerX,
          startY: this.playerY,
          endX: dashEnd.x,
          endY: dashEnd.y,
          progress: 0,
          duration: CONFIG.DASH_FLASH_DURATION,
          elapsed: 0,
          hitWall: dashEnd.hitWall,
          clothStartX: this.playerX + clothOffsetX,
          clothStartY: this.playerY + clothOffsetY,
        };

        // Play swoosh sound for dash
        this.audio.playSwooshSound();

        this.playerDirection = this.nextDirection;
        this.playerTileX = dashEnd.tileX;
        this.playerTileY = dashEnd.tileY;
        this.playerX = dashEnd.x;
        this.playerY = dashEnd.y;
        this.isMoving = true;
        
        // Spawn initial dash particles
        this.spawnDashParticles(this.playerX, this.playerY, this.nextDirection);

        const originalTileX = Math.floor(this.dashFlash.startX / tileSize);
        const originalTileY = Math.floor(this.dashFlash.startY / tileSize);
        
        let origX = originalTileX;
        if (origX < 0) origX = CONFIG.MAZE_COLS - 1;
        if (origX >= CONFIG.MAZE_COLS) origX = 0;

        const dir = this.nextDirection;
        let currentX = origX;
        let currentY = originalTileY;
        
        const endX = dashEnd.tileX;
        const endY = dashEnd.tileY;
        
        while (currentX !== endX || currentY !== endY) {
          const t = this.getTileType(currentX, currentY);
          if (t === "dot") {
            this.score += 10;
            this.setTileType(currentX, currentY, "empty");
            this.audio.click("dot");
            this.triggerHaptic("light");
          } else if (t === "power") {
            this.score += 50;
            this.setTileType(currentX, currentY, "empty");
            this.audio.click("power");
            this.triggerHaptic("medium");
          }

          if (dir === "up") currentY--;
          else if (dir === "down") currentY++;
          else if (dir === "left") {
            currentX--;
            if (currentX < 0) currentX = CONFIG.MAZE_COLS - 1;
          } else if (dir === "right") {
            currentX++;
            if (currentX >= CONFIG.MAZE_COLS) currentX = 0;
          }
        }
      }
      this.nextDirection = null;
    }
  }

  private update(dt: number): void {
    if (this.state === "DYING") {
      this.updateDeathAnimation(dt);
      this.updateParticles(dt);
      this.updateCamera();
      return;
    }
    
    if (this.state !== "PLAYING") return;

    this.ensureRowsForView();
    this.updateWater(dt); // Rising sand dunes
    this.updatePlayer(dt);
    this.updateParticles(dt);
    
    this.updateCamera();
  }

  private resetGame(): void {
    this.rows.clear();
    this.spineXByRow.clear();
    this.minRowCached = 0;
    this.maxRowCached = 0;
    this.globalSeed = (Math.random() * 1e9) | 0;

    // Ensure player spawns above a platform (on top of it)
    const tileSize = CONFIG.TILE_SIZE;
    // Spawn on the spawn row, which should be on top of a platform
    this.playerTileY = this.playerSpawnY;
    
    // Find an open tile in the spawn row that has a wall below it (platform)
    const spawnRow = this.ensureRow(this.playerTileY);
    const platformRow = this.ensureRow(this.playerSpawnY + 1); // Row below (the platform)
    let spawnX = this.playerSpawnX;
    let attempts = 0;
    
    // Find a position where there's a platform below (wall) and open space on top (dot)
    while (attempts < CONFIG.MAZE_COLS * 2) {
      const wrappedX = this.wrapX(spawnX);
      // Check if there's a platform below and open space on top
      if (spawnRow[wrappedX] === "dot" && platformRow[wrappedX] === "wall") {
        break; // Found good spawn position
      }
      spawnX++;
      attempts++;
    }
    
    // If not found, try going left
    if (attempts >= CONFIG.MAZE_COLS * 2 || spawnRow[this.wrapX(spawnX)] !== "dot" || platformRow[this.wrapX(spawnX)] !== "wall") {
      spawnX = this.playerSpawnX;
      attempts = 0;
      while (attempts < CONFIG.MAZE_COLS * 2) {
        const wrappedX = this.wrapX(spawnX);
        if (spawnRow[wrappedX] === "dot" && platformRow[wrappedX] === "wall") {
          break;
        }
        spawnX--;
        attempts++;
      }
    }
    
    // If still not found, force a platform below and open space on top at center
    if (spawnRow[this.wrapX(spawnX)] !== "dot" || platformRow[this.wrapX(spawnX)] !== "wall") {
      spawnX = Math.floor(CONFIG.MAZE_COLS / 2);
      // Force open space on top
      const rowOnTop = this.rows.get(this.playerTileY);
      if (rowOnTop) {
        rowOnTop[this.wrapX(spawnX)] = "dot";
      }
      // Force platform below
      const rowBelow = this.rows.get(this.playerSpawnY + 1);
      if (rowBelow) {
        rowBelow[this.wrapX(spawnX)] = "wall";
      }
    }
    
    // Ensure spawnX is within valid grid bounds
    this.playerTileX = this.wrapX(spawnX);
    const spacing = CONFIG.TILE_SPACING;
    this.playerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    this.playerY = this.playerTileY * (tileSize + spacing) + tileSize / 2;
    
    // Double-check player is within grid bounds
    if (this.playerTileX < 0 || this.playerTileX >= CONFIG.MAZE_COLS) {
      this.playerTileX = Math.floor(CONFIG.MAZE_COLS / 2);
      this.playerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    }
    this.playerDirection = "down"; // Normal rotation (0 degrees for idle sprite)
    this.nextDirection = null;
    this.trail = [];
    this.trailTimer = 0;
    this.isMoving = false;
    this.dashFlash = null;
    this.particles = []; // Clear particles on reset
    this.deathParticles = []; // Clear death particles on reset
    this.deathTimer = 0;

    // Sand starts from the bottom of the viewport
    this.waterSurfaceY = this.viewH() + 100; // Start below the visible area
    this.score = 0;
    
    // Initialize camera to center on player
    const zoom = CONFIG.ZOOM;
    const viewW = this.viewW() / zoom;
    const viewH = this.viewH() / zoom;
    this.cameraX = this.playerX - viewW * 0.5;
    this.cameraY = this.playerY - viewH * 0.5;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeIntensity = 0;
    this.wallHitBounce = 0;
    this.wallHitDirection = null;
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem("gameSettings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.log("[Game] Failed to load settings");
      }
    }
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("gameSettings", JSON.stringify(this.settings));
  }

  private applySettingsToUI(): void {
    // Update toggle images if settings panel is already rendered
    const toggleMusicImg = document.querySelector("#toggleMusic img") as HTMLImageElement;
    const toggleFxImg = document.querySelector("#toggleFx img") as HTMLImageElement;
    const toggleHapticsImg = document.querySelector("#toggleHaptics img") as HTMLImageElement;
    
    if (toggleMusicImg && this.onToggleImage && this.offToggleImage) {
      toggleMusicImg.src = this.settings.music ? this.onToggleImage.src : this.offToggleImage.src;
    }
    if (toggleFxImg && this.onToggleImage && this.offToggleImage) {
      toggleFxImg.src = this.settings.fx ? this.onToggleImage.src : this.offToggleImage.src;
    }
    if (toggleHapticsImg && this.onToggleImage && this.offToggleImage) {
      toggleHapticsImg.src = this.settings.haptics ? this.onToggleImage.src : this.offToggleImage.src;
    }
    
    // Update classList if elements exist (for backwards compatibility)
    if (this.toggleMusic) {
      this.toggleMusic.classList.toggle("active", this.settings.music);
    }
    if (this.toggleFx) {
      this.toggleFx.classList.toggle("active", this.settings.fx);
    }
    if (this.toggleHaptics) {
      this.toggleHaptics.classList.toggle("active", this.settings.haptics);
    }
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private setupUI(): void {
    // Note: playBtn and optionsBtn are now created dynamically in updateStartMenu()
    // Event listeners are attached there
    const restartBtn = document.getElementById("restartBtn");
    const menuBtn = document.getElementById("menuBtn");
    const resumeBtn = document.getElementById("resumeBtn");

    restartBtn?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.restart();
    });

    menuBtn?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });

    resumeBtn?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.resume();
    });

    this.pauseBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      if (this.state === "PLAYING") this.pause();
      else if (this.state === "PAUSED") this.resume();
    });

    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.toggleSettings();
    });

    // Settings panel event listeners are now set up in updateSettingsPanel()
    // after the panel is dynamically created
  }

  private setupInput(): void {
    window.addEventListener("keydown", (e) => {
      if (this.state !== "PLAYING") return;

      if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        this.nextDirection = "up";
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        this.nextDirection = "down";
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        e.preventDefault();
        this.nextDirection = "left";
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        e.preventDefault();
        this.nextDirection = "right";
      } else if (e.code === "Escape") {
        e.preventDefault();
        if (this.settingsPanel.classList.contains("open")) {
          this.setSettingsOpen(false);
        } else {
          this.pause();
        }
      }
    });
  }

  private start(): void {
    this.state = "PLAYING";
    this.audio.startMusic();
    if (this.startOverlay) {
      this.startOverlay.classList.add("hidden");
    }
    this.hudEl?.classList.remove("uiHidden");
    this.pauseBtn?.classList.remove("uiHidden");
    this.settingsBtn?.classList.remove("uiHidden");
  }

  private pause(): void {
    if (this.state !== "PLAYING") return;
    this.state = "PAUSED";
    this.audio.stopMusic();
    this.pauseOverlay?.classList.remove("hidden");
    // Ensure pause overlay UI is updated
    this.updatePauseOverlay();
  }

  private resume(): void {
    if (this.state !== "PAUSED") return;
    this.state = "PLAYING";
    this.audio.startMusic();
    this.pauseOverlay?.classList.add("hidden");
  }

  private restart(): void {
    this.resetGame();
    this.state = "PLAYING";
    this.audio.startMusic();
    this.gameOverOverlay?.classList.add("hidden");
    this.pauseOverlay?.classList.add("hidden");
    this.hudEl?.classList.remove("uiHidden");
    this.pauseBtn?.classList.remove("uiHidden");
    this.settingsBtn?.classList.remove("uiHidden");
  }

  private showMenu(): void {
    this.state = "START";
    this.audio.stopMusic();
    this.gameOverOverlay?.classList.add("hidden");
    this.pauseOverlay?.classList.add("hidden");
    this.startOverlay?.classList.remove("hidden");
    this.hudEl?.classList.add("uiHidden");
    this.pauseBtn?.classList.add("uiHidden");
    this.settingsBtn?.classList.add("uiHidden");
    // Ensure menu is updated when showing
    this.updateStartMenu();
  }

  private gameOver(): void {
    this.state = "GAME_OVER";
    const distance = Math.max(0, Math.floor((this.playerSpawnY * CONFIG.TILE_SIZE - this.playerY) / CONFIG.TILE_SIZE));
    
    // Update game over overlay with distance
    this.updateGameOverOverlay(distance);
    
    this.gameOverOverlay?.classList.remove("hidden");
    this.hudEl?.classList.add("uiHidden");
    this.pauseBtn?.classList.add("uiHidden");
    this.settingsBtn?.classList.add("uiHidden");

    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
  }

  private toggleSettings(): void {
    const isOpen = this.settingsPanel.classList.contains("open");
    this.setSettingsOpen(!isOpen);
  }

  private setSettingsOpen(open: boolean): void {
    if (open) {
      // Ensure settings panel is updated before opening
      this.updateSettingsPanel();
      this.settingsPanel.classList.add("open");
      if (this.state === "PLAYING") {
        // Pause the game but don't show the pause overlay
        this.state = "PAUSED";
        this.audio.stopMusic();
        // Explicitly hide pause overlay to prevent it from showing
        this.pauseOverlay?.classList.add("hidden");
      }
      // Add animation
      const settingsPanel = document.getElementById("settingsPanel");
      if (settingsPanel) {
        settingsPanel.style.animation = "panelSlideIn 0.4s ease-out";
      }
    } else {
      this.settingsPanel.classList.remove("open");
      if (this.state === "PAUSED" && !this.settingsPanel.classList.contains("open")) {
        this.resume();
      }
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const w = this.viewW();
    const h = this.viewH();
    const t = performance.now() * 0.001;

    if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      const imgW = this.bgImage.naturalWidth;
      const imgH = this.bgImage.naturalHeight;
      const imgAspect = imgW / imgH;
      const viewAspect = w / h;
      
      let drawW = w;
      let drawH = h;
      let drawX = 0;
      let drawY = 0;
      
      if (imgAspect > viewAspect) {
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) * 0.5;
      } else {
        drawW = w;
        drawH = w / imgAspect;
        drawY = (h - drawH) * 0.5;
      }
      
      ctx.drawImage(this.bgImage, drawX, drawY, drawW, drawH);
    } else {
      // Egyptian sky gradient: deep blue-purple to sandy desert
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a1626"); // Deep night sky
      g.addColorStop(0.3, "#2d1a2a"); // Purple twilight
      g.addColorStop(0.6, "#3d2a1a"); // Sandy horizon
      g.addColorStop(1, "#2d1a0a"); // Desert sand
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    // Egyptian orbs: golden suns and warm glows
    const orbs = [
      { x: w * 0.2, y: h * 0.3, phase: t * 0.8, size: Math.min(w, h) * 0.4, offset: 0 },
      { x: w * 0.8, y: h * 0.5, phase: t * 1.2, size: Math.min(w, h) * 0.35, offset: Math.PI * 0.66 },
      { x: w * 0.5, y: h * 0.7, phase: t * 0.6, size: Math.min(w, h) * 0.3, offset: Math.PI * 1.33 },
    ];
    for (const orb of orbs) {
      const pulse = 0.7 + 0.3 * Math.sin(orb.phase);
      const alpha = 0.10 * pulse; // Slightly brighter for Egyptian theme
      const orbColor1 = getColorShift(t, orb.offset);
      const orbColor2 = getColorShift(t, orb.offset + Math.PI);
      const rg = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.size * pulse);
      rg.addColorStop(0, getColorString(orbColor1.r, orbColor1.g, orbColor1.b, alpha));
      rg.addColorStop(0.5, getColorString(orbColor2.r, orbColor2.g, orbColor2.b, alpha * 0.6));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.15;
    const gridColor = getColorShift(t, Math.PI * 0.5);
    // Golden grid lines for Egyptian theme
    ctx.strokeStyle = getColorString(gridColor.r, gridColor.g, gridColor.b, 0.35);
    ctx.lineWidth = 1;
    const gridSize = 60;
    // Center the grid - ensure a grid line passes through the exact center
    const centerX = w * 0.5;
    const centerY = h * 0.5;
    // Calculate the nearest grid line position to center, then offset from there
    // We want a grid line at centerX, so: offsetX + n*gridSize = centerX
    // Find the offset that places a line at centerX
    const offsetX = centerX % gridSize;
    const offsetY = centerY % gridSize;
    // Start drawing from center outward
    for (let x = centerX - (centerX % gridSize); x >= -gridSize; x -= gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let x = centerX - (centerX % gridSize) + gridSize; x < w + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = centerY - (centerY % gridSize); y >= -gridSize; y -= gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let y = centerY - (centerY % gridSize) + gridSize; y < h + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    if (this.noisePattern) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = this.noisePattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Darken the center of the gameplay area
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.10, w * 0.5, h * 0.5, Math.min(w, h) * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0.4)"); // Darker in center
    vg.addColorStop(0.5, "rgba(0,0,0,0.25)"); // Medium darkness
    vg.addColorStop(1, "rgba(0,0,0,0)"); // Transparent at edges
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  private drawRedBrickWall(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Base color - darker reddish brick color
    const baseR = 120;
    const baseG = 50;
    const baseB = 40;
    
    // Simple base fill (no gradient for performance)
    ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
    ctx.fillRect(x, y, size, size);
    
    // Draw brick pattern - optimized for smaller tiles
    const brickRows = 2; // Fewer rows for smaller tiles
    const brickHeight = size / brickRows;
    const brickWidth = size / 2; // Wider bricks relative to tile size
    const mortarWidth = 1.5; // Thinner mortar for smaller tiles
    
    // Draw mortar (much darker lines between bricks)
    const mortarR = Math.max(0, baseR - 50);
    const mortarG = Math.max(0, baseG - 30);
    const mortarB = Math.max(0, baseB - 25);
    ctx.fillStyle = `rgb(${mortarR}, ${mortarG}, ${mortarB})`;
    
    // Horizontal mortar lines
    for (let i = 1; i < brickRows; i++) {
      ctx.fillRect(x, Math.round(y + i * brickHeight - mortarWidth / 2), size, mortarWidth);
    }
    
    // Vertical mortar lines with offset pattern (classic brick pattern)
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;
      
      // Draw vertical lines more efficiently
      let colX = Math.round(x + offset);
      while (colX < x + size) {
        ctx.fillRect(colX - mortarWidth / 2, rowY, mortarWidth, brickHeight);
        colX += brickWidth;
      }
    }
  }

  private drawBrickTile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Base color - sandy/stone color (lighter, more golden)
    const baseR = 220;
    const baseG = 200;
    const baseB = 170;
    
    // Fill base with gradient for depth
    const gradient = ctx.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(0, `rgb(${baseR + 10}, ${baseG + 10}, ${baseB + 10})`);
    gradient.addColorStop(1, `rgb(${baseR - 10}, ${baseG - 10}, ${baseB - 10})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);
    
    // Draw brick pattern - alternating rows for classic brick layout
    const brickRows = 3;
    const brickHeight = size / brickRows;
    const brickWidth = size / 2;
    const mortarWidth = 2;
    
    // Draw mortar (darker lines between bricks)
    ctx.fillStyle = `rgb(${baseR - 25}, ${baseG - 25}, ${baseB - 25})`;
    
    // Horizontal mortar lines
    for (let i = 1; i < brickRows; i++) {
      ctx.fillRect(x, Math.round(y + i * brickHeight - mortarWidth / 2), size, mortarWidth);
    }
    
    // Vertical mortar lines with offset pattern (brick pattern)
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth; // Alternate rows offset for brick pattern
      
      // Vertical lines
      for (let col = 0; col <= 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size) {
          ctx.fillRect(colX - mortarWidth / 2, rowY, mortarWidth, brickHeight);
        }
      }
    }
    
    // Add subtle highlights on top of each brick for 3D effect
    ctx.fillStyle = `rgba(${baseR + 25}, ${baseG + 25}, ${baseB + 25}, 0.4)`;
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;
      
      for (let col = 0; col < 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size - 2) {
          // Top highlight on each brick
          const highlightHeight = Math.max(2, brickHeight * 0.15);
          ctx.fillRect(colX + 1, rowY + 1, brickWidth - 2, highlightHeight);
        }
      }
    }
    
    // Add subtle shadows at bottom of each brick
    ctx.fillStyle = `rgba(${baseR - 30}, ${baseG - 30}, ${baseB - 30}, 0.3)`;
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;
      
      for (let col = 0; col < 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size - 2) {
          // Bottom shadow on each brick
          const shadowHeight = Math.max(2, brickHeight * 0.15);
          ctx.fillRect(colX + 1, rowY + brickHeight - shadowHeight - 1, brickWidth - 2, shadowHeight);
        }
      }
    }
  }

  private drawBorder(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, orientation: "horizontal" | "vertical"): void {
    // Border color - darker than brick tile for depth
    const borderR = 180;
    const borderG = 160;
    const borderB = 140;
    
    // Draw main border fill
    ctx.fillStyle = `rgb(${borderR}, ${borderG}, ${borderB})`;
    ctx.fillRect(x, y, width, height);
    
    // Add subtle gradient for 3D effect
    const gradient = orientation === "horizontal" 
      ? ctx.createLinearGradient(x, y, x, y + height)
      : ctx.createLinearGradient(x, y, x + width, y);
    
    gradient.addColorStop(0, `rgba(${borderR + 15}, ${borderG + 15}, ${borderB + 15}, 0.6)`);
    gradient.addColorStop(1, `rgba(${borderR - 15}, ${borderG - 15}, ${borderB - 15}, 0.6)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    
    // Add highlight on top edge
    ctx.fillStyle = `rgba(${borderR + 25}, ${borderG + 25}, ${borderB + 25}, 0.5)`;
    if (orientation === "horizontal") {
      ctx.fillRect(x, y, width, Math.max(1, height * 0.2));
    } else {
      ctx.fillRect(x, y, Math.max(1, width * 0.2), height);
    }
    
    // Add shadow on bottom edge
    ctx.fillStyle = `rgba(${borderR - 25}, ${borderG - 25}, ${borderB - 25}, 0.5)`;
    if (orientation === "horizontal") {
      ctx.fillRect(x, y + height - Math.max(1, height * 0.2), width, Math.max(1, height * 0.2));
    } else {
      ctx.fillRect(x + width - Math.max(1, width * 0.2), y, Math.max(1, width * 0.2), height);
    }
  }

  private drawMaze(): void {
    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);
    // Apply screen shake (camera is in world coordinates, so no need to divide by zoom)
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);

    const viewX0 = this.cameraX;
    const viewY0 = this.cameraY;
    const viewX1 = viewX0 + this.viewW() / zoom;
    const viewY1 = viewY0 + this.viewH() / zoom;

    const tileSize = CONFIG.TILE_SIZE;
    const col0 = clamp(Math.floor(viewX0 / tileSize) - 2, 0, CONFIG.MAZE_COLS - 1);
    const col1 = clamp(Math.floor(viewX1 / tileSize) + 2, 0, CONFIG.MAZE_COLS - 1);
    const row0 = Math.floor(viewY0 / tileSize) - 3;
    const row1 = Math.floor(viewY1 / tileSize) + 3;

    // Draw walls using procedurally drawn brick tiles with borders
    ctx.save();
      // Enable image smoothing for smooth brick rendering
      ctx.imageSmoothingEnabled = true;
      for (let ry = row0; ry <= row1; ry++) {
        const row = this.ensureRow(ry);
        
        // Get width factor for this row to determine playable area boundaries
        const chunkId = this.getChunkIdForRow(ry);
        // Fixed width - no variation
        const effectiveWidth = CONFIG.MAX_WIDTH_COLS;
        const leftMargin = Math.floor((CONFIG.MAZE_COLS - effectiveWidth) / 2);
        const rightMargin = CONFIG.MAZE_COLS - leftMargin - effectiveWidth;
        const playableStart = leftMargin;
        const playableEnd = CONFIG.MAZE_COLS - rightMargin;
        
        for (let cx = col0; cx <= col1; cx++) {
          if (row[cx] === "wall") {
            const x = cx * (tileSize + CONFIG.TILE_SPACING);
            const y = ry * (tileSize + CONFIG.TILE_SPACING);
            
            // Check neighbors to determine exposed edges
            const left = cx > 0 && row[cx - 1] === "wall";
            const right = cx < CONFIG.MAZE_COLS - 1 && row[cx + 1] === "wall";
            const upRow = ry > 0 ? this.ensureRow(ry - 1) : null;
            const downRow = ry < row1 ? this.ensureRow(ry + 1) : null;
            const up = upRow && upRow[cx] === "wall";
            const down = downRow && downRow[cx] === "wall";
            
            // Check if this wall is at the edge of the playable area (needs side borders)
            const isAtPlayableLeftEdge = cx === playableStart;
            const isAtPlayableRightEdge = cx === playableEnd - 1;
            
            // Use integer pixel positions to prevent gaps
            const drawX = Math.floor(x);
            const drawY = Math.floor(y);
            
            // Visual tile size includes overlap for seamless walls
            const visualTileSize = tileSize + CONFIG.TILE_OVERLAP;
            const overlapOffset = CONFIG.TILE_OVERLAP / 2;
            const centerX = Math.round(drawX + tileSize / 2);
            const centerY = Math.round(drawY + tileSize / 2);
            
            // Draw tile asset
            if (this.tileImage && this.tileImage.complete) {
              ctx.drawImage(this.tileImage, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
            }
            
            // Draw borders on exposed edges
            // Border thickness is proportional to tile size
            const borderThickness = Math.max(3, visualTileSize * 0.08);
            
            // Top border (horizontal)
            if (!up) {
              this.drawBorder(ctx, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, borderThickness, "horizontal");
            }
            
            // Bottom border (horizontal)
            if (!down) {
              this.drawBorder(ctx, drawX - overlapOffset, drawY + tileSize - overlapOffset, visualTileSize, borderThickness, "horizontal");
            }
            
            // Left border (vertical)
            // Draw if no left neighbor OR if at playable area left edge (facing margin)
            if (!left || isAtPlayableLeftEdge) {
              this.drawBorder(ctx, drawX - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
            }
            
            // Right border (vertical)
            // Draw if no right neighbor OR if at playable area right edge (facing margin)
            if (!right || isAtPlayableRightEdge) {
              this.drawBorder(ctx, drawX + tileSize - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
            }
          }
        }
      }
    ctx.restore();

    // Draw side brick walls (left and right sides of maze) - procedurally drawn with reddish bricks
    // Width varies based on chunk width factor - walls extend inward for narrow sections
    ctx.save();
    ctx.imageSmoothingEnabled = true; // Enable smoothing for smooth brick rendering
      
      const visualTileSize = tileSize + CONFIG.TILE_OVERLAP;
      const overlapOffset = CONFIG.TILE_OVERLAP / 2;
      
      // Calculate full height based on viewport resolution
      const viewHeight = this.viewH() / zoom;
      const totalRows = Math.ceil(viewHeight / tileSize) + 200; // Add buffer for scrolling
      const startRow = Math.floor(viewY0 / tileSize) - 100;
      const endRow = startRow + totalRows;
      
      // Draw side walls for each row, adjusting position based on width factor
      for (let ry = startRow; ry <= endRow; ry++) {
        const chunkId = this.getChunkIdForRow(ry);
        // Fixed width - no variation
        const effectiveWidth = CONFIG.MAX_WIDTH_COLS;
        const leftMargin = Math.floor((CONFIG.MAZE_COLS - effectiveWidth) / 2);
        const rightMargin = CONFIG.MAZE_COLS - leftMargin - effectiveWidth;
        const playableStart = leftMargin;
        const playableEnd = CONFIG.MAZE_COLS - rightMargin;
        
        const y = ry * (tileSize + CONFIG.TILE_SPACING);
        const drawY = Math.floor(y);
        
        // Draw left side brick walls - extend from column -2 inward, but stop before the last column
        // Draw 2 columns of walls starting from the left edge
        const borderThickness = Math.max(3, visualTileSize * 0.08);
        for (let i = 0; i < 2; i++) {
          const col = -2 + i;
          const wallX = col * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.wall8Image && this.wall8Image.complete) {
            ctx.drawImage(this.wall8Image, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Add right border (facing inward) for the inner column
          if (i === 1) {
            this.drawBorder(ctx, drawX + tileSize - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
          }
        }
        
        // Draw additional left brick walls to fill the margin, but stop before the last column
        // The last column (playableStart - 1) will be platform wall
        for (let col = 0; col < playableStart - 1; col++) {
          const wallX = col * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.wall8Image && this.wall8Image.complete) {
            ctx.drawImage(this.wall8Image, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Ensure this visual tile has a collider
          const row = this.ensureRow(ry);
          if (col >= 0 && col < CONFIG.MAZE_COLS) {
            row[col] = "wall";
          }
          
          // Add right border (facing playable area) for the last margin column
          if (col === playableStart - 2) {
            this.drawBorder(ctx, drawX + tileSize - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
          }
        }
        
        // Draw platform wall at the last column on the left (touching playable area)
        if (playableStart > 0) {
          const wallX = (playableStart - 1) * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.tileImage && this.tileImage.complete) {
            ctx.drawImage(this.tileImage, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Ensure this visual tile has a collider
          const row = this.ensureRow(ry);
          if (playableStart - 1 >= 0 && playableStart - 1 < CONFIG.MAZE_COLS) {
            row[playableStart - 1] = "wall";
          }
          
          // Add right border (facing playable area)
          this.drawBorder(ctx, drawX + tileSize - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
        }
        
        // Draw right side brick walls - extend from column MAZE_COLS inward, but stop before the last column
        // Draw 2 columns of walls starting from the right edge
        for (let i = 0; i < 2; i++) {
          const col = CONFIG.MAZE_COLS + i;
          const wallX = col * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.wall8Image && this.wall8Image.complete) {
            ctx.drawImage(this.wall8Image, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Add left border (facing inward) for the inner column
          if (i === 0) {
            this.drawBorder(ctx, drawX - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
          }
        }
        
        // Draw additional right brick walls to fill the margin, but stop before the last column
        // The last column (playableEnd) will be platform wall
        for (let col = playableEnd + 1; col < CONFIG.MAZE_COLS; col++) {
          const wallX = col * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.wall8Image && this.wall8Image.complete) {
            ctx.drawImage(this.wall8Image, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Ensure this visual tile has a collider
          const row = this.ensureRow(ry);
          if (col >= 0 && col < CONFIG.MAZE_COLS) {
            row[col] = "wall";
          }
          
          // Add left border (facing playable area) for the first margin column
          if (col === playableEnd + 1) {
            this.drawBorder(ctx, drawX - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
          }
        }
        
        // Draw platform wall at the last column on the right (touching playable area)
        if (playableEnd < CONFIG.MAZE_COLS) {
          const wallX = playableEnd * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          if (this.tileImage && this.tileImage.complete) {
            ctx.drawImage(this.tileImage, drawX - overlapOffset, drawY - overlapOffset, visualTileSize, visualTileSize);
          }
          
          // Ensure this visual tile has a collider
          const row = this.ensureRow(ry);
          if (playableEnd >= 0 && playableEnd < CONFIG.MAZE_COLS) {
            row[playableEnd] = "wall";
          }
          
          // Add left border (facing playable area)
          this.drawBorder(ctx, drawX - overlapOffset, drawY - overlapOffset, borderThickness, visualTileSize, "vertical");
        }
      }
      
    ctx.restore();


    // Walls are now drawn using platform tile sprites above
    // Removed procedurally drawn squares - using sprites only

    const time = performance.now() * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let ry = row0; ry <= row1; ry++) {
      const row = this.ensureRow(ry);
      for (let cx = col0; cx <= col1; cx++) {
        const t = row[cx];
        if (t !== "dot" && t !== "power") continue;
        const x = cx * (tileSize + CONFIG.TILE_SPACING);
        const y = ry * (tileSize + CONFIG.TILE_SPACING);
        const px = x + tileSize / 2;
        const py = y + tileSize / 2;

        if (t === "dot") {
          // Draw coin sprite - scale to original dot size (5px radius = 10px diameter)
          if (this.coinImage && this.coinImage.complete && this.coinImage.naturalWidth > 0) {
            ctx.globalAlpha = 0.95;
            const coinSize = 10; // Original dot size
            const coinScale = coinSize / Math.max(this.coinImage.naturalWidth, this.coinImage.naturalHeight);
            const coinW = this.coinImage.naturalWidth * coinScale;
            const coinH = this.coinImage.naturalHeight * coinScale;
            ctx.drawImage(this.coinImage, px - coinW / 2, py - coinH / 2, coinW, coinH);
          } else {
            // Fallback: draw simple circle
            const dotColor = getColorShift(time, (ry * 13 + cx) * 0.1);
            const rg = ctx.createRadialGradient(px, py, 0.5, px, py, 6);
            rg.addColorStop(0, "rgba(255,255,200,0.95)");
            rg.addColorStop(0.25, getColorString(dotColor.r, dotColor.g, dotColor.b, 0.95));
            rg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = rg;
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            ctx.arc(px, py, 5.0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Power pellets - bright golden orbs
          const pulse = 0.65 + 0.35 * Math.sin(time * 3.2 + (ry * 13 + cx) * 0.13);
          const rr = 14 * pulse;
          const powerColor = getColorShift(time * 1.5, (ry * 13 + cx) * 0.15);
          const rg = ctx.createRadialGradient(px, py, rr * 0.1, px, py, rr);
          rg.addColorStop(0, "rgba(255,255,180,0.95)"); // Bright gold
          rg.addColorStop(0.35, getColorString(powerColor.r, powerColor.g, powerColor.b, 0.70));
          rg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rg;
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(px, py, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Rising sand dunes drawing
    const surfaceY = this.waterSurfaceY;
    const viewH = this.viewH() / zoom;
    const bottomY = viewY0 + viewH; // Bottom of viewport
    
    // Always draw sand from bottom, even if surface is above
    const x0 = viewX0 - 200;
    const x1 = viewX1 + 200;
    const y1 = bottomY; // Always draw to bottom of screen

    ctx.save();
    const step = 12; // Smaller step for smoother dunes
    const sandPath = new Path2D();
    sandPath.moveTo(x0, y1);

    // Draw dune surface from left to right
    for (let x = x0; x <= x1 + 0.001; x += step) {
      const yy = sandDuneY(surfaceY, x, time);
      // Clamp to bottom if surface is below viewport
      const clampedY = Math.min(yy, y1);
      sandPath.lineTo(x, clampedY);
    }
    sandPath.lineTo(x1, y1);
    sandPath.closePath();

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
    ctx.fillStyle = CONFIG.WATER_COLOR; // Sandy color
    ctx.fill(sandPath);

    ctx.save();
    ctx.clip(sandPath);
    // Sand gradient - darker at bottom, lighter at surface (dune highlights)
    const minSurfaceY = Math.min(surfaceY, y1 - 50); // Minimum surface Y
    const dg = ctx.createLinearGradient(0, minSurfaceY, 0, y1);
    dg.addColorStop(0, "rgba(255,245,220,0.15)"); // Light sand at dune peaks
    dg.addColorStop(0.3, "rgba(200,180,140,0.10)"); // Medium sand
    dg.addColorStop(0.7, "rgba(160,140,100,0.15)"); // Deeper sand
    dg.addColorStop(1, "rgba(120,100,80,0.30)"); // Darker sand at bottom
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = dg;
    ctx.fillRect(x0, minSurfaceY - 100, x1 - x0, y1 - (minSurfaceY - 100));
    ctx.restore();

    // Subtle glow for sand surface
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.15;
    ctx.shadowColor = CONFIG.WATER_GLOW;
    ctx.shadowBlur = 20;
    ctx.fillStyle = CONFIG.WATER_COLOR;
    ctx.fill(sandPath);

    // Sand surface highlight
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "rgba(255,240,200,0.35)"; // Light sandy highlight
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.stroke(sandPath);
    ctx.restore();

    ctx.restore();
  }

  private draw3DCube(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    z: number,
    size: number,
    rotX: number,
    rotY: number,
    rotZ: number,
    alpha: number = 1.0
  ): void {
    const t = performance.now() * 0.001;
    
    const wiggleX = Math.sin(t * 4.5) * 0.08;
    const wiggleY = Math.cos(t * 3.8) * 0.08;
    const wiggleZ = Math.sin(t * 5.2) * 0.06;
    const squashX = 1.0 + Math.sin(t * 3.2) * 0.12;
    const squashY = 1.0 + Math.cos(t * 2.9) * 0.12;
    const squashZ = 1.0 + Math.sin(t * 4.1) * 0.10;
    
    const halfSize = size * 0.5;
    
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);
    
    const vertices = [
      [-halfSize * squashX, -halfSize * squashY, -halfSize * squashZ],
      [halfSize * squashX, -halfSize * squashY, -halfSize * squashZ],
      [halfSize * squashX, halfSize * squashY, -halfSize * squashZ],
      [-halfSize * squashX, halfSize * squashY, -halfSize * squashZ],
      [-halfSize * squashX, -halfSize * squashY, halfSize * squashZ],
      [halfSize * squashX, -halfSize * squashY, halfSize * squashZ],
      [halfSize * squashX, halfSize * squashY, halfSize * squashZ],
      [-halfSize * squashX, halfSize * squashY, halfSize * squashZ],
    ];
    
    const wobbleRotX = rotX + wiggleX;
    const wobbleRotY = rotY + wiggleY;
    const wobbleRotZ = rotZ + wiggleZ;
    const cosWX = Math.cos(wobbleRotX);
    const sinWX = Math.sin(wobbleRotX);
    const cosWY = Math.cos(wobbleRotY);
    const sinWY = Math.sin(wobbleRotY);
    const cosWZ = Math.cos(wobbleRotZ);
    const sinWZ = Math.sin(wobbleRotZ);
    
    const rotatedVertices = vertices.map(([vx, vy, vz]) => {
      let x1 = vx * cosWY - vz * sinWY;
      let y1 = vy;
      let z1 = vx * sinWY + vz * cosWY;
      let x2 = x1;
      let y2 = y1 * cosWX - z1 * sinWX;
      let z2 = y1 * sinWX + z1 * cosWX;
      let x3 = x2 * cosWZ - y2 * sinWZ;
      let y3 = x2 * sinWZ + y2 * cosWZ;
      let z3 = z2;
      return { x: x3, y: y3, z: z3 };
    });
    
    const colorShift = getColorShift(t, 0);
    const colorShift2 = getColorShift(t, Math.PI);
    const colorShift3 = getColorShift(t, Math.PI * 0.5);
    
    const faces = [
      { indices: [0, 1, 2, 3], color: getColorString(255, 255, 255, 0.95), name: "front" },
      { indices: [5, 4, 7, 6], color: getColorString(colorShift2.r, colorShift2.g, colorShift2.b, 0.55), name: "back" },
      { indices: [4, 0, 3, 7], color: getColorString(colorShift.r, colorShift.g, colorShift.b, 0.75), name: "left" },
      { indices: [1, 5, 6, 2], color: getColorString(colorShift.r, colorShift.g, colorShift.b, 0.75), name: "right" },
      { indices: [4, 5, 1, 0], color: getColorString(colorShift3.r, colorShift3.g, colorShift3.b, 0.70), name: "top" },
      { indices: [3, 2, 6, 7], color: getColorString(colorShift2.r, colorShift2.g, colorShift2.b, 0.50), name: "bottom" },
    ];
    
    const sortedFaces = faces.map(face => {
      const avgZ = face.indices.reduce((sum, idx) => sum + rotatedVertices[idx].z, 0) / face.indices.length;
      return { ...face, avgZ };
    }).sort((a, b) => a.avgZ - b.avgZ);
    
    const perspective = 300;
    
    ctx.save();
    const zScale = perspective / (perspective + z);
    const zOffsetY = z * 0.3;
    ctx.translate(x, y + zOffsetY);
    ctx.scale(zScale, zScale);
    ctx.globalAlpha = alpha;
    
    for (const face of sortedFaces) {
      const projected = face.indices.map(idx => {
        const v = rotatedVertices[idx];
        const scale = perspective / (perspective + v.z + z);
        return {
          x: v.x * scale,
          y: v.y * scale,
          z: v.z + z,
        };
      });
      
      const v0 = { ...rotatedVertices[face.indices[0]], z: rotatedVertices[face.indices[0]].z + z };
      const v1 = { ...rotatedVertices[face.indices[1]], z: rotatedVertices[face.indices[1]].z + z };
      const v2 = { ...rotatedVertices[face.indices[2]], z: rotatedVertices[face.indices[2]].z + z };
      const dx1 = v1.x - v0.x;
      const dy1 = v1.y - v0.y;
      const dz1 = v1.z - v0.z;
      const dx2 = v2.x - v0.x;
      const dy2 = v2.y - v0.y;
      const dz2 = v2.z - v0.z;
      const nx = dy1 * dz2 - dz1 * dy2;
      const ny = dz1 * dx2 - dx1 * dz2;
      const nz = dx1 * dy2 - dy1 * dx2;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const normalZ = len > 0 ? nz / len : 0;
      
      if (normalZ < 0) continue;
      
      const light = Math.max(0.3, normalZ * 0.7 + 0.5);
      
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      
      const grad = ctx.createLinearGradient(
        projected[0].x, projected[0].y,
        projected[2].x, projected[2].y
      );
      const baseColor = face.color;
      const baseAlpha = parseFloat(baseColor.match(/0\.\d+/)?.[0] || "0.8");
      const brightAlpha = Math.min(1, baseAlpha * light * alpha);
      const darkAlpha = Math.max(0.2, baseAlpha * light * 0.7 * alpha);
      const brightColor = baseColor.replace(/rgba\([^)]+\)/, `rgba(255,255,200,${brightAlpha})`); // Warm gold highlight
      const darkColor = baseColor.replace(/rgba\([^)]+\)/, `rgba(180,140,80,${darkAlpha})`); // Amber shadow
      grad.addColorStop(0, brightColor);
      grad.addColorStop(1, darkColor);
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i].x, projected[i].y);
      }
      ctx.closePath();
      ctx.fill();
      
      const edgeColor = getColorShift(t, Math.PI * 0.25);
      ctx.strokeStyle = getColorString(edgeColor.r, edgeColor.g, edgeColor.b, 0.4 * light * alpha); // Brighter edges
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore();
    }
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.30 * alpha; // Brighter glow for Egyptian theme
    const glowColor = getColorShift(t, 0);
    ctx.shadowColor = getColorString(glowColor.r, glowColor.g, glowColor.b, 0.70); // Golden glow
    ctx.shadowBlur = 28;
    
    const glowSize = size * 1.15;
    const glowHalf = glowSize * 0.5;
    const glowVertices = [
      [-glowHalf, -glowHalf, -glowHalf],
      [glowHalf, -glowHalf, -glowHalf],
      [glowHalf, glowHalf, -glowHalf],
      [-glowHalf, glowHalf, -glowHalf],
      [-glowHalf, -glowHalf, glowHalf],
      [glowHalf, -glowHalf, glowHalf],
      [glowHalf, glowHalf, glowHalf],
      [-glowHalf, glowHalf, glowHalf],
    ];
    
    const glowRotated = glowVertices.map(([vx, vy, vz]) => {
      let x1 = vx * cosWY - vz * sinWY;
      let y1 = vy;
      let z1 = vx * sinWY + vz * cosWY;
      let x2 = x1;
      let y2 = y1 * cosWX - z1 * sinWX;
      let z2 = y1 * sinWX + z1 * cosWX;
      let x3 = x2 * cosWZ - y2 * sinWZ;
      let y3 = x2 * sinWZ + y2 * cosWZ;
      let z3 = z2;
      return { x: x3, y: y3, z: z3 };
    });
    
    const glowPerspective = 300;
    const glowProjected = [0, 1, 2, 3].map(idx => {
      const v = glowRotated[idx];
      const scale = glowPerspective / (glowPerspective + v.z + z);
      return {
        x: v.x * scale,
        y: v.y * scale,
      };
    });
    
    ctx.fillStyle = getColorString(glowColor.r, glowColor.g, glowColor.b, 0.4);
    ctx.beginPath();
    ctx.moveTo(glowProjected[0].x, glowProjected[0].y);
    for (let i = 1; i < glowProjected.length; i++) {
      ctx.lineTo(glowProjected[i].x, glowProjected[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    const radialGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowHalf * 1.2);
    radialGlow.addColorStop(0, getColorString(glowColor.r, glowColor.g, glowColor.b, 0.3));
    radialGlow.addColorStop(0.5, getColorString(glowColor.r, glowColor.g, glowColor.b, 0.15));
    radialGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radialGlow;
    ctx.fillRect(-glowHalf * 1.5, -glowHalf * 1.5, glowHalf * 3, glowHalf * 3);
    
    ctx.restore();
    
    ctx.restore();
  }

  private drawTrail(): void {
    if (this.trail.length < 2) return;

    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);

    // Mummy-style horizontal bandage streak, pixel-art style:
    // 3 distinct horizontal bands behind the player, stepped lengths.
    ctx.globalCompositeOperation = "source-over";
    (ctx as any).imageSmoothingEnabled = false;

    // Determine trail direction (opposite of movement)
    let dirX = 0;
    let dirY = 0;
    if (this.playerDirection === "right") {
      dirX = -1;
    } else if (this.playerDirection === "left") {
      dirX = 1;
    } else if (this.playerDirection === "up") {
      dirY = 1;
    } else if (this.playerDirection === "down") {
      dirY = -1;
    }

    // Perpendicular vector for stacking bands
    const perpX = -dirY;
    const perpY = dirX;

    // Core band definitions: highlight, mid, shadow (reduced widths for less intensity)
    // Each band starts at a different point in the trail to create stepped ends
    const bands = [
      { tone: "highlight" as const, width: 3, startRatio: 0.0, offset: 0 },   // Longest: starts from beginning
      { tone: "mid" as const, width: 2.5, startRatio: 0.15, offset: 6 },        // Medium: starts 15% in
      { tone: "shadow" as const, width: 2, startRatio: 0.35, offset: 11 },   // Shortest: starts 35% in
    ];

    for (const band of bands) {
      let r = 243;
      let g = 234;
      let b = 214;
      if (band.tone === "mid") {
        r = 216; g = 203; b = 176;
      } else if (band.tone === "shadow") {
        r = 179; g = 162; b = 127;
      }

      // Calculate starting index for this band
      const startIdx = Math.floor(this.trail.length * band.startRatio);
      if (startIdx >= this.trail.length - 1) continue;

      // Offset band perpendicular to direction to form a stepped "stair"
      const offX = perpX * band.offset;
      const offY = perpY * band.offset;

      // Draw trail with alpha fade for reduced intensity
      // Use average alpha of trail points for this band
      let avgAlpha = 0;
      let pointCount = 0;
      for (let i = startIdx; i < this.trail.length; i++) {
        avgAlpha += this.trail[i].alpha;
        pointCount++;
      }
      avgAlpha = pointCount > 0 ? avgAlpha / pointCount : 0;
      // Reduce overall intensity with lower alpha multiplier
      const trailAlpha = avgAlpha * 0.6; // Reduced from 1.0 to 0.6 for less intensity
      
      ctx.beginPath();
      for (let i = startIdx; i < this.trail.length; i++) {
        const point = this.trail[i];
        const x = Math.round(point.x - this.cameraX + offX);
        const y = Math.round(point.y - this.cameraY + offY);

        if (i === startIdx) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = getColorString(r, g, b, trailAlpha);
      ctx.lineWidth = band.width;
      ctx.lineCap = "butt"; // square ends
      ctx.lineJoin = "miter";
      ctx.shadowColor = "rgba(0,0,0,0)";
      ctx.shadowBlur = 0;
      ctx.stroke();
    }

    ctx.restore();
  }
  
  private spawnDashParticles(x: number, y: number, direction: Direction): void {
    const count = 3 + Math.floor(Math.random() * 3); // 3-5 particles
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 30;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      // Add directional bias based on dash direction
      let biasX = 0;
      let biasY = 0;
      if (direction === "right") biasX = 15;
      else if (direction === "left") biasX = -15;
      else if (direction === "down") biasY = 15;
      else if (direction === "up") biasY = -15;
      
      this.particles.push({
        x: x, // Exact player position
        y: y, // Exact player position
        vx: vx + biasX,
        vy: vy + biasY,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 2 + Math.random() * 3,
        color: `rgba(255, 240, 200, 1)`, // Light golden/sandy color
        type: "dash"
      });
    }
  }
  
  private spawnLandingParticles(x: number, y: number): void {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 particles
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 40;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      this.particles.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 3 + Math.random() * 4,
        color: `rgba(194, 178, 128, 1)`, // Sandy/dust color
        type: "landing"
      });
    }
  }
  
  private spawnDeathParticles(x: number, y: number): void {
    const count = 15 + Math.floor(Math.random() * 10); // 15-24 particles
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 50;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      this.deathParticles.push({
        x: x, // Exact player position
        y: y, // Exact player position
        vx: vx,
        vy: vy,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        size: 4 + Math.random() * 5,
        color: `rgba(150, 100, 80, 1)`, // Darker sandy/brown color for death
        type: "landing" // Reuse landing type
      });
    }
  }
  
  private updateDeathAnimation(dt: number): void {
    this.deathTimer += dt;
    
    // Update death particles
    for (let i = this.deathParticles.length - 1; i >= 0; i--) {
      const p = this.deathParticles[i];
      
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Apply gravity and friction
      p.vy += 200 * dt; // Gravity
      p.vx *= 0.92; // More friction for death particles
      p.vy *= 0.92;
      
      // Update life
      p.life -= dt;
      
      // Remove dead particles
      if (p.life <= 0) {
        this.deathParticles.splice(i, 1);
      }
    }
    
    // When animation completes, handle game over or reset
    if (this.deathTimer >= this.deathDuration) {
      this.lives--;
      if (this.lives <= 0) {
        this.gameOver();
      } else {
        this.resetGame();
      }
      // Clear death particles
      this.deathParticles = [];
    }
  }
  
  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Apply gravity and friction
      p.vy += 200 * dt; // Gravity
      p.vx *= 0.95; // Friction
      p.vy *= 0.95;
      
      // Update life
      p.life -= dt;
      
      // Remove dead particles
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
  
  private drawParticles(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    
    ctx.save();
    
    // Transform to world coordinates
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);
    
    // Draw regular particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + alpha * 0.5); // Shrink as it dies
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      
      // Draw particle as a circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add glow for landing particles
      if (p.type === "landing" && alpha > 0.5) {
        ctx.shadowBlur = size * 2;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    
    // Draw death particles
    for (const p of this.deathParticles) {
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + alpha * 0.5);
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add glow for death particles
      if (alpha > 0.5) {
        ctx.shadowBlur = size * 1.5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);
    
    // Draw mummy cloth during dash (before player so it appears behind)
    if (this.dashFlash) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      
      const clothStartX = this.dashFlash.clothStartX - this.cameraX;
      const clothStartY = this.dashFlash.clothStartY - this.cameraY;
      
      // Cloth extends forward first, then pulls player back
      // During first 30%: cloth extends to target
      // After 30%: cloth shortens as player gets pulled
      let clothEndX: number;
      let clothEndY: number;
      
      if (this.dashFlash.progress < 0.3) {
        // Cloth extends forward to target position
        clothEndX = this.dashFlash.endX - this.cameraX;
        clothEndY = this.dashFlash.endY - this.cameraY;
      } else {
        // Cloth connects to current player position (being pulled)
        clothEndX = this.playerX - this.cameraX;
        clothEndY = this.playerY - this.cameraY;
      }
      
      // Calculate cloth direction and length
      const dx = clothEndX - clothStartX;
      const dy = clothEndY - clothStartY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      // Draw cloth as a bandage strip with multiple bands (similar to trail style)
      const bands = [
        { tone: "highlight" as const, width: 6, offset: 0 },
        { tone: "mid" as const, width: 5, offset: 3 },
        { tone: "shadow" as const, width: 4, offset: 6 },
      ];
      
      for (const band of bands) {
        let r = 243, g = 234, b = 214;
        if (band.tone === "mid") {
          r = 216; g = 203; b = 176;
        } else if (band.tone === "shadow") {
          r = 179; g = 162; b = 127;
        }
        
        // Offset perpendicular to cloth direction
        const perpX = -Math.sin(angle) * band.offset;
        const perpY = Math.cos(angle) * band.offset;
        
        ctx.save();
        ctx.translate(clothStartX + perpX, clothStartY + perpY);
        ctx.rotate(angle);
        
        // Draw cloth strip with slight curve/sag for realism
        ctx.beginPath();
        const segments = 8;
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const x = t * length;
          // Add slight sag in the middle (parabolic curve)
          const sag = Math.sin(t * Math.PI) * 2;
          const y = sag;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        
        ctx.strokeStyle = getColorString(r, g, b, 0.9);
        ctx.lineWidth = band.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }
      
      ctx.restore();
    }
    
    const t = performance.now() * 0.001;
    
    const waveOffsetX = waterWaveY(0, this.playerY, t) * 0.12;
    
    ctx.translate(
      this.playerX - this.cameraX + waveOffsetX, 
      this.playerY - this.cameraY
    );

    if (this.dashFlash) {
      const flashAlpha = 0.4 + 0.6 * (1 - Math.abs(this.dashFlash.progress - 0.5) * 2);
      ctx.globalAlpha = flashAlpha;
    }

    // Apply bounce effect when hitting wall
    let bounceOffsetX = 0;
    let bounceOffsetY = 0;
    let bounceScale = 1.0;
    
    if (this.wallHitBounce > 0) {
      const bounceAmount = this.wallHitBounce * 3.0; // Bounce distance
      const scaleSquash = 1.0 - this.wallHitBounce * 0.3; // Squash effect
      const scaleStretch = 1.0 + this.wallHitBounce * 0.2; // Stretch effect
      
      if (this.wallHitDirection === "right") {
        bounceOffsetX = -bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "left") {
        bounceOffsetX = bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "down") {
        bounceOffsetY = -bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "up") {
        bounceOffsetY = bounceAmount;
        bounceScale = scaleSquash;
      }
    }
    
    ctx.translate(bounceOffsetX, bounceOffsetY);
    ctx.scale(bounceScale, bounceScale);

    // Choose sprite: dash sprite while dashing, otherwise idle sprite
    let sprite: HTMLImageElement | null = null;
    const isDashing = this.dashFlash && this.playerDashSprite && this.playerDashSprite.complete && this.playerDashSprite.naturalWidth > 0;

    if (isDashing) {
      sprite = this.playerDashSprite;
    } else if (this.playerIdleSprite && this.playerIdleSprite.complete && this.playerIdleSprite.naturalWidth > 0) {
      sprite = this.playerIdleSprite;
    }
    
    // Rotate player so feet point toward the wall they're moving toward
    // Dash sprite has different default orientation (appears to face up by default)
    let rotation = 0;
    if (isDashing) {
      // Dash sprite rotation (sprite appears to be facing up by default based on user feedback)
      if (this.playerDirection === "up") {
        rotation = 0; // Default orientation (facing up)
      } else if (this.playerDirection === "right") {
        rotation = Math.PI / 2; // Rotate 90 degrees clockwise (up -> right)
      } else if (this.playerDirection === "left") {
        rotation = -Math.PI / 2; // Rotate 90 degrees counter-clockwise (up -> left)
      } else if (this.playerDirection === "down") {
        rotation = Math.PI; // Rotate 180 degrees (up -> down)
      }
    } else {
      // Idle sprite rotation
      if (this.playerDirection === "up") {
        rotation = Math.PI; // upside-down
      } else if (this.playerDirection === "right") {
        rotation = -Math.PI / 2;
      } else if (this.playerDirection === "left") {
        rotation = Math.PI / 2;
      } // "down" stays at 0
    }
    ctx.rotate(rotation);
    
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      // Scale sprite to match original player size
      const targetSize = CONFIG.PLAYER_BODY * 0.85;
      const scaleX = targetSize / sprite.naturalWidth;
      const scaleY = targetSize / sprite.naturalHeight;
      
      // For dash sprite, we don't need horizontal flip since rotation handles it
      // For idle sprite, flip horizontally for left direction
      if (!isDashing && this.playerDirection === "left") {
        ctx.scale(-scaleX, scaleY);
        ctx.drawImage(sprite, -sprite.naturalWidth / 2, -sprite.naturalHeight / 2);
      } else {
        ctx.scale(scaleX, scaleY);
        ctx.drawImage(sprite, -sprite.naturalWidth / 2, -sprite.naturalHeight / 2);
      }
    } else {
      // Fallback: draw a simple rectangle if sprites not loaded
      ctx.fillStyle = CONFIG.PLAYER_COLOR;
      ctx.fillRect(-CONFIG.PLAYER_BODY / 2, -CONFIG.PLAYER_BODY / 2, CONFIG.PLAYER_BODY, CONFIG.PLAYER_BODY);
    }
    
    ctx.restore();
  }

  // Debug functions removed
  /*
  private createDebugMenu(): void {
    // Create debug menu container
    const menu = document.createElement("div");
    menu.id = "debugMenu";
    menu.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 250px;
      border: 2px solid rgba(255, 200, 100, 0.5);
    `;
    
    menu.innerHTML = `
      <div style="margin-bottom: 15px; font-weight: bold; color: #ffc864;">Debug Visualization</div>
      
      <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
        <input type="checkbox" id="debugToggle" checked style="margin-right: 8px;">
        Show Debug
      </label>
      
      <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
        <input type="checkbox" id="gridToggle" checked style="margin-right: 8px;">
        Show Grid
      </label>
      
      <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
        <input type="checkbox" id="tileColliderToggle" checked style="margin-right: 8px;">
        Show Tile Colliders
      </label>
      
      <label style="display: flex; align-items: center; margin-bottom: 15px; cursor: pointer;">
        <input type="checkbox" id="playerColliderToggle" checked style="margin-right: 8px;">
        Show Player Collider
      </label>
      
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Tile Size: <span id="tileSizeValue">${CONFIG.TILE_SIZE}</span></label>
        <input type="range" id="tileSizeSlider" min="10" max="50" value="${CONFIG.TILE_SIZE}" 
               style="width: 100%;" step="1">
      </div>
      
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Player Body: <span id="playerBodyValue">${CONFIG.PLAYER_BODY}</span></label>
        <input type="range" id="playerBodySlider" min="10" max="50" value="${CONFIG.PLAYER_BODY}" 
               style="width: 100%;" step="1">
      </div>
    `;
    
    document.body.appendChild(menu);
    this.debugMenu = menu;
    
    // Event listeners
    const debugToggle = document.getElementById("debugToggle") as HTMLInputElement;
    const gridToggle = document.getElementById("gridToggle") as HTMLInputElement;
    const tileColliderToggle = document.getElementById("tileColliderToggle") as HTMLInputElement;
    const playerColliderToggle = document.getElementById("playerColliderToggle") as HTMLInputElement;
    const tileSizeSlider = document.getElementById("tileSizeSlider") as HTMLInputElement;
    const playerBodySlider = document.getElementById("playerBodySlider") as HTMLInputElement;
    const tileSizeValue = document.getElementById("tileSizeValue") as HTMLElement;
    const playerBodyValue = document.getElementById("playerBodyValue") as HTMLElement;
    
    debugToggle.addEventListener("change", (e) => {
      this.showDebug = (e.target as HTMLInputElement).checked;
    });
    
    gridToggle.addEventListener("change", (e) => {
      this.showGrid = (e.target as HTMLInputElement).checked;
    });
    
    tileColliderToggle.addEventListener("change", (e) => {
      this.showTileColliders = (e.target as HTMLInputElement).checked;
    });
    
    playerColliderToggle.addEventListener("change", (e) => {
      this.showPlayerCollider = (e.target as HTMLInputElement).checked;
    });
    
    tileSizeSlider.addEventListener("input", (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      CONFIG.TILE_SIZE = value;
      tileSizeValue.textContent = value.toString();
    });
    
    playerBodySlider.addEventListener("input", (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      CONFIG.PLAYER_BODY = value;
      playerBodyValue.textContent = value.toString();
    });
  }

  private drawDebugVisualization(): void {
    const ctx = this.ctx;
    const tileSize = CONFIG.TILE_SIZE;
    const zoom = CONFIG.ZOOM;
    
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);
    
    // Calculate viewport bounds
    const viewW = this.viewW() / zoom;
    const viewH = this.viewH() / zoom;
    const viewX0 = this.cameraX;
    const viewY0 = this.cameraY;
    const viewX1 = viewX0 + viewW;
    const viewY1 = viewY0 + viewH;
    
    const col0 = Math.floor(viewX0 / tileSize) - 2;
    const col1 = Math.floor(viewX1 / tileSize) + 2;
    const row0 = Math.floor(viewY0 / tileSize) - 2;
    const row1 = Math.floor(viewY1 / tileSize) + 2;
    
    // Draw grid
    if (this.showGrid) {
      ctx.strokeStyle = "rgba(255, 200, 100, 0.3)";
      ctx.lineWidth = 1;
      
      for (let col = col0; col <= col1; col++) {
        const x = col * tileSize;
        ctx.beginPath();
        ctx.moveTo(x, row0 * tileSize);
        ctx.lineTo(x, row1 * tileSize);
        ctx.stroke();
      }
      
      for (let row = row0; row <= row1; row++) {
        const y = row * tileSize;
        ctx.beginPath();
        ctx.moveTo(col0 * tileSize, y);
        ctx.lineTo(col1 * tileSize, y);
        ctx.stroke();
      }
    }
    
    // Draw tile colliders
    if (this.showTileColliders) {
      for (let ry = row0; ry <= row1; ry++) {
        const row = this.ensureRow(ry);
        for (let cx = col0; cx <= col1; cx++) {
          if (cx >= 0 && cx < CONFIG.MAZE_COLS && row[cx] === "wall") {
            const x = cx * tileSize;
            const y = ry * tileSize;
            
            ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, tileSize, tileSize);
            
            ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
            ctx.fillRect(x, y, tileSize, tileSize);
          }
        }
      }
    }
    
    // Draw player collider
    if (this.showPlayerCollider) {
      const playerRadius = CONFIG.PLAYER_BODY * 0.55;
      const screenX = this.playerX - this.cameraX + this.shakeX;
      const screenY = this.playerY - this.cameraY + this.shakeY;
      
      ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
      ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.arc(screenX, screenY, playerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw center point
      ctx.fillStyle = "rgba(0, 255, 0, 1)";
      ctx.fillRect(screenX - 2, screenY - 2, 4, 4);
    }
    
    ctx.restore();
  }
  */

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW(), this.viewH());

    this.drawBackground();
    if (this.state === "PLAYING" || this.state === "DYING") {
      this.drawMaze();
      this.drawTrail();
      this.drawParticles();
      if (this.state === "PLAYING") {
        this.drawPlayer();
      }
      
    }

    if (this.renderCanvas) {
      const dctx = this.displayCtx;
      dctx.save();
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.imageSmoothingEnabled = true;
      dctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      dctx.drawImage(this.renderCanvas, 0, 0);

      if (CONFIG.BLOOM_ENABLED) {
        dctx.globalCompositeOperation = "screen";
        dctx.globalAlpha = CONFIG.BLOOM_STRENGTH;
        dctx.filter = `blur(${CONFIG.BLOOM_BLUR_PX}px)`;
        dctx.drawImage(this.renderCanvas, 0, 0);
        dctx.filter = "none";
        dctx.globalAlpha = 1.0;
        dctx.globalCompositeOperation = "source-over";
      }
      dctx.restore();
    }

    // Update HUD
    const distanceEl = document.getElementById("distance");
    if (distanceEl) {
      const distance = Math.max(0, Math.floor((this.playerSpawnY * CONFIG.TILE_SIZE - this.playerY) / CONFIG.TILE_SIZE));
      distanceEl.textContent = `${distance}m`;
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
}

// Initialize game
new DashBroGame();










