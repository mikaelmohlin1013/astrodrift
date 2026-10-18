// The hand-built level layout. North is -z (up the screen). The ship starts
// at the south edge and works its way up through four zones to the gate:
//
//   1. Approach  - open ground with a few rocks to learn the controls
//   2. Switchback - two rock walls with gaps on opposite sides
//   3. The Ring  - a circle of boulders with crystals inside, two ways in
//   4. Final run - loose rocks in front of the gate
//
// Crystals are placed along the route, and the gate only opens once every
// crystal has been picked up.

export interface RockSpot {
  x: number;
  z: number;
  size: number;
}

export interface LevelData {
  start: { x: number; z: number };
  gate: { x: number; z: number };
  rocks: RockSpot[];
  crystals: { x: number; z: number }[];
}

const rocks: RockSpot[] = [];

// A row of touching boulders from (x1, z1) to (x2, z2), skipping any that
// fall inside one of the gaps (given as [from, to] ranges along x).
function wall(x1: number, z1: number, x2: number, z2: number, size: number, gaps: [number, number][] = []): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.ceil(len / (size * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    if (gaps.some(([a, b]) => x > a && x < b)) continue;
    // Alternate sizes a little so the wall doesn't look machined.
    rocks.push({ x, z, size: size * (i % 3 === 1 ? 0.8 : i % 3 === 2 ? 1.1 : 1) });
  }
}

// A ring of boulders around (cx, cz), leaving openings at the given angles
// (radians, 0 = east, measured towards -z / north).
function ring(cx: number, cz: number, radius: number, size: number, openings: number[]): void {
  const n = Math.round((Math.PI * 2 * radius) / (size * 1.5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (openings.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < 0.32)) continue;
    rocks.push({ x: cx + Math.cos(a) * radius, z: cz - Math.sin(a) * radius, size: size * (i % 2 ? 0.85 : 1.05) });
  }
}

// Zone 1: approach.
rocks.push(
  { x: -14, z: 40, size: 2.4 },
  { x: 12, z: 42, size: 1.6 },
  { x: 3, z: 33, size: 1.2 },
  { x: -6, z: 29, size: 1.8 },
  { x: 18, z: 30, size: 2.6 },
  { x: -30, z: 34, size: 2.0 },
  { x: 34, z: 38, size: 1.4 },
);

// Zone 2: switchback. First wall has its gap on the left, the second on the right.
wall(-58, 20, 58, 20, 2.2, [[-32, -22]]);
wall(-58, 0, 58, 0, 2.2, [[22, 32]]);
rocks.push({ x: 0, z: 10, size: 1.4 }, { x: -40, z: 10, size: 1.8 }, { x: 40, z: 10, size: 1.2 });

// Zone 3: the ring, entered from the east, left through the west.
ring(0, -20, 13, 2.0, [0, Math.PI]);
rocks.push({ x: 0, z: -20, size: 2.6 }); // a big boulder in the middle to steer around

// Zone 4: final run to the gate.
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

export const LEVEL: LevelData = {
  start: { x: 0, z: 50 },
  gate: { x: 0, z: -52 },
  rocks,
  crystals: [
    // Approach
    { x: -6, z: 40 },
    { x: 9, z: 34 },
    { x: -18, z: 26 },
    // Switchback
    { x: -27, z: 20 },
    { x: -10, z: 9 },
    { x: 14, z: 6 },
    { x: 27, z: 0 },
    // The ring
    { x: 20, z: -20 },
    { x: 6, z: -14 },
    { x: -6, z: -26 },
    { x: -20, z: -20 },
    // Final run
    { x: -18, z: -36 },
    { x: 17, z: -42 },
  ],
};
