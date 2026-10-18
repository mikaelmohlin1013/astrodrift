// The on-screen overlay: title screen, hull bar, crystal count, timer,
// messages, hit flash and the end-of-run panels.
export class Hud {
  private stats = byId('stats');
  private timer = byId('timer');
  private help = byId('help');
  private hullFill = byId('hull-fill');
  private score = byId('score');
  private time = byId('time');
  private best = byId('best');
  private toast = byId('toast');
  private soundState = byId('sound-state');
  private hitFlash = byId('hit-flash');
  private title = byId('title');
  private titleBest = byId('title-best');
  private gameOver = byId('game-over');
  private finalScore = byId('final-score');
  private levelClear = byId('level-clear');
  private clearTime = byId('clear-time');
  private clearDetail = byId('clear-detail');
  private toastTimer = 0;

  update(hull: number, collected: number, total: number, seconds: number, best: number | null): void {
    this.hullFill.style.width = `${Math.round(hull * 100)}%`;
    this.hullFill.style.background = hull > 0.5 ? '#4fc3ff' : hull > 0.25 ? '#ffb340' : '#ff4f5e';
    this.score.innerHTML = `${collected} <small>/ ${total}</small>`;
    this.time.textContent = formatTime(seconds);
    this.best.textContent = best === null ? '--' : formatTime(best);
  }

  /** Shows a message in the middle of the screen for a few seconds. */
  message(text: string, seconds = 2.5): void {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('on'), seconds * 1000);
  }

  setSound(on: boolean): void {
    this.soundState.textContent = on ? 'on' : 'off';
  }

  flash(): void {
    // Restart the CSS animation.
    this.hitFlash.classList.remove('on');
    void this.hitFlash.offsetWidth;
    this.hitFlash.classList.add('on');
  }

  showTitle(best: number | null): void {
    this.titleBest.textContent = best === null ? '' : `Best time ${formatTime(best)}`;
    this.title.classList.remove('hidden');
    for (const el of [this.stats, this.timer, this.help]) el.classList.add('hidden');
  }

  showPlaying(): void {
    for (const el of [this.title, this.gameOver, this.levelClear]) el.classList.add('hidden');
    for (const el of [this.stats, this.timer, this.help]) el.classList.remove('hidden');
    this.toast.classList.remove('on');
  }

  showGameOver(collected: number, total: number): void {
    this.finalScore.textContent = `${collected} of ${total} crystals collected`;
    this.gameOver.classList.remove('hidden');
    this.help.classList.add('hidden');
  }

  showLevelClear(seconds: number, best: number, hull: number): void {
    const record = seconds <= best;
    this.clearTime.textContent = `${formatTime(seconds)}${record ? ' · new best!' : ` · best ${formatTime(best)}`}`;
    this.clearDetail.textContent = `Hull left ${Math.round(hull * 100)}%`;
    this.levelClear.classList.remove('hidden');
    this.help.classList.add('hidden');
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return m > 0 ? `${m}:${s}` : s.replace(/^0(?=\d\.)/, '');
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
