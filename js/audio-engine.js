import { createPinkNoiseBuffer, createBrownNoiseBuffer, createNoiseSource } from './noise.js';
import { Phaser } from './phaser.js';
import { createUnderwaterReverb } from './reverb.js';

const NUM_SOURCES = 48;
const TAU = Math.PI * 2;

function sourceAngle(index, mode) {
  if (mode === 'beach') {
    const t = index / (NUM_SOURCES - 1);
    return -Math.PI / 2 + t * Math.PI;
  }
  return (index / NUM_SOURCES) * TAU;
}

function gaussian(x, sigma) {
  return Math.exp(-0.5 * (x / sigma) ** 2);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

class WaveEvent {
  constructor(mode, spreadRad, direction = 1) {
    this.mode = mode;
    this.spreadRad = spreadRad;
    this.direction = direction;
    this.progress = 0;
    this.alive = true;

    if (mode === 'beach') {
      this.angle = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      this.angle = Math.random() * TAU;
    }
  }

  update(dt, durationSec, speedNorm) {
    const speed = 0.06 + speedNorm * 0.28;
    this.progress += (dt / durationSec) * speed * 1.8;
    const travel = (speedNorm * 0.65 + 0.15) * dt * 0.75;
    this.angle += this.direction * travel;

    if (this.mode === 'beach') {
      if (this.direction > 0 && this.angle > Math.PI / 2 + this.spreadRad * 1.5) this.alive = false;
      if (this.direction < 0 && this.angle < -Math.PI / 2 - this.spreadRad * 1.5) this.alive = false;
    } else if (this.progress >= 1.08) {
      this.alive = false;
    }
  }

  /**
   * Realistic swell envelope: quiet approach → build → foam peak → suck-back → decay.
   */
  temporalEnv(t) {
    if (t < 0.12) return (t / 0.12) ** 2.2 * 0.15;
    if (t < 0.38) return 0.15 + ((t - 0.12) / 0.26) ** 1.4 * 0.55;
    if (t < 0.44) return 0.7 + ((t - 0.38) / 0.06) * 0.35;
    if (t < 0.52) return 1.05 - ((t - 0.44) / 0.08) * 0.45;
    const decay = 1 - (t - 0.52) / 0.48;
    return Math.max(0, decay ** 1.6) * 0.75;
  }

  /** Brief high-frequency foam burst at break. */
  foamEnv(t) {
    if (t < 0.34 || t > 0.5) return 0;
    return Math.exp(-((t - 0.41) ** 2) / 0.0018) * 1.6;
  }

  contribution(sourceIdxAngle, spreadRad, sourceIndex) {
    const diff = wrapAngle(sourceIdxAngle - this.angle);
    const spatial = gaussian(diff, spreadRad);
    const t = Math.min(1, this.progress);
    const body = this.temporalEnv(t);
    const foam = this.foamEnv(t);
    const isHighBand = sourceIndex > NUM_SOURCES * 0.55;
    const foamBoost = isHighBand ? foam * 2.2 : foam * 0.3;
    return spatial * (body + foamBoost);
  }
}

export class BeachWaveEngine {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.params = {
      mode: 'beach',
      calmness: 0.72,
      waveDuration: 28,
      waveSpeed: 0.25,
      waveInterval: 12,
      phaserRate: 0.06,
      phaserDepth: 0.55,
      phaserMix: 0.45,
      rotationSpeed: 18,
      manualYaw: 0,
      autoRotate: true,
      waveSpread: 0.35,
      waterDepth: 0,
      masterVolume: 0.7,
    };

    this.listenerYaw = 0;
    this._autoYaw = 0;
    this.waves = [];
    this.spawnTimer = 0;
    this._nextIntervalMul = 1;
    this.lastTick = 0;
    this.rafId = null;
    this.onVizUpdate = null;
    this.activePresetId = null;
  }

  async start(options = {}) {
    const { audible = true, fadeSec = 3 } = options;

    if (this.ctx != null) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (audible && !this.audible) await this.fadeIn(fadeSec);
      return;
    }

    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this._buildGraph();
    this.running = true;
    this.lastTick = performance.now();
    this._tick();

    if (audible) {
      await this.fadeIn(fadeSec);
    }
  }

  isReady() {
    return this.ctx != null && this.running;
  }

  isAudible() {
    return this.audible === true;
  }

  fadeIn(durationSec = 3) {
    if (this.outputGain == null || this.ctx == null) return Promise.resolve();
    const now = this.ctx.currentTime;
    const g = this.outputGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + Math.max(0.05, durationSec));
    this.audible = true;
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(50, durationSec * 1000));
    });
  }

  fadeOut(durationSec = 3) {
    if (this.outputGain == null || this.ctx == null) return Promise.resolve();
    const now = this.ctx.currentTime;
    const g = this.outputGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.05, durationSec));
    this.audible = false;
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(50, durationSec * 1000));
    });
  }

  async stopAudio(fadeSec = 3) {
    await this.fadeOut(fadeSec);
  }

  async _buildGraph() {
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.params.masterVolume;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 0;

    this.waterLowpass = ctx.createBiquadFilter();
    this.waterLowpass.type = 'lowpass';
    this.waterLowpass.frequency.value = 12000;
    this.waterLowpass.Q.value = 0.7;

    this.waterLowShelf = ctx.createBiquadFilter();
    this.waterLowShelf.type = 'lowshelf';
    this.waterLowShelf.frequency.value = 180;
    this.waterLowShelf.gain.value = 0;

    this.recordTap = ctx.createGain();
    this.recordTap.gain.value = 1;

    this.recorderDest = ctx.createMediaStreamDestination();

    this.masterGain.connect(this.outputGain);
    this.outputGain.connect(this.waterLowpass);
    this.waterLowpass.connect(this.waterLowShelf);
    this.waterLowShelf.connect(ctx.destination);
    this.waterLowShelf.connect(this.recordTap);
    this.recordTap.connect(this.recorderDest);

    this.audible = false;

    const pink = createPinkNoiseBuffer(ctx, 8);
    const brown = createBrownNoiseBuffer(ctx, 8);

    // --- Swell (low rumble between waves) ---
    this.swellGain = ctx.createGain();
    this.swellGain.gain.value = 0.2;
    this.swellLow = ctx.createBiquadFilter();
    this.swellLow.type = 'lowpass';
    this.swellLow.frequency.value = 140;
    this.swellLow.Q.value = 0.5;
    this.swellLfo = ctx.createOscillator();
    this.swellLfo.type = 'sine';
    this.swellLfo.frequency.value = 0.045;
    this.swellLfoDepth = ctx.createGain();
    this.swellLfoDepth.gain.value = 0.08;
    this.swellLfo.connect(this.swellLfoDepth);
    this.swellLfoDepth.connect(this.swellGain.gain);
    this.swellLfo.start(0);

    const swellSrc = createNoiseSource(ctx, brown);
    swellSrc.connect(this.swellLow);
    this.swellLow.connect(this.swellGain);
    this.swellGain.connect(this.masterGain);
    swellSrc.start(0);

    // --- Bed wash + phaser ---
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.22;

    this.bedBand = ctx.createBiquadFilter();
    this.bedBand.type = 'bandpass';
    this.bedBand.frequency.value = 380;
    this.bedBand.Q.value = 0.45;

    this.bedAmLfo = ctx.createOscillator();
    this.bedAmLfo.type = 'sine';
    this.bedAmLfo.frequency.value = 0.07;
    this.bedAmDepth = ctx.createGain();
    this.bedAmDepth.gain.value = 0.08;
    this.bedAmLfo.connect(this.bedAmDepth);
    this.bedAmDepth.connect(this.bedGain.gain);
    this.bedAmLfo.start(0);

    const bedSrc = createNoiseSource(ctx, pink);
    bedSrc.connect(this.bedBand);

    this.bedPhaserOut = ctx.createGain();
    this.phaser = new Phaser(ctx, this.bedBand, this.bedPhaserOut);
    this.bedPhaserOut.connect(this.bedGain);

    this.reflectionDelay = ctx.createDelay(0.08);
    this.reflectionDelay.delayTime.value = 0.018;
    this.reflectionGain = ctx.createGain();
    this.reflectionGain.gain.value = 0.18;
    this.bedGain.connect(this.reflectionDelay);
    this.reflectionDelay.connect(this.reflectionGain);
    this.reflectionGain.connect(this.masterGain);
    this.bedGain.connect(this.masterGain);
    bedSrc.start(0);

    // --- Traveling wave ring ---
    this.waveBusGain = ctx.createGain();
    this.waveBusGain.gain.value = 0.5;
    this.waveBusGain.connect(this.masterGain);

    this.waveSources = [];
    this.waveGains = [];
    this.wavePanners = [];
    this.waveBands = [];

    const waveNoiseSrc = createNoiseSource(ctx, pink);
    const waveSplit = ctx.createGain();
    waveNoiseSrc.connect(waveSplit);

    for (let i = 0; i < NUM_SOURCES; i++) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      const bandT = i / NUM_SOURCES;
      band.frequency.value = 180 + bandT * bandT * 2200;
      band.Q.value = 0.7 + (i % 5) * 0.12;

      const g = ctx.createGain();
      g.gain.value = 0;

      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;

      waveSplit.connect(band);
      band.connect(g);
      g.connect(panner);
      panner.connect(this.waveBusGain);

      this.waveSources.push(sourceAngle(i, 'beach'));
      this.waveGains.push(g);
      this.wavePanners.push(panner);
      this.waveBands.push(band);
    }
    waveNoiseSrc.start(0);

    // --- Underwater ---
    this.bubbleGain = ctx.createGain();
    this.bubbleGain.gain.value = 0;
    const bubbleSrc = createNoiseSource(ctx, pink);
    const bubbleHp = ctx.createBiquadFilter();
    bubbleHp.type = 'highpass';
    bubbleHp.frequency.value = 600;
    const bubbleBp = ctx.createBiquadFilter();
    bubbleBp.type = 'bandpass';
    bubbleBp.frequency.value = 1800;
    bubbleBp.Q.value = 2;
    bubbleSrc.connect(bubbleHp);
    bubbleHp.connect(bubbleBp);
    bubbleBp.connect(this.bubbleGain);

    this.reverbMix = ctx.createGain();
    this.reverbMix.gain.value = 0;
    this.reverb = createUnderwaterReverb(ctx, this.bubbleGain, this.masterGain, this.reverbMix);
    this.bubbleGain.connect(this.masterGain);
    bubbleSrc.start(0);

    this._applyParams();
    this._spawnWave();
  }

  applyPreset(preset, options = {}) {
    const silent = options.silent === true;
    if (!silent) this.activePresetId = preset.id;
    this.setParam('mode', preset.mode, { silent: true });
    this.setParam('autoRotate', preset.autoRotate, { silent: true });
    for (const [key, raw] of Object.entries(preset.values)) {
      this.params[key] = this.rawToEngine(key, raw);
    }
    if (this.ctx != null) this._applyParams();
    if (silent) this.activePresetId = preset.id;
    return preset;
  }

  rawToEngine(key, raw) {
    const map = {
      calmness: raw / 100,
      waveDuration: raw,
      waveSpeed: raw / 100,
      waveInterval: raw,
      phaserRate: 0.02 + (raw / 100) * 0.35,
      phaserDepth: raw / 100,
      phaserMix: raw / 100,
      rotationSpeed: raw * 0.6,
      manualYaw: raw,
      waveSpread: raw / 100,
      waterDepth: raw / 100,
      masterVolume: raw / 100,
    };
    return map[key] ?? raw;
  }

  getRawParams() {
    return {
      calmness: Math.round(this.params.calmness * 100),
      waveDuration: Math.round(this.params.waveDuration),
      waveSpeed: Math.round(this.params.waveSpeed * 100),
      waveInterval: Math.round(this.params.waveInterval),
      phaserRate: Math.round(((this.params.phaserRate - 0.02) / 0.35) * 100),
      phaserDepth: Math.round(this.params.phaserDepth * 100),
      phaserMix: Math.round(this.params.phaserMix * 100),
      rotationSpeed: Math.round(this.params.rotationSpeed / 0.6),
      manualYaw: Math.round(this.params.manualYaw),
      waveSpread: Math.round(this.params.waveSpread * 100),
      waterDepth: Math.round(this.params.waterDepth * 100),
      masterVolume: Math.round(this.params.masterVolume * 100),
    };
  }

  setParam(key, value, options = {}) {
    const silent = options.silent === true;
    this.params[key] = value;
    if (!silent && key !== 'mode' && key !== 'autoRotate') {
      this.activePresetId = null;
    }
    if (this.ctx != null) this._applyParams();
    if (key === 'mode') this._rebuildSourceAngles();
  }

  /** Batch update for preset morphing — one _applyParams per frame. */
  setParamsBatch(updates, options = {}) {
    const silent = options.silent === true;
    let modeChanged = false;
    for (const [key, value] of Object.entries(updates)) {
      this.params[key] = value;
      if (key === 'mode') modeChanged = true;
    }
    if (!silent) this.activePresetId = null;
    if (this.ctx != null) this._applyParams();
    if (modeChanged) this._rebuildSourceAngles();
  }

  _rebuildSourceAngles() {
    for (let i = 0; i < NUM_SOURCES; i++) {
      this.waveSources[i] = sourceAngle(i, this.params.mode);
    }
  }

  _applyParams() {
    const p = this.params;
    if (this.masterGain == null) return;

    this.masterGain.gain.setTargetAtTime(p.masterVolume, this.ctx.currentTime, 0.05);

    if (this.phaser != null) {
      this.phaser.setRateHz(p.phaserRate);
      this.phaser.setDepth(p.phaserDepth);
      this.phaser.setMix(p.phaserMix);
    }

    const calm = p.calmness;
    const calmInv = 1 - calm;

    this.bedBand.frequency.setTargetAtTime(220 + calm * 480, this.ctx.currentTime, 0.1);
    this.bedGain.gain.setTargetAtTime(0.08 + calm * 0.22, this.ctx.currentTime, 0.1);
    this.bedAmLfo.frequency.setTargetAtTime(0.035 + calm * 0.1, this.ctx.currentTime, 0.1);
    this.reflectionGain.gain.setTargetAtTime(0.1 + calm * 0.15, this.ctx.currentTime, 0.1);

    this.swellGain.gain.setTargetAtTime(0.12 + calmInv * 0.18, this.ctx.currentTime, 0.1);
    this.swellLow.frequency.setTargetAtTime(90 + calmInv * 60, this.ctx.currentTime, 0.1);
    this.swellLfo.frequency.setTargetAtTime(0.025 + calmInv * 0.04, this.ctx.currentTime, 0.1);

    this.waveBusGain.gain.setTargetAtTime(0.35 + calm * 0.55, this.ctx.currentTime, 0.1);

    const w = p.waterDepth;
    this.waterLowpass.frequency.setTargetAtTime(12000 - w * 9500, this.ctx.currentTime, 0.15);
    this.waterLowShelf.gain.setTargetAtTime(w * 8, this.ctx.currentTime, 0.15);
    this.bubbleGain.gain.setTargetAtTime(w * 0.06 + calm * w * 0.04, this.ctx.currentTime, 0.15);
    this.reverbMix.gain.setTargetAtTime(w * 0.45, this.ctx.currentTime, 0.15);
    this.reverb.wet.gain.setTargetAtTime(0.2 + w * 0.5, this.ctx.currentTime, 0.15);
  }

  _spawnWave() {
    const spread = 0.06 + this.params.waveSpread * 0.28;
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.waves.push(new WaveEvent(this.params.mode, spread, dir));
  }

  _tick = () => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    const p = this.params;

    if (p.autoRotate) {
      this._autoYaw += (p.rotationSpeed * (TAU / 360) / 60) * dt;
    }
    this.listenerYaw = (p.manualYaw * Math.PI) / 180 + (p.autoRotate ? this._autoYaw : 0);

    this.spawnTimer += dt;
    const threshold = p.waveInterval * this._nextIntervalMul;
    if (this.spawnTimer >= threshold) {
      this.spawnTimer = 0;
      this._nextIntervalMul = 0.7 + Math.random() * 0.65;
      this._spawnWave();
    }

    const spreadRad = 0.06 + p.waveSpread * 0.32;
    this.waves = this.waves.filter((w) => {
      w.update(dt, p.waveDuration, p.waveSpeed);
      return w.alive;
    });

    const gains = new Array(NUM_SOURCES).fill(0);
    for (const wave of this.waves) {
      for (let i = 0; i < NUM_SOURCES; i++) {
        gains[i] += wave.contribution(this.waveSources[i], spreadRad, i);
      }
    }

    const waveGainScale = 0.28 + p.calmness * 0.35;
    const vizWaves = [];

    for (let i = 0; i < NUM_SOURCES; i++) {
      const g = Math.min(1.2, gains[i] * 1.4);
      const rel = wrapAngle(this.waveSources[i] - this.listenerYaw);
      const pan = Math.sin(rel);
      const seaFacing = p.mode === 'beach' ? Math.max(0.04, Math.cos(rel)) ** 1.6 : 1;
      this.wavePanners[i].pan.setTargetAtTime(pan * 0.95, this.ctx.currentTime, 0.03);
      this.waveGains[i].gain.setTargetAtTime(g * waveGainScale * seaFacing, this.ctx.currentTime, 0.03);
    }

    for (const wave of this.waves) {
      vizWaves.push({ angle: wave.angle - this.listenerYaw, progress: wave.progress });
    }

    if (this.onVizUpdate != null) {
      this.onVizUpdate({
        listenerYaw: this.listenerYaw,
        mode: p.mode,
        waves: vizWaves,
        waterDepth: p.waterDepth,
      });
    }

    this.rafId = requestAnimationFrame(this._tick);
  };

  getRecordTap() {
    return this.recordTap ?? null;
  }

  getMediaStream() {
    return this.recorderDest?.stream ?? null;
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
  }

  dispose() {
    this.stop();
    if (this.phaser != null) this.phaser.dispose();
    if (this.ctx != null) this.ctx.close();
    this.ctx = null;
  }
}

export { NUM_SOURCES, TAU, wrapAngle };
