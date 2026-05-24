import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ConversationMode, RealtimeTokenRequest, RealtimeTokenResponse } from '@simtalk/shared-types';

import { AccessDeniedError, getStoredPassword, setStoredPassword } from './accessGate';
import { AUTO_LANGUAGE, findLanguage, LANGUAGES, isAutoLanguage, type Language } from './components/brand/languages';
import { AccessGateModal } from './components/screens/AccessGateModal';
import { Lobby } from './components/screens/Lobby';
import { ListenerSurface } from './components/screens/ListenerSurface';
import { TurnaboutSurface, type ConversationTurn } from './components/screens/TurnaboutSurface';
import { PracticeSurface, type PracticeStage } from './components/screens/PracticeSurface';
import { RemoteRoomSurface, type RemoteRoomStatus } from './components/screens/RemoteRoomSurface';
import { Summary } from './components/screens/Summary';
import { TranscriptSheet } from './components/screens/TranscriptSheet';
import { SessionHeader } from './components/session/SessionHeader';
import { DevDrawer } from './components/session/DevDrawer';
import {
  createLiveKitRemoteRoomSession,
  type RemoteRoomSession
} from './liveKitRemoteRoomSession';
import { RealtimeTokenClientError, requestRealtimeToken } from './realtimeTokenClient';
import {
  createRealtimeTranslationSession,
  RealtimeTranslationSessionError,
  type RealtimeTranslationSession,
  type TranscriptDelta
} from './realtimeTranslationSession';
import { requestRoomCreate, RoomTokenClientError } from './roomTokenClient';

type View = 'lobby' | 'session' | 'summary';

type SessionStatus = 'idle' | 'launching' | 'connecting' | 'live' | 'paused' | 'error';

const getRecordingExtension = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim();
  if (normalized === 'audio/mp4') return '.mp4';
  if (normalized === 'audio/m4a') return '.m4a';
  if (normalized === 'audio/ogg') return '.ogg';
  return '.webm';
};

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/g)
    .map((line) => line.trim())
    .filter(Boolean);

const isDevModeFromUrl = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev');

const roomIdFromPathname = (): string | null => {
  if (typeof window === 'undefined') return null;
  const match = /^\/rooms\/([^/?#]+)$/.exec(window.location.pathname);
  if (!match) return null;
  const encodedRoomId = match[1];
  if (!encodedRoomId) return null;
  try {
    return decodeURIComponent(encodedRoomId);
  } catch {
    return null;
  }
};

const participantIdentityMinSuffixLength = 16;

const createBrowserParticipantIdentity = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `participant_${crypto.randomUUID().replaceAll('-', '')}`;
  }

  const suffix = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `participant_${suffix.padEnd(participantIdentityMinSuffixLength, '0')}`;
};

const participantIdentityStorageKey = (roomId: string): string =>
  `simtalk.room.${roomId}.participantIdentity`;

const getParticipantIdentityForRoom = (roomId: string): string => {
  const key = participantIdentityStorageKey(roomId);
  const stored = window.sessionStorage.getItem(key);
  if (stored) return stored;

  return createBrowserParticipantIdentity();
};

export const App = () => {
  // Lobby state
  const [mode, setMode] = useState<ConversationMode>('listener');
  const [source, setSource] = useState<Language>(AUTO_LANGUAGE);
  const [target, setTarget] = useState<Language>(findLanguage('es'));

  // Remote room state stays browser-local. sessionStorage is used only for reload identity continuity.
  const [remoteRoomId, setRemoteRoomId] = useState<string | null>(() => roomIdFromPathname());
  const [remoteSource, setRemoteSource] = useState<Language>(AUTO_LANGUAGE);
  const [remoteTarget, setRemoteTarget] = useState<Language>(findLanguage('es'));
  const [remoteStatus, setRemoteStatus] = useState<RemoteRoomStatus>('idle');
  const [remoteErrorMessage, setRemoteErrorMessage] = useState<string | null>(null);
  const [remoteTranslatedCaption, setRemoteTranslatedCaption] = useState('');
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0);
  const [remoteOriginalAudioMuted, setRemoteOriginalAudioMuted] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // App flow
  const [view, setView] = useState<View>('lobby');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<RealtimeTokenResponse | null>(null);

  // Transcripts (raw streaming buffers)
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const inputTranscriptRef = useRef('');
  const outputTranscriptRef = useRef('');
  const [deltaLog, setDeltaLog] = useState<string[]>([]);

  // Turn-about
  const [activeSide, setActiveSide] = useState<'source' | 'target'>('source');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [holdingMic, setHoldingMic] = useState(false);
  const turnBuilderRef = useRef<{ src: string; dst: string; side: 'source' | 'target' } | null>(null);
  const holdingMicRef = useRef(false);
  const inputBaselineRef = useRef(0);
  const [liveBaseInputLen, setLiveBaseInputLen] = useState(0);
  const [liveBaseOutputLen, setLiveBaseOutputLen] = useState(0);
  const pendingTurnIdRef = useRef<string | null>(null);
  const pendingBaseOutputLenRef = useRef(0);

  // Practice
  const [practiceStage, setPracticeStage] = useState<PracticeStage>('idle');
  const [practiceAttempt, setPracticeAttempt] = useState('');
  const [practiceAudioUrl, setPracticeAudioUrl] = useState<string | null>(null);
  const practiceAudioUrlRef = useRef<string | null>(null);

  // Listener
  const [listenerHistory, setListenerHistory] = useState<string[]>([]);
  const lastOutputLenRef = useRef(0);
  const [transcriptSheetOpen, setTranscriptSheetOpen] = useState(false);

  // Recording
  const [recordingMimeType, setRecordingMimeType] = useState<string>('audio/webm');
  const [recordingBlobUrl, setRecordingBlobUrl] = useState<string | null>(null);
  const recordingBlobUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingNameRef = useRef<string>('simtalk-recording.webm');

  // Dev drawer
  const [devOpen, setDevOpen] = useState(false);

  // Access gate
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const pendingAccessActionRef = useRef<(() => void) | null>(null);

  // Refs to session lifecycle
  const sessionRef = useRef<RealtimeTranslationSession | null>(null);
  const remoteSessionRef = useRef<RemoteRoomSession | null>(null);
  const joinGenerationRef = useRef(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const launchIdRef = useRef(0);

  const revokeRecordingUrl = useCallback(() => {
    if (recordingBlobUrlRef.current) {
      URL.revokeObjectURL(recordingBlobUrlRef.current);
      recordingBlobUrlRef.current = null;
    }
  }, []);

  const revokePracticeAudio = useCallback(() => {
    if (practiceAudioUrlRef.current) {
      URL.revokeObjectURL(practiceAudioUrlRef.current);
      practiceAudioUrlRef.current = null;
    }
  }, []);

  const teardownSession = useCallback(() => {
    launchIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      sessionRef.current?.stop();
    } catch {
      // best effort
    }
    sessionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // best effort
      }
    }
    recorderRef.current = null;
    localStreamRef.current = null;
    const pendingId = pendingTurnIdRef.current;
    if (pendingId) {
      setTurns((prev) => prev.map((t) => (t.id === pendingId ? { ...t, status: 'done' } : t)));
      pendingTurnIdRef.current = null;
    }
  }, []);

  const teardownRemoteRoom = useCallback(() => {
    joinGenerationRef.current += 1;
    try {
      remoteSessionRef.current?.stop();
    } catch {
      // best effort
    }
    remoteSessionRef.current = null;
    setRemoteParticipantCount(0);
    setRemoteTranslatedCaption('');
  }, []);

  useEffect(() => {
    if (isDevModeFromUrl()) setDevOpen(true);
    const handler = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === 'd' || event.key === 'D')) {
        event.preventDefault();
        setDevOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(
    () => () => {
      teardownSession();
      teardownRemoteRoom();
      revokeRecordingUrl();
      revokePracticeAudio();
    },
    [teardownSession, teardownRemoteRoom, revokeRecordingUrl, revokePracticeAudio]
  );

  useEffect(() => {
    const onPopState = () => {
      setRemoteRoomId(roomIdFromPathname());
      teardownRemoteRoom();
      setRemoteStatus('idle');
      setRemoteErrorMessage(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [teardownRemoteRoom]);

  const resetTranscriptBuffers = useCallback(() => {
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    setInputTranscript('');
    setOutputTranscript('');
    setDeltaLog([]);
    setListenerHistory([]);
    lastOutputLenRef.current = 0;
    setTurns([]);
    turnBuilderRef.current = null;
    setPracticeStage('idle');
    setPracticeAttempt('');
    revokePracticeAudio();
    setPracticeAudioUrl(null);
  }, [revokePracticeAudio]);

  const startMediaRecorder = useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') return;
    try {
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current = [...recordingChunksRef.current, event.data];
        }
      };
      recorder.onstop = () => {
        if (recordingChunksRef.current.length === 0) return;
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        revokeRecordingUrl();
        recordingBlobUrlRef.current = url;
        setRecordingBlobUrl(url);
        setRecordingMimeType(mimeType);
        recordingNameRef.current = `simtalk-audio-${new Date().toISOString()}${getRecordingExtension(mimeType)}`;
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, [revokeRecordingUrl]);

  const handleTranscriptDelta = useCallback(
    (delta: TranscriptDelta) => {
      setDeltaLog((prev) => {
        const next = [...prev, `[${delta.kind}] ${delta.text}`];
        return next.slice(-50);
      });
      if (delta.kind === 'input') {
        const next = inputTranscriptRef.current + delta.text;
        inputTranscriptRef.current = next;
        setInputTranscript(next);
      } else {
        const next = outputTranscriptRef.current + delta.text;
        outputTranscriptRef.current = next;
        setOutputTranscript(next);
      }
    },
    []
  );

  useEffect(() => {
    if (mode !== 'listener') return;
    const sentences = splitSentences(outputTranscript);
    if (sentences.length === 0) return;
    setListenerHistory(sentences);
  }, [outputTranscript, mode]);

  const startSessionWithRequest = useCallback(
    async (
      request: RealtimeTokenRequest,
      opts: { startSessionRecorder: boolean; startLocalAudioEnabled?: boolean }
    ): Promise<'ok' | 'superseded'> => {
      const launchId = launchIdRef.current + 1;
      launchIdRef.current = launchId;
      const isCurrentLaunch = () => launchIdRef.current === launchId;
      setStatus('connecting');

      let tokenResponse: RealtimeTokenResponse;
      try {
        tokenResponse = await requestRealtimeToken(request);
      } catch (error) {
        if (!isCurrentLaunch()) return 'superseded';
        throw error;
      }
      if (!isCurrentLaunch()) return 'superseded';
      setToken(tokenResponse);

      const abort = new AbortController();
      abortRef.current = abort;

      let session: RealtimeTranslationSession;
      try {
        session = await createRealtimeTranslationSession({
          token: tokenResponse,
          signal: abort.signal,
          startLocalAudioEnabled: opts.startLocalAudioEnabled,
          onLocalStream: (stream) => {
            if (!isCurrentLaunch()) return;
            localStreamRef.current = stream;
            if (opts.startSessionRecorder) startMediaRecorder(stream);
          },
          onTranscriptDelta: (delta) => {
            if (isCurrentLaunch()) handleTranscriptDelta(delta);
          },
          onRemoteAudio: () => {
            if (isCurrentLaunch()) setStatus('live');
          }
        });
      } catch (error) {
        if (!isCurrentLaunch()) return 'superseded';
        throw error;
      }
      if (!isCurrentLaunch()) {
        session.stop();
        return 'superseded';
      }
      sessionRef.current = session;
      setStatus('live');
      return 'ok';
    },
    [handleTranscriptDelta, startMediaRecorder]
  );

  const errorMessageFor = useCallback((error: unknown, fallback: string): string => {
    if (error instanceof RealtimeTokenClientError) return error.message;
    if (error instanceof RoomTokenClientError) return error.message;
    if (error instanceof RealtimeTranslationSessionError) return error.message;
    return fallback;
  }, []);

  const requireAccess = useCallback((action: () => void) => {
    if (getStoredPassword()) {
      action();
      return;
    }
    pendingAccessActionRef.current = action;
    setAccessError(null);
    setAccessModalOpen(true);
  }, []);

  const reopenAccessModal = useCallback((action: () => void) => {
    pendingAccessActionRef.current = action;
    setAccessError('Incorrect password. Try again.');
    setAccessModalOpen(true);
  }, []);

  const handleAccessSubmit = useCallback((password: string) => {
    setStoredPassword(password);
    setAccessModalOpen(false);
    setAccessError(null);
    const action = pendingAccessActionRef.current;
    pendingAccessActionRef.current = null;
    action?.();
  }, []);

  const handleAccessClose = useCallback(() => {
    setAccessModalOpen(false);
    setAccessError(null);
    pendingAccessActionRef.current = null;
  }, []);

  const createRemoteRoom = useCallback(async () => {
    if (isCreatingRoom) return;
    setIsCreatingRoom(true);
    setErrorMessage(null);
    try {
      const room = await requestRoomCreate();
      window.history.pushState({}, '', room.roomUrlPath);
      setRemoteRoomId(room.roomId);
      setRemoteStatus('idle');
      setRemoteErrorMessage(null);
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        reopenAccessModal(() => void createRemoteRoom());
        return;
      }
      setErrorMessage(errorMessageFor(error, 'Could not create a remote room. Please try again.'));
    } finally {
      setIsCreatingRoom(false);
    }
  }, [errorMessageFor, isCreatingRoom, reopenAccessModal]);

  const joinRemoteRoom = useCallback(async () => {
    if (!remoteRoomId || remoteStatus === 'joining') return;
    teardownRemoteRoom();
    const joinGeneration = joinGenerationRef.current + 1;
    joinGenerationRef.current = joinGeneration;
    setRemoteStatus('joining');
    setRemoteErrorMessage(null);

    try {
      const isCurrentJoin = () => joinGenerationRef.current === joinGeneration;
      const participantIdentity = getParticipantIdentityForRoom(remoteRoomId);
      const hintedSourceLanguage = isAutoLanguage(remoteSource) ? undefined : remoteSource.bcp47;
      const session = await createLiveKitRemoteRoomSession({
        roomId: remoteRoomId,
        roomTokenRequest: {
          participantIdentity,
          sourceLanguage: hintedSourceLanguage,
          targetLanguage: remoteTarget.bcp47
        },
        realtimeTokenRequest: {
          mode: 'listener',
          sourceLanguage: hintedSourceLanguage,
          targetLanguage: remoteTarget.bcp47
        },
        onParticipantCountChange: (count) => {
          if (isCurrentJoin()) setRemoteParticipantCount(count);
        },
        onTranscriptDelta: (delta) => {
          if (isCurrentJoin() && delta.kind === 'output') {
            setRemoteTranslatedCaption((prev) => `${prev}${delta.text}`.slice(-1000));
          }
        },
        onRemoteAudioActive: () => {
          if (isCurrentJoin()) setRemoteStatus('live');
        },
        onTranslationError: (message) => {
          if (!isCurrentJoin()) return;
          setRemoteStatus('error');
          setRemoteErrorMessage(message);
        }
      });
      if (!isCurrentJoin()) {
        try {
          session.stop();
        } catch {
          // best effort
        }
        return;
      }
      remoteSessionRef.current = session;
      window.sessionStorage.setItem(
        participantIdentityStorageKey(remoteRoomId),
        session.participantIdentity
      );
      session.setOriginalAudioMuted(remoteOriginalAudioMuted);
      setRemoteStatus('live');
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        if (joinGenerationRef.current === joinGeneration) {
          setRemoteStatus('idle');
        }
        reopenAccessModal(() => void joinRemoteRoom());
        return;
      }
      if (joinGenerationRef.current !== joinGeneration) return;
      teardownRemoteRoom();
      setRemoteStatus('error');
      setRemoteErrorMessage(errorMessageFor(error, 'Could not join the remote room. Please try again.'));
    }
  }, [
    remoteRoomId,
    remoteSource,
    remoteTarget,
    remoteOriginalAudioMuted,
    remoteStatus,
    errorMessageFor,
    teardownRemoteRoom,
    reopenAccessModal
  ]);

  const leaveRemoteRoom = useCallback(() => {
    teardownRemoteRoom();
    setRemoteStatus('idle');
    setRemoteErrorMessage(null);
    window.history.pushState({}, '', '/');
    setRemoteRoomId(null);
  }, [teardownRemoteRoom]);

  const toggleOriginalAudio = useCallback(() => {
    setRemoteOriginalAudioMuted((prev) => {
      const next = !prev;
      remoteSessionRef.current?.setOriginalAudioMuted(next);
      return next;
    });
  }, []);

  const copyRemoteRoomLink = useCallback(() => {
    if (!remoteRoomId) return;
    void navigator.clipboard?.writeText(new URL(`/rooms/${remoteRoomId}`, window.location.origin).toString());
  }, [remoteRoomId]);

  const launch = useCallback(async () => {
    if (status === 'launching' || status === 'connecting') return;
    setErrorMessage(null);
    teardownSession();
    resetTranscriptBuffers();
    revokeRecordingUrl();
    setRecordingBlobUrl(null);
    setActiveSide('source');
    setStatus('launching');
    setView('session');

    try {
      const result = await startSessionWithRequest(
        {
          mode,
          sourceLanguage: isAutoLanguage(source) ? undefined : source.bcp47,
          targetLanguage: target.bcp47
        },
        { startSessionRecorder: mode === 'listener', startLocalAudioEnabled: mode !== 'practice' }
      );
      if (result === 'superseded') return;
      if (mode === 'practice') setPracticeStage('idle');
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        setStatus('idle');
        setView('lobby');
        reopenAccessModal(() => void launch());
        return;
      }
      teardownSession();
      setErrorMessage(errorMessageFor(error, 'Could not launch translation. Please try again.'));
      setStatus('error');
      setView('lobby');
    }
  }, [
    mode,
    source,
    target,
    status,
    teardownSession,
    resetTranscriptBuffers,
    revokeRecordingUrl,
    errorMessageFor,
    startSessionWithRequest,
    reopenAccessModal
  ]);

  const endSession = useCallback(() => {
    teardownSession();
    setStatus('idle');
    setView('summary');
  }, [teardownSession]);

  const newSession = useCallback(() => {
    teardownSession();
    resetTranscriptBuffers();
    revokeRecordingUrl();
    setRecordingBlobUrl(null);
    setToken(null);
    setStatus('idle');
    setErrorMessage(null);
    setView('lobby');
  }, [teardownSession, resetTranscriptBuffers, revokeRecordingUrl]);

  const pauseListener = useCallback(() => {
    teardownSession();
    setStatus('paused');
    setView('summary');
  }, [teardownSession]);

  const swapLanguages = useCallback(() => {
    setSource(target);
    setTarget(source);
  }, [source, target]);

  const flipTurnaboutSides = useCallback(async () => {
    if (mode !== 'turnabout') return;
    if (holdingMicRef.current) return;
    if (status === 'launching' || status === 'connecting') return;

    const previousSide = activeSide;
    const nextSide: 'source' | 'target' = previousSide === 'source' ? 'target' : 'source';
    const speaker = nextSide === 'source' ? source : target;
    const listener = nextSide === 'source' ? target : source;

    const pendingId = pendingTurnIdRef.current;
    if (pendingId) {
      setTurns((prev) => prev.map((t) => (t.id === pendingId ? { ...t, status: 'done' } : t)));
      pendingTurnIdRef.current = null;
    }

    abortRef.current?.abort();
    abortRef.current = null;
    try {
      sessionRef.current?.stop();
    } catch {
      // best effort
    }
    sessionRef.current = null;
    localStreamRef.current = null;

    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    setInputTranscript('');
    setOutputTranscript('');
    setLiveBaseInputLen(0);
    setLiveBaseOutputLen(0);
    lastOutputLenRef.current = 0;
    inputBaselineRef.current = 0;

    setActiveSide(nextSide);
    setErrorMessage(null);

    try {
      const result = await startSessionWithRequest(
        {
          mode: 'turnabout',
          sourceLanguage: speaker.bcp47,
          targetLanguage: listener.bcp47
        },
        { startSessionRecorder: false, startLocalAudioEnabled: true }
      );
      if (result === 'superseded') return;
    } catch (error) {
      setActiveSide(previousSide);
      teardownSession();
      setErrorMessage(errorMessageFor(error, 'Could not switch sides. Try again.'));
      setStatus('error');
    }
  }, [activeSide, mode, source, target, status, startSessionWithRequest, teardownSession, errorMessageFor]);

  const onMicDown = useCallback(() => {
    if (holdingMicRef.current) return;
    holdingMicRef.current = true;
    setHoldingMic(true);
    turnBuilderRef.current = {
      src: '',
      dst: '',
      side: activeSide
    };
    const priorPendingId = pendingTurnIdRef.current;
    if (priorPendingId) {
      setTurns((prev) => prev.map((t) => (t.id === priorPendingId ? { ...t, status: 'done' } : t)));
      pendingTurnIdRef.current = null;
    }
    lastOutputLenRef.current = outputTranscriptRef.current.length;
    inputBaselineRef.current = inputTranscriptRef.current.length;
    setLiveBaseInputLen(inputTranscriptRef.current.length);
    setLiveBaseOutputLen(outputTranscriptRef.current.length);
  }, [activeSide]);

  const onMicUp = useCallback(() => {
    if (!holdingMicRef.current) return;
    holdingMicRef.current = false;
    setHoldingMic(false);
    const builder = turnBuilderRef.current;
    turnBuilderRef.current = null;
    if (!builder) return;
    const newDst = outputTranscriptRef.current.slice(lastOutputLenRef.current).trim();
    const newSrc = inputTranscriptRef.current.slice(inputBaselineRef.current).trim();
    if (!newSrc && !newDst) return;
    const speakerSide = builder.side;
    const srcLang = speakerSide === 'source' ? source : target;
    const dstLang = speakerSide === 'source' ? target : source;
    const turnId = `turn_${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        side: speakerSide,
        srcLang,
        dstLang,
        src: newSrc,
        dst: newDst,
        status: 'translating'
      }
    ]);
    pendingTurnIdRef.current = turnId;
    pendingBaseOutputLenRef.current = lastOutputLenRef.current;
  }, [source, target]);

  useEffect(() => {
    const id = pendingTurnIdRef.current;
    if (!id) return;
    const newDst = outputTranscript.slice(pendingBaseOutputLenRef.current).trim();
    if (!newDst) return;
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, dst: newDst } : t)));
  }, [outputTranscript]);

  const startPracticeRecording = useCallback(() => {
    const existing = recorderRef.current;
    if (existing && existing.state !== 'inactive') {
      existing.onstop = null;
      existing.ondataavailable = null;
      try {
        existing.stop();
      } catch {
        // best effort
      }
    }
    recorderRef.current = null;
    const localStream = localStreamRef.current;
    if (!localStream) {
      sessionRef.current?.setLocalAudioEnabled(false);
      return;
    }
    try {
      const recorder = new MediaRecorder(localStream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (recorderRef.current !== recorder) return;
        recorderRef.current = null;
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        practiceAudioUrlRef.current = url;
        setPracticeAudioUrl(url);
      };
      sessionRef.current?.setLocalAudioEnabled(true);
      recorder.start();
      recorderRef.current = recorder;
      revokePracticeAudio();
      setPracticeAudioUrl(null);
      inputTranscriptRef.current = '';
      outputTranscriptRef.current = '';
      setInputTranscript('');
      setOutputTranscript('');
      setPracticeAttempt('');
      setPracticeStage('recording');
    } catch {
      recorderRef.current = null;
      sessionRef.current?.setLocalAudioEnabled(false);
    }
  }, [revokePracticeAudio]);

  const stopPracticeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        recorderRef.current = null;
        // best effort
      }
    } else {
      recorderRef.current = null;
    }
    sessionRef.current?.setLocalAudioEnabled(false);
    setPracticeStage('reviewing');
  }, []);

  const submitPracticeAttempt = useCallback(() => {
    setPracticeStage('attempting');
  }, []);

  const revealPractice = useCallback(() => {
    setPracticeStage('revealed');
  }, []);

  const tryPracticeAgain = useCallback(() => {
    revokePracticeAudio();
    setPracticeAudioUrl(null);
    setPracticeAttempt('');
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    setInputTranscript('');
    setOutputTranscript('');
    sessionRef.current?.setLocalAudioEnabled(false);
    setPracticeStage('idle');
  }, [revokePracticeAudio]);

  const nextPracticePhrase = useCallback(() => {
    tryPracticeAgain();
  }, [tryPracticeAgain]);

  const buildTranscriptText = useCallback((): string => {
    if (mode === 'turnabout' && turns.length > 0) {
      const lines = [
        'SimTalk transcript',
        'Mode: turnabout',
        `Languages: ${source.name} ↔ ${target.name}`,
        ''
      ];
      turns.forEach((turn, i) => {
        lines.push(`[Turn ${i + 1}] ${turn.srcLang.code} → ${turn.dstLang.code}`);
        if (turn.src) lines.push(turn.src);
        if (turn.dst) lines.push(`→ ${turn.dst}`);
        lines.push('');
      });
      return lines.join('\n').trimEnd();
    }
    const sourceLabel = isAutoLanguage(source) ? 'Auto-detected' : source.name;
    return [
      'SimTalk transcript',
      `Mode: ${mode}`,
      `Source: ${sourceLabel}`,
      `Target: ${target.name}`,
      '',
      'Source transcript:',
      inputTranscript || '(none)',
      '',
      'Translated transcript:',
      outputTranscript || '(none)'
    ].join('\n');
  }, [mode, turns, source, target, inputTranscript, outputTranscript]);

  const copyTranscript = useCallback(() => {
    void navigator.clipboard?.writeText(buildTranscriptText());
  }, [buildTranscriptText]);

  const downloadTranscript = useCallback(() => {
    const blob = new Blob([buildTranscriptText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simtalk-transcript-${new Date().toISOString()}.txt`;
    document.body.append(a);
    try {
      a.click();
    } finally {
      a.remove();
      URL.revokeObjectURL(url);
    }
  }, [buildTranscriptText]);

  const headerStatus: 'connecting' | 'live' | 'paused' | 'idle' = useMemo(() => {
    if (status === 'launching' || status === 'connecting') return 'connecting';
    if (status === 'live') return 'live';
    if (status === 'paused') return 'paused';
    return 'idle';
  }, [status]);

  // Suppress noise: prevent same source/target conflicting per Zod refinement
  useEffect(() => {
    if (isAutoLanguage(source)) return;
    if (source.bcp47 === target.bcp47) {
      const other = LANGUAGES.find((lang) => lang.bcp47 !== source.bcp47);
      if (other) setTarget(other);
    }
  }, [source, target]);

  useEffect(() => {
    if (isAutoLanguage(remoteSource)) return;
    if (remoteSource.bcp47 === remoteTarget.bcp47) {
      const other = LANGUAGES.find((lang) => lang.bcp47 !== remoteSource.bcp47);
      if (other) setRemoteTarget(other);
    }
  }, [remoteSource, remoteTarget]);

  if (remoteRoomId) {
    const roomUrl = new URL(`/rooms/${remoteRoomId}`, window.location.origin).toString();

    return (
      <>
        <RemoteRoomSurface
          roomId={remoteRoomId}
          roomUrl={roomUrl}
          source={remoteSource}
          target={remoteTarget}
          status={remoteStatus}
          participantCount={remoteParticipantCount}
          translatedCaption={remoteTranslatedCaption}
          originalAudioMuted={remoteOriginalAudioMuted}
          errorMessage={remoteErrorMessage}
          onChangeSource={setRemoteSource}
          onChangeTarget={setRemoteTarget}
          onJoin={() => requireAccess(() => void joinRemoteRoom())}
          onLeave={leaveRemoteRoom}
          onToggleOriginalAudio={toggleOriginalAudio}
          onCopyLink={copyRemoteRoomLink}
        />
        <AccessGateModal
          open={accessModalOpen}
          errorMessage={accessError}
          onSubmit={handleAccessSubmit}
          onClose={handleAccessClose}
        />
      </>
    );
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        color: '#FFFFFF'
      }}
    >
      {view === 'lobby' ? (
        <Lobby
          mode={mode}
          source={source}
          target={target}
          isLaunching={status === 'launching' || status === 'connecting'}
          isCreatingRoom={isCreatingRoom}
          errorMessage={errorMessage}
          onChangeMode={(next) => {
            if (next !== 'listener' && isAutoLanguage(source)) {
              const fallback = findLanguage('en');
              setSource(fallback.bcp47 === target.bcp47 ? findLanguage('es') : fallback);
            }
            setMode(next);
            setErrorMessage(null);
          }}
          onChangeSource={setSource}
          onChangeTarget={setTarget}
          onSwap={swapLanguages}
          onLaunch={() => requireAccess(() => void launch())}
          onCreateRoom={() => requireAccess(() => void createRemoteRoom())}
        />
      ) : null}

      {view === 'session' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <SessionHeader
            mode={mode}
            source={mode === 'listener' && isAutoLanguage(source) ? null : source}
            target={target}
            activeSide={mode === 'turnabout' ? activeSide : undefined}
            status={headerStatus}
            onExit={endSession}
            onToggleDev={() => setDevOpen((prev) => !prev)}
          />
          {mode === 'listener' ? (
            <ListenerSurface
              target={target}
              liveText={outputTranscript}
              history={listenerHistory}
              isStreaming={outputTranscript.length > 0 && status === 'live'}
              onPause={pauseListener}
              onOpenTranscript={() => setTranscriptSheetOpen(true)}
            />
          ) : null}
          {mode === 'turnabout' ? (
            <TurnaboutSurface
              source={source}
              target={target}
              activeSide={activeSide}
              turns={turns}
              recording={holdingMic}
              liveSrc={holdingMic ? inputTranscript.slice(liveBaseInputLen) : ''}
              liveDst={holdingMic ? outputTranscript.slice(liveBaseOutputLen) : ''}
              busy={status === 'connecting' || status === 'launching'}
              onFlip={() => {
                void flipTurnaboutSides();
              }}
              onMicDown={onMicDown}
              onMicUp={onMicUp}
            />
          ) : null}
          {mode === 'practice' ? (
            <PracticeSurface
              source={source}
              target={target}
              stage={practiceStage}
              heardText={inputTranscript}
              modelTranslation={outputTranscript}
              attempt={practiceAttempt}
              audioUrl={practiceAudioUrl}
              onStartRecording={startPracticeRecording}
              onStopRecording={stopPracticeRecording}
              onAttemptChange={setPracticeAttempt}
              onSubmitAttempt={submitPracticeAttempt}
              onReveal={revealPractice}
              onTryAgain={tryPracticeAgain}
              onNextPhrase={nextPracticePhrase}
            />
          ) : null}
        </div>
      ) : null}

      {view === 'summary' ? (
        <Summary
          mode={mode}
          source={mode === 'listener' && isAutoLanguage(source) ? null : source}
          target={target}
          inputTranscript={inputTranscript}
          outputTranscript={outputTranscript}
          turns={turns}
          audioUrl={recordingBlobUrl}
          audioFilename={recordingNameRef.current}
          onCopy={copyTranscript}
          onDownloadTranscript={downloadTranscript}
          onNewSession={newSession}
        />
      ) : null}

      <AccessGateModal
        open={accessModalOpen}
        errorMessage={accessError}
        onSubmit={handleAccessSubmit}
        onClose={handleAccessClose}
      />

      <TranscriptSheet
        open={transcriptSheetOpen}
        title="TRANSLATED TRANSCRIPT"
        entries={listenerHistory}
        onClose={() => setTranscriptSheetOpen(false)}
        onCopyAll={copyTranscript}
      />

      <DevDrawer
        open={devOpen}
        token={token}
        status={status}
        recordingStatus={recordingBlobUrl ? `ready · ${recordingMimeType}` : recorderRef.current ? 'recording' : 'off'}
        recentDeltas={deltaLog}
        onClose={() => setDevOpen(false)}
      />
    </main>
  );
};
