import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  scene: THREE.Scene;
  pmrem: THREE.PMREMGenerator;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  borderMats: { color: THREE.Color }[];
  fog: THREE.Fog;
}

let world: WorldParts | null = null;

const BASE = import.meta.env.BASE_URL;
const textures = new THREE.TextureLoader();

// Builds the parts of the scene every level shares: lights, ground, the
// field border and a starfield. Returns the sun so it can follow the player
// and keep shadows nearby. `applyTheme` then dresses them for each level.
export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer): { sun: THREE.DirectionalLight } {
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

  // The ground runs on well past the border and rises into hills there, so
  // the field never ends in a hard edge.
  const ground = new THREE.Mesh(terrainGeometry(), groundMaterial());
  ground.receiveShadow = true;
  scene.add(ground);

  const { group, mats } = border();
  scene.add(group);
  scene.add(starfield());
  world = { scene, pmrem: new THREE.PMREMGenerator(renderer), sun, hemi, ground, borderMats: mats, fog };
  return { sun };
}

interface GroundMaps {
  map: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  glow: THREE.Texture | null;
}

const groundMaps = new Map<Theme, GroundMaps>();
const skies = new Map<string, Promise<THREE.Texture>>();
let currentSky = '';

/** Loads one of the baked ground textures, tiled across the field. */
function groundTexture(theme: Theme, name: string, srgb: boolean): THREE.Texture {
  const t = textures.load(`${BASE}textures/${theme.surface}/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
    maps = {
      map: groundTexture(theme, 'color', true),
      normal: groundTexture(theme, 'normal', false),
      rough: groundTexture(theme, 'rough', false),
      glow: theme.veinGlow > 0 ? groundTexture(theme, 'glow', true) : null,
    };
    groundMaps.set(theme, maps);
  }
  const mat = world.ground.material;
  mat.map = maps.map;
  mat.normalMap = maps.normal;
  mat.roughnessMap = maps.rough;
  mat.emissiveMap = maps.glow;
  mat.emissive.set(maps.glow ? theme.veins : 0x000000);
  mat.emissiveIntensity = theme.veinGlow;
  mat.needsUpdate = true;

  // The HDR sky lights the scene and shows in every reflection.
  const { scene, pmrem } = world;
  let sky = skies.get(theme.hdri);
  if (!sky) {
    sky = new EXRLoader().loadAsync(`${BASE}hdri/${theme.hdri}.exr`).then((hdr) => {
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      return env;
    });
    skies.set(theme.hdri, sky);
  }
  scene.environmentIntensity = theme.envIntensity;
  currentSky = theme.hdri;
  sky.then((env) => {
    // Only if the player hasn't moved on to another level meanwhile.
    if (currentSky === theme.hdri) scene.environment = env;
  });
}

// How high the land stands at (x, z): flat inside the field, rising into
// rough hills beyond the border.
function terrainHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const rise = THREE.MathUtils.smoothstep(edge, WORLD_SIZE / 2 + 1, WORLD_SIZE / 2 + 30);
  if (rise === 0) return 0;
  // Ridged noise: sharp crests and rounded valleys.
  let h = 0;
  let amp = 1;
  let f = 0.025;
  for (let i = 0; i < 5; i++) {
    h += (1 - Math.abs(noise3(x * f, 0.5, z * f) * 2 - 1)) * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return rise * h * 14;
}

function terrainGeometry(): THREE.BufferGeometry {
  const size = WORLD_SIZE * 3;
  const geo = new THREE.PlaneGeometry(size, size, 200, 200).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  // The texture repeats every 20 units.
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * 18);
  geo.computeVertexNormals();
  return geo;
}

// Smooth noise in the shader, used to vary the ground's brightness over
// large areas so the repeating tiles don't show.
const MACRO = `
  float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float mNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mHash(i), mHash(i + vec2(1, 0)), f.x), mix(mHash(i + vec2(0, 1)), mHash(i + vec2(1, 1)), f.x), f.y);
  }
  float macro(vec2 p) { return mNoise(p) * 0.6 + mNoise(p * 2.7 + 7.0) * 0.3 + mNoise(p * 7.1 + 3.0) * 0.1; }`;

function groundMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2) });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MACRO}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Patches of lighter and darker ground, and the tiles sampled again at
        // a different scale and blended in, so no two stretches look alike.
        vec3 far = texture2D(map, vMapUv * 0.37 + vec2(0.31, 0.57)).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, far, 0.35);
        diffuseColor.rgb *= 0.72 + macro(vMapUv * 0.45) * 0.56;`,
      );
  };
  return mat;
}

const rockMats = new Map<Theme, THREE.MeshStandardMaterial>();
let rockMaps: { map: THREE.Texture; normal: THREE.Texture } | null = null;

// Rock detail is projected from all three axes and blended by the surface
// direction, so it wraps any boulder without stretching or seams.
const TRIPLANAR_VERTEX = `
  varying vec3 vTriPos;
  varying vec3 vTriNormal;
  varying vec3 vTriX;
  varying vec3 vTriY;
  varying vec3 vTriZ;`;

const TRIPLANAR_FRAGMENT = `
  uniform sampler2D rockMap;
  uniform sampler2D rockNormal;
  uniform float rockScale;
  varying vec3 vTriPos;
  varying vec3 vTriNormal;
  varying vec3 vTriX;
  varying vec3 vTriY;
  varying vec3 vTriZ;
  vec3 triWeights() {
    vec3 w = pow(abs(normalize(vTriNormal)), vec3(4.0));
    return w / (w.x + w.y + w.z);
  }`;

/** The shared rock material for a theme; colours come from each rock's vertices. */
function rockMaterial(theme: Theme): THREE.MeshStandardMaterial {
  let mat = rockMats.get(theme);
  if (mat) return mat;
  if (!rockMaps) {
    const load = (name: string, srgb: boolean) => {
      const t = textures.load(`${BASE}textures/rock/${name}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    rockMaps = { map: load('color', true), normal: load('normal', false) };
  }
  const maps = rockMaps;
  mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: theme.rockRoughness, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: maps.map };
    shader.uniforms.rockNormal = { value: maps.normal };
    shader.uniforms.rockScale = { value: 0.45 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TRIPLANAR_VERTEX}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTriPos = position;
        vTriNormal = normal;
        vTriX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
        vTriY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vTriZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TRIPLANAR_FRAGMENT}`)
      .replace(
        '#include <map_fragment>',
        `vec3 tw = triWeights();
        vec3 tp = vTriPos * rockScale;
        vec3 detail = texture2D(rockMap, tp.zy).rgb * tw.x + texture2D(rockMap, tp.xz).rgb * tw.y + texture2D(rockMap, tp.xy).rgb * tw.z;
        diffuseColor.rgb *= detail * 1.7;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          // "Whiteout" blend of the three tangent-space normals, in the
          // rock's own space, then turned into view space.
          vec3 n = normalize(vTriNormal);
          vec3 tx = texture2D(rockNormal, tp.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(rockNormal, tp.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(rockNormal, tp.xy).xyz * 2.0 - 1.0;
          tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
          ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
          tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
          vec3 on = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
          normal = normalize(vTriX * on.x + vTriY * on.y + vTriZ * on.z);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'rock';
  rockMats.set(theme, mat);
  return mat;
}

/** One boulder mesh, sitting on the ground at the origin. */
export function makeRock(size: number, rand: () => number, theme: Theme): THREE.Mesh {
  const color = new THREE.Color(theme.rocks[Math.floor(rand() * theme.rocks.length)]);
  const rock = new THREE.Mesh(rockGeometry(size, rand, color), rockMaterial(theme));
  rock.position.y = size * 0.3;
  rock.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
  rock.scale.y = 0.7 + rand() * 0.4;
  rock.castShadow = rock.receiveShadow = true;
  return rock;
}

let contactMat: THREE.MeshBasicMaterial | null = null;

// A soft dark smudge on the ground under a boulder, where the sky can't
// reach: grounds it far better than the sun's shadow alone.
function contactShadow(size: number): THREE.Mesh {
  if (!contactMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.5)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    contactMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), contactMat);
  m.scale.setScalar(size * 3.2);
  m.position.y = 0.015;
  return m;
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
    const shade = contactShadow(spot.size);
    shade.position.x = spot.x;
    shade.position.z = spot.z;
    group.add(rock, shade);
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

// A weathered boulder: a finely divided sphere pushed in and out by a few
// octaves of noise, sliced flat in places like fractured stone and flattened
// underneath where it sits. Its colour varies across the surface and darkens
// into the cracks and towards the ground.
function rockGeometry(radius: number, rand: () => number, base: THREE.Color): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 9);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.getAttribute('position');
  const seed = rand() * 100;
  const cuts = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({
    n: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    d: 0.62 + rand() * 0.25,
  }));
  const v = new THREE.Vector3();
  const dents = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = fbm3(v.x * 1.2 + seed, v.y * 1.2, v.z * 1.2, 3) - 0.5;
    const fine = fbm3(v.x * 4 + seed, v.y * 4, v.z * 4, 3) - 0.5;
    v.multiplyScalar(1 + big * 0.55 + fine * 0.12);
    for (const c of cuts) {
      const over = v.dot(c.n) - c.d;
      if (over > 0) v.addScaledVector(c.n, -over * 0.9);
    }
    if (v.y < -0.45) v.y = -0.45 + (v.y + 0.45) * 0.15;
    dents[i] = fine;
    pos.setXYZ(i, v.x * radius, v.y * radius, v.z * radius);
  }
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).divideScalar(radius);
    const tone = fbm3(v.x * 2 + seed, v.y * 2 + 3, v.z * 2, 2) - 0.5;
    c.copy(base).offsetHSL(tone * 0.03, 0, tone * 0.12);
    const ao = THREE.MathUtils.smoothstep(v.y, -0.5, 0.4) * 0.6 + 0.4;
    c.multiplyScalar(ao * (1 + dents[i] * 0.8));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
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

// Smooth 3D value noise in 0..1, and a few octaves of it.
function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const l = THREE.MathUtils.lerp;
  const layer = (k: number) =>
    l(l(hash3(ix, iy, k), hash3(ix + 1, iy, k), sx), l(hash3(ix, iy + 1, k), hash3(ix + 1, iy + 1, k), sx), sy);
  return l(layer(iz), layer(iz + 1), sz);
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let v = 0;
  let a = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise3(x, y, z) * a;
    total += a;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return v / total;
}
