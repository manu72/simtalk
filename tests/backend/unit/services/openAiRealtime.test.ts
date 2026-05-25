import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../../backend/src/config.js';
import { createOpenAiRealtimeService } from '../../../../backend/src/services/openAiRealtime.js';

const openAiSuccessPayload = {
  value: 'ek_test_client_secret',
  expires_at: 1_779_280_000,
  session: {
    id: 'sess_test',
    expires_at: 1_779_280_600
  }
};

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
  ...overrides
});

const tokenRequest = {
  mode: 'listener',
  targetLanguage: 'es'
} as const;

describe('createOpenAiRealtimeService', () => {
  it('aborts client secret requests after the client timeout and wraps the abort clearly', async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          if (!(init?.signal instanceof AbortSignal)) {
            throw new Error('missing abort signal');
          }

          return await new Promise<Response>((_, reject) => {
            init.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('The operation was aborted.', 'AbortError')),
              { once: true }
            );
          });
        }
      );
      const service = createOpenAiRealtimeService(createTestConfig(), fetchMock);

      const result = service.createTranslationClientSecret(tokenRequest);
      const rejection = expect(result).rejects.toMatchObject({
        kind: 'upstream_unavailable',
        message: 'OpenAI realtime translation client secret request timed out'
      });

      await vi.advanceTimersByTimeAsync(10_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the client timeout after a successful client secret request', async () => {
    vi.useFakeTimers();

    try {
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          signal = init?.signal ?? undefined;

          return createJsonResponse(openAiSuccessPayload);
        }
      );
      const service = createOpenAiRealtimeService(createTestConfig(), fetchMock);

      const response = await service.createTranslationClientSecret(tokenRequest);

      expect(response).toMatchObject({
        clientSecret: 'ek_test_client_secret',
        sessionId: 'sess_test'
      });
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
