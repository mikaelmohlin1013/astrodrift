// Tracks which keys are held and turns them into steering and thrust.
export class Input {
  private keys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Steering: -1 turns left, 1 turns right. */
  get turn(): number {
    const k = this.keys;
    return (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  }

  /** 1 thrusts forward, -1 brakes and reverses. */
  get thrust(): number {
    const k = this.keys;
    return (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  }

  get fire(): boolean {
    return this.keys.has('Space');
  }

  get boost(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
