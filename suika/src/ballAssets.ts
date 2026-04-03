/**
 * Sports ball images in ../assets/balls (png, jpg, webp).
 * Root assets (e.g. bg.png, net.png) are excluded — only this folder is scanned.
 * Filenames (without extension) are stable ids for bounds config.
 */

const modules = import.meta.glob("../assets/balls/**/*.{png,jpg,jpeg,webp}", {
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
