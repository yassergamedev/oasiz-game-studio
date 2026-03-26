export class HUD {
  private scoreEl: HTMLElement;
  private hudEl: HTMLElement;

  constructor() {
    this.scoreEl = document.getElementById("score-display")!;
    this.hudEl = document.getElementById("hud")!;
  }

  show(): void {
    this.hudEl.classList.remove("hidden");
  }

  hide(): void {
    this.hudEl.classList.add("hidden");
  }

  updateScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }
}
