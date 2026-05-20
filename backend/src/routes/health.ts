import { Hono } from 'hono';

import { healthResponseSchema } from '@simtalk/shared-types';

export const healthRoute = new Hono().get('/', (c) => {
  const payload = healthResponseSchema.parse({
    status: 'ok',
    service: 'simtalk-api',
    timestamp: new Date().toISOString()
  });

  return c.json(payload);
});
