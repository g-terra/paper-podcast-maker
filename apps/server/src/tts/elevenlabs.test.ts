import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWav } from '../audio/wav.js';
import {
  describeElevenLabsVoice,
  elevenLabsKey,
  elevenLabsVoices,
  elevenLabsWav,
} from './elevenlabs.js';

const dataDir = () => mkdtemp(join(tmpdir(), 'ppm-11-'));

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { fn, calls };
}

describe('ElevenLabs key', () => {
  it('prefers the environment, then the saved key file', async () => {
    const dir = await dataDir();
    expect(await elevenLabsKey({ dataDir: dir, env: {} })).toBeUndefined();
    await writeFile(join(dir, 'elevenlabs.key'), 'from-file\n');
    expect(await elevenLabsKey({ dataDir: dir, env: {} })).toBe('from-file');
    expect(await elevenLabsKey({ dataDir: dir, env: { ELEVENLABS_API_KEY: 'from-env' } })).toBe(
      'from-env',
    );
  });

  it('explains how to add a missing key', async () => {
    await expect(elevenLabsVoices({ dataDir: await dataDir(), env: {} })).rejects.toThrow(
      /\.env\.local/,
    );
  });
});

describe('ElevenLabs voices', () => {
  it('describes library voices', () => {
    expect(
      describeElevenLabsVoice({
        voice_id: 'abc',
        name: 'Rachel - calm narrator',
        labels: { gender: 'female', accent: 'american', use_case: 'narration' },
      }),
    ).toEqual({
      id: 'abc',
      name: 'Rachel',
      gender: 'female',
      accent: 'American',
      description: 'narration',
    });
  });

  it('alternates women and men so automatic hosts sound different', async () => {
    const { fn, calls } = fakeFetch(() =>
      Response.json({
        voices: [
          { voice_id: 'w1', name: 'Ann', labels: { gender: 'female' } },
          { voice_id: 'w2', name: 'Bea', labels: { gender: 'female' } },
          { voice_id: 'm1', name: 'Carl', labels: { gender: 'male' } },
          { voice_id: 'n1', name: 'Robo', labels: {} },
        ],
      }),
    );
    const voices = await elevenLabsVoices({
      dataDir: await dataDir(),
      env: { ELEVENLABS_API_KEY: 'k-order' },
      fetch: fn,
    });
    expect(voices.map((v) => v.id)).toEqual(['w1', 'm1', 'w2', 'n1']);
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('k-order');
  });

  it('turns a rejected key into a readable error', async () => {
    const { fn } = fakeFetch(() =>
      Response.json({ detail: { message: 'Invalid API key' } }, { status: 401 }),
    );
    await expect(
      elevenLabsVoices({ dataDir: await dataDir(), env: { ELEVENLABS_API_KEY: 'bad' }, fetch: fn }),
    ).rejects.toThrow(/rejected the API key/);
  });
});

describe('elevenLabsWav', () => {
  it('sends neighbouring lines and wraps the PCM reply as a WAV', async () => {
    const pcm = Buffer.alloc(4800 * 2);
    pcm.writeInt16LE(1234, 0);
    const { fn, calls } = fakeFetch(() => new Response(pcm));
    const wav = await elevenLabsWav(
      { dataDir: await dataDir(), env: { ELEVENLABS_API_KEY: 'k' }, fetch: fn },
      'Hello there.',
      'voice1',
      { speed: 1.3, previousText: 'Before.', nextText: 'After.' },
    );
    const { samples, sampleRate } = readWav(wav);
    expect(sampleRate).toBe(24000);
    expect(samples.length).toBe(4800);
    expect(samples[0]).toBe(1234);
    expect(calls[0]!.url).toContain('/v1/text-to-speech/voice1?output_format=pcm_24000');
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      text: 'Hello there.',
      previous_text: 'Before.',
      next_text: 'After.',
      voice_settings: { speed: 1.2 },
    });
  });
});
