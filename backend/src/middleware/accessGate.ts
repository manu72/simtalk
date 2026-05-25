import { createHash, timingSafeEqual } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import { apiErrorSchema } from '@simtalk/shared-types';

const ACCESS_HEADER = 'x-access-password';

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export const createAccessGateMiddleware = (
  passwords: readonly string[]
): MiddlewareHandler => {
  if (passwords.length === 0) {
    return async (_c, next) => {
      await next();
    };
  }

  const expectedHashes = passwords.map(sha256);

  return async (c, next) => {
    const provided = c.req.raw.headers.get(ACCESS_HEADER);

    if (provided === null) {
      return c.json(
        apiErrorSchema.parse({
          error: { code: 'unauthorized', message: 'Access denied.' }
        }),
        401
      );
    }

    const providedHash = sha256(provided);
    const matched = expectedHashes.some((expected) => timingSafeEqual(providedHash, expected));

    if (!matched) {
      return c.json(
        apiErrorSchema.parse({
          error: { code: 'unauthorized', message: 'Access denied.' }
        }),
        401
      );
    }

    await next();
  };
};
