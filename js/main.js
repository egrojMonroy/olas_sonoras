import { BeachWaveEngine } from './audio-engine.js';
import { AudioRecorder } from './recorder.js';
import { createVisualizer } from './viz.js';
import { PRESETS } from './presets.js';
import { PresetMorph } from './preset-morph.js';

const engine = new BeachWaveEngine();
const recorder = new AudioRecorder();
const presetMorph = new PresetMorph(engine);

const canvas = document.getElementById('vizCanvas');
const viz = createVisualizer(canvas);

engine.onVizUpdate = (state) => viz.draw(state);

const sliderKeys = [
  'calmness', 'waveDuration', 'waveSpeed', 'waveInterval',
  'phaserRate', 'phaserDepth', 'phaserMix',
  'rotationSpeed', 'manualYaw', 'waveSpread',
  'waterDepth', 'masterVolume', 'glassSparkle',
];

const bindings = [
  { id: 'calmness', key: 'calmness', scale: (v) => v / 100 },
  { id: 'waveDuration', key: 'waveDuration', scale: (v) => v },
  { id: 'waveSpeed', key: 'waveSpeed', scale: (v) => v / 100 },
  { id: 'waveInterval', key: 'waveInterval', scale: (v) => v },
  { id: 'phaserRate', key: 'phaserRate', scale: (v) => 0.02 + (v / 100) * 0.35 },
  { id: 'phaserDepth', key: 'phaserDepth', scale: (v) => v / 100 },
  { id: 'phaserMix', key: 'phaserMix', scale: (v) => v / 100 },
  { id: 'rotationSpeed', key: 'rotationSpeed', scale: (v) => v * 0.6 },
  { id: 'manualYaw', key: 'manualYaw', scale: (v) => v },
  { id: 'waveSpread', key: 'waveSpread', scale: (v) => v / 100 },
  { id: 'waterDepth', key: 'waterDepth', scale: (v) => v / 100 },
  { id: 'masterVolume', key: 'masterVolume', scale: (v) => v / 100 },
  { id: 'glassSparkle', key: 'glassSparkle', scale: (v) => v / 100 },
];

const sliderInputs = {};
let programmaticSliderUpdate = false;
let presetTransitionSec = 10;
let recordFadeSec = 4;
let transportBusy = false;

function getPresetTransitionSec() {
  return presetTransitionSec;
}

function getRecordFadeSec() {
  return recordFadeSec;
}

function setSliderUI(id, raw) {
  const input = sliderInputs[id];
  const label = document.getElementById(`${id}Val`);
  if (input != null) input.value = String(raw);
  if (label != null) {
    label.textContent = id === 'manualYaw' ? `${raw}°` : String(raw);
  }
}

function bindSlider({ id, key, scale }) {
  const input = document.getElementById(id);
  sliderInputs[id] = input;
  const update = () => {
    if (programmaticSliderUpdate) return;
    presetMorph.cancel();
    clearPresetHighlight();
    const raw = Number(input.value);
    setSliderUI(id, raw);
    engine.setParam(key, scale(raw));
  };
  input.addEventListener('input', update);
  programmaticSliderUpdate = true;
  setSliderUI(id, Number(input.value));
  engine.setParam(key, scale(Number(input.value)));
  programmaticSliderUpdate = false;
}

bindings.forEach(bindSlider);

const presetTransitionInput = document.getElementById('presetTransition');
const presetTransitionVal = document.getElementById('presetTransitionVal');

presetTransitionInput.addEventListener('input', () => {
  presetTransitionSec = Number(presetTransitionInput.value);
  presetTransitionVal.textContent = presetTransitionSec === 0 ? 'Instantáneo' : `${presetTransitionSec} s`;
});

presetTransitionVal.textContent = `${presetTransitionSec} s`;

const recordFadeInput = document.getElementById('recordFade');
const recordFadeVal = document.getElementById('recordFadeVal');

recordFadeInput.addEventListener('input', () => {
  recordFadeSec = Number(recordFadeInput.value);
  recordFadeVal.textContent = recordFadeSec === 0 ? 'Sin fade' : `${recordFadeSec} s`;
});

recordFadeVal.textContent = `${recordFadeSec} s`;

function clearPresetHighlight() {
  document.querySelectorAll('.btn-preset').forEach((b) => {
    b.classList.remove('active', 'morph-target', 'morphing');
  });
}

function highlightPreset(presetId, { morphing = false } = {}) {
  document.querySelectorAll('.btn-preset').forEach((b) => {
    const match = b.dataset.presetId === presetId;
    b.classList.toggle('active', match && !morphing);
    b.classList.toggle('morph-target', match);
    b.classList.toggle('morphing', match && morphing);
  });
}

function applyPresetToUI(preset) {
  highlightPreset(preset.id, { morphing: getPresetTransitionSec() > 0 });

  presetMorph.morphTo(preset, getPresetTransitionSec(), {
    onSliderUpdate: (key, raw) => {
      programmaticSliderUpdate = true;
      setSliderUI(key, raw);
      programmaticSliderUpdate = false;
    },
    onModeUpdate: (mode) => setMode(mode, false),
    onAutoRotateUpdate: (checked) => {
      document.getElementById('autoRotate').checked = checked;
    },
    onComplete: (p) => highlightPreset(p.id, { morphing: false }),
  });
}

const presetGrid = document.getElementById('presetGrid');
for (const preset of PRESETS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-preset';
  btn.dataset.presetId = preset.id;
  btn.innerHTML = `<strong>${preset.name}</strong><span>${preset.description}</span>`;
  btn.addEventListener('click', () => applyPresetToUI(preset));
  presetGrid.appendChild(btn);
}

document.getElementById('autoRotate').addEventListener('change', (e) => {
  presetMorph.cancel();
  clearPresetHighlight();
  engine.setParam('autoRotate', e.target.checked);
});

const btnBeach = document.getElementById('btnBeach');
const btnBay = document.getElementById('btnBay');

function setMode(mode, clearPreset = true) {
  engine.setParam('mode', mode);
  btnBeach.classList.toggle('active', mode === 'beach');
  btnBay.classList.toggle('active', mode === 'bay');
  if (clearPreset) {
    presetMorph.cancel();
    clearPresetHighlight();
  }
}

btnBeach.addEventListener('click', () => setMode('beach'));
btnBay.addEventListener('click', () => setMode('bay'));

const btnListen = document.getElementById('btnListen');
const btnStop = document.getElementById('btnStop');
const btnRecord = document.getElementById('btnRecord');
const recordStatus = document.getElementById('recordStatus');
const recordFormat = document.getElementById('recordFormat');

function updateTransportUI() {
  const audible = engine.isAudible();
  const recording = recorder.recording;
  btnListen.disabled = transportBusy || audible || recording;
  btnStop.disabled = transportBusy || !audible || recording;
  btnRecord.disabled = transportBusy;
  btnListen.textContent = audible ? 'Escuchando…' : 'Escuchar';
}

updateTransportUI();

recordFormat.addEventListener('change', () => {
  recorder.setFormat(recordFormat.value);
});

recorder.setFormat('wav');

async function ensureEngineSilent() {
  if (!engine.isReady()) {
    await engine.start({ audible: false, fadeSec: 0 });
  } else if (engine.isAudible()) {
    await engine.fadeOut(getRecordFadeSec());
  } else if (engine.outputGain != null && engine.ctx != null) {
    engine.outputGain.gain.setValueAtTime(0, engine.ctx.currentTime);
    engine.audible = false;
  }
}

btnListen.addEventListener('click', async () => {
  if (transportBusy || recorder.recording) return;
  transportBusy = true;
  updateTransportUI();
  recordStatus.textContent = 'Entrando…';
  try {
    if (!engine.isReady()) {
      await engine.start({ audible: false, fadeSec: 0 });
    }
    await engine.fadeIn(getRecordFadeSec());
    recordStatus.textContent = '';
  } catch (err) {
    recordStatus.textContent = 'Error al iniciar audio';
  }
  transportBusy = false;
  updateTransportUI();
});

btnStop.addEventListener('click', async () => {
  if (transportBusy || recorder.recording) {
    recordStatus.textContent = 'Detén la grabación antes de parar el audio';
    setTimeout(() => { recordStatus.textContent = recorder.recording ? recordStatus.textContent : ''; }, 2500);
    return;
  }
  transportBusy = true;
  updateTransportUI();
  recordStatus.textContent = 'Saliendo…';
  try {
    await engine.stopAudio(getRecordFadeSec());
    recordStatus.textContent = 'Audio detenido';
    setTimeout(() => { recordStatus.textContent = ''; }, 2000);
  } catch (err) {
    recordStatus.textContent = 'Error al parar';
  }
  transportBusy = false;
  updateTransportUI();
});

btnRecord.addEventListener('click', async () => {
  if (transportBusy) return;

  if (!recorder.recording) {
    transportBusy = true;
    updateTransportUI();
    const fmt = recordFormat.value;
    const fade = getRecordFadeSec();
    recorder.setFormat(fmt);

    try {
      await ensureEngineSilent();

      if (fmt === 'wav') {
        recorder.start(engine.ctx, engine.getRecordTap());
      } else {
        recorder.start(engine.ctx, null, engine.getMediaStream());
      }

      btnRecord.textContent = '■ Detener grabación';
      btnRecord.classList.add('recording');
      recordStatus.textContent = fade > 0 ? `Grabando · fade-in ${fade} s…` : `Grabando ${fmt.toUpperCase()}…`;

      transportBusy = false;
      updateTransportUI();

      if (fade > 0) {
        await engine.fadeIn(fade);
      } else {
        await engine.fadeIn(0.05);
      }
      if (recorder.recording) {
        recordStatus.textContent = `Grabando ${fmt.toUpperCase()}…`;
      }
    } catch (err) {
      recordStatus.textContent = 'Error al iniciar grabación';
      btnRecord.textContent = '● Grabar';
      btnRecord.classList.remove('recording');
      transportBusy = false;
      updateTransportUI();
    }
  } else {
    transportBusy = true;
    updateTransportUI();
    const fade = getRecordFadeSec();
    recordStatus.textContent = fade > 0 ? `Fade-out ${fade} s…` : 'Finalizando…';

    try {
      if (fade > 0) {
        await engine.fadeOut(fade);
      }
      const blob = await recorder.stop();
      const ext = blob.type.includes('wav') ? 'WAV' : 'WebM';
      recorder.download(blob);
      recordStatus.textContent = `${ext} descargado`;
      setTimeout(() => { recordStatus.textContent = ''; }, 3500);
    } catch (err) {
      recordStatus.textContent = 'Error al grabar';
    }

    btnRecord.textContent = '● Grabar';
    btnRecord.classList.remove('recording');
    transportBusy = false;
    updateTransportUI();
  }
});

viz.draw({ mode: 'beach', waves: [], waterDepth: 0, glassSparkle: 0, sparkles: [] });
