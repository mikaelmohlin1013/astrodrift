import * as THREE from 'three';
import type { Spot } from './level';
import type { Rock } from './world';
import { halo } from './fx';

const PAD = 2.8;
const COLOR = new THREE.Color(0x7dff8a);

// The repair station in each level: a hexagonal landing pad with a glowing
// cross and a mast with a spinning dish. Settling on the pad slowly docks the
// ship, which repairs it and opens the upgrade shop.
export class Station {
  readonly position = new THREE.Vector3();
  /** The mast, for collisions. */
  readonly mast: Rock = { x: 0, z: 0, radius: 0.6 };
  private group = new THREE.Group();
  private glowMat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.8 });
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private dish = new THREE.Group();
  private beacon: THREE.Sprite;
  private light = new THREE.PointLight(COLOR, 6, 12);
  private time = 0;

  constructor(scene: THREE.Scene) {
    const g = this.group;
    const metal = new THREE.MeshStandardMaterial({ color: 0x343b52, metalness: 0.6, roughness: 0.45, flatShading: true });

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD, PAD + 0.2, 0.2, 6).translate(0, 0.1, 0), metal);
    pad.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(PAD - 0.25, PAD - 0.05, 6).rotateX(-Math.PI / 2).translate(0, 0.22, 0), this.glowMat);
    // A plus sign in the middle of the pad.
    const bar = new THREE.BoxGeometry(2.2, 0.04, 0.55).translate(0, 0.22, 0);
    const cross = [0, Math.PI / 2].map((r) => new THREE.Mesh(bar, this.glowMat).rotateY(r));

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(PAD - 0.4, PAD - 0.4, 5, 6, 1, true).translate(0, 2.7, 0),
      new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );

    // Mast on the east edge with a dish and a blinking beacon on top.
    const mast = new THREE.Group();
    mast.position.x = PAD + 0.6;
    mast.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 4.2, 6).translate(0, 2.1, 0), metal));
    const dishMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), metal);
    dishMesh.rotation.x = -Math.PI / 2.4;
    this.dish.position.y = 3.6;
    this.dish.add(dishMesh);
    this.beacon = halo(COLOR, 2.2, 1);
    this.beacon.position.y = 4.5;
    mast.add(this.dish, this.beacon);

    this.light.position.y = 2;
    g.add(pad, rim, ...cross, this.beam, mast, this.light, halo(COLOR, 7, 0.25).translateY(0.3));
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === metal) o.castShadow = true;
    });
    scene.add(g);
  }

  /** Moves the station to a level's repair spot. */
  place(at: Spot): void {
    this.position.set(at.x, 0, at.z);
    this.group.position.copy(this.position);
    this.mast.x = at.x + PAD + 0.6;
    this.mast.z = at.z;
  }

  /** True when the ship is over the pad. */
  contains(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z) < PAD - 0.4;
  }

  /** Animates the station; `docking` (0..1) brightens the beam as the ship settles. */
  update(dt: number, docking: number): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    this.glowMat.opacity = 0.55 + pulse * 0.35;
    this.beam.material.opacity = docking * 0.35;
    this.beam.rotation.y += dt * 0.6;
    this.dish.rotation.y += dt * 1.2;
    this.beacon.material.opacity = Math.sin(this.time * 4) > 0.3 ? 1 : 0.15;
    this.light.intensity = 4 + pulse * 3 + docking * 10;
  }
}
