import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

const config = {
  appEnv: 'test',
  port: 3000,
  allowedOrigins: ['http://localhost:5173']
} as const;

describe('SimTalk API app', () => {
  it('returns a minimal health payload without secrets', async () => {
    const app = createApp(config);

    const response = await app.request('/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'simtalk-api'
    });
    expect(JSON.stringify(body)).not.toContain('OPENAI_API_KEY');
  });

  it('allows only configured browser origins', async () => {
    const app = createApp(config);

    const allowed = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' }
    });
    const blocked = await app.request('/health', {
      headers: { Origin: 'https://example.com' }
    });

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('sets baseline security headers', async () => {
    const app = createApp(config);

    const response = await app.request('/health');

    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });
});
