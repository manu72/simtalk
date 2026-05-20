import { z } from 'zod';

export const conversationModes = ['listener', 'turnabout', 'practice'] as const;

export const conversationModeSchema = z.enum(conversationModes);

export const languageCodeSchema = z
  .string()
  .trim()
  .refine(
    (value: string) => {
      try {
        new Intl.Locale(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid BCP-47 language tag' }
  )
  .describe('BCP-47 language tag, for example en, es, en-AU, or zh-Hans');

export const realtimeTokenRequestSchema = z.object({
  mode: conversationModeSchema,
  sourceLanguage: languageCodeSchema.optional(),
  targetLanguage: languageCodeSchema
});

export const realtimeTokenResponseSchema = z.object({
  clientSecret: z.string().min(1),
  expiresAt: z.string().datetime(),
  sessionId: z.string().min(1)
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1).optional()
  })
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('simtalk-api'),
  timestamp: z.string().datetime()
});

export type ConversationMode = z.infer<typeof conversationModeSchema>;
export type LanguageCode = z.infer<typeof languageCodeSchema>;
export type RealtimeTokenRequest = z.infer<typeof realtimeTokenRequestSchema>;
export type RealtimeTokenResponse = z.infer<typeof realtimeTokenResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
