export interface CameraState {
  y: number;
  targetY: number;
  screenHeight: number;
  smoothing: number;
}

export function createCamera(screenHeight: number): CameraState {
  return {
    y: 0,
    targetY: 0,
    screenHeight,
    smoothing: 4,
  };
}

export function updateCamera(camera: CameraState, balloonY: number, dt: number): void {
  camera.targetY = balloonY - camera.screenHeight * 0.6;
  camera.y += (camera.targetY - camera.y) * camera.smoothing * dt;
}

export function worldToScreen(worldY: number, cameraY: number): number {
  return worldY - cameraY;
}

export function screenToWorld(screenY: number, cameraY: number): number {
  return screenY + cameraY;
}
