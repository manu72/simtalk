import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../../backend/src/config.js';
import { createOpenAiImageTranslateService } from '../../../../backend/src/services/openAiImageTranslate.js';

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const createTestConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  appAccessPasswords: [],
  appEnv: 'test',
  port: 3000,
  allowedOrigins: ['http://localhost:5173'],
  openAiApiKey: 'sk-test-secret',
  openAiRealtimeClientSecretUrl: 'https://api.openai.test/v1/realtime/translations/client_secrets',
  realtimeClientSecretTtlSeconds: 30,
  realtimeTokenRateLimitWindowMs: 60_000,
  realtimeTokenRateLimitMaxRequests: 5,
  realtimeInputTranscriptionModel: 'gpt-realtime-whisper',
  liveKitUrl: undefined,
  liveKitApiKey: undefined,
  liveKitApiSecret: undefined,
  liveKitTokenTtlSeconds: 600,
  liveKitRoomEmptyTimeoutSeconds: 300,
  liveKitRoomDepartureTimeoutSeconds: 60,
  roomTokenRateLimitWindowMs: 60_000,
  roomTokenRateLimitMaxRequests: 10,
  openAiChatCompletionsUrl: 'https://api.openai.test/v1/chat/completions',
  openAiImageModelPrimary: 'gpt-5-nano',
  openAiImageModelFallback: 'gpt-5.4-nano',
  openAiImageRequestTimeoutMs: 20_000,
  imageTranslateMaxBytes: 6 * 1024 * 1024,
  imageTranslateRateLimitWindowMs: 60_000,
  imageTranslateRateLimitMaxRequests: 10,
  ...overrides
});

const imageTranslateInput = {
  imageBytes: new Uint8Array([0xff, 0xd8, 0xff]),
  mimeType: 'image/jpeg',
  targetLanguage: 'es'
} as const;

const successPayload = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          sourceLanguage: 'en',
          originalText: 'hello',
          translatedText: 'hola'
        })
      }
    }
  ]
};

describe('createOpenAiImageTranslateService', () => {
  it('does not retry fallback on non-retryable 4xx auth errors', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(
        { error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } },
        401
      )
    );
    const service = createOpenAiImageTranslateService(createTestConfig(), fetchMock);

    await expect(service.translateImage(imageTranslateInput)).rejects.toMatchObject({
      kind: 'invalid_request'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries with fallback on retryable upstream failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ error: { message: 'server error' } }, 500))
      .mockResolvedValueOnce(createJsonResponse(successPayload));
    const service = createOpenAiImageTranslateService(createTestConfig(), fetchMock);

    const result = await service.translateImage(imageTranslateInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      sourceLanguage: 'en',
      originalText: 'hello',
      translatedText: 'hola',
      modelTier: 'fallback'
    });
  });
});
