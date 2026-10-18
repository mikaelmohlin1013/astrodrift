import * as THREE from 'three';
import { Input } from './input';
import { Player } from './player';
import { FollowCamera } from './followCamera';
import { createWorld } from './world';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sun = createWorld(scene);
const sunOffset = sun.position.clone();

const input = new Input();
const player = new Player();
scene.add(player.mesh);

const follow = new FollowCamera(window.innerWidth / window.innerHeight);
follow.update(0, player.mesh.position, true);

window.addEventListener('resize', () => {
  follow.camera.aspect = window.innerWidth / window.innerHeight;
  follow.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt, input);
  follow.update(dt, player.mesh.position);
  sun.target.position.copy(player.mesh.position);
  sun.position.copy(player.mesh.position).add(sunOffset);
  renderer.render(scene, follow.camera);
});
