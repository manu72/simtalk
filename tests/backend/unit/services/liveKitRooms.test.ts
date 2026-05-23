import { describe, expect, it, vi } from 'vitest';

import { createAppConfig } from '../../../../backend/src/config.js';
import {
  createLiveKitRoomService,
  LiveKitRoomError
} from '../../../../backend/src/services/liveKitRooms.js';

const createTestConfig = (overrides: NodeJS.ProcessEnv = {}) =>
  createAppConfig({
    APP_ENV: 'test',
    LIVEKIT_URL: 'wss://simtalk.livekit.cloud',
    LIVEKIT_API_KEY: 'lk_test_key',
    LIVEKIT_API_SECRET: 'lk_test_secret',
    LIVEKIT_TOKEN_TTL_SECONDS: '300',
    ...overrides
  });

describe('createLiveKitRoomService', () => {
  it('creates two-person rooms with short cleanup windows', async () => {
    const createRoom = vi.fn(async () => ({}));
    const service = createLiveKitRoomService(createTestConfig(), {
      now: () => new Date('2026-05-20T13:00:00.000Z'),
      randomId: () => 'room_abcdefghijklmnopqrstuvwxyz',
      roomService: { createRoom }
    });

    const room = await service.createRoom();

    expect(room).toEqual({
      roomId: 'room_abcdefghijklmnopqrstuvwxyz',
      roomUrlPath: '/rooms/room_abcdefghijklmnopqrstuvwxyz',
      expiresAt: '2026-05-20T13:05:00.000Z'
    });
    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'room_abcdefghijklmnopqrstuvwxyz',
        maxParticipants: 2,
        emptyTimeout: 300,
        departureTimeout: 60
      })
    );
  });

  it('mints room-scoped LiveKit tokens without exposing the API secret', async () => {
    const createRoom = vi.fn(async () => ({}));
    const tokenSigner = vi.fn(async () => 'livekit.jwt');
    const service = createLiveKitRoomService(createTestConfig(), {
      now: () => new Date('2026-05-20T13:00:00.000Z'),
      roomService: { createRoom },
      tokenSigner
    });

    const token = await service.createParticipantToken('room_abcdefghijklmnopqrstuvwxyz', {
      participantIdentity: 'participant_abcdefghijklmnop',
      displayName: 'Tester',
      targetLanguage: 'es'
    });

    expect(token).toMatchObject({
      liveKitUrl: 'wss://simtalk.livekit.cloud',
      participantToken: 'livekit.jwt',
      roomId: 'room_abcdefghijklmnopqrstuvwxyz',
      participantIdentity: 'participant_abcdefghijklmnop'
    });
    expect(JSON.stringify(token)).not.toContain('lk_test_secret');
    expect(tokenSigner).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room_abcdefghijklmnopqrstuvwxyz',
        participantIdentity: 'participant_abcdefghijklmnop',
        displayName: 'Tester',
        ttlSeconds: 300,
        apiKey: 'lk_test_key',
        apiSecret: 'lk_test_secret'
      })
    );
  });

  it('fails closed when LiveKit credentials are missing', async () => {
    const service = createLiveKitRoomService(createTestConfig({ LIVEKIT_API_SECRET: '' }), {
      roomService: { createRoom: vi.fn(async () => ({})) }
    });

    await expect(service.createRoom()).rejects.toMatchObject({
      kind: 'missing_config'
    } satisfies Partial<LiveKitRoomError>);
  });
});
