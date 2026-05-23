import { describe, expect, it } from 'vitest';

import vercelApp from '../../../api/[...route].js';

describe('Vercel API adapter', () => {
  it('mounts the Hono backend under /api for single-project Vercel deploys', async () => {
    const response = await vercelApp.request('/api/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'simtalk-api'
    });
  });
});
