import {
  imageTranslateResponseSchema,
  languageCodeSchema,
  type ImageTranslateModelTier,
  type ImageTranslateResponse
} from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';

type Fetch = typeof fetch;

export type ImageTranslateServiceInput = {
  readonly imageBytes: Uint8Array;
  readonly mimeType: string;
  readonly targetLanguage: string;
};

type ChatCompletionMessage = {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
};

type ChatCompletionChoice = {
  readonly message?: { readonly content?: unknown };
  readonly finish_reason?: unknown;
};

type ChatCompletionErrorEnvelope = {
  readonly error?: {
    readonly code?: unknown;
    readonly type?: unknown;
    readonly message?: unknown;
  };
};

type ChatCompletionResponse = ChatCompletionErrorEnvelope & {
  readonly choices?: readonly ChatCompletionChoice[];
};

export type OpenAiImageTranslateErrorKind =
  | 'missing_config'
  | 'upstream_unavailable'
  | 'invalid_upstream_response'
  | 'content_blocked'
  | 'invalid_request';

export class OpenAiImageTranslateError extends Error {
  constructor(message: string, readonly kind: OpenAiImageTranslateErrorKind) {
    super(message);
    this.name = 'OpenAiImageTranslateError';
  }
}

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && (error as Error).name === 'AbortError';

const buildSystemPrompt = (targetLanguage: string): string =>
  [
    'You are SimTalk, an image translator.',
    'You receive a single image that may contain printed or handwritten text in any language.',
    'Detect the dominant language of the text in the image, extract the readable text faithfully (preserve line breaks and reasonable order, ignore decorative noise), and translate the extracted text into the requested target language.',
    `The target language for the translation is the BCP-47 tag: ${targetLanguage}.`,
    'Respond ONLY as a single JSON object matching this exact shape:',
    '{"sourceLanguage": string | null, "originalText": string, "translatedText": string}',
    'sourceLanguage MUST be a BCP-47 language tag (for example "en", "es", "zh-Hans") for the detected source text. Use null only if the image clearly contains no readable text.',
    'originalText MUST be the verbatim text extracted from the image. If no text is found, return an empty string.',
    'translatedText MUST be the translation of originalText into the target language. If originalText is empty, return an empty string.',
    'Do NOT add commentary, markdown, or any field beyond those three keys.'
  ].join(' ');

const buildUserMessage = (targetLanguage: string): string =>
  `Translate any text in this image into ${targetLanguage}. Reply with the JSON object only.`;

const toDataUrl = (imageBytes: Uint8Array, mimeType: string): string => {
  const base64 = Buffer.from(imageBytes).toString('base64');
  return `data:${mimeType};base64,${base64}`;
};

const parseModelJsonContent = (raw: unknown): ImageTranslateResponse => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new OpenAiImageTranslateError(
      'OpenAI image translation response was empty',
      'invalid_upstream_response'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new OpenAiImageTranslateError(
        'OpenAI image translation response was not valid JSON',
        'invalid_upstream_response'
      );
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new OpenAiImageTranslateError(
        'OpenAI image translation response was not valid JSON',
        'invalid_upstream_response'
      );
    }
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new OpenAiImageTranslateError(
      'OpenAI image translation response was not an object',
      'invalid_upstream_response'
    );
  }

  const record = parsed as Record<string, unknown>;
  const rawSource = record.sourceLanguage;
  const rawOriginal = record.originalText;
  const rawTranslated = record.translatedText;

  let sourceLanguage: string | null = null;
  if (typeof rawSource === 'string' && rawSource.trim().length > 0) {
    const validated = languageCodeSchema.safeParse(rawSource.trim());
    sourceLanguage = validated.success ? validated.data : null;
  }

  const originalText = typeof rawOriginal === 'string' ? rawOriginal : '';
  const translatedText = typeof rawTranslated === 'string' ? rawTranslated : '';

  return {
    sourceLanguage,
    originalText,
    translatedText,
    modelTier: 'primary'
  } satisfies ImageTranslateResponse;
};

const isSafetyErrorCode = (errorCode: unknown): boolean => {
  if (typeof errorCode !== 'string') return false;
  const normalized = errorCode.toLowerCase();
  return normalized === 'content_policy_violation' || normalized === 'content_filter';
};

const isContentBlocked = (
  status: number,
  finishReason: unknown,
  errorCode: unknown
): boolean => {
  // Successful completions can still carry a content_filter finish reason.
  if (typeof finishReason === 'string' && finishReason.toLowerCase() === 'content_filter') {
    return true;
  }
  // Some OpenAI tenants/models surface safety blocks as HTTP 422.
  if (status === 422) return true;
  // Most current safety blocks come back as HTTP 400 with a content-policy
  // error code in the standard error envelope. Without this branch a safety
  // block is misclassified as upstream_unavailable, the fallback model is
  // retried for nothing, and the user sees "service unavailable" instead of
  // the proper "we could not translate that image".
  if (status === 400 && isSafetyErrorCode(errorCode)) return true;
  return false;
};

const isRetryable = (
  status: number,
  finishReason: unknown,
  errorCode: unknown
): boolean => {
  if (isContentBlocked(status, finishReason, errorCode)) return false;
  // 4xx other than 408/429 generally indicates bad input or auth issues — retrying with a different model won't help.
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false;
};

const callOnce = async (
  config: AppConfig,
  fetchImpl: Fetch,
  input: ImageTranslateServiceInput,
  model: string
): Promise<{ readonly data: ImageTranslateResponse } | { readonly retryable: true } | { readonly blocked: true }> => {
  const dataUrl = toDataUrl(input.imageBytes, input.mimeType);
  const systemMessage: ChatCompletionMessage = {
    role: 'system',
    content: buildSystemPrompt(input.targetLanguage)
  };

  const body = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      systemMessage,
      {
        role: 'user',
        content: [
          { type: 'text', text: buildUserMessage(input.targetLanguage) },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  };

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    config.openAiImageRequestTimeoutMs
  );

  let response: Response;
  try {
    response = await fetchImpl(config.openAiChatCompletionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openAiApiKey ?? ''}`,
        'Content-Type': 'application/json'
      },
      signal: abortController.signal,
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { retryable: true };
    }
    return { retryable: true };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let finishReason: unknown;
    let errorCode: unknown;
    try {
      const payload = (await response.json()) as ChatCompletionResponse;
      finishReason = payload.choices?.[0]?.finish_reason;
      errorCode = payload.error?.code;
    } catch {
      finishReason = undefined;
      errorCode = undefined;
    }
    if (isContentBlocked(response.status, finishReason, errorCode)) {
      return { blocked: true };
    }
    if (isRetryable(response.status, finishReason, errorCode)) {
      return { retryable: true };
    }
    throw new OpenAiImageTranslateError(
      `OpenAI image translation rejected the request (status ${response.status})`,
      'invalid_request'
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new OpenAiImageTranslateError(
      'OpenAI image translation response was not valid JSON',
      'invalid_upstream_response'
    );
  }

  const choice = payload.choices?.[0];
  if (!choice) {
    throw new OpenAiImageTranslateError(
      'OpenAI image translation response did not include any choices',
      'invalid_upstream_response'
    );
  }

  if (isContentBlocked(response.status, choice.finish_reason, undefined)) {
    return { blocked: true };
  }

  const parsed = parseModelJsonContent(choice.message?.content);
  return { data: parsed };
};

export type OpenAiImageTranslateService = {
  readonly translateImage: (
    input: ImageTranslateServiceInput
  ) => Promise<ImageTranslateResponse>;
};

export const createOpenAiImageTranslateService = (
  config: AppConfig,
  fetchImpl: Fetch = fetch
): OpenAiImageTranslateService => ({
  translateImage: async (input) => {
    if (!config.openAiApiKey) {
      throw new OpenAiImageTranslateError(
        'OPENAI_API_KEY is not configured',
        'missing_config'
      );
    }

    const tiers: ReadonlyArray<{ model: string; tier: ImageTranslateModelTier }> = [
      { model: config.openAiImageModelPrimary, tier: 'primary' },
      { model: config.openAiImageModelFallback, tier: 'fallback' }
    ];

    let lastError: OpenAiImageTranslateError | null = null;

    for (const { model, tier } of tiers) {
      try {
        const result = await callOnce(config, fetchImpl, input, model);
        if ('blocked' in result) {
          throw new OpenAiImageTranslateError(
            'Image content was blocked by safety filters',
            'content_blocked'
          );
        }
        if ('retryable' in result) {
          lastError = new OpenAiImageTranslateError(
            `OpenAI image translation upstream failure on tier ${tier}`,
            'upstream_unavailable'
          );
          continue;
        }
        const validated = imageTranslateResponseSchema.parse({ ...result.data, modelTier: tier });
        return validated;
      } catch (error) {
        if (error instanceof OpenAiImageTranslateError) {
          if (error.kind === 'upstream_unavailable') {
            lastError = error;
            continue;
          }
          throw error;
        }
        throw new OpenAiImageTranslateError(
          'Unexpected error contacting OpenAI image translation',
          'upstream_unavailable'
        );
      }
    }

    throw (
      lastError ??
      new OpenAiImageTranslateError(
        'OpenAI image translation upstream failure',
        'upstream_unavailable'
      )
    );
  }
});
