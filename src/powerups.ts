import * as THREE from 'three';
import { PLAYER_RADIUS } from './player';
import { halo } from './fx';

export type PowerKind = 'rapid' | 'spread' | 'overdrive';

/** How each power-up looks, what it's called and how long it lasts. */
export const POWERS: Record<PowerKind, { name: string; color: number; seconds: number }> = {
  rapid: { name: 'Rapid fire', color: 0xff6a3a, seconds: 8 },
  spread: { name: 'Spread shot', color: 0x4fc3ff, seconds: 8 },
  overdrive: { name: 'Overdrive', color: 0xffd040, seconds: 6 },
};
const KINDS = Object.keys(POWERS) as PowerKind[];

const LIFE = 12; // seconds a dropped power-up waits to be picked up
const BLINK = 3; // it blinks for this long before it goes
const REACH = 1.3 + PLAYER_RADIUS;
const MAGNET = 4; // drifts towards the ship from this close

interface Drop {
  group: THREE.Group;
  core: THREE.Mesh;
  kind: PowerKind;
  life: number;
}

const coreGeo = new THREE.IcosahedronGeometry(0.55, 0);
const cageGeo = new THREE.TorusGeometry(0.95, 0.07, 6, 24);
const materials = Object.fromEntries(
  KINDS.map((k) => [k, new THREE.MeshStandardMaterial({ color: POWERS[k].color, emissive: POWERS[k].color, emissiveIntensity: 1.6, flatShading: true })]),
) as Record<PowerKind, THREE.MeshStandardMaterial>;

// Power-ups that destroyed enemies leave behind: a glowing gem in a spinning
// ring, in the colour of what it does. Flying through one switches it on for
// a few seconds.
export class PowerUps {
  private drops: Drop[] = [];
  private time = 0;
  /** Seconds left on each active power-up. */
  readonly active: Record<PowerKind, number> = { rapid: 0, spread: 0, overdrive: 0 };

  constructor(private scene: THREE.Scene) {}

  /** Drops a random power-up at `at`. */
  drop(at: THREE.Vector3): void {
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
    const group = new THREE.Group();
    group.position.set(at.x, 0, at.z);
    const core = new THREE.Mesh(coreGeo, materials[kind]);
    const cage = new THREE.Mesh(cageGeo, materials[kind]);
    const cage2 = cage.clone();
    cage2.rotation.y = Math.PI / 2;
    core.add(cage, cage2, halo(POWERS[kind].color, 4.5, 0.6));
    group.add(core);
    this.scene.add(group);
    this.drops.push({ group, core, kind, life: LIFE });
  }

  /** Spins the drops, ticks the active timers, and returns what the ship picked up. */
  update(dt: number, player: THREE.Vector3 | null): { kind: PowerKind; at: THREE.Vector3 }[] {
    this.time += dt;
    for (const k of KINDS) this.active[k] = Math.max(0, this.active[k] - dt);
    const picked: { kind: PowerKind; at: THREE.Vector3 }[] = [];
    this.drops = this.drops.filter((d) => {
      d.life -= dt;
      const p = d.group.position;
      d.core.position.y = 1.4 + Math.sin(this.time * 3 + p.x) * 0.25;
      d.core.rotation.set(this.time * 0.7, this.time * 2.2, 0);
      d.group.visible = d.life > BLINK || Math.sin(d.life * 18) > 0;
      const dist = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;
      if (player && dist < MAGNET && dist > 0) {
        const step = Math.min(dist, (8 + (MAGNET - dist) * 4) * dt);
        p.x += ((player.x - p.x) / dist) * step;
        p.z += ((player.z - p.z) / dist) * step;
      }
      if (player && Math.hypot(player.x - p.x, player.z - p.z) < REACH) {
        this.active[d.kind] = POWERS[d.kind].seconds;
        picked.push({ kind: d.kind, at: new THREE.Vector3(p.x, 1.4, p.z) });
      } else if (d.life > 0) {
        return true;
      }
      d.group.removeFromParent();
      return false;
    });
    return picked;
  }

  isOn(kind: PowerKind): boolean {
    return this.active[kind] > 0;
  }

  /** Removes the drops and switches every power-up off. */
  clear(): void {
    for (const d of this.drops) d.group.removeFromParent();
    this.drops = [];
    for (const k of KINDS) this.active[k] = 0;
  }
}
