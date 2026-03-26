import {
  type Vec2,
  BALLOON_RADIUS,
  BALLOON_RISE_SPEED,
  BALLOON_RISE_ACCEL,
  BALLOON_MAX_RISE_SPEED,
  BALLOON_START_Y,
} from "./constants.ts";

export interface BalloonState {
  pos: Vec2;
  radius: number;
  riseSpeed: number;
  alive: boolean;
  popTime: number;
  bobPhase: number;
  bobAmplitude: number;
  stringSwayPhase: number;
}

export function createBalloon(screenWidth: number, screenHeight: number): BalloonState {
  return {
    pos: { x: screenWidth / 2, y: screenHeight - BALLOON_START_Y },
    radius: BALLOON_RADIUS,
    riseSpeed: BALLOON_RISE_SPEED,
    alive: true,
    popTime: 0,
    bobPhase: Math.random() * Math.PI * 2,
    bobAmplitude: 3,
    stringSwayPhase: Math.random() * Math.PI * 2,
  };
}

export function updateBalloon(balloon: BalloonState, dt: number): void {
  if (!balloon.alive) {
    balloon.popTime += dt;
    return;
  }

  balloon.riseSpeed = Math.min(
    balloon.riseSpeed + BALLOON_RISE_ACCEL * dt,
    BALLOON_MAX_RISE_SPEED,
  );

  balloon.pos.y -= balloon.riseSpeed * dt;

  balloon.bobPhase += dt * 2.5;
  balloon.stringSwayPhase += dt * 1.8;
}

export function popBalloon(balloon: BalloonState): void {
  balloon.alive = false;
  balloon.popTime = 0;
}

export function getBalloonWorldY(balloon: BalloonState): number {
  return -balloon.pos.y;
}

export function getScore(balloon: BalloonState, startY: number): number {
  const distance = startY - balloon.pos.y;
  return Math.max(0, Math.floor(distance / 5));
}
