// Sound effects synthesised with the Web Audio API, so there are no audio
// files to load. Browsers only allow audio after a key press or click, so
// nothing plays until `unlock()` is called from one.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineOscs: OscillatorNode[] = [];
  private engineFilter!: BiquadFilterNode;
  private airGain!: GainNode;
  private airFilter!: BiquadFilterNode;
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

    // Engine: a soft hum of two detuned sine waves (no harsh harmonics),
    // gently wobbled, plus a breath of filtered noise for thrust.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineFilter.Q.value = 0.3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 1.5;
    lfo.connect(lfoDepth);
    for (const [type, detune] of [['sine', 0], ['sine', 702], ['triangle', 1200]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 70;
      osc.detune.value = detune; // root, a fifth and an octave up
      lfoDepth.connect(osc.frequency);
      const level = ctx.createGain();
      level.gain.value = type === 'triangle' ? 0.25 : 0.5;
      osc.connect(level).connect(this.engineFilter);
      osc.start();
      this.engineOscs.push(osc);
    }
    lfo.start();

    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.frequency.value = 500;
    this.airFilter.Q.value = 0.8;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    air.connect(this.airFilter).connect(this.airGain).connect(this.master);
    air.start();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  /** Follows the ship's speed (0..1) and whether the engines are firing. */
  engine(speed: number, thrusting: boolean, boosting: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pitch = 62 + speed * 22 + (boosting ? 8 : 0);
    for (const osc of this.engineOscs) osc.frequency.setTargetAtTime(pitch, t, 0.25);
    this.engineFilter.frequency.setTargetAtTime(220 + speed * 260 + (thrusting ? 120 : 0), t, 0.2);
    this.engineGain.gain.setTargetAtTime(0.025 + speed * 0.035 + (thrusting ? 0.015 : 0), t, 0.2);
    this.airFilter.frequency.setTargetAtTime(boosting ? 900 : 500, t, 0.2);
    this.airGain.gain.setTargetAtTime(thrusting ? (boosting ? 0.05 : 0.025) : 0, t, 0.15);
  }

  stopEngine(): void {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.airGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
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

  /** Short zap for the ship's laser. */
  laser(): void {
    this.sweep(1500, 420, 0, 0.09, 'square', 0.05);
    this.sweep(900, 300, 0, 0.07, 'triangle', 0.06);
  }

  /** Lower, buzzier shot for enemy turrets. */
  enemyShot(): void {
    this.sweep(520, 160, 0, 0.18, 'sawtooth', 0.06);
  }

  /** Tick when a bolt hits an enemy without destroying it. */
  enemyHit(): void {
    this.noiseBurst(0, 0.07, 3000, 800, 0.12);
    this.tone(1200, 0, 0.05, 'square', 0.04);
  }

  /** Pop and crackle when an enemy is destroyed. */
  enemyDie(): void {
    this.sweep(300, 50, 0, 0.35, 'square', 0.12);
    this.noiseBurst(0, 0.45, 3000, 120, 0.35);
  }

  /** Two quick beeps when a chaser spots the ship. */
  alert(): void {
    this.tone(880, 0, 0.07, 'square', 0.05);
    this.tone(660, 0.09, 0.09, 'square', 0.05);
  }

  /** Whoosh of a missile launch. */
  missile(): void {
    this.noiseBurst(0, 0.5, 500, 2600, 0.22);
    this.sweep(180, 620, 0, 0.35, 'sawtooth', 0.05);
  }

  /** Bright shimmer when the shield absorbs a hit. */
  shieldHit(): void {
    this.sweep(1900, 900, 0, 0.22, 'sine', 0.12);
    this.sweep(2600, 1300, 0.02, 0.18, 'triangle', 0.05);
  }

  /** Falling buzz when the shield runs out. */
  shieldDown(): void {
    this.sweep(900, 120, 0, 0.5, 'square', 0.06);
  }

  /** Rising arpeggio when the ship docks at a repair station. */
  dock(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.07, 0.35, 'sine', 0.15));
  }

  /** Two-note ka-ching for buying an upgrade. */
  buy(): void {
    this.tone(988, 0, 0.08, 'square', 0.06);
    this.tone(1319, 0.08, 0.3, 'triangle', 0.14);
  }

  /** Low buzz when something can't be bought. */
  deny(): void {
    this.sweep(200, 150, 0, 0.18, 'square', 0.07);
  }

  /** Soft blip for moving the shop selection. */
  tick(): void {
    this.tone(1200, 0, 0.03, 'sine', 0.05);
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
