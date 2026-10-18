# AstroDrift

Top-down third-person browser game built with TypeScript, Three.js and Vite.

Play it at https://mikaelmohlin1013.github.io/astrodrift/ (redeployed on every push to `main`).

## Run

```
npm install
npm run dev
```

Then open http://localhost:5173 and press Enter on the title screen. The controls are relative to the ship: W or Up thrusts forward, A/D or Left/Right turn, S or Down brakes and then reverses, and Shift boosts while thrusting. Press M to turn sound on or off.

The level is a fixed course from the landing pad at the south edge to a gate at the north end: open ground, a switchback between two rock walls, a ring of boulders, and a final run to the gate. Pick up all 13 crystals to open the gate, then fly through it to finish. Each crystal patches the hull a little. Hitting rocks fast damages the hull, and when it runs out the run ends. The arrow on the ground points to the nearest crystal, and to the gate once it is open. Your best time is saved in the browser.

## Layout

- `src/main.ts` sets up the renderer and game loop
- `src/level.ts` is the hand-built layout: rock walls, the ring, crystal spots, start and gate
- `src/world.ts` builds the ground texture, lights, rocks, border and stars, and returns the rock footprints for collisions
- `src/gate.ts` is the exit gate that opens once every crystal is collected
- `src/player.ts` is the player ship, its movement, engine exhaust and rock collisions
- `src/crystals.ts` places and animates the crystals and detects pickups
- `src/fx.ts` has the glow sprites and the particle pool for exhaust, sparks and bursts
- `src/audio.ts` synthesises the sound effects with the Web Audio API
- `src/hud.ts` drives the title screen, hull bar, crystal count, timer and end-of-run panels
- `src/followCamera.ts` is the camera that trails the player from above and behind
- `src/input.ts` reads the keyboard
