import {
  ChapteredTranscriptSchema,
  hostPersonas,
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
  const hosts = settings.hosts
    .map((h) => `- ${h.name}: ${hostPersonas[h.persona].description}`)
    .join('\n');
  const names = settings.hosts.map((h) => JSON.stringify(h.name)).join(', ');
  // About one chapter per one and a half minutes, counting the opening and closing ones.
  const minutes = (settings.minMinutes + settings.maxMinutes) / 2;
  const chapterCount =
    minutes < 4
      ? '3'
      : `${Math.max(4, Math.round(minutes / 1.5) - 1)} to ${Math.round(minutes / 1.5) + 1}`;

  return `You are writing the script for an audio podcast episode about an academic paper.

## Hosts
${hosts}

## Audience
${audienceGuidance[settings.audience]}
${settings.tone ? `\n## Tone\n${settings.tone}\n` : ''}
## Length
The spoken script must be between ${min} and ${max} words in total (aim for about ${target}). This is a hard requirement: it sets the episode length.

## Shape of the episode
Write it like a well-produced conversational science podcast. Split it into ${chapterCount} chapters, each with a short, catchy title (for example "Why Focus Matters: The Secret to Better Movement" or "Internal vs. External Focus: What's the Real Difference?").
1. Opening chapter. Start with a vivid hook that puts the listener in a real situation ("Picture this: you're practicing a new golf swing…"), say what the episode is about and why it matters, introduce the paper (title and authors if known), and give a quick roadmap of what you'll cover.
2. Middle chapters. One main question per chapter: what the problem is, the core idea and the key terms, how it was tested, what was found, why it works, and the caveats and limitations. Open each chapter with a natural transition or question from one host ("So, is this just for young athletes, or does it hold up for other groups too?").
3. Closing chapter. Wrap up with clear takeaways (three is good) and one concrete thing the listener can try or think about.
Stay faithful to the paper. Do not invent results, numbers, quotes or anecdotes; it's fine to use everyday examples to illustrate.

## How the hosts talk
- Warm, curious and upbeat. The hosts sound genuinely interested ("That's such a wild idea", "I love that", "Here's where it gets interesting") without being over the top.
- Mostly alternate speakers. A typical turn is two to four sentences (30 to 70 words); keep every turn under 100 words. Each turn builds on the last one: agree and add, ask a follow-up, give an example, or push back.
- Explain every technical term in plain words the first time, then make it concrete with everyday examples (a golf swing, a swimmer's stroke, a piano lesson).
- Use contractions and spoken phrasing. Signposting is welcome when it sounds spoken ("Let's dig into…", "Here's the thing though…", "So, three big takeaways.").
- Avoid slide-style fragments: no "The idea: X." or "The result? Y." with nothing else, no bullet points read aloud. Say it as a full sentence ("What they found is that…").
- No one-word filler lines: every turn reacts to the last one and adds something new.
- Sometimes a host cuts in before the other finishes: end the interrupted turn mid-thought with an em dash (—) and let the other host pick it up.
- Write only real words. Never write sounds like "Mm-hmm", "Mhm", "Uh-huh", "Hmm", "um" or "uh", because the voices read text literally.
- No markdown, URLs, or stage directions. Spell out symbols and read equations in words.
${
  settings.engine === 'elevenlabs'
    ? '- The voices understand a few emotion cues in square brackets, placed inline before the words they affect: [laughs], [chuckles], [sighs], [excited], [curious], [thoughtful]. Use one every several turns at most, only where a real person would react that way.\n'
    : '- Do not use square-bracket cues or sound effects.\n'
}## Style example (a different paper; match the feel, not the content)
A: Picture this: you're practicing a new golf swing or trying to perfect your balance, and a tiny change in what you focus on could make all the difference. That's what today's episode is all about.
B: That's such a wild idea, especially since most people think the key is just more practice. We're looking at fifteen years of research showing that what you focus on actually shifts how well and how fast you learn.
A: Let's jump right in with the classic question. Should you focus on your moving arm, or on the ball you're throwing?
B: Right, and that's the heart of it. Internal focus means thinking about your own body, like "keep your elbow straight", while external focus is about the effect of your movement, like "aim the ball at the target".
${feedback ? `\n## Feedback on the previous draft\n${feedback}\n` : ''}
## Output format
Reply with only a JSON object, no commentary and no code fences:
{"title": "<episode title>", "summary": "<two to four sentences describing the episode, like a podcast show note>", "chapters": [{"title": "<chapter title>", "lines": [{"speaker": <one of ${names}>, "text": "<what they say>"}]}]}

## The paper
<paper>
${paper}
</paper>`;
}

/** Pulls the JSON object out of a model reply and validates it against the hosts. */
export function parseTranscript(output: string, settings: PodcastSettings): Transcript {
  const json = extractJsonObject(output);
  // Chaptered replies are flattened: each chapter's title rides on its first line.
  const chaptered = ChapteredTranscriptSchema.safeParse(json);
  const candidate = chaptered.success
    ? {
        title: chaptered.data.title,
        ...(chaptered.data.summary ? { summary: chaptered.data.summary.slice(0, 2000) } : {}),
        lines: chaptered.data.chapters.flatMap((c) =>
          c.lines.map((l, i) => (i === 0 ? { ...l, chapter: c.title.slice(0, 120) } : l)),
        ),
      }
    : json;
  const parsed = TranscriptSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`The AI reply was not a valid transcript: ${parsed.error.issues[0]?.message}`);
  }

  // Map speakers case-insensitively onto the configured host names.
  const byName = new Map(settings.hosts.map((h) => [h.name.toLowerCase(), h.name]));
  const lines = parsed.data.lines.map((line) => {
    const speaker = byName.get(line.speaker.toLowerCase());
    if (!speaker) throw new Error(`The AI used an unknown speaker "${line.speaker}"`);
    return {
      speaker,
      text: line.text,
      ...(line.chapter ? { chapter: line.chapter } : {}),
      ...(line.overlap ? { overlap: true } : {}),
    };
  });
  return {
    title: parsed.data.title,
    ...(parsed.data.summary ? { summary: parsed.data.summary } : {}),
    lines,
  };
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
