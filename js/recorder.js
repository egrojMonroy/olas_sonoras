import { encodeWav, mergeChannelChunks } from './wav-encoder.js';

/**
 * Capture stereo PCM from an audio node and export as WAV.
 */
export class AudioRecorder {
  constructor() {
    this.recording = false;
    this.leftChunks = [];
    this.rightChunks = [];
    this.processor = null;
    this.muteGain = null;
    this.sampleRate = 48000;
    this.format = 'wav';
  }

  setFormat(format) {
    this.format = format === 'webm' ? 'webm' : 'wav';
  }

  start(ctx, tapNode, stream = null) {
    if (this.recording) return;

    this.sampleRate = ctx.sampleRate;
    this.leftChunks = [];
    this.rightChunks = [];

    if (this.format === 'webm') {
      if (stream == null) throw new Error('No audio stream for WebM');
      this._startWebM(stream);
      return;
    }

    this.processor = ctx.createScriptProcessor(4096, 2, 2);
    this.muteGain = ctx.createGain();
    this.muteGain.gain.value = 0;

    tapNode.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(ctx.destination);

    this.processor.onaudioprocess = (e) => {
      this.leftChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      const right = e.inputBuffer.numberOfChannels > 1
        ? e.inputBuffer.getChannelData(1)
        : e.inputBuffer.getChannelData(0);
      this.rightChunks.push(new Float32Array(right));
    };

    this.recording = true;
  }

  _startWebM(stream) {
    this.chunks = [];
    const resolvedMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(stream, { mimeType: resolvedMime });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250);
    this.recording = true;
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recording) {
        reject(new Error('Not recording'));
        return;
      }

      if (this.format === 'webm' && this.mediaRecorder != null) {
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
          this._cleanup();
          resolve(blob);
        };
        this.mediaRecorder.stop();
        return;
      }

      if (this.processor != null) {
        this.processor.onaudioprocess = null;
        this.processor.disconnect();
        this.muteGain.disconnect();
        this.processor = null;
        this.muteGain = null;
      }

      const [left, right] = mergeChannelChunks(this.leftChunks, this.rightChunks);
      const blob = encodeWav([left, right], this.sampleRate);
      this._cleanup();
      resolve(blob);
    });
  }

  _cleanup() {
    this.recording = false;
    this.leftChunks = [];
    this.rightChunks = [];
    this.mediaRecorder = null;
    this.chunks = [];
  }

  download(blob, filename = 'olas-playa') {
    const ext = blob.type.includes('wav') ? 'wav' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
