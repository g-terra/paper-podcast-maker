import { z } from 'zod';

/** The local AI CLIs the server can drive to write a transcript. */
export const aiProviderIds = ['claude', 'codex'] as const;
export const AiProviderIdSchema = z.enum(aiProviderIds);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

export const HostSchema = z.object({
  /** Display name used in the transcript, e.g. "Alex". */
  name: z.string().trim().min(1, 'Host name is required'),
  /** Free-form role description, e.g. "curious interviewer" or "paper expert". */
  role: z.string().trim().min(1, 'Host role is required'),
  /** Voice id understood by the configured TTS engine. */
  voice: z.string().trim().min(1, 'Voice is required'),
});
export type Host = z.infer<typeof HostSchema>;

export const AudienceLevelSchema = z.enum(['general', 'student', 'expert']);
export type AudienceLevel = z.infer<typeof AudienceLevelSchema>;

export const PodcastSettingsSchema = z
  .object({
    provider: AiProviderIdSchema,
    /** Target episode length range, in minutes. */
    minMinutes: z.number().positive().max(180),
    maxMinutes: z.number().positive().max(180),
    hosts: z.array(HostSchema).min(1, 'Add at least one host').max(4),
    audience: AudienceLevelSchema,
    /** Optional free-form tone guidance, e.g. "light and playful". */
    tone: z.string().trim().max(200).optional(),
  })
  .refine((s) => s.minMinutes <= s.maxMinutes, {
    message: 'Minimum length must not exceed maximum length',
    path: ['minMinutes'],
  });
export type PodcastSettings = z.infer<typeof PodcastSettingsSchema>;

export const defaultSettings: PodcastSettings = {
  provider: 'claude',
  minMinutes: 8,
  maxMinutes: 15,
  hosts: [
    { name: 'Alex', role: 'Curious host who asks the questions', voice: 'default-1' },
    { name: 'Sam', role: 'Expert who explains the paper', voice: 'default-2' },
  ],
  audience: 'general',
};
