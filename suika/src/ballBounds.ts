/**
 * Colliders for sports ball sprites (Matter.js later).
 * Coordinates: origin = image center; one unit = min(naturalWidth, naturalHeight) / 2.
 * Circle: radiusScale * 1 = collision radius in those units; offset shifts center.
 * Polygon: closed loop of vertices (convex works best with fromVertices; concave may need decomposition).
 */

export type BallColliderConfig = BallColliderConfigCircle | BallColliderConfigPolygon;

export interface BallColliderConfigCircle {
  mode: "circle";
  radiusScale: number;
  offsetX: number;
  offsetY: number;
}

export interface BallColliderConfigPolygon {
  mode: "polygon";
  vertices: Array<{ x: number; y: number }>;
}

const STORAGE_KEY = "suikaBallBounds";

/**
 * Shipped colliders — **these override localStorage** for each id present here.
 *
 * Workflow:
 * 1. Add ball images under `assets/balls/` (filename without extension = id).
 * 2. Open the game with **`?bounds`** on the URL (or tap “Tune ball colliders” on the start screen).
 * 3. For each ball: choose Circle or polygon, adjust, then **Copy TS**.
 * 4. Paste the exported entries into this object and commit — builds then work everywhere without localStorage.
 *
 * Example circle: `{ mode: "circle", radiusScale: 0.48, offsetX: 0, offsetY: 0 }`
 * Example polygon: `{ mode: "polygon", vertices: [{ x: 0, y: -0.92 }, ...] }`
 */
export const COMMITTED_BALL_BOUNDS: Record<string, BallColliderConfig> = {
  badminton: {
    mode: "polygon",
    vertices: [
      { x: 0.7900568895793826, y: 0.1714442941922365 },
      { x: 0.9979665973634306, y: 0.9718966691608215 },
      { x: -1.0499440243094427, y: 0.43652917161689775 },
      { x: -0.4262149009572985, y: -0.3015502910164728 },
      { x: -0.14033905275423245, y: -0.6757877650277593 },
      { x: 0.07796614041901802, y: -1.0032455547876349 },
      { x: 0.4418081290411021, y: -1.0136410401768374 },
      { x: 0.7536726907171741, y: -0.7381606773629737 },
      { x: 0.6653110649089538, y: -0.27556157754346683 },
    ],
  },
  baseball: { mode: "circle", radiusScale: 0.98, offsetX: 0, offsetY: 0 },
  bowling: { mode: "circle", radiusScale: 0.98, offsetX: 0, offsetY: 0 },
  golf: { mode: "circle", radiusScale: 1, offsetX: 0, offsetY: 0 },
  pool: { mode: "circle", radiusScale: 0.98, offsetX: 0, offsetY: 0 },
  rugby: {
    mode: "polygon",
    vertices: [
      { x: 0.15483488428784925, y: 0.9615886311731886 },
      { x: -0.9179496711351063, y: 0.8510314185708641 },
      { x: -1.614706650430428, y: 0.3866911256410999 },
      { x: -1.1723212667508587, y: -0.3319307562740109 },
      { x: -0.46450465286354775, y: -0.8626053767651699 },
      { x: 0.37602757612763393, y: -0.9510511468470295 },
      { x: 1.1059634591989234, y: -0.7631038854230775 },
      { x: 1.6036470158384388, y: -0.46459941139680067 },
      { x: 1.470931400734568, y: -0.033426282247734196 },
      { x: 0.9953671132790309, y: 0.5635826658048195 },
    ],
  },
  soccer: { mode: "circle", radiusScale: 0.97, offsetX: 0, offsetY: 0 },
  tennis: { mode: "circle", radiusScale: 0.99, offsetX: 0, offsetY: 0 },
  volley: { mode: "circle", radiusScale: 0.97, offsetX: 0, offsetY: 0 },
};

export const DEFAULT_CIRCLE: BallColliderConfigCircle = {
  mode: "circle",
  radiusScale: 0.48,
  offsetX: 0,
  offsetY: 0,
};

/** Starting triangle when switching to polygon (same unit system). */
export const DEFAULT_POLYGON_VERTICES: Array<{ x: number; y: number }> = [
  { x: 0, y: -0.92 },
  { x: 0.8, y: 0.46 },
  { x: -0.8, y: 0.46 },
];

export function isPolygonConfig(c: BallColliderConfig): c is BallColliderConfigPolygon {
  return c.mode === "polygon" && Array.isArray(c.vertices);
}

/** True when polygon has enough vertices for a closed collider. */
export function isValidPolygonCollider(c: BallColliderConfigPolygon): boolean {
  return c.vertices.length >= 3;
}

/** Clamp circle colliders — allow up to ~full visual radius (editor often uses 0.97–1.0). */
export function sanitizeCircleConfig(c: BallColliderConfigCircle): BallColliderConfigCircle {
  const r = Math.min(1.08, Math.max(0.2, Number.isFinite(c.radiusScale) ? c.radiusScale : DEFAULT_CIRCLE.radiusScale));
  const ox = Math.min(0.45, Math.max(-0.45, Number.isFinite(c.offsetX) ? c.offsetX : 0));
  const oy = Math.min(0.45, Math.max(-0.45, Number.isFinite(c.offsetY) ? c.offsetY : 0));
  return { mode: "circle", radiusScale: r, offsetX: ox, offsetY: oy };
}

/**
 * Reject polygon data that would create huge or NaN bodies (corrupt localStorage, bad editor export).
 */
export function polygonPixelOffsetsLookSane(
  offsets: Array<{ x: number; y: number }>,
  displayRadius: number,
): boolean {
  if (offsets.length < 3) {
    return false;
  }
  const limit = Math.max(displayRadius * 2.35, 28);
  for (const p of offsets) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return false;
    }
    if (Math.abs(p.x) > limit || Math.abs(p.y) > limit) {
      return false;
    }
  }
  return true;
}

/**
 * Polygon vertices (center-origin, unit = min(nw,nh)/2) to pixel offsets from the sprite center
 * at draw scale `displayScale` (displayed width = naturalWidth * displayScale).
 * Use with Matter.Bodies.fromVertices(x, y, [offsets], options) where (x,y) is the sprite center.
 */
export function polygonToPixelOffsetsFromCenter(
  vertices: Array<{ x: number; y: number }>,
  naturalW: number,
  naturalH: number,
  displayScale: number,
): Array<{ x: number; y: number }> {
  const baseR = Math.min(naturalW, naturalH) / 2;
  const s = baseR * displayScale;
  return vertices.map((v) => ({ x: v.x * s, y: v.y * s }));
}

export function isCircleConfig(c: BallColliderConfig): c is BallColliderConfigCircle {
  return c.mode === "circle";
}

function cloneConfig(c: BallColliderConfig): BallColliderConfig {
  if (c.mode === "polygon") {
    return { mode: "polygon", vertices: c.vertices.map((v) => ({ x: v.x, y: v.y })) };
  }
  return {
    mode: "circle",
    radiusScale: c.radiusScale,
    offsetX: c.offsetX,
    offsetY: c.offsetY,
  };
}

export function cloneBallColliderConfig(c: BallColliderConfig): BallColliderConfig {
  return cloneConfig(c);
}

/** Accept legacy JSON without `mode` (treated as circle). */
function normalizeRawConfig(raw: unknown): BallColliderConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CIRCLE };

  const o = raw as Record<string, unknown>;

  if (o.mode === "polygon" && Array.isArray(o.vertices)) {
    const verts = o.vertices
      .filter((p): p is { x: number; y: number } => {
        return (
          !!p &&
          typeof p === "object" &&
          typeof (p as { x: unknown }).x === "number" &&
          typeof (p as { y: unknown }).y === "number"
        );
      })
      .map((p) => ({ x: p.x, y: p.y }));
    if (verts.length >= 3) return { mode: "polygon", vertices: verts };
  }

  if (Array.isArray(o.vertices) && o.vertices.length >= 3 && o.mode !== "circle") {
    const verts = o.vertices
      .filter((p): p is { x: number; y: number } => {
        return (
          !!p &&
          typeof p === "object" &&
          typeof (p as { x: unknown }).x === "number" &&
          typeof (p as { y: unknown }).y === "number"
        );
      })
      .map((p) => ({ x: p.x, y: p.y }));
    if (verts.length >= 3) return { mode: "polygon", vertices: verts };
  }

  const radiusScale =
    typeof o.radiusScale === "number" && Number.isFinite(o.radiusScale)
      ? o.radiusScale
      : DEFAULT_CIRCLE.radiusScale;
  const offsetX = typeof o.offsetX === "number" && Number.isFinite(o.offsetX) ? o.offsetX : 0;
  const offsetY = typeof o.offsetY === "number" && Number.isFinite(o.offsetY) ? o.offsetY : 0;
  return { mode: "circle", radiusScale, offsetX, offsetY };
}

export function loadStoredBoundsMap(): Record<string, BallColliderConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, BallColliderConfig> = {};
    for (const [id, v] of Object.entries(parsed)) {
      out[id] = normalizeRawConfig(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStoredBoundsMap(map: Record<string, BallColliderConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function clearStoredBoundsMap(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Resolve collider for one ball id.
 * **Committed (source code) wins** over localStorage so shipped games are not overridden by stale dev storage.
 * localStorage is only used when there is no entry in COMMITTED_BALL_BOUNDS for that id.
 */
export function getBoundsForId(id: string, stored: Record<string, BallColliderConfig>): BallColliderConfig {
  if (COMMITTED_BALL_BOUNDS[id]) {
    return cloneConfig(COMMITTED_BALL_BOUNDS[id]);
  }
  if (stored[id]) {
    return cloneConfig(stored[id]);
  }
  return { ...DEFAULT_CIRCLE };
}

export function buildFullBoundsMap(
  ids: string[],
  stored: Record<string, BallColliderConfig>,
): Record<string, BallColliderConfig> {
  const out: Record<string, BallColliderConfig> = {};
  for (const id of ids) {
    out[id] = getBoundsForId(id, stored);
  }
  return out;
}

function serializeConfigTs(c: BallColliderConfig): string {
  if (c.mode === "polygon") {
    const pts = c.vertices.map((v) => "{ x: " + v.x + ", y: " + v.y + " }").join(", ");
    return "{ mode: \"polygon\", vertices: [ " + pts + " ] }";
  }
  return (
    "{ mode: \"circle\", radiusScale: " +
    c.radiusScale +
    ", offsetX: " +
    c.offsetX +
    ", offsetY: " +
    c.offsetY +
    " }"
  );
}

export function formatBoundsAsJson(map: Record<string, BallColliderConfig>): string {
  return JSON.stringify(map, null, 2);
}

export function formatBoundsAsTsExport(map: Record<string, BallColliderConfig>): string {
  const lines = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([id, c]) => {
      const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) ? id : JSON.stringify(id);
      return "  " + key + ": " + serializeConfigTs(c) + ",";
    });
  return (
    "export const COMMITTED_BALL_BOUNDS: Record<string, BallColliderConfig> = {\n" +
    lines.join("\n") +
    "\n};\n"
  );
}
