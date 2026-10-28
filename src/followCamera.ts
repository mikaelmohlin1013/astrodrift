import * as THREE from 'three';

// Camera that hangs above and behind a target and smoothly trails it, and
// can shake for a moment when something hits hard. It widens a little at
// speed, so going fast feels fast.
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private offset = new THREE.Vector3(0, 18, 12);
  private lookAt = new THREE.Vector3();
  private base = new THREE.Vector3();
  private trauma = 0;
  private time = 0;
  private fov = 50;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  }

  /** Adds a shake, 0..1; shakes add up but never past 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Widens the view with speed (0..1); punches out a little more on a boost. */
  setSpeed(dt: number, speed01: number, boosting: boolean): void {
    const want = 50 + speed01 * 6 + (boosting ? 3 : 0);
    this.fov += (want - this.fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt: number, target: THREE.Vector3, snap = false): void {
    this.time += dt;
    const t = snap ? 1 : 1 - Math.exp(-5 * dt);
    this.base.lerp(target.clone().add(this.offset), t);
    this.lookAt.lerp(target, t);
    this.camera.position.copy(this.base);
    this.camera.lookAt(this.lookAt);
    if (snap) this.trauma = 0;
    if (this.trauma > 0) {
      // Squared so small knocks stay small; smooth noise rather than jitter.
      const s = this.trauma * this.trauma * 0.6;
      const n = (k: number) => Math.sin(this.time * 47 * k) * Math.cos(this.time * 31 * k + k);
      this.camera.position.x += n(1) * s;
      this.camera.position.z += n(1.3) * s;
      this.camera.rotation.z += n(0.7) * s * 0.04;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
  }
}
