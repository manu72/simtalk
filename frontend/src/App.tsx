import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { conversationModes, type ConversationMode, type RealtimeTokenResponse } from '@simtalk/shared-types';

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
  listener: 'Listen to any supported language and hear live translated audio.',
  turnabout: 'Share one device and switch speaker roles during a conversation.',
  practice: 'Speak, pause, replay, and review translations for learning.'
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

type SessionStatus = 'idle' | 'loading' | 'ready' | 'connecting' | 'connected' | 'error';

type PreparedSession = Pick<
  RealtimeTokenResponse,
  'expiresAt' | 'sessionExpiresAt' | 'sessionId' | 'translationCallUrl'
>;

const fallbackErrorMessage = 'Realtime translation could not be prepared.';
const fallbackWebRtcErrorMessage = 'Realtime audio could not be started.';

export const App = () => {
  const [selectedMode, setSelectedMode] = useState<ConversationMode>('listener');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preparedToken, setPreparedToken] = useState<RealtimeTokenResponse | null>(null);
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const activeTokenRequestRef = useRef(0);
  const activeWebRtcRequestRef = useRef(0);
  const activeWebRtcAbortControllerRef = useRef<AbortController | null>(null);
  const translationSessionRef = useRef<RealtimeTranslationSession | null>(null);

  const needsSourceLanguage = selectedMode === 'turnabout' || selectedMode === 'practice';
  const sourceHelpText = useMemo(
    () =>
      selectedMode === 'listener'
        ? 'Listener Mode lets OpenAI detect the spoken language from incoming audio.'
        : 'Choose the language spoken into this device before requesting a session.',
    [selectedMode]
  );

  const handleModeSelect = (mode: ConversationMode) => {
    activeTokenRequestRef.current += 1;
    invalidateWebRtcSession();
    setSelectedMode(mode);
    setStatus('idle');
    setErrorMessage(null);
    setPreparedToken(null);
    setInputTranscript('');
    setOutputTranscript('');
  };

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

  const invalidateWebRtcSession = () => {
    activeWebRtcRequestRef.current += 1;
    activeWebRtcAbortControllerRef.current?.abort();
    activeWebRtcAbortControllerRef.current = null;
    stopTranslationSession();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestId = activeTokenRequestRef.current + 1;
    activeTokenRequestRef.current = requestId;
    invalidateWebRtcSession();
    setStatus('loading');
    setErrorMessage(null);
    setPreparedToken(null);
    setInputTranscript('');
    setOutputTranscript('');

    try {
      const token = await requestRealtimeToken({
        mode: selectedMode,
        sourceLanguage: needsSourceLanguage ? sourceLanguage : undefined,
        targetLanguage
      });

      if (activeTokenRequestRef.current !== requestId) {
        return;
      }

      setPreparedToken(token);
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
        onRemoteAudio: () => {
          if (activeWebRtcRequestRef.current === requestId) {
            setStatus('connected');
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
    invalidateWebRtcSession();
    setStatus(preparedToken ? 'ready' : 'idle');
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
      invalidateWebRtcSession();
    },
    []
  );

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Private Phase 1 prototype</p>
        <h1 id="hero-title">SimTalk</h1>
        <p className="hero-copy">
          Speak naturally. Hear instantly. This scaffold keeps secrets on the backend and leaves
          audio, transcripts, and recordings in the browser.
        </p>
        <a className="skip-link" href="#session-setup">
          Prepare a translation session
        </a>
      </section>

      <section className="panel" aria-labelledby="session-setup">
        <div>
          <p className="eyebrow">Session setup</p>
          <h2 id="session-setup">Choose the workflow to validate first</h2>
          <p>
            This prepares the short-lived translation credential only. Microphone capture and
            WebRTC start only after you explicitly start the microphone.
          </p>
        </div>

        <form className="session-form" onSubmit={handleSubmit}>
          <fieldset className="mode-grid" aria-describedby="mode-help">
            <legend>Conversation mode</legend>
            <p id="mode-help" className="field-help">
              Select one Phase 1 workflow. Controls stay keyboard-accessible native inputs.
            </p>
            {conversationModes.map((mode) => (
              <label className="mode-card" key={mode}>
                <input
                  checked={selectedMode === mode}
                  name="conversation-mode"
                  onChange={() => handleModeSelect(mode)}
                  type="radio"
                  value={mode}
                />
                <span>
                  <strong>{modeLabels[mode]}</strong>
                  <small>{modeDescriptions[mode]}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="language-grid">
            <label className="field">
              <span>Spoken language</span>
              <select
                aria-describedby="source-language-help"
                disabled={!needsSourceLanguage}
                onChange={(event) => setSourceLanguage(event.target.value)}
                value={sourceLanguage}
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
              <small id="source-language-help">{sourceHelpText}</small>
            </label>

            <label className="field">
              <span>Translation language</span>
              <select
                onChange={(event) => setTargetLanguage(event.target.value)}
                value={targetLanguage}
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="primary-action" disabled={status === 'loading'} type="submit">
            {status === 'loading' ? 'Preparing session...' : 'Prepare translation session'}
          </button>
        </form>
      </section>

      <section className="panel status-panel" aria-labelledby="session-status">
        <div>
          <p className="eyebrow">Session status</p>
          <h2 id="session-status">Recording is off by default</h2>
        </div>
        <div aria-live="polite" className={`status-card status-card--${status}`} role="status">
          {status === 'idle' && (
            <p>
              No translation session has been prepared yet. Audio capture will remain inactive.
            </p>
          )}
          {status === 'loading' && <p>Requesting a short-lived translation credential...</p>}
          {status === 'connecting' && <p>Requesting microphone access and connecting WebRTC...</p>}
          {status === 'error' && <p>{errorMessage}</p>}
          {(status === 'ready' || status === 'connected') && browserSafeSession && (
            <dl>
              <div>
                <dt>Prepared session</dt>
                <dd>{browserSafeSession.sessionId}</dd>
              </div>
              <div>
                <dt>Credential expires</dt>
                <dd>{new Date(browserSafeSession.expiresAt).toLocaleTimeString()}</dd>
              </div>
              <div>
                <dt>WebRTC call endpoint</dt>
                <dd>{browserSafeSession.translationCallUrl}</dd>
              </div>
            </dl>
          )}
        </div>
        {preparedToken && (
          <div className="session-actions">
            <button
              className="primary-action"
              disabled={status === 'connecting' || status === 'connected'}
              onClick={handleStartWebRtc}
              type="button"
            >
              {status === 'connecting' ? 'Connecting audio...' : 'Start microphone and WebRTC'}
            </button>
            <button
              className="secondary-action"
              disabled={status !== 'connected'}
              onClick={handleStopWebRtc}
              type="button"
            >
              Stop audio
            </button>
          </div>
        )}
        <section className="transcript-panel" aria-labelledby="transcript-title">
          <h3 id="transcript-title">Live transcript preview</h3>
          <div className="transcript-grid">
            <article>
              <h4>Input transcript</h4>
              <p>{inputTranscript || 'Waiting for input transcript deltas.'}</p>
            </article>
            <article>
              <h4>Translated transcript</h4>
              <p>{outputTranscript || 'Waiting for translated transcript deltas.'}</p>
            </article>
          </div>
        </section>
        <p>
          The browser receives only a short-lived client secret. Audio flows directly from this
          browser to OpenAI over WebRTC and is not sent to the SimTalk backend.
        </p>
      </section>
    </main>
  );
};
