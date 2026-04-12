import { getMinColors, isMinimalBreakoutVisual } from "./breakoutMinimalStyle";

/** Matches countdown / score popups (see `main.ts`, `versusBreakoutGame.ts`). */
const HUD_NUM_FONT_STACK = '"Orbitron",system-ui,sans-serif';
const HUD_LABEL_FONT_STACK = '"Outfit",system-ui,sans-serif';

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

function measureHudLabelText(ctx: CanvasRenderingContext2D, text: string, fontPx: number, weight: number): number {
  const prev = ctx.font;
  ctx.font = String(weight) + " " + String(fontPx) + "px " + HUD_LABEL_FONT_STACK;
  const w = ctx.measureText(text).width;
  ctx.font = prev;
  return w;
}

function measureHudNumericText(ctx: CanvasRenderingContext2D, text: string, fontPx: number, weight: number): number {
  const prev = ctx.font;
  ctx.font = String(weight) + " " + String(fontPx) + "px " + HUD_NUM_FONT_STACK;
  const w = ctx.measureText(text).width;
  ctx.font = prev;
  return w;
}

function drawHudNumericText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  yMid: number,
  fontPx: number,
  weight: number,
  fillStyle: string,
): number {
  ctx.save();
  ctx.font = String(weight) + " " + String(fontPx) + "px " + HUD_NUM_FONT_STACK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, x, yMid);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** Classic single-player HUD (sprite digits removed — typography only). */
export function drawHudChrome(
  ctx: CanvasRenderingContext2D,
  layout: HudLayout,
  stats: { score: number; lives: number; levelStr: string },
): void {
  ctx.save();

  const fontPx = Math.max(16, layout.digitH * 0.82);
  const labelPx = Math.max(11, layout.digitH * 0.38);
  const gap = Math.max(8, layout.digitH * 0.2);
  const yMid = layout.frameY + layout.frameH * 0.5;
  const fillNum = "rgba(248, 250, 252, 0.96)";
  const fillLabel = "rgba(148, 163, 184, 0.95)";

  const padX = layout.frameW * 0.06;
  const scoreStr = String(Math.max(0, Math.floor(stats.score)));
  drawHudNumericText(ctx, scoreStr, padX, yMid, fontPx, 800, fillNum);

  const levelDigits = stats.levelStr.replace(/\D/g, "") || "1";
  const lvText = "LV";
  const lvW = measureHudLabelText(ctx, lvText, labelPx, 700);
  const lvlW = measureHudNumericText(ctx, levelDigits, fontPx, 800);
  const centerW = lvW + gap + lvlW;
  let cx = (layout.frameW - centerW) / 2;
  ctx.save();
  ctx.font = "700 " + String(labelPx) + "px " + HUD_LABEL_FONT_STACK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fillLabel;
  ctx.fillText(lvText, cx, yMid);
  ctx.restore();
  cx += lvW + gap;
  drawHudNumericText(ctx, levelDigits, cx, yMid, fontPx, 800, fillNum);

  const livesStr = String(Math.max(0, Math.floor(stats.lives)));
  const livesW = measureHudNumericText(ctx, livesStr, fontPx, 800);
  const xW = measureHudLabelText(ctx, "×", labelPx, 600);
  const groupW = livesW + gap * 0.5 + xW;
  let rx = layout.frameW - padX - groupW;
  drawHudNumericText(ctx, livesStr, rx, yMid, fontPx, 800, fillNum);
  rx += livesW + gap * 0.5;
  ctx.save();
  ctx.font = "600 " + String(labelPx) + "px " + HUD_LABEL_FONT_STACK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fillLabel;
  ctx.fillText("×", rx, yMid);
  ctx.restore();

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

function measureVersusHudNumber(ctx: CanvasRenderingContext2D, value: number, fontPx: number, weight: number): number {
  const str = String(Math.max(0, Math.floor(value)));
  return measureHudNumericText(ctx, str, fontPx, weight);
}

function drawVersusHudNumber(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  yMid: number,
  fontPx: number,
  weight: number,
  fillStyle: string,
): void {
  const str = String(Math.max(0, Math.floor(value)));
  drawHudNumericText(ctx, str, x, yMid, fontPx, weight, fillStyle);
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
  layout: VersusHudLayout,
  stats: { r1: number; r2: number; s1: number; s2: number },
  viewW: number,
  viewH: number,
  arenaTop: number,
  arenaBottom: number,
): void {
  const w = viewW;
  const h = viewH;
  const pad = w * 0.05;
  const remFontPx = Math.max(15, layout.digitH * 0.78);
  const scoreFontPx = Math.max(14, layout.digitH * 0.72);
  const ptsLabPx = Math.max(9, layout.digitH * 0.28);
  const strokeGlowPad = 20;
  const uiGap = 12;
  const pillBottomExtent = layout.digitH + 6;

  ctx.save();

  const { topY } = computeVersusTopPillLayoutY(layout, arenaTop);

  const min = isMinimalBreakoutVisual();
  const mc = min ? getMinColors() : null;
  const yMidRemTop = topY + layout.digitH * 0.5;
  const yMidScoreTop = topY + (layout.digitH - scoreFontPx) * 0.35 + scoreFontPx * 0.52;

  ctx.fillStyle = min && mc ? mc.pillFill : "rgba(220, 38, 38, 0.18)";
  pathHudRound(ctx, pad, topY - 4, w - pad * 2, layout.digitH + 10, 10);
  ctx.fill();
  ctx.strokeStyle = min && mc ? mc.pillStroke : "rgba(248, 113, 113, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const remFillTop = min && mc ? mc.textMuted : "rgba(226, 232, 240, 0.9)";
  const scoreFillTop = min && mc ? mc.text : "rgba(248, 250, 252, 0.95)";
  const pillTopH = layout.digitH + 10;
  const pillTopCx = w * 0.5;
  const pillTopCy = topY - 4 + pillTopH * 0.5;
  ctx.save();
  ctx.translate(pillTopCx, pillTopCy);
  ctx.rotate(Math.PI);
  ctx.translate(-pillTopCx, -pillTopCy);
  drawVersusHudNumber(ctx, stats.r2, pad + 12, yMidRemTop, remFontPx, 800, remFillTop);
  const s2w = measureVersusHudNumber(ctx, stats.s2, scoreFontPx, 800);
  const ptsLab = "PTS";
  ctx.font = "600 " + String(ptsLabPx) + "px " + HUD_LABEL_FONT_STACK;
  ctx.fillStyle = min && mc ? mc.accent : "rgba(254, 202, 202, 0.85)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(ptsLab, w - pad - 10 - s2w - 10, topY + layout.digitH * 0.45);
  drawVersusHudNumber(ctx, stats.s2, w - pad - 10 - s2w, yMidScoreTop, scoreFontPx, 800, scoreFillTop);
  ctx.restore();

  const minPillTop = arenaBottom + uiGap + strokeGlowPad;
  const maxPillBottomScreen = h - layout.bottomSafeInset - 6;
  let botY = minPillTop + 4;
  if (botY + pillBottomExtent > maxPillBottomScreen) {
    botY = maxPillBottomScreen - pillBottomExtent;
  }
  botY = Math.max(minPillTop + 4, botY);
  const yMidRemBot = botY + layout.digitH * 0.5;
  const yMidScoreBot = botY + (layout.digitH - scoreFontPx) * 0.35 + scoreFontPx * 0.52;

  ctx.fillStyle = min && mc ? mc.pillFill : "rgba(15, 23, 42, 0.35)";
  pathHudRound(ctx, pad, botY - 4, w - pad * 2, layout.digitH + 10, 10);
  ctx.fill();
  ctx.strokeStyle = min && mc ? mc.pillStroke : "rgba(239, 68, 68, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const remFillBot = min && mc ? mc.textMuted : "rgba(226, 232, 240, 0.9)";
  const scoreFillBot = min && mc ? mc.text : "rgba(248, 250, 252, 0.95)";
  ctx.textAlign = "left";
  drawVersusHudNumber(ctx, stats.r1, pad + 12, yMidRemBot, remFontPx, 800, remFillBot);
  const s1w = measureVersusHudNumber(ctx, stats.s1, scoreFontPx, 800);
  ctx.font = "600 " + String(ptsLabPx) + "px " + HUD_LABEL_FONT_STACK;
  ctx.fillStyle = min && mc ? mc.accent : "rgba(239, 68, 68, 0.82)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(ptsLab, w - pad - 10 - s1w - 10, botY + layout.digitH * 0.45);
  drawVersusHudNumber(ctx, stats.s1, w - pad - 10 - s1w, yMidScoreBot, scoreFontPx, 800, scoreFillBot);

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
