/**
 * Ball display radius (px) from cup span — same formula as SuikaGame physics/draw.
 * cupMin should be Math.min(cupW, cupH) for the active layout.
 */
export function tierRadiusFromCupMin(cupMin: number, tier: number): number {
  const m = cupMin;
  const r0 = m * 0.042;
  const g = 1.26;
  const r = r0 * Math.pow(g, tier);
  const cap = m * 0.38;
  return Math.min(r, cap);
}
