import paddleUrl from "../assets/paddle.png";

export interface BreakoutUiPack {
  paddle: HTMLImageElement;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error("Failed to load " + src));
    img.src = src;
  });
}

export async function loadBreakoutUiPack(): Promise<BreakoutUiPack> {
  const paddle = await loadImage(paddleUrl);
  console.log("[loadBreakoutUiPack]", "paddle sprite ready");
  return { paddle };
}
