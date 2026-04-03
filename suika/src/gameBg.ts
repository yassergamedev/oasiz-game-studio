/**
 * Optional full-screen gameplay background: place suika/assets/bg.png
 */

const bgModules = import.meta.glob("../assets/bg.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const bgUrl = Object.values(bgModules)[0] ?? null;

export function loadGameBgImage(): Promise<HTMLImageElement | null> {
  if (!bgUrl) {
    console.log("[loadGameBgImage]", "no assets/bg.png");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      console.log("[loadGameBgImage]", "ready");
      resolve(img);
    };
    img.onerror = () => {
      console.log("[loadGameBgImage]", "load error");
      resolve(null);
    };
    img.src = bgUrl;
  });
}

export function drawGameBg(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Soft static fog (no per-frame tile loop — wavy overlay was paused for performance).
 * Draw on top of the base gameplay background only.
 */
export function drawGameplayAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();
  const ww = Math.ceil(w) + 1;
  const hh = Math.ceil(h) + 1;

  ctx.fillStyle = "rgba(236, 246, 255, 0.2)";
  ctx.fillRect(0, 0, ww, hh);

  const g1 = ctx.createLinearGradient(0, 0, ww, hh);
  g1.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  g1.addColorStop(0.5, "rgba(188, 218, 242, 0.1)");
  g1.addColorStop(1, "rgba(255, 255, 255, 0.12)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, ww, hh);

  const g2 = ctx.createLinearGradient(ww, 0, 0, hh);
  g2.addColorStop(0, "rgba(248, 252, 255, 0)");
  g2.addColorStop(0.45, "rgba(230, 242, 252, 0.16)");
  g2.addColorStop(1, "rgba(248, 252, 255, 0.08)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, ww, hh);

  ctx.restore();
}
