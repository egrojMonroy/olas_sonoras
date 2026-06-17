/**
 * Sea-glass beach: impulsive clinks, grain shuffles, retreat scatter.
 */

const INHARMONIC_RATIOS = [1, 2.37, 3.71, 5.13];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function glassFoamIntensity(progress) {
  if (progress < 0.30 || progress > 0.50) return 0;
  if (progress < 0.36) return (progress - 0.30) / 0.06;
  if (progress < 0.44) return 1;
  return 1 - (progress - 0.44) / 0.06;
}

export function glassRetreatIntensity(progress) {
  if (progress < 0.46 || progress > 0.72) return 0;
  if (progress < 0.52) return (progress - 0.46) / 0.06;
  if (progress < 0.60) return 1;
  return 1 - (progress - 0.60) / 0.12;
}

export class GlassSparkleSynth {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.amount = 0;
    this._noiseBuffer = null;

    this._bus = ctx.createGain();
    this._bus.gain.value = 1;
    this._bright = ctx.createBiquadFilter();
    this._bright.type = 'highshelf';
    this._bright.frequency.value = 2800;
    this._bright.gain.value = 4;
    this._bus.connect(this._bright);
    this._bright.connect(destination);

    this._bedGain = ctx.createGain();
    this._bedGain.gain.value = 0;
    this._bedHp = ctx.createBiquadFilter();
    this._bedHp.type = 'highpass';
    this._bedHp.frequency.value = 3200;
    this._bedBp = ctx.createBiquadFilter();
    this._bedBp.type = 'bandpass';
    this._bedBp.frequency.value = 6500;
    this._bedBp.Q.value = 0.4;
    this._bedGain.connect(this._bedHp);
    this._bedHp.connect(this._bedBp);
    this._bedBp.connect(this._bus);
    this._bedSrc = null;
  }

  startShimmer(noiseBuffer) {
    this._noiseBuffer = noiseBuffer;
    if (this._bedSrc != null) return;
    this._bedSrc = this.ctx.createBufferSource();
    this._bedSrc.buffer = noiseBuffer;
    this._bedSrc.loop = true;
    this._bedSrc.connect(this._bedGain);
    this._bedSrc.start(0);
  }

  setAmount(norm) {
    this.amount = norm;
    const t = this.ctx.currentTime;
    this._bedGain.gain.setTargetAtTime(norm * 0.028, t, 0.08);
    this._bedBp.frequency.setTargetAtTime(5000 + norm * 4500, t, 0.1);
    this._bright.gain.setTargetAtTime(2 + norm * 5, t, 0.1);
    this._bus.gain.setTargetAtTime(0.55 + norm * 1.1, t, 0.08);
  }

  trigger(angleRad, energy, opts = {}) {
    if (this.amount <= 0.004 || energy <= 0) return;

    const retreat = opts.retreat === true;
    const amt = this.amount;
    const baseCount = retreat
      ? 4 + energy * amt * 55
      : 2 + energy * amt * 28;
    const n = Math.min(24, Math.floor(baseCount * (0.45 + Math.random() * 0.55)));

    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (retreat) {
        if (r < 0.55) this._playClink(angleRad, amt, true);
        else if (r < 0.85) this._playGrain(angleRad, amt);
        else this._playScrape(angleRad, amt * 0.5);
      } else if (r < 0.35) {
        this._playClink(angleRad, amt, false);
      } else {
        this._playGrain(angleRad, amt);
      }
    }

    if (energy > 0.35 && Math.random() < energy * amt * 0.35) {
      this._playScatter(angleRad, amt, retreat);
    }
  }

  _pan(angleRad) {
    return clamp(Math.sin(angleRad + (Math.random() - 0.5) * 0.7), -1, 1);
  }

  _playClink(angleRad, amt, retreat) {
    this._playClinkAt(this.ctx.currentTime + Math.random() * 0.025, angleRad, amt, retreat);
  }

  _playGrain(angleRad, amt) {
    this._playGrainAt(this.ctx.currentTime + Math.random() * 0.015, angleRad, amt);
  }

  _playClinkAt(t, angleRad, amt, retreat) {
    const ctx = this.ctx;
    const base = 900 + Math.random() * 4200;
    const panner = ctx.createStereoPanner();
    panner.pan.value = this._pan(angleRad);
    const mix = ctx.createGain();
    mix.gain.value = 1;

    const nPartials = 2 + Math.floor(Math.random() * 3);
    for (let p = 0; p < nPartials; p++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f = base * INHARMONIC_RATIOS[p % INHARMONIC_RATIOS.length];
      osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.04), t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(120, f * 0.82), t + 0.02 + Math.random() * 0.04);

      const g = ctx.createGain();
      const peak = (0.012 + Math.random() * 0.038) * amt * (retreat ? 1.35 : 0.85) / nPartials;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * (retreat ? 0.09 : 0.05));

      osc.connect(g);
      g.connect(mix);
      osc.start(t);
      osc.stop(t + 0.2);
    }

    mix.connect(panner);
    panner.connect(this._bus);
  }

  _playGrainAt(t, angleRad, amt) {
    const ctx = this.ctx;
    if (this._noiseBuffer == null) return;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const offset = Math.random() * Math.max(0, this._noiseBuffer.duration - 0.02);
    src.start(t, offset, 0.018);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3500 + Math.random() * 8000;
    bp.Q.value = 3 + Math.random() * 8;

    const g = ctx.createGain();
    const peak = (0.018 + Math.random() * 0.045) * amt;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.0005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006 + Math.random() * 0.025);

    const panner = ctx.createStereoPanner();
    panner.pan.value = this._pan(angleRad);

    src.connect(bp);
    bp.connect(g);
    g.connect(panner);
    panner.connect(this._bus);
  }

  _playScrape(angleRad, amt) {
    const ctx = this.ctx;
    if (this._noiseBuffer == null) return;
    const t = ctx.currentTime;
    const dur = 0.04 + Math.random() * 0.12;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.start(t, Math.random() * 2, dur);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200 + Math.random() * 3000, t);
    bp.frequency.linearRampToValueAtTime(5500 + Math.random() * 4000, t + dur);
    bp.Q.value = 1.2;

    const g = ctx.createGain();
    const peak = (0.008 + Math.random() * 0.022) * amt;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = this._pan(angleRad);

    src.connect(bp);
    bp.connect(g);
    g.connect(panner);
    panner.connect(this._bus);
  }

  _playScatter(angleRad, amt, retreat) {
    const t0 = this.ctx.currentTime;
    const count = 6 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const delay = i * (0.003 + Math.random() * 0.012);
      const ang = angleRad + (Math.random() - 0.5) * 0.3;
      const a = amt * (retreat ? 1.2 : 1);
      if (Math.random() < 0.6) {
        this._playGrainAt(t0 + delay, ang, a);
      } else {
        this._playClinkAt(t0 + delay, ang, a, retreat);
      }
    }
  }
}
