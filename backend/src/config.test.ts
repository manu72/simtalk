import { describe, expect, it } from 'vitest';

import { createAppConfig } from './config.js';

describe('createAppConfig', () => {
  it.each([
    { name: 'missing', port: undefined },
    { name: 'empty', port: '' },
    { name: 'non-numeric', port: 'abc' },
    { name: 'zero', port: '0' },
    { name: 'out of range', port: '70000' }
  ])('uses the default port when PORT is $name', ({ port }) => {
    const config = createAppConfig({ PORT: port });

    expect(config.port).toBe(3000);
  });

  it('uses a configured port when PORT is valid', () => {
    const config = createAppConfig({ PORT: '4173' });

    expect(config.port).toBe(4173);
  });

  it('reads server-only OpenAI and realtime guardrail settings', () => {
    const config = createAppConfig({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS: '300',
      REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS: '30000',
      REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS: '3'
    });

    expect(config.openAiApiKey).toBe('sk-test');
    expect(config.realtimeClientSecretTtlSeconds).toBe(300);
    expect(config.realtimeTokenRateLimitWindowMs).toBe(30_000);
    expect(config.realtimeTokenRateLimitMaxRequests).toBe(3);
  });

  it('keeps conservative realtime defaults when guardrail settings are invalid', () => {
    const config = createAppConfig({
      OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS: '9',
      REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS: '999',
      REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS: '0'
    });

    expect(config.realtimeClientSecretTtlSeconds).toBe(600);
    expect(config.realtimeTokenRateLimitWindowMs).toBe(60_000);
    expect(config.realtimeTokenRateLimitMaxRequests).toBe(5);
  });
});
