/**
 * Stacking screen juice for merges: shake, flash, combo zoom, net-focus zoom pulse, inferno heat.
 */

export type MergeWordTier = "normal" | "good" | "inferno";

export function mergeWordTier(scoreAdd: number, newTier: number): MergeWordTier {
  if (scoreAdd >= 75 || newTier >= 7) return "inferno";
  if (scoreAdd >= 40 || newTier >= 4) return "good";
  return "normal";
}

export class MergeJuice {
  private combo = 0;
  private lastMergeAt = 0;
  private shakeAmp = 0;
  private flash = 0;
  private zoomAdd = 0;
  private shakeT = 0;
  private readonly comboBreakMs = 380;

  private netZoomU = 0;
  private netZoomPlaying = false;
  private netZoomStrength = 1;

  private infernoHeat = 0;

  /**
   * @param visuals - When false (e.g. reduced motion), only updates combo timing for SFX; no shake/flash/zoom.
   */
  trigger(visuals = true): void {
    const now = performance.now();
    if (now - this.lastMergeAt > this.comboBreakMs) {
      this.combo = 0;
    }
    this.combo = Math.min(this.combo + 1, 14);
    this.lastMergeAt = now;
    if (!visuals) return;
    this.applyVisualBurst();
  }

  /**
   * Apply shake/flash/zoom based on the current combo without incrementing combo count.
   * Useful when merge celebrations are coalesced (burst debounce) to avoid stacked VFX lag.
   */
  burstVisualsFromCurrentCombo(): void {
    this.applyVisualBurst();
  }

  private applyVisualBurst(): void {
    const mult = 1 + this.combo * 0.2;
    this.shakeAmp = Math.min(24, this.shakeAmp + 5.8 * mult);
    this.flash = Math.min(0.78, this.flash + 0.17 * mult);
    this.zoomAdd = Math.min(0.032, this.zoomAdd + 0.0065 * mult);
  }

  /** Zoom toward net (in then out). Strength 1 = good merge, higher = inferno. */
  triggerNetZoom(strength = 1): void {
    this.netZoomPlaying = true;
    this.netZoomU = 0;
    this.netZoomStrength = strength;
  }

  /** Hot bg + net fire intensity. */
  triggerInfernoPulse(): void {
    this.infernoHeat = Math.min(1, this.infernoHeat + 0.88);
  }

  update(dt: number): void {
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-dt * 10);
    this.flash *= Math.exp(-dt * 6.8);
    this.zoomAdd *= Math.exp(-dt * 6);
    if (this.shakeAmp < 0.12) this.shakeAmp = 0;
    if (this.flash < 0.008) this.flash = 0;
    if (this.zoomAdd < 0.0006) this.zoomAdd = 0;
    if (performance.now() - this.lastMergeAt > this.comboBreakMs + 100) {
      this.combo = 0;
    }

    if (this.netZoomPlaying) {
      this.netZoomU += dt / 0.64;
      if (this.netZoomU >= 1) {
        this.netZoomU = 0;
        this.netZoomPlaying = false;
      }
    }

    this.infernoHeat *= Math.exp(-dt * 0.42);
    if (this.infernoHeat < 0.012) this.infernoHeat = 0;
  }

  getShakePx(): { x: number; y: number } {
    const a = this.shakeAmp;
    const t = this.shakeT;
    if (a < 0.08) return { x: 0, y: 0 };
    const c = 1 + this.combo * 0.06;
    const x =
      Math.sin(t * 58 * c) * a * 0.52 +
      Math.sin(t * 93 + 1.1) * a * 0.4 +
      Math.sin(t * 29 + 0.3) * a * 0.24;
    const y =
      Math.cos(t * 49 + 0.7) * a * 0.5 +
      Math.cos(t * 76 + 2) * a * 0.34;
    return { x, y };
  }

  /** Combo bounce zoom (always on). */
  getScale(): number {
    return 1 + this.zoomAdd;
  }

  /** Net focus: 1 at rest, peaks mid-animation. */
  getNetZoomFactor(): number {
    if (!this.netZoomPlaying && this.netZoomU <= 0) return 1;
    const u = this.netZoomPlaying ? Math.min(1, this.netZoomU) : 0;
    return 1 + 0.12 * this.netZoomStrength * Math.sin(Math.PI * u);
  }

  getFlash(): number {
    return this.flash;
  }

  getCombo(): number {
    return this.combo;
  }

  /** 0–1 for bg tint + net fire. */
  getInfernoHeat(): number {
    return this.infernoHeat;
  }
}
