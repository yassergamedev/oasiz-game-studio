import standardBallUrl from "../assets/standard-ball.png";

export function loadStandardBallImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      console.log("[loadStandardBallImage]", "ready");
      resolve(img);
    };
    img.onerror = (): void => reject(new Error("Failed to load standard-ball.png"));
    img.src = standardBallUrl;
  });
}
