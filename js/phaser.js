/**
 * Classic multi-stage phaser using allpass filters + LFO.
 */
export class Phaser {
  constructor(ctx, input, output) {
    this.ctx = ctx;
    this.input = input;
    this.output = output;

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 0.55;
    this.wetGain.gain.value = 0.45;

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.08;

    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 600;

    this.lfo.connect(this.lfoDepth);

    this.stages = [];
    this.baseFreqs = [350, 650, 950, 1300, 1700, 2100];
    let prev = input;

    for (let i = 0; i < 6; i++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 0;
      ap.Q.value = 1.2;
      prev.connect(ap);
      const base = ctx.createConstantSource();
      base.offset.value = this.baseFreqs[i];
      base.connect(ap.frequency);
      this.lfoDepth.connect(ap.frequency);
      base.start(0);
      this.stages.push(ap);
      prev = ap;
    }

    prev.connect(this.wetGain);
    input.connect(this.dryGain);

    this.dryGain.connect(output);
    this.wetGain.connect(output);

    this.lfo.start(0);
  }

  setRateHz(hz) {
    this.lfo.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.05);
  }

  setDepth(depth01) {
    this.lfoDepth.gain.setTargetAtTime(200 + depth01 * 1800, this.ctx.currentTime, 0.05);
  }

  setMix(mix01) {
    const wet = mix01;
    const dry = 1 - mix01;
    this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
    this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.05);
  }

  dispose() {
    this.lfo.stop();
  }
}
