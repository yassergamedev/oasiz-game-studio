import { getBallAssets, type BallAsset } from "./ballAssets";
import {
  type BallColliderConfig,
  type BallColliderConfigCircle,
  type BallColliderConfigPolygon,
  DEFAULT_CIRCLE,
  DEFAULT_POLYGON_VERTICES,
  cloneBallColliderConfig,
  loadStoredBoundsMap,
  saveStoredBoundsMap,
  clearStoredBoundsMap,
  formatBoundsAsJson,
  formatBoundsAsTsExport,
  getBoundsForId,
  isPolygonConfig,
} from "./ballBounds";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labelRow(
  label: string,
  input: HTMLInputElement,
  valueEl: HTMLElement,
): HTMLDivElement {
  const row = el("div", "be-row");
  const lab = el("label", "be-label", label);
  lab.setAttribute("for", input.id);
  row.appendChild(lab);
  const mid = el("div", "be-slider-wrap");
  mid.appendChild(input);
  row.appendChild(mid);
  valueEl.className = "be-val";
  row.appendChild(valueEl);
  return row;
}

interface DrawMetrics {
  bw: number;
  bh: number;
  nw: number;
  nh: number;
  baseR: number;
  scale: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  icx: number;
  icy: number;
}

export function runBoundsEditor(): void {
  const assets = getBallAssets();
  const images = new Map<string, HTMLImageElement>();
  let stored = loadStoredBoundsMap();
  const working: Record<string, BallColliderConfig> = {};

  for (const a of assets) {
    working[a.id] = cloneBallColliderConfig(getBoundsForId(a.id, stored));
  }

  let index = 0;
  let selectedVertexIndex: number | null = null;
  let draggingVertexIndex: number | null = null;

  const root = el("div", "bounds-editor");
  const style = el("style");
  style.textContent = `
    .bounds-editor { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
      background: linear-gradient(180deg, #bfe9ff 0%, #e3f5ff 45%, #d4f2d0 100%); color: #2f3d52;
      font-family: Fredoka, system-ui, sans-serif; touch-action: manipulation; }
    .be-top { flex: 0 0 auto; padding: 12px 16px; padding-top: max(12px, env(safe-area-inset-top, 12px));
      border-bottom: 3px dashed rgba(58, 79, 108, 0.2); display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .be-title { font-weight: 700; font-size: 1.05rem; margin-right: 8px; color: #3a4f6c; }
    .be-sub { font-size: 0.72rem; color: rgba(47, 61, 82, 0.72); flex-basis: 100%; line-height: 1.35; }
    .be-nav { display: flex; align-items: center; gap: 8px; flex: 1; justify-content: center; min-width: 200px; }
    .be-id { font-weight: 700; font-size: 0.9rem; max-width: 45vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .be-mid { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 8px; }
    .be-canvas-wrap { position: relative; max-width: min(92vw, 440px); max-height: 48vh; width: 100%; aspect-ratio: 1; }
    #boundsEditCanvas { width: 100%; height: 100%; display: block; border-radius: 16px;
      border: 3px solid #3d5a80; background: #e8f6ff; touch-action: none; cursor: crosshair;
      box-shadow: 0 4px 0 rgba(45, 74, 110, 0.12); }
    .be-bottom { flex: 0 0 auto; max-height: 42vh; overflow-y: auto; padding: 12px 16px 20px;
      border-top: 3px dashed rgba(58, 79, 108, 0.2); background: rgba(255, 253, 247, 0.96); }
    .be-mode { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
    .be-mode label { font-size: 0.75rem; font-weight: 700; color: #5a7194; margin-right: 4px; }
    .be-mode button { padding: 8px 14px; border-radius: 12px; border: 2px solid #3d5a80;
      background: #fffdf7; color: #3a4f6c; font-family: inherit; font-weight: 600; font-size: 0.8rem; cursor: pointer;
      box-shadow: 0 2px 0 rgba(45, 74, 110, 0.12); }
    .be-mode button.active { background: linear-gradient(180deg, #9fd98f, #7dcc7a); color: #1e3d2e; border-color: #2d6a45; }
    .be-row { display: grid; grid-template-columns: 88px 1fr 52px; align-items: center; gap: 8px; margin-bottom: 10px; }
    .be-label { font-size: 0.8rem; font-weight: 600; color: #5a7194; }
    .be-slider-wrap { display: flex; align-items: center; }
    .be-row input[type=range] { width: 100%; accent-color: #ff9f43; }
    .be-val { font-variant-numeric: tabular-nums; font-size: 0.75rem; color: #f5861f; text-align: right; font-weight: 600; }
    .be-polyhint { font-size: 0.72rem; color: rgba(47, 61, 82, 0.72); margin-bottom: 10px; line-height: 1.4; }
    .be-poly-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .be-poly-actions button { padding: 8px 12px; border-radius: 12px; border: 2px solid #3d5a80;
      background: #fffdf7; color: #3a4f6c; font-family: inherit; font-weight: 600; font-size: 0.75rem; cursor: pointer; }
    .be-vert-count { font-size: 0.75rem; color: #3a4f6c; margin-bottom: 8px; font-variant-numeric: tabular-nums; font-weight: 600; }
    .be-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .be-actions button { flex: 1; min-width: 120px; padding: 10px 12px; border-radius: 12px; border: 2px solid #3d5a80;
      background: #e3f5ff; color: #3a4f6c; font-family: inherit; font-weight: 600; font-size: 0.8rem; cursor: pointer; }
    .be-actions button.primary { background: linear-gradient(180deg, #ff9f43, #f5861f); color: #fffdf7; border: 2px solid #2d4a6e;
      box-shadow: 0 3px 0 #2d4a6e; }
    .be-status { margin-top: 10px; font-size: 0.75rem; color: #5a7194; min-height: 1.2em; }
    .be-empty { padding: 24px; text-align: center; color: #5a7194; }
    .be-btn-icon { padding: 8px 14px !important; min-width: auto !important; flex: 0 0 auto !important; }
    .bounds-editor .hidden { display: none !important; }
  `;
  root.appendChild(style);

  const top = el("div", "be-top");
  top.appendChild(el("span", "be-title", "Ball bounds"));
  const sub = el("div", "be-sub");
  sub.textContent =
    "Circle: sliders. Polygon: closed edge loop — tap empty area to add a corner, drag a point to move it (image center = origin; units = min(side)/2). Copy JSON / Copy TS to paste into ballBounds.ts. Save stores localStorage.";
  top.appendChild(sub);

  const nav = el("div", "be-nav");
  const btnPrev = el("button", "be-btn-icon", "Prev");
  const btnNext = el("button", "be-btn-icon", "Next");
  const idLabel = el("span", "be-id", "");
  nav.appendChild(btnPrev);
  nav.appendChild(idLabel);
  nav.appendChild(btnNext);
  top.appendChild(nav);

  const linkBack = el("a", "");
  const backUrl = new URL(window.location.href);
  backUrl.searchParams.delete("bounds");
  linkBack.href = backUrl.pathname + (backUrl.search ? backUrl.search : "") + backUrl.hash;
  linkBack.textContent = "Back to game";
  linkBack.style.cssText =
    "font-size:0.8rem;color:#f5861f;font-weight:700;margin-left:auto;text-decoration:none;border-bottom:2px dashed rgba(245,134,31,0.5);";
  top.appendChild(linkBack);

  const mid = el("div", "be-mid");
  const wrap = el("div", "be-canvas-wrap");
  const editCanvas = el("canvas", "");
  editCanvas.id = "boundsEditCanvas";
  wrap.appendChild(editCanvas);
  mid.appendChild(wrap);

  const bottom = el("div", "be-bottom");

  const modeRow = el("div", "be-mode");
  modeRow.appendChild(el("span", "", "Collider:"));
  const btnModeCircle = el("button", "", "Circle");
  const btnModePoly = el("button", "", "Edge polygon");
  modeRow.appendChild(btnModeCircle);
  modeRow.appendChild(btnModePoly);
  bottom.appendChild(modeRow);

  const circlePanel = el("div", "be-circle-panel");
  const rs = el("input") as HTMLInputElement;
  rs.type = "range";
  rs.min = "0.15";
  rs.max = "1";
  rs.step = "0.01";
  rs.id = "be-radiusScale";
  const rsVal = el("span");
  const ox = el("input") as HTMLInputElement;
  ox.type = "range";
  ox.min = "-0.45";
  ox.max = "0.45";
  ox.step = "0.005";
  ox.id = "be-offsetX";
  const oxVal = el("span");
  const oy = el("input") as HTMLInputElement;
  oy.type = "range";
  oy.min = "-0.45";
  oy.max = "0.45";
  oy.step = "0.005";
  oy.id = "be-offsetY";
  const oyVal = el("span");
  circlePanel.appendChild(labelRow("Radius", rs, rsVal));
  circlePanel.appendChild(labelRow("Offset X", ox, oxVal));
  circlePanel.appendChild(labelRow("Offset Y", oy, oyVal));
  bottom.appendChild(circlePanel);

  const polyPanel = el("div", "be-poly-panel");
  polyPanel.classList.add("hidden");
  const polyHint = el("div", "be-polyhint");
  polyHint.textContent =
    "Tap on the image to add a vertex. Drag a green handle to move it. Orange = selected. Need at least 3 points. Closing edge is drawn from last back to first.";
  polyPanel.appendChild(polyHint);
  const vertCount = el("div", "be-vert-count", "");
  polyPanel.appendChild(vertCount);
  const polyActions = el("div", "be-poly-actions");
  const btnPolyClear = el("button", "", "Clear all");
  const btnPolyUndo = el("button", "", "Remove last");
  const btnPolyDelSel = el("button", "", "Delete selected");
  polyActions.appendChild(btnPolyClear);
  polyActions.appendChild(btnPolyUndo);
  polyActions.appendChild(btnPolyDelSel);
  polyPanel.appendChild(polyActions);
  bottom.appendChild(polyPanel);

  const actions = el("div", "be-actions");
  const btnSave = el("button", "primary", "Save all");
  const btnCopyJson = el("button", "", "Copy JSON");
  const btnCopyTs = el("button", "", "Copy TS");
  const btnResetBall = el("button", "", "Reset ball");
  const btnResetAll = el("button", "", "Reset all saved");
  actions.appendChild(btnSave);
  actions.appendChild(btnCopyJson);
  actions.appendChild(btnCopyTs);
  actions.appendChild(btnResetBall);
  actions.appendChild(btnResetAll);
  bottom.appendChild(actions);

  const status = el("div", "be-status");
  bottom.appendChild(status);

  root.appendChild(top);
  root.appendChild(mid);
  root.appendChild(bottom);
  document.body.appendChild(root);

  const ctx: CanvasRenderingContext2D =
    editCanvas.getContext("2d") ??
    (() => {
      throw new Error("2D context unavailable");
    })();

  let statusTimer = 0;
  function setStatus(msg: string): void {
    status.textContent = msg;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
    }, 6000);
  }

  function currentAsset(): BallAsset | null {
    return assets[index] ?? null;
  }

  function getMetrics(img: HTMLImageElement, bw: number, bh: number): DrawMetrics {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const baseR = Math.min(nw, nh) / 2;
    const pad = 0.92;
    const scale = (Math.min(bw, bh) * pad) / Math.max(nw, nh);
    const dw = nw * scale;
    const dh = nh * scale;
    const dx = (bw - dw) / 2;
    const dy = (bh - dh) / 2;
    const icx = dx + dw / 2;
    const icy = dy + dh / 2;
    return { bw, bh, nw, nh, baseR, scale, dx, dy, dw, dh, icx, icy };
  }

  function vertexToCanvas(v: { x: number; y: number }, m: DrawMetrics): { x: number; y: number } {
    const px = v.x * m.baseR * m.scale;
    const py = v.y * m.baseR * m.scale;
    return { x: m.icx + px, y: m.icy + py };
  }

  function canvasToVertex(bx: number, by: number, m: DrawMetrics): { x: number; y: number } {
    const px = bx - m.icx;
    const py = by - m.icy;
    const denom = m.baseR * m.scale;
    return { x: px / denom, y: py / denom };
  }

  function hitVertexIndex(bx: number, by: number, m: DrawMetrics, verts: Array<{ x: number; y: number }>): number | null {
    const pickR = Math.max(18, 14 * (window.devicePixelRatio || 1));
    let best = -1;
    let bestD = pickR * pickR;
    for (let i = 0; i < verts.length; i++) {
      const p = vertexToCanvas(verts[i], m);
      const d = (p.x - bx) * (p.x - bx) + (p.y - by) * (p.y - by);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  }

  function persistCircleFromSliders(): void {
    const a = currentAsset();
    if (!a) return;
    if (working[a.id].mode !== "circle") return;
    const cur = working[a.id] as BallColliderConfigCircle;
    cur.radiusScale = Number(rs.value);
    cur.offsetX = Number(ox.value);
    cur.offsetY = Number(oy.value);
  }

  function syncModeUi(): void {
    const a = currentAsset();
    if (!a) return;
    const c = working[a.id];
    const poly = isPolygonConfig(c);
    btnModeCircle.classList.toggle("active", !poly);
    btnModePoly.classList.toggle("active", poly);
    circlePanel.classList.toggle("hidden", poly);
    polyPanel.classList.toggle("hidden", !poly);
    if (poly) {
      vertCount.textContent = "Vertices: " + c.vertices.length + " (min 3)";
    }
  }

  function syncSlidersFromWorking(): void {
    const a = currentAsset();
    if (!a) return;
    const c = working[a.id];
    if (c.mode === "circle") {
      rs.value = String(c.radiusScale);
      ox.value = String(c.offsetX);
      oy.value = String(c.offsetY);
      rsVal.textContent = c.radiusScale.toFixed(2);
      oxVal.textContent = c.offsetX.toFixed(3);
      oyVal.textContent = c.offsetY.toFixed(3);
    }
    idLabel.textContent = a.id + " (" + (index + 1) + "/" + assets.length + ")";
    syncModeUi();
  }

  function setModeCircle(): void {
    const a = currentAsset();
    if (!a) return;
    if (working[a.id].mode === "circle") {
      persistCircleFromSliders();
      working[a.id] = {
        mode: "circle",
        radiusScale: Number(rs.value),
        offsetX: Number(ox.value),
        offsetY: Number(oy.value),
      };
    } else {
      working[a.id] = { ...DEFAULT_CIRCLE };
    }
    selectedVertexIndex = null;
    syncSlidersFromWorking();
  }

  function setModePolygon(): void {
    const a = currentAsset();
    if (!a) return;
    if (working[a.id].mode === "circle") {
      persistCircleFromSliders();
    }
    if (working[a.id].mode !== "polygon") {
      working[a.id] = {
        mode: "polygon",
        vertices: DEFAULT_POLYGON_VERTICES.map((v) => ({ x: v.x, y: v.y })),
      };
    }
    selectedVertexIndex = null;
    syncSlidersFromWorking();
  }

  btnModeCircle.addEventListener("click", () => {
    setModeCircle();
    setStatus("Circle collider.");
  });
  btnModePoly.addEventListener("click", () => {
    setModePolygon();
    setStatus("Polygon collider — tap image to add corners.");
  });

  function resizeEditCanvas(): void {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (editCanvas.width !== w || editCanvas.height !== h) {
      editCanvas.width = w;
      editCanvas.height = h;
    }
  }

  function drawEditor(): void {
    resizeEditCanvas();
    const a = currentAsset();
    const bw = editCanvas.width;
    const bh = editCanvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, bh);
    bg.addColorStop(0, "#d8f0ff");
    bg.addColorStop(1, "#e8f8f0");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, bw, bh);

    if (!a || assets.length === 0) {
      ctx.fillStyle = "rgba(58, 79, 108, 0.55)";
      ctx.font = "600 14px Fredoka, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Add images to suika/assets", bw / 2, bh / 2);
      return;
    }

    const img = images.get(a.id);
    if (!img || !img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = "rgba(58, 79, 108, 0.55)";
      ctx.font = "600 13px Fredoka, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading…", bw / 2, bh / 2);
      return;
    }

    const m = getMetrics(img, bw, bh);
    ctx.drawImage(img, m.dx, m.dy, m.dw, m.dh);

    const c = working[a.id];
    const lineW = Math.max(2, 2 * (window.devicePixelRatio || 1));

    if (c.mode === "circle") {
      const cx = m.icx + c.offsetX * m.baseR * m.scale;
      const cy = m.icy + c.offsetY * m.baseR * m.scale;
      const cr = m.baseR * c.radiusScale * m.scale;
      ctx.strokeStyle = "rgba(61, 179, 106, 0.95)";
      ctx.lineWidth = lineW;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(58, 79, 108, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    } else {
      const verts = c.vertices;
      if (verts.length >= 1) {
        ctx.strokeStyle = "rgba(61, 179, 106, 0.95)";
        ctx.lineWidth = lineW;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        for (let i = 0; i < verts.length; i++) {
          const p = vertexToCanvas(verts[i], m);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        if (verts.length >= 3) {
          const f = vertexToCanvas(verts[0], m);
          ctx.lineTo(f.x, f.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (let i = 0; i < verts.length; i++) {
        const p = vertexToCanvas(verts[i], m);
        const sel = selectedVertexIndex === i;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sel ? 10 : 7, 0, Math.PI * 2);
        ctx.fillStyle = sel ? "rgba(255, 159, 67, 0.95)" : "rgba(125, 216, 122, 0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(45, 74, 110, 0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function tick(): void {
    drawEditor();
    requestAnimationFrame(tick);
  }

  function persistCurrent(): void {
    persistCircleFromSliders();
  }

  function go(delta: number): void {
    persistCurrent();
    if (assets.length === 0) return;
    index = (index + delta + assets.length) % assets.length;
    selectedVertexIndex = null;
    draggingVertexIndex = null;
    syncSlidersFromWorking();
  }

  function clientToBitmap(clientX: number, clientY: number): { bx: number; by: number } {
    const rect = editCanvas.getBoundingClientRect();
    const sx = editCanvas.width / rect.width;
    const sy = editCanvas.height / rect.height;
    return {
      bx: (clientX - rect.left) * sx,
      by: (clientY - rect.top) * sy,
    };
  }

  rs.addEventListener("input", () => {
    rsVal.textContent = Number(rs.value).toFixed(2);
    persistCircleFromSliders();
  });
  ox.addEventListener("input", () => {
    oxVal.textContent = Number(ox.value).toFixed(3);
    persistCircleFromSliders();
  });
  oy.addEventListener("input", () => {
    oyVal.textContent = Number(oy.value).toFixed(3);
    persistCircleFromSliders();
  });

  btnPrev.addEventListener("click", () => go(-1));
  btnNext.addEventListener("click", () => go(1));

  btnPolyClear.addEventListener("click", () => {
    const a = currentAsset();
    if (!a || working[a.id].mode !== "polygon") return;
    (working[a.id] as BallColliderConfigPolygon).vertices = [];
    selectedVertexIndex = null;
    vertCount.textContent = "Vertices: 0 (min 3)";
    setStatus("Cleared polygon — add points on the image.");
  });

  btnPolyUndo.addEventListener("click", () => {
    const a = currentAsset();
    if (!a || working[a.id].mode !== "polygon") return;
    const verts = (working[a.id] as BallColliderConfigPolygon).vertices;
    verts.pop();
    selectedVertexIndex = verts.length > 0 ? verts.length - 1 : null;
    syncSlidersFromWorking();
  });

  btnPolyDelSel.addEventListener("click", () => {
    const a = currentAsset();
    if (!a || working[a.id].mode !== "polygon") return;
    if (selectedVertexIndex === null) {
      setStatus("Select a vertex on the image first (tap a handle).");
      return;
    }
    const verts = (working[a.id] as BallColliderConfigPolygon).vertices;
    if (verts.length <= 3) {
      setStatus("Need at least 3 vertices — remove would break the loop.");
      return;
    }
    verts.splice(selectedVertexIndex, 1);
    selectedVertexIndex = Math.min(selectedVertexIndex, verts.length - 1);
    syncSlidersFromWorking();
  });

  editCanvas.addEventListener("pointerdown", (ev) => {
    const a = currentAsset();
    if (!a || working[a.id].mode !== "polygon") return;
    const img = images.get(a.id);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const { bx, by } = clientToBitmap(ev.clientX, ev.clientY);
    const m = getMetrics(img, editCanvas.width, editCanvas.height);
    const verts = (working[a.id] as BallColliderConfigPolygon).vertices;

    const hit = hitVertexIndex(bx, by, m, verts);
    if (hit !== null) {
      draggingVertexIndex = hit;
      selectedVertexIndex = hit;
      editCanvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    const v = canvasToVertex(bx, by, m);
    verts.push(v);
    selectedVertexIndex = verts.length - 1;
    syncSlidersFromWorking();
    ev.preventDefault();
  });

  editCanvas.addEventListener("pointermove", (ev) => {
    if (draggingVertexIndex === null) return;
    const a = currentAsset();
    if (!a || working[a.id].mode !== "polygon") return;
    const img = images.get(a.id);
    if (!img || !img.complete) return;
    const { bx, by } = clientToBitmap(ev.clientX, ev.clientY);
    const m = getMetrics(img, editCanvas.width, editCanvas.height);
    const verts = (working[a.id] as BallColliderConfigPolygon).vertices;
    const idx = draggingVertexIndex;
    if (idx >= 0 && idx < verts.length) {
      const v = canvasToVertex(bx, by, m);
      verts[idx] = v;
    }
    ev.preventDefault();
  });

  function endDrag(ev: PointerEvent): void {
    if (draggingVertexIndex !== null) {
      try {
        if (editCanvas.hasPointerCapture(ev.pointerId)) {
          editCanvas.releasePointerCapture(ev.pointerId);
        }
      } catch {
        /* ignore */
      }
    }
    draggingVertexIndex = null;
  }
  editCanvas.addEventListener("pointerup", endDrag);
  editCanvas.addEventListener("pointercancel", endDrag);

  btnSave.addEventListener("click", () => {
    persistCurrent();
    stored = {};
    for (const x of assets) {
      stored[x.id] = cloneBallColliderConfig(working[x.id]);
    }
    saveStoredBoundsMap(stored);
    setStatus("Saved all balls to localStorage (suikaBallBounds).");
    console.log("[runBoundsEditor]", "saved", Object.keys(stored).length, "entries");
  });

  btnCopyJson.addEventListener("click", async () => {
    persistCurrent();
    const text = formatBoundsAsJson(working);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied JSON (includes mode + polygon vertices).");
    } catch {
      setStatus("Clipboard failed — check console.");
      console.log("[bounds JSON]", text);
    }
  });

  btnCopyTs.addEventListener("click", async () => {
    persistCurrent();
    const text = formatBoundsAsTsExport(working);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied TS — replace COMMITTED_BALL_BOUNDS in ballBounds.ts.");
    } catch {
      setStatus("Clipboard failed — check console.");
      console.log("[bounds TS]", text);
    }
  });

  btnResetBall.addEventListener("click", () => {
    const a = currentAsset();
    if (!a) return;
    working[a.id] = { ...DEFAULT_CIRCLE };
    selectedVertexIndex = null;
    draggingVertexIndex = null;
    syncSlidersFromWorking();
    setStatus("Reset " + a.id + " to default circle (not saved until Save).");
  });

  btnResetAll.addEventListener("click", () => {
    clearStoredBoundsMap();
    stored = {};
    for (const x of assets) {
      working[x.id] = { ...DEFAULT_CIRCLE };
    }
    selectedVertexIndex = null;
    syncSlidersFromWorking();
    setStatus("Cleared localStorage; all default circle colliders.");
  });

  window.addEventListener("resize", drawEditor);

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
    if (e.key === "Delete" || e.key === "Backspace") {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "BUTTON") return;
      e.preventDefault();
      btnPolyDelSel.click();
    }
  });

  if (assets.length === 0) {
    const empty = el("div", "be-empty");
    empty.textContent =
      "No images found. Add .png / .jpg / .webp files under suika/assets/ and reload.";
    mid.appendChild(empty);
    wrap.style.display = "none";
  } else {
    for (const a of assets) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = a.url;
      images.set(a.id, img);
    }
  }

  syncSlidersFromWorking();
  requestAnimationFrame(tick);

  console.log("[runBoundsEditor]", assets.length + " assets");
}
