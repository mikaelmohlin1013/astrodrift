import * as THREE from 'three';
import { Input } from './input';
import { Player } from './player';
import { FollowCamera } from './followCamera';
import { createWorld } from './world';
import { Crystals } from './crystals';
import { Gate } from './gate';
import { Hud } from './hud';
import { Particles } from './fx';
import { Sfx } from './audio';

const MAX_HULL = 100;
const HIT_MIN_SPEED = 2; // gentle bumps don't hurt
const HIT_DAMAGE = 2; // hull lost per unit of impact speed
const HIT_COOLDOWN = 0.5;
const CRYSTAL_REPAIR = 5;
const POINTER_RANGE = 14; // show the crystal pointer when the nearest one is further than this

type Phase = 'title' | 'playing' | 'over' | 'won';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { sun, rocks: levelRocks } = createWorld(scene);
const sunOffset = sun.position.clone();

const input = new Input();
const player = new Player();
scene.add(player.mesh);
const crystals = new Crystals(scene);
const gate = new Gate(scene);
const rocks = [...levelRocks, ...gate.pylons];
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
follow.update(0, player.mesh.position, true);

window.addEventListener('resize', () => {
  follow.camera.aspect = window.innerWidth / window.innerHeight;
  follow.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const state = {
  phase: 'title' as Phase,
  hull: MAX_HULL,
  collected: 0,
  time: 0,
  best: loadBest(),
  hitTimer: 0,
  gateOpen: false,
};

function start(): void {
  Object.assign(state, { phase: 'playing', hull: MAX_HULL, collected: 0, time: 0, hitTimer: 0, gateOpen: false });
  player.reset();
  crystals.reset();
  gate.setOpen(false);
  particles.clear();
  follow.update(0, player.mesh.position, true);
  hud.showPlaying();
  hud.message(`Collect all ${crystals.total} crystals`);
  sfx.start();
}

function endRun(won: boolean): void {
  state.phase = won ? 'won' : 'over';
  sfx.stopEngine();
  const p = player.mesh.position;
  if (won) {
    if (state.best === null || state.time < state.best) {
      state.best = state.time;
      saveBest(state.best);
    }
    particles.burst(p, 0x9a7bff, 160, 14, 1.2);
    sfx.win();
    hud.showLevelClear(state.time, state.best, state.hull / MAX_HULL);
  } else {
    particles.burst(p, 0xff8a3a, 140, 12, 1.2);
    particles.burst(p, 0xfff0c0, 40, 6, 0.6);
    sfx.explode();
    hud.showGameOver(state.collected, crystals.total);
  }
}

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'KeyM') {
    sfx.toggleMute();
    hud.setSound(!sfx.isMuted);
  }
  if (state.phase !== 'playing' && (e.code === 'Enter' || e.code === 'Space')) start();
});
window.addEventListener('pointerdown', () => sfx.unlock());

hud.showTitle(state.best);

const titleTarget = new THREE.Vector3();
const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (state.phase === 'playing') {
    state.time += dt;
    player.update(dt, input);
    const impact = player.collide(rocks);
    state.hitTimer = Math.max(0, state.hitTimer - dt);
    if (impact > HIT_MIN_SPEED && state.hitTimer === 0) {
      state.hull = Math.max(0, state.hull - impact * HIT_DAMAGE);
      state.hitTimer = HIT_COOLDOWN;
      hud.flash();
      sfx.hit(impact);
      particles.burst(player.mesh.position, 0xffb060, 10 + Math.round(impact * 2), impact * 0.8, 0.5);
    } else if (impact > 0.5 && state.hitTimer === 0) {
      sfx.bump();
    }
    player.mesh.updateMatrixWorld();
    player.exhaust(dt, particles);
    sfx.engine(player.speed01, player.isThrusting, player.isBoosting);

    for (const at of crystals.update(dt, player.mesh.position)) {
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

    if (state.hull <= 0) endRun(false);
    else if (gate.contains(player.mesh.position)) {
      if (state.gateOpen) endRun(true);
      else hud.message(`Gate locked · ${crystals.remaining} crystals left`, 1.5);
    }
  } else {
    crystals.update(dt, null);
  }
  gate.update(dt);
  particles.update(dt);

  player.setDamageFlash(state.hitTimer / HIT_COOLDOWN);
  player.mesh.visible = state.phase === 'playing' || state.phase === 'title';
  hud.update(state.hull / MAX_HULL, state.collected, crystals.total, state.time, state.best);

  const p = player.mesh.position;
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
  renderer.render(scene, follow.camera);
});

function loadBest(): number | null {
  try {
    const v = Number(localStorage.getItem('astrodrift.bestTime'));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveBest(best: number): void {
  try {
    localStorage.setItem('astrodrift.bestTime', String(best));
  } catch {
    // Storage may be unavailable (private mode); the best time just won't persist.
  }
}

// Handle for headless tests and debugging in the dev server.
if (import.meta.env.DEV) Object.assign(window, { astrodrift: { state, player, crystals, gate, rocks, start } });
