import { z } from 'zod';

export const TranscriptLineSchema = z.object({
  /** Name of the host speaking; matches a `Host.name` from the settings. */
  speaker: z.string().trim().min(1),
  text: z.string().trim().min(1),
  /** Older scripts: a short reaction ("Right!"). It now plays as a quick turn of its own. */
  overlap: z.boolean().optional(),
  /** Set on the first line of a chapter: the chapter's title, e.g. "Why Focus Matters". */
  chapter: z.string().trim().min(1).max(120).optional(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const TranscriptSchema = z.object({
  title: z.string().trim().min(1),
  /** A short description of the episode, like a podcast show note. */
  summary: z.string().trim().max(2000).optional(),
  lines: z.array(TranscriptLineSchema).min(1),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

/** The shape the script writer replies with; flattened into a `Transcript`. */
export const ChapteredTranscriptSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        lines: z.array(TranscriptLineSchema).min(1),
      }),
    )
    .min(1),
});

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
