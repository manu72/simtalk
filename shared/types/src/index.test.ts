import { describe, expect, it } from 'vitest';

import {
  conversationModes,
  healthResponseSchema,
  realtimeTokenRequestSchema
} from './index';

describe('shared API contracts', () => {
  it('defines the supported Phase 1 conversation modes', () => {
    expect(conversationModes).toEqual(['listener', 'turnabout', 'practice']);
  });

  it('validates realtime token requests at the boundary', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'listener',
      targetLanguage: 'en-AU'
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown conversation modes', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'conference',
      targetLanguage: 'en'
    });

    expect(result.success).toBe(false);
  });

  it('keeps the health response payload minimal', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      service: 'simtalk-api',
      timestamp: new Date().toISOString()
    });

    expect(parsed).toMatchObject({
      status: 'ok',
      service: 'simtalk-api'
    });
  });
});
