import * as THREE from 'three';

export const WORLD_SIZE = 120;

// A rock's footprint on the ground, used for collisions.
export interface Rock {
  x: number;
  z: number;
  radius: number;
}

// Builds the static scene: lights, ground, rocks and a starfield.
// Returns the sun so it can follow the player and keep shadows nearby,
// and the rock footprints so the game can collide against them.
export function createWorld(scene: THREE.Scene): { sun: THREE.DirectionalLight; rocks: Rock[] } {
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.Fog(0x05070d, 40, 110);

  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1020, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 40, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE / 4, 0x3a4a6b, 0x26314a);
  grid.position.y = 0.01;
  scene.add(grid);

  // Rocks scattered around, kept clear of the spawn point.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5a52, roughness: 1, flatShading: true });
  const rand = mulberry32(7);
  const rocks: Rock[] = [];
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * (WORLD_SIZE - 10);
    const z = (rand() - 0.5) * (WORLD_SIZE - 10);
    if (Math.hypot(x, z) < 8) continue;
    const r = 0.6 + rand() * 2.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, r * 0.5, z);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    rocks.push({ x, z, radius: r * 0.85 });
  }

  const starPos = new Float32Array(1500 * 3);
  for (let i = 0; i < starPos.length; i += 3) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(300);
    v.y = Math.abs(v.y);
    starPos.set([v.x, v.y, v.z], i);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, fog: false })));

  return { sun, rocks };
}

// Small seeded random generator so the level looks the same every load.
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
