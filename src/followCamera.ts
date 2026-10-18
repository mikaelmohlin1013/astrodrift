import * as THREE from 'three';

// Camera that hangs above and behind a target and smoothly trails it.
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private offset = new THREE.Vector3(0, 18, 12);
  private lookAt = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  }

  update(dt: number, target: THREE.Vector3, snap = false): void {
    const t = snap ? 1 : 1 - Math.exp(-5 * dt);
    this.camera.position.lerp(target.clone().add(this.offset), t);
    this.lookAt.lerp(target, t);
    this.camera.lookAt(this.lookAt);
  }
}
