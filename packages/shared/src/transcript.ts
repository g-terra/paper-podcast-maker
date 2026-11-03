import { z } from 'zod';

export const TranscriptLineSchema = z.object({
  /** Name of the host speaking; matches a `Host.name` from the settings. */
  speaker: z.string().trim().min(1),
  text: z.string().trim().min(1),
  /**
   * A short reaction ("Mm-hmm.", "Right!") spoken over the end of the previous
   * line instead of after it.
   */
  overlap: z.boolean().optional(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const TranscriptSchema = z.object({
  title: z.string().trim().min(1),
  lines: z.array(TranscriptLineSchema).min(1),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

/** Kokoro's measured speaking pace at speed 1 (about 128 words a minute). */
export const WORDS_PER_MINUTE = 130;

export function countWords(transcript: Pick<Transcript, 'lines'>): number {
  return transcript.lines.reduce(
    (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}

export function estimateMinutes(transcript: Pick<Transcript, 'lines'>): number {
  return countWords(transcript) / WORDS_PER_MINUTE;
}
