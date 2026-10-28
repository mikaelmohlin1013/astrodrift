// Points and the combo chain. Every crystal, kill and near miss scores, and
// doing them in quick succession builds a multiplier; letting the chain
// lapse banks it, and taking a hit to the hull breaks it.

export const POINTS = {
  crystal: 100,
  turret: 250,
  chaser: 150,
  graze: 25,
};

const WINDOW = 3.5; // seconds to the next scoring event before the chain lapses
const MAX_MULTIPLIER = 8;

export class Score {
  points = 0;
  /** Scoring events in the current chain. */
  chain = 0;
  /** Seconds left before the chain lapses. */
  timer = 0;
  /** The longest chain this run. */
  bestChain = 0;
  /** True until the hull first takes damage this run. */
  untouched = true;

  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, Math.max(1, this.chain));
  }

  /** 1 when the chain has just been fed, falling to 0 as it lapses. */
  get timer01(): number {
    return this.timer / WINDOW;
  }

  reset(): void {
    Object.assign(this, { points: 0, chain: 0, timer: 0, bestChain: 0, untouched: true });
  }

  /** Scores `base` points at the current multiplier, then extends the chain; returns what it was worth. */
  add(base: number): { gained: number; multiplier: number; levelUp: boolean } {
    const before = this.multiplier;
    this.chain++;
    this.timer = WINDOW;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const multiplier = this.multiplier;
    const gained = base * multiplier;
    this.points += gained;
    return { gained, multiplier, levelUp: multiplier > before && multiplier > 1 };
  }

  /** Counts the chain down; returns how long a chain just lapsed (0 when none did). */
  update(dt: number): number {
    if (this.chain === 0) return 0;
    this.timer -= dt;
    if (this.timer > 0) return 0;
    const lapsed = this.chain;
    this.chain = 0;
    this.timer = 0;
    return lapsed;
  }

  /** A hit to the hull drops the chain; returns how long it was. */
  breakChain(): number {
    const lost = this.chain;
    this.chain = 0;
    this.timer = 0;
    this.untouched = false;
    return lost;
  }
}

export interface Bonus {
  label: string;
  points: number;
}

/**
 * End-of-level bonuses: speed against a par time based on how many crystals
 * there are, hull left, and extras for a flawless or clean-sweep run.
 */
export function levelBonuses(seconds: number, crystals: number, hull01: number, untouched: boolean, allEnemies: boolean): Bonus[] {
  const par = 30 + crystals * 6;
  const bonuses: Bonus[] = [
    { label: 'Speed', points: Math.max(0, Math.round((par - seconds) * 25)) },
    { label: 'Hull', points: Math.round(hull01 * 500) },
  ];
  if (untouched) bonuses.push({ label: 'Untouchable', points: 1000 });
  if (allEnemies) bonuses.push({ label: 'Clean sweep', points: 500 });
  return bonuses.filter((b) => b.points > 0);
}

/** A letter grade against a rough target for the level. */
export function rank(points: number, crystals: number, enemies: number): string {
  // A good run chains most of the level at around x4, plus bonuses.
  const target = (crystals * POINTS.crystal + enemies * 200) * 4 + 1500;
  const r = points / target;
  return r >= 1 ? 'S' : r >= 0.7 ? 'A' : r >= 0.45 ? 'B' : 'C';
}

function bestKey(level: number): string {
  return `astrodrift.bestScore.${level + 1}`;
}

export function loadBestScore(level: number): number {
  try {
    return Number(localStorage.getItem(bestKey(level))) || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(level: number, points: number): void {
  try {
    localStorage.setItem(bestKey(level), String(points));
  } catch {
    // Storage unavailable; the best score just won't persist.
  }
}
