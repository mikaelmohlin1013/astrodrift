import * as THREE from 'three';
import { WORLD_SIZE, type Rock } from './world';
import { PLAYER_RADIUS } from './player';

const COUNT = 18;
const RADIUS = 0.7;
const SPAWN_CLEARANCE = 1.5;

interface Crystal {
  mesh: THREE.Mesh;
  phase: number;
  pop: number; // >0 while the respawn grow-in animation plays
}

// Glowing crystals the player collects. Each one picked up reappears
// somewhere else on the field, so there is always something to chase.
export class Crystals {
  private items: Crystal[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private rocks: Rock[],
  ) {
    const geo = new THREE.OctahedronGeometry(RADIUS, 0);
    geo.scale(1, 1.6, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6affd8,
      emissive: 0x2bd9a8,
      emissiveIntensity: 1.2,
      metalness: 0.1,
      roughness: 0.2,
      flatShading: true,
    });
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      const crystal = { mesh, phase: Math.random() * Math.PI * 2, pop: 0 };
      this.place(crystal);
      this.items.push(crystal);
    }
  }

  /** Spins and bobs the crystals, and returns how many the player touched. */
  update(dt: number, player: THREE.Vector3): number {
    this.time += dt;
    let collected = 0;
    const reach = RADIUS + PLAYER_RADIUS;
    for (const c of this.items) {
      const m = c.mesh;
      if (c.pop > 0) c.pop = Math.max(0, c.pop - dt * 3);
      m.scale.setScalar(1 - c.pop);
      m.rotation.y += dt * 1.5;
      m.position.y = 1.2 + Math.sin(this.time * 2 + c.phase) * 0.25;
      if (c.pop === 0 && Math.hypot(m.position.x - player.x, m.position.z - player.z) < reach) {
        collected++;
        this.place(c, player);
      }
    }
    return collected;
  }

  /** Puts every crystal somewhere new, for a fresh run. */
  reset(): void {
    for (const c of this.items) this.place(c);
  }

  /** Nearest crystal to a point, for the HUD pointer. */
  nearest(p: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const c of this.items) {
      const d = c.mesh.position.distanceToSquared(p);
      if (d < bestDist) {
        bestDist = d;
        best = c.mesh.position;
      }
    }
    return best;
  }

  // Finds a spot clear of rocks, the spawn point and (optionally) the player.
  private place(c: Crystal, avoid?: THREE.Vector3): void {
    const span = WORLD_SIZE - 12;
    for (let tries = 0; tries < 50; tries++) {
      const x = (Math.random() - 0.5) * span;
      const z = (Math.random() - 0.5) * span;
      if (Math.hypot(x, z) < 6) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 15) continue;
      if (this.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + RADIUS + SPAWN_CLEARANCE)) continue;
      c.mesh.position.set(x, 1.2, z);
      break;
    }
    c.pop = 1;
  }
}
