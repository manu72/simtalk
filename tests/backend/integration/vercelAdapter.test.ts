import { describe, expect, it } from 'vitest';

import vercelHandler from '../../../api/index.js';

describe('Vercel API adapter', () => {
  it('mounts the Hono backend under /api for single-project Vercel deploys', async () => {
    const response = await vercelHandler(new Request('http://localhost/api/health'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'simtalk-api'
    });
  });
});
