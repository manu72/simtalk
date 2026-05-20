import { describe, expect, it } from 'vitest';

import { createAppConfig } from './config.js';

describe('createAppConfig', () => {
  it.each([
    { name: 'missing', port: undefined },
    { name: 'empty', port: '' },
    { name: 'non-numeric', port: 'abc' },
    { name: 'zero', port: '0' },
    { name: 'out of range', port: '70000' }
  ])('uses the default port when PORT is $name', ({ port }) => {
    const config = createAppConfig({ PORT: port });

    expect(config.port).toBe(3000);
  });

  it('uses a configured port when PORT is valid', () => {
    const config = createAppConfig({ PORT: '4173' });

    expect(config.port).toBe(4173);
  });
});
