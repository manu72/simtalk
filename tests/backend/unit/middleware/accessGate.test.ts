import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createAccessGateMiddleware } from '../../../../backend/src/middleware/accessGate.js';

const buildApp = (password: string | undefined) => {
  const app = new Hono();
  app.use('*', createAccessGateMiddleware(password));
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
};

describe('createAccessGateMiddleware', () => {
  it('passes through every request when the password is undefined', async () => {
    const app = buildApp(undefined);

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('passes through every request when the password is an empty string', async () => {
    const app = buildApp('');

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('returns 401 when the X-Access-Password header is missing', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'unauthorized', message: 'Access denied.' }
    });
  });

  it('returns 401 when the X-Access-Password header is wrong', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected', {
      headers: { 'X-Access-Password': 'wrong' }
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 when the header is a prefix or suffix of the password', async () => {
    const app = buildApp('hunter2');

    const prefix = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter' }
    });
    const suffix = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter22' }
    });

    expect(prefix.status).toBe(401);
    expect(suffix.status).toBe(401);
  });

  it('passes through when the X-Access-Password header matches exactly', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter2' }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
