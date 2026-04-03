import type { BallAsset } from "./ballAssets";

/**
 * Evolution chain: index 0 = smallest, last = largest.
 * Leave empty to use all assets from suika/assets/balls sorted by filename.
 */
export const BALL_TIER_ORDER: string[] = [];

export function resolveTierIds(assets: BallAsset[]): string[] {
  if (BALL_TIER_ORDER.length > 0) {
    const set = new Set(assets.map((a) => a.id));
    return BALL_TIER_ORDER.filter((id) => set.has(id));
  }
  return assets.map((a) => a.id);
}
