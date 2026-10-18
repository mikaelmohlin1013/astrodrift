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

const MAX = 1500;

// A pool of short-lived glowing points: engine exhaust, sparks, bursts.
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private next = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.7,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Emits one particle. */
  spawn(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = this.maxLife[i] = life;
  }

  /** Emits a ring of particles flying outwards from a point. */
  burst(p: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed: number, life = 0.8): void {
    const c = new THREE.Color(color);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      v.y = Math.abs(v.y) * 0.8;
      this.spawn(p, v, c, life * (0.6 + Math.random() * 0.4));
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-2.5 * dt);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a;
        this.vel[j] *= drag;
        this.pos[j] += this.vel[j] * dt;
        // Fading to black is the same as fading out with additive blending.
        this.col[j] = this.base[j] * k;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.col.fill(0);
  }
}
