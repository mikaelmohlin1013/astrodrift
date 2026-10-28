import * as THREE from 'three';

const LIFE = 0.9;
const RISE = 60; // pixels a popup floats up over its life

interface Popup {
  el: HTMLDivElement;
  at: THREE.Vector3;
  age: number;
}

// Score numbers that pop up where something scored and float away, drawn
// as HTML on top of the canvas at the point's place on screen.
export class Popups {
  private items: Popup[] = [];
  private layer = document.createElement('div');
  private v = new THREE.Vector3();

  constructor() {
    this.layer.className = 'overlay';
    this.layer.id = 'popups';
    document.body.appendChild(this.layer);
  }

  /** Shows `text` above a world position; `big` for the important ones. */
  show(at: THREE.Vector3, text: string, color: string, big = false): void {
    const el = document.createElement('div');
    el.className = big ? 'popup big' : 'popup';
    el.textContent = text;
    el.style.color = color;
    this.layer.appendChild(el);
    this.items.push({ el, at: at.clone(), age: 0 });
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.items = this.items.filter((p) => {
      p.age += dt;
      if (p.age >= LIFE) {
        p.el.remove();
        return false;
      }
      const t = p.age / LIFE;
      this.v.copy(p.at).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h - t * RISE;
      // Pops in big, settles, then fades out over the last third.
      const scale = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.8);
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
      p.el.style.opacity = String(t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34);
      return true;
    });
  }

  clear(): void {
    for (const p of this.items) p.el.remove();
    this.items = [];
  }
}
