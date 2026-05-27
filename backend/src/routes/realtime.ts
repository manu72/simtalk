import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import { apiErrorSchema, realtimeTokenRequestSchema } from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  createOpenAiRealtimeService,
  OpenAiRealtimeError
} from '../services/openAiRealtime.js';

type Fetch = typeof fetch;

type RealtimeRouteDependencies = {
  readonly fetch?: Fetch;
};

const createRequestId = (): string => `req_${randomUUID()}`;

export const createRealtimeRoute = (
  config: AppConfig,
  dependencies: RealtimeRouteDependencies = {}
) => {
  const route = new Hono();
  const realtimeService = createOpenAiRealtimeService(config, dependencies.fetch);
  const rateLimit = createRateLimitMiddleware({
    maxRequests: config.realtimeTokenRateLimitMaxRequests,
    windowMs: config.realtimeTokenRateLimitWindowMs,
    message: 'Too many realtime token requests. Please wait before trying again.'
  });

  route.post('/token', rateLimit, async (c) => {
    const requestId = createRequestId();
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'bad_request',
            message: 'Request body must be valid JSON',
            requestId
          }
        }),
        400
      );
    }

    const parsed = realtimeTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: parsed.error.issues[0]?.message ?? 'Realtime token request is invalid',
            requestId
          }
        }),
        400
      );
    }

    try {
      const token = await realtimeService.createTranslationClientSecret(parsed.data);
      c.header('Cache-Control', 'no-store');
      return c.json(token);
    } catch (error) {
      if (error instanceof OpenAiRealtimeError && error.kind === 'missing_config') {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'missing_server_config',
              message: 'Realtime translation is not configured',
              requestId
            }
          }),
          503
        );
      }

      if (error instanceof OpenAiRealtimeError) {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'openai_unavailable',
              message: 'Realtime translation service is unavailable',
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
