import { describe, expect, it, vi } from 'vitest';

const requestRoomTokenMock = vi.hoisted(() => vi.fn());
const requestRealtimeTokenMock = vi.hoisted(() => vi.fn());
const createRealtimeTranslationSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../frontend/src/roomTokenClient', () => ({
  requestRoomToken: requestRoomTokenMock
}));

vi.mock('../../../frontend/src/realtimeTokenClient', () => ({
  requestRealtimeToken: requestRealtimeTokenMock
}));

vi.mock('../../../frontend/src/realtimeTranslationSession', () => ({
  createRealtimeTranslationSession: createRealtimeTranslationSessionMock
}));

import { createLiveKitRemoteRoomSession } from '../../../frontend/src/liveKitRemoteRoomSession';

const roomId = 'room_abcdefghijklmnopqrstuvwxyz';

const createFakeRoom = () => {
  const handlers = new Map<string, (...args: never[]) => void>();
  const room = {
    remoteParticipants: new Map(),
    localParticipant: {
      setMicrophoneEnabled: vi.fn(async () => undefined)
    },
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler);
      return room;
    })
  };

  return { room, handlers };
};

describe('createLiveKitRemoteRoomSession', () => {
  it('surfaces browser-local translation startup failures from remote tracks', async () => {
    const { room, handlers } = createFakeRoom();
    const onTranslationError = vi.fn();
    requestRoomTokenMock.mockResolvedValue({
      liveKitUrl: 'wss://simtalk.livekit.cloud',
      participantToken: 'livekit.jwt',
      roomId,
      participantIdentity: 'participant_abcdefghijklmnop',
      expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
    });
    requestRealtimeTokenMock.mockRejectedValue(new Error('OpenAI token failed'));

    await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: {
        mode: 'listener',
        targetLanguage: 'es'
      },
      createRoom: () => room as never,
      onTranslationError
    });

    handlers.get('trackSubscribed')?.(
      {
        kind: 'audio',
        source: 'microphone'
      } as never,
      {} as never,
      {} as never
    );

    await vi.waitFor(() => {
      expect(onTranslationError).toHaveBeenCalledWith('OpenAI token failed');
    });
    expect(createRealtimeTranslationSessionMock).not.toHaveBeenCalled();
  });
});
