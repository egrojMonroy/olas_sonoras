/**
 * Simple delay-based underwater reverb.
 */
export function createUnderwaterReverb(ctx, input, output, mixGain) {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 0.65;
  wet.gain.value = 0.35;

  input.connect(dry);
  input.connect(wet);

  const delays = [0.023, 0.041, 0.067, 0.097];
  const feedbacks = [0.35, 0.28, 0.22, 0.18];
  const filters = [];

  let merge = ctx.createGain();
  merge.gain.value = 0.25;

  for (let i = 0; i < delays.length; i++) {
    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = delays[i];
    const fb = ctx.createGain();
    fb.gain.value = feedbacks[i];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    filters.push(lp);

    wet.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(merge);
  }

  const reverbOut = ctx.createGain();
  merge.connect(reverbOut);
  dry.connect(output);
  reverbOut.connect(mixGain);
  mixGain.connect(output);

  return { wet, dry, filters, mixGain };
}
