import * as THREE from 'three';

let glow: THREE.Texture | null = null;

/** A soft white radial blob, shared by halos and particles. */
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  return glow;
}

/** An additive glow sprite, for halos around bright things. */
export function halo(color: THREE.ColorRepresentation, scale: number, opacity = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      opacity,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

const MAX = 2000;
const RINGS = 24;

const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  radius: number;
}

// A pool of short-lived glowing points: engine exhaust, sparks, bursts. Each
// point has its own size, and shrinks as it fades. Also owns the shockwave
// rings and the light flash that go with explosions.
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private next = 0;
  private rings: Ring[] = [];
  private light = new THREE.PointLight(0xffffff, 0, 18, 1.6);
  private lightLife = 0;
  private lightPower = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, scale: { value: 400 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        uniform float scale;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor * texture2D(map, gl_PointCoord).a, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    // Point sizes are in pixels, so they follow the height of the screen.
    const buffer = new THREE.Vector2();
    this.points.onBeforeRender = (renderer) => {
      material.uniforms.scale.value = renderer.getDrawingBufferSize(buffer).y / 2;
    };
    scene.add(this.points);

    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, radius: 1 });
    }
    scene.add(this.light);
  }

  /** Emits one particle; `size` is its starting width in metres. */
  spawn(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number, size = 0.7): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.baseSize[i] = size;
    this.life[i] = this.maxLife[i] = life;
  }

  /**
   * Emits a burst of particles flying outwards from a point: a mix of big
   * soft puffs and small bright sparks. Bigger bursts also send out a
   * shockwave ring and light up the ground around them.
   */
  burst(p: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed: number, life = 0.8): void {
    const c = new THREE.Color(color);
    const hot = c.clone().multiplyScalar(1.6);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const spark = i % 3 === 0;
      v.randomDirection().multiplyScalar(speed * (spark ? 0.8 + Math.random() * 0.6 : 0.3 + Math.random() * 0.6));
      v.y = Math.abs(v.y) * 0.8;
      this.spawn(p, v, spark ? hot : c, life * (0.6 + Math.random() * 0.4), spark ? 0.35 : 0.6 + Math.random() * 0.8);
    }
    if (count >= 40) {
      this.ring(p, color, speed * 0.6, life * 0.7);
      this.flash(p, color, Math.min(count / 6, 30));
    }
  }

  /** An expanding ring flat on the ground, fading as it grows. */
  ring(p: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, life = 0.5): void {
    const r = this.rings.reduce((a, b) => (b.life < a.life ? b : a));
    r.mesh.material.color.set(color);
    r.mesh.position.set(p.x, 0.12, p.z);
    r.mesh.visible = true;
    Object.assign(r, { life, maxLife: life, radius });
  }

  /** Lights up the surroundings for a moment. */
  flash(p: THREE.Vector3, color: THREE.ColorRepresentation, power: number): void {
    if (power < this.lightPower * (this.lightLife / 0.25)) return;
    this.light.position.set(p.x, p.y + 1.5, p.z);
    this.light.color.set(color);
    this.lightPower = power;
    this.lightLife = 0.25;
  }

  update(dt: number): void {
    const drag = Math.exp(-2.5 * dt);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.baseSize[i] * (0.35 + 0.65 * k);
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a;
        this.vel[j] *= drag;
        this.pos[j] += this.vel[j] * dt;
        // Fading to black is the same as fading out with additive blending.
        this.col[j] = this.base[j] * k;
      }
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = attrs.color.needsUpdate = attrs.size.needsUpdate = true;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.maxLife;
      // Fast at first, then slowing as it spreads.
      r.mesh.scale.setScalar(0.3 + r.radius * (1 - (1 - t) * (1 - t)));
      r.mesh.material.opacity = (1 - t) * 0.9;
      r.mesh.visible = r.life > 0;
    }

    this.lightLife = Math.max(0, this.lightLife - dt);
    this.light.intensity = this.lightPower * (this.lightLife / 0.25) ** 2;
  }

  clear(): void {
    this.life.fill(0);
    this.col.fill(0);
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
    this.lightLife = 0;
  }
}

const DUST = 450;
const DUST_BOX = new THREE.Vector3(90, 14, 80);

// Specks drifting in the air around the camera: snow, embers or dust,
// depending on the level. They wrap round a box that follows the ship.
export class Dust {
  private pos = new Float32Array(DUST * 3);
  private points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private drift = new THREE.Vector3();
  private time = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < DUST; i++) {
      this.pos.set([Math.random() * DUST_BOX.x, Math.random() * DUST_BOX.y, Math.random() * DUST_BOX.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.22,
        map: glowTexture(),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setLook(color: THREE.ColorRepresentation, drift: [number, number, number]): void {
    this.points.material.color.set(color);
    this.drift.set(...drift);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    const out = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const box = DUST_BOX;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3;
      // Each speck sways a little on top of the steady drift.
      const sway = Math.sin(this.time * 0.7 + i) * 0.4;
      this.pos[j] += (this.drift.x + sway) * dt;
      this.pos[j + 1] += this.drift.y * dt;
      this.pos[j + 2] += (this.drift.z + Math.cos(this.time * 0.5 + i * 1.7) * 0.3) * dt;
      // Wrap into a box centred on the focus, so specks never run out.
      const x = wrap(this.pos[j] - focus.x, box.x) - box.x / 2;
      const y = wrap(this.pos[j + 1], box.y);
      const z = wrap(this.pos[j + 2] - focus.z, box.z) - box.z / 2;
      out.setXYZ(i, focus.x + x, 0.3 + y, focus.z + z - 10);
    }
    out.needsUpdate = true;
  }
}

/** `v` wrapped into the range 0 .. size. */
function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}
