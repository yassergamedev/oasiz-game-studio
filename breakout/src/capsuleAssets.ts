import convertUrl from "../assets/convert.png";
import multiballUrl from "../assets/multiple.png";
import narrowUrl from "../assets/narrow.png";
import slowUrl from "../assets/slow.png";
import wideUrl from "../assets/wide.png";
import yingUrl from "../assets/ying.png";

/** Sprites for all versus capsule kinds (power-ups and power-downs). */
export type VersusCapsuleImageSet = {
  multiball: HTMLImageElement;
  paddle_big: HTMLImageElement;
  paddle_small: HTMLImageElement;
  slow_ball: HTMLImageElement;
  reverse_colors: HTMLImageElement;
  convert_colors: HTMLImageElement;
};

function loadOne(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      console.log("[loadVersusCapsuleImages]", label, "ready");
      resolve(img);
    };
    img.onerror = (): void => reject(new Error("Failed to load " + label));
    img.src = url;
  });
}

export function loadVersusCapsuleImages(): Promise<VersusCapsuleImageSet> {
  return Promise.all([
    loadOne(multiballUrl, "multiple.png"),
    loadOne(wideUrl, "wide.png"),
    loadOne(narrowUrl, "narrow.png"),
    loadOne(slowUrl, "slow.png"),
    loadOne(yingUrl, "ying.png"),
    loadOne(convertUrl, "convert.png"),
  ]).then(([multiball, paddle_big, paddle_small, slow_ball, reverse_colors, convert_colors]) => ({
    multiball,
    paddle_big,
    paddle_small,
    slow_ball,
    reverse_colors,
    convert_colors,
  }));
}
