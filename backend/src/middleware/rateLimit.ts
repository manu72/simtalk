import type { MiddlewareHandler } from 'hono';

import { apiErrorSchema } from '@simtalk/shared-types';

type RateLimitOptions = {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly maxEntries?: number;
  readonly message?: string;
};

type RateLimitEntry = {
  readonly resetAt: number;
  readonly count: number;
};

const clientKeyFromHeaders = (headers: Headers): string => {
  const forwardedFor = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .at(-1);
  const realIp = headers.get('x-real-ip')?.trim();

  return forwardedFor || realIp || 'local';
};

const pruneEntries = (
  entries: Map<string, RateLimitEntry>,
  now: number,
  maxEntries: number
): void => {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      entries.delete(key);
    }
  }

  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (!oldestKey) {
      return;
    }
    entries.delete(oldestKey);
  }
};

export const createRateLimitMiddleware = ({
  maxRequests,
  windowMs,
  maxEntries = 1_000,
  message = 'Too many requests. Please wait before trying again.'
}: RateLimitOptions): MiddlewareHandler => {
  const entries = new Map<string, RateLimitEntry>();

  return async (c, next) => {
    const now = Date.now();
    pruneEntries(entries, now, maxEntries);
    const key = clientKeyFromHeaders(c.req.raw.headers);
    const entry = entries.get(key);

    if (!entry || entry.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (entry.count >= maxRequests) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'rate_limited',
            message
          }
        }),
        429
      );
    }

    entries.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
    await next();
  };
};
