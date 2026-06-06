import { TAU } from './audio-engine.js';

/**
 * Top-down map: listener at center, waves as arcs, sea direction in beach mode.
 */
export function createVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = canvas.width * 0.38;

  function draw(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sea arc (beach mode)
    if (state.mode === 'beach') {
      ctx.strokeStyle = 'rgba(26, 107, 138, 0.55)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(26, 107, 138, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    // Wave fronts
    for (const w of state.waves) {
      const x = cx + Math.sin(w.angle) * R * 0.92;
      const y = cy - Math.cos(w.angle) * R * 0.92;
      const alpha = 0.25 + w.progress * 0.55;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 5 + w.progress * 4, 0, TAU);
      ctx.fill();
    }

    // Listener facing indicator
    const fx = cx + Math.sin(0) * 0;
    const fy = cy - R * 0.55;
    ctx.strokeStyle = 'rgba(126, 200, 227, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - R * 0.5);
    ctx.stroke();

    // Listener dot
    ctx.fillStyle = '#7ec8e3';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, TAU);
    ctx.fill();

    // Water depth ring
    if (state.waterDepth > 0.01) {
      ctx.strokeStyle = `rgba(61, 155, 233, ${state.waterDepth * 0.5})`;
      ctx.lineWidth = 3 + state.waterDepth * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + state.waterDepth * 20, 0, TAU);
      ctx.stroke();
    }
  }

  return { draw };
}
