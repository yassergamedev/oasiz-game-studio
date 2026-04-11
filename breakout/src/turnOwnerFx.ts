/**
 * Smooth camera-style emphasis when the ball is stuck to a player's paddle (serve / turnover).
 * Eases between P1 (bottom) and P2 (top) with subtle scale, a one-shot shake on turnover,
 * and diagonal shine sweeps (time-driven so they always animate when visible).
 */

export type StuckOwner = 0 | 1 | 2;

export class TurnOwnerFx {
  /** Smoothed emphasis: -1 = P2 (top), +1 = P1 (bottom), 0 = neutral */
  private bias = 0;
  private lastRaw: StuckOwner = 0;
  /** One-shot screen bump when possession changes (decays to 0) */
  private shakeRemain = 0;
  private shakeDX = 0;
  private shakeDY = 0;

  constructor(private readonly reduceMotion: boolean) {}

  tick(dt: number, raw: StuckOwner, enabled: boolean): void {
    const target: -1 | 0 | 1 =
      !enabled ? 0 : raw === 1 ? 1 : raw === 2 ? -1 : 0;
    const k = this.reduceMotion ? 16 : 9;
    const t = 1 - Math.exp(-k * dt);
    this.bias += (target - this.bias) * t;

    if (enabled && raw !== 0 && raw !== this.lastRaw) {
      if (!this.reduceMotion) {
        this.shakeRemain = 1;
        const ang = Math.random() * Math.PI * 2;
        this.shakeDX = Math.cos(ang);
        this.shakeDY = Math.sin(ang);
      }
    }
    this.lastRaw = raw;

    this.shakeRemain *= Math.exp(-26 * dt);
    if (this.shakeRemain < 0.015) this.shakeRemain = 0;
  }

  /**
   * Call inside ctx.save() — scales and shifts view toward the active player's side.
   */
  applyTransform(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const b = this.bias;
    if (Math.abs(b) < 0.002 && this.shakeRemain < 0.015) return;

    const focusY = h * (0.5 + b * 0.185);
    const sc = 1 + 0.034 * Math.abs(b);

    const amp = 4.2 * this.shakeRemain * this.shakeRemain;
    const sx = this.shakeDX * amp;
    const sy = this.shakeDY * amp;

    ctx.translate(w * 0.5 + sx, focusY + sy);
    ctx.scale(sc, sc);
    ctx.translate(-w * 0.5, -focusY);
  }

  /**
   * Diagonal shine band sweeping across the half of the arena that has the ball.
   * Uses wall-clock time for phase so motion does not depend on bias thresholds.
   */
  drawShine(
    ctx: CanvasRenderingContext2D,
    wallLeft: number,
    wallRight: number,
    rimTop: number,
    rimBot: number,
    nowMs: number,
  ): void {
    const b = this.bias;
    const a = Math.min(1, Math.abs(b) * 1.35);
    if (a < 0.04) return;

    const mid = (rimTop + rimBot) * 0.5;
    const wallW = wallRight - wallLeft;
    const isP1 = b > 0;
    const zoneTop = isP1 ? mid : rimTop;
    const zoneBot = isP1 ? rimBot : mid;
    const zoneH = zoneBot - zoneTop;
    if (zoneH < 8) return;

    const speed = this.reduceMotion ? 0.72 : 2.35;
    const phase = nowMs * 0.001 * speed;
    const t = phase - Math.floor(phase);
    const t2 = phase * 0.92 + 0.37;
    const t2w = t2 - Math.floor(t2);

    const alongX = wallW;
    const alongY = isP1 ? -zoneH : zoneH;
    const alen = Math.hypot(alongX, alongY) || 1;
    const nx = -alongY / alen;
    const ny = alongX / alen;
    const startX = wallLeft;
    const startY = isP1 ? zoneBot : zoneTop;
    const cx = startX + t * alongX;
    const cy = startY + t * alongY;
    const band = alen * 0.13;

    ctx.save();
    ctx.beginPath();
    ctx.rect(wallLeft, zoneTop, wallW, zoneH);
    ctx.clip();

    const peak = isP1 ? "rgba(186, 230, 253, 0.55)" : "rgba(221, 214, 254, 0.52)";
    const g = ctx.createLinearGradient(
      cx - nx * band,
      cy - ny * band,
      cx + nx * band,
      cy + ny * band,
    );
    g.addColorStop(0, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.38, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.5, peak);
    g.addColorStop(0.62, "rgba(255, 255, 255, 0)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.72 * a;
    ctx.fillStyle = g;
    ctx.fillRect(wallLeft, zoneTop, wallW, zoneH);

    const cx2 = startX + t2w * alongX;
    const cy2 = startY + t2w * alongY;
    const band2 = alen * 0.09;
    const g2 = ctx.createLinearGradient(
      cx2 - nx * band2,
      cy2 - ny * band2,
      cx2 + nx * band2,
      cy2 + ny * band2,
    );
    g2.addColorStop(0, "rgba(255, 255, 255, 0)");
    g2.addColorStop(0.5, isP1 ? "rgba(56, 189, 248, 0.45)" : "rgba(167, 139, 250, 0.45)");
    g2.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.globalAlpha = 0.38 * a;
    ctx.fillStyle = g2;
    ctx.fillRect(wallLeft, zoneTop, wallW, zoneH);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
}
