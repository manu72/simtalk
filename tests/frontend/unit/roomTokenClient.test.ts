import { describe, expect, it, vi } from 'vitest';

import {
  requestRoomCreate,
  requestRoomToken,
  RoomTokenClientError
} from '../../../frontend/src/roomTokenClient';

const roomId = 'room_abcdefghijklmnopqrstuvwxyz';

describe('room token client', () => {
  it('requests a shareable room from the API base URL', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          roomId,
          roomUrlPath: `/rooms/${roomId}`,
          expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const room = await requestRoomCreate({ apiBaseUrl: '/api', fetchImpl: fetchMock });

    expect(room.roomUrlPath).toBe(`/rooms/${roomId}`);
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', { method: 'POST' });
  });

  it('requests a LiveKit participant token without browser secrets', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          liveKitUrl: 'wss://simtalk.livekit.cloud',
          participantToken: 'livekit.jwt',
          roomId,
          participantIdentity: 'participant_abcdefghijklmnop',
          expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const token = await requestRoomToken(
      roomId,
      {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      { apiBaseUrl: '/api', fetchImpl: fetchMock }
    );

    expect(token.participantToken).toBe('livekit.jwt');
    expect(JSON.stringify(token)).not.toContain('LIVEKIT_API_SECRET');
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms/room_abcdefghijklmnopqrstuvwxyz/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      })
    });
  });

  it('rejects malformed room ids before building the token route', async () => {
    const fetchMock = vi.fn();

    const result = await requestRoomToken(
      'room_abcdefghijklmnopqrstuv%2Fescape',
      { targetLanguage: 'es' },
      { apiBaseUrl: '/api', fetchImpl: fetchMock }
    ).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(RoomTokenClientError);
    expect(result).toMatchObject({
      code: 'validation_error',
      message: 'Invalid room id'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
