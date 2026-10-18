import * as THREE from 'three';
import { WORLD_SIZE, type Rock } from './world';
import { halo } from './fx';

const MAX = 60;
const FORWARD = new THREE.Vector3(0, 0, -1);

interface Bolt {
  mesh: THREE.Object3D;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

// A pool of laser bolts that fly in a straight line until they hit a rock,
// a target or run out of range. The player's shots and the enemies' shots
// each get their own pool, in their own colour.
export class Bolts {
  private bolts: Bolt[] = [];

  constructor(scene: THREE.Scene, color: THREE.ColorRepresentation, length: number) {
    const geo = new THREE.BoxGeometry(0.3, 0.3, length);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreGeo = new THREE.BoxGeometry(0.1, 0.1, length * 0.8);
    for (let i = 0; i < MAX; i++) {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(geo, mat), new THREE.Mesh(coreGeo, core), halo(color, 2.4, 0.9));
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, prev: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    }
  }

  /** Launches a bolt from `from`, flying along `dir` (flat, unit length). */
  fire(from: THREE.Vector3, dir: THREE.Vector3, speed: number, range: number, carry?: THREE.Vector3): void {
    const b = this.bolts.find((b) => b.life <= 0);
    if (!b) return;
    b.vel.copy(dir).multiplyScalar(speed);
    if (carry) b.vel.add(carry);
    b.life = range / b.vel.length();
    b.mesh.position.copy(from);
    b.prev.copy(from);
    b.mesh.quaternion.setFromUnitVectors(FORWARD, dir);
    b.mesh.visible = true;
  }

  /** Moves the bolts and returns where any of them hit a rock. */
  update(dt: number, rocks: Rock[]): THREE.Vector3[] {
    const sparks: THREE.Vector3[] = [];
    const half = WORLD_SIZE / 2;
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const p = b.mesh.position;
      b.prev.copy(p);
      p.addScaledVector(b.vel, dt);
      const hit = rocks.find((r) => segmentHitsCircle(b.prev, p, r.x, r.z, r.radius));
      if (hit) sparks.push(p.clone());
      if (hit || b.life <= 0 || Math.abs(p.x) > half || Math.abs(p.z) > half) this.kill(b);
    }
    return sparks;
  }

  /** Removes every bolt that passed through a circle this frame; returns how many did. */
  hit(x: number, z: number, radius: number): number {
    let n = 0;
    for (const b of this.bolts) {
      if (b.life > 0 && segmentHitsCircle(b.prev, b.mesh.position, x, z, radius)) {
        this.kill(b);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    for (const b of this.bolts) this.kill(b);
  }

  private kill(b: Bolt): void {
    b.life = 0;
    b.mesh.visible = false;
  }
}

/** True when the flat segment a-b passes within `r` of (cx, cz). */
export function segmentHitsCircle(a: THREE.Vector3, b: THREE.Vector3, cx: number, cz: number, r: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq > 0 ? THREE.MathUtils.clamp(((cx - a.x) * dx + (cz - a.z) * dz) / lenSq, 0, 1) : 0;
  const px = a.x + dx * t - cx;
  const pz = a.z + dz * t - cz;
  return px * px + pz * pz < r * r;
}
