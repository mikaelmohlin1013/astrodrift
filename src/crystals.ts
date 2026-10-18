import * as THREE from 'three';
import { LEVEL } from './level';
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

// The level's crystals, at fixed spots along the route. Each one can be
// picked up once per run.
export class Crystals {
  readonly total = LEVEL.crystals.length;
  private items: Crystal[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.OctahedronGeometry(RADIUS, 0);
    geo.scale(1, 1.6, 1);
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

    for (const spot of LEVEL.crystals) {
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
      scene.add(group);
      this.items.push({ group, gem, phase: Math.random() * Math.PI * 2, taken: false });
    }
  }

  get remaining(): number {
    return this.items.filter((c) => !c.taken).length;
  }

  /** Spins and bobs the crystals, and returns where the player picked any up. */
  update(dt: number, player: THREE.Vector3 | null): THREE.Vector3[] {
    this.time += dt;
    const picked: THREE.Vector3[] = [];
    const reach = RADIUS + PLAYER_RADIUS;
    for (const c of this.items) {
      if (c.taken) continue;
      c.gem.rotation.y += dt * 1.5;
      c.gem.position.y = 1.3 + Math.sin(this.time * 2 + c.phase) * 0.25;
      const p = c.group.position;
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
