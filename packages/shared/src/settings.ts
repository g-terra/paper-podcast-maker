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

/** Kokoro reads at this speed by default (1 = normal). */
export const DEFAULT_SPEED = 1;

/**
 * The two host personalities an episode always has: a calm, deep-voiced anchor who frames the
 * conversation, and an upbeat explainer who walks through the findings.
 */
export const hostPersonaIds = ['anchor', 'explainer'] as const;
export const HostPersonaSchema = z.enum(hostPersonaIds);
export type HostPersona = z.infer<typeof HostPersonaSchema>;

export const hostPersonas: Record<
  HostPersona,
  { label: string; description: string; gender: 'male' | 'female'; defaultVoice: string }
> = {
  anchor: {
    label: 'Calm anchor',
    description:
      'Deep-voiced, calm and authoritative. Opens with the hook, asks the framing questions a smart listener would ask, and moves the conversation from one chapter to the next.',
    gender: 'male',
    defaultVoice: 'am_michael',
  },
  explainer: {
    label: 'Upbeat explainer',
    description:
      'Warm, upbeat and enthusiastic. Explains the findings clearly with everyday examples, reacts with genuine excitement ("That\'s such a wild idea!"), and gives the practical tips.',
    gender: 'female',
    defaultVoice: 'af_heart',
  },
};

export const HostSchema = z.object({
  /** Display name used in the transcript, e.g. "Alex". */
  name: z
    .string()
    .trim()
    .min(1, 'Host name is required')
    .max(40)
    .regex(/^[^\n:]+$/, 'Host name cannot contain ":" or line breaks'),
  persona: HostPersonaSchema,
  /** Kokoro voice id, e.g. "am_michael". Empty means the persona's default voice. */
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
    /** Always two hosts: the anchor first, then the explainer. */
    hosts: z
      .array(HostSchema)
      .length(2)
      .refine((h) => h[0]?.persona === 'anchor' && h[1]?.persona === 'explainer', {
        message: 'The hosts must be one anchor and one explainer',
      })
      .refine((h) => h[0]?.name.toLowerCase() !== h[1]?.name.toLowerCase(), {
        message: 'Host names must be unique',
      }),
    audience: AudienceLevelSchema,
    /** Optional free-form tone guidance, e.g. "light and playful". */
    tone: z.string().trim().max(300).default(''),
    /** Kokoro speaking speed: 0.7 (slow) to 1.3 (fast). */
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
    { name: 'Alex', persona: 'anchor', voice: '' },
    { name: 'Sam', persona: 'explainer', voice: '' },
  ],
  audience: 'general',
  tone: '',
  speed: DEFAULT_SPEED,
};
