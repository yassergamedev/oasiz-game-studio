import Matter from "matter-js";
import { getBallAssets, type BallAsset } from "./ballAssets";
import {
  DEFAULT_CIRCLE,
  getBoundsForId,
  isCircleConfig,
  isPolygonConfig,
  isValidPolygonCollider,
  loadStoredBoundsMap,
  polygonPixelOffsetsLookSane,
  polygonToPixelOffsetsFromCenter,
  sanitizeCircleConfig,
  type BallColliderConfig,
} from "./ballBounds";
import { isLikelyIOS } from "./platformDevices";
import { resolveTierIds } from "./ballTiers";
import type { MergeFanfarePayload } from "./mergeFanfare";
import { submitFinalScoreToPlatform } from "./platformBridge";
import { tierRadiusFromCupMin } from "./tierSizing";

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

/** One full slow zoom-in / zoom-out cycle on the merge hint ball after pointer is down (ms). */
const MERGE_HINT_ZOOM_PERIOD_MS = 3200;
const MERGE_HINT_ZOOM_PEAK = 0.2;

/**
 * Inner edge of the drawn cup (main.ts strokes roundRect with lineWidth 6, centered on path).
 * Wall inner faces are placed here so balls meet the visible border, not ~25px inside.
 */
const CUP_INNER_INSET = 5;
const WALL_THICKNESS = 28;

function tierRadius(layout: GameLayout, tier: number, _numTiers: number): number {
  return tierRadiusFromCupMin(Math.min(layout.cupW, layout.cupH), tier);
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
  /** Body that crossed the danger line (for game-over focus VFX). */
  private losingBallBodyId: number | null = null;
  private dropperX = 0;
  private pointerActive = false;
  /** When the drop preview first appears (pointer down / nudge), for scale-in draw. */
  private previewAnimStartAt = 0;
  private layout: GameLayout;
  private onScoreChange: (n: number) => void;
  private onNextChange: (assetId: string, url: string) => void;
  private onGameOver: (score: number) => void;
  private getSettings: () => { haptics: boolean };
  private onMerge?: (payload: MergeFanfarePayload) => void;
  private onDrop?: () => void;
  private onWallBounce?: (speed: number) => void;
  private lastWallBounceSfxAt = 0;
  private collisionHandler: (e: Matter.IEventCollision<Matter.Engine>) => void;
  private afterUpdateHandler: () => void;
  /** iOS WebKit: avoid fromVertices polygons, tighter solver, no sleeping (stack glitches). */
  private readonly iosPhysicsHost: boolean;

  constructor(
    layout: GameLayout,
    callbacks: {
      onScoreChange: (n: number) => void;
      onNextChange: (assetId: string, url: string) => void;
      onGameOver: (score: number) => void;
      getSettings: () => { haptics: boolean };
      onMerge?: (payload: MergeFanfarePayload) => void;
      onDrop?: () => void;
      onWallBounce?: (speed: number) => void;
    },
  ) {
    this.layout = layout;
    this.onScoreChange = callbacks.onScoreChange;
    this.onNextChange = callbacks.onNextChange;
    this.onGameOver = callbacks.onGameOver;
    this.getSettings = callbacks.getSettings;
    this.onMerge = callbacks.onMerge;
    this.onDrop = callbacks.onDrop;
    this.onWallBounce = callbacks.onWallBounce;

    this.iosPhysicsHost = isLikelyIOS();
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.15 },
      enableSleeping: !this.iosPhysicsHost,
      positionIterations: this.iosPhysicsHost ? 10 : 6,
      velocityIterations: this.iosPhysicsHost ? 6 : 4,
      constraintIterations: this.iosPhysicsHost ? 4 : 2,
    });
    if (this.iosPhysicsHost) {
      console.log("[SuikaGame]", "iOS-style host: stable solver, no sleep, circle colliders only");
    }
    this.runner = Matter.Runner.create();
    /**
     * Do not use Matter.Runner.run — it uses its own rAF and doubles up with stepPhysics()
     * in the canvas loop. After app background/resume, two timers desync and the game can freeze.
     * Physics is stepped only from SuikaGame.stepPhysics() (see main drawFrame).
     */

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
    this.losingBallBodyId = null;
    this.score = 0;
    this.pendingDrop = true;
    this.mergeQueue = [];
    this.mergeKeys.clear();
    this.ballData.clear();
    Matter.World.clear(this.engine.world, false);
    this.walls = [];
    this.buildWalls();
    this.dropperX = layout.cupX + layout.cupW / 2;
    this.pointerActive = false;
    this.previewAnimStartAt = 0;
    this.rollNextTiers();
    this.onScoreChange(0);
  }

  private buildWalls(): void {
    const { cupX, cupY, cupW, cupH } = this.layout;
    const t = WALL_THICKNESS;
    const inset = CUP_INNER_INSET;
    const wallOpts: Matter.IBodyDefinition = {
      isStatic: true,
      label: WALL_LABEL,
      friction: 0.1,
      restitution: 0.24,
      render: { visible: false },
    };
    const leftCx = cupX + inset - t / 2;
    const rightCx = cupX + cupW - inset + t / 2;
    /* Top of floor slab = cup inner bottom; body center is half thickness below that surface. */
    const bottomCy = cupY + cupH - inset + t / 2;
    const left = Matter.Bodies.rectangle(leftCx, cupY + cupH / 2, t, cupH + t * 2, wallOpts);
    const right = Matter.Bodies.rectangle(rightCx, cupY + cupH / 2, t, cupH + t * 2, wallOpts);
    const bottom = Matter.Bodies.rectangle(cupX + cupW / 2, bottomCy, cupW, t, wallOpts);
    this.walls = [left, right, bottom];
    Matter.World.add(this.engine.world, this.walls);
  }

  setLayout(layout: GameLayout): void {
    const prev = this.layout;
    this.layout = layout;
    if (this.walls.length === 0) return;
    this.repositionWalls();
    this.remapBallsAndDropperToLayout(prev, layout);
  }

  /**
   * Keep balls and aim under the cup when the viewport resizes (walls move; bodies must follow).
   * Maps each ball's center from the previous inner cup box to the new one in normalized coords.
   */
  private remapBallsAndDropperToLayout(prev: GameLayout, next: GameLayout): void {
    const inset = CUP_INNER_INSET;
    const prevIW = Math.max(12, prev.cupW - 2 * inset);
    const prevIH = Math.max(12, prev.cupH - inset);
    const nextIW = Math.max(12, next.cupW - 2 * inset);
    const nextIH = Math.max(12, next.cupH - inset);
    const prevL = prev.cupX + inset;
    const prevT = prev.cupY;
    const nextL = next.cupX + inset;
    const nextT = next.cupY;

    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.label !== BALL_LABEL) continue;
      const px = body.position.x;
      const py = body.position.y;
      const tx = (px - prevL) / prevIW;
      const ty = (py - prevT) / prevIH;
      const nx = nextL + tx * nextIW;
      const ny = nextT + ty * nextIH;
      Matter.Body.setPosition(body, { x: nx, y: ny });
      const data = this.ballData.get(body.id);
      if (data) {
        data.displayRadius = tierRadius(next, data.tier, this.tierIds.length);
      }
    }

    const dtx = (this.dropperX - prevL) / prevIW;
    this.dropperX = nextL + dtx * nextIW;
    const r = tierRadius(next, this.currentTier, this.tierIds.length);
    const minX = next.cupX + inset + r;
    const maxX = next.cupX + next.cupW - inset - r;
    this.dropperX = Math.max(minX, Math.min(maxX, this.dropperX));
  }

  private repositionWalls(): void {
    const { cupX, cupY, cupW, cupH } = this.layout;
    const t = WALL_THICKNESS;
    const inset = CUP_INNER_INSET;
    if (this.walls.length >= 3) {
      Matter.Body.setPosition(this.walls[0], { x: cupX + inset - t / 2, y: cupY + cupH / 2 });
      Matter.Body.setPosition(this.walls[1], { x: cupX + cupW - inset + t / 2, y: cupY + cupH / 2 });
      Matter.Body.setPosition(this.walls[2], { x: cupX + cupW / 2, y: cupY + cupH - inset + t / 2 });
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

  /**
   * Canvas-space center of the ball that caused game over (sprite anchor), for zoom / UI.
   */
  getGameOverFocus(): { cx: number; cy: number; r: number } | null {
    if (!this.gameOver || this.losingBallBodyId === null) return null;
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.id !== this.losingBallBodyId || body.label !== BALL_LABEL) continue;
      const data = this.ballData.get(body.id);
      if (!data) return null;
      return {
        cx: body.position.x + data.spriteOffsetX,
        cy: body.position.y + data.spriteOffsetY,
        r: data.displayRadius,
      };
    }
    return null;
  }

  /** Merge order for HUD: tier 0 (smallest) → last (largest). */
  getEvolutionChain(): { id: string; url: string }[] {
    const urlById = new Map(this.assets.map((a) => [a.id, a.url] as const));
    const out: { id: string; url: string }[] = [];
    for (const id of this.tierIds) {
      const url = urlById.get(id);
      if (url) out.push({ id, url });
    }
    return out;
  }

  canDrop(): boolean {
    return this.pendingDrop && !this.gameOver;
  }

  handlePointer(clientX: number, _clientY: number, canvas: HTMLCanvasElement): void {
    const wasActive = this.pointerActive;
    const rect = canvas.getBoundingClientRect();
    const xCss = clientX - rect.left;
    const wRatio = rect.width > 0 ? this.layout.w / rect.width : 1;
    const px = xCss * wRatio;
    const r = tierRadius(this.layout, this.currentTier, this.tierIds.length);
    const inset = CUP_INNER_INSET;
    const minX = this.layout.cupX + inset + r;
    const maxX = this.layout.cupX + this.layout.cupW - inset - r;
    this.dropperX = Math.max(minX, Math.min(maxX, px));
    this.pointerActive = true;
    if (!wasActive) {
      this.previewAnimStartAt = performance.now();
    }
  }

  pointerLeave(): void {
    this.pointerActive = false;
    this.previewAnimStartAt = 0;
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
    this.onDrop?.();
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
    let bounds: BallColliderConfig = getBoundsForId(assetId, this.boundsMap);
    if (this.iosPhysicsHost && isPolygonConfig(bounds)) {
      bounds = { ...DEFAULT_CIRCLE };
    }
    if (isCircleConfig(bounds)) {
      bounds = sanitizeCircleConfig(bounds);
    }

    const common: Matter.IBodyDefinition = {
      label: BALL_LABEL,
      friction: 0.14,
      frictionAir: 0.011,
      restitution: 0.32,
      density: 0.0018,
      sleepThreshold: this.iosPhysicsHost ? 60 : 36,
      slop: this.iosPhysicsHost ? 0.085 : 0.05,
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
      /**
       * Without poly-decomp, Matter replaces concave shapes with a convex hull that often
       * mismatches the sprite. Embedded WebViews also occasionally throw from fromVertices.
       */
      const drFallback = displayRadius;
      const radFallback = Math.max(4, DEFAULT_CIRCLE.radiusScale * drFallback);
      body = Matter.Bodies.circle(spriteX, spriteY, radFallback, common);
      spriteOffsetX = 0;
      spriteOffsetY = 0;
      const sanePoly = polygonPixelOffsetsLookSane(local, displayRadius);
      const convexOk = sanePoly && Matter.Vertices.isConvex(worldVerts);
      if (convexOk) {
        try {
          const polyBody = Matter.Bodies.fromVertices(
            spriteX,
            spriteY,
            [worldVerts],
            common,
            false,
            0.01,
            0,
          );
          const bw = polyBody.bounds.max.x - polyBody.bounds.min.x;
          const bh = polyBody.bounds.max.y - polyBody.bounds.min.y;
          const spanOk = bw < displayRadius * 9 && bh < displayRadius * 9;
          if (
            spanOk &&
            polyBody.area >= 8 &&
            Number.isFinite(polyBody.position.x) &&
            Number.isFinite(polyBody.position.y)
          ) {
            body = polyBody;
            spriteOffsetX = spriteX - body.position.x;
            spriteOffsetY = spriteY - body.position.y;
          }
        } catch (err) {
          console.log("[createBallBody]", "fromVertices failed, using circle", err);
        }
      }
    } else {
      const dr = displayRadius;
      const rad = Math.max(4, DEFAULT_CIRCLE.radiusScale * dr);
      body = Matter.Bodies.circle(spriteX, spriteY, rad, common);
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
    const now = performance.now();
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const ball = a.label === BALL_LABEL ? a : b.label === BALL_LABEL ? b : null;
      const wall = a.label === WALL_LABEL ? a : b.label === WALL_LABEL ? b : null;
      if (ball && wall && now - this.lastWallBounceSfxAt > 90) {
        const sp = Math.hypot(ball.velocity.x, ball.velocity.y);
        if (sp > 0.42) {
          this.lastWallBounceSfxAt = now;
          this.onWallBounce?.(sp);
        }
      }
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

      const scoreAdd = (da.tier + 1) * 10;
      this.onMerge?.({
        x: mx,
        y: my,
        newTier,
        prevTier: da.tier,
        scoreAdd,
      });
      this.score += scoreAdd;
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
        this.losingBallBodyId = body.id;
        this.triggerGameOver();
        return;
      }
    }
  }

  nudgeDropper(canvas: HTMLCanvasElement, dxScreenPx: number): void {
    const wasActive = this.pointerActive;
    const rect = canvas.getBoundingClientRect();
    const wRatio = rect.width > 0 ? this.layout.w / rect.width : 1;
    this.dropperX += dxScreenPx * wRatio;
    const r = tierRadius(this.layout, this.currentTier, this.tierIds.length);
    const inset = CUP_INNER_INSET;
    const minX = this.layout.cupX + inset + r;
    const maxX = this.layout.cupX + this.layout.cupW - inset - r;
    this.dropperX = Math.max(minX, Math.min(maxX, this.dropperX));
    this.pointerActive = true;
    if (!wasActive) {
      this.previewAnimStartAt = performance.now();
    }
  }

  /** Same-tier ball in the cup closest to the aim column (pre-drop merge hint). */
  private findSimilarBallIdForDropHint(
    bodies: Matter.Body[],
    tier: number,
    columnX: number,
  ): number | null {
    const r = tierRadius(this.layout, tier, this.tierIds.length);
    const px = columnX;
    const py = this.layout.cupY + r + 14;
    let best: Matter.Body | null = null;
    let bestD = Infinity;
    for (const body of bodies) {
      if (body.label !== BALL_LABEL) continue;
      const data = this.ballData.get(body.id);
      if (!data || data.tier !== tier) continue;
      const sx = body.position.x + data.spriteOffsetX;
      const sy = body.position.y + data.spriteOffsetY;
      if (sx < this.layout.cupX - 8 || sx > this.layout.cupX + this.layout.cupW + 8) continue;
      if (sy < this.layout.cupY - 4 || sy > this.layout.cupY + this.layout.cupH + 20) continue;
      const dx = sx - px;
      const dy = sy - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = body;
      }
    }
    return best ? best.id : null;
  }

  private preDropMergeHintScale(
    bodyId: number,
    hintTargetId: number | null,
    nowMs: number,
    reducedMotion: boolean,
  ): number {
    if (reducedMotion || hintTargetId === null || bodyId !== hintTargetId) return 1;
    const t = (nowMs * 2 * Math.PI) / MERGE_HINT_ZOOM_PERIOD_MS;
    return 1 + MERGE_HINT_ZOOM_PEAK * 0.5 * (1 + Math.sin(t));
  }

  private drawLosingBallHighlight(
    ctx: CanvasRenderingContext2D,
    body: Matter.Body,
    data: BallRuntime,
    nowMs: number,
    ramp: number,
  ): void {
    const sx = body.position.x + data.spriteOffsetX;
    const sy = body.position.y + data.spriteOffsetY;
    const pulse = Math.sin(nowMs * 0.0075) * 0.5 + 0.5;
    const ringBoost = 6 + pulse * 10;
    const rGlow = data.displayRadius + ringBoost + 18;
    const a = Math.max(0, Math.min(1, ramp));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, 0, data.displayRadius * 0.15, 0, 0, rGlow);
    g.addColorStop(0, "rgba(255, 255, 220, " + ((0.22 + pulse * 0.28) * a).toFixed(3) + ")");
    g.addColorStop(0.45, "rgba(255, 140, 60, " + ((0.18 + pulse * 0.22) * a).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255, 40, 20, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rGlow, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255, 255, 255, " + ((0.55 + pulse * 0.4) * a).toFixed(3) + ")";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, data.displayRadius + 5 + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 70, 40, " + ((0.75 + pulse * 0.22) * a).toFixed(3) + ")";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, data.displayRadius + 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    submitFinalScoreToPlatform(this.score);
    this.onGameOver(this.score);
    console.log("[SuikaGame]", "game over score", this.score);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layout: GameLayout,
    nowMs: number = performance.now(),
    losingBallHighlightRamp = 1,
    reducedMotion = false,
  ): void {
    this.layout = layout;
    const bodies = Matter.Composite.allBodies(this.engine.world);
    const mergeHintTargetId =
      !this.gameOver && this.pendingDrop && this.pointerActive
        ? this.findSimilarBallIdForDropHint(bodies, this.currentTier, this.dropperX)
        : null;
    let highlight: { body: Matter.Body; data: BallRuntime } | null = null;
    for (const body of bodies) {
      if (body.label !== BALL_LABEL) continue;
      const data = this.ballData.get(body.id);
      if (!data) continue;
      if (this.gameOver && body.id === this.losingBallBodyId) {
        highlight = { body, data };
      }
      const img = this.images.get(data.assetId);
      if (!img) continue;
      const sx = body.position.x + data.spriteOffsetX;
      const sy = body.position.y + data.spriteOffsetY;
      const dr = data.displayRadius;
      const dw = dr * 2 * (img.naturalWidth / Math.min(img.naturalWidth, img.naturalHeight));
      const dh = dr * 2 * (img.naturalHeight / Math.min(img.naturalWidth, img.naturalHeight));
      const hintScl = this.preDropMergeHintScale(body.id, mergeHintTargetId, nowMs, reducedMotion);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(body.angle);
      ctx.scale(hintScl, hintScl);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    if (highlight) {
      this.drawLosingBallHighlight(ctx, highlight.body, highlight.data, nowMs, losingBallHighlightRamp);
    }

    if (!this.gameOver && this.pendingDrop && this.pointerActive) {
      const aid = this.tierIds[this.currentTier];
      const preview = aid ? this.images.get(aid) : undefined;
      const r = tierRadius(layout, this.currentTier, this.tierIds.length);
      const px = this.dropperX;
      const py = layout.cupY + r + 14;
      const now = performance.now();
      const previewInMs = 165;
      let previewScl = 1;
      if (this.previewAnimStartAt > 0) {
        const elapsed = now - this.previewAnimStartAt;
        if (elapsed < previewInMs) {
          const u = elapsed / previewInMs;
          const ease = 1 - (1 - u) * (1 - u) * (1 - u);
          previewScl = 0.22 + 0.78 * ease;
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.2 * previewScl;
      if (preview && preview.complete) {
        let dw = r * 2 * (preview.naturalWidth / Math.min(preview.naturalWidth, preview.naturalHeight));
        let dh = r * 2 * (preview.naturalHeight / Math.min(preview.naturalWidth, preview.naturalHeight));
        dw *= previewScl;
        dh *= previewScl;
        ctx.drawImage(preview, px - dw / 2, py - dh / 2, dw, dh);
      } else {
        ctx.fillStyle = "rgba(255, 159, 67, 0.45)";
        ctx.beginPath();
        ctx.arc(px, py, r * previewScl, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  stepPhysics(): void {
    if (this.gameOver) return;
    const dt = 1000 / 60;
    /* Match prior feel: Runner + this hook used to advance ~2x per display frame. */
    Matter.Engine.update(this.engine, dt);
    Matter.Engine.update(this.engine, dt);
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
