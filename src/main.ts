import * as THREE from 'three';
import { Input } from './input';
import { Player, PLAYER_RADIUS } from './player';
import { FollowCamera } from './followCamera';
import { buildLevel, createWorld, disposeLevel, type Rock } from './world';
import { LEVELS } from './level';
import { Crystals } from './crystals';
import { Gate } from './gate';
import { Enemies } from './enemies';
import { Bolts } from './weapons';
import { Hud } from './hud';
import { Particles } from './fx';
import { Sfx } from './audio';
import { Station } from './station';
import { Missiles } from './missiles';
import { Shop } from './shop';
import { blocker, loadSave, loadout, writeSave, type Upgrade } from './upgrades';

const HIT_MIN_SPEED = 2; // gentle bumps don't hurt
const HIT_DAMAGE = 2; // hull lost per unit of impact speed
const HIT_COOLDOWN = 0.5;
const CRYSTAL_REPAIR = 5;
const POINTER_RANGE = 14; // show the crystal pointer when the nearest one is further than this
const LASER_SPEED = 45;
const LASER_RANGE = 34;
const BOLT_DAMAGE = 8; // hull lost per turret bolt
const RAM_DAMAGE = 20; // hull lost when a chaser crashes into the ship
const RESTART_DELAY = 0.6; // seconds before an end-of-run panel accepts a key
const CRYSTAL_VALUE = 10; // crystals to spend per crystal picked up
const SPREAD_ANGLE = 0.09; // radians between the bolts of a spread shot
const MISSILE_DAMAGE = 4; // enough to destroy a turret outright
const MISSILE_RELOAD = 0.4;
const MISSILE_RANGE = 40;
const DOCK_SPEED = 4; // the ship has to be going slower than this to dock
const DOCK_TIME = 0.7; // seconds of settling on the pad before it docks

// 'shop' is the upgrade shop, opened from a station or from the title and
// end-of-level screens; the game is paused while it is open.
type Phase = 'title' | 'playing' | 'over' | 'cleared' | 'won' | 'shop';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { sun } = createWorld(scene);
const sunOffset = sun.position.clone();

const input = new Input();
const player = new Player();
scene.add(player.mesh);
const crystals = new Crystals(scene);
const gate = new Gate(scene);
const enemies = new Enemies(scene);
const lasers = new Bolts(scene, 0x5ad8ff, 1.4);
const enemyBolts = new Bolts(scene, 0xff4a5a, 1.0);
const missiles = new Missiles(scene);
const station = new Station(scene);
const shop = new Shop();
const particles = new Particles(scene);
const sfx = new Sfx();
const hud = new Hud();
hud.setSound(!sfx.isMuted);

// Arrow on the ground around the ship that points at the nearest crystal,
// or at the gate once it is open.
const pointerMat = new THREE.MeshBasicMaterial({ color: 0x6affd8, transparent: true, opacity: 0.7 });
const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3).rotateX(-Math.PI / 2).translate(0, 0, -2.6), pointerMat);
scene.add(pointer);
// A second, green arrow points at the repair station when the hull is low.
const stationPointer = new THREE.Mesh(
  pointer.geometry,
  new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.7 }),
);
stationPointer.scale.setScalar(0.8);
scene.add(stationPointer);

const follow = new FollowCamera(window.innerWidth / window.innerHeight);

window.addEventListener('resize', () => {
  follow.camera.aspect = window.innerWidth / window.innerHeight;
  follow.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const save = loadSave();
let gear = loadout(save.levels);

const state = {
  phase: 'title' as Phase,
  /** Where closing the shop goes back to. */
  shopFrom: 'title' as Phase,
  level: 0,
  unlocked: loadUnlocked(),
  hull: gear.maxHull,
  shield: gear.shield,
  shieldWait: 0, // seconds until the shield starts recharging
  shieldFlash: 0,
  hullFlash: 0,
  missiles: gear.missiles,
  missileReload: 0,
  /** Crystals earned this run that a station or the gate hasn't banked yet. */
  pending: 0,
  dock: 0, // 0..1 progress settling onto the pad
  canDock: true, // false after undocking, until the ship leaves the pad
  collected: 0,
  time: 0,
  best: loadBest(0),
  hitTimer: 0,
  reload: 0,
  gateOpen: false,
  endedAt: 0,
};

// The current level's rocks and the gate pylons; turrets are added on top
// each frame while they stand.
let rocks: Rock[] = [];
let levelGroup: THREE.Group | null = null;

function loadLevel(index: number): void {
  const level = LEVELS[index];
  if (levelGroup) disposeLevel(levelGroup);
  const built = buildLevel(level, 7 + index * 13);
  levelGroup = built.group;
  scene.add(levelGroup);
  gate.place(level.gate);
  station.place(level.station);
  rocks = [...built.rocks, ...gate.pylons, station.mast];
  crystals.load(level.crystals);
  enemies.load(level);
  lasers.clear();
  enemyBolts.clear();
  missiles.clear();
  player.reset(level.start);
  state.level = index;
  state.best = loadBest(index);
}

function start(index: number): void {
  loadLevel(index);
  Object.assign(state, {
    phase: 'playing',
    hull: gear.maxHull,
    shield: gear.shield,
    shieldWait: 0,
    shieldFlash: 0,
    hullFlash: 0,
    missiles: gear.missiles,
    missileReload: 0,
    pending: 0,
    dock: 0,
    canDock: true,
    collected: 0,
    time: 0,
    hitTimer: 0,
    reload: 0,
    gateOpen: false,
  });
  gate.setOpen(false);
  particles.clear();
  follow.update(0, player.mesh.position, true);
  hud.showPlaying(index + 1, LEVELS[index].name);
  hud.message(`Level ${index + 1}: ${LEVELS[index].name}`, 2);
  setTimeout(() => state.phase === 'playing' && state.level === index && hud.message(`Collect all ${crystals.total} crystals`), 2000);
  sfx.start();
}

function endRun(won: boolean): void {
  state.endedAt = elapsed;
  sfx.stopEngine();
  const p = player.mesh.position;
  if (won) {
    const banked = bankPending();
    const last = state.level === LEVELS.length - 1;
    state.phase = last ? 'won' : 'cleared';
    if (state.best === null || state.time < state.best) {
      state.best = state.time;
      saveBest(state.level, state.best);
    }
    if (!last && state.unlocked < state.level + 2) {
      state.unlocked = state.level + 2;
      saveUnlocked(state.unlocked);
    }
    particles.burst(p, 0x9a7bff, 160, 14, 1.2);
    sfx.win();
    const next = last ? null : { number: state.level + 2, name: LEVELS[state.level + 1].name };
    hud.showLevelClear(state.level + 1, state.time, state.best, state.hull / gear.maxHull, enemies.total - enemies.alive, enemies.total, next, banked);
  } else {
    state.phase = 'over';
    const lost = state.pending;
    state.pending = 0;
    particles.burst(p, 0xff8a3a, 140, 12, 1.2);
    particles.burst(p, 0xfff0c0, 40, 6, 0.6);
    sfx.explode();
    hud.showGameOver(state.collected, crystals.total, LEVELS[state.level].name, lost);
  }
}

/** Takes damage on the shield first, then the hull. */
function damage(amount: number): void {
  state.hitTimer = HIT_COOLDOWN;
  state.shieldWait = gear.shieldDelay;
  const absorbed = Math.min(state.shield, amount);
  if (absorbed > 0) {
    state.shield -= absorbed;
    state.shieldFlash = 1;
    sfx.shieldHit();
    if (state.shield <= 0) {
      sfx.shieldDown();
      hud.message('Shield down!', 1.2);
    }
    particles.burst(player.mesh.position, 0x8a9dff, 8 + Math.round(absorbed), 6, 0.4);
  }
  const rest = amount - absorbed;
  if (rest <= 0) return;
  state.hull = Math.max(0, state.hull - rest);
  state.hullFlash = 1;
  hud.flash();
  sfx.hit(rest / HIT_DAMAGE);
  particles.burst(player.mesh.position, 0xffb060, 10 + Math.round(rest), rest * 0.4, 0.5);
}

/** Moves this run's earnings into the saved bank; returns how many. */
function bankPending(): number {
  const n = state.pending;
  save.bank += n;
  state.pending = 0;
  writeSave(save);
  return n;
}

/** Settles the ship on the station pad: repairs it, banks crystals and opens the shop. */
function dock(): void {
  const lines = [];
  if (state.hull < gear.maxHull) lines.push('hull repaired');
  if (gear.shield && state.shield < gear.shield) lines.push('shield charged');
  if (gear.missiles && state.missiles < gear.missiles) lines.push('missiles restocked');
  const banked = bankPending();
  if (banked) lines.push(`${banked} crystals banked`);
  Object.assign(state, { hull: gear.maxHull, shield: gear.shield, missiles: gear.missiles, dock: 0, canDock: false, hitTimer: 0, hullFlash: 0 });
  player.velocity.set(0, 0, 0);
  player.mesh.position.x = station.position.x;
  player.mesh.position.z = station.position.z;
  particles.burst(player.mesh.position, 0x7dff8a, 60, 6, 0.8);
  sfx.stopEngine();
  sfx.dock();
  const service = lines.length ? lines.join(' · ').replace(/^./, (c) => c.toUpperCase()) : 'All systems nominal';
  openShop('playing', 'Repair station', service, 'Arrows or WASD choose · Enter buy · Esc undock');
}

function openShop(from: Phase, title: string, service: string, prompt: string): void {
  state.shopFrom = from;
  state.phase = 'shop';
  hud.hideMessage();
  shop.open(save, title, service, prompt);
}

function closeShop(): void {
  shop.close();
  state.phase = state.shopFrom;
  state.endedAt = elapsed;
  if (state.phase === 'playing') hud.message('Undocked · good hunting', 1.5);
  else if (state.phase === 'title') hud.showTitle(state.best, LEVELS.map((l) => l.name), state.unlocked, save.bank);
}

/** Buys the next level of an upgrade if it can be afforded. */
function buy(u: Upgrade): void {
  if (blocker(save, u)) {
    sfx.deny();
    shop.deny();
    return;
  }
  save.bank -= u.prices[save.levels[u.id]];
  save.levels[u.id]++;
  writeSave(save);
  const before = gear;
  gear = loadout(save.levels);
  // New capacity arrives full; a hull upgrade adds its extra hull.
  state.shield = gear.shield;
  state.missiles = gear.missiles;
  state.hull = Math.min(gear.maxHull, state.hull + gear.maxHull - before.maxHull);
  sfx.buy();
  shop.render(save);
}
shop.onPick = buy;
shop.onSelect = () => {
  sfx.tick();
  shop.render(save);
};

function shopKey(e: KeyboardEvent): void {
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  };
  if (moves[e.code]) {
    e.preventDefault();
    shop.move(...moves[e.code]);
  } else if (e.repeat) {
    return;
  } else if (e.code === 'Enter' || e.code === 'Space') {
    buy(shop.current);
  } else if (e.code === 'Escape' || e.code === 'KeyU' || e.code === 'KeyQ' || e.code === 'Backspace') {
    closeShop();
  }
}

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') {
    sfx.toggleMute();
    hud.setSound(!sfx.isMuted);
  }
  if (state.phase === 'shop') {
    shopKey(e);
    return;
  }
  if (state.phase === 'playing' || e.repeat || elapsed - state.endedAt < RESTART_DELAY) return;
  const go = e.code === 'Enter' || e.code === 'Space';
  if (e.code === 'KeyU' && state.phase !== 'over') {
    const prompt = `Arrows or WASD choose · Enter buy · Esc back`;
    openShop(state.phase, 'Upgrade bay', 'Repairs happen at the green station pad in each level', prompt);
  } else if (state.phase === 'title') {
    const picked = Number(e.key);
    if (picked >= 1 && picked <= state.unlocked) start(picked - 1);
    else if (go) start(0);
  } else if (e.code === 'Escape') {
    loadLevel(0);
    state.phase = 'title';
    hud.showTitle(state.best, LEVELS.map((l) => l.name), state.unlocked, save.bank);
  } else if (go) {
    if (state.phase === 'over') start(state.level);
    else if (state.phase === 'cleared') start(state.level + 1);
    else start(0);
  }
});
window.addEventListener('pointerdown', () => sfx.unlock());

loadLevel(0);
follow.update(0, player.mesh.position, true);
hud.showTitle(state.best, LEVELS.map((l) => l.name), state.unlocked, save.bank);

const titleTarget = new THREE.Vector3();
const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  tick(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, follow.camera);
});

// Advances the game by one frame.
function tick(dt: number): void {
  elapsed += dt;
  const p = player.mesh.position;
  if (state.phase === 'shop') {
    // Everything holds still while the shop is open; only the scenery moves.
    station.update(dt, state.shopFrom === 'playing' ? 1 : 0);
    gate.update(dt);
    crystals.update(dt, null);
    particles.update(dt);
    player.setShield(gear.shield ? state.shield / gear.shield : 0, 0);
    hud.update(state.hull / gear.maxHull, state.collected, crystals.total, enemies.total - enemies.alive, enemies.total, state.time, state.best);
    hud.updateGear(state.shield, gear.shield, state.missiles, gear.missiles, save.bank, state.pending);
    follow.update(dt, state.shopFrom === 'title' ? titleTarget : p);
    return;
  }
  const playing = state.phase === 'playing';

  if (playing) {
    state.time += dt;
    player.update(dt, input);
    const impact = player.collide([...rocks, ...enemies.obstacles()]);
    state.hitTimer = Math.max(0, state.hitTimer - dt);
    if (impact > HIT_MIN_SPEED && state.hitTimer === 0) {
      damage(impact * HIT_DAMAGE);
    } else if (impact > 0.5 && state.hitTimer === 0) {
      sfx.bump();
    }
    player.mesh.updateMatrixWorld();
    player.exhaust(dt, particles);
    sfx.engine(player.speed01, player.isThrusting, player.isBoosting);

    state.reload = Math.max(0, state.reload - dt);
    if (input.fire && state.reload === 0) {
      state.reload = gear.laserReload;
      const muzzle = player.nextMuzzle();
      // A spread shot fans extra bolts out evenly either side of the nose.
      for (let i = 0; i < gear.bolts; i++) {
        const angle = player.yaw + (i - (gear.bolts - 1) / 2) * SPREAD_ANGLE;
        const dir = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));
        lasers.fire(muzzle, dir, LASER_SPEED, LASER_RANGE, player.velocity);
      }
      sfx.laser();
    }

    state.missileReload = Math.max(0, state.missileReload - dt);
    if (input.missile && state.missileReload === 0) {
      state.missileReload = MISSILE_RELOAD;
      if (state.missiles > 0) {
        state.missiles--;
        const from = p.clone().setY(p.y - 0.3);
        missiles.fire(from, player.yaw, player.velocity.dot(player.forward) + 6);
        sfx.missile();
      } else if (gear.missiles === 0) {
        hud.message('No missile launcher yet · buy one at a repair station', 1.5);
      } else {
        sfx.deny();
        hud.message('Out of missiles · restock at a repair station', 1.5);
      }
    }

    // The shield recharges once it has gone a while without a hit.
    state.shieldWait = Math.max(0, state.shieldWait - dt);
    if (state.shieldWait === 0) state.shield = Math.min(gear.shield, state.shield + gear.shieldRegen * dt);

    for (const at of crystals.update(dt, p, gear.magnet)) {
      sfx.collect(state.collected);
      state.collected++;
      state.pending += CRYSTAL_VALUE;
      state.hull = Math.min(gear.maxHull, state.hull + CRYSTAL_REPAIR);
      particles.burst(at, 0x6affd8, 40, 8);
    }

    // Settling slowly onto the station pad docks the ship.
    const onPad = station.contains(p);
    if (!onPad) state.canDock = true;
    if (onPad && state.canDock && player.velocity.length() < DOCK_SPEED) {
      if (state.dock === 0) hud.message('Docking…', DOCK_TIME);
      state.dock = Math.min(1, state.dock + dt / DOCK_TIME);
      if (state.dock >= 1) dock();
    } else {
      if (onPad && state.canDock && state.dock === 0) hud.message('Slow down to dock', 0.8);
      state.dock = Math.max(0, state.dock - dt * 2);
    }
    if (!state.gateOpen && crystals.remaining === 0) {
      state.gateOpen = true;
      gate.setOpen(true);
      sfx.gateOpen();
      hud.message('The gate is open!');
    }
  } else {
    crystals.update(dt, null);
  }

  // Enemies only notice the ship during a run.
  const events = enemies.update(dt, playing ? p : null, rocks, enemyBolts);
  if (events.shots.length) sfx.enemyShot();
  if (events.alerts) sfx.alert();
  for (const at of events.rams) {
    particles.burst(at, 0xff4a5a, 60, 9, 0.8);
    sfx.enemyDie();
    if (playing) damage(RAM_DAMAGE);
  }

  // Docking may just have opened the shop, which freezes the rest of the frame.
  if ((state.phase as Phase) === 'shop') return;

  for (const at of lasers.update(dt, rocks)) particles.burst(at, 0x8ae6ff, 8, 4, 0.3);
  for (const at of missiles.update(dt, rocks, particles, (from, dir) => enemies.nearestTarget(from, dir, MISSILE_RANGE, rocks))) {
    particles.burst(at, 0xff8a3a, 40, 7, 0.6);
    sfx.enemyHit();
  }
  const { hits, kills, reward } = enemies.takeHits([
    { shots: lasers, damage: gear.laserDamage },
    { shots: missiles, damage: MISSILE_DAMAGE },
  ]);
  if (playing) state.pending += reward;
  for (const at of missiles.takeBlasts()) {
    particles.burst(at, 0xffb060, 70, 11, 0.7);
    particles.burst(at, 0xfff0c0, 20, 5, 0.4);
  }
  for (const at of hits) {
    particles.burst(at, 0xfff0c0, 12, 5, 0.3);
    sfx.enemyHit();
  }
  for (const at of kills) {
    particles.burst(at, 0xff8a3a, 90, 10, 0.9);
    particles.burst(at, 0xfff0c0, 30, 5, 0.5);
    sfx.enemyDie();
  }
  for (const at of enemyBolts.update(dt, [...rocks, ...enemies.obstacles()])) particles.burst(at, 0xff6a5a, 8, 4, 0.3);
  if (playing) {
    const n = enemyBolts.hit(p.x, p.z, PLAYER_RADIUS);
    if (n > 0) damage(n * BOLT_DAMAGE);

    if (state.hull <= 0) endRun(false);
    else if (gate.contains(p)) {
      if (state.gateOpen) endRun(true);
      else hud.message(`Gate locked · ${crystals.remaining} crystals left`, 1.5);
    }
  }

  gate.update(dt);
  station.update(dt, state.dock);
  particles.update(dt);

  state.hullFlash = Math.max(0, state.hullFlash - dt / HIT_COOLDOWN);
  state.shieldFlash = Math.max(0, state.shieldFlash - dt * 3);
  player.setDamageFlash(state.hullFlash);
  player.setShield(playing && gear.shield ? state.shield / gear.shield : 0, state.shieldFlash);
  player.mesh.visible = state.phase === 'playing' || state.phase === 'title';
  hud.updateGear(state.shield, gear.shield, state.missiles, gear.missiles, save.bank, state.pending);
  hud.update(state.hull / gear.maxHull, state.collected, crystals.total, enemies.total - enemies.alive, enemies.total, state.time, state.best);

  const target = state.gateOpen ? gate.position : crystals.nearest(p);
  pointerMat.color.set(state.gateOpen ? 0x9a7bff : 0x6affd8);
  pointer.visible =
    state.phase === 'playing' && !!target && (state.gateOpen || Math.hypot(target.x - p.x, target.z - p.z) > POINTER_RANGE);
  if (target) {
    pointer.position.set(p.x, 0.15, p.z);
    pointer.rotation.y = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  }
  const s = station.position;
  stationPointer.visible = playing && state.hull < gear.maxHull * 0.6 && Math.hypot(s.x - p.x, s.z - p.z) > POINTER_RANGE;
  stationPointer.position.set(p.x, 0.14, p.z);
  stationPointer.rotation.y = Math.atan2(-(s.x - p.x), -(s.z - p.z));

  // On the title screen the camera drifts slowly over the level.
  if (state.phase === 'title') {
    titleTarget.set(Math.sin(elapsed * 0.11) * 18, 0, 30 - (1 - Math.cos(elapsed * 0.07)) * 35);
    follow.update(dt, titleTarget);
  } else {
    follow.update(dt, p);
  }
  const focus = state.phase === 'title' ? titleTarget : p;
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(sunOffset);
}

// Level 1 keeps the key it had before there were more levels.
function bestKey(level: number): string {
  return level === 0 ? 'astrodrift.bestTime' : `astrodrift.bestTime.${level + 1}`;
}

function loadBest(level: number): number | null {
  try {
    const v = Number(localStorage.getItem(bestKey(level)));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveBest(level: number, best: number): void {
  try {
    localStorage.setItem(bestKey(level), String(best));
  } catch {
    // Storage may be unavailable (private mode); the best time just won't persist.
  }
}

function loadUnlocked(): number {
  try {
    return THREE.MathUtils.clamp(Number(localStorage.getItem('astrodrift.unlocked')) || 1, 1, LEVELS.length);
  } catch {
    return 1;
  }
}

function saveUnlocked(n: number): void {
  try {
    localStorage.setItem('astrodrift.unlocked', String(n));
  } catch {
    // As above.
  }
}

// Handle for headless tests and debugging in the dev server.
if (import.meta.env.DEV) {
  Object.assign(window, { astrodrift: { state, save, gear: () => gear, buy, station, missiles, player, crystals, gate, enemies, lasers, enemyBolts, levels: LEVELS, rocks: () => rocks, start, tick } });
}
