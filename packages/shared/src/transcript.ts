/** One spoken turn in the podcast. */
export interface TranscriptLine {
  /** Name of the host speaking; matches a `Host.name` from the settings. */
  speaker: string;
  text: string;
}

export interface Transcript {
  title: string;
  lines: TranscriptLine[];
}

/** Rough speaking rate used to estimate episode length from text. */
export const WORDS_PER_MINUTE = 150;

export function estimateMinutes(transcript: Pick<Transcript, 'lines'>): number {
  const words = transcript.lines.reduce(
    (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  return words / WORDS_PER_MINUTE;
}
