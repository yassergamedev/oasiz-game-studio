/**
 * High-contrast minimal look (black + red teams) aligned with side-column mockups.
 * `BREAKOUT_MINIMAL_VISUAL` restores the older neon space theme when false.
 * Dark / light palettes switch with settings (see `setBreakoutTheme`).
 */

export const BREAKOUT_MINIMAL_VISUAL = true;

export type BreakoutTheme = "dark" | "light";

export interface MinColorSet {
  void: string;
  arenaStroke: string;
  arenaStrokeSoft: string;
  /** Radial vignette stops after base fill [inner, mid, outer]. */
  vignette0: string;
  vignette1: string;
  vignette2: string;
  accent: string;
  accentSoft: string;
  text: string;
  textMuted: string;
  /** Drop shadow under floating score text (minimal mode). */
  scorePopupShadow: string;
  scoreComboShadow: string;
  pillFill: string;
  pillStroke: string;
  brickP1Fill: string;
  brickP1Stroke: string;
  brickP2Fill: string;
  brickP2Stroke: string;
  paddleP1Fill: string;
  paddleP1Stroke: string;
  paddleP2Fill: string;
  paddleP2Stroke: string;
  paddleShadowGlow: string;
  ball: string;
  ballSlow: string;
  ballStroke: string;
  ballStrokeSlow: string;
  /** Heavy stroke behind countdown digits (minimal). */
  countdownStroke: string;
}

const minColorsDark: MinColorSet = {
  void: "#0a0a0a",
  arenaStroke: "rgba(255, 255, 255, 0.58)",
  arenaStrokeSoft: "rgba(255, 255, 255, 0.22)",
  vignette0: "rgba(255, 255, 255, 0.045)",
  vignette1: "rgba(0, 0, 0, 0.12)",
  vignette2: "rgba(0, 0, 0, 0.55)",
  accent: "#ef4444",
  accentSoft: "#fca5a5",
  text: "#fafafa",
  textMuted: "rgba(245, 245, 245, 0.72)",
  scorePopupShadow: "rgba(0, 0, 0, 0.55)",
  scoreComboShadow: "rgba(0, 0, 0, 0.5)",
  pillFill: "rgba(18, 18, 18, 0.92)",
  pillStroke: "rgba(255, 255, 255, 0.55)",
  brickP1Fill: "#0a0a0a",
  brickP1Stroke: "#ef4444",
  brickP2Fill: "#b91c1c",
  brickP2Stroke: "#0a0a0a",
  paddleP1Fill: "#0a0a0a",
  paddleP1Stroke: "#ef4444",
  paddleP2Fill: "#dc2626",
  paddleP2Stroke: "#0a0a0a",
  paddleShadowGlow: "rgba(239, 68, 68, 0.22)",
  ball: "#ef4444",
  ballSlow: "#fecaca",
  ballStroke: "#450a0a",
  ballStrokeSlow: "#991b1b",
  countdownStroke: "#0a0a0a",
};

const minColorsLight: MinColorSet = {
  void: "#f4f4f5",
  arenaStroke: "rgba(10, 10, 10, 0.38)",
  arenaStrokeSoft: "rgba(10, 10, 10, 0.2)",
  vignette0: "rgba(255, 255, 255, 0.65)",
  vignette1: "rgba(0, 0, 0, 0.04)",
  vignette2: "rgba(0, 0, 0, 0.1)",
  accent: "#dc2626",
  accentSoft: "#b91c1c",
  text: "#0a0a0a",
  textMuted: "rgba(10, 10, 10, 0.68)",
  scorePopupShadow: "rgba(255, 255, 255, 0.75)",
  scoreComboShadow: "rgba(255, 255, 255, 0.65)",
  pillFill: "rgba(255, 255, 255, 0.92)",
  pillStroke: "rgba(10, 10, 10, 0.45)",
  brickP1Fill: "#0a0a0a",
  brickP1Stroke: "#dc2626",
  brickP2Fill: "#dc2626",
  brickP2Stroke: "#0a0a0a",
  paddleP1Fill: "#0a0a0a",
  paddleP1Stroke: "#dc2626",
  paddleP2Fill: "#dc2626",
  paddleP2Stroke: "#0a0a0a",
  paddleShadowGlow: "rgba(220, 38, 38, 0.2)",
  ball: "#dc2626",
  ballSlow: "#fca5a5",
  ballStroke: "#450a0a",
  ballStrokeSlow: "#991b1b",
  countdownStroke: "rgba(255, 255, 255, 0.92)",
};

let currentTheme: BreakoutTheme = "dark";

export function isMinimalBreakoutVisual(): boolean {
  return BREAKOUT_MINIMAL_VISUAL;
}

export function getBreakoutTheme(): BreakoutTheme {
  return currentTheme;
}

export function getMinColors(): MinColorSet {
  return currentTheme === "light" ? minColorsLight : minColorsDark;
}

/** Call on boot from saved settings (after `loadSettings`). */
export function initBreakoutThemeFromStorage(theme: BreakoutTheme): void {
  currentTheme = theme === "light" ? "light" : "dark";
  syncThemeDocumentClass();
}

/** Call when user toggles appearance in settings. */
export function setBreakoutTheme(theme: BreakoutTheme): void {
  currentTheme = theme === "light" ? "light" : "dark";
  syncThemeDocumentClass();
}

function syncThemeDocumentClass(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("minimal-breakout--light", currentTheme === "light");
}

/** Arena frame pulse stroke (minimal background path). */
export function getMinimalArenaBorderPulse(pulse: number): string {
  const p = Math.max(0, Math.min(1, pulse));
  if (currentTheme === "light") {
    return "rgba(10, 10, 10, " + String(p * 0.42) + ")";
  }
  return "rgba(255, 255, 255, " + String(p * 0.55) + ")";
}

/** Adds `minimal-breakout` on `<html>` for CSS overrides (start screen, chrome). */
export function enableMinimalBreakoutDocumentClass(): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("minimal-breakout");
  }
}
