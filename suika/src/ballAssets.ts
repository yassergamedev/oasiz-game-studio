/**
 * Sports ball images in ../assets (png, jpg, webp).
 * Filenames (without extension) are used as stable ids for bounds config.
 */

const modules = import.meta.glob("../assets/**/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export interface BallAsset {
  id: string;
  url: string;
}

function pathToId(vitePath: string): string {
  const base = vitePath.split("/").pop() ?? vitePath;
  return base.replace(/\.[^.]+$/i, "");
}

export function getBallAssets(): BallAsset[] {
  return Object.entries(modules)
    .map(([path, url]) => ({ id: pathToId(path), url }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }));
}
