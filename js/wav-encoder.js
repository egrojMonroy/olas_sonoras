/**
 * Encode interleaved Float32 PCM channels into a 16-bit WAV Blob.
 */
export function encodeWav(channelData, sampleRate) {
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channelData[ch][i];
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Merge chunked Float32Array buffers into one array per channel.
 */
export function mergeChannelChunks(leftChunks, rightChunks) {
  const leftLen = leftChunks.reduce((n, c) => n + c.length, 0);
  const rightLen = rightChunks.reduce((n, c) => n + c.length, 0);
  const len = Math.max(leftLen, rightLen);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  let off = 0;
  for (const c of leftChunks) {
    left.set(c, off);
    off += c.length;
  }
  off = 0;
  for (const c of rightChunks) {
    right.set(c, off);
    off += c.length;
  }
  return [left, right];
}
