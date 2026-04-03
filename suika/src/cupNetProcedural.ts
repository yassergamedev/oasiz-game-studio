/**
 * Canvas-drawn mesh inside the play cup, below the danger line, down to the bottom.
 */

export interface CupNetLayoutPick {
  cupX: number;
  cupY: number;
  cupW: number;
  cupH: number;
  dangerY: number;
}

const CUP_R = 16;

export function drawProceduralCupNet(
  ctx: CanvasRenderingContext2D,
  layout: CupNetLayoutPick,
  infernoHeat: number,
  nowMs: number,
  introScale = 1,
): void {
  const { cupX, cupY, cupW, cupH, dangerY } = layout;
  const marginBelowLine = 5;
  const marginBottom = 4;
  const top = dangerY + marginBelowLine;
  const bottom = cupY + cupH - marginBottom;
  const depth = bottom - top;
  if (depth < 28) return;

  const edge = Math.max(1.5, Math.min(2.5, cupW * 0.004));
  const left = cupX + edge;
  const right = cupX + cupW - edge;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cupX, cupY, cupW, cupH, CUP_R);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(cupX - 2, top - 1, cupW + 4, depth + 3);
  ctx.clip();

  if (introScale < 0.998) {
    const cx = cupX + cupW / 2;
    const cy = (top + bottom) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(introScale, introScale);
    ctx.translate(-cx, -cy);
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const spacing = Math.max(20, Math.min(34, Math.floor(cupW / 11)));
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  const span = depth + 4;
  let s = left - span;
  while (s < right + span) {
    ctx.beginPath();
    ctx.moveTo(s, top - 1);
    ctx.lineTo(s + span, bottom + 1);
    ctx.stroke();
    s += spacing;
  }
  s = left - span;
  while (s < right + span) {
    ctx.beginPath();
    ctx.moveTo(s, top - 1);
    ctx.lineTo(s - span, bottom + 1);
    ctx.stroke();
    s += spacing;
  }

  ctx.lineWidth = 1.05;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.24)";
  const rows = Math.max(3, Math.floor(depth / 30));
  const sagAmp = Math.min(2.8, 1.2 + depth * 0.004);
  for (let i = 0; i <= rows; i++) {
    const y = top + ((bottom - top) * i) / rows;
    const t = rows === 0 ? 0 : i / rows;
    const sag = i === 0 || i === rows ? 0 : sagAmp * Math.sin(t * Math.PI);
    ctx.beginPath();
    ctx.moveTo(left, y + sag * 0.25);
    ctx.quadraticCurveTo(cupX + cupW / 2, y + sag, right, y + sag * 0.25);
    ctx.stroke();
  }

  if (infernoHeat > 0.035) {
    const flick = infernoHeat * (0.42 + 0.38 * Math.sin(nowMs * 0.021));
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "rgba(255, 200, 60, " + (flick * 0.55).toFixed(3) + ")";
    s = left - span;
    let idx = 0;
    while (s < right + span) {
      const wob = Math.sin(nowMs * 0.031 + idx * 0.7) * 2.5 * infernoHeat;
      ctx.beginPath();
      ctx.moveTo(s + wob, top - 1);
      ctx.lineTo(s + span - wob, bottom + 1);
      ctx.stroke();
      s += spacing;
      idx++;
    }
    s = left - span;
    idx = 0;
    while (s < right + span) {
      const wob = Math.cos(nowMs * 0.028 + idx * 0.6) * 2.5 * infernoHeat;
      ctx.beginPath();
      ctx.moveTo(s - wob, top - 1);
      ctx.lineTo(s - span + wob, bottom + 1);
      ctx.stroke();
      s += spacing;
      idx++;
    }
    ctx.strokeStyle = "rgba(255, 80, 30, " + (flick * 0.45).toFixed(3) + ")";
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= rows; i++) {
      const y = top + ((bottom - top) * i) / rows;
      const t = rows === 0 ? 0 : i / rows;
      const sag = i === 0 || i === rows ? 0 : sagAmp * Math.sin(t * Math.PI);
      const fy = Math.sin(nowMs * 0.04 + i * 1.1) * 3 * infernoHeat;
      ctx.beginPath();
      ctx.moveTo(left, y + sag * 0.25 + fy);
      ctx.quadraticCurveTo(cupX + cupW / 2, y + sag + fy * 0.5, right, y + sag * 0.25 + fy);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  if (introScale < 0.998) {
    ctx.restore();
  }

  ctx.restore();
}
