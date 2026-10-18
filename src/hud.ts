// The on-screen overlay: hull bar, score, hit flash and the game-over panel.
export class Hud {
  private hullFill = byId('hull-fill');
  private score = byId('score');
  private best = byId('best');
  private hitFlash = byId('hit-flash');
  private gameOver = byId('game-over');
  private finalScore = byId('final-score');

  update(hull: number, score: number, best: number): void {
    this.hullFill.style.width = `${Math.round(hull * 100)}%`;
    this.hullFill.style.background = hull > 0.5 ? '#4fc3ff' : hull > 0.25 ? '#ffb340' : '#ff4f5e';
    this.score.textContent = String(score);
    this.best.textContent = String(best);
  }

  flash(): void {
    // Restart the CSS animation.
    this.hitFlash.classList.remove('on');
    void this.hitFlash.offsetWidth;
    this.hitFlash.classList.add('on');
  }

  showGameOver(score: number, best: number): void {
    this.finalScore.textContent = score === best && score > 0 ? `${score} crystals · new best!` : `${score} crystals · best ${best}`;
    this.gameOver.hidden = false;
  }

  hideGameOver(): void {
    this.gameOver.hidden = true;
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
