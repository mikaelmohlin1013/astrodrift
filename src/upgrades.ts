// The upgrades sold at repair stations, the player's saved progress, and the
// stats the ship flies with for a given set of upgrades.

export type UpgradeId = 'damage' | 'fireRate' | 'spread' | 'shield' | 'regen' | 'missiles' | 'hull' | 'magnet';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Price of each level after the first; level 0 is what you start with. */
  prices: number[];
  /** The stat at each level, from level 0 up. */
  values: number[];
  show(value: number): string;
  /** Another upgrade that must be bought first. */
  requires?: UpgradeId;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'damage',
    name: 'Laser power',
    blurb: 'Each bolt hits harder',
    prices: [60, 120, 200],
    values: [1, 1.5, 2, 2.75],
    show: (v) => `${v}× damage`,
  },
  {
    id: 'fireRate',
    name: 'Rapid fire',
    blurb: 'The cannons cycle faster',
    prices: [50, 100, 180],
    values: [0.16, 0.13, 0.105, 0.085],
    show: (v) => `${(1 / v).toFixed(1)} shots/s`,
  },
  {
    id: 'spread',
    name: 'Spread shot',
    blurb: 'Extra bolts fan out from every shot',
    prices: [150, 300],
    values: [1, 3, 5],
    show: (v) => `${v} bolt${v > 1 ? 's' : ''}`,
  },
  {
    id: 'missiles',
    name: 'Homing missiles',
    blurb: 'Press E to launch a missile that seeks the nearest enemy',
    prices: [100, 80, 120, 180],
    values: [0, 4, 6, 8, 10],
    show: (v) => (v ? `${v} missiles` : 'none'),
  },
  {
    id: 'shield',
    name: 'Shield',
    blurb: 'A bubble that soaks up damage before the hull',
    prices: [80, 120, 180, 260],
    values: [0, 30, 50, 75, 100],
    show: (v) => (v ? `${v} shield` : 'none'),
  },
  {
    id: 'regen',
    name: 'Shield recharge',
    blurb: 'The shield refills sooner and faster after a hit',
    prices: [60, 120, 200],
    values: [6, 10, 15, 22],
    show: (v) => `${v} per second`,
    requires: 'shield',
  },
  {
    id: 'hull',
    name: 'Hull plating',
    blurb: 'More hull before the ship breaks up',
    prices: [60, 110, 180],
    values: [100, 125, 150, 180],
    show: (v) => `${v} hull`,
  },
  {
    id: 'magnet',
    name: 'Crystal magnet',
    blurb: 'Nearby crystals fly to the ship',
    prices: [40, 90],
    values: [0, 6, 10],
    show: (v) => (v ? `${v}m reach` : 'off'),
  },
];

export type Levels = Record<UpgradeId, number>;

export interface Save {
  /** Crystals banked at a station or by clearing a level, ready to spend. */
  bank: number;
  levels: Levels;
}

/** What the ship flies with for a set of upgrade levels. */
export interface Loadout {
  laserDamage: number;
  laserReload: number;
  bolts: number;
  shield: number;
  shieldRegen: number;
  shieldDelay: number; // seconds after a hit before the shield recharges
  missiles: number;
  maxHull: number;
  magnet: number;
}

export function upgrade(id: UpgradeId): Upgrade {
  return UPGRADES.find((u) => u.id === id)!;
}

export function loadout(levels: Levels): Loadout {
  const v = (id: UpgradeId) => upgrade(id).values[levels[id]];
  return {
    laserDamage: v('damage'),
    laserReload: v('fireRate'),
    bolts: v('spread'),
    shield: v('shield'),
    shieldRegen: v('regen'),
    shieldDelay: 3 - levels.regen * 0.6,
    missiles: v('missiles'),
    maxHull: v('hull'),
    magnet: v('magnet'),
  };
}

/** Why an upgrade can't be bought right now, or null when it can. */
export function blocker(save: Save, u: Upgrade): string | null {
  const level = save.levels[u.id];
  if (level >= u.prices.length) return 'Maxed out';
  if (u.requires && save.levels[u.requires] === 0) return `Needs ${upgrade(u.requires).name.toLowerCase()} first`;
  if (save.bank < u.prices[level]) return 'Not enough crystals';
  return null;
}

const KEY = 'astrodrift.save';

export function loadSave(): Save {
  const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Save>;
    for (const u of UPGRADES) {
      const n = Number(raw.levels?.[u.id]);
      if (Number.isInteger(n)) levels[u.id] = Math.max(0, Math.min(u.prices.length, n));
    }
    return { bank: Math.max(0, Math.floor(Number(raw.bank) || 0)), levels };
  } catch {
    return { bank: 0, levels };
  }
}

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable; progress just won't persist.
  }
}
