import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { type BalloonState } from "./Balloon.ts";
import { type ShieldState } from "./Shield.ts";
import { type Obstacle } from "./Obstacle.ts";
import { type CameraState } from "./Camera.ts";
import { type Particle } from "./ParticleSystem.ts";
import { BG_COLOR } from "./constants.ts";

// Served from `public/assets/...` (matches how `paper-io` references its public assets).
const legoModelUrl = "assets/models/Lego.fbx";

const OBSTACLE_SCALE = 0.7;
const BRICK_UNIT = 28 * OBSTACLE_SCALE;
const GROUND_Y = -1;
const BALLOON_HOVER_Y = 8;
const SHIELD_HOVER_Y = 4;
const PARTICLE_HOVER_Y = 6;

const CAM_HEIGHT = 420;
const CAM_TILT_OFFSET = 160;

interface ObstacleMeshEntry {
  mesh: THREE.Object3D;
  id: number;
}

interface ParticleMeshEntry {
  mesh: THREE.Mesh;
  active: boolean;
}

function gameToWorldX(gameX: number, screenW: number): number {
  return gameX - screenW / 2;
}

function gameToWorldZ(gameY: number): number {
  return gameY;
}

export class Renderer {
  private threeRenderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private dirLight: THREE.DirectionalLight;

  private balloonGroup: THREE.Group | null = null;
  private balloonMesh: THREE.Mesh | null = null;
  private popGroup: THREE.Group | null = null;

  private shieldMesh: THREE.Mesh | null = null;

  private obstacleMeshes: ObstacleMeshEntry[] = [];
  private particleMeshPool: ParticleMeshEntry[] = [];

  private groundPlane: THREE.Mesh | null = null;

  private legoBrickGeometry: THREE.BufferGeometry | null = null;
  private legoBrickReady = false;
  private envMap: THREE.Texture | null = null;

  private _width = 0;
  private _height = 0;
  private container: HTMLElement;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.container = container;
    this._width = container.clientWidth;
    this._height = container.clientHeight;

    this.threeRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    this.threeRenderer.setSize(this._width, this._height);
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.threeRenderer.setClearColor(new THREE.Color(BG_COLOR));
    this.threeRenderer.shadowMap.enabled = true;
    this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1.3;
    this.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    const aspect = this._width / this._height;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 2000);
    this.camera.position.set(0, CAM_HEIGHT, CAM_TILT_OFFSET);
    this.camera.lookAt(0, 0, 0);

    this.dirLight = this.setupLighting();
    this.setupEnvMap();
    this.setupGround();
    this.createBalloonMesh();
    this.createShieldMesh();
    this.loadLegoBrick();

    window.addEventListener("resize", () => this.resize());
  }

  private loadLegoBrick(): void {
    const loader = new FBXLoader();
    loader.load(legoModelUrl, (fbx) => {
      let geo: THREE.BufferGeometry | null = null;
      fbx.traverse((child) => {
        if (child instanceof THREE.Mesh && !geo) {
          geo = child.geometry.clone();
        }
      });
      const g = geo as THREE.BufferGeometry | null;
      if (g) {
        g.rotateX(-Math.PI / 2);

        g.computeBoundingBox();
        const box = g.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        g.translate(-center.x, -box.min.y, -center.z);

        const footprint = Math.max(size.x, size.z);
        const scale = (BRICK_UNIT * 0.8) / footprint;
        g.scale(scale, scale, scale);

        this.legoBrickGeometry = g;
        this.legoBrickReady = true;
      }
    });
  }

  private setupLighting(): THREE.DirectionalLight {
    const hemi = new THREE.HemisphereLight(0xeeffff, 0xb0ffe0, 0.9);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(80, 250, -60);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -600;
    dirLight.shadow.camera.right = 600;
    dirLight.shadow.camera.top = 600;
    dirLight.shadow.camera.bottom = -600;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 600;
    dirLight.shadow.bias = -0.001;
    dirLight.shadow.radius = 4;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    const fillLight = new THREE.DirectionalLight(0xccffee, 0.5);
    fillLight.position.set(-100, 80, 60);
    this.scene.add(fillLight);

    return dirLight;
  }

  private setupEnvMap(): void {
    const pmrem = new THREE.PMREMGenerator(this.threeRenderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    const skyColor = new THREE.Color(0x90ffe0);
    const groundColor = new THREE.Color(0xffffff);
    const hemi = new THREE.HemisphereLight(skyColor, groundColor, 1.0);
    envScene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(1, 1, -0.5);
    envScene.add(sun);

    this.envMap = pmrem.fromScene(envScene, 0).texture;
    pmrem.dispose();
  }

  private setupGround(): void {
    const groundGeo = new THREE.PlaneGeometry(6000, 6000);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf0fff8,
      roughness: 0.8,
      metalness: 0,
      emissive: 0xd0f0e8,
      emissiveIntensity: 0.15,
    });

    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = GROUND_Y;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);
  }

  private createBalloonMesh(): void {
    this.balloonGroup = new THREE.Group();

    const geo = new THREE.SphereGeometry(22, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x66ccff,
      roughness: 0.3,
      metalness: 0.05,
      emissive: 0x66ccff,
      emissiveIntensity: 0.15,
    });
    this.balloonMesh = new THREE.Mesh(geo, mat);
    this.balloonMesh.castShadow = true;
    this.balloonGroup.add(this.balloonMesh);

    this.balloonGroup.visible = false;
    this.scene.add(this.balloonGroup);
  }

  private createShieldMesh(): void {
    const geo = new THREE.SphereGeometry(28, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6,
      emissive: 0x88ccff,
      emissiveIntensity: 0.15,
    });
    this.shieldMesh = new THREE.Mesh(geo, mat);
    this.shieldMesh.castShadow = true;
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
  }

  resize(): void {
    this._width = this.container.clientWidth;
    this._height = this.container.clientHeight;

    this.threeRenderer.setSize(this._width, this._height);

    this.camera.aspect = this._width / this._height;
    this.camera.updateProjectionMatrix();
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  clear(): void {
    // Three.js clears automatically on render
  }

  drawBackground(): void {
    // Handled by setClearColor and ground plane
  }

  drawBalloon(balloon: BalloonState, _camera: CameraState): void {
    if (!this.balloonGroup || !this.balloonMesh) return;

    if (!balloon.alive) {
      this.balloonGroup.visible = false;
      this.drawPopEffect3D(balloon);
      return;
    }

    this.balloonGroup.visible = true;
    if (this.popGroup) {
      this.popGroup.visible = false;
    }

    const wx = gameToWorldX(balloon.pos.x, this._width);
    const wz = gameToWorldZ(balloon.pos.y);
    const bobY = BALLOON_HOVER_Y + Math.sin(balloon.bobPhase) * 3;

    this.balloonGroup.position.set(wx, bobY, wz);
  }

  private drawPopEffect3D(balloon: BalloonState): void {
    if (!this.popGroup) {
      this.popGroup = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(20, 23, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.name = "popRing";
      this.popGroup.add(ring);

      for (let i = 0; i < 8; i++) {
        const dotGeo = new THREE.SphereGeometry(3, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.name = `popDot${i}`;
        this.popGroup.add(dot);
      }
      this.scene.add(this.popGroup);
    }

    const t = Math.min(balloon.popTime / 0.5, 1);
    const alpha = 1 - t;
    const scale = 1 + t * 2;

    const wx = gameToWorldX(balloon.pos.x, this._width);
    const wz = gameToWorldZ(balloon.pos.y);

    this.popGroup.visible = alpha > 0.01;
    this.popGroup.position.set(wx, BALLOON_HOVER_Y, wz);

    const ring = this.popGroup.getObjectByName("popRing") as THREE.Mesh;
    if (ring) {
      ring.scale.set(scale, scale, scale);
      (ring.material as THREE.MeshBasicMaterial).opacity = alpha;
    }

    for (let i = 0; i < 8; i++) {
      const dot = this.popGroup.getObjectByName(`popDot${i}`) as THREE.Mesh;
      if (dot) {
        const angle = (Math.PI * 2 * i) / 8;
        const dist = 22 * scale * 1.5;
        dot.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        dot.scale.setScalar(1 - t);
        (dot.material as THREE.MeshBasicMaterial).opacity = alpha;
      }
    }
  }

  drawShield(_shield: ShieldState, _balloon: BalloonState, _camera: CameraState): void {
    if (this.shieldMesh) this.shieldMesh.visible = false;
  }

  hideShield(): void {
    if (this.shieldMesh) this.shieldMesh.visible = false;
  }

  projectShieldToScreen(shield: ShieldState): { x: number; y: number } {
    const wx = gameToWorldX(shield.pos.x, this._width);
    const wz = gameToWorldZ(shield.pos.y);

    const pos = new THREE.Vector3(wx, SHIELD_HOVER_Y, wz);
    pos.project(this.camera);

    return {
      x: (pos.x * 0.5 + 0.5) * this._width,
      y: (-pos.y * 0.5 + 0.5) * this._height,
    };
  }

  private _raycaster = new THREE.Raycaster();
  private _groundPlaneForRaycast = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SHIELD_HOVER_Y);

  unprojectScreenToGame(screenX: number, screenY: number): { gameX: number; gameY: number } {
    const ndcX = (screenX / this._width) * 2 - 1;
    const ndcY = -(screenY / this._height) * 2 + 1;

    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const intersection = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._groundPlaneForRaycast, intersection);

    if (hit) {
      const gameX = intersection.x + this._width / 2;
      const gameY = intersection.z;
      return { gameX, gameY };
    }

    return { gameX: screenX, gameY: screenY };
  }

  hideBalloon(): void {
    if (this.balloonGroup) this.balloonGroup.visible = false;
    if (this.popGroup) this.popGroup.visible = false;
  }

  drawObstacles(obstacles: Obstacle[], _camera: CameraState): void {
    const activeIds = new Set<number>();

    for (const obs of obstacles) {
      activeIds.add(obs.id);

      let entry = this.obstacleMeshes.find((e) => e.id === obs.id);
      if (!entry) {
        const mesh = this.createObstacleMesh(obs);
        this.scene.add(mesh);
        entry = { mesh, id: obs.id };
        this.obstacleMeshes.push(entry);
      }

      const wx = gameToWorldX(obs.pos.x, this._width);
      const wz = gameToWorldZ(obs.pos.y);

      const baseY = GROUND_Y + 1 + obs.heightY;
      const minY = GROUND_Y + 0.5;
      entry.mesh.position.set(wx, Math.max(baseY, minY), wz);
      entry.mesh.rotation.set(obs.tiltX, obs.angle, obs.tiltZ);
    }

    for (let i = this.obstacleMeshes.length - 1; i >= 0; i--) {
      if (!activeIds.has(this.obstacleMeshes[i].id)) {
        this.scene.remove(this.obstacleMeshes[i].mesh);
        this.disposeObject(this.obstacleMeshes[i].mesh);
        this.obstacleMeshes.splice(i, 1);
      }
    }
  }

  clearObstacles(): void {
    for (const entry of this.obstacleMeshes) {
      this.scene.remove(entry.mesh);
      this.disposeObject(entry.mesh);
    }
    this.obstacleMeshes = [];
  }

  private createGlossyMaterial(color: string): THREE.MeshPhysicalMaterial {
    const c = new THREE.Color(color);
    return new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      reflectivity: 0.3,
      emissive: c,
      emissiveIntensity: 0.08,
      envMap: this.envMap,
      envMapIntensity: 0.15,
    });
  }

  getBrickPositions(obs: Obstacle): Array<{ x: number; z: number }> {
    const positions: Array<{ x: number; z: number }> = [];
    const unit = BRICK_UNIT;

    switch (obs.shape) {
      case "rect": {
        const cols = Math.max(1, Math.round(obs.width / unit));
        const rows = Math.max(1, Math.round(obs.height / unit));
        const startX = -((cols - 1) * unit) / 2;
        const startZ = -((rows - 1) * unit) / 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            positions.push({ x: startX + c * unit, z: startZ + r * unit });
          }
        }
        break;
      }
      case "circle": {
        const r = obs.radius;
        const count = Math.max(1, Math.round((r * 2) / unit));
        const start = -((count - 1) * unit) / 2;
        for (let row = 0; row < count; row++) {
          for (let col = 0; col < count; col++) {
            const bx = start + col * unit;
            const bz = start + row * unit;
            if (bx * bx + bz * bz <= r * r) {
              positions.push({ x: bx, z: bz });
            }
          }
        }
        break;
      }
      case "triangle": {
        const halfW = obs.width / 2;
        const halfH = obs.height / 2;
        const rows = Math.max(1, Math.round(obs.height / unit));
        for (let row = 0; row < rows; row++) {
          const t = row / Math.max(1, rows - 1);
          const rowWidth = halfW * 2 * t;
          const cols = Math.max(1, Math.round(rowWidth / unit));
          const startX = -((cols - 1) * unit) / 2;
          const bz = -halfH + row * unit;
          for (let col = 0; col < cols; col++) {
            positions.push({ x: startX + col * unit, z: bz });
          }
        }
        break;
      }
      case "diamond": {
        const halfW = obs.width / 2;
        const halfH = obs.height / 2;
        const rows = Math.max(1, Math.round(obs.height / unit));
        for (let row = 0; row < rows; row++) {
          const t = row / Math.max(1, rows - 1);
          const rowHalfW = halfW * (t <= 0.5 ? t * 2 : (1 - t) * 2);
          const cols = Math.max(1, Math.round((rowHalfW * 2) / unit));
          const startX = -((cols - 1) * unit) / 2;
          const bz = -halfH + row * unit;
          for (let col = 0; col < cols; col++) {
            positions.push({ x: startX + col * unit, z: bz });
          }
        }
        break;
      }
      case "hexagon": {
        const r = obs.radius;
        const count = Math.max(1, Math.round((r * 2) / unit));
        const start = -((count - 1) * unit) / 2;
        for (let row = 0; row < count; row++) {
          for (let col = 0; col < count; col++) {
            const bx = start + col * unit;
            const bz = start + row * unit;
            const ax = Math.abs(bx);
            const az = Math.abs(bz);
            if (ax + az * 0.577 <= r) {
              positions.push({ x: bx, z: bz });
            }
          }
        }
        break;
      }
      case "plus": {
        const hCols = Math.max(1, Math.round(obs.width / unit));
        const hRows = Math.max(1, Math.round((obs.height * 0.35) / unit));
        const vCols = Math.max(1, Math.round((obs.width * 0.35) / unit));
        const vRows = Math.max(1, Math.round(obs.height / unit));

        const placed = new Set<string>();
        const addUnique = (x: number, z: number) => {
          const key = `${x.toFixed(1)}_${z.toFixed(1)}`;
          if (!placed.has(key)) {
            placed.add(key);
            positions.push({ x, z });
          }
        };

        const hStartX = -((hCols - 1) * unit) / 2;
        const hStartZ = -((hRows - 1) * unit) / 2;
        for (let r = 0; r < hRows; r++) {
          for (let c = 0; c < hCols; c++) {
            addUnique(hStartX + c * unit, hStartZ + r * unit);
          }
        }
        const vStartX = -((vCols - 1) * unit) / 2;
        const vStartZ = -((vRows - 1) * unit) / 2;
        for (let r = 0; r < vRows; r++) {
          for (let c = 0; c < vCols; c++) {
            addUnique(vStartX + c * unit, vStartZ + r * unit);
          }
        }
        break;
      }
      case "pill": {
        const isHoriz = obs.width >= obs.height;
        const length = Math.max(obs.width, obs.height);
        const thickness = Math.min(obs.width, obs.height);
        const mainCount = Math.max(1, Math.round(length / unit));
        const crossCount = Math.max(1, Math.round(thickness / unit));
        const capR = thickness / 2;

        if (isHoriz) {
          const startX = -((mainCount - 1) * unit) / 2;
          const startZ = -((crossCount - 1) * unit) / 2;
          const halfLen = length / 2;
          for (let r = 0; r < crossCount; r++) {
            for (let c = 0; c < mainCount; c++) {
              const bx = startX + c * unit;
              const bz = startZ + r * unit;
              if (Math.abs(bx) <= halfLen - capR) {
                positions.push({ x: bx, z: bz });
              } else {
                const cx = bx > 0 ? halfLen - capR : -(halfLen - capR);
                const dx = bx - cx;
                if (dx * dx + bz * bz <= capR * capR) {
                  positions.push({ x: bx, z: bz });
                }
              }
            }
          }
        } else {
          const startX = -((crossCount - 1) * unit) / 2;
          const startZ = -((mainCount - 1) * unit) / 2;
          const halfLen = length / 2;
          for (let r = 0; r < mainCount; r++) {
            for (let c = 0; c < crossCount; c++) {
              const bx = startX + c * unit;
              const bz = startZ + r * unit;
              if (Math.abs(bz) <= halfLen - capR) {
                positions.push({ x: bx, z: bz });
              } else {
                const cz = bz > 0 ? halfLen - capR : -(halfLen - capR);
                const dz = bz - cz;
                if (bx * bx + dz * dz <= capR * capR) {
                  positions.push({ x: bx, z: bz });
                }
              }
            }
          }
        }
        break;
      }
      case "tower": {
        const cols = Math.max(1, Math.round(obs.width / unit));
        const layers = Math.max(2, Math.round(obs.height / unit));
        const startX = -((cols - 1) * unit) / 2;
        for (let layer = 0; layer < layers; layer++) {
          for (let c = 0; c < cols; c++) {
            positions.push({ x: startX + c * unit, z: layer * unit * 0.3 });
          }
        }
        break;
      }
      case "pyramid": {
        const baseCols = Math.max(2, Math.round(obs.width / unit));
        const layers = Math.max(2, Math.round(obs.height / unit));
        for (let layer = 0; layer < layers; layer++) {
          const t = layer / Math.max(1, layers - 1);
          const colsThisLayer = Math.max(1, Math.round(baseCols * (1 - t * 0.8)));
          const startX = -((colsThisLayer - 1) * unit) / 2;
          for (let c = 0; c < colsThisLayer; c++) {
            positions.push({ x: startX + c * unit, z: -obs.height / 2 + layer * unit * 0.3 });
          }
        }
        break;
      }
    }

    if (positions.length === 0) {
      positions.push({ x: 0, z: 0 });
    }

    return positions;
  }

  getBrick3DPositions(obs: Obstacle): Array<{ x: number; y: number; z: number }> {
    const positions: Array<{ x: number; y: number; z: number }> = [];
    const unit = BRICK_UNIT;

    if (obs.shape === "tower") {
      const cols = Math.max(1, Math.round(obs.width / unit));
      const layers = Math.max(2, Math.round(obs.height / unit));
      const startX = -((cols - 1) * unit) / 2;

      for (let layer = 0; layer < layers; layer++) {
        for (let c = 0; c < cols; c++) {
          positions.push({
            x: startX + c * unit,
            y: layer * unit * 0.6,
            z: 0,
          });
        }
      }
    } else if (obs.shape === "pyramid") {
      const baseCols = Math.max(2, Math.round(obs.width / unit));
      const layers = Math.max(2, Math.round(obs.height / unit));

      for (let layer = 0; layer < layers; layer++) {
        const t = layer / Math.max(1, layers - 1);
        const colsThisLayer = Math.max(1, Math.round(baseCols * (1 - t * 0.8)));
        const rowsThisLayer = Math.max(1, Math.round(colsThisLayer * 0.6));
        const startX = -((colsThisLayer - 1) * unit) / 2;
        const startZ = -((rowsThisLayer - 1) * unit) / 2;

        for (let r = 0; r < rowsThisLayer; r++) {
          for (let c = 0; c < colsThisLayer; c++) {
            positions.push({
              x: startX + c * unit,
              y: layer * unit * 0.6,
              z: startZ + r * unit,
            });
          }
        }
      }
    }

    if (positions.length === 0) {
      positions.push({ x: 0, y: 0, z: 0 });
    }

    return positions;
  }

  private createObstacleMesh(obs: Obstacle): THREE.Object3D {
    const mat = this.createGlossyMaterial(obs.color);
    const group = new THREE.Group();

    if (obs.shape === "tower" || obs.shape === "pyramid") {
      const positions3D = this.getBrick3DPositions(obs);
      if (this.legoBrickReady && this.legoBrickGeometry) {
        for (const pos of positions3D) {
          const brick = new THREE.Mesh(this.legoBrickGeometry, mat);
          brick.position.set(pos.x, pos.y, pos.z);
          brick.castShadow = true;
          brick.receiveShadow = true;
          group.add(brick);
        }
      } else {
        const fallbackGeo = new THREE.BoxGeometry(BRICK_UNIT * 0.75, BRICK_UNIT * 0.5, BRICK_UNIT * 0.75);
        for (const pos of positions3D) {
          const brick = new THREE.Mesh(fallbackGeo, mat);
          brick.position.set(pos.x, pos.y + BRICK_UNIT * 0.25, pos.z);
          brick.castShadow = true;
          brick.receiveShadow = true;
          group.add(brick);
        }
      }
    } else {
      const positions = this.getBrickPositions(obs);
      if (this.legoBrickReady && this.legoBrickGeometry) {
        for (const pos of positions) {
          const brick = new THREE.Mesh(this.legoBrickGeometry, mat);
          brick.position.set(pos.x, 0, pos.z);
          brick.castShadow = true;
          brick.receiveShadow = true;
          group.add(brick);
        }
      } else {
        const fallbackGeo = new THREE.BoxGeometry(BRICK_UNIT * 0.75, BRICK_UNIT * 0.5, BRICK_UNIT * 0.75);
        for (const pos of positions) {
          const brick = new THREE.Mesh(fallbackGeo, mat);
          brick.position.set(pos.x, BRICK_UNIT * 0.25, pos.z);
          brick.castShadow = true;
          brick.receiveShadow = true;
          group.add(brick);
        }
      }
    }

    return group;
  }

  drawParticles(particles: Particle[], _camera: CameraState): void {
    while (this.particleMeshPool.length < particles.length) {
      const geo = new THREE.SphereGeometry(1, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });
      const pMesh = new THREE.Mesh(geo, mat);
      pMesh.visible = false;
      this.scene.add(pMesh);
      this.particleMeshPool.push({ mesh: pMesh, active: false });
    }

    let poolIdx = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      if (poolIdx >= this.particleMeshPool.length) break;

      const entry = this.particleMeshPool[poolIdx];
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + 0.5 * alpha);

      const wx = gameToWorldX(p.pos.x, this._width);
      const wz = gameToWorldZ(p.pos.y);

      entry.mesh.visible = true;
      entry.mesh.position.set(wx, PARTICLE_HOVER_Y, wz);
      entry.mesh.scale.setScalar(size);
      (entry.mesh.material as THREE.MeshBasicMaterial).color.set(p.color);
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
      entry.active = true;
      poolIdx++;
    }

    for (let i = poolIdx; i < this.particleMeshPool.length; i++) {
      this.particleMeshPool[i].mesh.visible = false;
      this.particleMeshPool[i].active = false;
    }
  }

  render(): void {
    this.threeRenderer.render(this.scene, this.camera);
  }

  updateCameraPosition(cameraY: number): void {
    const lookZ = gameToWorldZ(cameraY + this._height / 2);
    this.camera.position.set(0, CAM_HEIGHT, lookZ + CAM_TILT_OFFSET);
    this.camera.lookAt(0, 0, lookZ);

    if (this.groundPlane) {
      this.groundPlane.position.z = lookZ;
    }

    this.dirLight.position.set(50, 150, lookZ - 50);
    this.dirLight.target.position.set(0, 0, lookZ);
    this.dirLight.target.updateMatrixWorld();
  }

  private disposeObject(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry !== this.legoBrickGeometry) {
        obj.geometry?.dispose();
      }
      if (obj.material instanceof THREE.Material) {
        obj.material.dispose();
      } else if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      }
    }
    if (obj instanceof THREE.Group) {
      for (const child of obj.children) {
        this.disposeObject(child);
      }
    }
  }
}
