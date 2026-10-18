import type * as THREE from 'three';
import type { LevelData, Patch, Well } from './level';
import type { Rock } from './world';
import { THEMES, cssColor } from './theme';

const RANGE = 42; // metres from the ship to the radar's edge
const SIZE = 150; // CSS pixels

// The round radar in the corner: rocks, hazards, crystals, enemies, the
// station and the gate around the ship, with north up like the camera.
export class Radar {
  private canvas = document.getElementById('radar') as HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private rocks: Rock[] = [];
  private ice: Patch[] = [];
  private lava: Patch[] = [];
  private wells: Well[] = [];
  private hazard = '#ff5a1a';
  private gate = { x: 0, z: 0 };
  private time = 0;

  constructor() {
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = this.canvas.height = SIZE * ratio;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(ratio, ratio);
  }

  load(level: LevelData, rocks: Rock[]): void {
    this.rocks = rocks;
    this.ice = level.ice ?? [];
    this.lava = level.lava ?? [];
    this.wells = level.wells ?? [];
    this.hazard = cssColor(THEMES[level.theme].veins);
    this.gate = level.gate;
  }

  /** Redraws around `ship`, or hides the radar when there's no run. */
  update(
    ship: THREE.Vector3 | null,
    yaw: number,
    crystals: THREE.Vector3[],
    enemies: { at: THREE.Vector3; turret: boolean }[],
    openGate: THREE.Vector3 | null,
    station: THREE.Vector3,
  ): void {
    this.canvas.classList.toggle('hidden', !ship);
    if (!ship) return;
    this.time += 1 / 60;
    const g = this.g;
    const c = SIZE / 2;
    const k = (c - 4) / RANGE;
    const sx = (x: number) => c + (x - ship.x) * k;
    const sy = (z: number) => c + (z - ship.z) * k;
    const dot = (x: number, z: number, r: number, fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(sx(x), sy(z), r, 0, Math.PI * 2);
      g.fill();
    };

    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.clip();
    const bg = g.createRadialGradient(c, c, 0, c, c, c);
    bg.addColorStop(0, 'rgba(20, 40, 60, 0.55)');
    bg.addColorStop(1, 'rgba(8, 14, 26, 0.75)');
    g.fillStyle = bg;
    g.fillRect(0, 0, SIZE, SIZE);

    // Range rings and a slow sweep.
    g.strokeStyle = 'rgba(140, 200, 255, 0.12)';
    g.lineWidth = 1;
    for (const r of [c / 3, (c * 2) / 3]) {
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    const sweep = this.time * 1.6;
    const cone = g.createConicGradient(sweep, c, c);
    cone.addColorStop(0, 'rgba(106, 255, 216, 0.16)');
    cone.addColorStop(0.12, 'rgba(106, 255, 216, 0)');
    cone.addColorStop(1, 'rgba(106, 255, 216, 0)');
    g.fillStyle = cone;
    g.fillRect(0, 0, SIZE, SIZE);

    // The field's edge.
    g.strokeStyle = 'rgba(255, 107, 94, 0.35)';
    g.strokeRect(sx(-59), sy(-59), 118 * k, 118 * k);

    for (const i of this.ice) dot(i.x, i.z, i.radius * k, 'rgba(180, 230, 255, 0.22)');
    g.globalAlpha = 0.45;
    for (const l of this.lava) dot(l.x, l.z, l.radius * k, this.hazard);
    g.globalAlpha = 1;
    for (const w of this.wells) {
      const grad = g.createRadialGradient(sx(w.x), sy(w.z), 0, sx(w.x), sy(w.z), w.radius * k);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.15, this.hazard);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(sx(w.x), sy(w.z), w.radius * k, 0, Math.PI * 2);
      g.fill();
    }
    for (const r of this.rocks) dot(r.x, r.z, Math.max(1.2, r.radius * k), 'rgba(170, 180, 200, 0.45)');

    // Station: a green plus. Gate: purple once open, dim red while locked.
    g.fillStyle = '#7dff8a';
    g.fillRect(sx(station.x) - 4, sy(station.z) - 1.25, 8, 2.5);
    g.fillRect(sx(station.x) - 1.25, sy(station.z) - 4, 2.5, 8);
    g.strokeStyle = openGate ? '#b49aff' : 'rgba(255, 90, 110, 0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(sx(this.gate.x), sy(this.gate.z), openGate ? 5 + Math.sin(this.time * 6) : 4, 0, Math.PI * 2);
    g.stroke();

    for (const p of crystals) {
      g.fillStyle = '#6affd8';
      g.beginPath();
      g.moveTo(sx(p.x), sy(p.z) - 3.5);
      g.lineTo(sx(p.x) + 2.5, sy(p.z));
      g.lineTo(sx(p.x), sy(p.z) + 3.5);
      g.lineTo(sx(p.x) - 2.5, sy(p.z));
      g.fill();
    }
    for (const e of enemies) {
      if (e.turret) {
        g.fillStyle = '#ff4a5a';
        g.fillRect(sx(e.at.x) - 2.5, sy(e.at.z) - 2.5, 5, 5);
      } else {
        dot(e.at.x, e.at.z, 2.2, '#ff7a86');
      }
    }

    // The ship, pointing where it's heading.
    g.translate(c, c);
    g.rotate(-yaw);
    g.fillStyle = '#e8f4ff';
    g.shadowColor = '#4fc3ff';
    g.shadowBlur = 6;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 4);
    g.lineTo(0, 2);
    g.lineTo(-4, 4);
    g.closePath();
    g.fill();
    g.restore();

    g.strokeStyle = 'rgba(140, 200, 255, 0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.stroke();
  }
}
