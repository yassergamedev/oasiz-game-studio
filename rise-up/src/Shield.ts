import { type Vec2, SHIELD_RADIUS, SHIELD_FOLLOW_SPEED } from "./constants.ts";
import { type CameraState, screenToWorld } from "./Camera.ts";

export interface ShieldState {
  pos: Vec2;
  prevPos: Vec2;
  vel: Vec2;
  radius: number;
  targetPos: Vec2;
  targetScreenX: number;
  targetScreenY: number;
  active: boolean;
  glowIntensity: number;
}

export function createShield(x: number, y: number): ShieldState {
  return {
    pos: { x, y },
    prevPos: { x, y },
    vel: { x: 0, y: 0 },
    radius: SHIELD_RADIUS,
    targetPos: { x, y },
    targetScreenX: x,
    targetScreenY: 0,
    active: false,
    glowIntensity: 0,
  };
}

export function refreshShieldTarget(shield: ShieldState, camera: CameraState): void {
  if (shield.active) {
    shield.targetPos.x = shield.targetScreenX;
    shield.targetPos.y = screenToWorld(shield.targetScreenY, camera.y);
  }
}

export function updateShield(shield: ShieldState, dt: number): void {
  shield.prevPos.x = shield.pos.x;
  shield.prevPos.y = shield.pos.y;

  if (shield.active) {
    const dx = shield.targetPos.x - shield.pos.x;
    const dy = shield.targetPos.y - shield.pos.y;
    const speed = SHIELD_FOLLOW_SPEED;

    shield.pos.x += dx * speed * dt;
    shield.pos.y += dy * speed * dt;

    shield.vel.x = (shield.pos.x - shield.prevPos.x) / Math.max(dt, 0.001);
    shield.vel.y = (shield.pos.y - shield.prevPos.y) / Math.max(dt, 0.001);

    const velMag = Math.sqrt(shield.vel.x * shield.vel.x + shield.vel.y * shield.vel.y);
    shield.glowIntensity = Math.min(1, velMag / 500);
  } else {
    shield.vel.x *= 0.9;
    shield.vel.y *= 0.9;
    shield.glowIntensity *= 0.92;

    shield.targetPos.x = shield.pos.x;
    shield.targetPos.y = shield.pos.y;
  }
}

export class InputHandler {
  private shield: ShieldState;
  private canvas: HTMLCanvasElement;
  private camera: CameraState | null = null;
  private touching = false;

  constructor(shield: ShieldState, canvas: HTMLCanvasElement) {
    this.shield = shield;
    this.canvas = canvas;
    this.bindEvents();
  }

  rebind(shield: ShieldState): void {
    this.shield = shield;
    this.touching = false;
  }

  setCamera(camera: CameraState): void {
    this.camera = camera;
  }

  private bindEvents(): void {
    this.canvas.addEventListener("mousedown", (e) => this.onPointerDown(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => {
      if (this.touching) this.onPointerMove(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => this.onPointerUp());

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.onPointerDown(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.onPointerMove(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });
    this.canvas.addEventListener("touchcancel", () => this.onPointerUp());
  }

  private onPointerDown(clientX: number, clientY: number): void {
    this.touching = true;
    this.shield.active = true;
    this.onPointerMove(clientX, clientY);
  }

  private onPointerMove(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    this.shield.targetScreenX = screenX;
    this.shield.targetScreenY = screenY;
    this.shield.targetPos.x = screenX;
    this.shield.targetPos.y = this.camera ? screenToWorld(screenY, this.camera.y) : screenY;
  }

  private onPointerUp(): void {
    this.touching = false;
    this.shield.active = false;
  }
}
