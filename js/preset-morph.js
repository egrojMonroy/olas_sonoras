const PRESET_DEFAULTS = { glassSparkle: 0 };

const NUMERIC_KEYS = [
  'calmness', 'waveDuration', 'waveSpeed', 'waveInterval',
  'phaserRate', 'phaserDepth', 'phaserMix',
  'rotationSpeed', 'manualYaw', 'waveSpread',
  'waterDepth', 'masterVolume', 'glassSparkle',
];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Smoothly morph engine params from current state to a preset.
 */
export class PresetMorph {
  constructor(engine) {
    this.engine = engine;
    this.rafId = null;
    this.active = false;
    this.targetPresetId = null;
  }

  cancel() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.active = false;
    this.targetPresetId = null;
  }

  isActive() {
    return this.active;
  }

  /**
   * @param {object} preset
   * @param {number} durationSec 0 = instant
   * @param {object} callbacks
   */
  morphTo(preset, durationSec, callbacks) {
    this.cancel();

    const applyInstant = () => {
      this.engine.applyPreset(preset, { silent: true });
      for (const key of NUMERIC_KEYS) {
        const raw = preset.values[key] ?? PRESET_DEFAULTS[key];
        if (raw != null && callbacks.onSliderUpdate != null) {
          callbacks.onSliderUpdate(key, raw);
        }
      }
      if (callbacks.onModeUpdate != null) callbacks.onModeUpdate(preset.mode);
      if (callbacks.onAutoRotateUpdate != null) callbacks.onAutoRotateUpdate(preset.autoRotate);
      if (callbacks.onComplete != null) callbacks.onComplete(preset);
    };

    if (durationSec <= 0) {
      applyInstant();
      return;
    }

    const startRaw = this.engine.getRawParams();
    const startMode = this.engine.params.mode;
    const startAuto = this.engine.params.autoRotate;
    let modeApplied = startMode === preset.mode;
    let autoApplied = startAuto === preset.autoRotate;

    this.active = true;
    this.targetPresetId = preset.id;
    const startTime = performance.now();
    const durationMs = durationSec * 1000;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeInOutCubic(t);
      const batch = {};

      for (const key of NUMERIC_KEYS) {
        const from = startRaw[key] ?? 0;
        const to = preset.values[key] ?? PRESET_DEFAULTS[key] ?? from;
        const raw = from + (to - from) * eased;
        batch[key] = this.engine.rawToEngine(key, raw);
        if (callbacks.onSliderUpdate != null) {
          callbacks.onSliderUpdate(key, Math.round(raw));
        }
      }

      if (!modeApplied && t >= 0.5) {
        batch.mode = preset.mode;
        modeApplied = true;
        if (callbacks.onModeUpdate != null) callbacks.onModeUpdate(preset.mode);
      }

      if (!autoApplied && t >= 0.5) {
        batch.autoRotate = preset.autoRotate;
        autoApplied = true;
        if (callbacks.onAutoRotateUpdate != null) callbacks.onAutoRotateUpdate(preset.autoRotate);
      }

      this.engine.setParamsBatch(batch, { silent: true });

      if (t < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.engine.activePresetId = preset.id;
        this.rafId = null;
        this.active = false;
        this.targetPresetId = null;
        if (callbacks.onComplete != null) callbacks.onComplete(preset);
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }
}

export { NUMERIC_KEYS };
