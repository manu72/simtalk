import { describe, expect, it, vi } from 'vitest';

import { openAiRealtimeTranslationCallsUrl, type RealtimeTokenResponse } from '@simtalk/shared-types';

import { createRealtimeTranslationSession } from '../../../frontend/src/realtimeTranslationSession';

const token = {
  clientSecret: 'ek_test_client_secret',
  expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
  sessionId: 'sess_test',
  sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
  translationCallUrl: openAiRealtimeTranslationCallsUrl
} satisfies RealtimeTokenResponse;

class FakeTrack {
  readonly kind = 'audio';
  enabled = true;
  stop = vi.fn();
}

class FakeMediaStream {
  readonly tracks = [new FakeTrack()];

  getTracks() {
    return this.tracks;
  }
}

class FakeDataChannel extends EventTarget {
  close = vi.fn();
}

class FakePeerConnection {
  readonly dataChannel = new FakeDataChannel();
  readonly addTrack = vi.fn();
  readonly close = vi.fn();
  readonly createDataChannel = vi.fn(() => this.dataChannel);
  readonly createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  readonly setLocalDescription = vi.fn(async () => undefined);
  readonly setRemoteDescription = vi.fn(async () => undefined);

  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null;
}

describe('createRealtimeTranslationSession', () => {
  it('posts the local SDP offer to the translation calls endpoint', async () => {
    const mediaStream = new FakeMediaStream();
    const peerConnection = new FakePeerConnection();
    const fetchMock = vi.fn(async () => new Response('answer-sdp'));

    await createRealtimeTranslationSession({
      token,
      getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(token.translationCallUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.clientSecret}`,
        'Content-Type': 'application/sdp'
      },
      body: 'offer-sdp'
    });
    expect(peerConnection.createDataChannel).toHaveBeenCalledWith('oai-events');
    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp'
    });
  });

  it('exposes the captured local microphone stream for browser-local recording', async () => {
    const mediaStream = new FakeMediaStream();
    const onLocalStream = vi.fn();

    await createRealtimeTranslationSession({
      token,
      getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
      createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp')),
      onLocalStream
    });

    expect(onLocalStream).toHaveBeenCalledWith(mediaStream);
  });

  it('can start with local microphone audio muted while keeping the session alive', async () => {
    const mediaStream = new FakeMediaStream();

    const session = await createRealtimeTranslationSession({
      token,
      startLocalAudioEnabled: false,
      getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
      createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp'))
    });

    expect(mediaStream.tracks[0]?.enabled).toBe(false);

    session.setLocalAudioEnabled(true);
    expect(mediaStream.tracks[0]?.enabled).toBe(true);

    session.setLocalAudioEnabled(false);
    expect(mediaStream.tracks[0]?.enabled).toBe(false);
  });

  it('emits transcript deltas from the OpenAI data channel', async () => {
    const peerConnection = new FakePeerConnection();
    const onTranscriptDelta = vi.fn();

    await createRealtimeTranslationSession({
      token,
      getUserMedia: vi.fn(async () => new FakeMediaStream() as unknown as MediaStream),
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp')),
      onTranscriptDelta
    });

    peerConnection.dataChannel.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'session.output_transcript.delta',
          delta: 'hola'
        })
      })
    );

    expect(onTranscriptDelta).toHaveBeenCalledWith({
      kind: 'output',
      text: 'hola'
    });

    peerConnection.dataChannel.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'session.input_transcript.delta',
          delta: 'hello'
        })
      })
    );

    expect(onTranscriptDelta).toHaveBeenCalledWith({
      kind: 'input',
      text: 'hello'
    });
  });

  it('cleans up local resources when the SDP exchange fails', async () => {
    const mediaStream = new FakeMediaStream();
    const peerConnection = new FakePeerConnection();
    const audioElement = document.createElement('audio');
    const removeAudio = vi.spyOn(audioElement, 'remove');

    await expect(
      createRealtimeTranslationSession({
        token,
        getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
        createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
        createAudioElement: () => audioElement,
        fetchImpl: vi.fn(async () => new Response('nope', { status: 401 }))
      })
    ).rejects.toThrow('OpenAI rejected the WebRTC session offer.');

    expect(mediaStream.tracks[0]?.stop).toHaveBeenCalled();
    expect(peerConnection.dataChannel.close).toHaveBeenCalled();
    expect(peerConnection.close).toHaveBeenCalled();
    expect(removeAudio).toHaveBeenCalled();
  });

  it('cleans up the microphone if peer connection setup fails after capture', async () => {
    const mediaStream = new FakeMediaStream();

    await expect(
      createRealtimeTranslationSession({
        token,
        getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
        createPeerConnection: () => {
          throw new Error('peer setup failed');
        },
        createAudioElement: () => document.createElement('audio'),
        fetchImpl: vi.fn(async () => new Response('answer-sdp'))
      })
    ).rejects.toThrow('peer setup failed');

    expect(mediaStream.tracks[0]?.stop).toHaveBeenCalled();
  });

  it('aborts pending startup work and cleans up local resources', async () => {
    const mediaStream = new FakeMediaStream();
    const peerConnection = new FakePeerConnection();
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));

    const sessionPromise = createRealtimeTranslationSession({
      token,
      signal: controller.signal,
      getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    controller.abort();

    await expect(sessionPromise).rejects.toThrow('WebRTC startup was cancelled.');
    expect(mediaStream.tracks[0]?.stop).toHaveBeenCalled();
    expect(peerConnection.dataChannel.close).toHaveBeenCalled();
    expect(peerConnection.close).toHaveBeenCalled();
  });

  it('stops a late-granted microphone stream after startup is aborted', async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    const mediaStream = new FakeMediaStream();
    const controller = new AbortController();

    const sessionPromise = createRealtimeTranslationSession({
      token,
      signal: controller.signal,
      getUserMedia: vi.fn(
        () =>
          new Promise<MediaStream>((resolve) => {
            resolveMedia = resolve;
          })
      ),
      createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp'))
    });

    controller.abort();

    await expect(sessionPromise).rejects.toThrow('WebRTC startup was cancelled.');

    resolveMedia(mediaStream as unknown as MediaStream);

    await vi.waitFor(() => {
      expect(mediaStream.tracks[0]?.stop).toHaveBeenCalled();
    });
  });

  it('attaches remote audio when track events omit a stream', async () => {
    const peerConnection = new FakePeerConnection();
    const audioElement = document.createElement('audio');
    const remoteTrack = new FakeTrack();
    const FakeRemoteMediaStream = vi.fn(function FakeRemoteMediaStream(this: MediaStream) {
      return { getTracks: () => [remoteTrack] };
    });
    vi.stubGlobal('MediaStream', FakeRemoteMediaStream);

    await createRealtimeTranslationSession({
      token,
      getUserMedia: vi.fn(async () => new FakeMediaStream() as unknown as MediaStream),
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => audioElement,
      fetchImpl: vi.fn(async () => new Response('answer-sdp'))
    });

    peerConnection.ontrack?.({
      streams: [],
      track: remoteTrack as unknown as MediaStreamTrack
    });

    expect(FakeRemoteMediaStream).toHaveBeenCalledWith([remoteTrack]);
    expect(audioElement.srcObject).toBeTruthy();
  });

  it('can translate an existing remote media stream without owning its track lifecycle', async () => {
    const mediaStream = new FakeMediaStream();
    const getUserMedia = vi.fn();

    const session = await createRealtimeTranslationSession({
      token,
      inputStream: mediaStream as unknown as MediaStream,
      getUserMedia,
      createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp'))
    });

    session.stop();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mediaStream.tracks[0]?.stop).not.toHaveBeenCalled();
  });

  it('stops local tracks, closes the data channel, and closes the peer connection', async () => {
    const mediaStream = new FakeMediaStream();
    const peerConnection = new FakePeerConnection();

    const session = await createRealtimeTranslationSession({
      token,
      getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      createAudioElement: () => document.createElement('audio'),
      fetchImpl: vi.fn(async () => new Response('answer-sdp'))
    });

    session.stop();

    expect(mediaStream.tracks[0]?.stop).toHaveBeenCalled();
    expect(peerConnection.dataChannel.close).toHaveBeenCalled();
    expect(peerConnection.close).toHaveBeenCalled();
  });
});
