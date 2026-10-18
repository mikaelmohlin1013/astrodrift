import * as THREE from 'three';
import { Input } from './input';
import { Player } from './player';
import { FollowCamera } from './followCamera';
import { createWorld } from './world';
import { Crystals } from './crystals';
import { Hud } from './hud';

const MAX_HULL = 100;
const HIT_MIN_SPEED = 2; // gentle bumps don't hurt
const HIT_DAMAGE = 2; // hull lost per unit of impact speed
const HIT_COOLDOWN = 0.5;
const CRYSTAL_REPAIR = 5;
const POINTER_RANGE = 14; // show the crystal pointer when the nearest one is further than this

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { sun, rocks } = createWorld(scene);
const sunOffset = sun.position.clone();

const input = new Input();
const player = new Player();
scene.add(player.mesh);
const crystals = new Crystals(scene, rocks);
const hud = new Hud();

// Arrow on the ground around the ship that points at the nearest crystal.
const pointer = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.9, 3).rotateX(-Math.PI / 2).translate(0, 0, -2.6),
  new THREE.MeshBasicMaterial({ color: 0x6affd8, transparent: true, opacity: 0.7 }),
);
scene.add(pointer);

const follow = new FollowCamera(window.innerWidth / window.innerHeight);
follow.update(0, player.mesh.position, true);

window.addEventListener('resize', () => {
  follow.camera.aspect = window.innerWidth / window.innerHeight;
  follow.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const state = { hull: MAX_HULL, score: 0, best: loadBest(), over: false, hitTimer: 0 };

function restart(): void {
  Object.assign(state, { hull: MAX_HULL, score: 0, over: false, hitTimer: 0 });
  player.reset();
  crystals.reset();
  follow.update(0, player.mesh.position, true);
  hud.hideGameOver();
}

window.addEventListener('keydown', (e) => {
  if (state.over && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) restart();
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!state.over) {
    player.update(dt, input);
    const impact = player.collide(rocks);
    state.hitTimer = Math.max(0, state.hitTimer - dt);
    if (impact > HIT_MIN_SPEED && state.hitTimer === 0) {
      state.hull = Math.max(0, state.hull - impact * HIT_DAMAGE);
      state.hitTimer = HIT_COOLDOWN;
      hud.flash();
    }

    const got = crystals.update(dt, player.mesh.position);
    if (got > 0) {
      state.score += got;
      state.hull = Math.min(MAX_HULL, state.hull + got * CRYSTAL_REPAIR);
    }

    if (state.hull <= 0) {
      state.over = true;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest(state.best);
      }
      hud.showGameOver(state.score, state.best);
    }
  } else {
    crystals.update(dt, new THREE.Vector3(Infinity, 0, Infinity));
  }

  player.setDamageFlash(state.hitTimer / HIT_COOLDOWN);
  player.mesh.visible = !state.over;
  hud.update(state.hull / MAX_HULL, state.score, state.best);

  const target = crystals.nearest(player.mesh.position);
  const p = player.mesh.position;
  pointer.visible = !state.over && !!target && Math.hypot(target.x - p.x, target.z - p.z) > POINTER_RANGE;
  if (target) {
    pointer.position.set(p.x, 0.15, p.z);
    pointer.rotation.y = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  }

  follow.update(dt, player.mesh.position);
  sun.target.position.copy(player.mesh.position);
  sun.position.copy(player.mesh.position).add(sunOffset);
  renderer.render(scene, follow.camera);
});

function loadBest(): number {
  try {
    return Number(localStorage.getItem('astrodrift.best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number): void {
  try {
    localStorage.setItem('astrodrift.best', String(best));
  } catch {
    // Storage may be unavailable (private mode); the best score just won't persist.
  }
}

// Handle for headless tests and debugging in the dev server.
if (import.meta.env.DEV) Object.assign(window, { astrodrift: { state, player, crystals, rocks, restart } });
