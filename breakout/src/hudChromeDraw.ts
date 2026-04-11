import type { BreakoutUiPack } from "./uiAssets";

export interface HudLayout {
  topInset: number;
  /** Top band used to vertically center score / LV / lives sprites. */
  frameY: number;
  frameW: number;
  frameH: number;
  digitH: number;
  /** Bottom Y of HUD band; bricks should start below this. */
  hudReserve: number;
}

export function computeHudLayout(viewW: number, viewH: number, pointerCoarse: boolean): HudLayout {
  const topInset = pointerCoarse ? 16 : 10;
  const frameW = viewW;
  const vmin = Math.min(viewW, viewH);
  const digitH = Math.max(20, Math.min(42, vmin * 0.065));
  const frameH = digitH + Math.max(14, viewH * 0.022);
  const hudReserve = topInset + frameH + Math.max(10, viewH * 0.02);
  return {
    topInset,
    frameY: topInset,
    frameW,
    frameH,
    digitH,
    hudReserve: Math.round(hudReserve),
  };
}

function imgWidthAtHeight(img: HTMLImageElement, height: number): number {
  if (!img.complete || img.naturalHeight <= 0) return 0;
  return (img.naturalWidth * height) / img.naturalHeight;
}

function drawImgHeight(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  height: number,
): number {
  if (!img.complete || img.naturalWidth <= 0) return 0;
  const sc = height / img.naturalHeight;
  const w = img.naturalWidth * sc;
  ctx.drawImage(img, x, y, w, height);
  return w;
}

function measureDigitsWidth(digits: HTMLImageElement[], str: string, digitH: number, gap: number): number {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const d = parseInt(str[i], 10);
    const img = digits[d];
    if (!img?.naturalHeight) continue;
    w += imgWidthAtHeight(img, digitH);
    if (i < str.length - 1) w += gap;
  }
  return w;
}

function drawDigitChars(
  ctx: CanvasRenderingContext2D,
  digits: HTMLImageElement[],
  str: string,
  x: number,
  y: number,
  digitH: number,
  gap: number,
): number {
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    const d = parseInt(str[i], 10);
    if (Number.isNaN(d) || !digits[d]) continue;
    const w = drawImgHeight(ctx, digits[d], cx, y, digitH);
    cx += w;
    if (i < str.length - 1) cx += gap;
  }
  return cx;
}

function drawDigitString(
  ctx: CanvasRenderingContext2D,
  digits: HTMLImageElement[],
  value: number,
  x: number,
  y: number,
  digitH: number,
  gap: number,
): number {
  const str = String(Math.max(0, Math.floor(value)));
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    const d = parseInt(str[i], 10);
    const img = digits[d];
    if (!img) continue;
    const w = drawImgHeight(ctx, img, cx, y, digitH);
    cx += w;
    if (i < str.length - 1) cx += gap;
  }
  return cx;
}

export function drawHudChrome(
  ctx: CanvasRenderingContext2D,
  pack: BreakoutUiPack,
  layout: HudLayout,
  stats: { score: number; lives: number; levelStr: string },
): void {
  const { digits, lv, xIcon } = pack;
  if (!digits.length) return;

  ctx.save();

  const gap = Math.max(2, layout.digitH * 0.08);
  const digitY = layout.frameY + (layout.frameH - layout.digitH) / 2;

  const padX = layout.frameW * 0.06;
  drawDigitString(ctx, digits, stats.score, padX, digitY, layout.digitH, gap);

  const levelDigits = stats.levelStr.replace(/\D/g, "") || "1";
  const lvW = imgWidthAtHeight(lv, layout.digitH);
  const lvlW = measureDigitsWidth(digits, levelDigits, layout.digitH, gap);
  const centerW = lvW + gap * 2 + lvlW;
  let cx = (layout.frameW - centerW) / 2;
  drawImgHeight(ctx, lv, cx, digitY, layout.digitH);
  cx += lvW + gap * 2;
  drawDigitChars(ctx, digits, levelDigits, cx, digitY, layout.digitH, gap);

  const livesStr = String(Math.max(0, Math.floor(stats.lives)));
  const livesDigitsW = measureDigitsWidth(digits, livesStr, layout.digitH, gap);
  const xW = imgWidthAtHeight(xIcon, layout.digitH);
  const groupW = livesDigitsW + gap + xW;
  let rx = layout.frameW - padX - groupW;
  drawDigitString(ctx, digits, stats.lives, rx, digitY, layout.digitH, gap);
  rx += livesDigitsW + gap;
  drawImgHeight(ctx, xIcon, rx, digitY, layout.digitH);

  ctx.restore();
}

export interface VersusHudLayout {
  topReserve: number;
  bottomReserve: number;
  digitH: number;
  /** Minimum inset from top edge of view (platform safe area). */
  topSafeInset: number;
  /** Minimum inset from bottom edge of view. */
  bottomSafeInset: number;
}

/**
 * Reserves space so P2 (top) and HUD stay below platform top overlays (mobile ~120px),
 * and bottom HUD clears thumb/home zones. Use for paddle/brick layout even before UI assets load.
 */
export function computeVersusHudLayout(
  viewW: number,
  viewH: number,
  pointerCoarse: boolean,
): VersusHudLayout {
  const topSafe = pointerCoarse ? 128 : 52;
  const bottomSafe = pointerCoarse ? 108 : 50;
  const vmin = Math.min(viewW, viewH);
  const digitH = Math.max(18, Math.min(36, vmin * 0.054));
  const band = digitH + Math.max(14, viewH * 0.02) + 8;
  return {
    topReserve: Math.round(topSafe + band),
    bottomReserve: Math.round(bottomSafe + band),
    digitH,
    topSafeInset: topSafe,
    bottomSafeInset: bottomSafe,
  };
}

function drawDigitStringVersus(
  ctx: CanvasRenderingContext2D,
  digits: HTMLImageElement[],
  value: number,
  x: number,
  y: number,
  digitH: number,
  gap: number,
): void {
  const str = String(Math.max(0, Math.floor(value)));
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    const d = parseInt(str[i], 10);
    const img = digits[d];
    if (!img) continue;
    const w = drawImgHeight(ctx, img, cx, y, digitH);
    cx += w;
    if (i < str.length - 1) cx += gap;
  }
}

function measureDigitStringVersusWidth(
  digits: HTMLImageElement[],
  value: number,
  digitH: number,
  gap: number,
): number {
  const str = String(Math.max(0, Math.floor(value)));
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const d = parseInt(str[i], 10);
    const img = digits[d];
    if (!img?.naturalHeight) continue;
    w += imgWidthAtHeight(img, digitH);
    if (i < str.length - 1) w += gap;
  }
  return w;
}

/**
 * Same vertical math as the top (P2) pill in drawVersusHudChrome — use for DOM HUD + settings alignment.
 * `pillOuterTop` is the canvas Y of the top edge of the rounded rect (pathHudRound y).
 */
export function computeVersusTopPillLayoutY(layout: VersusHudLayout, arenaTop: number): {
  topY: number;
  pillOuterTop: number;
} {
  const strokeGlowPad = 20;
  const uiGap = 12;
  const pillBottomExtent = layout.digitH + 6;
  const maxPillBottom = arenaTop - uiGap - strokeGlowPad;
  const idealTopY = maxPillBottom - pillBottomExtent;
  const minTopY = layout.topSafeInset + 6;
  let topY = Math.max(minTopY, idealTopY);
  if (topY + pillBottomExtent > maxPillBottom) {
    topY = idealTopY;
  }
  return { topY, pillOuterTop: topY - 4 };
}

export function drawVersusHudChrome(
  ctx: CanvasRenderingContext2D,
  pack: BreakoutUiPack,
  layout: VersusHudLayout,
  stats: { r1: number; r2: number; s1: number; s2: number },
  viewW: number,
  viewH: number,
  arenaTop: number,
  arenaBottom: number,
): void {
  const { digits } = pack;
  if (!digits.length) return;
  const gap = Math.max(2, layout.digitH * 0.08);
  const w = viewW;
  const h = viewH;
  const pad = w * 0.05;
  const scoreH = Math.max(14, layout.digitH * 0.85);
  const strokeGlowPad = 20;
  const uiGap = 12;
  const pillBottomExtent = layout.digitH + 6;

  ctx.save();

  const { topY } = computeVersusTopPillLayoutY(layout, arenaTop);

  ctx.fillStyle = "rgba(167, 139, 250, 0.22)";
  pathHudRound(ctx, pad, topY - 4, w - pad * 2, layout.digitH + 10, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(196, 181, 253, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  drawDigitStringVersus(ctx, digits, stats.r2, pad + 12, topY, layout.digitH, gap);
  const s2w = measureDigitStringVersusWidth(digits, stats.s2, scoreH, gap);
  const ptsLab = "PTS";
  ctx.font = "600 " + String(Math.max(9, layout.digitH * 0.28)) + "px Outfit,system-ui,sans-serif";
  ctx.fillStyle = "rgba(196, 181, 253, 0.75)";
  ctx.textAlign = "right";
  ctx.fillText(ptsLab, w - pad - 10 - s2w - gap * 2, topY + layout.digitH * 0.45);
  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  drawDigitStringVersus(ctx, digits, stats.s2, w - pad - 10 - s2w, topY + (layout.digitH - scoreH) * 0.35, scoreH, gap);

  const minPillTop = arenaBottom + uiGap + strokeGlowPad;
  const maxPillBottomScreen = h - layout.bottomSafeInset - 6;
  let botY = minPillTop + 4;
  if (botY + pillBottomExtent > maxPillBottomScreen) {
    botY = maxPillBottomScreen - pillBottomExtent;
  }
  botY = Math.max(minPillTop + 4, botY);
  ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
  pathHudRound(ctx, pad, botY - 4, w - pad * 2, layout.digitH + 10, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(125, 211, 252, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.textAlign = "left";
  drawDigitStringVersus(ctx, digits, stats.r1, pad + 12, botY, layout.digitH, gap);
  const s1w = measureDigitStringVersusWidth(digits, stats.s1, scoreH, gap);
  ctx.font = "600 " + String(Math.max(9, layout.digitH * 0.28)) + "px Outfit,system-ui,sans-serif";
  ctx.fillStyle = "rgba(125, 211, 252, 0.78)";
  ctx.textAlign = "right";
  ctx.fillText(ptsLab, w - pad - 10 - s1w - gap * 2, botY + layout.digitH * 0.45);
  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  drawDigitStringVersus(ctx, digits, stats.s1, w - pad - 10 - s1w, botY + (layout.digitH - scoreH) * 0.35, scoreH, gap);

  ctx.restore();
}

function pathHudRound(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
