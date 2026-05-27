import {
  apiErrorSchema,
  imageTranslateRequestSchema,
  imageTranslateResponseSchema,
  imageTranslateRoute,
  type ApiErrorCode,
  type ImageTranslateResponse
} from '@simtalk/shared-types';

import {
  AccessDeniedError,
  clearStoredPassword,
  getStoredPassword
} from './accessGate';

type CameraTranslateClientOptions = {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
};

export class CameraTranslateClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | 'network_error' | 'timeout_error' | 'aborted',
    readonly status?: number
  ) {
    super(message);
    this.name = 'CameraTranslateClientError';
  }
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const cameraTranslateRequestTimeoutMs = 30_000;

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${path}`;

export type RequestImageTranslateInput = {
  readonly image: Blob;
  readonly imageFilename: string;
  readonly targetLanguage: string;
};

export const requestImageTranslate = async (
  input: RequestImageTranslateInput,
  {
    apiBaseUrl = defaultApiBaseUrl,
    fetchImpl = fetch,
    signal
  }: CameraTranslateClientOptions = {}
): Promise<ImageTranslateResponse> => {
  // Validate the JSON-shaped fields against the same shared schema the backend
  // route uses, so client and server stay in sync. The image bytes are a
  // separate multipart field and are not covered by this schema — size/MIME
  // are enforced server-side, with a basic empty-blob guard kept here so we
  // never bother the network with an obviously useless request.
  const parsedRequest = imageTranslateRequestSchema.safeParse({
    targetLanguage: input.targetLanguage
  });
  if (!parsedRequest.success) {
    const firstIssue = parsedRequest.error.issues[0]?.message;
    throw new CameraTranslateClientError(
      firstIssue ?? 'Target language is required',
      'validation_error'
    );
  }

  if (!input.image || input.image.size === 0) {
    throw new CameraTranslateClientError('No image to translate', 'validation_error');
  }

  const form = new FormData();
  form.append('targetLanguage', parsedRequest.data.targetLanguage);
  form.append('image', input.image, input.imageFilename);

  const controller = new AbortController();
  let didTimeout = false;
  const onUserAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      throw new CameraTranslateClientError('Image translation cancelled', 'aborted');
    }
    signal.addEventListener('abort', onUserAbort, { once: true });
  }
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, cameraTranslateRequestTimeoutMs);

  let response: Response;
  try {
    const headers: Record<string, string> = {};
    const accessPassword = getStoredPassword();
    if (accessPassword) {
      headers['X-Access-Password'] = accessPassword;
    }

    response = await fetchImpl(joinUrl(apiBaseUrl, imageTranslateRoute), {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new CameraTranslateClientError('Image translation cancelled', 'aborted');
    }
    if (
      didTimeout ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      controller.signal.aborted
    ) {
      throw new CameraTranslateClientError(
        'Image translation timed out. Check your connection and try again.',
        'timeout_error'
      );
    }
    throw new CameraTranslateClientError(
      'Unable to reach the SimTalk backend. Check that the API server is running.',
      'network_error'
    );
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onUserAbort);
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (response.status === 401) {
    clearStoredPassword();
    throw new AccessDeniedError();
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new CameraTranslateClientError(
        parsedError.data.error.message,
        parsedError.data.error.code,
        response.status
      );
    }

    throw new CameraTranslateClientError(
      'Image translation could not be completed.',
      'openai_unavailable',
      response.status
    );
  }

  const parsedResponse = imageTranslateResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new CameraTranslateClientError(
      'The SimTalk backend returned an unexpected image translation response.',
      'openai_unavailable',
      response.status
    );
  }

  return parsedResponse.data;
};
