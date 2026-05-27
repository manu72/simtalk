import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import {
  apiErrorSchema,
  imageTranslateMimeTypeSchema,
  imageTranslateRequestSchema
} from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  createOpenAiImageTranslateService,
  OpenAiImageTranslateError,
  type OpenAiImageTranslateService
} from '../services/openAiImageTranslate.js';

type Fetch = typeof fetch;

type ImageTranslateRouteDependencies = {
  readonly fetch?: Fetch;
  readonly imageTranslateService?: OpenAiImageTranslateService;
};

const createRequestId = (): string => `req_${randomUUID()}`;

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export const createImageTranslateRoute = (
  config: AppConfig,
  dependencies: ImageTranslateRouteDependencies = {}
) => {
  const route = new Hono();
  const service =
    dependencies.imageTranslateService ??
    createOpenAiImageTranslateService(config, dependencies.fetch);
  const rateLimit = createRateLimitMiddleware({
    maxRequests: config.imageTranslateRateLimitMaxRequests,
    windowMs: config.imageTranslateRateLimitWindowMs,
    message: 'Too many image translation requests. Please wait before trying again.'
  });

  route.post('/translate', rateLimit, async (c) => {
    const requestId = createRequestId();

    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'bad_request',
            message: 'Request must be multipart/form-data with image and targetLanguage fields',
            requestId
          }
        }),
        400
      );
    }

    const declaredLengthHeader = c.req.header('content-length');
    if (declaredLengthHeader) {
      const declaredLength = Number(declaredLengthHeader);
      if (Number.isFinite(declaredLength) && declaredLength > config.imageTranslateMaxBytes * 1.1) {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'payload_too_large',
              message: `Image upload exceeds the ${formatBytes(config.imageTranslateMaxBytes)} limit`,
              requestId
            }
          }),
          413
        );
      }
    }

    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: false });
    } catch {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'bad_request',
            message: 'Could not parse multipart form data',
            requestId
          }
        }),
        400
      );
    }

    const rawTargetLanguage = form.targetLanguage;
    const rawImage = form.image;

    if (typeof rawTargetLanguage !== 'string') {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: 'targetLanguage field is required',
            requestId
          }
        }),
        400
      );
    }

    const parsedRequest = imageTranslateRequestSchema.safeParse({ targetLanguage: rawTargetLanguage });
    if (!parsedRequest.success) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: parsedRequest.error.issues[0]?.message ?? 'Invalid target language',
            requestId
          }
        }),
        400
      );
    }

    if (!(rawImage instanceof File)) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: 'image field must be a file upload',
            requestId
          }
        }),
        400
      );
    }

    const declaredMime = rawImage.type || 'application/octet-stream';
    const mimeCheck = imageTranslateMimeTypeSchema.safeParse(declaredMime);
    if (!mimeCheck.success) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'unsupported_media_type',
            message: 'Image must be JPEG, PNG, WebP, or HEIC',
            requestId
          }
        }),
        415
      );
    }

    if (rawImage.size > config.imageTranslateMaxBytes) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'payload_too_large',
            message: `Image upload exceeds the ${formatBytes(config.imageTranslateMaxBytes)} limit`,
            requestId
          }
        }),
        413
      );
    }

    if (rawImage.size === 0) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: 'Image file is empty',
            requestId
          }
        }),
        400
      );
    }

    let imageBytes: Uint8Array;
    try {
      const buffer = await rawImage.arrayBuffer();
      imageBytes = new Uint8Array(buffer);
    } catch {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'bad_request',
            message: 'Could not read uploaded image bytes',
            requestId
          }
        }),
        400
      );
    }

    if (imageBytes.byteLength > config.imageTranslateMaxBytes) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'payload_too_large',
            message: `Image upload exceeds the ${formatBytes(config.imageTranslateMaxBytes)} limit`,
            requestId
          }
        }),
        413
      );
    }

    try {
      const result = await service.translateImage({
        imageBytes,
        mimeType: mimeCheck.data,
        targetLanguage: parsedRequest.data.targetLanguage
      });
      c.header('Cache-Control', 'no-store');
      return c.json(result);
    } catch (error) {
      if (error instanceof OpenAiImageTranslateError) {
        if (error.kind === 'missing_config') {
          return c.json(
            apiErrorSchema.parse({
              error: {
                code: 'missing_server_config',
                message: 'Image translation is not configured',
                requestId
              }
            }),
            503
          );
        }
        if (error.kind === 'content_blocked') {
          return c.json(
            apiErrorSchema.parse({
              error: {
                code: 'content_blocked',
                message: 'We could not translate that image',
                requestId
              }
            }),
            422
          );
        }
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'openai_unavailable',
              message: 'Image translation service is unavailable',
              requestId
            }
          }),
          502
        );
      }

      throw error;
    }
  });

  return route;
};
