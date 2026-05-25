import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const roomTokenResponse = {
  liveKitUrl: 'wss://simtalk.livekit.cloud',
  participantToken: 'livekit.jwt',
  roomId,
  participantIdentity: 'participant_abcdefghijklmnop',
  expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
};

const createFakeRoom = () => {
  const handlers = new Map<string, (...args: never[]) => void>();
  const room = {
    remoteParticipants: new Map(),
    localParticipant: {
      setMicrophoneEnabled: vi.fn(async () => undefined),
      setAttributes: vi.fn(async () => undefined)
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
  beforeEach(() => {
    requestRoomTokenMock.mockReset();
    requestRealtimeTokenMock.mockReset();
    createRealtimeTranslationSessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disconnects the room when microphone startup fails after connect', async () => {
    const { room } = createFakeRoom();
    const microphoneError = new Error('Microphone permission denied');
    room.localParticipant.setMicrophoneEnabled.mockRejectedValue(microphoneError);
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);

    await expect(
      createLiveKitRemoteRoomSession({
        roomId,
        roomTokenRequest: {
          participantIdentity: 'participant_abcdefghijklmnop',
          targetLanguage: 'es'
        },
        realtimeTokenRequest: {
          mode: 'listener',
          targetLanguage: 'es'
        },
        createRoom: () => room as never
      })
    ).rejects.toThrow('Microphone permission denied');

    expect(room.connect).toHaveBeenCalledWith(
      roomTokenResponse.liveKitUrl,
      roomTokenResponse.participantToken
    );
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(createRealtimeTranslationSessionMock).not.toHaveBeenCalled();
  });

  it('surfaces browser-local translation startup failures from remote tracks', async () => {
    const { room, handlers } = createFakeRoom();
    const onTranslationError = vi.fn();
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);
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

  it('stops a translation session that resolves after the room session was stopped', async () => {
    const { room, handlers } = createFakeRoom();
    const translationSession = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    let resolveTranslationSession: ((session: typeof translationSession) => void) | undefined;

    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);
    requestRealtimeTokenMock.mockResolvedValue({
      clientSecret: 'ek_test_client_secret',
      expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
      sessionId: 'sess_test',
      sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
      translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
    });
    vi.stubGlobal(
      'MediaStream',
      class FakeMediaStream {
        readonly tracks: readonly MediaStreamTrack[];

        constructor(tracks: readonly MediaStreamTrack[]) {
          this.tracks = tracks;
        }
      }
    );
    createRealtimeTranslationSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranslationSession = resolve;
        })
    );

    const session = await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: {
        mode: 'listener',
        targetLanguage: 'es'
      },
      createRoom: () => room as never
    });

    handlers.get('trackSubscribed')?.(
      {
        kind: 'audio',
        source: 'microphone',
        mediaStreamTrack: {} as MediaStreamTrack
      } as never,
      {} as never,
      {} as never
    );

    await vi.waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    session.stop();
    resolveTranslationSession?.(translationSession);

    await vi.waitFor(() => {
      expect(translationSession.stop).toHaveBeenCalledTimes(1);
    });
  });

  it('pushes the initial youHear attribute on connect', async () => {
    const { room } = createFakeRoom();
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);

    await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: { mode: 'listener', targetLanguage: 'es' },
      initialYouHear: 'es',
      createRoom: () => room as never
    });

    expect(room.localParticipant.setAttributes).toHaveBeenCalledWith({ youHear: 'es' });
  });

  it('stops a stale translation session whose startup was superseded by a newer track', async () => {
    const { room, handlers } = createFakeRoom();
    const staleSession = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    const winningSession = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    const pendingResolvers: Array<(session: typeof staleSession) => void> = [];

    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);
    requestRealtimeTokenMock.mockResolvedValue({
      clientSecret: 'ek_test_client_secret',
      expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
      sessionId: 'sess_test',
      sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
      translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
    });
    vi.stubGlobal(
      'MediaStream',
      class FakeMediaStream {
        readonly tracks: readonly MediaStreamTrack[];

        constructor(tracks: readonly MediaStreamTrack[]) {
          this.tracks = tracks;
        }
      }
    );
    createRealtimeTranslationSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingResolvers.push(resolve);
        })
    );

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
      createRoom: () => room as never
    });

    const firstTrack = {
      kind: 'audio',
      source: 'microphone',
      mediaStreamTrack: {} as MediaStreamTrack
    };
    const secondTrack = {
      kind: 'audio',
      source: 'microphone',
      mediaStreamTrack: {} as MediaStreamTrack
    };

    handlers.get('trackSubscribed')?.(firstTrack as never, {} as never, {} as never);

    await vi.waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalledTimes(1);
    });

    handlers.get('trackSubscribed')?.(secondTrack as never, {} as never, {} as never);

    await vi.waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalledTimes(2);
    });

    expect(pendingResolvers).toHaveLength(2);
    const [resolveFirst, resolveSecond] = pendingResolvers;
    if (!resolveFirst || !resolveSecond) {
      throw new Error('expected two pending translation-session resolvers');
    }
    // Resolve the FIRST startup last so that the second handler's
    // stopTranslation() (called when it began) has already invalidated the
    // first startup's generation. The first session must be torn down rather
    // than overwriting the second session's pointer.
    resolveSecond(winningSession);
    resolveFirst(staleSession);

    await vi.waitFor(() => {
      expect(staleSession.stop).toHaveBeenCalledTimes(1);
    });
    expect(winningSession.stop).not.toHaveBeenCalled();
  });
});
