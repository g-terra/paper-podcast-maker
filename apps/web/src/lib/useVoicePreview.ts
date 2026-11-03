import { useCallback, useRef, useState } from 'react';
import type { TtsEngine } from '@paper-podcast/shared';
import { api } from './api';

/** Plays short voice samples; only one at a time. */
export function useVoicePreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  }, []);

  const play = useCallback(
    async (key: string, engine: TtsEngine, voice: string, text: string, speed: number) => {
      stop();
      setError(null);
      setLoading(key);
      try {
        const blob = await api.previewVoice({ engine, voice, text, speed });
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        audio.current = el;
        el.onended = () => {
          URL.revokeObjectURL(url);
          setPlaying((p) => (p === key ? null : p));
        };
        setPlaying(key);
        await el.play();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(null);
      }
    },
    [stop],
  );

  return { play, stop, playing, loading, error };
}
