import {
  TranscriptSchema,
  WORDS_PER_MINUTE,
  type PodcastSettings,
  type Transcript,
} from '@paper-podcast/shared';

/** Papers longer than this are cut so the prompt stays within model limits. */
export const MAX_PAPER_CHARS = 180_000;

const audienceGuidance: Record<PodcastSettings['audience'], string> = {
  general:
    'Listeners are curious non-specialists. Explain jargon in plain words and use concrete analogies.',
  student:
    'Listeners are university students in a related field. Assume basic background, explain methods properly.',
  expert:
    'Listeners are researchers in the field. Go deep on methods, assumptions, and limitations; skip basics.',
};

export function wordTargets(settings: Pick<PodcastSettings, 'minMinutes' | 'maxMinutes'>) {
  const min = Math.round(settings.minMinutes * WORDS_PER_MINUTE);
  const max = Math.round(settings.maxMinutes * WORDS_PER_MINUTE);
  return { min, max, target: Math.round((min + max) / 2) };
}

export function buildTranscriptPrompt(
  paperText: string,
  settings: PodcastSettings,
  feedback?: string,
): string {
  const { min, max, target } = wordTargets(settings);
  const paper =
    paperText.length > MAX_PAPER_CHARS
      ? `${paperText.slice(0, MAX_PAPER_CHARS)}\n\n[Paper truncated for length.]`
      : paperText;
  const hosts = settings.hosts.map((h) => `- ${h.name}: ${h.role}`).join('\n');
  const names = settings.hosts.map((h) => JSON.stringify(h.name)).join(', ');

  return `You are writing the script for an audio podcast episode about an academic paper.

## Hosts
${hosts}

## Audience
${audienceGuidance[settings.audience]}
${settings.tone ? `\n## Tone\n${settings.tone}\n` : ''}
## Length
The spoken script must be between ${min} and ${max} words in total (aim for about ${target}). This is a hard requirement: it sets the episode length.

## How to write it
- A natural conversation between the hosts, not a lecture read aloud. Hosts react, ask follow-ups, and build on each other.
- Open with a short hook and introduce the paper (title and authors if known). Close with key takeaways.
- Cover the problem, the core idea, how it was tested, the main results, and the limitations. Stay faithful to the paper; do not invent results or numbers.
- Write for the ear: no markdown, no bullet points, no URLs, no stage directions, no sound effects. Spell out symbols and read equations in words.
- Each turn is one host speaking; keep most turns under 120 words.
${feedback ? `\n## Feedback on the previous draft\n${feedback}\n` : ''}
## Output format
Reply with only a JSON object, no commentary and no code fences:
{"title": "<episode title>", "lines": [{"speaker": <one of ${names}>, "text": "<what they say>"}]}

## The paper
<paper>
${paper}
</paper>`;
}

/** Pulls the JSON object out of a model reply and validates it against the hosts. */
export function parseTranscript(output: string, settings: PodcastSettings): Transcript {
  const json = extractJsonObject(output);
  const parsed = TranscriptSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`The AI reply was not a valid transcript: ${parsed.error.issues[0]?.message}`);
  }

  // Map speakers case-insensitively onto the configured host names.
  const byName = new Map(settings.hosts.map((h) => [h.name.toLowerCase(), h.name]));
  const lines = parsed.data.lines.map((line) => {
    const speaker = byName.get(line.speaker.toLowerCase());
    if (!speaker) throw new Error(`The AI used an unknown speaker "${line.speaker}"`);
    return { speaker, text: line.text };
  });
  return { title: parsed.data.title, lines };
}

function extractJsonObject(output: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(output);
  const candidate = fenced?.[1] ?? output;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The AI reply did not contain a JSON object');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new Error(`The AI reply had malformed JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
