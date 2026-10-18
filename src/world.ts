import * as THREE from 'three';
import type { LevelData } from './level';
import { THEMES, type Theme } from './theme';

export const WORLD_SIZE = 120;

// A rock's footprint on the ground, used for collisions.
export interface Rock {
  x: number;
  z: number;
  radius: number;
}

interface WorldParts {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  borderMats: { color: THREE.Color }[];
  fog: THREE.Fog;
}

let world: WorldParts | null = null;

// Builds the parts of the scene every level shares: lights, ground, the
// field border and a starfield. Returns the sun so it can follow the player
// and keep shadows nearby. `applyTheme` then colours them for each level.
export function createWorld(scene: THREE.Scene): { sun: THREE.DirectionalLight } {
  const fog = new THREE.Fog(0x05070d, 45, 115);
  scene.fog = fog;
  scene.background = fog.color;

  const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x2a1830, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.8);
  sun.position.set(20, 40, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  const s = 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // The ground runs on well past the border so the field never ends in a hard edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3),
    new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.05, emissive: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { group, mats } = border();
  scene.add(group);
  scene.add(starfield());
  world = { sun, hemi, ground, borderMats: mats, fog };
  return { sun };
}

const groundMaps = new Map<Theme, { map: THREE.Texture; bump: THREE.Texture; glow: THREE.Texture }>();

/** Recolours the shared scenery: sky, fog, lights, ground and border. */
export function applyTheme(theme: Theme): void {
  if (!world) return;
  world.fog.color.set(theme.sky);
  world.fog.near = theme.fogNear;
  world.fog.far = theme.fogFar;
  world.hemi.color.set(theme.skyLight);
  world.hemi.groundColor.set(theme.groundLight);
  world.hemi.intensity = theme.ambient;
  world.sun.color.set(theme.sun);
  world.sun.intensity = theme.sunStrength;
  for (const m of world.borderMats) m.color.set(theme.border);

  let maps = groundMaps.get(theme);
  if (!maps) {
    const canvases = groundCanvas(mulberry32(3), theme);
    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(18, 18);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    maps = { map: tex(canvases.color, true), bump: tex(canvases.bump, false), glow: tex(canvases.glow, true) };
    groundMaps.set(theme, maps);
  }
  const mat = world.ground.material;
  mat.map = maps.map;
  mat.bumpMap = maps.bump;
  mat.bumpScale = 1.5;
  mat.emissiveMap = maps.glow;
  mat.emissive.set(theme.veins);
  mat.emissiveIntensity = theme.veinGlow;
  mat.needsUpdate = true;
}

const rockMats = new Map<Theme, THREE.MeshStandardMaterial>();

/** The shared rock material for a theme; colours come from each rock's vertices. */
function rockMaterial(theme: Theme): THREE.MeshStandardMaterial {
  let mat = rockMats.get(theme);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: theme.rockRoughness, metalness: 0.1, flatShading: true });
    rockMats.set(theme, mat);
  }
  return mat;
}

/** One boulder mesh, sitting on the ground at the origin. */
export function makeRock(size: number, rand: () => number, theme: Theme): THREE.Mesh {
  const color = new THREE.Color(theme.rocks[Math.floor(rand() * theme.rocks.length)]);
  const rock = new THREE.Mesh(rockGeometry(size, rand, color), rockMaterial(theme));
  rock.position.y = size * 0.45;
  rock.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
  rock.scale.y = 0.7 + rand() * 0.4;
  rock.castShadow = rock.receiveShadow = true;
  return rock;
}

// Builds one level's rocks and landing pad into a group, so the whole level
// can be swapped out later. Returns the rock footprints for collisions.
export function buildLevel(level: LevelData, seed: number): { group: THREE.Group; rocks: Rock[] } {
  const theme = THEMES[level.theme];
  const group = new THREE.Group();
  group.add(startPad(level));
  const rand = mulberry32(seed);
  const rocks: Rock[] = [];
  for (const spot of level.rocks) {
    const rock = makeRock(spot.size, rand, theme);
    rock.position.x = spot.x;
    rock.position.z = spot.z;
    group.add(rock);
    rocks.push({ x: spot.x, z: spot.z, radius: spot.size * 0.9 });
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

// Dusty ground tile in the theme's colours: speckled noise, a scattering of
// small craters and a few thin cracks. Returns the colour, a height map for
// bump shading, and a mask of the cracks that glow.
function groundCanvas(rand: () => number, theme: Theme): { color: HTMLCanvasElement; bump: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const size = 512;
  const make = (fill: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.fillStyle = fill;
    g.fillRect(0, 0, size, size);
    return { canvas, g };
  };
  const color = make(theme.ground);
  const bump = make('#808080');
  const glow = make('#000000');
  // Everything is drawn at the tile's neighbours too, so it wraps seamlessly.
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
  };

  const [lo, hi] = theme.speckleLight;
  for (let i = 0; i < 9000; i++) {
    const l = lo + rand() * (hi - lo);
    const x = rand() * size;
    const y = rand() * size;
    const w = 1 + rand() * 3;
    color.g.fillStyle = `hsla(${theme.speckleHue + rand() * 30}, 20%, ${l}%, ${0.12 + rand() * 0.2})`;
    color.g.fillRect(x, y, w, w);
    bump.g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'}, ${0.1 + rand() * 0.15})`;
    bump.g.fillRect(x, y, w, w);
  }
  for (let i = 0; i < 12; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 26;
    wrapped((ox, oy) => {
      const grad = color.g.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.2)');
      grad.addColorStop(0.9, 'rgba(255, 255, 255, 0.05)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      color.g.fillStyle = grad;
      color.g.beginPath();
      color.g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      color.g.fill();
      // A bowl in the height map, with a raised lip.
      const b = bump.g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r * 1.15);
      b.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
      b.addColorStop(0.75, 'rgba(0, 0, 0, 0.25)');
      b.addColorStop(0.88, 'rgba(255, 255, 255, 0.3)');
      b.addColorStop(1, 'rgba(255, 255, 255, 0)');
      bump.g.fillStyle = b;
      bump.g.beginPath();
      bump.g.arc(x + ox, y + oy, r * 1.15, 0, Math.PI * 2);
      bump.g.fill();
    });
  }
  // Cracks: wandering lines, sunk into the height map and lit in the glow map.
  for (let i = 0; i < 4; i++) {
    const pts: [number, number][] = [[rand() * size, rand() * size]];
    let a = rand() * Math.PI * 2;
    for (let k = 0; k < 14; k++) {
      a += (rand() - 0.5) * 1.2;
      const [px, py] = pts[pts.length - 1];
      pts.push([px + Math.cos(a) * 14, py + Math.sin(a) * 14]);
    }
    wrapped((ox, oy) => {
      for (const [g, style, width] of [
        [bump.g, 'rgba(0,0,0,0.8)', 3],
        [color.g, 'rgba(0,0,0,0.5)', 2.5],
        [glow.g, 'rgba(255,255,255,0.18)', 4],
        [glow.g, 'rgba(255,255,255,0.9)', 1.1],
      ] as const) {
        g.strokeStyle = style;
        g.lineWidth = width;
        g.lineJoin = 'round';
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
        g.stroke();
      }
    });
  }
  return { color: color.canvas, bump: bump.canvas, glow: glow.canvas };
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
function border(): { group: THREE.Object3D; mats: { color: THREE.Color }[] } {
  const group = new THREE.Group();
  const half = WORLD_SIZE / 2 - 1;
  const post = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6).translate(0, 0.8, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6b5e });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.5 });
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
    lineMat,
  );
  group.add(line);
  return { group, mats: [mat, lineMat] };
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
