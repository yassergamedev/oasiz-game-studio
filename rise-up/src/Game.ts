import { oasiz } from "@oasiz/sdk";
import type { ScoreAnchor } from "@oasiz/sdk";
import {
  type GameState as AppGameState,
  type Vec2,
  SHIELD_PUSH_FORCE,
  SCORE_ANCHORS,
} from "./constants.ts";
import { type BalloonState, createBalloon, updateBalloon, popBalloon, getScore } from "./Balloon.ts";
import { type ShieldState, createShield, updateShield, refreshShieldTarget, InputHandler } from "./Shield.ts";
import { type Obstacle, ObstacleSpawner } from "./Obstacle.ts";
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
  private gameOverDelay = 0;
  private gameOverShown = false;

  constructor() {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.audio = new Audio();
    this.hud = new HUD();
    this.menu = new Menu();
    this.particles = new ParticleSystem();
    this.spawner = new ObstacleSpawner();

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
    }
    this.inputHandler.setCamera(this.camera);

    this.spawner.reset(w, this.balloon.pos.y);
    this.particles.reset();

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
    this.spawner.update(dt, this.camera.y + this.renderer.height, this.balloon.pos.y, this.score);

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
    const balloonBody = {
      pos: this.balloon.pos,
      vel: { x: 0, y: -this.balloon.riseSpeed },
      radius: this.balloon.radius,
      mass: 1,
    };
    const shieldBody = {
      pos: this.shield.pos,
      vel: this.shield.vel,
      radius: this.shield.radius,
      mass: 100,
    };

    const deflected = new Set<number>();

    for (let pass = 0; pass < 3; pass++) {
      for (const obs of obstacles) {
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

          const cross = shieldResult.normal.x * shieldBody.vel.y - shieldResult.normal.y * shieldBody.vel.x;
          obs.angularVel += (cross * 0.005) / obs.mass;

          if (!deflected.has(obs.id)) {
            deflected.add(obs.id);
            this.particles.emitSparkle(
              obs.pos.x - shieldResult.normal.x * 10,
              obs.pos.y - shieldResult.normal.y * 10,
              "#ffffff",
            );
            this.audio.playDeflect();
          }
        }
      }
    }

    for (const obs of obstacles) {
      if (this.balloon.alive) {
        const balloonResult = this.testCollision(balloonBody.pos, balloonBody.radius, obs);
        if (balloonResult.hit) {
          this.gameOver();
          return;
        }
      }
    }

    const w = this.renderer.width;
    for (const obs of obstacles) {
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

  private testCollision(circlePos: Vec2, circleRadius: number, obs: Obstacle) {
    const circleBody = { pos: circlePos, vel: { x: 0, y: 0 }, radius: circleRadius, mass: 1 };

    if (obs.shape === "circle" || obs.shape === "hexagon") {
      if (obs.shape === "hexagon") {
        const verts = getHexagonVerts(obs.radius);
        return circleVsPolygon(circleBody, obs.pos, verts, obs.angle);
      }
      const obsBody = { pos: obs.pos, vel: obs.vel, radius: obs.radius, mass: obs.mass };
      return circleVsCircle(circleBody, obsBody);
    } else if (obs.shape === "rect") {
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

    if (this.state === "MENU") return;

    this.renderer.drawObstacles(this.spawner.getObstacles(), this.camera);
    this.renderer.drawParticles(this.particles.getParticles(), this.camera);

    if (this.balloon) {
      this.renderer.drawBalloon(this.balloon, this.camera);
    }
    if (this.shield && this.state !== "GAME_OVER") {
      this.renderer.drawShield(this.shield, this.balloon, this.camera);
    }
  }

  // ─── Settings ───

  private initSettings(): void {
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");

    settingsBtn?.addEventListener("click", () => {
      this.settingsOpen = !this.settingsOpen;
      settingsModal?.classList.toggle("visible", this.settingsOpen);
      if (this.settingsOpen && this.state === "PLAYING") {
        this.togglePause();
      }
    });

    document.addEventListener("click", (e) => {
      if (this.settingsOpen && settingsModal && settingsBtn) {
        if (!settingsModal.contains(e.target as Node) && !settingsBtn.contains(e.target as Node)) {
          this.settingsOpen = false;
          settingsModal.classList.remove("visible");
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
