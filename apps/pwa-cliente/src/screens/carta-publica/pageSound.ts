/** Small generated WAV: no binary asset or external fetch needed. */
export function pageSoundDataUri(): string {
  const sampleRate = 16_000;
  const count = 2_400;
  const buffer = new Uint8Array(44 + count);
  const view = new DataView(buffer.buffer);
  const put = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) buffer[offset + i] = value.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, 36 + count, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  put(36, 'data'); view.setUint32(40, count, true);
  let seed = 7;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const envelope = Math.sin(Math.PI * i / count) * (1 - i / count);
    buffer[44 + i] = Math.max(0, Math.min(255, 128 + Math.round(((seed >>> 24) - 128) * envelope * 0.5)));
  }
  let binary = '';
  for (const value of buffer) binary += String.fromCharCode(value);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
