import * as THREE from 'three';
import type { LevelData, Orbiter, Patch, Well } from './level';
import type { Theme } from './theme';
import { makeRock, mulberry32, WORLD_SIZE, type Rock } from './world';
import type { Particles } from './fx';

const LAVA_BURN = 22; // hull a second while over lava
const CORE_BURN = 45; // hull a second inside a gravity well's core
const CORE_RADIUS = 2.6;
const EDGE = WORLD_SIZE / 2 + 4; // drifters wrap round just outside the border

/** What the hazards are doing to the ship this frame. */
export interface HazardEffect {
  /** Hull to take off per second. */
  burn: number;
  /** 1 on solid ground, down to 0 in the middle of an ice patch. */
  traction: number;
}

interface Mover {
  mesh: THREE.Object3D;
  rock: Rock;
  /** Velocity this frame, for collisions. */
  vel: THREE.Vector3;
  size: number;
  vx: number;
  orbit: Orbiter | null;
  angle: number;
}

// Shared shader bits: value noise and a few octaves of it.
const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }`;

const VERTEX = `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

function shader(fragment: string, color: THREE.Color, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, color: { value: color }, ...extra }]),
    vertexShader: VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

// Molten rock: dark crust drifting over a bright core, brighter towards the
// middle, with a soft edge. Colours above 1 so the bloom picks it up.
const LAVA = `
  #include <fog_pars_fragment>
  uniform float time;
  uniform vec3 color;
  uniform float seed;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float flow = fbm(p * 2.2 + vec2(time * 0.12, -time * 0.09) + seed);
    float crust = fbm(p * 4.5 - vec2(time * 0.05, time * 0.07) + seed * 2.0);
    float heat = clamp(flow * 1.2 + (1.0 - r) * 0.5 - crust * 0.55, 0.0, 1.0);
    vec3 dark = color * 0.05;
    vec3 col = mix(dark, color * 1.6, smoothstep(0.25, 0.6, heat));
    col = mix(col, vec3(1.0, 0.95, 0.7) * 2.2, smoothstep(0.72, 0.95, heat) * 0.6);
    float edge = smoothstep(1.0, 0.82, r);
    // A glowing rim where the lava meets the ground.
    col += color * 1.4 * smoothstep(0.75, 0.9, r) * edge;
    gl_FragColor = vec4(col, edge);
    #include <fog_fragment>
  }`;

// A gravity well: spiral arms winding into a black core ringed with light,
// over a shadow that darkens the ground towards the middle.
const WELL = `
  #include <fog_pars_fragment>
  uniform float time;
  uniform vec3 color;
  uniform float core;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = a * 3.0 + 6.0 / (r + 0.12) - time * 1.6;
    float arms = smoothstep(0.2, 1.0, sin(swirl) * 0.5 + 0.5 + (fbm(p * 6.0 + time * 0.3) - 0.5) * 0.6);
    arms *= pow(1.0 - r, 1.6) * smoothstep(core * 0.9, core * 1.6, r);
    float ring = exp(-pow((r - core) / 0.025, 2.0));
    float hole = smoothstep(core, core * 0.75, r);
    vec3 col = color * arms * 1.6 + mix(color, vec3(1.0), 0.6) * ring * 3.0;
    float alpha = clamp(arms * 0.9 + ring + hole + (1.0 - r) * 0.35, 0.0, 1.0) * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(col * (1.0 - hole), alpha);
    #include <fog_fragment>
  }`;

let iceTexture: THREE.Texture | null = null;

// Frost: a pale disc, clearer in the middle, scored with fine cracks.
function frostTexture(): THREE.Texture {
  if (iceTexture) return iceTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(120, 180, 225, 0.3)');
  grad.addColorStop(0.75, 'rgba(150, 200, 235, 0.42)');
  grad.addColorStop(0.93, 'rgba(190, 225, 250, 0.6)');
  grad.addColorStop(1, 'rgba(190, 225, 250, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(21);
  g.strokeStyle = 'rgba(220, 240, 255, 0.55)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    let a = rand() * Math.PI * 2;
    let x = size / 2 + Math.cos(a) * rand() * size * 0.3;
    let y = size / 2 + Math.sin(a) * rand() * size * 0.3;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += (rand() - 0.5) * 1.4;
      x += Math.cos(a) * 12;
      y += Math.sin(a) * 12;
      if (Math.hypot(x - size / 2, y - size / 2) > size * 0.46) break;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  iceTexture = new THREE.CanvasTexture(canvas);
  iceTexture.colorSpace = THREE.SRGBColorSpace;
  return iceTexture;
}

const discGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);

// The hazards in the later levels: ice, lava, drifting and orbiting
// boulders, and gravity wells. Builds their visuals for each level, moves
// the boulders, and works out what they do to the ship.
export class Hazards {
  /** Footprints of the moving boulders, updated in place each frame. */
  readonly rocks: Rock[] = [];
  private group = new THREE.Group();
  private ice: Patch[] = [];
  private lava: Patch[] = [];
  private wells: Well[] = [];
  private movers: Mover[] = [];
  private shaders: THREE.ShaderMaterial[] = [];
  private color = new THREE.Color();
  private trail = new THREE.Color();
  private time = 0;
  private emit = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get patches(): { ice: Patch[]; lava: Patch[]; wells: Well[] } {
    return { ice: this.ice, lava: this.lava, wells: this.wells };
  }

  load(level: LevelData, theme: Theme): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== discGeo) o.geometry.dispose();
    });
    for (const m of this.shaders) m.dispose();
    this.group.clear();
    this.shaders = [];
    this.movers = [];
    this.rocks.length = 0;
    this.ice = level.ice ?? [];
    this.lava = level.lava ?? [];
    this.wells = level.wells ?? [];
    this.color.set(theme.veins);
    this.trail.set(theme.dust).multiplyScalar(0.3);

    const iceMat = new THREE.MeshStandardMaterial({
      map: frostTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.12,
      metalness: 0.4,
      emissive: 0x2a6a90,
      emissiveIntensity: 0.12,
    });
    for (const p of this.ice) {
      const mesh = new THREE.Mesh(discGeo, iceMat);
      mesh.position.set(p.x, 0.03, p.z);
      mesh.scale.setScalar(p.radius);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    this.lava.forEach((p, i) => {
      const mat = shader(LAVA, this.color, { seed: { value: i * 3.7 } });
      this.shaders.push(mat);
      const mesh = new THREE.Mesh(discGeo, mat);
      mesh.position.set(p.x, 0.04 + i * 0.001, p.z);
      mesh.scale.setScalar(p.radius);
      this.group.add(mesh);
    });

    for (const w of this.wells) {
      const mat = shader(WELL, this.color, { core: { value: CORE_RADIUS / w.radius } });
      this.shaders.push(mat);
      const mesh = new THREE.Mesh(discGeo, mat);
      mesh.position.set(w.x, 0.05, w.z);
      mesh.scale.setScalar(w.radius);
      this.group.add(mesh);
    }

    const rand = mulberry32(99);
    const add = (size: number, x: number, z: number, vx: number, orbit: Orbiter | null) => {
      const mesh = makeRock(size, rand, theme);
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.position.set(x, 0, z);
      this.group.add(holder);
      const rock = { x, z, radius: size * 0.9 };
      this.rocks.push(rock);
      this.movers.push({ mesh: holder, rock, vel: new THREE.Vector3(), size, vx, orbit, angle: orbit?.phase ?? 0 });
    };
    for (const d of level.drifters ?? []) add(d.size, d.x, d.z, d.vx, null);
    for (const o of level.orbiters ?? []) add(o.size, o.x, o.z, 0, o);
    this.update(0, null);
  }

  /** Moves the boulders and animates the lava and wells. */
  update(dt: number, particles: Particles | null): void {
    this.time += dt;
    for (const m of this.shaders) m.uniforms.time.value = this.time;
    for (const m of this.movers) {
      const r = m.rock;
      if (m.orbit) {
        const o = m.orbit;
        m.angle += o.speed * dt;
        const x = o.x + Math.cos(m.angle) * o.radius;
        const z = o.z - Math.sin(m.angle) * o.radius;
        m.vel.set(x - r.x, 0, z - r.z).divideScalar(dt || 1);
        r.x = x;
        r.z = z;
      } else {
        r.x += m.vx * dt;
        if (r.x > EDGE) r.x -= EDGE * 2;
        if (r.x < -EDGE) r.x += EDGE * 2;
        m.vel.set(m.vx, 0, 0);
      }
      m.mesh.position.set(r.x, 0, r.z);
      // Tumble as they go, and shrink away near the wrap so they don't pop.
      m.mesh.rotation.y += dt * 0.4;
      m.mesh.rotation.z -= (m.vel.x / m.size) * dt * 0.3;
      m.mesh.scale.setScalar(THREE.MathUtils.clamp((EDGE - Math.abs(r.x)) / 6, 0, 1));
      r.radius = m.size * 0.9 * m.mesh.scale.x;
    }

    if (!particles) return;
    // Sparks rising off the lava, motes spiralling into the wells, and a
    // thin trail of grit behind each moving boulder.
    this.emit -= dt;
    if (this.emit > 0) return;
    this.emit = 0.05;
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const l of this.lava) {
      if (Math.random() > 0.35) continue;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * l.radius * 0.85;
      p.set(l.x + Math.cos(a) * d, 0.2, l.z + Math.sin(a) * d);
      v.set((Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6);
      particles.spawn(p, v, this.color, 0.8 + Math.random() * 0.6, 0.25 + Math.random() * 0.25);
    }
    for (const m of this.movers) {
      if (Math.random() > 0.5 || m.mesh.scale.x < 0.5) continue;
      const speed = m.vel.length() || 1;
      p.set(m.rock.x - (m.vel.x / speed) * m.size, 0.4 + Math.random() * m.size, m.rock.z - (m.vel.z / speed) * m.size);
      v.copy(m.vel).multiplyScalar(0.15).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2, (Math.random() - 0.5) * 0.8));
      particles.spawn(p, v, this.trail, 0.9, 0.6 + Math.random() * 0.4);
    }
    for (const w of this.wells) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = w.radius * (0.5 + Math.random() * 0.45);
        p.set(w.x + Math.cos(a) * d, 0.3, w.z + Math.sin(a) * d);
        // Inwards and around, so they spiral towards the core.
        v.set(-Math.cos(a) * 4 - Math.sin(a) * 5, 0, -Math.sin(a) * 4 + Math.cos(a) * 5);
        particles.spawn(p, v, this.color, 1.2, 0.35);
      }
    }
  }

  /**
   * Pulls the ship towards any gravity well and returns how the ground under
   * it is treating it. `velocity` is changed in place.
   */
  affect(dt: number, p: THREE.Vector3, velocity: THREE.Vector3): HazardEffect {
    let burn = 0;
    let traction = 1;
    for (const l of this.lava) {
      if (Math.hypot(p.x - l.x, p.z - l.z) < l.radius * 0.9) {
        burn = LAVA_BURN;
        break;
      }
    }
    for (const i of this.ice) {
      const d = Math.hypot(p.x - i.x, p.z - i.z) / i.radius;
      if (d < 1) traction = Math.min(traction, THREE.MathUtils.smoothstep(d, 0.8, 1));
    }
    for (const w of this.wells) {
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= w.radius || d < 0.01) continue;
      const k = 1 - d / w.radius;
      velocity.x += (dx / d) * w.pull * k * dt;
      velocity.z += (dz / d) * w.pull * k * dt;
      if (d < CORE_RADIUS) burn += CORE_BURN;
    }
    return { burn, traction };
  }

  /**
   * Bounces the ship off the moving boulders, counting their own speed in
   * the impact. Returns the hardest hit's speed (0 when nothing was hit).
   */
  collide(p: THREE.Vector3, velocity: THREE.Vector3, radius: number, bounce: number): number {
    let impact = 0;
    for (const m of this.movers) {
      const r = m.rock;
      const dx = p.x - r.x;
      const dz = p.z - r.z;
      const min = r.radius + radius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= min * min) continue;
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;
      p.x = r.x + nx * min;
      p.z = r.z + nz * min;
      // Work in the boulder's frame, so a rock ramming a still ship still hurts.
      const into = (velocity.x - m.vel.x) * nx + (velocity.z - m.vel.z) * nz;
      if (into < 0) {
        impact = Math.max(impact, -into);
        velocity.x -= (1 + bounce) * into * nx;
        velocity.z -= (1 + bounce) * into * nz;
      }
    }
    return impact;
  }
}
