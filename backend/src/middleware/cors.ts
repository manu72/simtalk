import type { MiddlewareHandler } from 'hono';

import type { AppConfig } from '../config.js';

const allowedMethods = 'GET,POST,OPTIONS';
const allowedHeaders = 'Content-Type,Authorization,X-Access-Password';

export const createCorsMiddleware =
  (config: AppConfig): MiddlewareHandler =>
  async (c, next) => {
    const origin = c.req.header('Origin');

    if (origin && config.allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Methods', allowedMethods);
      c.header('Access-Control-Allow-Headers', allowedHeaders);
      c.header('Vary', 'Origin');
    }

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  };
