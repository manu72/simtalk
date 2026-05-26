import {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication
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
  readonly setCameraEnabled: (enabled: boolean) => Promise<void>;
  readonly setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  readonly setLocalYouHear: (bcp47: string) => void;
  readonly stop: () => void;
};

export type RemoteParticipantInfo = {
  readonly identity: string;
  readonly displayName: string | null;
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
  readonly onCameraError?: (message: string) => void;
  readonly onMicrophoneError?: (message: string) => void;
  readonly onLocalVideoTrackChange?: (track: LocalVideoTrack | null) => void;
  readonly onLocalMicMuteChange?: (muted: boolean) => void;
  readonly onLocalCameraEnabledChange?: (enabled: boolean) => void;
  readonly onRemoteVideoTrackChange?: (track: RemoteVideoTrack | null) => void;
  readonly onRemoteParticipantChange?: (info: RemoteParticipantInfo | null) => void;
  readonly onRemoteMicMuteChange?: (muted: boolean) => void;
  readonly onRemoteSpeakingChange?: (speaking: boolean) => void;
  readonly onRemoteYouHearChange?: (youHear: string | null) => void;
  readonly initialYouHear?: string;
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
  onTranslationError,
  onCameraError,
  onMicrophoneError,
  onLocalVideoTrackChange,
  onLocalMicMuteChange,
  onLocalCameraEnabledChange,
  onRemoteVideoTrackChange,
  onRemoteParticipantChange,
  onRemoteMicMuteChange,
  onRemoteSpeakingChange,
  onRemoteYouHearChange,
  initialYouHear
}: CreateRemoteRoomSessionOptions): Promise<RemoteRoomSession> => {
  const roomToken = await requestRoomToken(roomId, roomTokenRequest);
  const room = createRoom();
  let originalAudioMuted = true;
  let originalAudioElement: HTMLMediaElement | null = null;
  let originalAudioTrack: RemoteAudioTrack | null = null;
  let translationSession: RealtimeTranslationSession | null = null;
  let stopped = false;
  let lastPublishedYouHear: string | null = initialYouHear ?? null;
  let lastRemoteYouHear: string | null = null;
  // Bumped whenever any caller tears down the active translation session
  // (session.stop, TrackUnsubscribed, a new TrackSubscribed). Lets in-flight
  // handleRemoteTrack invocations detect that their startup has been
  // superseded across an await boundary and clean up the late session.
  let translationStartupGeneration = 0;
  let activeRemoteParticipant: RemoteParticipant | null = null;
  let activeRemoteVideoTrack: RemoteVideoTrack | null = null;

  const emitRemoteYouHear = (value: string | null) => {
    if (value === lastRemoteYouHear) return;
    lastRemoteYouHear = value;
    onRemoteYouHearChange?.(value);
  };

  const describeParticipant = (participant: RemoteParticipant): RemoteParticipantInfo => ({
    identity: participant.identity,
    displayName: participant.name && participant.name.length > 0 ? participant.name : null
  });

  const setRemoteParticipant = (participant: RemoteParticipant | null) => {
    if (activeRemoteParticipant === participant) return;
    activeRemoteParticipant = participant;
    onRemoteParticipantChange?.(participant ? describeParticipant(participant) : null);
    if (!participant) {
      onRemoteMicMuteChange?.(true);
      onRemoteSpeakingChange?.(false);
      emitRemoteYouHear(null);
      return;
    }
    const micPub =
      typeof participant.getTrackPublication === 'function'
        ? participant.getTrackPublication(Track.Source.Microphone)
        : undefined;
    onRemoteMicMuteChange?.(micPub ? micPub.isMuted : true);
    onRemoteSpeakingChange?.(Boolean(participant.isSpeaking));
    const youHear = participant.attributes?.youHear;
    emitRemoteYouHear(typeof youHear === 'string' && youHear.length > 0 ? youHear : null);
  };

  const setRemoteVideoTrack = (track: RemoteVideoTrack | null) => {
    if (activeRemoteVideoTrack === track) return;
    activeRemoteVideoTrack = track;
    onRemoteVideoTrackChange?.(track);
  };

  const stopTranslation = () => {
    translationStartupGeneration += 1;
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

  const detachOriginalAudio = () => {
    try {
      originalAudioTrack?.detach().forEach((element) => element.remove());
    } catch {
      // best effort
    }
    originalAudioTrack = null;
    originalAudioElement = null;
  };

  const handleRemoteTrack = async (
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    if (stopped) return;
    if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
      if (track instanceof RemoteVideoTrack) {
        setRemoteParticipant(participant);
        setRemoteVideoTrack(track);
      }
      return;
    }
    if (track.kind !== Track.Kind.Audio || track.source !== Track.Source.Microphone) {
      return;
    }
    setRemoteParticipant(participant);

    stopTranslation();
    const startupGeneration = translationStartupGeneration;

    if (track instanceof RemoteAudioTrack) {
      detachOriginalAudio();
      originalAudioTrack = track;
      originalAudioElement = track.attach();
      originalAudioElement.hidden = true;
      originalAudioElement.setAttribute('playsinline', '');
      document.body.append(originalAudioElement);
      setOriginalAudioMuted(originalAudioMuted);
    }

    const realtimeToken = await requestRealtimeToken(realtimeTokenRequest);
    if (stopped || startupGeneration !== translationStartupGeneration) {
      return;
    }

    const remoteStream = new MediaStream([track.mediaStreamTrack]);
    const nextTranslationSession = await createRealtimeTranslationSession({
      token: realtimeToken,
      inputStream: remoteStream,
      stopInputStreamOnStop: false,
      onTranscriptDelta,
      onRemoteAudio: onRemoteAudioActive
    });
    if (stopped || startupGeneration !== translationStartupGeneration) {
      try {
        nextTranslationSession.stop();
      } catch {
        // best effort
      }
      return;
    }

    translationSession = nextTranslationSession;
  };

  const handleRemoteTrackError = (error: unknown) => {
    stopTranslation();
    const message =
      error instanceof Error
        ? error.message
        : 'Remote audio translation could not be started.';
    onTranslationError?.(message);
  };

  const stopRoomSession = () => {
    stopped = true;
    stopTranslation();
    detachOriginalAudio();
    room.disconnect();
  };

  const handleLocalTrackPublished = (publication: LocalTrackPublication) => {
    if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
      const track = publication.videoTrack;
      if (track instanceof LocalVideoTrack) {
        onLocalVideoTrackChange?.(track);
        onLocalCameraEnabledChange?.(!publication.isMuted);
      }
    } else if (publication.kind === Track.Kind.Audio && publication.source === Track.Source.Microphone) {
      onLocalMicMuteChange?.(publication.isMuted);
    }
  };

  const handleLocalTrackUnpublished = (publication: LocalTrackPublication) => {
    if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
      onLocalVideoTrackChange?.(null);
      onLocalCameraEnabledChange?.(false);
    }
  };

  const handleTrackMuted = (publication: TrackPublication, participant: Participant) => {
    if (participant === room.localParticipant) {
      if (publication.source === Track.Source.Microphone) onLocalMicMuteChange?.(true);
      if (publication.source === Track.Source.Camera) onLocalCameraEnabledChange?.(false);
      return;
    }
    if (participant === activeRemoteParticipant) {
      if (publication.source === Track.Source.Microphone) onRemoteMicMuteChange?.(true);
    }
  };

  const handleTrackUnmuted = (publication: TrackPublication, participant: Participant) => {
    if (participant === room.localParticipant) {
      if (publication.source === Track.Source.Microphone) onLocalMicMuteChange?.(false);
      if (publication.source === Track.Source.Camera) onLocalCameraEnabledChange?.(true);
      return;
    }
    if (participant === activeRemoteParticipant) {
      if (publication.source === Track.Source.Microphone) onRemoteMicMuteChange?.(false);
    }
  };

  const handleActiveSpeakers = (speakers: Participant[]) => {
    if (!activeRemoteParticipant) return;
    const isActive = speakers.some((p) => p.identity === activeRemoteParticipant!.identity);
    onRemoteSpeakingChange?.(isActive);
  };

  const handleParticipantConnected = (participant: RemoteParticipant) => {
    if (!activeRemoteParticipant) setRemoteParticipant(participant);
    updateParticipantCount();
  };

  const handleParticipantDisconnected = (participant: RemoteParticipant) => {
    if (participant === activeRemoteParticipant) {
      setRemoteVideoTrack(null);
      setRemoteParticipant(null);
    }
    updateParticipantCount();
  };

  room
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      void handleRemoteTrack(track, publication, participant).catch(handleRemoteTrackError);
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track === activeRemoteVideoTrack) {
        setRemoteVideoTrack(null);
        return;
      }
      if (track !== originalAudioTrack) {
        return;
      }
      stopTranslation();
      detachOriginalAudio();
    })
    .on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
    .on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
    .on(RoomEvent.TrackMuted, handleTrackMuted)
    .on(RoomEvent.TrackUnmuted, handleTrackUnmuted)
    .on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers)
    .on(RoomEvent.ParticipantConnected, handleParticipantConnected)
    .on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    .on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      if (participant !== activeRemoteParticipant) return;
      if (!('youHear' in changed)) return;
      const next = changed.youHear;
      emitRemoteYouHear(typeof next === 'string' && next.length > 0 ? next : null);
    });

  try {
    await room.connect(roomToken.liveKitUrl, roomToken.participantToken);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (initialYouHear) {
      try {
        await room.localParticipant.setAttributes({ youHear: initialYouHear });
      } catch {
        // Attribute push is best-effort; don't fail the join.
      }
    }
    onLocalMicMuteChange?.(false);
    const firstRemote = Array.from(room.remoteParticipants.values())[0];
    if (firstRemote) setRemoteParticipant(firstRemote);
    updateParticipantCount();
  } catch (error) {
    try {
      stopRoomSession();
    } catch {
      // Preserve the setup failure that callers need to surface.
    }
    throw error;
  }

  const setCameraEnabled = async (enabled: boolean): Promise<void> => {
    if (stopped) return;
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      onLocalCameraEnabledChange?.(enabled);
      if (!enabled) onLocalVideoTrackChange?.(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : enabled
            ? 'Could not enable camera.'
            : 'Could not disable camera.';
      onCameraError?.(message);
      throw error;
    }
  };

  const setMicrophoneEnabled = async (enabled: boolean): Promise<void> => {
    if (stopped) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      onLocalMicMuteChange?.(!enabled);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : enabled
            ? 'Could not unmute microphone.'
            : 'Could not mute microphone.';
      onMicrophoneError?.(message);
      throw error;
    }
  };

  const setLocalYouHear = (bcp47: string): void => {
    if (stopped) return;
    if (!bcp47) return;
    if (bcp47 === lastPublishedYouHear) return;
    lastPublishedYouHear = bcp47;
    void room.localParticipant.setAttributes({ youHear: bcp47 }).catch(() => {
      // best-effort
    });
  };

  return {
    room,
    participantIdentity: roomToken.participantIdentity,
    setOriginalAudioMuted,
    setCameraEnabled,
    setMicrophoneEnabled,
    setLocalYouHear,
    stop: stopRoomSession
  };
};
