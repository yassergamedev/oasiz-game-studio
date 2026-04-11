import brickBlueBig from "../assets/brick-blue-big.png";
import brickBlueMid from "../assets/brick-blue-mid.png";
import brickBlueSmall from "../assets/brick-blue-small.png";
import brickGreenBig from "../assets/brick-green-big.png";
import brickGreenMid from "../assets/brick-green-mid.png";
import brickGreenSmall from "../assets/brick-green-small.png";
import brickOrangeBig from "../assets/brick-orange-big.png";
import brickOrangeMid from "../assets/brick-orange-mid.png";
import brickOrangeSmall from "../assets/brick-orange-small.png";
import brickVioletBig from "../assets/brick-violet-big.png";
import brickVioletMid from "../assets/brick-violet-mid.png";
import brickVioletSmall from "../assets/brick-violet-small.png";

/** Matches filenames: brick-{hue}-{tier}.png */
export const BRICK_HUES = ["blue", "green", "orange", "violet"] as const;
export type BrickHue = (typeof BRICK_HUES)[number];

/** Matches filenames: small | mid | big (top rows → small, lower rows → big). */
export const BRICK_TIERS = ["small", "mid", "big"] as const;
export type BrickSizeTier = (typeof BRICK_TIERS)[number];

/** HP per tier — aligns with asset naming (small = light, big = heavy). */
export const BRICK_TIER_MAX_HP: Record<BrickSizeTier, number> = {
  small: 1,
  mid: 2,
  big: 3,
};

export type BrickTextureAtlas = Record<BrickHue, Record<BrickSizeTier, HTMLImageElement>>;

const URLS: Record<BrickHue, Record<BrickSizeTier, string>> = {
  blue: { big: brickBlueBig, mid: brickBlueMid, small: brickBlueSmall },
  green: { big: brickGreenBig, mid: brickGreenMid, small: brickGreenSmall },
  orange: { big: brickOrangeBig, mid: brickOrangeMid, small: brickOrangeSmall },
  violet: { big: brickVioletBig, mid: brickVioletMid, small: brickVioletSmall },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error("Failed to load " + src));
    img.src = src;
  });
}

/**
 * Row 0 = top of wall: small bricks; last rows: big bricks.
 */
export function tierForRow(rowIndex: number, rowCount: number): BrickSizeTier {
  if (rowCount <= 0) return "mid";
  if (rowCount === 1) return "mid";
  const a = Math.ceil(rowCount / 3);
  const b = Math.ceil((2 * rowCount) / 3);
  if (rowIndex < a) return "small";
  if (rowIndex < b) return "mid";
  return "big";
}

export function scoreForDestroyedBrick(tier: BrickSizeTier): number {
  return 10 * BRICK_TIER_MAX_HP[tier];
}

export async function loadBrickTextureAtlas(): Promise<BrickTextureAtlas> {
  const entries = BRICK_HUES.flatMap((hue) =>
    BRICK_TIERS.map((tier) => ({ hue, tier, src: URLS[hue][tier] })),
  );
  const loaded = await Promise.all(entries.map((e) => loadImage(e.src)));
  const atlas = {} as BrickTextureAtlas;
  let i = 0;
  for (const hue of BRICK_HUES) {
    atlas[hue] = {
      small: loaded[i++],
      mid: loaded[i++],
      big: loaded[i++],
    };
  }
  console.log("[loadBrickTextureAtlas]", "loaded", String(entries.length), "brick textures");
  return atlas;
}
