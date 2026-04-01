import Matter from "matter-js";
import { getBallAssets, type BallAsset } from "./ballAssets";
import {
  getBoundsForId,
  isCircleConfig,
  isPolygonConfig,
  isValidPolygonCollider,
  loadStoredBoundsMap,
  polygonToPixelOffsetsFromCenter,
  type BallColliderConfig,
} from "./ballBounds";
import { BALL_TIER_ORDER } from "./ballTiers";

export interface GameLayout {
  w: number;
  h: number;
  cupX: number;
  cupY: number;
  cupW: number;
  cupH: number;
  dangerY: number;
}

interface BallRuntime {
  tier: number;
  assetId: string;
  displayRadius: number;
  /** Draw sprite at body.position + spriteOffset */
  spriteOffsetX: number;
  spriteOffsetY: number;
  /**
   * New drops spawn above the danger line with v=0 and briefly count as "settled".
   * Only run overflow checks after the ball has actually entered play (past the line or moving).
   */
  canLoseOnDanger: boolean;
  spawnedAt: number;
}

const WALL_LABEL = "wall";
const BALL_LABEL = "ball";

function tierRadius(layout: GameLayout, tier: number, numTiers: number): number {
  const m = Math.min(layout.cupW, layout.cupH);
  const r0 = m * 0.042;
  const g = 1.26;
  const r = r0 * Math.pow(g, tier);
  const cap = m * 0.38;
  return Math.min(r, cap);
}

function resolveTierIds(assets: BallAsset[]): string[] {
  if (BALL_TIER_ORDER.length > 0) {
    const set = new Set(assets.map((a) => a.id));
    return BALL_TIER_ORDER.filter((id) => set.has(id));
  }
  return assets.map((a) => a.id);
}

export class SuikaGame {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private assets: BallAsset[] = [];
  private tierIds: string[] = [];
  private images = new Map<string, HTMLImageElement>();
  private boundsMap: Record<string, BallColliderConfig> = {};
  private ballData = new Map<number, BallRuntime>();
  private walls: Matter.Body[] = [];
  private mergeQueue: Array<{ a: Matter.Body; b: Matter.Body }> = [];
  private mergeKeys = new Set<string>();
  private pendingDrop: boolean;
  private currentTier: number;
  private nextTier: number;
  private score = 0;
  private gameOver = false;
  private dropperX = 0;
  private pointerActive = false;
  private layout: GameLayout;
  private onScoreChange: (n: number) => void;
  private onNextChange: (assetId: string, url: string) => void;
  private onGameOver: (score: number) => void;
  private getSettings: () => { haptics: boolean };
  private collisionHandler: (e: Matter.IEventCollision<Matter.Engine>) => void;
  private afterUpdateHandler: () => void;

  constructor(
    layout: GameLayout,
    callbacks: {
      onScoreChange: (n: number) => void;
      onNextChange: (assetId: string, url: string) => void;
      onGameOver: (score: number) => void;
      getSettings: () => { haptics: boolean };
    },
  ) {
    this.layout = layout;
    this.onScoreChange = callbacks.onScoreChange;
    this.onNextChange = callbacks.onNextChange;
    this.onGameOver = callbacks.onGameOver;
    this.getSettings = callbacks.getSettings;

    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.15 },
      enableSleeping: true,
    });
    this.runner = Matter.Runner.create();
    Matter.Runner.run(this.runner, this.engine);

    this.pendingDrop = true;
    this.currentTier = 0;
    this.nextTier = 0;

    this.collisionHandler = (e) => this.handleCollisionStart(e);
    this.afterUpdateHandler = () => this.processMergeQueue();
    Matter.Events.on(this.engine, "collisionStart", this.collisionHandler);
    Matter.Events.on(this.engine, "afterUpdate", this.afterUpdateHandler);
  }

  async loadAssets(): Promise<boolean> {
    this.assets = getBallAssets();
    this.tierIds = resolveTierIds(this.assets);
    this.boundsMap = loadStoredBoundsMap();
    if (this.tierIds.length === 0) {
      console.log("[SuikaGame]", "no ball images in assets");
      return false;
    }
    const urlById = new Map(this.assets.map((a) => [a.id, a.url] as const));
    for (const id of this.tierIds) {
      const url = urlById.get(id);
      if (!url) continue;
      const img = await loadImage(url);
      this.images.set(id, img);
    }
    this.rollNextTiers();
    return true;
  }

  private rollNextTiers(): void {
    const maxSpawn = Math.min(4, this.tierIds.length);
    if (this.pendingDrop) {
      this.currentTier = randInt(0, maxSpawn - 1);
    }
    this.nextTier = randInt(0, maxSpawn - 1);
    const na = this.tierIds[this.nextTier];
    const asset = this.assets.find((a) => a.id === na);
    if (asset) this.onNextChange(na, asset.url);
  }

  resetRound(layout: GameLayout): void {
    this.layout = layout;
    this.gameOver = false;
    this.score = 0;
    this.pendingDrop = true;
    this.mergeQueue = [];
    this.mergeKeys.clear();
    this.ballData.clear();
    Matter.World.clear(this.engine.world, false);
    this.walls = [];
    this.buildWalls();
    this.dropperX = layout.cupX + layout.cupW / 2;
    this.rollNextTiers();
    this.onScoreChange(0);
  }

  private buildWalls(): void {
    const { cupX, cupY, cupW, cupH } = this.layout;
    const t = 28;
    const wallOpts: Matter.IBodyDefinition = {
      isStatic: true,
      label: WALL_LABEL,
      friction: 0.12,
      render: { visible: false },
    };
    const left = Matter.Bodies.rectangle(cupX + t / 2, cupY + cupH / 2, t, cupH + t * 2, wallOpts);
    const right = Matter.Bodies.rectangle(cupX + cupW - t / 2, cupY + cupH / 2, t, cupH + t * 2, wallOpts);
    const bottom = Matter.Bodies.rectangle(cupX + cupW / 2, cupY + cupH - t / 2, cupW, t, wallOpts);
    this.walls = [left, right, bottom];
    Matter.World.add(this.engine.world, this.walls);
  }

  setLayout(layout: GameLayout): void {
    this.layout = layout;
    if (this.walls.length === 0) return;
    this.repositionWalls();
  }

  private repositionWalls(): void {
    const { cupX, cupY, cupW, cupH } = this.layout;
    const t = 28;
    if (this.walls.length >= 3) {
      Matter.Body.setPosition(this.walls[0], { x: cupX + t / 2, y: cupY + cupH / 2 });
      Matter.Body.setPosition(this.walls[1], { x: cupX + cupW - t / 2, y: cupY + cupH / 2 });
      Matter.Body.setPosition(this.walls[2], { x: cupX + cupW / 2, y: cupY + cupH - t / 2 });
    }
  }

  dispose(): void {
    Matter.Events.off(this.engine, "collisionStart", this.collisionHandler);
    Matter.Events.off(this.engine, "afterUpdate", this.afterUpdateHandler);
    Matter.Runner.stop(this.runner);
    Matter.Engine.clear(this.engine);
  }

  getScore(): number {
    return this.score;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  canDrop(): boolean {
    return this.pendingDrop && !this.gameOver;
  }

  handlePointer(clientX: number, _clientY: number, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const scale = canvas.width / rect.width;
    const px = x * scale;
    const r = tierRadius(this.layout, this.currentTier, this.tierIds.length);
    const minX = this.layout.cupX + r + 8;
    const maxX = this.layout.cupX + this.layout.cupW - r - 8;
    this.dropperX = Math.max(minX, Math.min(maxX, px));
    this.pointerActive = true;
  }

  pointerLeave(): void {
    this.pointerActive = false;
  }

  tryDrop(): void {
    if (!this.canDrop()) return;
    const r = tierRadius(this.layout, this.currentTier, this.tierIds.length);
    const spriteX = this.dropperX;
    const spriteY = this.layout.cupY + r + 14;
    const body = this.createBallBody(spriteX, spriteY, this.currentTier, { canLoseOnDanger: false });
    if (!body) return;
    Matter.World.add(this.engine.world, body);
    this.pendingDrop = false;
    this.currentTier = this.nextTier;
    this.rollNextTiers();
  }

  private createBallBody(
    spriteX: number,
    spriteY: number,
    tier: number,
    opts?: { canLoseOnDanger?: boolean },
  ): Matter.Body | null {
    const assetId = this.tierIds[tier];
    if (!assetId) return null;
    const img = this.images.get(assetId);
    if (!img || img.naturalWidth === 0) return null;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const minSide = Math.min(nw, nh);
    const displayRadius = tierRadius(this.layout, tier, this.tierIds.length);
    const displayScale = (2 * displayRadius) / minSide;
    const bounds = getBoundsForId(assetId, this.boundsMap);

    const common: Matter.IBodyDefinition = {
      label: BALL_LABEL,
      friction: 0.18,
      frictionAir: 0.012,
      restitution: 0.08,
      density: 0.0018,
      sleepThreshold: 36,
    };

    let body: Matter.Body;
    let spriteOffsetX: number;
    let spriteOffsetY: number;

    if (isCircleConfig(bounds)) {
      const dr = displayRadius;
      const cx = spriteX + bounds.offsetX * dr;
      const cy = spriteY + bounds.offsetY * dr;
      const rad = Math.max(4, bounds.radiusScale * dr);
      body = Matter.Bodies.circle(cx, cy, rad, common);
      spriteOffsetX = spriteX - cx;
      spriteOffsetY = spriteY - cy;
    } else if (isPolygonConfig(bounds) && isValidPolygonCollider(bounds)) {
      const local = polygonToPixelOffsetsFromCenter(bounds.vertices, nw, nh, displayScale);
      const worldVerts = local.map((v) => ({ x: spriteX + v.x, y: spriteY + v.y }));
      body = Matter.Bodies.fromVertices(spriteX, spriteY, [worldVerts], common, false);
      spriteOffsetX = spriteX - body.position.x;
      spriteOffsetY = spriteY - body.position.y;
    } else {
      const dr = displayRadius;
      body = Matter.Bodies.circle(spriteX, spriteY, dr * 0.45, common);
      spriteOffsetX = 0;
      spriteOffsetY = 0;
    }

    this.ballData.set(body.id, {
      tier,
      assetId,
      displayRadius,
      spriteOffsetX,
      spriteOffsetY,
      canLoseOnDanger: opts?.canLoseOnDanger === true,
      spawnedAt: performance.now(),
    });
    return body;
  }

  private handleCollisionStart(e: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a.label !== BALL_LABEL || b.label !== BALL_LABEL) continue;
      const da = this.ballData.get(a.id);
      const db = this.ballData.get(b.id);
      if (!da || !db) continue;
      if (da.tier !== db.tier) continue;
      if (da.tier >= this.tierIds.length - 1) continue;
      const k = a.id < b.id ? a.id + ":" + b.id : b.id + ":" + a.id;
      if (this.mergeKeys.has(k)) continue;
      this.mergeKeys.add(k);
      this.mergeQueue.push({ a, b });
    }
  }

  private processMergeQueue(): void {
    if (this.gameOver) return;
    if (this.mergeQueue.length === 0) return;
    const batch = this.mergeQueue.splice(0, this.mergeQueue.length);
    for (const { a, b } of batch) {
      const da = this.ballData.get(a.id);
      const db = this.ballData.get(b.id);
      if (!da || !db) continue;
      if (da.tier !== db.tier) continue;
      const newTier = da.tier + 1;
      if (newTier >= this.tierIds.length) continue;
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;

      Matter.World.remove(this.engine.world, a);
      Matter.World.remove(this.engine.world, b);
      this.ballData.delete(a.id);
      this.ballData.delete(b.id);

      const nb = this.createBallBody(mx, my, newTier, { canLoseOnDanger: true });
      if (nb) {
        Matter.Body.setVelocity(nb, { x: (Math.random() - 0.5) * 1.2, y: -1.8 - Math.random() * 0.8 });
        Matter.World.add(this.engine.world, nb);
      }

      this.score += (da.tier + 1) * 10;
      this.onScoreChange(this.score);
    }
    this.mergeKeys.clear();
  }

  update(_dt: number): void {
    if (this.gameOver) return;

    let anyMoving = false;
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.label !== BALL_LABEL) continue;
      const s = Math.hypot(body.velocity.x, body.velocity.y);
      const w = Math.abs(body.angularVelocity);
      if (s > 0.1 || w > 0.022) anyMoving = true;
    }
    if (!this.pendingDrop && !anyMoving) {
      this.pendingDrop = true;
    }

    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.label !== BALL_LABEL) continue;
      const data = this.ballData.get(body.id);
      if (!data) continue;

      const s = Math.hypot(body.velocity.x, body.velocity.y);
      const w = Math.abs(body.angularVelocity);

      if (!data.canLoseOnDanger) {
        if (body.position.y >= this.layout.dangerY) {
          data.canLoseOnDanger = true;
        } else if (s > 0.2) {
          data.canLoseOnDanger = true;
        } else if (performance.now() - data.spawnedAt > 3200) {
          data.canLoseOnDanger = true;
        } else {
          continue;
        }
      }

      const settled = body.isSleeping || (s < 0.05 && w < 0.01);
      if (!settled) continue;
      if (body.bounds.min.y < this.layout.dangerY) {
        this.triggerGameOver();
        return;
      }
    }
  }

  nudgeDropper(canvas: HTMLCanvasElement, dxScreenPx: number): void {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    this.dropperX += dxScreenPx * scale;
    const r = tierRadius(this.layout, this.currentTier, this.tierIds.length);
    const minX = this.layout.cupX + r + 8;
    const maxX = this.layout.cupX + this.layout.cupW - r - 8;
    this.dropperX = Math.max(minX, Math.min(maxX, this.dropperX));
    this.pointerActive = true;
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    const s = this.getSettings();
    if (s.haptics && typeof (window as unknown as { triggerHaptic?: (t: string) => void }).triggerHaptic === "function") {
      (window as unknown as { triggerHaptic: (t: string) => void }).triggerHaptic("error");
    }
    if (typeof (window as unknown as { submitScore?: (n: number) => void }).submitScore === "function") {
      (window as unknown as { submitScore: (n: number) => void }).submitScore(Math.max(0, Math.floor(this.score)));
    }
    this.onGameOver(this.score);
    console.log("[SuikaGame]", "game over score", this.score);
  }

  draw(ctx: CanvasRenderingContext2D, layout: GameLayout): void {
    this.layout = layout;
    const bodies = Matter.Composite.allBodies(this.engine.world);
    for (const body of bodies) {
      if (body.label !== BALL_LABEL) continue;
      const data = this.ballData.get(body.id);
      if (!data) continue;
      const img = this.images.get(data.assetId);
      if (!img) continue;
      const sx = body.position.x + data.spriteOffsetX;
      const sy = body.position.y + data.spriteOffsetY;
      const dr = data.displayRadius;
      const dw = dr * 2 * (img.naturalWidth / Math.min(img.naturalWidth, img.naturalHeight));
      const dh = dr * 2 * (img.naturalHeight / Math.min(img.naturalWidth, img.naturalHeight));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(body.angle);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    if (!this.gameOver && this.pendingDrop && this.pointerActive) {
      const aid = this.tierIds[this.currentTier];
      const preview = aid ? this.images.get(aid) : undefined;
      const r = tierRadius(layout, this.currentTier, this.tierIds.length);
      const px = this.dropperX;
      const py = layout.cupY + r + 14;
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (preview && preview.complete) {
        const dw = r * 2 * (preview.naturalWidth / Math.min(preview.naturalWidth, preview.naturalHeight));
        const dh = r * 2 * (preview.naturalHeight / Math.min(preview.naturalWidth, preview.naturalHeight));
        ctx.drawImage(preview, px - dw / 2, py - dh / 2, dw, dh);
      } else {
        ctx.fillStyle = "rgba(255, 159, 67, 0.45)";
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  stepPhysics(): void {
    if (this.gameOver) return;
    Matter.Engine.update(this.engine, 1000 / 60);
  }
}

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("img " + url));
    i.src = url;
  });
}
