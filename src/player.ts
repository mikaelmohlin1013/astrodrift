import * as THREE from 'three';
import type { Input } from './input';
import { WORLD_SIZE, type Rock } from './world';

const SPEED = 9;
const BOOST = 1.8;
const ACCEL = 10;
const TURN = 12;
const BOUNCE = 0.6;

export const PLAYER_RADIUS = 0.9;

// A small hovering rover the player steers around the ground.
export class Player {
  readonly mesh = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  private time = 0;
  private body: THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>;

  constructor() {
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x4fc3ff, metalness: 0.3, roughness: 0.4, flatShading: true }),
    );
    body.rotation.x = Math.PI / 2; // point the tip forward along -z
    body.castShadow = true;
    this.body = body;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    );
    glow.position.z = 1.1;

    this.mesh.add(body, glow);
    this.mesh.add(new THREE.PointLight(0xffa040, 4, 6).translateZ(1.4));
    this.mesh.position.y = 1;
  }

  update(dt: number, input: Input): void {
    this.time += dt;
    const { x, z } = input.move;
    const max = SPEED * (input.boost ? BOOST : 1);
    const target = new THREE.Vector3(x, 0, z).multiplyScalar(max);
    this.velocity.lerp(target, 1 - Math.exp(-ACCEL * dt));
    this.mesh.position.addScaledVector(this.velocity, dt);

    const half = WORLD_SIZE / 2 - 2;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -half, half);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -half, half);

    // Face the direction of travel and bob gently.
    if (this.velocity.lengthSq() > 0.05) {
      const yaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.mesh.quaternion.slerp(q, 1 - Math.exp(-TURN * dt));
    }
    this.mesh.position.y = 1 + Math.sin(this.time * 3) * 0.12;
  }

  /**
   * Pushes the player out of any rock it overlaps and bounces it off.
   * Returns the speed it hit with (0 when nothing was hit).
   */
  collide(rocks: Rock[]): number {
    const p = this.mesh.position;
    let impact = 0;
    for (const rock of rocks) {
      const dx = p.x - rock.x;
      const dz = p.z - rock.z;
      const min = rock.radius + PLAYER_RADIUS;
      const distSq = dx * dx + dz * dz;
      if (distSq >= min * min) continue;
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;
      p.x = rock.x + nx * min;
      p.z = rock.z + nz * min;
      // Reflect the part of the velocity heading into the rock.
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        impact = Math.max(impact, -into);
        this.velocity.x -= (1 + BOUNCE) * into * nx;
        this.velocity.z -= (1 + BOUNCE) * into * nz;
      }
    }
    return impact;
  }

  /** Flashes the hull red for a moment after a hit (0..1 strength). */
  setDamageFlash(amount: number): void {
    this.body.material.emissive.setRGB(amount, 0, 0);
  }

  reset(): void {
    this.mesh.position.set(0, 1, 0);
    this.mesh.quaternion.identity();
    this.velocity.set(0, 0, 0);
    this.setDamageFlash(0);
  }
}
