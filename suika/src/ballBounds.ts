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

/** Paste values from the bounds editor here so production uses them without localStorage. */
export const COMMITTED_BALL_BOUNDS: Record<string, BallColliderConfig> = {};

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

/** Merged: committed defaults, then localStorage overrides. */
export function getBoundsForId(id: string, stored: Record<string, BallColliderConfig>): BallColliderConfig {
  if (stored[id]) return cloneConfig(stored[id]);
  if (COMMITTED_BALL_BOUNDS[id]) return cloneConfig(COMMITTED_BALL_BOUNDS[id]);
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
