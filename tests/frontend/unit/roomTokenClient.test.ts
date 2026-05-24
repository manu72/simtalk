import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  AccessDeniedError,
  clearStoredPassword,
  setStoredPassword
} from '../../../frontend/src/accessGate';
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
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', { method: 'POST', headers: {} });
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

afterEach(() => {
  clearStoredPassword();
});

describe('access gate header on room endpoints', () => {
  const roomId = 'room_abcdefghijklmnopqrstuvwxyz';
  const roomCreatePayload = {
    roomId,
    roomUrlPath: `/rooms/${roomId}`,
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  };
  const roomTokenPayload = {
    liveKitUrl: 'wss://simtalk.livekit.cloud',
    participantToken: 'livekit.jwt',
    roomId,
    participantIdentity: 'participant_abcdefghijklmnop',
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  };
  const roomTokenRequest = {
    participantIdentity: 'participant_abcdefghijklmnop',
    targetLanguage: 'en'
  } as const;

  it('sends X-Access-Password on requestRoomCreate when stored', async () => {
    setStoredPassword('hunter2');
    const fetchImpl = vi.fn(async () => Response.json(roomCreatePayload)) as unknown as typeof fetch;

    await requestRoomCreate({ fetchImpl });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toMatchObject({ 'X-Access-Password': 'hunter2' });
  });

  it('throws AccessDeniedError and clears storage when requestRoomCreate returns 401', async () => {
    setStoredPassword('wrong');
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    await expect(requestRoomCreate({ fetchImpl })).rejects.toBeInstanceOf(AccessDeniedError);
    expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
  });

  it('sends X-Access-Password on requestRoomToken when stored', async () => {
    setStoredPassword('hunter2');
    const fetchImpl = vi.fn(async () => Response.json(roomTokenPayload)) as unknown as typeof fetch;

    await requestRoomToken(roomId, roomTokenRequest, { fetchImpl });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toMatchObject({ 'X-Access-Password': 'hunter2' });
  });

  it('throws AccessDeniedError and clears storage when requestRoomToken returns 401', async () => {
    setStoredPassword('wrong');
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    await expect(
      requestRoomToken(roomId, roomTokenRequest, { fetchImpl })
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
  });
});
