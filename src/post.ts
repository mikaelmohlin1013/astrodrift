import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Darkens the corners and adds a faint film grain, after tone mapping.
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float damage;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      // A touch of colour fringing towards the edges, more when hit.
      vec2 shift = c * (0.002 + damage * 0.006);
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      float v = smoothstep(0.85, 0.25, length(c * vec2(1.0, 0.8)));
      col *= mix(0.55, 1.0, v);
      col += (hash(vUv * 931.0 + time) - 0.5) * 0.025;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const MAX_RATIO = 2;
const MIN_RATIO = 0.75;

// Renders the scene through bloom, tone mapping and a vignette, and lowers
// the resolution if the browser can't keep up.
export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finish: ShaderPass;
  private ratio: number;
  private slowFrames = 0;
  private frames = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.ratio = Math.min(window.devicePixelRatio, MAX_RATIO);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 0.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.resize();
  }

  resize(): void {
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /** `damage` (0..1) briefly smears the colours apart after a hit. */
  render(dt: number, damage: number): void {
    this.finish.uniforms.time.value = (this.finish.uniforms.time.value + dt) % 100;
    this.finish.uniforms.damage.value = damage;
    this.composer.render(dt);
    this.adapt(dt);
  }

  // Counts frames slower than about 45 fps; if most of the last couple of
  // seconds were slow, drops the resolution a step.
  private adapt(dt: number): void {
    this.frames++;
    if (dt > 1 / 45) this.slowFrames++;
    if (this.frames < 120) return;
    if (this.slowFrames > 80 && this.ratio > MIN_RATIO) {
      this.ratio = Math.max(MIN_RATIO, this.ratio - 0.25);
      this.resize();
    }
    this.frames = this.slowFrames = 0;
  }
}
