import { describe, expect, it, vi } from 'vitest';

import { roomCreateRoute, roomTokenRoute } from '@simtalk/shared-types';

import { createApp } from '../../../../backend/src/app.js';
import { createAppConfig } from '../../../../backend/src/config.js';
import { LiveKitRoomError } from '../../../../backend/src/services/liveKitRooms.js';

const roomId = 'room_abcdefghijklmnopqrstuvwxyz';
const accessPassword = 'test-access-password';

const createTestConfig = (overrides: NodeJS.ProcessEnv = {}) =>
  createAppConfig({
    APP_ENV: 'test',
    APP_ACCESS_PASSWORD: accessPassword,
    ROOM_TOKEN_RATE_LIMIT_WINDOW_MS: '60000',
    ROOM_TOKEN_RATE_LIMIT_MAX_REQUESTS: '5',
    ...overrides
  });

const createRoomService = () => ({
  createRoom: vi.fn(async () => ({
    roomId,
    roomUrlPath: `/rooms/${roomId}`,
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  })),
  createParticipantToken: vi.fn(async () => ({
    liveKitUrl: 'wss://simtalk.livekit.cloud',
    participantToken: 'livekit.jwt',
    roomId,
    participantIdentity: 'participant_abcdefghijklmnop',
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  }))
});

describe('remote room routes', () => {
  it('creates a shareable room link without exposing LiveKit credentials', async () => {
    const roomService = createRoomService();
    const app = createApp(createTestConfig(), { liveKitRoomService: roomService });

    const response = await app.request(roomCreateRoute, {
      method: 'POST',
      headers: { 'X-Access-Password': accessPassword }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      roomId,
      roomUrlPath: `/rooms/${roomId}`
    });
    expect(JSON.stringify(body)).not.toContain('LIVEKIT_API_SECRET');
  });

  it('returns the validated room create response instead of raw service fields', async () => {
    const app = createApp(createTestConfig(), {
      liveKitRoomService: {
        createRoom: vi.fn(async () => ({
          roomId,
          roomUrlPath: `/rooms/${roomId}`,
          expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
          liveKitApiSecret: 'LIVEKIT_API_SECRET'
        })),
        createParticipantToken: vi.fn()
      }
    });

    const response = await app.request(roomCreateRoute, {
      method: 'POST',
      headers: { 'X-Access-Password': accessPassword }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      roomId,
      roomUrlPath: `/rooms/${roomId}`
    });
    expect(body).not.toHaveProperty('liveKitApiSecret');
    expect(JSON.stringify(body)).not.toContain('LIVEKIT_API_SECRET');
  });

  it('mints a room-scoped LiveKit participant token', async () => {
    const roomService = createRoomService();
    const app = createApp(createTestConfig(), { liveKitRoomService: roomService });

    const response = await app.request(roomTokenRoute(roomId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': accessPassword
      },
      body: JSON.stringify({
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      liveKitUrl: 'wss://simtalk.livekit.cloud',
      participantToken: 'livekit.jwt',
      roomId,
      participantIdentity: 'participant_abcdefghijklmnop'
    });
    expect(roomService.createParticipantToken).toHaveBeenCalledWith(roomId, {
      participantIdentity: 'participant_abcdefghijklmnop',
      targetLanguage: 'es'
    });
  });

  it('returns the validated room token response instead of raw service fields', async () => {
    const app = createApp(createTestConfig(), {
      liveKitRoomService: {
        createRoom: vi.fn(),
        createParticipantToken: vi.fn(async () => ({
          liveKitUrl: 'wss://simtalk.livekit.cloud',
          participantToken: 'livekit.jwt',
          roomId,
          participantIdentity: 'participant_abcdefghijklmnop',
          expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
          liveKitApiSecret: 'LIVEKIT_API_SECRET'
        }))
      }
    });

    const response = await app.request(roomTokenRoute(roomId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': accessPassword
      },
      body: JSON.stringify({
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      liveKitUrl: 'wss://simtalk.livekit.cloud',
      participantToken: 'livekit.jwt',
      roomId,
      participantIdentity: 'participant_abcdefghijklmnop'
    });
    expect(body).not.toHaveProperty('liveKitApiSecret');
    expect(JSON.stringify(body)).not.toContain('LIVEKIT_API_SECRET');
  });

  it('rejects invalid room token requests before minting a token', async () => {
    const roomService = createRoomService();
    const app = createApp(createTestConfig(), { liveKitRoomService: roomService });

    const response = await app.request(roomTokenRoute(roomId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': accessPassword
      },
      body: JSON.stringify({
        sourceLanguage: 'es',
        targetLanguage: 'es'
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Source and target languages must be different'
      }
    });
    expect(roomService.createParticipantToken).not.toHaveBeenCalled();
  });

  it('rejects invalid room ids before minting a token', async () => {
    const roomService = createRoomService();
    const app = createApp(createTestConfig(), { liveKitRoomService: roomService });

    const response = await app.request('/rooms/not-a-room/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': accessPassword
      },
      body: JSON.stringify({ targetLanguage: 'es' })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Room id is invalid'
      }
    });
    expect(roomService.createParticipantToken).not.toHaveBeenCalled();
  });

  it('maps missing LiveKit config to a sanitized server config error', async () => {
    const app = createApp(createTestConfig(), {
      liveKitRoomService: {
        createRoom: vi.fn(async () => {
          throw new LiveKitRoomError('secret missing', 'missing_config');
        }),
        createParticipantToken: vi.fn()
      }
    });

    const response = await app.request(roomCreateRoute, {
      method: 'POST',
      headers: { 'X-Access-Password': accessPassword }
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: 'missing_server_config',
        message: 'Remote rooms are not configured'
      }
    });
    expect(JSON.stringify(body)).not.toContain('secret missing');
  });

  it('rate limits room token minting per client', async () => {
    const roomService = createRoomService();
    const app = createApp(
      createTestConfig({
        ROOM_TOKEN_RATE_LIMIT_MAX_REQUESTS: '1'
      }),
      { liveKitRoomService: roomService }
    );

    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Password': accessPassword,
        'x-forwarded-for': '203.0.113.10'
      },
      body: JSON.stringify({ targetLanguage: 'es' })
    };

    const first = await app.request(roomTokenRoute(roomId), request);
    const second = await app.request(roomTokenRoute(roomId), request);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(roomService.createParticipantToken).toHaveBeenCalledTimes(1);
  });
});
