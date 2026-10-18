import * as THREE from 'three';
import type { LevelData } from './level';
import { resolveRocks, type Rock } from './world';
import { PLAYER_RADIUS } from './player';
import { segmentHitsCircle, type Bolts } from './weapons';
import { halo } from './fx';

const TURRET_RADIUS = 1.35;
const TURRET_SCALE = 1.25;
const TURRET_HP = 4;
const TURRET_RANGE = 26;
const TURRET_TURN = 2.2; // radians per second
const TURRET_RELOAD = 1.6;
const TURRET_BOLT_SPEED = 18;

const CHASER_RADIUS = 0.75;
const CHASER_HP = 2;
const CHASER_WAKE = 17;
const CHASER_SPEED = 8.5; // the ship's top speed is 11, so you can outrun one
const CHASER_ACCEL = 2.2;

/** Crystals earned for destroying each kind of enemy. */
export const TURRET_REWARD = 15;
export const CHASER_REWARD = 8;

const RED = new THREE.Color(0xff3b4e);
const WHITE = new THREE.Color(0xffffff);

interface Turret {
  group: THREE.Group;
  head: THREE.Group;
  eye: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  rock: Rock;
  aim: number; // yaw, 0 = facing north (-z)
  reload: number;
  hp: number;
  flash: number;
}

interface Chaser {
  group: THREE.Group;
  body: THREE.Group;
  skin: THREE.MeshStandardMaterial;
  velocity: THREE.Vector3;
  awake: boolean;
  hp: number;
  flash: number;
  phase: number;
}

/** Something that can hit enemies, and how hard each hit lands. */
export interface DamageSource {
  shots: { hit(x: number, z: number, radius: number): number };
  damage: number;
}

/** What happened to the enemies this frame, for sounds and effects. */
export interface EnemyEvents {
  /** Turret muzzles that fired. */
  shots: THREE.Vector3[];
  /** Chasers that crashed into the player. */
  rams: THREE.Vector3[];
  /** How many chasers noticed the player. */
  alerts: number;
}

const turretBaseGeo = new THREE.CylinderGeometry(0.85, 1.15, 0.9, 6).translate(0, 0.45, 0);
const turretDomeGeo = new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const turretBarrelGeo = new THREE.BoxGeometry(0.22, 0.22, 1.3).translate(0, 0.25, -0.75);
const turretEyeGeo = new THREE.BoxGeometry(0.5, 0.14, 0.1).translate(0, 0.32, -0.55);
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2f3d, metalness: 0.6, roughness: 0.45, flatShading: true });
const rust = new THREE.MeshStandardMaterial({ color: 0x5a3036, metalness: 0.5, roughness: 0.5, flatShading: true });
const chaserCoreGeo = new THREE.IcosahedronGeometry(CHASER_RADIUS * 0.8, 0);
const chaserSpikeGeo = new THREE.ConeGeometry(0.16, 0.7, 5).translate(0, 0.75, 0);

// Turrets that sit still, track the ship and shoot when they can see it,
// and chasers that hover in place until the ship comes close, then ram it.
export class Enemies {
  private turrets: Turret[] = [];
  private chasers: Chaser[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene) {}

  /** Replaces the enemies with a fresh set for a level. */
  load(level: LevelData): void {
    for (const e of [...this.turrets, ...this.chasers]) e.group.removeFromParent();
    this.turrets = level.turrets.map((s) => this.makeTurret(s.x, s.z));
    this.chasers = level.chasers.map((s) => this.makeChaser(s.x, s.z));
  }

  get alive(): number {
    return this.turrets.filter((t) => t.hp > 0).length + this.chasers.filter((c) => c.hp > 0).length;
  }

  get total(): number {
    return this.turrets.length + this.chasers.length;
  }

  /** Footprints of the turrets still standing, so the ship bumps into them. */
  obstacles(): Rock[] {
    return this.turrets.filter((t) => t.hp > 0).map((t) => t.rock);
  }

  update(dt: number, player: THREE.Vector3 | null, rocks: Rock[], shots: Bolts): EnemyEvents {
    this.time += dt;
    const events: EnemyEvents = { shots: [], rams: [], alerts: 0 };

    for (const t of this.turrets) {
      if (t.hp <= 0) continue;
      t.flash = Math.max(0, t.flash - dt * 6);
      t.reload -= dt;
      const p = t.group.position;
      const dist = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;
      const sees = player !== null && dist < TURRET_RANGE && clearLine(p, player, rocks);
      let aimed = false;
      if (sees) {
        // Swing the head towards the ship, no faster than it can turn.
        const want = Math.atan2(-(player.x - p.x), -(player.z - p.z));
        const diff = Math.atan2(Math.sin(want - t.aim), Math.cos(want - t.aim));
        t.aim += THREE.MathUtils.clamp(diff, -TURRET_TURN * dt, TURRET_TURN * dt);
        aimed = Math.abs(diff) < 0.12;
      } else {
        t.aim += dt * 0.4; // idle sweep
      }
      t.head.rotation.y = t.aim;
      if (aimed && t.reload <= 0) {
        t.reload = TURRET_RELOAD;
        const dir = new THREE.Vector3(-Math.sin(t.aim), 0, -Math.cos(t.aim));
        const muzzle = p.clone().addScaledVector(dir, 1.9).setY(1.6);
        shots.fire(muzzle, dir, TURRET_BOLT_SPEED, TURRET_RANGE + 4);
        events.shots.push(muzzle);
      }
      // The eye glows brighter as the next shot charges, and white when hit.
      const charge = sees ? 1 - THREE.MathUtils.clamp(t.reload / TURRET_RELOAD, 0, 1) : 0.15;
      t.eye.emissiveIntensity = 0.6 + charge * 2.4;
      t.eye.emissive.copy(RED).lerp(WHITE, t.flash);
      t.glow.material.opacity = 0.2 + charge * 0.6;
    }

    for (const c of this.chasers) {
      if (c.hp <= 0) continue;
      c.flash = Math.max(0, c.flash - dt * 6);
      const p = c.group.position;
      if (!c.awake && player && p.distanceTo(player) < CHASER_WAKE) {
        c.awake = true;
        events.alerts++;
      }
      if (c.awake && player) {
        const desired = new THREE.Vector3(player.x - p.x, 0, player.z - p.z).setLength(CHASER_SPEED);
        // Steer around nearby rocks and away from other chasers.
        for (const r of rocks) this.avoid(desired, p, r.x, r.z, r.radius + CHASER_RADIUS + 2.2);
        for (const o of this.chasers) if (o !== c && o.hp > 0) this.avoid(desired, p, o.group.position.x, o.group.position.z, 2.2);
        desired.clampLength(0, CHASER_SPEED);
        c.velocity.lerp(desired, 1 - Math.exp(-CHASER_ACCEL * dt));
        p.addScaledVector(c.velocity, dt);
        resolveRocks(p, c.velocity, CHASER_RADIUS, rocks, 0.3);
        if (Math.hypot(player.x - p.x, player.z - p.z) < CHASER_RADIUS + PLAYER_RADIUS + 0.2) {
          c.hp = 0;
          c.group.visible = false;
          events.rams.push(p.clone());
        }
      }
      p.y = 1.1 + Math.sin(this.time * 3 + c.phase) * 0.15;
      c.body.rotation.y += dt * (c.awake ? 6 : 1.2);
      c.body.rotation.x = c.awake ? Math.sin(this.time * 7) * 0.2 : 0;
      c.skin.emissive.copy(RED).lerp(WHITE, c.flash);
      c.skin.emissiveIntensity = (c.awake ? 1.2 + Math.sin(this.time * 14) * 0.5 : 0.5) + c.flash * 2;
    }
    return events;
  }

  /**
   * Checks the player's shots against every enemy. Returns where shots hit,
   * where enemies were destroyed, and the crystals earned for them.
   */
  takeHits(sources: DamageSource[]): { hits: THREE.Vector3[]; kills: THREE.Vector3[]; reward: number } {
    const hits: THREE.Vector3[] = [];
    const kills: THREE.Vector3[] = [];
    let reward = 0;
    for (const e of [...this.turrets, ...this.chasers]) {
      if (e.hp <= 0) continue;
      const p = e.group.position;
      const turret = 'rock' in e;
      const radius = turret ? TURRET_RADIUS : CHASER_RADIUS + 0.2;
      let damage = 0;
      for (const s of sources) damage += s.shots.hit(p.x, p.z, radius) * s.damage;
      if (damage === 0) continue;
      e.hp -= damage;
      e.flash = 1;
      if ('awake' in e) e.awake = true;
      const at = new THREE.Vector3(p.x, 1.2, p.z);
      if (e.hp <= 0) {
        e.group.visible = false;
        kills.push(at);
        reward += turret ? TURRET_REWARD : CHASER_REWARD;
      } else {
        hits.push(at);
      }
    }
    return { hits, kills, reward };
  }

  /**
   * The enemy a missile at `from` heading along `dir` should chase: the
   * closest one within `range` that no rock hides, counting enemies behind
   * it as further away.
   */
  nearestTarget(from: THREE.Vector3, dir: THREE.Vector3, range: number, rocks: Rock[]): THREE.Object3D | null {
    let best: THREE.Object3D | null = null;
    let bestScore = Infinity;
    for (const e of [...this.turrets, ...this.chasers]) {
      if (e.hp <= 0) continue;
      const p = e.group.position;
      const dx = p.x - from.x;
      const dz = p.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ahead = d > 0 ? (dx * dir.x + dz * dir.z) / d : 1;
      if (ahead < -0.3) continue;
      const score = d * (2 - ahead);
      if (score < bestScore && clearLine(from, p, rocks)) {
        bestScore = score;
        best = e.group;
      }
    }
    return best;
  }

  /** Pushes `desired` away from a point once it is closer than `range`. */
  private avoid(desired: THREE.Vector3, p: THREE.Vector3, x: number, z: number, range: number): void {
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d >= range || d === 0) return;
    const push = ((range - d) / range) * CHASER_SPEED * 1.5;
    desired.x += (dx / d) * push;
    desired.z += (dz / d) * push;
  }

  private makeTurret(x: number, z: number): Turret {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(TURRET_SCALE);
    const base = new THREE.Mesh(turretBaseGeo, rust);
    const head = new THREE.Group();
    head.position.y = 0.9;
    const eye = new THREE.MeshStandardMaterial({ color: 0x220a0e, emissive: RED, emissiveIntensity: 1 });
    const glow = halo(RED, 2.4, 0.4);
    glow.position.set(0, 0.35, -0.7);
    head.add(new THREE.Mesh(turretDomeGeo, darkMetal), new THREE.Mesh(turretBarrelGeo, darkMetal), new THREE.Mesh(turretEyeGeo, eye), glow);
    group.add(base, head);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.scene.add(group);
    const aim = Math.random() * Math.PI * 2;
    return { group, head, eye, glow, rock: { x, z, radius: TURRET_RADIUS }, aim, reload: 1 + Math.random(), hp: TURRET_HP, flash: 0 };
  }

  private makeChaser(x: number, z: number): Chaser {
    const group = new THREE.Group();
    group.position.set(x, 1.1, z);
    const skin = new THREE.MeshStandardMaterial({ color: 0x3a1018, emissive: RED, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.35, flatShading: true });
    const body = new THREE.Group();
    body.add(new THREE.Mesh(chaserCoreGeo, skin));
    // Six spikes pointing out along the axes.
    for (const [rx, rz] of [[0, 0], [Math.PI, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]]) {
      const spike = new THREE.Mesh(chaserSpikeGeo, darkMetal);
      spike.rotation.set(rx, 0, rz);
      body.add(spike);
    }
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    group.add(body, halo(RED, 3, 0.5));
    this.scene.add(group);
    return { group, body, skin, velocity: new THREE.Vector3(), awake: false, hp: CHASER_HP, flash: 0, phase: Math.random() * 6 };
  }
}

/** True when no rock blocks the straight line between two points. */
function clearLine(a: THREE.Vector3, b: THREE.Vector3, rocks: Rock[]): boolean {
  return !rocks.some((r) => segmentHitsCircle(a, b, r.x, r.z, r.radius * 0.8));
}
