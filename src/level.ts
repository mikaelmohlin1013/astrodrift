// The hand-built levels. North is -z (up the screen). Every level starts at
// the south edge and ends at a gate in the north; the gate only opens once
// every crystal has been picked up. Each has a repair station partway along. Later levels have more enemies:
// turrets that sit still and shoot, and chasers that wake up and ram you.

export interface RockSpot {
  x: number;
  z: number;
  size: number;
}

export interface Spot {
  x: number;
  z: number;
}

export interface LevelData {
  name: string;
  start: Spot;
  gate: Spot;
  /** The repair station pad, somewhere safe partway through. */
  station: Spot;
  rocks: RockSpot[];
  crystals: Spot[];
  turrets: Spot[];
  chasers: Spot[];
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

export const LEVELS: LevelData[] = [driftField(), crossfire(), switchyard(), hive()];
