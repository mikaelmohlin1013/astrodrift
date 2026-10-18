import * as THREE from 'three';
import type { Input } from './input';
import { WORLD_SIZE, resolveRocks, type Rock } from './world';
import type { Spot } from './level';
import { halo, type Particles } from './fx';

const SPEED = 11;
const BOOST = 1.6;
const THRUST = 16; // forward acceleration
const BRAKE = 18;
const REVERSE = 6;
const REVERSE_MAX = 4;
const DRAG = 0.8;
const GRIP = 2.5; // how quickly sideways drift dies away
const TURN_SPEED = 3.2; // radians per second at full turn
const TURN = 10;
const BOUNCE = 0.6;

export const PLAYER_RADIUS = 0.9;

const HULL = 0x4fc3ff;

// A small hovering ship the player steers around the ground.
export class Player {
  readonly mesh = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  private time = 0;
  private hullMat = new THREE.MeshStandardMaterial({ color: HULL, metalness: 0.4, roughness: 0.35, flatShading: true });
  private flames: THREE.Mesh[] = [];
  private nozzles: THREE.Vector3[] = [];
  private boosting = false;
  private thrusting = false;
  private heading = 0; // yaw in radians, 0 = facing north (-z)
  private turnRate = 0;
  private emitTimer = 0;
  private guns: THREE.Vector3[] = [];
  private nextGun = 0;

  constructor() {
    const trim = new THREE.MeshStandardMaterial({ color: 0x1d2a44, metalness: 0.6, roughness: 0.4, flatShading: true });

    // Fuselage: a long six-sided cone, tip pointing forward along -z.
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 6).rotateX(-Math.PI / 2), this.hullMat);
    body.scale.set(1, 0.7, 1);

    // Swept wings, built from a flat triangle shape and given a little depth.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.3);
    wingShape.lineTo(1.5, 0.8);
    wingShape.lineTo(1.4, 1.05);
    wingShape.lineTo(0, 0.85);
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2);
    const wings = [1, -1].map((side) => {
      const wing = new THREE.Mesh(wingGeo, this.hullMat);
      wing.scale.x = side;
      wing.position.set(side * 0.2, 0.05, 0);
      return wing;
    });

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.7).translate(0, 0.3, 0.6), trim);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0b1530, emissive: 0x2a6bff, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.1 }),
    );
    cockpit.scale.set(1, 0.8, 1.8);
    cockpit.position.set(0, 0.18, -0.1);

    this.mesh.add(body, ...wings, fin, cockpit);

    // A small laser cannon under each wing; shots alternate between them.
    const gunGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6).rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const gun = new THREE.Mesh(gunGeo, trim);
      gun.position.set(side * 0.8, -0.05, 0.1);
      this.mesh.add(gun);
      this.guns.push(new THREE.Vector3(side * 0.8, -0.05, -0.4));
    }

    // Two engines with flames that stretch with speed.
    const engineGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.6, 8).rotateX(Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.17, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const side of [-1, 1]) {
      const engine = new THREE.Mesh(engineGeo, trim);
      engine.position.set(side * 0.42, 0, 1.0);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(side * 0.42, 0, 1.3);
      const glow = halo(0xffa040, 1.2, 0.9);
      glow.position.set(side * 0.42, 0, 1.35);
      this.flames.push(flame);
      this.nozzles.push(new THREE.Vector3(side * 0.42, 0, 1.45));
      this.mesh.add(engine, flame, glow);
    }

    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material !== flameMat) o.castShadow = true;
    });
    this.mesh.add(new THREE.PointLight(0xffa040, 4, 6).translateZ(1.6));
  }

  /** How fast the ship is going, 0..1 of boosted top speed. */
  get speed01(): number {
    return Math.min(1, this.velocity.length() / (SPEED * BOOST));
  }

  get isThrusting(): boolean {
    return this.thrusting;
  }

  get isBoosting(): boolean {
    return this.boosting;
  }

  /** Unit vector the nose points along. */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  /** World position of the next cannon to fire, alternating left and right. */
  nextMuzzle(): THREE.Vector3 {
    const gun = this.guns[this.nextGun];
    this.nextGun = (this.nextGun + 1) % this.guns.length;
    return gun.clone().applyMatrix4(this.mesh.matrixWorld);
  }

  update(dt: number, input: Input): void {
    this.time += dt;
    const { turn, thrust } = input;
    this.thrusting = thrust > 0;
    this.boosting = input.boost && this.thrusting;

    // Rotate with left/right; the turn rate eases in and out so it feels weighty.
    this.turnRate = THREE.MathUtils.lerp(this.turnRate, -turn * TURN_SPEED, 1 - Math.exp(-TURN * dt));
    this.heading += this.turnRate * dt;
    const forward = this.forward;

    // Thrust pushes along the nose; down brakes and then backs up slowly.
    const max = SPEED * (this.boosting ? BOOST : 1);
    const along = this.velocity.dot(forward);
    if (thrust > 0) this.velocity.addScaledVector(forward, THRUST * (this.boosting ? BOOST : 1) * dt);
    else if (thrust < 0) this.velocity.addScaledVector(forward, (along > 0 ? -BRAKE : -REVERSE) * dt);
    if (thrust < 0 && along < -REVERSE_MAX) this.velocity.addScaledVector(forward, -along - REVERSE_MAX);

    // Drag, plus extra grip sideways so the ship drifts a little but still steers.
    this.velocity.multiplyScalar(Math.exp(-DRAG * dt));
    const sideways = new THREE.Vector3(-forward.z, 0, forward.x);
    this.velocity.addScaledVector(sideways, -this.velocity.dot(sideways) * (1 - Math.exp(-GRIP * dt)));
    if (this.velocity.length() > max) this.velocity.lerp(this.velocity.clone().setLength(max), 1 - Math.exp(-4 * dt));
    this.mesh.position.addScaledVector(this.velocity, dt);

    const half = WORLD_SIZE / 2 - 2;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -half, half);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -half, half);

    // Face the heading and bank into turns.
    const bank = THREE.MathUtils.clamp(this.turnRate * 0.18, -0.5, 0.5);
    this.mesh.quaternion.setFromEuler(new THREE.Euler(0, this.heading, bank, 'YXZ'));

    const flicker = 0.85 + Math.random() * 0.3;
    const len = (thrust > 0 ? 0.9 + this.speed01 * 0.9 : 0.25) * (this.boosting ? 1.4 : 1) * flicker;
    for (const f of this.flames) f.scale.set(1, 1, len);
    this.mesh.position.y = 1 + Math.sin(this.time * 3) * 0.12;
  }

  /**
   * Pushes the player out of any rock it overlaps and bounces it off.
   * Returns the speed it hit with (0 when nothing was hit).
   */
  collide(rocks: Rock[]): number {
    return resolveRocks(this.mesh.position, this.velocity, PLAYER_RADIUS, rocks, BOUNCE);
  }

  /** Leaves a trail of exhaust sparks behind the engines while thrusting. */
  exhaust(dt: number, particles: Particles): void {
    this.emitTimer -= dt;
    if (this.emitTimer > 0 || !this.thrusting) return;
    this.emitTimer = this.boosting ? 0.012 : 0.03;
    const color = new THREE.Color(this.boosting ? 0xffd080 : 0xff9040);
    const back = new THREE.Vector3(0, 0, 3).applyQuaternion(this.mesh.quaternion);
    for (const n of this.nozzles) {
      const p = n.clone().applyMatrix4(this.mesh.matrixWorld);
      const v = back.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.6));
      particles.spawn(p, v, color, 0.35 + Math.random() * 0.2);
    }
  }

  /** Flashes the hull red for a moment after a hit (0..1 strength). */
  setDamageFlash(amount: number): void {
    this.hullMat.emissive.setRGB(amount, 0, 0);
  }

  reset(start: Spot): void {
    this.mesh.position.set(start.x, 1, start.z);
    this.mesh.quaternion.identity();
    this.heading = 0;
    this.turnRate = 0;
    this.velocity.set(0, 0, 0);
    this.setDamageFlash(0);
  }
}
