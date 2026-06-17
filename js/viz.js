import { TAU } from './audio-engine.js';

const GLASS_COLORS = ['#7ab5b0', '#c4a574', '#d4e8e4', '#a8c4c0', '#e8dcc8'];

/**
 * Top-down map: listener, waves, glass-sand sparkles.
 */
export function createVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = canvas.width * 0.38;
  let sparklePool = [];

  function draw(state) {
    ctx.fillStyle = '#e0ddd4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glass = state.glassSparkle ?? 0;

    if (glass > 0.05) {
      for (let i = 0; i < 40 * glass; i++) {
        const a = Math.random() * TAU;
        const r = R * (0.55 + Math.random() * 0.42);
        const x = cx + Math.sin(a) * r;
        const y = cy - Math.cos(a) * r;
        ctx.fillStyle = GLASS_COLORS[i % GLASS_COLORS.length];
        ctx.globalAlpha = 0.08 + glass * 0.12;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }

    if (state.mode === 'beach') {
      ctx.strokeStyle = '#5a8a88';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#a8c4c0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    for (const w of state.waves) {
      const x = cx + Math.sin(w.angle) * R * 0.9;
      const y = cy - Math.cos(w.angle) * R * 0.9;
      ctx.fillStyle = '#2c2a26';
      ctx.globalAlpha = 0.2 + w.progress * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, 3 + w.progress * 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    sparklePool = sparklePool.filter((s) => {
      s.life -= 0.04;
      return s.life > 0;
    });

    if (state.sparkles != null) {
      for (const s of state.sparkles) {
        sparklePool.push({ ...s, life: 1 });
      }
    }

    for (const s of sparklePool) {
      const x = cx + Math.sin(s.angle) * R * (0.75 + Math.random() * 0.15);
      const y = cy - Math.cos(s.angle) * R * (0.75 + Math.random() * 0.15);
      const idx = Math.floor(s.hue * GLASS_COLORS.length) % GLASS_COLORS.length;
      ctx.fillStyle = GLASS_COLORS[idx];
      ctx.globalAlpha = s.life * (0.5 + glass * 0.5);
      const sz = 2 + s.life * 2;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#4a7c78';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - R * 0.45);
    ctx.stroke();

    ctx.fillStyle = '#4a7c78';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, TAU);
    ctx.fill();

    if (state.waterDepth > 0.01) {
      ctx.strokeStyle = `rgba(74, 124, 120, ${state.waterDepth * 0.45})`;
      ctx.lineWidth = 2 + state.waterDepth * 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + state.waterDepth * 14, 0, TAU);
      ctx.stroke();
    }
  }

  return { draw };
}
