export class Menu {
  private menuScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private startBtn: HTMLElement;
  private retryBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private goScore: HTMLElement;
  private goBest: HTMLElement;
  private goNewBest: HTMLElement;
  private menuBest: HTMLElement;

  private onStart: (() => void) | null = null;
  private onRetry: (() => void) | null = null;
  private onMenu: (() => void) | null = null;

  constructor() {
    this.menuScreen = document.getElementById("menu-screen")!;
    this.gameOverScreen = document.getElementById("game-over-screen")!;
    this.startBtn = document.getElementById("start-btn")!;
    this.retryBtn = document.getElementById("retry-btn")!;
    this.menuBtn = document.getElementById("menu-btn")!;
    this.goScore = document.getElementById("go-score")!;
    this.goBest = document.getElementById("go-best")!;
    this.goNewBest = document.getElementById("go-new-best")!;
    this.menuBest = document.getElementById("menu-best")!;

    this.startBtn.addEventListener("click", () => this.onStart?.());
    this.retryBtn.addEventListener("click", () => this.onRetry?.());
    this.menuBtn.addEventListener("click", () => this.onMenu?.());
  }

  setCallbacks(onStart: () => void, onRetry: () => void, onMenu: () => void): void {
    this.onStart = onStart;
    this.onRetry = onRetry;
    this.onMenu = onMenu;
  }

  showMenu(bestScore: number): void {
    this.menuScreen.classList.remove("hidden", "fade-out");
    this.gameOverScreen.classList.remove("visible");
    if (bestScore > 0) {
      this.menuBest.textContent = `Best: ${bestScore}`;
    } else {
      this.menuBest.textContent = "";
    }
  }

  hideMenu(): void {
    this.menuScreen.classList.add("fade-out");
    setTimeout(() => this.menuScreen.classList.add("hidden"), 400);
  }

  showGameOver(score: number, bestScore: number, isNewBest: boolean): void {
    this.goScore.textContent = String(score);
    this.goBest.textContent = `Best: ${bestScore}`;
    if (isNewBest) {
      this.goNewBest.classList.remove("hidden");
    } else {
      this.goNewBest.classList.add("hidden");
    }
    this.gameOverScreen.classList.add("visible");
  }

  hideGameOver(): void {
    this.gameOverScreen.classList.remove("visible");
  }
}
