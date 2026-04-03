/**
 * Oasiz platform hooks (see AGENTS.md / CLAUDE.md).
 * Final score is reported only on game over — not on every merge.
 */

export function submitFinalScoreToPlatform(score: number): void {
  const n = Math.max(0, Math.floor(score));
  console.log("[submitFinalScoreToPlatform]", String(n));
  const fn = (window as unknown as { submitScore?: (x: number) => void }).submitScore;
  if (typeof fn === "function") {
    fn(n);
  }
}
