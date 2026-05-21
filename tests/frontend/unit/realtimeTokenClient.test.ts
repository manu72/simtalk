import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RealtimeTokenClientError,
  requestRealtimeToken
} from '../../../frontend/src/realtimeTokenClient';

const tokenRequest = {
  mode: 'listener',
  targetLanguage: 'es'
} as const;

const tokenResponse = {
  clientSecret: 'ek_test_client_secret',
  expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
  sessionId: 'sess_test',
  sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
  translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
};

afterEach(() => {
  vi.useRealTimers();
});

describe('requestRealtimeToken', () => {
  it('aborts token requests that exceed the client timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url, init) => {
      const signal = init?.signal;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new Error('request aborted'));
        });
      });
    }) as unknown as typeof fetch;

    const tokenPromise = requestRealtimeToken(tokenRequest, { fetchImpl });
    const errorPromise = tokenPromise.catch((error: unknown) => error);

    await vi.runOnlyPendingTimersAsync();

    const result = await errorPromise;

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenRequest),
      signal: expect.any(AbortSignal)
    });
    expect(result).toBeInstanceOf(RealtimeTokenClientError);
    expect(result).toMatchObject({
      code: 'timeout_error',
      message: 'Realtime token request timed out. Check your network connection and try again.'
    });
  });

  it('clears the client timeout after a successful token response', async () => {
    vi.useFakeTimers();
    let resolveFetch: (response: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;

    const tokenPromise = requestRealtimeToken(tokenRequest, { fetchImpl });

    expect(vi.getTimerCount()).toBe(1);

    resolveFetch(Response.json(tokenResponse));
    await expect(tokenPromise).resolves.toEqual(tokenResponse);

    expect(vi.getTimerCount()).toBe(0);
  });
});
