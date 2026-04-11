import img0 from "../assets/0.png";
import img1 from "../assets/1.png";
import img2 from "../assets/2.png";
import img3 from "../assets/3.png";
import img4 from "../assets/4.png";
import img5 from "../assets/5.png";
import img6 from "../assets/6.png";
import img7 from "../assets/7.png";
import img8 from "../assets/8.png";
import img9 from "../assets/9.png";
import lvUrl from "../assets/LV.png";
import paddleUrl from "../assets/paddle.png";
import xUrl from "../assets/X.png";

const DIGIT_URLS = [img0, img1, img2, img3, img4, img5, img6, img7, img8, img9] as const;

export interface BreakoutUiPack {
  paddle: HTMLImageElement;
  digits: HTMLImageElement[];
  lv: HTMLImageElement;
  xIcon: HTMLImageElement;
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
  const digitPromises = DIGIT_URLS.map((u) => loadImage(u));
  const [digits, paddle, lv, xIcon] = await Promise.all([
    Promise.all(digitPromises),
    loadImage(paddleUrl),
    loadImage(lvUrl),
    loadImage(xUrl),
  ]);
  console.log("[loadBreakoutUiPack]", "ui sprites ready");
  return { paddle, digits, lv, xIcon };
}
