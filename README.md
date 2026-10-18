# AstroDrift

Top-down third-person browser game built with TypeScript, Three.js and Vite.

## Run

```
npm install
npm run dev
```

Then open http://localhost:5173. Move with WASD or the arrow keys, hold Shift to boost.

## Layout

- `src/main.ts` sets up the renderer and game loop
- `src/world.ts` builds the ground, lights, rocks and stars
- `src/player.ts` is the player rover and its movement
- `src/followCamera.ts` is the camera that trails the player from above and behind
- `src/input.ts` reads the keyboard
