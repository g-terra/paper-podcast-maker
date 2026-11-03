import { z } from 'zod';

/** The local AI CLIs the server can drive to write a transcript. */
export const aiProviderIds = ['claude', 'codex'] as const;
export const AiProviderIdSchema = z.enum(aiProviderIds);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

/** A model a script writer can use; `id` is passed to the CLI's --model flag ('' = CLI default). */
export interface ModelOption {
  id: string;
  label: string;
}

/** Known models per CLI. The first entry is the default. */
export const providerModels: Record<AiProviderId, ModelOption[]> = {
  claude: [
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
    { id: 'claude-opus-5-5', label: 'Opus 5.5' },
    { id: 'claude-fable-5-1', label: 'Fable 5.1' },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  ],
  codex: [{ id: '', label: 'Codex default model' }],
};

/** Text-to-speech engines: Kokoro runs on this machine, ElevenLabs is a cloud service. */
export const ttsEngineIds = ['kokoro', 'elevenlabs'] as const;
export const TtsEngineSchema = z.enum(ttsEngineIds);
export type TtsEngine = z.infer<typeof TtsEngineSchema>;

/** Voices read at this speed by default (1 = normal). */
export const DEFAULT_SPEED = 1;

export const HostSchema = z.object({
  /** Display name used in the transcript, e.g. "Alex". */
  name: z
    .string()
    .trim()
    .min(1, 'Host name is required')
    .max(40)
    .regex(/^[^\n:]+$/, 'Host name cannot contain ":" or line breaks'),
  /** Free-form role description, e.g. "curious interviewer" or "paper expert". */
  role: z.string().trim().min(1, 'Host role is required').max(300),
  /**
   * Voice id for the chosen engine (Kokoro "af_heart", or an ElevenLabs voice id). Empty means "pick one for me": the
   * server gives each host a different voice.
   */
  voice: z.string().trim().max(500).default(''),
});
export type Host = z.infer<typeof HostSchema>;

export const AudienceLevelSchema = z.enum(['general', 'student', 'expert']);
export type AudienceLevel = z.infer<typeof AudienceLevelSchema>;

export const PodcastSettingsSchema = z
  .object({
    provider: AiProviderIdSchema,
    /** Optional model override passed to the CLI (e.g. "sonnet", "gpt-5"). */
    model: z
      .string()
      .trim()
      .max(100)
      .regex(/^[\w.:/-]*$/, 'Model name has unexpected characters')
      .default(''),
    /** Target episode length range, in minutes. */
    minMinutes: z.number().positive().max(180),
    maxMinutes: z.number().positive().max(180),
    hosts: z
      .array(HostSchema)
      .min(1, 'Add at least one host')
      .max(4)
      .refine((hosts) => new Set(hosts.map((h) => h.name.toLowerCase())).size === hosts.length, {
        message: 'Host names must be unique',
      }),
    audience: AudienceLevelSchema,
    /** Optional free-form tone guidance, e.g. "light and playful". */
    tone: z.string().trim().max(300).default(''),
    /** Which engine voices the episode. */
    engine: TtsEngineSchema.default('kokoro'),
    /** Speaking speed: 0.7 (slow) to 1.3 (fast). ElevenLabs tops out at 1.2. */
    speed: z.number().min(0.7).max(1.3).default(DEFAULT_SPEED),
  })
  .refine((s) => s.minMinutes <= s.maxMinutes, {
    message: 'Minimum length must not exceed maximum length',
    path: ['minMinutes'],
  });
export type PodcastSettings = z.infer<typeof PodcastSettingsSchema>;
export type PodcastSettingsInput = z.input<typeof PodcastSettingsSchema>;

export const defaultSettings: PodcastSettings = {
  provider: 'claude',
  model: 'claude-sonnet-5-5',
  minMinutes: 5,
  maxMinutes: 10,
  hosts: [
    { name: 'Alex', role: 'Curious host who asks the questions a smart listener would', voice: '' },
    { name: 'Sam', role: 'Researcher who explains the paper clearly and honestly', voice: '' },
  ],
  audience: 'general',
  tone: '',
  engine: 'kokoro',
  speed: DEFAULT_SPEED,
};
