import { type BalloonState } from "./Balloon.ts";
import { type ShieldState } from "./Shield.ts";
import { type Obstacle } from "./Obstacle.ts";
import { type CameraState, worldToScreen } from "./Camera.ts";
import { type Particle } from "./ParticleSystem.ts";
import { BG_COLOR } from "./constants.ts";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBackground(): void {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBalloon(balloon: BalloonState, camera: CameraState): void {
    const ctx = this.ctx;
    const screenY = worldToScreen(balloon.pos.y, camera.y);
    const x = balloon.pos.x;
    const y = screenY + Math.sin(balloon.bobPhase) * balloon.bobAmplitude;
    const r = balloon.radius;

    if (!balloon.alive) {
      this.drawPopEffect(x, y, r, balloon.popTime);
      return;
    }

    const stringLen = 35;
    const sway = Math.sin(balloon.stringSwayPhase) * 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + r + 4);
    ctx.quadraticCurveTo(x + sway, y + r + stringLen * 0.5, x + sway * 0.5, y + r + stringLen);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x - 4, y + r);
    ctx.lineTo(x + 4, y + r);
    ctx.lineTo(x, y + r + 6);
    ctx.closePath();
    ctx.fill();
  }

  private drawPopEffect(x: number, y: number, r: number, popTime: number): void {
    const ctx = this.ctx;
    const t = Math.min(popTime / 0.5, 1);
    const alpha = 1 - t;
    const scale = 1 + t * 2;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * scale, 0, Math.PI * 2);
    ctx.stroke();

    const burstCount = 8;
    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 * i) / burstCount;
      const dist = r * scale * 1.5;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 3 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawShield(shield: ShieldState, balloon: BalloonState, camera: CameraState): void {
    const ctx = this.ctx;
    const screenY = worldToScreen(shield.pos.y, camera.y);
    const balloonScreenY = worldToScreen(balloon.pos.y, camera.y);
    const x = shield.pos.x;
    const y = screenY;
    const r = shield.radius;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(balloon.pos.x, balloonScreenY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawObstacles(obstacles: Obstacle[], camera: CameraState): void {
    for (const obs of obstacles) {
      const screenY = worldToScreen(obs.pos.y, camera.y);
      if (screenY < -100 || screenY > this.canvas.height + 100) continue;
      this.drawObstacle(obs, screenY);
    }
  }

  private drawObstacle(obs: Obstacle, screenY: number): void {
    const ctx = this.ctx;
    const x = obs.pos.x;
    const y = screenY;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(obs.angle);

    ctx.fillStyle = obs.color;
    this.drawObstacleShape(obs, false);

    ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
    ctx.lineWidth = 1;
    this.strokeObstacleShape(obs);

    ctx.restore();
  }

  private drawObstacleShape(obs: Obstacle, _isShadow: boolean): void {
    const ctx = this.ctx;

    if (obs.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.shape === "rect") {
      const hw = obs.width / 2;
      const hh = obs.height / 2;
      const cr = obs.cornerRadius;
      ctx.beginPath();
      ctx.moveTo(-hw + cr, -hh);
      ctx.lineTo(hw - cr, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + cr);
      ctx.lineTo(hw, hh - cr);
      ctx.quadraticCurveTo(hw, hh, hw - cr, hh);
      ctx.lineTo(-hw + cr, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - cr);
      ctx.lineTo(-hw, -hh + cr);
      ctx.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
      ctx.closePath();
      ctx.fill();
    } else if (obs.shape === "triangle") {
      const hw = obs.width / 2;
      const hh = obs.height / 2;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(hw, hh);
      ctx.closePath();
      ctx.fill();
    }
  }

  private strokeObstacleShape(obs: Obstacle): void {
    const ctx = this.ctx;

    if (obs.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obs.shape === "rect") {
      const hw = obs.width / 2;
      const hh = obs.height / 2;
      const cr = obs.cornerRadius;
      ctx.beginPath();
      ctx.moveTo(-hw + cr, -hh);
      ctx.lineTo(hw - cr, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + cr);
      ctx.lineTo(hw, hh - cr);
      ctx.quadraticCurveTo(hw, hh, hw - cr, hh);
      ctx.lineTo(-hw + cr, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - cr);
      ctx.lineTo(-hw, -hh + cr);
      ctx.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
      ctx.closePath();
      ctx.stroke();
    } else if (obs.shape === "triangle") {
      const hw = obs.width / 2;
      const hh = obs.height / 2;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(hw, hh);
      ctx.closePath();
      ctx.stroke();
    }
  }

  drawParticles(particles: Particle[], camera: CameraState): void {
    const ctx = this.ctx;
    for (const p of particles) {
      if (p.life <= 0) continue;
      const screenY = worldToScreen(p.pos.y, camera.y);
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + 0.5 * alpha);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, screenY, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

