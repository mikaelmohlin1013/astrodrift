import * as THREE from 'three';
import type { Input } from './input';
import { WORLD_SIZE } from './world';

const SPEED = 9;
const BOOST = 1.8;
const ACCEL = 10;
const TURN = 12;

// A small hovering rover the player steers around the ground.
export class Player {
  readonly mesh = new THREE.Group();
  private velocity = new THREE.Vector3();
  private time = 0;

  constructor() {
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x4fc3ff, metalness: 0.3, roughness: 0.4, flatShading: true }),
    );
    body.rotation.x = Math.PI / 2; // point the tip forward along -z
    body.castShadow = true;

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
}
