import * as THREE from 'three';
import type { Spot } from './level';
import { PLAYER_RADIUS } from './player';
import { halo } from './fx';

const RADIUS = 0.7;
const COLOR = 0x6affd8;

interface Crystal {
  group: THREE.Group;
  gem: THREE.Mesh;
  phase: number;
  taken: boolean;
}

const geo = new THREE.OctahedronGeometry(RADIUS, 0).scale(1, 1.6, 1);
const mat = new THREE.MeshStandardMaterial({
  color: COLOR,
  emissive: 0x2bd9a8,
  emissiveIntensity: 1.3,
  metalness: 0.1,
  roughness: 0.15,
  flatShading: true,
});
const shardGeo = new THREE.OctahedronGeometry(0.28, 0).scale(1, 1.8, 1);
const ringMat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.35 });
const ringGeo = new THREE.RingGeometry(0.9, 1.1, 32).rotateX(-Math.PI / 2);

// The level's crystals, at fixed spots along the route. Each one can be
// picked up once per run.
export class Crystals {
  private items: Crystal[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene) {}

  get total(): number {
    return this.items.length;
  }

  /** Replaces the crystals with a new level's set. */
  load(spots: Spot[]): void {
    for (const c of this.items) c.group.removeFromParent();
    this.items = [];
    for (const spot of spots) {
      const group = new THREE.Group();
      group.position.set(spot.x, 0, spot.z);
      const gem = new THREE.Mesh(geo, mat);
      gem.castShadow = true;
      // Two small shards leaning off the main gem.
      for (const side of [-1, 1]) {
        const shard = new THREE.Mesh(shardGeo, mat);
        shard.position.set(side * 0.55, -0.45, side * 0.15);
        shard.rotation.z = -side * 0.5;
        gem.add(shard);
      }
      gem.add(halo(COLOR, 4, 0.55));
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.04;
      group.add(gem, ring);
      this.scene.add(group);
      this.items.push({ group, gem, phase: Math.random() * Math.PI * 2, taken: false });
    }
  }

  get remaining(): number {
    return this.items.filter((c) => !c.taken).length;
  }

  /**
   * Spins and bobs the crystals, and returns where the player picked any up.
   * Crystals within `magnet` of the player drift towards it.
   */
  update(dt: number, player: THREE.Vector3 | null, magnet = 0): THREE.Vector3[] {
    this.time += dt;
    const picked: THREE.Vector3[] = [];
    const reach = RADIUS + PLAYER_RADIUS;
    for (const c of this.items) {
      if (c.taken) continue;
      c.gem.rotation.y += dt * 1.5;
      c.gem.position.y = 1.3 + Math.sin(this.time * 2 + c.phase) * 0.25;
      const p = c.group.position;
      const dist = player ? Math.hypot(p.x - player.x, p.z - player.z) : Infinity;
      if (player && dist < magnet) {
        // Faster the closer it gets, so it snaps in at the end.
        const step = Math.min(dist, (6 + (magnet - dist) * 3) * dt);
        p.x += ((player.x - p.x) / dist) * step;
        p.z += ((player.z - p.z) / dist) * step;
      }
      if (player && Math.hypot(p.x - player.x, p.z - player.z) < reach) {
        c.taken = true;
        c.group.visible = false;
        picked.push(new THREE.Vector3(p.x, c.gem.position.y, p.z));
      }
    }
    return picked;
  }

  /** Puts every crystal back, for a fresh run. */
  reset(): void {
    for (const c of this.items) {
      c.taken = false;
      c.group.visible = true;
    }
  }

  /** Where the crystals still in play are, for the radar. */
  positions(): THREE.Vector3[] {
    return this.items.filter((c) => !c.taken).map((c) => c.group.position);
  }

  /** Nearest crystal still in play, for the HUD pointer. */
  nearest(p: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const c of this.items) {
      if (c.taken) continue;
      const d = c.group.position.distanceToSquared(p);
      if (d < bestDist) {
        bestDist = d;
        best = c.group.position;
      }
    }
    return best;
  }
}
