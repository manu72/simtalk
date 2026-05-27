import {
  openAiRealtimeTranslationCallsUrl,
  realtimeTokenResponseSchema,
  type RealtimeTokenRequest,
  type RealtimeTokenResponse
} from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';

type Fetch = typeof fetch;

type OpenAiClientSecretResponse = {
  readonly value?: unknown;
  readonly expires_at?: unknown;
  readonly session?: {
    readonly id?: unknown;
    readonly expires_at?: unknown;
  };
};

const maxClientSecretRequestTimeoutMs = 10_000;

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

export class OpenAiRealtimeError extends Error {
  constructor(
    message: string,
    readonly kind: 'missing_config' | 'upstream_unavailable' | 'invalid_upstream_response'
  ) {
    super(message);
    this.name = 'OpenAiRealtimeError';
  }
}

const unixSecondsToIso = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OpenAiRealtimeError(
      'OpenAI realtime response did not include a valid expiry',
      'invalid_upstream_response'
    );
  }

  return new Date(value * 1000).toISOString();
};

const parseOpenAiClientSecretResponse = (
  payload: OpenAiClientSecretResponse
): RealtimeTokenResponse => {
  try {
    if (typeof payload.value !== 'string' || payload.value.length === 0) {
      throw new OpenAiRealtimeError(
        'OpenAI realtime response did not include a client secret',
        'invalid_upstream_response'
      );
    }

    if (typeof payload.session?.id !== 'string' || payload.session.id.length === 0) {
      throw new OpenAiRealtimeError(
        'OpenAI realtime response did not include a session id',
        'invalid_upstream_response'
      );
    }

    return realtimeTokenResponseSchema.parse({
      clientSecret: payload.value,
      expiresAt: unixSecondsToIso(payload.expires_at),
      sessionId: payload.session.id,
      sessionExpiresAt: unixSecondsToIso(payload.session.expires_at),
      translationCallUrl: openAiRealtimeTranslationCallsUrl
    });
  } catch (error) {
    if (error instanceof OpenAiRealtimeError) {
      throw error;
    }

    throw new OpenAiRealtimeError(
      'OpenAI realtime response did not match the expected schema',
      'invalid_upstream_response'
    );
  }
};

export const createOpenAiRealtimeService = (
  config: AppConfig,
  fetchImpl: Fetch = fetch
) => ({
  createTranslationClientSecret: async (
    request: RealtimeTokenRequest
  ): Promise<RealtimeTokenResponse> => {
    if (!config.openAiApiKey) {
      throw new OpenAiRealtimeError('OPENAI_API_KEY is not configured', 'missing_config');
    }

    let response: Response;
    const abortController = new AbortController();
    const clientSecretRequestTimeoutMs = Math.min(
      config.realtimeClientSecretTtlSeconds * 1000,
      maxClientSecretRequestTimeoutMs
    );
    const timeout = setTimeout(() => abortController.abort(), clientSecretRequestTimeoutMs);

    try {
      response = await fetchImpl(config.openAiRealtimeClientSecretUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: abortController.signal,
        body: JSON.stringify({
          session: {
            model: 'gpt-realtime-translate',
            audio: {
              input: {
                transcription: {
                  model: config.realtimeInputTranscriptionModel
                }
              },
              output: {
                language: request.targetLanguage
              }
            }
          },
          expires_after: {
            anchor: 'created_at',
            seconds: config.realtimeClientSecretTtlSeconds
          }
        })
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new OpenAiRealtimeError(
          'OpenAI realtime translation client secret request timed out',
          'upstream_unavailable'
        );
      }

      throw new OpenAiRealtimeError(
        'OpenAI realtime translation client secret request could not be sent',
        'upstream_unavailable'
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Surface the upstream failure to operators. We log status plus a short
      // body snippet so OpenAI's actual error reason is visible without
      // exposing the bearer token. The body for this endpoint contains an
      // OpenAI error envelope (no audio, no transcripts) so it is safe to
      // log truncated.
      let bodySnippet: string;
      try {
        const text = await response.text();
        bodySnippet = text.slice(0, 500);
      } catch {
        bodySnippet = '<unreadable body>';
      }
      console.error('[openAiRealtime] client secret upstream failure', {
        status: response.status,
        statusText: response.statusText,
        bodySnippet
      });
      throw new OpenAiRealtimeError(
        'OpenAI realtime translation client secret request failed',
        'upstream_unavailable'
      );
    }

    let payload: OpenAiClientSecretResponse;
    try {
      payload = (await response.json()) as OpenAiClientSecretResponse;
    } catch {
      throw new OpenAiRealtimeError(
        'OpenAI realtime response was not valid JSON',
        'invalid_upstream_response'
      );
    }

    return parseOpenAiClientSecretResponse(payload);
  }
});
