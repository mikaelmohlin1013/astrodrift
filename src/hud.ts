import type { Bonus } from './score';

/** A power-up that's switched on, for the HUD. */
export interface ActivePower {
  name: string;
  color: string;
  left01: number;
}

/** The score side of a cleared level. */
export interface ClearScore {
  points: number;
  bonuses: Bonus[];
  total: number;
  rank: string;
  best: number;
  bestChain: number;
}

// The on-screen overlay: title screen, hull bar, crystal and enemy counts,
// timer, score and combo, messages, hit flash and the end-of-run panels.
export class Hud {
  private scoreboard = byId('scoreboard');
  private points = byId('points');
  private combo = byId('combo');
  private comboMult = byId('combo-mult');
  private comboFill = byId('combo-fill');
  private powers = byId('powers');
  private rank = byId('rank');
  private clearScore = byId('clear-score');
  private shownPoints = 0;
  private shownMult = 0;
  private powersKey = '';
  private stats = byId('stats');
  private timer = byId('timer');
  private help = byId('help');
  private hullFill = byId('hull-fill');
  private hullValue = byId('hull-value');
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
    this.hullFill.dataset.level = hull > 0.5 ? 'ok' : hull > 0.25 ? 'warn' : 'low';
    this.hullValue.textContent = `${Math.ceil(hull * 100)}%`;
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

  /**
   * Score, combo and active power-ups. The score rolls up towards its new
   * value rather than jumping, and the multiplier bumps when it rises.
   */
  updateScore(dt: number, points: number, multiplier: number, chain: number, timer01: number, powers: ActivePower[]): void {
    this.shownPoints = points < this.shownPoints ? points : Math.min(points, this.shownPoints + Math.max(1, (points - this.shownPoints) * 10 * dt));
    this.points.textContent = Math.round(this.shownPoints).toLocaleString('en-US');
    this.combo.classList.toggle('off', chain < 2);
    if (multiplier !== this.shownMult) {
      if (multiplier > this.shownMult) {
        this.comboMult.classList.remove('bump');
        void this.comboMult.offsetWidth;
        this.comboMult.classList.add('bump');
      }
      this.shownMult = multiplier;
      this.comboMult.innerHTML = `x${multiplier}<small>combo</small>`;
    }
    this.combo.toggleAttribute('data-hot', multiplier >= 5);
    this.comboFill.style.width = `${Math.round(timer01 * 100)}%`;
    // Rebuild the power-up list only when which ones are on changes.
    const key = powers.map((p) => p.name).join();
    if (key !== this.powersKey) {
      this.powersKey = key;
      this.powers.innerHTML = powers
        .map((p) => `<div class="power" style="--c: ${p.color}">${p.name}<div class="bar"><div class="fill"></div></div></div>`)
        .join('');
    }
    powers.forEach((p, i) => {
      const fill = this.powers.children[i]?.querySelector<HTMLElement>('.fill');
      if (fill) fill.style.width = `${Math.round(p.left01 * 100)}%`;
    });
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

  /** `levels` are each level's name and accent colour. */
  showTitle(best: number | null, levels: { name: string; accent: string; score: number }[], unlocked: number, bank: number): void {
    this.titleBank.innerHTML = bank > 0 ? `◆ ${bank} crystals banked · press <kbd>U</kbd> to spend them` : '';
    this.titleBest.textContent = best === null ? '' : `Level 1 best ${formatTime(best)}`;
    this.titleLevels.innerHTML = levels
      .map(
        ({ name, accent, score }, i) =>
          `<span class="${i < unlocked ? '' : 'locked'}" style="--accent: ${accent}"><kbd>${i + 1}</kbd> ${name}${score ? `<small>${score.toLocaleString('en-US')}</small>` : ''}</span>`,
      )
      .join('');
    this.titlePrompt.textContent = unlocked > 1 ? `Press Enter to launch, or 1 to ${unlocked} to pick a level` : 'Press Enter to launch';
    for (const el of [this.gameOver, this.levelClear]) el.classList.add('hidden');
    this.toast.classList.remove('on');
    this.title.classList.remove('hidden');
    for (const el of [this.stats, this.timer, this.help, this.scoreboard]) el.classList.add('hidden');
  }

  showPlaying(level: number, name: string): void {
    this.levelName.textContent = `Level ${level} · ${name}`;
    for (const el of [this.title, this.gameOver, this.levelClear]) el.classList.add('hidden');
    for (const el of [this.stats, this.timer, this.help, this.scoreboard]) el.classList.remove('hidden');
    this.toast.classList.remove('on');
    this.shownPoints = 0;
  }

  showGameOver(collected: number, total: number, name: string, lost: number, points: number): void {
    this.finalScore.innerHTML =
      `Score ${points.toLocaleString('en-US')}<br />` +
      `<small>${collected} of ${total} crystals collected${lost > 0 ? ` · ${lost} unbanked crystals lost` : ''}</small>`;
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
    score: ClearScore,
  ): void {
    // Score lines appear one after another, then the rank stamps down.
    const rows: [string, string][] = [
      ['Score', score.points.toLocaleString('en-US')],
      ...score.bonuses.map((b): [string, string] => [`${b.label} bonus`, `+${b.points.toLocaleString('en-US')}`]),
    ];
    const lines = rows.map(([label, value], i) => {
      const delay = `style="animation-delay: ${0.2 + i * 0.22}s"`;
      return `<span ${delay}>${label}</span><span ${delay}>${value}</span>`;
    });
    const record = score.total >= score.best;
    const delay = `style="animation-delay: ${0.2 + rows.length * 0.22}s"`;
    lines.push(`<span class="total" ${delay}>Total${record ? ' · new best!' : ''}</span><span class="total" ${delay}>${score.total.toLocaleString('en-US')}</span>`);
    this.clearScore.innerHTML = lines.join('');
    this.rank.textContent = score.rank;
    this.rank.dataset.rank = score.rank;
    this.rank.style.animationDelay = `${0.5 + rows.length * 0.22}s`;
    // Restart the animations in case the panel was shown before.
    for (const el of [this.rank, this.clearScore]) {
      el.style.display = 'none';
      void el.offsetWidth;
      el.style.display = '';
    }
    const timeRecord = seconds <= best;
    this.clearTitle.textContent = next ? `Level ${level} clear` : 'All levels clear!';
    this.clearTime.textContent = `${formatTime(seconds)}${timeRecord ? ' · best time!' : ` · best ${formatTime(best)}`}`;
    this.clearDetail.innerHTML =
      `Hull left ${Math.round(hull * 100)}% · ${killed} of ${enemies} enemies destroyed · longest chain ${score.bestChain}<br />` +
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
