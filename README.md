# AstroDrift

Top-down third-person browser game built with TypeScript, Three.js and Vite.

## Run

```
npm install
npm run dev
```

Then open http://localhost:5173. Move with WASD or the arrow keys, hold Shift to boost.

Fly around collecting the glowing crystals. Each one adds to your score and patches the hull a little. Hitting rocks fast damages the hull, and when it runs out the run ends; press Enter to fly again. The arrow on the ground points to the nearest crystal.

## Layout

- `src/main.ts` sets up the renderer and game loop
- `src/world.ts` builds the ground, lights, rocks and stars, and returns the rock footprints for collisions
- `src/player.ts` is the player rover, its movement and rock collisions
- `src/crystals.ts` spawns, animates and respawns the crystals
- `src/hud.ts` updates the hull bar, score and game-over panel
- `src/followCamera.ts` is the camera that trails the player from above and behind
- `src/input.ts` reads the keyboard
