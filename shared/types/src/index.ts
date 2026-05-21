import { z } from 'zod';

export const realtimeTokenRoute = '/realtime/token';
export const openAiRealtimeTranslationCallsUrl =
  'https://api.openai.com/v1/realtime/translations/calls';

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

export const realtimeTokenRequestSchema = z
  .object({
    mode: conversationModeSchema,
    sourceLanguage: languageCodeSchema.optional(),
    targetLanguage: languageCodeSchema
  })
  .superRefine((request, ctx) => {
    if (request.mode === 'turnabout' && !request.sourceLanguage) {
      ctx.addIssue({
        code: 'custom',
        message: 'Turn-about mode requires a source language',
        path: ['sourceLanguage']
      });
    }

    if (request.sourceLanguage && request.sourceLanguage === request.targetLanguage) {
      ctx.addIssue({
        code: 'custom',
        message: 'Source and target languages must be different',
        path: ['targetLanguage']
      });
    }
  });

export const realtimeTokenResponseSchema = z.object({
  clientSecret: z.string().min(1),
  expiresAt: z.string().datetime(),
  sessionId: z.string().min(1),
  sessionExpiresAt: z.string().datetime(),
  translationCallUrl: z.literal(openAiRealtimeTranslationCallsUrl)
});

export const apiErrorCodes = [
  'bad_request',
  'validation_error',
  'rate_limited',
  'missing_server_config',
  'openai_unavailable',
  'not_found',
  'internal_error'
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
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
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
