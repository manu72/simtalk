import {
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';

import type { RealtimeTokenRequest, RoomTokenRequest } from '@simtalk/shared-types';

import {
  createRealtimeTranslationSession,
  type RealtimeTranslationSession,
  type TranscriptDelta
} from './realtimeTranslationSession';
import { requestRealtimeToken } from './realtimeTokenClient';
import { requestRoomToken } from './roomTokenClient';

export type RemoteRoomSession = {
  readonly room: Room;
  readonly participantIdentity: string;
  readonly setOriginalAudioMuted: (muted: boolean) => void;
  readonly stop: () => void;
};

type CreateRemoteRoomSessionOptions = {
  readonly roomId: string;
  readonly roomTokenRequest: RoomTokenRequest;
  readonly realtimeTokenRequest: RealtimeTokenRequest;
  readonly createRoom?: () => Room;
  readonly onParticipantCountChange?: (count: number) => void;
  readonly onTranscriptDelta?: (delta: TranscriptDelta) => void;
  readonly onRemoteAudioActive?: () => void;
  readonly onTranslationError?: (message: string) => void;
};

const remoteParticipantsCount = (room: Room): number => room.remoteParticipants.size;

export const createLiveKitRemoteRoomSession = async ({
  roomId,
  roomTokenRequest,
  realtimeTokenRequest,
  createRoom = () => new Room({ adaptiveStream: true, dynacast: true }),
  onParticipantCountChange,
  onTranscriptDelta,
  onRemoteAudioActive,
  onTranslationError
}: CreateRemoteRoomSessionOptions): Promise<RemoteRoomSession> => {
  const roomToken = await requestRoomToken(roomId, roomTokenRequest);
  const room = createRoom();
  let originalAudioMuted = true;
  let originalAudioElement: HTMLMediaElement | null = null;
  let originalAudioTrack: RemoteAudioTrack | null = null;
  let translationSession: RealtimeTranslationSession | null = null;
  let stopped = false;

  const stopTranslation = () => {
    try {
      translationSession?.stop();
    } catch {
      // best effort
    }
    translationSession = null;
  };

  const updateParticipantCount = () => {
    onParticipantCountChange?.(remoteParticipantsCount(room));
  };

  const setOriginalAudioMuted = (muted: boolean) => {
    originalAudioMuted = muted;
    originalAudioTrack?.setVolume(muted ? 0 : 1);
    if (originalAudioElement) {
      originalAudioElement.muted = muted;
      originalAudioElement.volume = muted ? 0 : 1;
    }
  };

  const handleRemoteTrack = async (
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    _participant: RemoteParticipant
  ) => {
    if (stopped || track.kind !== Track.Kind.Audio || track.source !== Track.Source.Microphone) {
      return;
    }

    stopTranslation();

    if (track instanceof RemoteAudioTrack) {
      originalAudioTrack?.detach().forEach((element) => element.remove());
      originalAudioTrack = track;
      originalAudioElement = track.attach();
      originalAudioElement.hidden = true;
      originalAudioElement.setAttribute('playsinline', '');
      document.body.append(originalAudioElement);
      setOriginalAudioMuted(originalAudioMuted);
    }

    const realtimeToken = await requestRealtimeToken(realtimeTokenRequest);
    if (stopped) {
      return;
    }

    const remoteStream = new MediaStream([track.mediaStreamTrack]);
    translationSession = await createRealtimeTranslationSession({
      token: realtimeToken,
      inputStream: remoteStream,
      stopInputStreamOnStop: false,
      onTranscriptDelta,
      onRemoteAudio: onRemoteAudioActive
    });
  };

  const handleRemoteTrackError = (error: unknown) => {
    stopTranslation();
    const message =
      error instanceof Error
        ? error.message
        : 'Remote audio translation could not be started.';
    onTranslationError?.(message);
  };

  room
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      void handleRemoteTrack(track, publication, participant).catch(handleRemoteTrackError);
    })
    .on(RoomEvent.TrackUnsubscribed, () => {
      stopTranslation();
    })
    .on(RoomEvent.ParticipantConnected, updateParticipantCount)
    .on(RoomEvent.ParticipantDisconnected, updateParticipantCount);

  await room.connect(roomToken.liveKitUrl, roomToken.participantToken);
  await room.localParticipant.setMicrophoneEnabled(true);
  updateParticipantCount();

  return {
    room,
    participantIdentity: roomToken.participantIdentity,
    setOriginalAudioMuted,
    stop: () => {
      stopped = true;
      stopTranslation();
      originalAudioTrack?.detach().forEach((element) => element.remove());
      room.disconnect();
    }
  };
};
