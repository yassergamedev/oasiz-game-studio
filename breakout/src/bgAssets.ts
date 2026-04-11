import bgUrl from "../assets/bg.png";

export function loadBackgroundImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      console.log("[loadBackgroundImage]", "ready");
      resolve(img);
    };
    img.onerror = (): void => reject(new Error("Failed to load bg.png"));
    img.src = bgUrl;
  });
}
