import {
  apiErrorSchema,
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
  realtimeTokenRoute,
  type ApiErrorCode,
  type RealtimeTokenRequest,
  type RealtimeTokenResponse
} from '@simtalk/shared-types';

type RealtimeTokenClientOptions = {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
};

export class RealtimeTokenClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | 'network_error' | 'timeout_error',
    readonly status?: number
  ) {
    super(message);
    this.name = 'RealtimeTokenClientError';
  }
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const realtimeTokenRequestTimeoutMs = 8_000;

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${path}`;

export const requestRealtimeToken = async (
  request: RealtimeTokenRequest,
  { apiBaseUrl = defaultApiBaseUrl, fetchImpl = fetch }: RealtimeTokenClientOptions = {}
): Promise<RealtimeTokenResponse> => {
  const parsedRequest = realtimeTokenRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    throw new RealtimeTokenClientError(
      parsedRequest.error.issues[0]?.message ?? 'Realtime token request is invalid',
      'validation_error'
    );
  }

  let response: Response;
  let didTimeout = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, realtimeTokenRequestTimeoutMs);

  try {
    response = await fetchImpl(joinUrl(apiBaseUrl, realtimeTokenRoute), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedRequest.data),
      signal: controller.signal
    });
  } catch (error) {
    if (
      didTimeout ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      controller.signal.aborted
    ) {
      throw new RealtimeTokenClientError(
        'Realtime token request timed out. Check your network connection and try again.',
        'timeout_error'
      );
    }

    throw new RealtimeTokenClientError(
      'Unable to reach the SimTalk backend. Check that the API server is running.',
      'network_error'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new RealtimeTokenClientError(
        parsedError.data.error.message,
        parsedError.data.error.code,
        response.status
      );
    }

    throw new RealtimeTokenClientError(
      'Realtime translation could not be prepared.',
      'openai_unavailable',
      response.status
    );
  }

  const parsedResponse = realtimeTokenResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new RealtimeTokenClientError(
      'The SimTalk backend returned an unexpected token response.',
      'openai_unavailable',
      response.status
    );
  }

  return parsedResponse.data;
};
