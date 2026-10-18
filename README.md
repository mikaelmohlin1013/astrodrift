# AstroDrift

Top-down third-person browser game built with TypeScript, Three.js and Vite.

Play it at https://mikaelmohlin1013.github.io/astrodrift/ (redeployed on every push to `main`).

## Run

```
npm install
npm run dev
```

Then open http://localhost:5173 and press Enter on the title screen. The controls are relative to the ship: W or Up thrusts forward, A/D or Left/Right turn, S or Down brakes and then reverses, Shift boosts while thrusting, and Space fires the lasers. Press M to turn sound on or off.

There are four hand-built levels, each running from a landing pad in the south to a gate in the north. Pick up every crystal to open the gate, then fly through it to reach the next level. Each crystal patches the hull a little. Hitting rocks fast damages the hull, and so do enemies, and when it runs out you retry the level. The arrow on the ground points to the nearest crystal, and to the gate once it is open.

1. **Drift Field**: open ground, a switchback between two rock walls, a ring of boulders and a final run. One turret and one chaser to learn on.
2. **Crossfire**: a canyon up the middle with bays on each side. Turrets in the bays fire through the gaps in the canyon walls.
3. **Switchyard**: four walls with a gap on alternating sides, so you weave across the whole field past turrets and chasers.
4. **The Hive**: three rings of boulders, each with a turret guarding the crystals inside, and chasers roaming between them.

There are two kinds of enemy. Turrets stay put, turn to track the ship and fire when they have a clear line to it; their eye glows brighter as a shot charges, and rocks block their fire. Chasers hover in place until the ship comes near, then fly straight at it and explode on contact. Turrets take four hits and chasers take two.

Levels you have reached are unlocked on the title screen (press 1 to 4 to pick one), and the best time for each level is saved in the browser.

## Layout

- `src/main.ts` sets up the renderer and game loop
- `src/level.ts` has the hand-built levels: rocks, crystal spots, enemy spots, start and gate
- `src/world.ts` builds the ground texture, lights, border and stars, builds each level's rocks, and handles rock collisions
- `src/gate.ts` is the exit gate that opens once every crystal is collected
- `src/enemies.ts` has the turrets and chasers
- `src/weapons.ts` is the laser bolt pool used by both the ship and the turrets
- `src/player.ts` is the player ship, its movement, engine exhaust and rock collisions
- `src/crystals.ts` places and animates the crystals and detects pickups
- `src/fx.ts` has the glow sprites and the particle pool for exhaust, sparks and bursts
- `src/audio.ts` synthesises the sound effects with the Web Audio API
- `src/hud.ts` drives the title screen, hull bar, crystal count, timer and end-of-run panels
- `src/followCamera.ts` is the camera that trails the player from above and behind
- `src/input.ts` reads the keyboard
