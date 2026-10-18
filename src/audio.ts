// Sound effects synthesised with the Web Audio API, so there are no audio
// files to load. Browsers only allow audio after a key press or click, so
// nothing plays until `unlock()` is called from one.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private muted = loadMuted();

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: a low sawtooth hum through a filter that opens with speed.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 200;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  /** Follows the ship's speed (0..1); pass 0 to silence the engine. */
  engine(speed: number, boosting: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed * 40 + (boosting ? 20 : 0), t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(180 + speed * 700 + (boosting ? 500 : 0), t, 0.1);
    this.engineGain.gain.setTargetAtTime(speed > 0.02 ? 0.04 + speed * 0.08 : 0.015, t, 0.1);
  }

  stopEngine(): void {
    if (this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /** Bright two-note chime, rising a little with each crystal in a run. */
  collect(index: number): void {
    const base = 660 * Math.pow(2, (index % 8) / 12);
    this.tone(base, 0, 0.12, 'triangle', 0.25);
    this.tone(base * 1.5, 0.07, 0.25, 'triangle', 0.22);
  }

  /** Thump plus a crunch of noise; louder for harder hits. */
  hit(strength: number): void {
    const s = Math.min(1, strength / 15);
    this.sweep(140, 40, 0, 0.25, 'sine', 0.4 + s * 0.4);
    this.noiseBurst(0, 0.18 + s * 0.15, 1800, 300, 0.25 + s * 0.35);
  }

  /** Soft click when a scraping bump is too gentle to cost hull. */
  bump(): void {
    this.noiseBurst(0, 0.06, 900, 400, 0.08);
  }

  gateOpen(): void {
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, i * 0.09, 0.6, 'sine', 0.16));
  }

  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, i === 5 ? 0.9 : 0.2, 'square', 0.07));
    this.sweep(200, 900, 0, 0.8, 'sine', 0.12);
  }

  explode(): void {
    this.sweep(120, 25, 0, 1.0, 'sawtooth', 0.35);
    this.noiseBurst(0, 1.4, 2500, 80, 0.6);
  }

  start(): void {
    this.sweep(220, 880, 0, 0.35, 'triangle', 0.18);
  }

  private tone(freq: number, delay: number, length: number, type: OscillatorType, volume: number): void {
    this.sweep(freq, freq, delay, length, type, volume);
  }

  private sweep(from: number, to: number, delay: number, length: number, type: OscillatorType, volume: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private noiseBurst(delay: number, length: number, fromHz: number, toHz: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + length + 0.05);
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem('astrodrift.muted') === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem('astrodrift.muted', muted ? '1' : '0');
  } catch {
    // Storage unavailable; the setting just won't persist.
  }
}
