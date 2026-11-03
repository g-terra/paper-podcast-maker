/** Minimal PCM WAV reading, resampling and concatenation (16-bit only). */

export interface Pcm {
  sampleRate: number;
  /** Mono 16-bit samples. */
  samples: Int16Array;
}

export function readWav(buffer: Buffer): Pcm {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let data: Buffer | undefined;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    let size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    // Streaming encoders (e.g. `say`, piper to stdout) may write 0 or 0xFFFFFFFF.
    if (id === 'data' && (size === 0 || body + size > buffer.length)) size = buffer.length - body;
    if (id === 'fmt ') {
      format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      data = buffer.subarray(body, body + size);
      break;
    }
    offset = body + size + (size % 2);
  }

  // 0xFFFE is WAVE_FORMAT_EXTENSIBLE, which engines use for plain PCM too.
  if (!data || (format !== 1 && format !== 0xfffe) || bitsPerSample !== 16 || channels < 1) {
    throw new Error(`Unsupported WAV (format ${format}, ${bitsPerSample}-bit, ${channels} ch)`);
  }

  const frames = Math.floor(data.length / (2 * channels));
  const samples = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    samples[i] = Math.round(sum / channels);
  }
  return { sampleRate, samples };
}

export function resample(pcm: Pcm, sampleRate: number): Pcm {
  if (pcm.sampleRate === sampleRate) return pcm;
  const ratio = pcm.sampleRate / sampleRate;
  const length = Math.floor(pcm.samples.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const a = pcm.samples[j] ?? 0;
    const b = pcm.samples[j + 1] ?? a;
    out[i] = Math.round(a + (b - a) * (pos - j));
  }
  return { sampleRate, samples: out };
}

/** Joins clips into one mono WAV, resampled to the first clip's rate, with a gap between clips. */
export function concatWav(clips: Pcm[], gapMs = 350): Buffer {
  const first = clips[0];
  if (!first) throw new Error('No audio to join');
  const rate = first.sampleRate;
  const gap = Math.round((rate * gapMs) / 1000);
  const parts = clips.map((c) => resample(c, rate).samples);
  const total = parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1);

  const header = 44;
  const out = Buffer.alloc(header + total * 2);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + total * 2, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(total * 2, 40);

  let offset = header;
  parts.forEach((samples, i) => {
    if (i > 0) offset += gap * 2; // silence is already zeroed
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(out, offset);
    offset += samples.byteLength;
  });
  return out;
}
