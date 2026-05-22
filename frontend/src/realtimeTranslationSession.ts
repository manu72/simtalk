import type { RealtimeTokenResponse } from '@simtalk/shared-types';

export type TranscriptDelta = {
  readonly kind: 'input' | 'output';
  readonly text: string;
};

export type RealtimeTranslationSession = {
  readonly stop: () => void;
};

type CreateRealtimeTranslationSessionOptions = {
  readonly token: RealtimeTokenResponse;
  readonly signal?: AbortSignal;
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly createPeerConnection?: () => RTCPeerConnection;
  readonly createAudioElement?: () => HTMLAudioElement;
  readonly fetchImpl?: typeof fetch;
  readonly onLocalStream?: (stream: MediaStream) => void;
  readonly onTranscriptDelta?: (delta: TranscriptDelta) => void;
  readonly onRemoteAudio?: () => void;
};

export class RealtimeTranslationSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealtimeTranslationSessionError';
  }
}

const defaultGetUserMedia = async (
  constraints: MediaStreamConstraints
): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new RealtimeTranslationSessionError('This browser does not support microphone capture.');
  }

  return navigator.mediaDevices.getUserMedia(constraints);
};

const defaultCreateAudioElement = (): HTMLAudioElement => {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.hidden = true;
  audio.setAttribute('playsinline', '');
  document.body.append(audio);
  return audio;
};

const parseTranscriptDelta = (rawData: unknown): TranscriptDelta | null => {
  if (typeof rawData !== 'string') {
    return null;
  }

  try {
    const event = JSON.parse(rawData) as { readonly type?: unknown; readonly delta?: unknown };
    if (typeof event.delta !== 'string') {
      return null;
    }

    if (event.type === 'session.output_transcript.delta') {
      return { kind: 'output', text: event.delta };
    }

    if (event.type === 'session.input_transcript.delta') {
      return { kind: 'input', text: event.delta };
    }

    return null;
  } catch {
    return null;
  }
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new RealtimeTranslationSessionError('WebRTC startup was cancelled.');
  }
};

const abortable = async <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new RealtimeTranslationSessionError('WebRTC startup was cancelled.')),
        { once: true }
      );
    })
  ]);
};

export const createRealtimeTranslationSession = async ({
  token,
  signal,
  getUserMedia = defaultGetUserMedia,
  createPeerConnection = () => new RTCPeerConnection(),
  createAudioElement = defaultCreateAudioElement,
  fetchImpl = fetch,
  onLocalStream,
  onTranscriptDelta,
  onRemoteAudio
}: CreateRealtimeTranslationSessionOptions): Promise<RealtimeTranslationSession> => {
  let localStream: MediaStream | null = null;
  let peerConnection: RTCPeerConnection | null = null;
  let audioElement: HTMLAudioElement | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let isStopped = false;

  const cleanup = () => {
    if (isStopped) {
      return;
    }
    isStopped = true;

    for (const track of localStream?.getTracks() ?? []) {
      track.stop();
    }

    dataChannel?.close();
    peerConnection?.close();

    if (audioElement) {
      audioElement.srcObject = null;
      audioElement.remove();
    }
  };

  try {
    const mediaStreamPromise = getUserMedia({ audio: true });
    if (signal) {
      void mediaStreamPromise
        .then((stream) => {
          if (signal.aborted && stream !== localStream) {
            for (const track of stream.getTracks()) {
              track.stop();
            }
          }
        })
        .catch(() => undefined);
    }

    localStream = await abortable(mediaStreamPromise, signal);
    throwIfAborted(signal);
    onLocalStream?.(localStream);

    peerConnection = createPeerConnection();
    audioElement = createAudioElement();
    const remoteAudioElement = audioElement;
    dataChannel = peerConnection.createDataChannel('oai-events');

    dataChannel.addEventListener('message', (event: MessageEvent) => {
      const delta = parseTranscriptDelta(event.data);
      if (delta) {
        onTranscriptDelta?.(delta);
      }
    });

    peerConnection.ontrack = (event) => {
      const [streamFromEvent] = event.streams;
      const remoteStream = streamFromEvent ?? new MediaStream([event.track]);
      remoteAudioElement.srcObject = remoteStream;
      onRemoteAudio?.();
    };

    for (const track of localStream.getTracks()) {
      peerConnection.addTrack(track, localStream);
    }

    const offer = await abortable(peerConnection.createOffer(), signal);
    if (!offer.sdp) {
      throw new RealtimeTranslationSessionError('WebRTC offer did not contain SDP.');
    }

    await abortable(peerConnection.setLocalDescription(offer), signal);

    const response = await abortable(fetchImpl(token.translationCallUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.clientSecret}`,
        'Content-Type': 'application/sdp'
      },
      body: offer.sdp,
      ...(signal ? { signal } : {})
    }), signal);

    if (!response.ok) {
      throw new RealtimeTranslationSessionError('OpenAI rejected the WebRTC session offer.');
    }

    const answerSdp = await response.text();
    await abortable(peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp
    }), signal);

    return { stop: cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
};
