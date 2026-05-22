import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Download,
  GraduationCap,
  Languages,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  type LucideIcon
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { conversationModes, type ConversationMode, type RealtimeTokenResponse } from '@simtalk/shared-types';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { cn } from './lib/utils';
import { RealtimeTokenClientError, requestRealtimeToken } from './realtimeTokenClient';
import {
  createRealtimeTranslationSession,
  RealtimeTranslationSessionError,
  type RealtimeTranslationSession,
  type TranscriptDelta
} from './realtimeTranslationSession';

const modeLabels: Record<ConversationMode, string> = {
  listener: 'Listener Mode',
  turnabout: 'Turn-about Mode',
  practice: 'Practice Mode'
};

const modeDescriptions: Record<ConversationMode, string> = {
  listener: 'Let OpenAI detect incoming speech and return live translated audio.',
  turnabout: 'Share one device and flip speaker roles during a conversation.',
  practice: 'Speak, pause, listen back, and review translations for learning.'
};

const modeMeta: Record<ConversationMode, { readonly icon: LucideIcon; readonly eyebrow: string }> = {
  listener: { icon: Radio, eyebrow: 'hands-free listening' },
  turnabout: { icon: ArrowLeftRight, eyebrow: 'shared device' },
  practice: { icon: GraduationCap, eyebrow: 'guided repetition' }
};

const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-Hans', label: 'Chinese (Simplified)' }
] as const;

const getAudioRecordingFileExtension = (mimeType: string) => {
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0]?.trim();

  if (normalizedMimeType === 'audio/mp4') {
    return '.mp4';
  }

  if (normalizedMimeType === 'audio/m4a') {
    return '.m4a';
  }

  if (normalizedMimeType === 'audio/webm') {
    return '.webm';
  }

  return '.webm';
};

type SessionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'error';

type PreparedSession = Pick<
  RealtimeTokenResponse,
  'expiresAt' | 'sessionExpiresAt' | 'sessionId' | 'translationCallUrl'
>;

type StatusDetails = {
  readonly label: string;
  readonly message: string;
  readonly icon: LucideIcon;
  readonly badgeVariant: 'secondary' | 'success' | 'warning' | 'destructive';
};

type RecordingStatus = 'off' | 'recording' | 'ready' | 'unsupported' | 'error';

type LocalRecordingSession = {
  readonly recorder: MediaRecorder;
  chunks: Blob[];
  discardOnStop: boolean;
  isStopping: boolean;
  resolveStopCompletion: (() => void) | null;
  stopCompletion: Promise<void> | null;
};

const statusDetails: Record<SessionStatus, StatusDetails> = {
  idle: {
    label: 'Idle',
    message: 'No translation session has been prepared yet. Audio capture will remain inactive.',
    icon: MicOff,
    badgeVariant: 'secondary'
  },
  loading: {
    label: 'Preparing',
    message: 'Requesting a short-lived translation credential from the SimTalk backend.',
    icon: Bot,
    badgeVariant: 'warning'
  },
  ready: {
    label: 'Ready',
    message: 'Credential prepared. Start the microphone when you are ready to test audio.',
    icon: CheckCircle2,
    badgeVariant: 'success'
  },
  connecting: {
    label: 'Connecting',
    message: 'Requesting microphone access and connecting the WebRTC session.',
    icon: Mic,
    badgeVariant: 'warning'
  },
  connected: {
    label: 'Listening',
    message: 'WebRTC is connected. Speak naturally while SimTalk waits for translated audio.',
    icon: Mic,
    badgeVariant: 'success'
  },
  streaming: {
    label: 'Translating',
    message: 'Translated audio and transcript deltas are streaming back to this browser.',
    icon: Languages,
    badgeVariant: 'success'
  },
  error: {
    label: 'Needs attention',
    message: 'Realtime translation could not be prepared.',
    icon: CircleAlert,
    badgeVariant: 'destructive'
  }
};

const fallbackErrorMessage = 'Realtime translation could not be prepared.';
const fallbackWebRtcErrorMessage = 'Realtime audio could not be started.';

const getLanguageLabel = (languageCode: string) =>
  languageOptions.find((language) => language.code === languageCode)?.label ?? languageCode;

const selectClassName =
  'h-16 w-full rounded-2xl border border-border bg-background/80 px-4 text-lg font-semibold text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55';

type ListeningOrbProps = {
  readonly isActive: boolean;
  readonly prefersReducedMotion: boolean;
};

const ListeningOrb = ({ isActive, prefersReducedMotion }: ListeningOrbProps) => (
  <div className="relative grid size-24 place-items-center sm:size-28" aria-hidden="true">
    {isActive && !prefersReducedMotion && (
      <motion.span
        animate={{ opacity: [0.42, 0.08, 0.42], scale: [1, 1.18, 1] }}
        className="absolute inset-0 rounded-full border border-primary/50 bg-primary/10"
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    )}
    <span
      className={cn(
        'relative grid size-20 place-items-center rounded-full border shadow-[0_20px_70px_var(--shadow-primary)] sm:size-24',
        isActive
          ? 'border-primary/60 bg-primary text-primary-foreground'
          : 'border-border bg-secondary text-muted-foreground'
      )}
    >
      {isActive ? <Mic className="size-8" /> : <MicOff className="size-8" />}
    </span>
  </div>
);

export const App = () => {
  const [selectedMode, setSelectedMode] = useState<ConversationMode>('listener');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preparedToken, setPreparedToken] = useState<RealtimeTokenResponse | null>(null);
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('off');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioRecordingUrl, setAudioRecordingUrl] = useState<string | null>(null);
  const [audioRecordingName, setAudioRecordingName] = useState('simtalk-recording.webm');
  const activeTokenRequestRef = useRef(0);
  const activeWebRtcRequestRef = useRef(0);
  const activeWebRtcAbortControllerRef = useRef<AbortController | null>(null);
  const translationSessionRef = useRef<RealtimeTranslationSession | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const activeRecordingSessionRef = useRef<LocalRecordingSession | null>(null);
  const preparedTokenRef = useRef<RealtimeTokenResponse | null>(null);
  const audioRecordingUrlRef = useRef<string | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const needsSourceLanguage = selectedMode === 'turnabout' || selectedMode === 'practice';
  const isTurnaboutMode = selectedMode === 'turnabout';
  const isPracticeMode = selectedMode === 'practice';
  const sourceHelpText = useMemo(
    () =>
      selectedMode === 'listener'
        ? 'Listener Mode keeps spoken language on automatic detection.'
        : 'Choose the language spoken into this device before requesting a session.',
    [selectedMode]
  );

  const isWebRtcSessionActive = status === 'connected' || status === 'streaming';
  const isListening = status === 'connecting' || isWebRtcSessionActive;
  const canShowPreparedSession = status === 'ready' || status === 'connecting' || isWebRtcSessionActive;
  const hasTranscript = inputTranscript.length > 0 || outputTranscript.length > 0;
  const activeStatusDetails = statusDetails[status];
  const StatusIcon = activeStatusDetails.icon;
  const startWebRtcLabel = isPracticeMode ? 'Start practice attempt' : 'Start microphone and WebRTC';
  const stopWebRtcLabel = isPracticeMode ? 'Pause and review phrase' : 'Stop audio';
  const practiceReviewMessage = hasTranscript ? 'Review this attempt' : 'Ready for another phrase';
  const canStartRecording =
    isWebRtcSessionActive &&
    localMediaStreamRef.current !== null &&
    recordingStatus !== 'recording' &&
    recordingStatus !== 'unsupported';

  const updatePreparedToken = (token: RealtimeTokenResponse | null) => {
    preparedTokenRef.current = token;
    setPreparedToken(token);
  };

  const getPreparedSessionStatus = (): SessionStatus =>
    preparedTokenRef.current ? 'ready' : 'idle';

  const handleTranscriptDelta = (delta: TranscriptDelta) => {
    if (delta.kind === 'input') {
      setInputTranscript((current) => `${current}${delta.text}`);
      return;
    }

    setOutputTranscript((current) => `${current}${delta.text}`);
  };

  const stopTranslationSession = () => {
    translationSessionRef.current?.stop();
    translationSessionRef.current = null;
  };

  const revokeAudioRecordingUrl = () => {
    if (audioRecordingUrlRef.current) {
      URL.revokeObjectURL(audioRecordingUrlRef.current);
      audioRecordingUrlRef.current = null;
    }
  };

  const clearAudioRecording = () => {
    const hasActiveRecording = activeRecordingSessionRef.current !== null;

    revokeAudioRecordingUrl();
    setAudioRecordingUrl(null);
    setAudioRecordingName('simtalk-recording.webm');
    setRecordingError(null);
    if (!hasActiveRecording) {
      setRecordingStatus('off');
    }
  };

  const finalizeLocalRecording = (recordingSession: LocalRecordingSession) => {
    if (activeRecordingSessionRef.current !== recordingSession) {
      return;
    }

    activeRecordingSessionRef.current = null;

    if (recordingSession.discardOnStop) {
      setRecordingError(null);
      setRecordingStatus('off');
      return;
    }

    if (recordingSession.chunks.length === 0) {
      setRecordingError('No local audio data was captured.');
      setRecordingStatus('error');
      return;
    }

    const recordingMimeType = recordingSession.recorder.mimeType || 'audio/webm';
    const recordingBlob = new Blob(recordingSession.chunks, {
      type: recordingMimeType
    });
    const recordingUrl = URL.createObjectURL(recordingBlob);
    const recordingFileExtension = getAudioRecordingFileExtension(recordingMimeType);
    const recordingName = `simtalk-audio-${new Date().toISOString()}${recordingFileExtension}`;

    revokeAudioRecordingUrl();
    audioRecordingUrlRef.current = recordingUrl;
    setAudioRecordingUrl(recordingUrl);
    setAudioRecordingName(recordingName);
    setRecordingError(null);
    setRecordingStatus('ready');
  };

  const completeLocalRecordingStop = (recordingSession: LocalRecordingSession) => {
    const resolveStopCompletion = recordingSession.resolveStopCompletion;
    recordingSession.resolveStopCompletion = null;

    try {
      finalizeLocalRecording(recordingSession);
    } finally {
      resolveStopCompletion?.();
    }
  };

  const stopLocalRecording = ({
    discard = false
  }: { readonly discard?: boolean } = {}): Promise<void> => {
    const recordingSession = activeRecordingSessionRef.current;
    if (!recordingSession) {
      return Promise.resolve();
    }

    recordingSession.discardOnStop = recordingSession.discardOnStop || discard;
    if (recordingSession.isStopping) {
      return recordingSession.stopCompletion ?? Promise.resolve();
    }
    recordingSession.isStopping = true;
    recordingSession.stopCompletion = new Promise<void>((resolve) => {
      recordingSession.resolveStopCompletion = resolve;
    });

    try {
      if (recordingSession.recorder.state === 'inactive') {
        recordingSession.recorder.onstop = null;
        completeLocalRecordingStop(recordingSession);
        return recordingSession.stopCompletion;
      }

      recordingSession.recorder.stop();
    } catch {
      recordingSession.recorder.onstop = null;
      if (activeRecordingSessionRef.current === recordingSession) {
        activeRecordingSessionRef.current = null;
      }
      recordingSession.resolveStopCompletion?.();
      recordingSession.resolveStopCompletion = null;

      if (!recordingSession.discardOnStop) {
        setRecordingError('Local audio recording could not be stopped.');
        setRecordingStatus('error');
      } else {
        setRecordingError(null);
        setRecordingStatus('off');
      }
    }

    return recordingSession.stopCompletion;
  };

  const invalidateWebRtcSession = ({
    discardRecording = false
  }: { readonly discardRecording?: boolean } = {}): Promise<void> => {
    const translationSession = translationSessionRef.current;
    const recordingSession = activeRecordingSessionRef.current;
    activeWebRtcRequestRef.current += 1;
    activeWebRtcAbortControllerRef.current?.abort();
    activeWebRtcAbortControllerRef.current = null;
    translationSessionRef.current = null;
    localMediaStreamRef.current = null;

    const recordingStopCompletion = stopLocalRecording({ discard: discardRecording });
    if (!recordingSession) {
      translationSession?.stop();
      return Promise.resolve();
    }

    return recordingStopCompletion.finally(() => {
      translationSession?.stop();
    });
  };

  const resetPreparedSession = () => {
    activeTokenRequestRef.current += 1;
    void invalidateWebRtcSession({ discardRecording: true });
    clearAudioRecording();
    setStatus('idle');
    setErrorMessage(null);
    updatePreparedToken(null);
    setInputTranscript('');
    setOutputTranscript('');
  };

  const handleModeSelect = (mode: ConversationMode) => {
    if (mode === selectedMode) {
      return;
    }

    setSelectedMode(mode);
    resetPreparedSession();
  };

  const handleSourceLanguageChange = (languageCode: string) => {
    setSourceLanguage(languageCode);
    resetPreparedSession();
  };

  const handleTargetLanguageChange = (languageCode: string) => {
    setTargetLanguage(languageCode);
    resetPreparedSession();
  };

  const handleFlipLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    resetPreparedSession();
  };

  const handleNewPracticeAttempt = () => {
    resetPreparedSession();
  };

  const handleDownloadTranscript = () => {
    const sourceLabel = needsSourceLanguage ? getLanguageLabel(sourceLanguage) : 'Auto-detected source';
    const transcript = [
      'SimTalk transcript',
      `Mode: ${modeLabels[selectedMode]}`,
      `Source: ${sourceLabel}`,
      `Target: ${getLanguageLabel(targetLanguage)}`,
      '',
      'Input transcript:',
      inputTranscript || 'No input transcript captured.',
      '',
      'Translated transcript:',
      outputTranscript || 'No translated transcript captured.'
    ].join('\n');
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `simtalk-transcript-${new Date().toISOString()}.txt`;
    document.body.append(link);

    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  const handleStartLocalRecording = () => {
    if (!localMediaStreamRef.current) {
      setRecordingError('Start WebRTC before recording local audio.');
      setRecordingStatus('error');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setRecordingError('This browser does not support local audio recording.');
      setRecordingStatus('unsupported');
      return;
    }

    if (activeRecordingSessionRef.current) {
      return;
    }

    clearAudioRecording();

    try {
      const recorder = new MediaRecorder(localMediaStreamRef.current);
      const recordingSession: LocalRecordingSession = {
        recorder,
        chunks: [],
        discardOnStop: false,
        isStopping: false,
        resolveStopCompletion: null,
        stopCompletion: null
      };

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingSession.chunks = [...recordingSession.chunks, event.data];
        }
      };
      recorder.onstop = () => completeLocalRecordingStop(recordingSession);

      activeRecordingSessionRef.current = recordingSession;
      recorder.start();
      setRecordingError(null);
      setRecordingStatus('recording');
    } catch {
      activeRecordingSessionRef.current = null;
      setRecordingError('Local audio recording could not be started.');
      setRecordingStatus('error');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestId = activeTokenRequestRef.current + 1;
    activeTokenRequestRef.current = requestId;
    setStatus('loading');
    setErrorMessage(null);
    updatePreparedToken(null);
    setInputTranscript('');
    setOutputTranscript('');
    clearAudioRecording();
    await invalidateWebRtcSession({ discardRecording: true });

    if (activeTokenRequestRef.current !== requestId) {
      return;
    }

    try {
      const token = await requestRealtimeToken({
        mode: selectedMode,
        sourceLanguage: needsSourceLanguage ? sourceLanguage : undefined,
        targetLanguage
      });

      if (activeTokenRequestRef.current !== requestId) {
        return;
      }

      updatePreparedToken(token);
      setStatus('ready');
    } catch (error) {
      if (activeTokenRequestRef.current !== requestId) {
        return;
      }

      const message =
        error instanceof RealtimeTokenClientError ? error.message : fallbackErrorMessage;
      setErrorMessage(message);
      setStatus('error');
    }
  };

  const handleStartWebRtc = async () => {
    if (!preparedToken) {
      setErrorMessage('Prepare a translation session before starting WebRTC.');
      setStatus('error');
      return;
    }

    const requestId = activeWebRtcRequestRef.current + 1;
    activeWebRtcRequestRef.current = requestId;
    const abortController = new AbortController();
    activeWebRtcAbortControllerRef.current = abortController;
    setStatus('connecting');
    setErrorMessage(null);
    setInputTranscript('');
    setOutputTranscript('');

    try {
      const translationSession = await createRealtimeTranslationSession({
        token: preparedToken,
        signal: abortController.signal,
        onTranscriptDelta: (delta) => {
          if (activeWebRtcRequestRef.current === requestId) {
            handleTranscriptDelta(delta);
          }
        },
        onLocalStream: (stream) => {
          if (activeWebRtcRequestRef.current === requestId) {
            localMediaStreamRef.current = stream;
          }
        },
        onRemoteAudio: () => {
          if (activeWebRtcRequestRef.current === requestId) {
            setStatus('streaming');
          }
        }
      });
      if (activeWebRtcRequestRef.current !== requestId) {
        translationSession.stop();
        return;
      }

      activeWebRtcAbortControllerRef.current = null;
      translationSessionRef.current = translationSession;
      setStatus('connected');
    } catch (error) {
      if (activeWebRtcRequestRef.current !== requestId) {
        return;
      }

      activeWebRtcAbortControllerRef.current = null;
      stopTranslationSession();
      setErrorMessage(
        error instanceof RealtimeTranslationSessionError
          ? error.message
          : fallbackWebRtcErrorMessage
      );
      setStatus('error');
    }
  };

  const handleStopWebRtc = () => {
    const recordingSession = activeRecordingSessionRef.current;
    const invalidationCompletion = invalidateWebRtcSession();
    const invalidationRequestId = activeWebRtcRequestRef.current;

    if (!recordingSession) {
      setStatus(getPreparedSessionStatus());
      return;
    }

    void invalidationCompletion.then(() => {
      if (activeWebRtcRequestRef.current === invalidationRequestId) {
        setStatus(getPreparedSessionStatus());
      }
    });
  };

  const browserSafeSession: PreparedSession | null = preparedToken
    ? {
        expiresAt: preparedToken.expiresAt,
        sessionExpiresAt: preparedToken.sessionExpiresAt,
        sessionId: preparedToken.sessionId,
        translationCallUrl: preparedToken.translationCallUrl
      }
    : null;

  useEffect(
    () => () => {
      void invalidateWebRtcSession({ discardRecording: true });
      revokeAudioRecordingUrl();
    },
    []
  );

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section className="relative isolate px-4 py-6 sm:px-6 lg:px-8" aria-labelledby="hero-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,var(--gradient-start),transparent_32rem),radial-gradient(circle_at_85%_12%,var(--gradient-end),transparent_28rem)]" />
        <div className="mx-auto grid w-full max-w-7xl gap-6">
          <header className="grid gap-6 rounded-[2.5rem] border border-border bg-card/78 p-6 shadow-[0_28px_100px_var(--shadow-shell)] backdrop-blur sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:p-10">
            <div className="grid gap-4">
              <Badge variant="secondary" className="w-fit">
                <Sparkles className="size-3.5" />
                Private Phase 1 Prototype
              </Badge>
              <div className="grid gap-4">
                <h1 id="hero-title" className="max-w-4xl text-5xl font-semibold tracking-[-0.07em] text-balance sm:text-7xl lg:text-8xl">
                  SimTalk
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                  Speak naturally. Hear instantly. A polished browser-owned translation console for
                  validating live speech, translated audio, and local transcript review without
                  exposing long-lived secrets.
                </p>
              </div>
            </div>
            <Card className="overflow-hidden rounded-[2rem] bg-background/72">
              <CardContent className="grid gap-4 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Current state</p>
                    <p className="text-2xl font-semibold tracking-[-0.03em]">{activeStatusDetails.label}</p>
                  </div>
                  <ListeningOrb isActive={isListening} prefersReducedMotion={prefersReducedMotion} />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{activeStatusDetails.message}</p>
              </CardContent>
            </Card>
          </header>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <Card className="bg-card/88 backdrop-blur" id="session-setup">
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  Session setup
                </Badge>
                <CardTitle>Choose the conversation workflow</CardTitle>
                <CardDescription>
                  Preparing a session only requests a short-lived credential. Microphone capture starts
                  later, after an explicit action.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-8" onSubmit={handleSubmit}>
                  <fieldset className="grid gap-4" aria-describedby="mode-help">
                    <legend className="text-base font-semibold text-foreground">Conversation mode</legend>
                    <p id="mode-help" className="text-sm leading-6 text-muted-foreground">
                      Native radio controls are styled as large cards and remain keyboard accessible.
                    </p>
                    <div className="grid gap-4 md:grid-cols-3">
                      {conversationModes.map((mode) => {
                        const Icon = modeMeta[mode].icon;

                        return (
                          <label
                            className="group grid cursor-pointer gap-4 rounded-[1.5rem] border border-border bg-background/72 p-6 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/8 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
                            key={mode}
                          >
                            <input
                              checked={selectedMode === mode}
                              className="sr-only"
                              name="conversation-mode"
                              onChange={() => handleModeSelect(mode)}
                              type="radio"
                              value={mode}
                            />
                            <span className="flex items-center justify-between gap-4">
                              <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground transition-colors group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground">
                                <Icon className="size-5" />
                              </span>
                              <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                                {modeMeta[mode].eyebrow}
                              </span>
                            </span>
                            <span className="grid gap-2">
                              <strong className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                                {modeLabels[mode]}
                              </strong>
                              <small className="text-sm leading-6 text-muted-foreground">
                                {modeDescriptions[mode]}
                              </small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="grid gap-4">
                    <legend className="text-base font-semibold text-foreground">Language direction</legend>
                    <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-muted-foreground">Spoken language</span>
                        <select
                          aria-describedby="source-language-help"
                          className={selectClassName}
                          disabled={!needsSourceLanguage}
                          onChange={(event) => handleSourceLanguageChange(event.target.value)}
                          value={sourceLanguage}
                        >
                          {languageOptions.map((language) => (
                            <option key={language.code} value={language.code}>
                              {language.label}
                            </option>
                          ))}
                        </select>
                        <small id="source-language-help" className="min-h-10 text-sm leading-5 text-muted-foreground">
                          {sourceHelpText}
                        </small>
                      </label>

                      <Button
                        aria-label={isTurnaboutMode ? 'Switch speaker direction' : 'Flip selected languages'}
                        className="mb-10 h-14 justify-self-start px-6 lg:justify-self-center"
                        disabled={!needsSourceLanguage || status === 'loading' || status === 'connecting'}
                        onClick={handleFlipLanguages}
                        size={isTurnaboutMode ? 'default' : 'icon'}
                        type="button"
                        variant="outline"
                      >
                        <ArrowLeftRight className="size-5" />
                        {isTurnaboutMode && <span>Switch speaker direction</span>}
                      </Button>

                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-muted-foreground">Translation language</span>
                        <select
                          className={selectClassName}
                          onChange={(event) => handleTargetLanguageChange(event.target.value)}
                          value={targetLanguage}
                        >
                          {languageOptions.map((language) => (
                            <option key={language.code} value={language.code}>
                              {language.label}
                            </option>
                          ))}
                        </select>
                        <small className="min-h-10 text-sm leading-5 text-muted-foreground">
                          Translated audio and output transcript use this language.
                        </small>
                      </label>
                    </div>
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-4">
                    <Button disabled={status === 'loading'} size="lg" type="submit">
                      {status === 'loading' ? 'Preparing session...' : 'Prepare translation session'}
                    </Button>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">
                      Changing the mode or languages clears any prepared credential so WebRTC cannot
                      start with stale direction settings.
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="bg-card/88 backdrop-blur" aria-labelledby="session-status">
              <CardHeader>
                <Badge variant={activeStatusDetails.badgeVariant} className="w-fit">
                  <StatusIcon className="size-3.5" />
                  {activeStatusDetails.label}
                </Badge>
                <CardTitle id="session-status">Recording is off by default</CardTitle>
                <CardDescription>
                  Recording and capture remain off until you explicitly start the browser session.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div
                  aria-live="polite"
                  className={cn(
                    'status-card grid place-items-center rounded-[2rem] border border-border bg-background/70 p-8',
                    `status-card--${status}`
                  )}
                  role="status"
                >
                  <ListeningOrb isActive={isListening} prefersReducedMotion={prefersReducedMotion} />
                  <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
                    {status === 'error' ? errorMessage : activeStatusDetails.message}
                  </p>
                </div>

                {preparedToken && (
                  <div className="flex flex-wrap gap-4">
                    <Button
                      disabled={status === 'connecting' || isWebRtcSessionActive}
                      onClick={handleStartWebRtc}
                      type="button"
                    >
                      <Mic className="size-4" />
                      {status === 'connecting' ? 'Connecting audio...' : startWebRtcLabel}
                    </Button>
                    <Button
                      disabled={!isWebRtcSessionActive}
                      onClick={handleStopWebRtc}
                      type="button"
                      variant="secondary"
                    >
                      <Square className="size-4" />
                      {stopWebRtcLabel}
                    </Button>
                  </div>
                )}

                {canShowPreparedSession && browserSafeSession && (
                  <dl className="grid gap-4 rounded-[1.5rem] border border-border bg-background/70 p-4 text-sm">
                    <div className="grid gap-1">
                      <dt className="font-medium text-muted-foreground">Prepared session</dt>
                      <dd className="break-all font-semibold text-foreground">{browserSafeSession.sessionId}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="font-medium text-muted-foreground">Credential expires</dt>
                      <dd className="font-semibold text-foreground">
                        {new Date(browserSafeSession.expiresAt).toLocaleTimeString()}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="font-medium text-muted-foreground">WebRTC endpoint</dt>
                      <dd className="break-all font-semibold text-foreground">
                        {browserSafeSession.translationCallUrl}
                      </dd>
                    </div>
                  </dl>
                )}

                <section className="grid gap-4 rounded-[1.5rem] border border-border bg-background/70 p-4" aria-labelledby="local-recording-title">
                  <div className="grid gap-2">
                    <h4 id="local-recording-title" className="text-base font-semibold text-foreground">
                      Local recording
                    </h4>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Recording is opt-in and stays in this browser as a local blob until you
                      download it, refresh, or reset the session.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Button
                      disabled={!canStartRecording}
                      onClick={handleStartLocalRecording}
                      type="button"
                      variant="outline"
                    >
                      <Mic className="size-4" />
                      Start local recording
                    </Button>
                    <Button
                      disabled={recordingStatus !== 'recording'}
                      onClick={() => {
                        void stopLocalRecording();
                      }}
                      type="button"
                      variant="secondary"
                    >
                      <Square className="size-4" />
                      Stop local recording
                    </Button>
                    {audioRecordingUrl && (
                      <Button asChild variant="outline">
                        <a download={audioRecordingName} href={audioRecordingUrl}>
                          <Download className="size-4" />
                          Download audio recording
                        </a>
                      </Button>
                    )}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {recordingStatus === 'recording' && 'Local microphone recording is active.'}
                    {recordingStatus === 'ready' &&
                      'Audio recording is stored as a local browser blob and has not been uploaded.'}
                    {recordingStatus === 'off' && 'Audio recording is off by default.'}
                    {recordingStatus === 'unsupported' &&
                      'Local recording is unsupported in this browser.'}
                    {recordingStatus === 'error' && recordingError}
                  </p>
                </section>
              </CardContent>
            </Card>
          </section>

          <Card className="bg-card/88 backdrop-blur" aria-labelledby="mode-flow-title">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Mode flow
              </Badge>
              <CardTitle id="mode-flow-title">{modeLabels[selectedMode]}</CardTitle>
              <CardDescription>
                {selectedMode === 'listener' &&
                  'Listener mode keeps source language detection automatic and continuously translates into the selected target language.'}
                {selectedMode === 'turnabout' &&
                  'Turn-about mode assumes one active speaker at a time. Switch the direction manually before the next person speaks.'}
                {selectedMode === 'practice' &&
                  'Practice mode treats each attempt as a phrase: start, speak, pause, review transcripts, then clear for another attempt.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.5rem] border border-border bg-background/70 p-6">
                <p className="text-sm font-semibold text-muted-foreground">Current direction</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
                  {needsSourceLanguage ? getLanguageLabel(sourceLanguage) : 'Auto-detected'} to{' '}
                  {getLanguageLabel(targetLanguage)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-background/70 p-6">
                <p className="text-sm font-semibold text-muted-foreground">Mode rule</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {selectedMode === 'listener' &&
                    'Keep speaking naturally. No diarisation or speaker switching is required.'}
                  {selectedMode === 'turnabout' &&
                    'Only one direction is active. Use the switch action between speakers.'}
                  {selectedMode === 'practice' &&
                    'Pause after each phrase so the source and translated transcripts can be reviewed.'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-background/70 p-6">
                <p className="text-sm font-semibold text-muted-foreground">Next action</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {selectedMode === 'listener' && 'Prepare a session, then start the microphone.'}
                  {selectedMode === 'turnabout' && 'Prepare again after switching direction to avoid stale credentials.'}
                  {selectedMode === 'practice' && practiceReviewMessage}
                </p>
                {isPracticeMode && (
                  <Button className="mt-4" onClick={handleNewPracticeAttempt} type="button" variant="outline">
                    <RotateCcw className="size-4" />
                    New practice attempt
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-6 lg:grid-cols-2" aria-labelledby="transcript-title">
            <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-2">
              <div>
                <Badge variant="secondary" className="mb-4 w-fit">
                  Transcript panels
                </Badge>
                <h2 id="transcript-title" className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  Review what SimTalk heard and returned
                </h2>
              </div>
              <Button disabled={!hasTranscript} onClick={handleDownloadTranscript} type="button" variant="outline">
                <Download className="size-4" />
                Download transcript
              </Button>
            </div>

            <Card className="bg-card/88 backdrop-blur">
              <CardHeader>
                <CardTitle>Input transcript</CardTitle>
                <CardDescription>
                  {needsSourceLanguage
                    ? `Spoken ${getLanguageLabel(sourceLanguage)} captured from the microphone.`
                    : 'Listener Mode uses automatic source-language detection.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <article className="min-h-56 rounded-[1.5rem] border border-border bg-background/72 p-6">
                  <p className="whitespace-pre-wrap break-words text-base leading-8 text-foreground">
                    {inputTranscript || 'Waiting for input transcript deltas.'}
                  </p>
                </article>
              </CardContent>
            </Card>

            <Card className="bg-card/88 backdrop-blur">
              <CardHeader>
                <CardTitle>Translated transcript</CardTitle>
                <CardDescription>
                  Output audio and text target {getLanguageLabel(targetLanguage)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <article className="min-h-56 rounded-[1.5rem] border border-border bg-background/72 p-6">
                  <p className="whitespace-pre-wrap break-words text-base leading-8 text-foreground">
                    {outputTranscript || 'Waiting for translated transcript deltas.'}
                  </p>
                </article>
              </CardContent>
            </Card>
          </section>

          <footer className="rounded-[2rem] border border-border bg-card/72 p-6 text-sm leading-6 text-muted-foreground backdrop-blur">
            The browser receives only a short-lived client secret. Audio flows directly from this browser
            to OpenAI over WebRTC and is not sent to the SimTalk backend.
          </footer>
        </div>
      </section>
    </main>
  );
};
