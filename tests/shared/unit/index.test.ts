import { describe, expect, it } from 'vitest';

import {
  apiErrorSchema,
  conversationModes,
  healthResponseSchema,
  languageCodeSchema,
  openAiRealtimeTranslationCallsUrl,
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
  realtimeTokenRoute,
  roomCreateResponseSchema,
  roomIdSchema,
  roomTokenRequestSchema,
  roomTokenResponseSchema,
  roomTokenRoute
} from '../../../shared/types/src/index';

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

  it('defines the backend realtime token route', () => {
    expect(realtimeTokenRoute).toBe('/realtime/token');
  });

  it('defines the LiveKit room token route helper', () => {
    expect(roomTokenRoute('room_abcdefghijklmnopqrstuvwxyz')).toBe(
      '/rooms/room_abcdefghijklmnopqrstuvwxyz/token'
    );
  });

  it('requires a source language for turn-about mode', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'turnabout',
      targetLanguage: 'en'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Turn-about mode requires a source language'
      );
    }
  });

  it('rejects requests that translate a language into itself', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'practice',
      sourceLanguage: 'es',
      targetLanguage: 'es'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Source and target languages must be different'
      );
    }
  });

  it('rejects equivalent language tags with different casing', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'practice',
      sourceLanguage: 'en-us',
      targetLanguage: 'en-US'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Source and target languages must be different'
      );
    }
  });

  it('rejects unknown conversation modes', () => {
    const result = realtimeTokenRequestSchema.safeParse({
      mode: 'conference',
      targetLanguage: 'en'
    });

    expect(result.success).toBe(false);
  });

  it('rejects syntactically invalid BCP-47 language tags', () => {
    const result = languageCodeSchema.safeParse('not a language tag');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid BCP-47 language tag');
    }
  });

  it('validates the browser-safe realtime token response', () => {
    const parsed = realtimeTokenResponseSchema.parse({
      clientSecret: 'ek_test',
      expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
      sessionId: 'sess_test',
      sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
      translationCallUrl: openAiRealtimeTranslationCallsUrl
    });

    expect(parsed).toMatchObject({
      clientSecret: 'ek_test',
      sessionId: 'sess_test',
      translationCallUrl: openAiRealtimeTranslationCallsUrl
    });
  });

  it('validates shareable room ids and room creation responses', () => {
    const roomId = 'room_abcdefghijklmnopqrstuvwxyz';

    expect(roomIdSchema.safeParse(roomId).success).toBe(true);
    expect(roomCreateResponseSchema.parse({
      roomId,
      roomUrlPath: `/rooms/${roomId}`,
      expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
    })).toMatchObject({ roomId });
  });

  it('validates LiveKit token requests and responses without server secrets', () => {
    const request = roomTokenRequestSchema.parse({
      participantIdentity: 'participant_abcdefghijklmnop',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    });
    const response = roomTokenResponseSchema.parse({
      liveKitUrl: 'wss://simtalk.livekit.cloud',
      participantToken: 'livekit.jwt',
      roomId: 'room_abcdefghijklmnopqrstuvwxyz',
      participantIdentity: request.participantIdentity,
      expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
    });

    expect(response.participantToken).toBe('livekit.jwt');
    expect(JSON.stringify(response)).not.toContain('LIVEKIT_API_SECRET');
  });

  it('validates the standard API error envelope', () => {
    const parsed = apiErrorSchema.parse({
      error: {
        code: 'validation_error',
        message: 'Request body is invalid',
        requestId: 'req_test'
      }
    });

    expect(parsed.error.code).toBe('validation_error');
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
