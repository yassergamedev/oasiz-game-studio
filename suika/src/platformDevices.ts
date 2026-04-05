/**
 * Host hints for physics / collider policy. Oasiz iOS WebKit is stricter than desktop
 * about compound vertices, sleeping stacks, and FP edge cases.
 */

export function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return true;
  }
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true;
  }
  /* iPadOS 13+ “desktop” Safari / some embedded WebViews */
  if (navigator.maxTouchPoints > 1 && /Macintosh|Mac OS X/i.test(ua)) {
    return true;
  }
  return false;
}
