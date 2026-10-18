// The hand-built levels. North is -z (up the screen). Every level starts at
// the south edge and ends at a gate in the north; the gate only opens once
// every crystal has been picked up. Each has a repair station partway along. Later levels have more enemies:
// turrets that sit still and shoot, and chasers that wake up and ram you.
// Levels 5 to 8 each add a hazard: ice that the ship slides on, lava that
// burns the hull, drifting asteroids, and gravity wells that pull the ship in.

import type { ThemeName } from './theme';

export interface RockSpot {
  x: number;
  z: number;
  size: number;
}

export interface Spot {
  x: number;
  z: number;
}

/** A round patch of ground: ice or lava. */
export interface Patch {
  x: number;
  z: number;
  radius: number;
}

/** A boulder sliding east (vx > 0) or west along its row, wrapping round the field. */
export interface Drifter {
  x: number;
  z: number;
  size: number;
  vx: number;
}

/** A boulder circling a point; `speed` is in radians a second, negative for clockwise. */
export interface Orbiter {
  x: number;
  z: number;
  radius: number;
  speed: number;
  phase: number;
  size: number;
}

/** Pulls the ship towards its centre, harder the closer it gets; the core burns. */
export interface Well {
  x: number;
  z: number;
  radius: number;
  pull: number;
}

export interface LevelData {
  name: string;
  theme: ThemeName;
  start: Spot;
  gate: Spot;
  /** The repair station pad, somewhere safe partway through. */
  station: Spot;
  rocks: RockSpot[];
  crystals: Spot[];
  turrets: Spot[];
  chasers: Spot[];
  ice?: Patch[];
  lava?: Patch[];
  drifters?: Drifter[];
  orbiters?: Orbiter[];
  wells?: Well[];
}

// A row of touching boulders from (x1, z1) to (x2, z2), skipping any that
// fall inside one of the gaps. Gaps are [from, to] ranges along the wall's
// main axis: x for walls running east-west, z for walls running north-south.
function wall(out: RockSpot[], x1: number, z1: number, x2: number, z2: number, size: number, gaps: [number, number][] = []): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.ceil(len / (size * 1.5));
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    const a = alongX ? x : z;
    if (gaps.some(([from, to]) => a > from && a < to)) continue;
    // Alternate sizes a little so the wall doesn't look machined.
    out.push({ x, z, size: size * (i % 3 === 1 ? 0.8 : i % 3 === 2 ? 1.1 : 1) });
  }
}

// A ring of boulders around (cx, cz), leaving openings at the given angles
// (radians, 0 = east, measured towards -z / north).
function ring(out: RockSpot[], cx: number, cz: number, radius: number, size: number, openings: number[]): void {
  const n = Math.round((Math.PI * 2 * radius) / (size * 1.5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (openings.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < 0.32)) continue;
    out.push({ x: cx + Math.cos(a) * radius, z: cz - Math.sin(a) * radius, size: size * (i % 2 ? 0.85 : 1.05) });
  }
}

const EAST = 0;
const NORTH = Math.PI / 2;
const WEST = Math.PI;
const SOUTH = -Math.PI / 2;

// Level 1: the original course, with one turret and one chaser to learn on.
//   1. Approach  - open ground with a few rocks to learn the controls
//   2. Switchback - two rock walls with gaps on opposite sides
//   3. The Ring  - a circle of boulders with crystals inside, two ways in
//   4. Final run - loose rocks and a turret in front of the gate
function driftField(): LevelData {
  const rocks: RockSpot[] = [];
  rocks.push(
    { x: -14, z: 40, size: 2.4 },
    { x: 12, z: 42, size: 1.6 },
    { x: 3, z: 33, size: 1.2 },
    { x: -6, z: 29, size: 1.8 },
    { x: 18, z: 30, size: 2.6 },
    { x: -30, z: 34, size: 2.0 },
    { x: 34, z: 38, size: 1.4 },
  );
  wall(rocks, -58, 20, 58, 20, 2.2, [[-32, -22]]);
  wall(rocks, -58, 0, 58, 0, 2.2, [[22, 32]]);
  rocks.push({ x: 0, z: 10, size: 1.4 }, { x: -40, z: 10, size: 1.8 }, { x: 40, z: 10, size: 1.2 });
  ring(rocks, 0, -20, 13, 2.0, [EAST, WEST]);
  rocks.push({ x: 0, z: -20, size: 2.6 }); // a big boulder in the middle to steer around
  rocks.push(
    { x: -30, z: -30, size: 2.2 },
    { x: -22, z: -40, size: 1.4 },
    { x: -10, z: -36, size: 1.8 },
    { x: 10, z: -38, size: 1.6 },
    { x: 24, z: -32, size: 2.4 },
    { x: 30, z: -44, size: 1.4 },
    { x: -36, z: -46, size: 1.8 },
    { x: 6, z: -46, size: 1.0 },
    { x: -7, z: -48, size: 1.0 },
  );
  return {
    name: 'Drift Field',
    theme: 'dusk',
    start: { x: 0, z: 50 },
    gate: { x: 0, z: -52 },
    station: { x: -22, z: 10 },
    rocks,
    crystals: [
      { x: -6, z: 40 },
      { x: 9, z: 34 },
      { x: -18, z: 26 },
      { x: -27, z: 20 },
      { x: -10, z: 9 },
      { x: 14, z: 6 },
      { x: 27, z: 0 },
      { x: 20, z: -20 },
      { x: 6, z: -14 },
      { x: -6, z: -26 },
      { x: -20, z: -20 },
      { x: -18, z: -36 },
      { x: 17, z: -42 },
    ],
    turrets: [{ x: 0, z: -40 }],
    chasers: [{ x: 10, z: 12 }],
  };
}

// Level 2: a long canyon up the middle with bays on both sides. Turrets sit
// in the bays and fire through the gaps, so the walls are cover.
function crossfire(): LevelData {
  const rocks: RockSpot[] = [];
  wall(rocks, -16, 42, -16, -42, 2.2, [[18, 26], [-24, -16]]);
  wall(rocks, 16, 42, 16, -42, 2.2, [[26, 34], [-6, 2]]);
  rocks.push(
    // Canyon
    { x: 0, z: 30, size: 1.6 },
    { x: -7, z: 12, size: 1.4 },
    { x: 6, z: -6, size: 1.8 },
    { x: -2, z: -30, size: 1.4 },
    // Bays
    { x: -44, z: 38, size: 2.4 },
    { x: -40, z: 0, size: 2.8 },
    { x: -28, z: -32, size: 2.0 },
    { x: -50, z: -18, size: 1.6 },
    { x: 30, z: 14, size: 2.6 },
    { x: 42, z: -24, size: 2.2 },
    { x: 28, z: 46, size: 1.8 },
    { x: 50, z: 4, size: 1.4 },
    // Around the gate
    { x: -10, z: -46, size: 1.4 },
    { x: 11, z: -47, size: 1.2 },
  );
  return {
    name: 'Crossfire',
    theme: 'dusk',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -52 },
    station: { x: -4, z: 4 },
    rocks,
    crystals: [
      { x: 0, z: 42 },
      { x: 8, z: 20 },
      { x: -8, z: -2 },
      { x: 7, z: -20 },
      { x: -30, z: 30 },
      { x: -46, z: 10 },
      { x: -26, z: -10 },
      { x: -44, z: -34 },
      { x: 30, z: 38 },
      { x: 44, z: 16 },
      { x: 28, z: -14 },
      { x: 44, z: -38 },
    ],
    turrets: [
      { x: -34, z: 22 },
      { x: -34, z: -20 },
      { x: 34, z: 30 },
      { x: 34, z: -2 },
    ],
    chasers: [
      { x: -42, z: -8 },
      { x: 42, z: 6 },
      { x: 0, z: -14 },
    ],
  };
}

// Level 3: four walls, each with one gap on alternating sides, so you weave
// left and right across the whole field. Turrets cover most of the gaps.
function switchyard(): LevelData {
  const rocks: RockSpot[] = [];
  wall(rocks, -58, 34, 58, 34, 2.2, [[30, 40]]);
  wall(rocks, -58, 12, 58, 12, 2.2, [[-40, -30]]);
  wall(rocks, -58, -10, 58, -10, 2.2, [[30, 40]]);
  wall(rocks, -58, -32, 58, -32, 2.2, [[-6, 6]]);
  rocks.push(
    { x: -34, z: 46, size: 2.2 },
    { x: 8, z: 44, size: 1.6 },
    { x: 44, z: 46, size: 1.4 },
    { x: 12, z: 22, size: 2.0 },
    { x: -24, z: 24, size: 1.4 },
    { x: 48, z: 22, size: 1.2 },
    { x: 0, z: 2, size: 2.2 },
    { x: -48, z: 0, size: 1.6 },
    { x: 26, z: 2, size: 1.4 },
    { x: 20, z: -20, size: 2.4 },
    { x: -14, z: -22, size: 1.6 },
    { x: -46, z: -16, size: 1.4 },
    { x: -22, z: -44, size: 1.8 },
    { x: 24, z: -42, size: 1.6 },
    { x: -9, z: -47, size: 1.0 },
    { x: 9, z: -47, size: 1.0 },
  );
  return {
    name: 'Switchyard',
    theme: 'dusk',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: 12, z: 1 },
    rocks,
    crystals: [
      { x: -20, z: 44 },
      { x: 24, z: 46 },
      { x: 35, z: 34 },
      { x: 40, z: 24 },
      { x: -8, z: 24 },
      { x: -46, z: 20 },
      { x: -35, z: 12 },
      { x: -8, z: -2 },
      { x: 46, z: -2 },
      { x: 35, z: -10 },
      { x: 6, z: -22 },
      { x: -40, z: -24 },
      { x: 0, z: -32 },
      { x: -34, z: -46 },
      { x: 34, z: -48 },
    ],
    turrets: [
      { x: 24, z: 26 },
      { x: -22, z: 2 },
      { x: 44, z: -20 },
      { x: -30, z: -22 },
      { x: 14, z: -44 },
    ],
    chasers: [
      { x: -40, z: 24 },
      { x: 40, z: 2 },
      { x: -2, z: -20 },
      { x: 30, z: -24 },
    ],
  };
}

// Level 4: three rings of boulders, each with a turret in the middle guarding
// the crystals inside, and chasers roaming the open ground between them.
function hive(): LevelData {
  const rocks: RockSpot[] = [];
  ring(rocks, -28, 26, 11, 2.0, [EAST, SOUTH]);
  ring(rocks, 28, 2, 11, 2.0, [WEST, NORTH]);
  ring(rocks, -20, -30, 11, 2.0, [EAST, NORTH]);
  rocks.push(
    { x: 8, z: 44, size: 1.6 },
    { x: -12, z: 46, size: 2.0 },
    { x: 40, z: 36, size: 2.4 },
    { x: 14, z: 22, size: 1.8 },
    { x: -48, z: 4, size: 2.2 },
    { x: -6, z: 4, size: 1.6 },
    { x: 50, z: -18, size: 1.8 },
    { x: 10, z: -22, size: 2.2 },
    { x: 34, z: -40, size: 2.0 },
    { x: -46, z: -50, size: 1.6 },
    { x: -9, z: -48, size: 1.0 },
    { x: 10, z: -48, size: 1.0 },
  );
  return {
    name: 'The Hive',
    theme: 'dusk',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: -8, z: -10 },
    rocks,
    crystals: [
      // Inside the rings
      { x: -33, z: 30 },
      { x: -23, z: 31 },
      { x: -28, z: 20 },
      { x: 33, z: 6 },
      { x: 23, z: -3 },
      { x: 33, z: -3 },
      { x: -25, z: -25 },
      { x: -25, z: -35 },
      { x: -15, z: -35 },
      // Open ground
      { x: 20, z: 40 },
      { x: 48, z: 22 },
      { x: -50, z: -12 },
      { x: 0, z: -8 },
      { x: 44, z: -34 },
      { x: -40, z: -46 },
    ],
    turrets: [
      { x: -28, z: 26 },
      { x: 28, z: 2 },
      { x: -20, z: -30 },
      { x: 48, z: 46 },
      { x: 4, z: 30 },
      { x: 14, z: -40 },
    ],
    chasers: [
      { x: -48, z: 42 },
      { x: 48, z: 30 },
      { x: 0, z: 14 },
      { x: -40, z: -4 },
      { x: 46, z: -14 },
      { x: 22, z: -26 },
      { x: -48, z: -36 },
    ],
  };
}


// A river of lava running east-west, wobbling north and south, with dry
// crossings where the gaps are (ranges along x).
function river(out: Patch[], z: number, wobble: number, gaps: [number, number][]): void {
  const r = 4.2;
  for (let x = -60; x <= 60; x += 5) {
    if (gaps.some(([from, to]) => x + r > from && x - r < to)) continue;
    out.push({ x, z: z + Math.sin(x * 0.08) * wobble, radius: r });
  }
}

// A row of asteroids evenly spaced across the field, all sliding the same way.
function lane(out: Drifter[], z: number, count: number, vx: number, sizes: number[]): void {
  for (let i = 0; i < count; i++) {
    out.push({ x: -60 + (i + 0.5) * (120 / count), z, size: sizes[i % sizes.length], vx });
  }
}

// Level 5: frozen ground with wide ice patches where the ship can't grip, so
// it slides on towards the walls. The gaps sit just past the ice.
function frostbite(): LevelData {
  const rocks: RockSpot[] = [];
  wall(rocks, -58, 20, 58, 20, 2.2, [[-8, 4]]);
  wall(rocks, -58, -12, 58, -12, 2.2, [[-48, -38], [36, 46]]);
  wall(rocks, -58, -40, 58, -40, 2.2, [[-6, 6]]);
  rocks.push(
    { x: -20, z: 40, size: 2.2 },
    { x: 20, z: 46, size: 1.6 },
    { x: -40, z: 32, size: 1.8 },
    { x: 48, z: 26, size: 1.4 },
    { x: -12, z: 6, size: 1.6 },
    { x: 40, z: 10, size: 2.0 },
    { x: -50, z: -24, size: 1.6 },
    { x: 18, z: -26, size: 2.2 },
    { x: 44, z: -28, size: 1.4 },
    { x: -24, z: -48, size: 1.8 },
    { x: 24, z: -48, size: 1.6 },
    { x: -9, z: -48, size: 1.0 },
    { x: 9, z: -48, size: 1.0 },
  );
  return {
    name: 'Frostbite',
    theme: 'ice',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: 12, z: 2 },
    rocks,
    ice: [
      { x: 0, z: 32, radius: 11 },
      { x: -30, z: 6, radius: 12 },
      { x: 30, z: -2, radius: 12 },
      { x: -4, z: -26, radius: 12 },
      { x: 38, z: 36, radius: 8 },
    ],
    crystals: [
      { x: 0, z: 32 },
      { x: -8, z: 40 },
      { x: 8, z: 26 },
      { x: 38, z: 36 },
      { x: -36, z: 26 },
      { x: -30, z: 6 },
      { x: -20, z: -2 },
      { x: 12, z: 12 },
      { x: 30, z: -2 },
      { x: 50, z: -4 },
      { x: -43, z: -12 },
      { x: 41, z: -12 },
      { x: -4, z: -26 },
      { x: 10, z: -32 },
      { x: -22, z: -30 },
      { x: 0, z: -40 },
    ],
    turrets: [
      { x: 24, z: 30 },
      { x: -24, z: 12 },
      { x: -32, z: -24 },
      { x: 30, z: -20 },
      { x: 46, z: -48 },
      { x: -46, z: -48 },
    ],
    chasers: [
      { x: -44, z: 42 },
      { x: 46, z: 14 },
      { x: -6, z: -4 },
      { x: -40, z: -32 },
      { x: 34, z: -32 },
      { x: 2, z: -20 },
    ],
  };
}

// Level 6: a river of lava splits the field, with two dry crossings that
// turrets watch. Pools dot the ground, and lava burns the hull while you're on it.
function emberRift(): LevelData {
  const rocks: RockSpot[] = [];
  const lava: Patch[] = [];
  river(lava, 4, 4, [[-32, -20], [18, 30]]);
  lava.push(
    { x: -36, z: 34, radius: 5 },
    { x: 30, z: 32, radius: 4.5 },
    { x: -14, z: 26, radius: 3.5 },
    { x: 42, z: -14, radius: 5 },
    { x: -40, z: -14, radius: 4.5 },
    { x: 8, z: -18, radius: 4 },
    { x: -18, z: -44, radius: 4 },
    { x: 20, z: -44, radius: 3.5 },
  );
  wall(rocks, -58, -30, 58, -30, 2.2, [[-46, -36], [0, 10]]);
  rocks.push(
    { x: -22, z: 46, size: 2.0 },
    { x: 14, z: 44, size: 1.8 },
    { x: -48, z: 22, size: 2.2 },
    { x: 46, z: 22, size: 2.0 },
    { x: 12, z: -6, size: 1.6 },
    { x: -24, z: -10, size: 2.0 },
    { x: -50, z: -42, size: 1.6 },
    { x: 40, z: -42, size: 1.8 },
    { x: -9, z: -48, size: 1.0 },
    { x: 9, z: -48, size: 1.0 },
  );
  return {
    name: 'Ember Rift',
    theme: 'ember',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: 6, z: 22 },
    rocks,
    lava,
    crystals: [
      { x: -10, z: 44 },
      { x: 20, z: 40 },
      { x: -46, z: 32 },
      { x: 36, z: 25 },
      { x: -30, z: 22 },
      { x: 6, z: 32 },
      { x: -26, z: 2 },
      { x: 24, z: 7 },
      { x: 0, z: 4 }, // in the river: worth a quick dash
      { x: -16, z: -18 },
      { x: 34, z: -4 },
      { x: -48, z: -22 },
      { x: -41, z: -30 },
      { x: 5, z: -30 },
      { x: -30, z: -42 },
      { x: 30, z: -38 },
      { x: 0, z: -46 },
    ],
    turrets: [
      { x: -26, z: 16 },
      { x: 24, z: -6 },
      { x: -42, z: 42 },
      { x: 42, z: 40 },
      { x: -30, z: -20 },
      { x: 22, z: -20 },
      { x: 0, z: -40 },
    ],
    chasers: [
      { x: -44, z: 16 },
      { x: 40, z: 14 },
      { x: -4, z: -8 },
      { x: -48, z: -36 },
      { x: 46, z: -36 },
      { x: 30, z: -48 },
      { x: -36, z: -48 },
    ],
  };
}

// Level 7: four lanes of asteroids sliding across the field in alternating
// directions. Time the gaps; turrets sit between the lanes.
function driftBelt(): LevelData {
  const rocks: RockSpot[] = [];
  const drifters: Drifter[] = [];
  lane(drifters, 36, 4, 6, [2.2, 1.8, 2.6, 2.0]);
  lane(drifters, 16, 4, -8, [2.0, 2.6, 1.8, 2.2]);
  lane(drifters, -6, 5, 7, [1.8, 2.4, 2.0, 2.6, 1.6]);
  lane(drifters, -28, 5, -9, [2.4, 1.8, 2.2, 2.0, 2.6]);
  rocks.push(
    { x: -18, z: 46, size: 1.8 },
    { x: 20, z: 47, size: 2.2 },
    { x: 8, z: 26, size: 1.6 },
    { x: -48, z: 26, size: 2.0 },
    { x: -24, z: 4, size: 1.6 },
    { x: 34, z: 6, size: 2.2 },
    { x: -8, z: -17, size: 2.0 },
    { x: 22, z: -18, size: 1.8 },
    { x: -44, z: -40, size: 1.6 },
    { x: 8, z: -40, size: 2.0 },
    { x: -9, z: -48, size: 1.0 },
    { x: 9, z: -48, size: 1.0 },
  );
  return {
    name: 'Drift Belt',
    theme: 'belt',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: -28, z: 26 },
    rocks,
    drifters,
    crystals: [
      { x: 0, z: 44 },
      { x: -32, z: 44 },
      { x: 32, z: 44 },
      { x: -40, z: 18 },
      { x: 18, z: 26 },
      { x: 0, z: 36 },
      { x: -20, z: 16 },
      { x: 24, z: 16 },
      { x: -32, z: 4 },
      { x: 8, z: 4 },
      { x: 44, z: -6 },
      { x: -14, z: -6 },
      { x: -36, z: -17 },
      { x: 10, z: -17 },
      { x: 30, z: -28 },
      { x: -20, z: -40 },
      { x: 22, z: -44 },
    ],
    turrets: [
      { x: 30, z: 26 },
      { x: -44, z: 4 },
      { x: 20, z: 4 },
      { x: -22, z: -17 },
      { x: 40, z: -17 },
      { x: -30, z: -42 },
      { x: 34, z: -42 },
    ],
    chasers: [
      { x: -46, z: 46 },
      { x: 46, z: 26 },
      { x: -6, z: 26 },
      { x: 2, z: -17 },
      { x: -48, z: -17 },
      { x: 48, z: 4 },
      { x: 0, z: -46 },
    ],
  };
}

// Level 8: two collapsing stars drag the ship towards their burning cores,
// with boulders circling them, pools of plasma and the most enemies yet.
function eventHorizon(): LevelData {
  const rocks: RockSpot[] = [];
  wall(rocks, -58, -38, 58, -38, 2.2, [[-6, 6], [30, 40]]);
  rocks.push(
    { x: -12, z: 46, size: 1.8 },
    { x: 14, z: 44, size: 1.6 },
    { x: 48, z: 16, size: 2.2 },
    { x: -50, z: -2, size: 1.8 },
    { x: 10, z: 6, size: 1.6 },
    { x: -10, z: -24, size: 2.0 },
    { x: 46, z: -46, size: 1.6 },
    { x: -9, z: -48, size: 1.0 },
    { x: 9, z: -48, size: 1.0 },
  );
  const orbiters: Orbiter[] = [];
  for (let i = 0; i < 3; i++) {
    orbiters.push({ x: -22, z: 22, radius: 9, speed: 0.6, phase: (i * Math.PI * 2) / 3, size: 1.8 });
    orbiters.push({ x: 24, z: -18, radius: 10, speed: -0.5, phase: (i * Math.PI * 2) / 3 + 1, size: 2.0 });
  }
  return {
    name: 'Event Horizon',
    theme: 'void',
    start: { x: 0, z: 52 },
    gate: { x: 0, z: -53 },
    station: { x: 22, z: 18 },
    rocks,
    orbiters,
    wells: [
      { x: -22, z: 22, radius: 18, pull: 14 },
      { x: 24, z: -18, radius: 18, pull: 14 },
    ],
    lava: [
      { x: 30, z: 36, radius: 5 },
      { x: -44, z: -10, radius: 5 },
      { x: 0, z: -2, radius: 4 },
      { x: -16, z: -30, radius: 4.5 },
      { x: 44, z: 4, radius: 4 },
    ],
    crystals: [
      { x: -27, z: 22 },
      { x: -17, z: 20 },
      { x: -22, z: 9 },
      { x: 24, z: -12 },
      { x: 30, z: -20 },
      { x: 18, z: -22 },
      { x: 0, z: 42 },
      { x: 22, z: 40 },
      { x: -36, z: 42 },
      { x: 40, z: 28 },
      { x: -46, z: 20 },
      { x: 6, z: 22 },
      { x: 44, z: -14 },
      { x: -30, z: -6 },
      { x: 0, z: -14 },
      { x: -30, z: -20 },
      { x: 35, z: -38 },
      { x: -46, z: -44 },
      { x: 0, z: -44 },
    ],
    turrets: [
      { x: 0, z: 30 },
      { x: 42, z: 42 },
      { x: -46, z: 40 },
      { x: -4, z: 12 },
      { x: 46, z: -28 },
      { x: -40, z: -28 },
      { x: 4, z: -30 },
      { x: 26, z: -48 },
    ],
    chasers: [
      { x: -40, z: 50 },
      { x: 40, z: 22 },
      { x: -46, z: 8 },
      { x: 12, z: -6 },
      { x: 44, z: -4 },
      { x: -24, z: -16 },
      { x: 8, z: -46 },
      { x: -46, z: -50 },
      { x: 30, z: 4 },
    ],
  };
}

export const LEVELS: LevelData[] = [driftField(), crossfire(), switchyard(), hive(), frostbite(), emberRift(), driftBelt(), eventHorizon()];
