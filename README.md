# AstroDrift

Top-down third-person browser game built with TypeScript, Three.js and Vite.

Play it at https://mikaelmohlin1013.github.io/astrodrift/ (redeployed on every push to `main`).

## Run

```
npm install
npm run dev
```

Then open http://localhost:5173 and press Enter on the title screen. The controls are relative to the ship: W or Up thrusts forward, A/D or Left/Right turn, S or Down brakes and then reverses, Shift boosts while thrusting, Space fires the lasers and E (or F) launches a homing missile once you have bought the launcher. Press M to turn sound on or off, and U on the title or level-clear screen to open the upgrade shop.

There are eight hand-built levels, each running from a landing pad in the south to a gate in the north. Pick up every crystal to open the gate, then fly through it to reach the next level. Each crystal patches the hull a little. Hitting rocks fast damages the hull, and so do enemies, and when it runs out you retry the level. The arrow on the ground points to the nearest crystal, and to the gate once it is open.

1. **Drift Field**: open ground, a switchback between two rock walls, a ring of boulders and a final run. One turret and one chaser to learn on.
2. **Crossfire**: a canyon up the middle with bays on each side. Turrets in the bays fire through the gaps in the canyon walls.
3. **Switchyard**: four walls with a gap on alternating sides, so you weave across the whole field past turrets and chasers.
4. **The Hive**: three rings of boulders, each with a turret guarding the crystals inside, and chasers roaming between them.
5. **Frostbite**: frozen ground with wide ice patches. The ship can hardly steer or brake on ice and slides on towards the walls, whose gaps sit just past the ice.
6. **Ember Rift**: a river of lava splits the field, with two dry crossings that turrets watch, and more pools dotted around. Lava burns the hull (shield first) while you're over it.
7. **Drift Belt**: four lanes of asteroids slide across the field in alternating directions. Time the gaps: a boulder ramming the ship hurts as much as flying into one.
8. **Event Horizon**: two gravity wells pull the ship towards their burning cores, with boulders circling them, pools of plasma and the most enemies yet.

There are two kinds of enemy. Turrets stay put, turn to track the ship and fire when they have a clear line to it; their eye glows brighter as a shot charges, and rocks block their fire. Chasers hover in place until the ship comes near, then fly straight at it and explode on contact. Turrets take four hits and chasers take two.

Levels you have reached are unlocked on the title screen (press 1 to 8 to pick one), and the best time for each level is saved in the browser.

## Repair stations and upgrades

Every level has a green repair station partway along. Settle slowly onto its pad to dock: the hull is repaired, the shield charged, missiles restocked, and the crystals you have picked up so far are banked. Then the upgrade shop opens, and the game waits until you undock with Esc.

Each crystal is worth 10 to spend, and destroying a turret earns 15 and a chaser 8. Earnings are banked when you dock or fly through the gate; if the hull breaks first, whatever wasn't banked is lost. Banked crystals and upgrades are saved in the browser and carry across levels and sessions.

| Upgrade | Levels | What it does |
| --- | --- | --- |
| Laser power | 3 | Bolt damage from 1× up to 2.75× |
| Rapid fire | 3 | From 6.3 up to 11.8 shots a second |
| Spread shot | 2 | Every shot fans out into 3, then 5 bolts |
| Homing missiles | 4 | A launcher with 4, rising to 10 missiles per load; each one seeks the nearest enemy it can see and destroys a turret in one hit |
| Shield | 4 | A bubble of 30 up to 100 that takes damage before the hull and recharges after a few seconds without a hit |
| Shield recharge | 3 | The shield starts refilling sooner and refills faster |
| Hull plating | 3 | Hull from 100 up to 180 |
| Crystal magnet | 2 | Crystals within 6, then 10 metres fly to the ship |

When the hull drops below 60%, a green arrow next to the ship points to the station.

## Radar and looks

The radar in the top right shows the area around the ship with north up: rocks, ice, lava and wells, crystals, turrets (squares) and chasers (dots), the station's green plus and the gate, which pulses once it is open.

The ship is a Saab JAS 39 Gripen built in code: delta wing, canards on the intakes, a single fin and engine, a gold-tinted bubble canopy, IRIS-T missiles on the wingtips, and Swedish Air Force grey with panel lines and the three-crown roundels.

Each group of levels has its own look (a cratered moon at dusk, snow and blue ice, cracked basalt with lava glowing through, stony rubble, and volcanic glass with violet seams). The ground and boulders use physically based materials: tiled colour, normal and roughness maps, varied over large areas so the tiles don't show, and boulders shaped from noise and textured from all three sides. Each level is lit by an HDR sky that also shows in reflections, and the land rises into hills beyond the border. The picture goes through bloom, filmic tone mapping and a light vignette; explosions send out a shockwave ring and flash the ground, and big hits shake the camera. If the browser can't keep up, the game lowers its resolution a step at a time.

## Layout

- `src/main.ts` sets up the renderer and game loop
- `src/level.ts` has the hand-built levels: rocks, crystal spots, enemy spots, hazards, start and gate
- `src/theme.ts` has each level's look: sky, ground, rock and light colours
- `src/world.ts` builds the ground and hills, lights, border and stars, applies a level's theme (textures and HDR sky), builds each level's rocks, and handles rock collisions
- `tools/bake_textures.py` generates the ground and rock textures in `public/textures/` from seeded noise (`python3 tools/bake_textures.py`, needs numpy and Pillow)
- `src/hazards.ts` has the ice, lava, drifting and orbiting boulders and gravity wells
- `src/post.ts` renders through bloom, tone mapping and the vignette, and lowers the resolution on slow machines
- `src/radar.ts` draws the radar
- `src/station.ts` is the repair station pad that docks the ship
- `src/upgrades.ts` has the upgrade list and prices, the saved progress, and the ship stats each upgrade level gives
- `src/shop.ts` is the upgrade shop panel
- `src/missiles.ts` has the homing missiles
- `src/gate.ts` is the exit gate that opens once every crystal is collected
- `src/enemies.ts` has the turrets and chasers
- `src/weapons.ts` is the laser bolt pool used by both the ship and the turrets
- `src/player.ts` is the player ship, its movement, engine exhaust and rock collisions
- `src/gripen.ts` builds the Gripen model and its paint
- `src/crystals.ts` places and animates the crystals and detects pickups
- `src/fx.ts` has the glow sprites, the particle pool for exhaust, sparks and bursts, shockwave rings, and the drifting dust
- `src/audio.ts` synthesises the sound effects with the Web Audio API
- `src/hud.ts` drives the title screen, hull bar, crystal count, timer and end-of-run panels
- `src/followCamera.ts` is the camera that trails the player from above and behind, and shakes on big hits
- `src/input.ts` reads the keyboard

## Credits

- HDR skies in `public/hdri/` are from [Poly Haven](https://polyhaven.com/hdris), CC0, in the compressed versions packaged by [pmndrs/assets](https://github.com/pmndrs/assets) (also CC0).
- The ground and rock textures are generated by `tools/bake_textures.py` for this game.
