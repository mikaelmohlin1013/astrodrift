// The on-screen overlay: title screen, hull bar, crystal and enemy counts,
// timer, messages, hit flash and the end-of-run panels.
export class Hud {
  private stats = byId('stats');
  private timer = byId('timer');
  private help = byId('help');
  private hullFill = byId('hull-fill');
  private shieldRow = byId('shield-row');
  private shieldFill = byId('shield-fill');
  private missilesRow = byId('missiles-row');
  private missiles = byId('missiles');
  private bank = byId('bank');
  private titleBank = byId('title-bank');
  private score = byId('score');
  private kills = byId('kills');
  private levelName = byId('level-name');
  private time = byId('time');
  private best = byId('best');
  private toast = byId('toast');
  private soundState = byId('sound-state');
  private hitFlash = byId('hit-flash');
  private title = byId('title');
  private titleBest = byId('title-best');
  private titleLevels = byId('title-levels');
  private titlePrompt = byId('title-prompt');
  private gameOver = byId('game-over');
  private finalScore = byId('final-score');
  private overPrompt = byId('over-prompt');
  private levelClear = byId('level-clear');
  private clearTitle = byId('clear-title');
  private clearTime = byId('clear-time');
  private clearDetail = byId('clear-detail');
  private clearPrompt = byId('clear-prompt');
  private toastTimer = 0;

  update(hull: number, collected: number, total: number, killed: number, enemies: number, seconds: number, best: number | null): void {
    this.hullFill.style.width = `${Math.round(hull * 100)}%`;
    this.hullFill.style.background = hull > 0.5 ? '#4fc3ff' : hull > 0.25 ? '#ffb340' : '#ff4f5e';
    this.score.innerHTML = `${collected} <small>/ ${total}</small>`;
    this.kills.innerHTML = `${killed} <small>/ ${enemies}</small>`;
    this.time.textContent = formatTime(seconds);
    this.best.textContent = best === null ? '--' : formatTime(best);
  }

  /** Shield charge, missiles left and crystals banked and still to bank. */
  updateGear(shield: number, maxShield: number, missiles: number, maxMissiles: number, bank: number, pending: number): void {
    this.shieldRow.classList.toggle('hidden', maxShield === 0);
    if (maxShield > 0) this.shieldFill.style.width = `${Math.round((shield / maxShield) * 100)}%`;
    this.missilesRow.classList.toggle('hidden', maxMissiles === 0);
    if (maxMissiles > 0) {
      this.missiles.innerHTML = missiles > 0 ? `${'▲'.repeat(missiles)}` : '<small>empty · restock at a station</small>';
    }
    this.bank.innerHTML = `◆ ${bank}${pending > 0 ? ` <small>+${pending} to bank</small>` : ''}`;
  }

  /** Shows a message in the middle of the screen for a few seconds. */
  message(text: string, seconds = 2.5): void {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('on'), seconds * 1000);
  }

  hideMessage(): void {
    clearTimeout(this.toastTimer);
    this.toast.classList.remove('on');
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

  showTitle(best: number | null, levels: string[], unlocked: number, bank: number): void {
    this.titleBank.innerHTML = bank > 0 ? `◆ ${bank} crystals banked · press <kbd>U</kbd> to spend them` : '';
    this.titleBest.textContent = best === null ? '' : `Level 1 best ${formatTime(best)}`;
    this.titleLevels.innerHTML = levels
      .map((name, i) => `<span class="${i < unlocked ? '' : 'locked'}"><kbd>${i + 1}</kbd> ${name}</span>`)
      .join('');
    this.titlePrompt.textContent = unlocked > 1 ? `Press Enter to launch, or 1 to ${unlocked} to pick a level` : 'Press Enter to launch';
    for (const el of [this.gameOver, this.levelClear]) el.classList.add('hidden');
    this.toast.classList.remove('on');
    this.title.classList.remove('hidden');
    for (const el of [this.stats, this.timer, this.help]) el.classList.add('hidden');
  }

  showPlaying(level: number, name: string): void {
    this.levelName.textContent = `Level ${level} · ${name}`;
    for (const el of [this.title, this.gameOver, this.levelClear]) el.classList.add('hidden');
    for (const el of [this.stats, this.timer, this.help]) el.classList.remove('hidden');
    this.toast.classList.remove('on');
  }

  showGameOver(collected: number, total: number, name: string, lost: number): void {
    this.finalScore.textContent = `${collected} of ${total} crystals collected${lost > 0 ? ` · ${lost} unbanked crystals lost` : ''}`;
    this.overPrompt.textContent = `Press Enter to retry ${name} · Esc for the title screen`;
    this.gameOver.classList.remove('hidden');
    this.help.classList.add('hidden');
  }

  showLevelClear(
    level: number,
    seconds: number,
    best: number,
    hull: number,
    killed: number,
    enemies: number,
    next: { number: number; name: string } | null,
    banked: number,
  ): void {
    const record = seconds <= best;
    this.clearTitle.textContent = next ? `Level ${level} clear` : 'All levels clear!';
    this.clearTime.textContent = `${formatTime(seconds)}${record ? ' · new best!' : ` · best ${formatTime(best)}`}`;
    this.clearDetail.innerHTML =
      `Hull left ${Math.round(hull * 100)}% · ${killed} of ${enemies} enemies destroyed<br />` +
      `<span class="gem">◆</span> ${banked} crystals banked · press <kbd>U</kbd> to spend them`;
    this.clearPrompt.textContent = next ? `Press Enter for level ${next.number}: ${next.name}` : 'Press Enter to fly again from level 1';
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
