import type { AudioCueType, EventBus } from '../core/EventBus';

/**
 * Procedural Web Audio xenobiotic terrarium soundscape engine.
 * Generates soft alien rainforest breeze, warm mycelial harmonic drone,
 * and subtle organic audio cues for genesis, speciation, hops, spore puffs, mating, and predation.
 */
export class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private breezeFilter: BiquadFilterNode | null = null;
  private tearNoiseBuffer: AudioBuffer | null = null;
  private lastCueTime = 0;
  private enabled = false;

  constructor(events: EventBus) {
    events.on('audio:cue', ({ type }) => {
      if (!this.enabled) return;
      this.playCue(type);
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    if (!this.enabled) this.enable();
    else this.disable();
    return this.enabled;
  }

  private initAudioGraph(): void {
    if (this.ctx) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // 1. Soft alien conservatory harmonic pad
    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 73.42; // D2
    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 110.0; // A2

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 210;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.1;
    oscA.connect(padFilter);
    oscB.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);
    oscA.start();
    oscB.start();

    // 2. Filtered alien cloud-forest foliage breeze
    const bufLen = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.04 * white) / 1.04;
      last = data[i];
      data[i] *= 2.4;
    }

    const breezeSrc = ctx.createBufferSource();
    breezeSrc.buffer = buffer;
    breezeSrc.loop = true;

    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'bandpass';
    breezeFilter.frequency.value = 340;
    breezeFilter.Q.value = 0.9;

    const breezeGain = ctx.createGain();
    breezeGain.gain.value = 0.12;
    breezeSrc.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(master);
    breezeSrc.start();

    // 3. Short filtered noise buffer for rustles / spore puffs / crunch
    const tearLen = Math.max(1, Math.floor(ctx.sampleRate * 0.14));
    const tearBuf = ctx.createBuffer(1, tearLen, ctx.sampleRate);
    const tearData = tearBuf.getChannelData(0);
    for (let i = 0; i < tearLen; i++) {
      tearData[i] = (Math.random() * 2 - 1) * Math.sin((i / tearLen) * Math.PI);
    }

    this.ctx = ctx;
    this.masterGain = master;
    this.breezeFilter = breezeFilter;
    this.tearNoiseBuffer = tearBuf;
  }

  enable(): void {
    try {
      this.initAudioGraph();
      if (!this.ctx || !this.masterGain) return;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.28, now, 0.3);
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  disable(): void {
    this.enabled = false;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.22);
    }
  }

  updateWindAmbience(windStrength: number): void {
    if (!this.enabled || !this.ctx || !this.breezeFilter) return;
    const targetFreq = 260 + windStrength * 320;
    this.breezeFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.4);
  }

  private playTone(freqStart: number, freqEnd: number, duration: number, vol: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playCue(type: AudioCueType): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCueTime < 0.09) return;
    this.lastCueTime = now;

    switch (type) {
      case 'biogenesis':
        this.playTone(293.66, 587.33, 0.55, 0.14, 'sine');
        break;
      case 'phytogenesis':
        this.playTone(392.0, 523.25, 0.45, 0.12, 'triangle');
        break;
      case 'mycogenesis':
        this.playTone(246.94, 369.99, 0.5, 0.13, 'sine');
        break;
      case 'speciation':
        this.playTone(440, 880, 0.65, 0.15, 'sine');
        break;
      case 'mate':
        this.playTone(523.25, 659.25, 0.35, 0.1, 'sine');
        break;
      case 'hop':
        this.playTone(160, 320, 0.12, 0.08, 'triangle');
        break;
      case 'feed':
        this.playTone(340, 260, 0.16, 0.09, 'sine');
        break;
      case 'strike':
        this.playTone(150, 58, 0.18, 0.13, 'sawtooth');
        break;
      case 'spore':
      case 'tear': {
        if (!this.tearNoiseBuffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.tearNoiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = type === 'spore' ? 1150 : 620;
        const g = this.ctx.createGain();
        g.gain.value = type === 'spore' ? 0.11 : 0.09;
        src.connect(f);
        f.connect(g);
        g.connect(this.masterGain);
        src.start(now);
        break;
      }
    }
  }
}
