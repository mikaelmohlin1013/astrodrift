import * as THREE from 'three';
import type { LevelData } from './level';

export const WORLD_SIZE = 120;

// A rock's footprint on the ground, used for collisions.
export interface Rock {
  x: number;
  z: number;
  radius: number;
}

// Builds the parts of the scene every level shares: lights, ground, the
// field border and a starfield. Returns the sun so it can follow the player
// and keep shadows nearby.
export function createWorld(scene: THREE.Scene): { sun: THREE.DirectionalLight } {
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.Fog(0x05070d, 45, 115);

  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x2a1830, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.8);
  sun.position.set(20, 40, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
  scene.add(sun, sun.target);

  const groundTex = new THREE.CanvasTexture(groundCanvas(mulberry32(3)));
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(6, 6);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(border());
  scene.add(starfield());
  return { sun };
}

const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
const palette = [0x6b5a52, 0x5c5466, 0x75604c, 0x4f4a55].map((c) => new THREE.Color(c));

// Builds one level's rocks and landing pad into a group, so the whole level
// can be swapped out later. Returns the rock footprints for collisions.
export function buildLevel(level: LevelData, seed: number): { group: THREE.Group; rocks: Rock[] } {
  const group = new THREE.Group();
  group.add(startPad(level));
  const rand = mulberry32(seed);
  const rocks: Rock[] = [];
  for (const spot of level.rocks) {
    const r = spot.size;
    const rock = new THREE.Mesh(rockGeometry(r, rand, palette[Math.floor(rand() * palette.length)]), rockMat);
    rock.position.set(spot.x, r * 0.45, spot.z);
    rock.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
    rock.scale.y = 0.7 + rand() * 0.4;
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
    rocks.push({ x: spot.x, z: spot.z, radius: r * 0.9 });
  }
  return { group, rocks };
}

/** Frees the GPU buffers of a level group built by `buildLevel`. */
export function disposeLevel(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  group.removeFromParent();
}

/**
 * Pushes a circle at `p` out of any rock it overlaps and bounces its velocity
 * off. Returns the speed it hit with (0 when nothing was hit).
 */
export function resolveRocks(p: THREE.Vector3, velocity: THREE.Vector3, radius: number, rocks: Rock[], bounce: number): number {
  let impact = 0;
  for (const rock of rocks) {
    const dx = p.x - rock.x;
    const dz = p.z - rock.z;
    const min = rock.radius + radius;
    const distSq = dx * dx + dz * dz;
    if (distSq >= min * min) continue;
    const dist = Math.sqrt(distSq) || 0.001;
    const nx = dx / dist;
    const nz = dz / dist;
    p.x = rock.x + nx * min;
    p.z = rock.z + nz * min;
    // Reflect the part of the velocity heading into the rock.
    const into = velocity.x * nx + velocity.z * nz;
    if (into < 0) {
      impact = Math.max(impact, -into);
      velocity.x -= (1 + bounce) * into * nx;
      velocity.z -= (1 + bounce) * into * nz;
    }
  }
  return impact;
}

// A lumpy boulder: an icosphere with each corner pushed in or out, and a
// slightly different shade per face so the flat shading reads as stone.
function rockGeometry(radius: number, rand: () => number, base: THREE.Color): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.getAttribute('position');
  const seed = rand() * 100;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Same corner always gets the same push, so faces stay joined.
    const n = Math.sin(v.x * 1.7 + seed) * Math.sin(v.y * 2.3 + seed * 0.5) * Math.sin(v.z * 1.9 + seed * 0.3);
    v.multiplyScalar(1 + n * 0.35);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    c.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// Dusty ground tile: speckled noise with a scattering of small craters.
function groundCanvas(rand: () => number): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#1d2436';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const l = 18 + rand() * 22;
    g.fillStyle = `hsla(${220 + rand() * 30}, 20%, ${l}%, ${0.15 + rand() * 0.2})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 26;
    // Draw each crater on all four sides too so the tile wraps seamlessly.
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(8, 10, 20, 0.55)');
      grad.addColorStop(0.75, 'rgba(10, 12, 22, 0.25)');
      grad.addColorStop(0.9, 'rgba(120, 135, 170, 0.22)');
      grad.addColorStop(1, 'rgba(120, 135, 170, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvas;
}

// Glowing landing ring where each run starts.
function startPad(level: LevelData): THREE.Object3D {
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.6 }),
  );
  pad.position.set(level.start.x, 0.03, level.start.z);
  return pad;
}

// Short glowing posts along the edge of the playable area.
function border(): THREE.Object3D {
  const group = new THREE.Group();
  const half = WORLD_SIZE / 2 - 1;
  const post = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6).translate(0, 0.8, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6b5e });
  const posts = new THREE.InstancedMesh(post, mat, 4 * 30);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let k = 0; k < 30; k++) {
    const t = -half + (k / 30) * half * 2;
    for (const [x, z] of [[t, -half], [half, t], [-t, half], [-half, -t]]) {
      posts.setMatrixAt(i++, m.makeTranslation(x, 0, z));
    }
  }
  group.add(posts);
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => new THREE.Vector3(x, 0.05, z)),
    ),
    new THREE.LineBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.5 }),
  );
  group.add(line);
  return group;
}

// Stars of a few colours and sizes on a dome far overhead.
function starfield(): THREE.Object3D {
  const group = new THREE.Group();
  const rand = mulberry32(11);
  for (const [color, size, count] of [[0xffffff, 1.0, 1200], [0xaecbff, 1.8, 300], [0xffd6a8, 2.4, 80]] as const) {
    const pos = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      v.set(rand() - 0.5, rand() * 0.5 + 0.02, rand() - 0.5).setLength(300);
      pos.set([v.x, v.y, v.z], i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, fog: false })));
  }
  return group;
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
