import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ConversationMode, RealtimeTokenResponse } from '@simtalk/shared-types';

import { findLanguage, LANGUAGES, type Language } from './components/brand/languages';
import { Lobby } from './components/screens/Lobby';
import { ListenerSurface } from './components/screens/ListenerSurface';
import { TurnaboutSurface, type ConversationTurn } from './components/screens/TurnaboutSurface';
import { PracticeSurface, type PracticeStage } from './components/screens/PracticeSurface';
import { Summary } from './components/screens/Summary';
import { TranscriptSheet } from './components/screens/TranscriptSheet';
import { SessionHeader } from './components/session/SessionHeader';
import { DevDrawer } from './components/session/DevDrawer';
import { RealtimeTokenClientError, requestRealtimeToken } from './realtimeTokenClient';
import {
  createRealtimeTranslationSession,
  RealtimeTranslationSessionError,
  type RealtimeTranslationSession,
  type TranscriptDelta
} from './realtimeTranslationSession';

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

export const App = () => {
  // Lobby state
  const [mode, setMode] = useState<ConversationMode>('listener');
  const [source, setSource] = useState<Language>(findLanguage('en'));
  const [target, setTarget] = useState<Language>(findLanguage('es'));

  // App flow
  const [view, setView] = useState<View>('lobby');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<RealtimeTokenResponse | null>(null);

  // Transcripts (raw streaming buffers)
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [deltaLog, setDeltaLog] = useState<string[]>([]);

  // Turn-about
  const [activeSide, setActiveSide] = useState<'source' | 'target'>('source');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [holdingMic, setHoldingMic] = useState(false);
  const turnBuilderRef = useRef<{ src: string; dst: string; side: 'you' | 'them' } | null>(null);
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

  // Refs to session lifecycle
  const sessionRef = useRef<RealtimeTranslationSession | null>(null);
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
      revokeRecordingUrl();
      revokePracticeAudio();
    },
    [teardownSession, revokeRecordingUrl, revokePracticeAudio]
  );

  const resetTranscriptBuffers = useCallback(() => {
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
        setInputTranscript((prev) => prev + delta.text);
      } else {
        setOutputTranscript((prev) => prev + delta.text);
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

  useEffect(() => {
    if (mode !== 'turnabout' || !holdingMic) return;
    if (!turnBuilderRef.current) {
      turnBuilderRef.current = {
        src: '',
        dst: '',
        side: activeSide === 'source' ? 'you' : 'them'
      };
    }
  }, [mode, holdingMic, activeSide]);

  const launch = useCallback(async () => {
    if (status === 'launching' || status === 'connecting') return;
    setErrorMessage(null);
    teardownSession();
    resetTranscriptBuffers();
    revokeRecordingUrl();
    setRecordingBlobUrl(null);

    const launchId = launchIdRef.current + 1;
    launchIdRef.current = launchId;
    setStatus('launching');

    try {
      const tokenResponse = await requestRealtimeToken({
        mode,
        sourceLanguage: mode === 'listener' ? undefined : source.bcp47,
        targetLanguage: target.bcp47
      });
      if (launchIdRef.current !== launchId) return;
      setToken(tokenResponse);
      setStatus('connecting');
      setView('session');

      const abort = new AbortController();
      abortRef.current = abort;

      const session = await createRealtimeTranslationSession({
        token: tokenResponse,
        signal: abort.signal,
        onLocalStream: (stream) => {
          if (launchIdRef.current !== launchId) return;
          localStreamRef.current = stream;
          if (mode === 'listener') {
            startMediaRecorder(stream);
          }
        },
        onTranscriptDelta: (delta) => {
          if (launchIdRef.current === launchId) handleTranscriptDelta(delta);
        },
        onRemoteAudio: () => {
          if (launchIdRef.current === launchId) setStatus('live');
        }
      });
      if (launchIdRef.current !== launchId) {
        session.stop();
        return;
      }
      sessionRef.current = session;
      setStatus('live');
      if (mode === 'practice') {
        setPracticeStage('idle');
      }
    } catch (error) {
      if (launchIdRef.current !== launchId) return;
      teardownSession();
      const message =
        error instanceof RealtimeTokenClientError
          ? error.message
          : error instanceof RealtimeTranslationSessionError
            ? error.message
            : 'Could not launch translation. Please try again.';
      setErrorMessage(message);
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
    handleTranscriptDelta,
    revokeRecordingUrl,
    startMediaRecorder
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

  const flipTurnaboutSides = useCallback(() => {
    setActiveSide((side) => (side === 'source' ? 'target' : 'source'));
  }, []);

  const onMicDown = useCallback(() => {
    if (holdingMicRef.current) return;
    holdingMicRef.current = true;
    setHoldingMic(true);
    const priorPendingId = pendingTurnIdRef.current;
    if (priorPendingId) {
      setTurns((prev) => prev.map((t) => (t.id === priorPendingId ? { ...t, status: 'done' } : t)));
      pendingTurnIdRef.current = null;
    }
    lastOutputLenRef.current = outputTranscript.length;
    inputBaselineRef.current = inputTranscript.length;
    setLiveBaseInputLen(inputTranscript.length);
    setLiveBaseOutputLen(outputTranscript.length);
  }, [outputTranscript.length, inputTranscript.length]);

  const onMicUp = useCallback(() => {
    if (!holdingMicRef.current) return;
    holdingMicRef.current = false;
    setHoldingMic(false);
    const builder = turnBuilderRef.current;
    turnBuilderRef.current = null;
    if (!builder) return;
    const newDst = outputTranscript.slice(lastOutputLenRef.current).trim();
    const newSrc = inputTranscript.slice(inputBaselineRef.current).trim();
    if (!newSrc && !newDst) return;
    const fromYou = builder.side === 'you';
    const srcLang = fromYou
      ? (activeSide === 'source' ? source : target)
      : (activeSide === 'source' ? target : source);
    const dstLang = fromYou
      ? (activeSide === 'source' ? target : source)
      : (activeSide === 'source' ? source : target);
    const turnId = `turn_${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        side: builder.side,
        srcLang,
        dstLang,
        src: newSrc,
        dst: newDst,
        status: 'translating'
      }
    ]);
    pendingTurnIdRef.current = turnId;
    pendingBaseOutputLenRef.current = lastOutputLenRef.current;
  }, [outputTranscript, inputTranscript, activeSide, source, target]);

  useEffect(() => {
    const id = pendingTurnIdRef.current;
    if (!id) return;
    const newDst = outputTranscript.slice(pendingBaseOutputLenRef.current).trim();
    if (!newDst) return;
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, dst: newDst } : t)));
  }, [outputTranscript]);

  const startPracticeRecording = useCallback(() => {
    revokePracticeAudio();
    setPracticeAudioUrl(null);
    setInputTranscript('');
    setOutputTranscript('');
    setPracticeAttempt('');
    setPracticeStage('recording');
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
    if (!localStreamRef.current) return;
    try {
      const recorder = new MediaRecorder(localStreamRef.current);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (recorderRef.current !== recorder) return;
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        practiceAudioUrlRef.current = url;
        setPracticeAudioUrl(url);
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, [revokePracticeAudio]);

  const stopPracticeRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // best effort
      }
    }
    recorderRef.current = null;
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
    setInputTranscript('');
    setOutputTranscript('');
    setPracticeStage('idle');
  }, [revokePracticeAudio]);

  const nextPracticePhrase = useCallback(() => {
    tryPracticeAgain();
  }, [tryPracticeAgain]);

  const copyTranscript = useCallback(() => {
    const sourceLabel = mode === 'listener' ? 'Auto-detected' : source.name;
    const text = [
      `SimTalk transcript`,
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
    void navigator.clipboard?.writeText(text);
  }, [mode, source, target, inputTranscript, outputTranscript]);

  const downloadTranscript = useCallback(() => {
    const sourceLabel = mode === 'listener' ? 'Auto-detected' : source.name;
    const text = [
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
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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
  }, [mode, source, target, inputTranscript, outputTranscript]);

  const headerStatus: 'connecting' | 'live' | 'paused' | 'idle' = useMemo(() => {
    if (status === 'launching' || status === 'connecting') return 'connecting';
    if (status === 'live') return 'live';
    if (status === 'paused') return 'paused';
    return 'idle';
  }, [status]);

  // Suppress noise: prevent same source/target conflicting per Zod refinement
  useEffect(() => {
    if (source.bcp47 === target.bcp47) {
      const other = LANGUAGES.find((lang) => lang.bcp47 !== source.bcp47);
      if (other) setTarget(other);
    }
  }, [source, target]);

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
          errorMessage={errorMessage}
          onChangeMode={(next) => {
            setMode(next);
            setErrorMessage(null);
          }}
          onChangeSource={setSource}
          onChangeTarget={setTarget}
          onSwap={swapLanguages}
          onLaunch={launch}
        />
      ) : null}

      {view === 'session' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <SessionHeader
            mode={mode}
            source={mode === 'listener' ? null : source}
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
              onFlip={flipTurnaboutSides}
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
          source={mode === 'listener' ? null : source}
          target={target}
          inputTranscript={inputTranscript}
          outputTranscript={outputTranscript}
          audioUrl={recordingBlobUrl}
          audioFilename={recordingNameRef.current}
          onCopy={copyTranscript}
          onDownloadTranscript={downloadTranscript}
          onNewSession={newSession}
        />
      ) : null}

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
