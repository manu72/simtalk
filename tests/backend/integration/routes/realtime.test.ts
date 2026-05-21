import { describe, expect, it, vi } from 'vitest';

import { openAiRealtimeTranslationCallsUrl, realtimeTokenRoute } from '@simtalk/shared-types';

import { createApp } from '../../../../backend/src/app.js';
import { createAppConfig } from '../../../../backend/src/config.js';

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

const createTestConfig = (overrides: NodeJS.ProcessEnv = {}) =>
  createAppConfig({
    APP_ENV: 'test',
    OPENAI_API_KEY: 'sk-test-secret',
    OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS: '300',
    REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS: '60000',
    REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS: '5',
    ...overrides
  });

const createTokenRequest = (headers: Record<string, string> = {}) =>
  new Request(`http://localhost${realtimeTokenRoute}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers
    },
    body: JSON.stringify({
      mode: 'listener',
      targetLanguage: 'es'
    })
  });

describe('POST /realtime/token', () => {
  it('mints a browser-safe gpt-realtime-translate client secret', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(openAiSuccessPayload)
    );
    const config = createTestConfig();
    const app = createApp(config, { fetch: fetchMock });

    const response = await app.request(createTokenRequest());
    const body = await response.json();
    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      clientSecret: 'ek_test_client_secret',
      sessionId: 'sess_test',
      translationCallUrl: openAiRealtimeTranslationCallsUrl
    });
    expect(JSON.stringify(body)).not.toContain('sk-test-secret');
    expect(fetchMock).toHaveBeenCalledWith(config.openAiRealtimeClientSecretUrl, expect.any(Object));
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test-secret',
      'Content-Type': 'application/json'
    });

    const upstreamBody = JSON.parse(String(init?.body));
    expect(upstreamBody).toMatchObject({
      session: {
        model: 'gpt-realtime-translate',
        audio: {
          output: {
            language: 'es'
          }
        }
      },
      expires_after: {
        anchor: 'created_at',
        seconds: 300
      }
    });
  });

  it('rejects invalid token requests before calling OpenAI', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(createTestConfig(), { fetch: fetchMock });

    const response = await app.request(realtimeTokenRoute, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'turnabout',
        targetLanguage: 'en'
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Turn-about mode requires a source language'
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the server API key is missing', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(createTestConfig({ OPENAI_API_KEY: '' }), { fetch: fetchMock });

    const response = await app.request(createTokenRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: 'missing_server_config',
        message: 'Realtime translation is not configured'
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream OpenAI failures to a sanitized error', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({ error: { message: 'invalid api key sk-test-secret' } }, 401)
    );
    const app = createApp(createTestConfig(), { fetch: fetchMock });

    const response = await app.request(createTokenRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: {
        code: 'openai_unavailable',
        message: 'Realtime translation service is unavailable'
      }
    });
    expect(JSON.stringify(body)).not.toContain('sk-test-secret');
  });

  it('maps malformed OpenAI payloads to a sanitized error', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({ value: 'ek_missing_session' }));
    const app = createApp(createTestConfig(), { fetch: fetchMock });

    const response = await app.request(createTokenRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: {
        code: 'openai_unavailable',
        message: 'Realtime translation service is unavailable'
      }
    });
    expect(JSON.stringify(body)).not.toContain('ek_missing_session');
  });

  it('maps invalid OpenAI JSON to a sanitized error', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    );
    const app = createApp(createTestConfig(), { fetch: fetchMock });

    const response = await app.request(createTokenRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: {
        code: 'openai_unavailable',
        message: 'Realtime translation service is unavailable'
      }
    });
  });

  it('rate limits token creation per client', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(
      createTestConfig({
        REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS: '1'
      }),
      { fetch: fetchMock }
    );

    const first = await app.request(
      createTokenRequest({ 'x-forwarded-for': '198.51.100.42, , 203.0.113.10' })
    );
    const second = await app.request(
      createTokenRequest({ 'x-forwarded-for': '192.0.2.99, 203.0.113.10, ' })
    );
    const body = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get('Retry-After')).toBeTruthy();
    expect(body).toMatchObject({
      error: {
        code: 'rate_limited'
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
