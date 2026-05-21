import { useMemo, useState, type FormEvent } from 'react';

import { conversationModes, type ConversationMode, type RealtimeTokenResponse } from '@simtalk/shared-types';

import { RealtimeTokenClientError, requestRealtimeToken } from './realtimeTokenClient';

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

type SessionStatus = 'idle' | 'loading' | 'ready' | 'error';

type PreparedSession = Pick<
  RealtimeTokenResponse,
  'expiresAt' | 'sessionExpiresAt' | 'sessionId' | 'translationCallUrl'
>;

const fallbackErrorMessage = 'Realtime translation could not be prepared.';

export const App = () => {
  const [selectedMode, setSelectedMode] = useState<ConversationMode>('listener');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preparedSession, setPreparedSession] = useState<PreparedSession | null>(null);

  const needsSourceLanguage = selectedMode === 'turnabout' || selectedMode === 'practice';
  const sourceHelpText = useMemo(
    () =>
      selectedMode === 'listener'
        ? 'Listener Mode lets OpenAI detect the spoken language from incoming audio.'
        : 'Choose the language spoken into this device before requesting a session.',
    [selectedMode]
  );

  const handleModeSelect = (mode: ConversationMode) => {
    setSelectedMode(mode);
    setStatus('idle');
    setErrorMessage(null);
    setPreparedSession(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('loading');
    setErrorMessage(null);
    setPreparedSession(null);

    try {
      const token = await requestRealtimeToken({
        mode: selectedMode,
        sourceLanguage: needsSourceLanguage ? sourceLanguage : undefined,
        targetLanguage
      });

      const { clientSecret: _clientSecret, ...browserSafeSession } = token;
      setPreparedSession(browserSafeSession);
      setStatus('ready');
    } catch (error) {
      const message =
        error instanceof RealtimeTokenClientError ? error.message : fallbackErrorMessage;
      setErrorMessage(message);
      setStatus('error');
    }
  };

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
            WebRTC connection start in the next build slice.
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
          {status === 'error' && <p>{errorMessage}</p>}
          {status === 'ready' && preparedSession && (
            <dl>
              <div>
                <dt>Prepared session</dt>
                <dd>{preparedSession.sessionId}</dd>
              </div>
              <div>
                <dt>Credential expires</dt>
                <dd>{new Date(preparedSession.expiresAt).toLocaleTimeString()}</dd>
              </div>
              <div>
                <dt>WebRTC call endpoint</dt>
                <dd>{preparedSession.translationCallUrl}</dd>
              </div>
            </dl>
          )}
        </div>
        <p>
          The browser receives only a short-lived client secret. SimTalk still does not capture
          microphone audio or store transcripts in this step.
        </p>
      </section>
    </main>
  );
};
