import * as THREE from 'three';
import type { Input } from './input';
import { WORLD_SIZE, resolveRocks, type Rock } from './world';
import type { Spot } from './level';
import { halo, type Particles } from './fx';
import { buildGripen } from './gripen';

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
export const PLAYER_BOUNCE = 0.6;

export const PLAYER_RADIUS = 0.9;

// The player's hovering Gripen, steered around the ground.
export class Player {
  readonly mesh = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  private time = 0;
  private paint: THREE.MeshStandardMaterial[];
  private flames: THREE.Mesh[] = [];
  private nozzles: THREE.Vector3[] = [];
  private boosting = false;
  private thrusting = false;
  private heading = 0; // yaw in radians, 0 = facing north (-z)
  private turnRate = 0;
  private emitTimer = 0;
  private guns: THREE.Vector3[];
  private nextGun = 0;
  private shield: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** 1 on solid ground, 0 on ice: how much drag and sideways grip there is. */
  traction = 1;

  constructor() {
    // A JAS 39 Gripen; bolts leave from under the intakes, alternating sides.
    const gripen = buildGripen();
    this.paint = gripen.paint;
    this.guns = gripen.muzzles;
    this.mesh.add(gripen.group);

    // One engine: a hot blue-white core inside an orange afterburner plume,
    // both stretching with speed.
    const n = gripen.nozzle;
    const flameGeo = new THREE.ConeGeometry(0.1, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const outer = new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [mat, width] of [[outer, 1], [core, 0.55]] as const) {
      const flame = new THREE.Mesh(flameGeo, mat);
      flame.position.copy(n);
      flame.scale.x = flame.scale.y = width;
      this.flames.push(flame);
      this.mesh.add(flame);
    }
    const glow = halo(0xffa040, 0.9, 0.8);
    glow.position.copy(n).add(new THREE.Vector3(0, 0, 0.05));
    this.mesh.add(glow);
    this.nozzles.push(n.clone().add(new THREE.Vector3(0, 0, 0.1)));
    this.mesh.add(new THREE.PointLight(0xffa040, 4, 6).translateZ(n.z + 0.3));

    // Shield bubble: a squashed sphere that glows at its edges, so it reads as
    // a bubble rather than a solid ball.
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0x8a9dff) }, strength: { value: 0 } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color;
          uniform float strength;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
            gl_FragColor = vec4(color * (rim + 0.04) * strength, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.shield.scale.set(1, 0.55, 1.15);
    this.shield.visible = false;
    this.mesh.add(this.shield);
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

  /** Yaw in radians, 0 = facing north (-z). */
  get yaw(): number {
    return this.heading;
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
    else if (thrust < 0) this.velocity.addScaledVector(forward, (along > 0 ? -BRAKE * (0.3 + 0.7 * this.traction) : -REVERSE) * dt);
    if (thrust < 0 && along < -REVERSE_MAX) this.velocity.addScaledVector(forward, -along - REVERSE_MAX);

    // Drag, plus extra grip sideways so the ship drifts a little but still steers.
    // On ice there is hardly any of either, so the ship slides on.
    const grip = 0.08 + 0.92 * this.traction;
    this.velocity.multiplyScalar(Math.exp(-DRAG * grip * dt));
    const sideways = new THREE.Vector3(-forward.z, 0, forward.x);
    this.velocity.addScaledVector(sideways, -this.velocity.dot(sideways) * (1 - Math.exp(-GRIP * grip * dt)));
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
    this.flames.forEach((f, i) => (f.scale.z = len * (i ? 0.6 : 1)));
    this.mesh.position.y = 1 + Math.sin(this.time * 3) * 0.12;
  }

  /**
   * Pushes the player out of any rock it overlaps and bounces it off.
   * Returns the speed it hit with (0 when nothing was hit).
   */
  collide(rocks: Rock[]): number {
    return resolveRocks(this.mesh.position, this.velocity, PLAYER_RADIUS, rocks, PLAYER_BOUNCE);
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
      // One engine, so two sparks per puff to keep the trail as thick as before.
      for (let k = 0; k < 2; k++) particles.spawn(p, v.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.3)), color, 0.35 + Math.random() * 0.2);
    }
  }

  /** Flashes the hull red for a moment after a hit (0..1 strength). */
  setDamageFlash(amount: number): void {
    for (const m of this.paint) m.emissive.setRGB(amount, 0, 0);
  }

  /**
   * Shows the shield bubble: `charge` is how full it is (0..1) and `flash`
   * brightens it for a moment when it absorbs a hit.
   */
  setShield(charge: number, flash: number): void {
    this.shield.visible = charge > 0 || flash > 0;
    this.shield.material.uniforms.strength.value = charge * (0.5 + Math.sin(this.time * 5) * 0.08) + flash * 2.5;
  }

  reset(start: Spot): void {
    this.mesh.position.set(start.x, 1, start.z);
    this.mesh.quaternion.identity();
    this.heading = 0;
    this.turnRate = 0;
    this.velocity.set(0, 0, 0);
    this.traction = 1;
    this.setDamageFlash(0);
  }
}
