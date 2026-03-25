import { oasiz } from "@oasiz/sdk";
import type { ScoreAnchor } from "@oasiz/sdk";
import {
  type GameState as AppGameState,
  type Vec2,
  SHIELD_PUSH_FORCE,
  OBSTACLE_RESTITUTION,
  SCORE_ANCHORS,
} from "./constants.ts";
import { type BalloonState, createBalloon, updateBalloon, popBalloon, getScore } from "./Balloon.ts";
import { type ShieldState, createShield, updateShield, refreshShieldTarget, InputHandler } from "./Shield.ts";
import { type Obstacle, ObstacleSpawner, createDebrisBrick } from "./Obstacle.ts";
import { type CameraState, createCamera, updateCamera } from "./Camera.ts";
import { Renderer } from "./Renderer.ts";
import { ParticleSystem } from "./ParticleSystem.ts";
import { Audio } from "./Audio.ts";
import { HUD } from "./HUD.ts";
import { Menu } from "./Menu.ts";
import {
  circleVsCircle,
  circleVsRect,
  circleVsTriangle,
  circleVsPolygon,
  circleVsPill,
  circleVsPlus,
  getDiamondVerts,
  getHexagonVerts,
  resolveShieldObstacleCollision,
  testObstacleVsObstacle,
  resolveObstacleCollision,
} from "./Physics.ts";

export class Game {
  private renderer: Renderer;
  private audio: Audio;
  private hud: HUD;
  private menu: Menu;
  private particles: ParticleSystem;
  private spawner: ObstacleSpawner;

  private balloon!: BalloonState;
  private shield!: ShieldState;
  private camera!: CameraState;
  private inputHandler!: InputHandler;

  private state: AppGameState = "MENU";
  private score = 0;
  private bestScore = 0;
  private startY = 0;
  private rafId = 0;
  private lastFrameTime = 0;
  private settingsOpen = false;
  private shieldCursorEl: HTMLElement | null = null;
  private gameOverDelay = 0;
  private gameOverShown = false;

  constructor() {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const container = document.getElementById("game-wrapper") as HTMLElement;
    this.renderer = new Renderer(canvas, container);
    this.audio = new Audio();
    this.hud = new HUD();
    this.menu = new Menu();
    this.particles = new ParticleSystem();
    this.spawner = new ObstacleSpawner();
    this.shieldCursorEl = document.getElementById("shield-cursor");

    this.bestScore = this.loadBestScore();

    this.menu.setCallbacks(
      () => this.startGame(),
      () => this.startGame(),
      () => this.showMenu(),
    );

    this.initSettings();
    this.initLifecycle();

    oasiz.emitScoreConfig({
      anchors: SCORE_ANCHORS as [ScoreAnchor, ScoreAnchor, ScoreAnchor, ScoreAnchor],
    });

    this.showMenu();
    this.startLoop();
  }

  private showMenu(): void {
    this.state = "MENU";
    this.hud.hide();
    document.getElementById("settings-btn")?.classList.add("hidden");
    this.menu.hideGameOver();
    this.menu.showMenu(this.bestScore);
    this.audio.stopMusic();
    this.renderer.hideBalloon();
    this.renderer.hideShield();
    this.renderer.clearObstacles();
    this.shieldCursorEl?.classList.remove("visible");
  }

  private startGame(): void {
    this.audio.playClick();
    this.menu.hideMenu();
    this.menu.hideGameOver();

    const w = this.renderer.width;
    const h = this.renderer.height;

    this.balloon = createBalloon(w, h);
    this.startY = this.balloon.pos.y;
    this.shield = createShield(w / 2, this.balloon.pos.y + 80);
    this.camera = createCamera(h);
    this.camera.y = this.balloon.pos.y - h * 0.6;

    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    if (this.inputHandler) {
      this.inputHandler.rebind(this.shield);
    } else {
      this.inputHandler = new InputHandler(this.shield, canvas);
      this.inputHandler.setRenderer(this.renderer);
    }
    this.inputHandler.setCamera(this.camera);

    this.spawner.reset(w, this.balloon.pos.y);
    this.particles.reset();
    this.renderer.clearObstacles();

    this.score = 0;
    this.gameOverDelay = 0;
    this.gameOverShown = false;
    this.hud.show();
    this.hud.updateScore(0);
    document.getElementById("settings-btn")?.classList.remove("hidden");

    this.state = "PLAYING";
    this.audio.startMusic();
  }

  private gameOver(): void {
    if (this.state === "GAME_OVER") return;
    this.state = "GAME_OVER";

    popBalloon(this.balloon);
    this.particles.emitPop(this.balloon.pos.x, this.balloon.pos.y);

    this.audio.playPop();
    this.audio.playGameOver();
    this.audio.stopMusic();

    oasiz.submitScore(this.score);

    const isNewBest = this.score > this.bestScore;
    if (isNewBest) {
      this.bestScore = this.score;
      this.saveBestScore();
    }

    this.gameOverDelay = 0;
  }

  private togglePause(): void {
    if (this.state === "PLAYING") {
      this.state = "PAUSED";
      document.getElementById("pause-overlay")?.classList.add("visible");
    } else if (this.state === "PAUSED") {
      this.state = "PLAYING";
      document.getElementById("pause-overlay")?.classList.remove("visible");
    }
  }

  // ─── Game Loop ───

  private startLoop(): void {
    if (this.rafId) return;
    this.lastFrameTime = 0;
    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private gameLoop(timestamp: number): void {
    const dt = this.lastFrameTime === 0 ? 0 : Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = timestamp;

    if (this.state === "PLAYING") {
      this.update(dt);
    } else if (this.state === "GAME_OVER") {
      this.updateGameOver(dt);
    }

    this.render();
    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private update(dt: number): void {
    updateBalloon(this.balloon, dt);
    updateCamera(this.camera, this.balloon.pos.y, dt);

    refreshShieldTarget(this.shield, this.camera);
    updateShield(this.shield, dt);

    this.score = getScore(this.balloon, this.startY);
    this.spawner.update(dt, this.camera.y + this.renderer.height, this.balloon.pos.y, this.score, this.renderer.width);

    this.resolveCollisions();
    this.hud.updateScore(this.score);

    this.particles.update(dt);
  }

  private updateGameOver(dt: number): void {
    this.gameOverDelay += dt;
    updateBalloon(this.balloon, dt);
    this.particles.update(dt);

    if (this.gameOverDelay > 1.2 && !this.gameOverShown) {
      this.gameOverShown = true;
      this.hud.hide();
      document.getElementById("settings-btn")?.classList.add("hidden");
      this.menu.showGameOver(this.score, this.bestScore, this.score >= this.bestScore && this.score > 0);
    }
  }

  private resolveCollisions(): void {
    const obstacles = this.spawner.getObstacles();
    const shieldBody = {
      pos: this.shield.pos,
      vel: this.shield.vel,
      radius: this.shield.radius,
      mass: 100,
    };

    const toBreak: Obstacle[] = [];

    for (const obs of obstacles) {
      if (obs.isDebris) continue;

      const shieldResult = this.testCollision(shieldBody.pos, shieldBody.radius, obs);
      if (shieldResult.hit) {
        toBreak.push(obs);

        this.particles.emitSparkle(
          obs.pos.x - shieldResult.normal.x * 10,
          obs.pos.y - shieldResult.normal.y * 10,
          "#ffffff",
        );
        this.audio.playDeflect();
      }
    }

    for (const obs of toBreak) {
      this.breakObstacle(obs);
    }

    for (const obs of obstacles) {
      if (!obs.isStatic) {
        const shieldResult = this.testCollision(shieldBody.pos, shieldBody.radius, obs);
        if (shieldResult.hit) {
          obs.vel = resolveShieldObstacleCollision(
            shieldBody.pos,
            shieldBody.vel,
            shieldBody.radius,
            obs.pos,
            obs.vel,
            shieldResult.normal,
            shieldResult.depth,
            SHIELD_PUSH_FORCE / obs.mass,
          );
        }
      }
    }

    this.resolveMovingObstacleCollisions(obstacles);

    for (const obs of obstacles) {
      if (this.balloon.alive) {
        const balloonResult = this.testCollision({ x: this.balloon.pos.x, y: this.balloon.pos.y }, this.balloon.radius, obs);
        if (balloonResult.hit) {
          this.gameOver();
          return;
        }
      }
    }

    const w = this.renderer.width;
    for (const obs of obstacles) {
      if (obs.isStatic) continue;
      let halfW: number;
      if (obs.shape === "circle" || obs.shape === "hexagon") halfW = obs.radius;
      else if (obs.shape === "pill") halfW = Math.max(obs.width, obs.height) / 2;
      else halfW = obs.width / 2;
      if (obs.pos.x - halfW < 0) {
        obs.pos.x = halfW;
        obs.vel.x = Math.abs(obs.vel.x) * 0.5;
      } else if (obs.pos.x + halfW > w) {
        obs.pos.x = w - halfW;
        obs.vel.x = -Math.abs(obs.vel.x) * 0.5;
      }
    }
  }

  private resolveMovingObstacleCollisions(obstacles: Obstacle[]): void {
    const moving = obstacles.filter(o => !o.isStatic);
    const toBreak: Obstacle[] = [];

    for (const a of moving) {
      for (const other of obstacles) {
        if (other === a) continue;
        if (other.isStatic && other.isDebris) continue;

        const result = testObstacleVsObstacle(
          { pos: a.pos, vel: a.vel, width: a.width, height: a.height, radius: a.radius, mass: a.mass, shape: a.shape },
          { pos: other.pos, vel: other.vel, width: other.width, height: other.height, radius: other.radius, mass: other.mass, shape: other.shape },
        );

        if (!result.hit) continue;

        if (!other.isDebris && !other.isStatic) {
          toBreak.push(other);
          a.pos.x -= result.normal.x * result.depth * 0.5;
          a.pos.y -= result.normal.y * result.depth * 0.5;
          continue;
        }
        if (!other.isDebris && other.isStatic) {
          toBreak.push(other);
          a.pos.x -= result.normal.x * result.depth * 0.5;
          a.pos.y -= result.normal.y * result.depth * 0.5;
          continue;
        }

        const half = result.depth * 0.5;
        a.pos.x -= result.normal.x * half;
        a.pos.y -= result.normal.y * half;
        other.pos.x += result.normal.x * half;
        other.pos.y += result.normal.y * half;
      }
    }

    const seen = new Set<number>();
    for (const obs of toBreak) {
      if (seen.has(obs.id)) continue;
      seen.add(obs.id);
      this.breakObstacleFromImpact(obs);
    }
  }

  private breakObstacleFromImpact(obs: Obstacle): void {
    const cos = Math.cos(obs.angle);
    const sin = Math.sin(obs.angle);
    const centerX = obs.pos.x;
    const centerY = obs.pos.y;

    if (obs.shape === "tower" || obs.shape === "pyramid") {
      const positions3D = this.renderer.getBrick3DPositions(obs);
      for (const bp of positions3D) {
        const rotX = bp.x * cos - bp.z * sin;
        const rotZ = bp.x * sin + bp.z * cos;
        const worldX = centerX + rotX;
        const worldY = centerY + rotZ - bp.y * 1.5;

        const scatter = 50 + Math.random() * 70;
        const angle = Math.atan2(rotZ, rotX) + (Math.random() - 0.5) * 1.5;
        const vx = Math.cos(angle) * scatter + (Math.random() - 0.5) * 40;
        const vy = Math.sin(angle) * scatter - bp.y * 2 + (Math.random() - 0.5) * 40;

        this.spawner.addObstacle(createDebrisBrick(worldX, worldY, obs.color, vx, vy));
      }
    } else {
      const brickPositions = this.renderer.getBrickPositions(obs);
      for (const bp of brickPositions) {
        const rotX = bp.x * cos - bp.z * sin;
        const rotZ = bp.x * sin + bp.z * cos;
        const worldX = centerX + rotX;
        const worldY = centerY + rotZ;

        const scatter = 60 + Math.random() * 80;
        const angle = Math.atan2(rotZ, rotX) + (Math.random() - 0.5) * 1.5;
        const vx = Math.cos(angle) * scatter + (Math.random() - 0.5) * 40;
        const vy = Math.sin(angle) * scatter + (Math.random() - 0.5) * 40;

        this.spawner.addObstacle(createDebrisBrick(worldX, worldY, obs.color, vx, vy));
      }
    }

    this.spawner.removeObstacle(obs.id);
    this.audio.playDeflect();
  }

  private breakObstacle(obs: Obstacle): void {
    const cos = Math.cos(obs.angle);
    const sin = Math.sin(obs.angle);
    const dx = obs.pos.x - this.shield.pos.x;
    const dy = obs.pos.y - this.shield.pos.y;
    const impactAngle = Math.atan2(dy, dx);
    const shieldSpeed = Math.sqrt(this.shield.vel.x ** 2 + this.shield.vel.y ** 2);
    const baseForce = Math.max(shieldSpeed * 0.6, 120);

    if (obs.shape === "tower" || obs.shape === "pyramid") {
      const positions3D = this.renderer.getBrick3DPositions(obs);
      for (const bp of positions3D) {
        const rotX = bp.x * cos - bp.z * sin;
        const rotZ = bp.x * sin + bp.z * cos;
        const worldX = obs.pos.x + rotX;
        const worldY = obs.pos.y + rotZ - bp.y * 1.5;

        const scatter = baseForce + Math.random() * 80;
        const angle = impactAngle + (Math.random() - 0.5) * 1.2;
        const vx = Math.cos(angle) * scatter + (Math.random() - 0.5) * 60;
        const vy = Math.sin(angle) * scatter - bp.y * 2 + (Math.random() - 0.5) * 60;

        this.spawner.addObstacle(createDebrisBrick(worldX, worldY, obs.color, vx, vy));
      }
    } else {
      const brickPositions = this.renderer.getBrickPositions(obs);
      for (const bp of brickPositions) {
        const rotX = bp.x * cos - bp.z * sin;
        const rotZ = bp.x * sin + bp.z * cos;
        const worldX = obs.pos.x + rotX;
        const worldY = obs.pos.y + rotZ;

        const scatter = baseForce + Math.random() * 80;
        const angle = impactAngle + (Math.random() - 0.5) * 1.2;
        const vx = Math.cos(angle) * scatter + (Math.random() - 0.5) * 60;
        const vy = Math.sin(angle) * scatter + (Math.random() - 0.5) * 60;

        this.spawner.addObstacle(createDebrisBrick(worldX, worldY, obs.color, vx, vy));
      }
    }

    this.spawner.removeObstacle(obs.id);
  }

  private testCollision(circlePos: Vec2, circleRadius: number, obs: Obstacle) {
    const circleBody = { pos: circlePos, vel: { x: 0, y: 0 }, radius: circleRadius, mass: 1 };

    if (obs.shape === "circle" || obs.shape === "hexagon") {
      if (obs.shape === "hexagon") {
        const verts = getHexagonVerts(obs.radius);
        return circleVsPolygon(circleBody, obs.pos, verts, obs.angle);
      }
      const obsBody = { pos: obs.pos, vel: obs.vel, radius: obs.radius, mass: obs.mass };
      return circleVsCircle(circleBody, obsBody);
    } else if (obs.shape === "rect" || obs.shape === "tower" || obs.shape === "pyramid") {
      const rectBody = {
        pos: obs.pos,
        vel: obs.vel,
        width: obs.width,
        height: obs.height,
        angle: obs.angle,
        mass: obs.mass,
      };
      return circleVsRect(circleBody, rectBody);
    } else if (obs.shape === "triangle") {
      return circleVsTriangle(circleBody, obs.pos, obs.width, obs.height, obs.angle);
    } else if (obs.shape === "diamond") {
      const verts = getDiamondVerts(obs.width / 2, obs.height / 2);
      return circleVsPolygon(circleBody, obs.pos, verts, obs.angle);
    } else if (obs.shape === "pill") {
      return circleVsPill(circleBody, obs.pos, obs.width, obs.height, obs.angle);
    } else if (obs.shape === "plus") {
      return circleVsPlus(circleBody, obs.pos, obs.width, obs.height, obs.angle);
    }
    return { hit: false, normal: { x: 0, y: 0 }, depth: 0 };
  }

  // ─── Rendering ───

  private render(): void {
    this.renderer.clear();
    this.renderer.drawBackground();

    if (this.state === "MENU") {
      this.renderer.render();
      return;
    }

    this.renderer.updateCameraPosition(this.camera.y);
    this.renderer.drawObstacles(this.spawner.getObstacles(), this.camera);
    this.renderer.drawParticles(this.particles.getParticles(), this.camera);

    if (this.balloon) {
      this.renderer.drawBalloon(this.balloon, this.camera);
    }
    this.renderer.hideShield();

    if (this.shield && this.state !== "GAME_OVER" && this.shieldCursorEl) {
      const sp = this.renderer.projectShieldToScreen(this.shield);
      this.shieldCursorEl.style.left = `${sp.x}px`;
      this.shieldCursorEl.style.top = `${sp.y}px`;
      this.shieldCursorEl.classList.add("visible");
    } else if (this.shieldCursorEl) {
      this.shieldCursorEl.classList.remove("visible");
    }

    this.renderer.render();
  }

  // ─── Settings ───

  private initSettings(): void {
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");

    settingsBtn?.addEventListener("click", () => {
      const wasOpen = this.settingsOpen;
      this.settingsOpen = !this.settingsOpen;
      settingsModal?.classList.toggle("visible", this.settingsOpen);
      if (this.settingsOpen && this.state === "PLAYING") {
        this.state = "PAUSED";
      } else if (wasOpen && !this.settingsOpen && this.state === "PAUSED") {
        this.state = "PLAYING";
      }
    });

    document.addEventListener("click", (e) => {
      if (this.settingsOpen && settingsModal && settingsBtn) {
        if (!settingsModal.contains(e.target as Node) && !settingsBtn.contains(e.target as Node)) {
          this.settingsOpen = false;
          settingsModal.classList.remove("visible");
          if (this.state === "PAUSED") {
            this.state = "PLAYING";
          }
        }
      }
    });

    let lastToggle = 0;
    const settingsToggle = (cb: () => void) => (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - lastToggle < 300) return;
      lastToggle = Date.now();
      cb();
      this.audio.saveSettings();
      this.updateSettingsToggles();
      this.audio.haptic("light");
    };

    document.getElementById("toggle-music")?.addEventListener("click", settingsToggle(() => {
      this.audio.settings.music = !this.audio.settings.music;
      if (!this.audio.settings.music) {
        this.audio.stopMusic();
      } else if (this.state === "PLAYING") {
        this.audio.startMusic();
      }
    }));

    document.getElementById("toggle-fx")?.addEventListener("click", settingsToggle(() => {
      this.audio.settings.fx = !this.audio.settings.fx;
    }));

    document.getElementById("toggle-haptics")?.addEventListener("click", settingsToggle(() => {
      this.audio.settings.haptics = !this.audio.settings.haptics;
    }));

    this.updateSettingsToggles();

    window.addEventListener("keydown", (e) => {
      if (e.key === "p" || e.key === "P") {
        if (this.state === "PLAYING" || this.state === "PAUSED") {
          this.togglePause();
        }
      }
      if ((e.key === "r" || e.key === "R") && this.state === "GAME_OVER") {
        this.startGame();
      }
      if (e.key === "Escape") {
        if (this.state === "PLAYING" || this.state === "PAUSED") {
          this.showMenu();
        }
      }
    });
  }

  private updateSettingsToggles(): void {
    const s = this.audio.settings;
    document.getElementById("toggle-music")?.classList.toggle("on", s.music);
    document.getElementById("toggle-fx")?.classList.toggle("on", s.fx);
    document.getElementById("toggle-haptics")?.classList.toggle("on", s.haptics);
  }

  // ─── Lifecycle ───

  private initLifecycle(): void {
    oasiz.onPause(() => {
      if (this.state === "PLAYING") this.togglePause();
      this.stopLoop();
    });

    oasiz.onResume(() => {
      this.startLoop();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    });
  }

  // ─── Persistence ───

  private loadBestScore(): number {
    const state = oasiz.loadGameState();
    return (state.bestScore as number) || 0;
  }

  private saveBestScore(): void {
    oasiz.saveGameState({ bestScore: this.bestScore });
    oasiz.flushGameState();
  }
}
