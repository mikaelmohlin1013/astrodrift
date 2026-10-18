import * as THREE from 'three';
import { WORLD_SIZE, type Rock } from './world';
import { segmentHitsCircle } from './weapons';
import { halo, type Particles } from './fx';

const MAX = 16;
const SPEED = 26;
const ACCEL = 30;
const TURN = 4.5; // radians per second
const LIFE = 3.5;
const FORWARD = new THREE.Vector3(0, 0, -1);
const SMOKE = new THREE.Color(0x8a7f78);
const FLAME = new THREE.Color(0xffa040);

interface Missile {
  mesh: THREE.Group;
  prev: THREE.Vector3;
  heading: number; // yaw, 0 = facing north (-z)
  speed: number;
  life: number;
  target: THREE.Object3D | null;
  smoke: number;
}

/** Finds something for a missile at `from`, flying along `dir`, to chase. */
export type Seeker = (from: THREE.Vector3, dir: THREE.Vector3) => THREE.Object3D | null;

const bodyGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.8, 6).rotateX(Math.PI / 2);
const noseGeo = new THREE.ConeGeometry(0.1, 0.3, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.55);
const finGeo = new THREE.BoxGeometry(0.5, 0.04, 0.2).translate(0, 0, 0.3);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.4, roughness: 0.4, flatShading: true });
const noseMat = new THREE.MeshStandardMaterial({ color: 0xff4a5a, emissive: 0xff2030, emissiveIntensity: 0.6, flatShading: true });

// The ship's homing missiles. Each one turns towards the nearest enemy ahead
// of it, picking a new one if its target is destroyed, and leaves a smoke
// trail. They burst on whatever they hit, or when their fuel runs out.
export class Missiles {
  private missiles: Missile[] = [];
  private blasts: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) {
      const mesh = new THREE.Group();
      const fins = [0, Math.PI / 2].map((r) => new THREE.Mesh(finGeo, bodyMat).rotateZ(r));
      const glow = halo(FLAME, 1.6, 0.9);
      glow.position.z = 0.55;
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat), new THREE.Mesh(noseGeo, noseMat), ...fins, glow);
      mesh.visible = false;
      scene.add(mesh);
      this.missiles.push({ mesh, prev: new THREE.Vector3(), heading: 0, speed: 0, life: 0, target: null, smoke: 0 });
    }
  }

  /** Launches a missile from `from` along `heading`, starting at `speed`. */
  fire(from: THREE.Vector3, heading: number, speed: number): void {
    const m = this.missiles.find((m) => m.life <= 0);
    if (!m) return;
    m.mesh.position.copy(from);
    m.prev.copy(from);
    m.heading = heading;
    m.speed = Math.max(8, speed);
    m.life = LIFE;
    m.target = null;
    m.mesh.visible = true;
  }

  /** Steers and moves the missiles; returns where any burst on a rock or ran dry. */
  update(dt: number, rocks: Rock[], particles: Particles, seek: Seeker): THREE.Vector3[] {
    const pops: THREE.Vector3[] = [];
    const half = WORLD_SIZE / 2;
    const dir = new THREE.Vector3();
    for (const m of this.missiles) {
      if (m.life <= 0) continue;
      m.life -= dt;
      const p = m.mesh.position;
      dir.set(-Math.sin(m.heading), 0, -Math.cos(m.heading));
      if (!m.target || !m.target.visible || !m.target.parent) m.target = seek(p, dir);
      if (m.target) {
        const t = m.target.position;
        const want = Math.atan2(-(t.x - p.x), -(t.z - p.z));
        const diff = Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading));
        m.heading += THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
        dir.set(-Math.sin(m.heading), 0, -Math.cos(m.heading));
      }
      m.speed = Math.min(SPEED, m.speed + ACCEL * dt);
      m.prev.copy(p);
      p.addScaledVector(dir, m.speed * dt);
      p.y = THREE.MathUtils.lerp(p.y, 1.2, 1 - Math.exp(-4 * dt));
      m.mesh.quaternion.setFromUnitVectors(FORWARD, dir);

      m.smoke -= dt;
      if (m.smoke <= 0) {
        m.smoke = 0.02;
        const tail = p.clone().addScaledVector(dir, -0.6);
        particles.spawn(tail, new THREE.Vector3().randomDirection().multiplyScalar(0.5), SMOKE, 0.7);
        particles.spawn(tail, dir.clone().multiplyScalar(-4), FLAME, 0.15);
      }

      const hit = rocks.some((r) => segmentHitsCircle(m.prev, p, r.x, r.z, r.radius));
      if (hit || m.life <= 0 || Math.abs(p.x) > half || Math.abs(p.z) > half) {
        pops.push(p.clone());
        this.kill(m);
      }
    }
    return pops;
  }

  /** Bursts every missile that passed through a circle this frame; returns how many did. */
  hit(x: number, z: number, radius: number): number {
    let n = 0;
    for (const m of this.missiles) {
      if (m.life > 0 && segmentHitsCircle(m.prev, m.mesh.position, x, z, radius)) {
        this.blasts.push(m.mesh.position.clone());
        this.kill(m);
        n++;
      }
    }
    return n;
  }

  /** Where missiles hit enemies since the last call. */
  takeBlasts(): THREE.Vector3[] {
    return this.blasts.splice(0);
  }

  clear(): void {
    for (const m of this.missiles) this.kill(m);
    this.blasts.length = 0;
  }

  private kill(m: Missile): void {
    m.life = 0;
    m.target = null;
    m.mesh.visible = false;
  }
}
