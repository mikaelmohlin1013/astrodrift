import * as THREE from 'three';
import type { Spot } from './level';
import type { Rock } from './world';
import { halo } from './fx';

const RADIUS = 2.6;
const LOCKED = new THREE.Color(0xff5a6e);
const OPEN = new THREE.Color(0x9a7bff);

// The exit gate at the north end of each level: an upright ring between two
// pylons. It stays dim and red until every crystal is collected, then lights
// up, and flying through it finishes the level.
export class Gate {
  readonly position = new THREE.Vector3();
  /** The two pylons, for collisions. */
  readonly pylons: Rock[] = [];
  private group = new THREE.Group();
  private ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, emissive: LOCKED, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  private portal: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Sprite;
  private light = new THREE.PointLight(LOCKED, 6, 14);
  private open = false;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const g = this.group;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.32, 12, 48), this.ringMat);
    ring.position.y = RADIUS + 0.4;
    ring.castShadow = true;

    this.portal = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS - 0.2, 48),
      new THREE.MeshBasicMaterial({ color: LOCKED, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.portal.position.y = ring.position.y;

    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x3a4058, metalness: 0.5, roughness: 0.5, flatShading: true });
    const pylonGeo = new THREE.CylinderGeometry(0.45, 0.7, RADIUS * 2 + 1.2, 6).translate(0, RADIUS + 0.6, 0);
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.x = side * (RADIUS + 0.6);
      pylon.castShadow = true;
      g.add(pylon);
      this.pylons.push({ x: pylon.position.x, z: 0, radius: 0.75 });
    }

    this.glow = halo(LOCKED, 9, 0.4);
    this.glow.position.y = ring.position.y;
    this.light.position.y = ring.position.y;
    g.add(ring, this.portal, this.glow, this.light);
    scene.add(g);
  }

  /** Moves the gate to a level's exit. */
  place(at: Spot): void {
    const dx = at.x - this.position.x;
    const dz = at.z - this.position.z;
    for (const p of this.pylons) {
      p.x += dx;
      p.z += dz;
    }
    this.position.set(at.x, 0, at.z);
    this.group.position.copy(this.position);
  }

  setOpen(open: boolean): void {
    this.open = open;
    const c = open ? OPEN : LOCKED;
    this.ringMat.emissive.copy(c);
    this.portal.material.color.copy(c);
    this.glow.material.color.copy(c);
    this.light.color.copy(c);
  }

  update(dt: number): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (this.open ? 4 : 1.5));
    this.ringMat.emissiveIntensity = this.open ? 1.6 + pulse : 0.4 + pulse * 0.3;
    this.portal.material.opacity = this.open ? 0.2 + pulse * 0.15 : 0.08;
    this.glow.material.opacity = this.open ? 0.8 : 0.25;
    this.glow.scale.setScalar(this.open ? 10 + pulse * 2 : 8);
    this.light.intensity = this.open ? 14 : 4;
  }

  /** True when a point is inside the ring's opening. */
  contains(p: THREE.Vector3): boolean {
    return Math.abs(p.x - this.position.x) < RADIUS - 0.4 && Math.abs(p.z - this.position.z) < 0.8;
  }
}
