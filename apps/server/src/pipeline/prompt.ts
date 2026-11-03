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

## What to cover
- Open with a short hook (a question, a surprising fact, or a relatable situation) and introduce the paper: title and authors if known.
- Cover the problem, the core idea, how it was tested, the main results, and the limitations, then close with what it means for the listener.
- Stay faithful to the paper. Do not invent results, numbers, quotes or anecdotes about the authors.

## Make it sound like people talking, not slides read aloud
This is the most important part. Listeners should feel they're overhearing two smart friends, not a presentation.
- Never use written devices: no "label: content" setups ("The idea: …", "His key insight: …", "The result? …", "Bottom line: …", "So the takeaway: …", "Here's the thing: …"), no headline fragments, no lists read out as bullets, no "firstly / secondly". Avoid colons and semicolons in spoken text altogether.
- Carry each point with a full spoken sentence and a verb: "So what he's arguing is that…", "And it turns out…", "What they actually did was…".
- Let ideas come out through the back-and-forth. One host asks, guesses or pushes back; the other explains; the first puts it in their own words or asks for an example. Questions should be specific ("Wait, so the model never sees the answers?"), not generic ("What's next?").
- Lead with a concrete example or picture, then name the technical term. Introduce at most one new term per turn.
- Vary turn length: plenty of one or two sentence turns, the occasional longer explanation (keep every turn under 100 words).
- Use contractions and everyday words. A "you know", "I mean" or "kind of" here and there is fine. Skip podcast clichés ("let's dive in", "buckle up", "game-changer", "fascinating", "great question").
- Short reactions are their own line of one to four real words ("Right.", "Oh, nice.", "Wait, really?"), from a different host than the line before, a few times per episode.
- Sometimes a host cuts in before the other finishes: end the interrupted turn mid-thought with an em dash (—) and let the other host pick it up.
- Write only real words. Never write sounds like "Mm-hmm", "Mhm", "Uh-huh", "Hmm" or "um" and "uh", because the voices read text literally.
- No markdown, URLs, or stage directions. Spell out symbols and read equations in words.
${
  settings.engine === 'elevenlabs'
    ? '- The voices understand a few emotion cues in square brackets, placed inline before the words they affect: [laughs], [chuckles], [sighs], [excited], [curious], [thoughtful]. Use one every several turns at most, only where a real person would react that way.\n'
    : '- Do not use square-bracket cues or sound effects.\n'
}
Bad (reads like a slide): "The core idea: replace recurrence with attention. The result? Faster training."
Good (sounds like talk): "So what they did was throw out the recurrent part entirely and just use attention." / "Wait, all of it?" / "All of it. And it trained way faster."

Before you answer, read each line as if out loud and rewrite anything that sounds written rather than spoken.
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
    return line.overlap
      ? { speaker, text: line.text, overlap: true }
      : { speaker, text: line.text };
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
