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

const MAX_HULL = 100;
const HIT_MIN_SPEED = 2; // gentle bumps don't hurt
const HIT_DAMAGE = 2; // hull lost per unit of impact speed
const HIT_COOLDOWN = 0.5;
const CRYSTAL_REPAIR = 5;
const POINTER_RANGE = 14; // show the crystal pointer when the nearest one is further than this
const LASER_RELOAD = 0.16;
const LASER_SPEED = 45;
const LASER_RANGE = 34;
const BOLT_DAMAGE = 8; // hull lost per turret bolt
const RAM_DAMAGE = 20; // hull lost when a chaser crashes into the ship
const RESTART_DELAY = 0.6; // seconds before an end-of-run panel accepts a key

type Phase = 'title' | 'playing' | 'over' | 'cleared' | 'won';

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
const particles = new Particles(scene);
const sfx = new Sfx();
const hud = new Hud();
hud.setSound(!sfx.isMuted);

// Arrow on the ground around the ship that points at the nearest crystal,
// or at the gate once it is open.
const pointerMat = new THREE.MeshBasicMaterial({ color: 0x6affd8, transparent: true, opacity: 0.7 });
const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3).rotateX(-Math.PI / 2).translate(0, 0, -2.6), pointerMat);
scene.add(pointer);

const follow = new FollowCamera(window.innerWidth / window.innerHeight);

window.addEventListener('resize', () => {
  follow.camera.aspect = window.innerWidth / window.innerHeight;
  follow.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const state = {
  phase: 'title' as Phase,
  level: 0,
  unlocked: loadUnlocked(),
  hull: MAX_HULL,
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
  rocks = [...built.rocks, ...gate.pylons];
  crystals.load(level.crystals);
  enemies.load(level);
  lasers.clear();
  enemyBolts.clear();
  player.reset(level.start);
  state.level = index;
  state.best = loadBest(index);
}

function start(index: number): void {
  loadLevel(index);
  Object.assign(state, { phase: 'playing', hull: MAX_HULL, collected: 0, time: 0, hitTimer: 0, reload: 0, gateOpen: false });
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
    hud.showLevelClear(state.level + 1, state.time, state.best, state.hull / MAX_HULL, enemies.total - enemies.alive, enemies.total, next);
  } else {
    state.phase = 'over';
    particles.burst(p, 0xff8a3a, 140, 12, 1.2);
    particles.burst(p, 0xfff0c0, 40, 6, 0.6);
    sfx.explode();
    hud.showGameOver(state.collected, crystals.total, LEVELS[state.level].name);
  }
}

function damage(amount: number): void {
  state.hull = Math.max(0, state.hull - amount);
  state.hitTimer = HIT_COOLDOWN;
  hud.flash();
  sfx.hit(amount / HIT_DAMAGE);
  particles.burst(player.mesh.position, 0xffb060, 10 + Math.round(amount), amount * 0.4, 0.5);
}

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') {
    sfx.toggleMute();
    hud.setSound(!sfx.isMuted);
  }
  if (state.phase === 'playing' || e.repeat || elapsed - state.endedAt < RESTART_DELAY) return;
  const go = e.code === 'Enter' || e.code === 'Space';
  if (state.phase === 'title') {
    const picked = Number(e.key);
    if (picked >= 1 && picked <= state.unlocked) start(picked - 1);
    else if (go) start(0);
  } else if (e.code === 'Escape') {
    loadLevel(0);
    state.phase = 'title';
    hud.showTitle(state.best, LEVELS.map((l) => l.name), state.unlocked);
  } else if (go) {
    if (state.phase === 'over') start(state.level);
    else if (state.phase === 'cleared') start(state.level + 1);
    else start(0);
  }
});
window.addEventListener('pointerdown', () => sfx.unlock());

loadLevel(0);
follow.update(0, player.mesh.position, true);
hud.showTitle(state.best, LEVELS.map((l) => l.name), state.unlocked);

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
  const playing = state.phase === 'playing';
  const p = player.mesh.position;

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
      state.reload = LASER_RELOAD;
      lasers.fire(player.nextMuzzle(), player.forward, LASER_SPEED, LASER_RANGE, player.velocity);
      sfx.laser();
    }

    for (const at of crystals.update(dt, p)) {
      sfx.collect(state.collected);
      state.collected++;
      state.hull = Math.min(MAX_HULL, state.hull + CRYSTAL_REPAIR);
      particles.burst(at, 0x6affd8, 40, 8);
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

  for (const at of lasers.update(dt, rocks)) particles.burst(at, 0x8ae6ff, 8, 4, 0.3);
  const { hits, kills } = enemies.takeHits(lasers);
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
  particles.update(dt);

  player.setDamageFlash(state.hitTimer / HIT_COOLDOWN);
  player.mesh.visible = state.phase === 'playing' || state.phase === 'title';
  hud.update(state.hull / MAX_HULL, state.collected, crystals.total, enemies.total - enemies.alive, enemies.total, state.time, state.best);

  const target = state.gateOpen ? gate.position : crystals.nearest(p);
  pointerMat.color.set(state.gateOpen ? 0x9a7bff : 0x6affd8);
  pointer.visible =
    state.phase === 'playing' && !!target && (state.gateOpen || Math.hypot(target.x - p.x, target.z - p.z) > POINTER_RANGE);
  if (target) {
    pointer.position.set(p.x, 0.15, p.z);
    pointer.rotation.y = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  }

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
  Object.assign(window, { astrodrift: { state, player, crystals, gate, enemies, lasers, enemyBolts, levels: LEVELS, rocks: () => rocks, start, tick } });
}
