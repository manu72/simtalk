import { conversationModes, type ConversationMode } from '@simtalk/shared-types';

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

export const App = () => (
  <main className="app-shell">
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">Private Phase 1 prototype</p>
      <h1 id="hero-title">SimTalk</h1>
      <p className="hero-copy">
        Speak naturally. Hear instantly. This scaffold keeps secrets on the backend and leaves
        audio, transcripts, and recordings in the browser.
      </p>
      <a className="skip-link" href="#conversation-modes">
        Review conversation modes
      </a>
    </section>

    <section className="panel" aria-labelledby="conversation-modes">
      <div>
        <p className="eyebrow">Conversation modes</p>
        <h2 id="conversation-modes">Choose the workflow to validate first</h2>
      </div>

      <div className="mode-grid">
        {conversationModes.map((mode) => (
          <article className="mode-card" key={mode}>
            <h3>{modeLabels[mode]}</h3>
            <p>{modeDescriptions[mode]}</p>
            <button type="button">Prepare {modeLabels[mode]}</button>
          </article>
        ))}
      </div>
    </section>

    <section className="panel status-panel" aria-labelledby="privacy-title">
      <div>
        <p className="eyebrow">Privacy baseline</p>
        <h2 id="privacy-title">Recording is off by default</h2>
      </div>
      <p>
        The first implementation step after this scaffold should ask for explicit microphone
        permission and explicit recording consent before capturing audio.
      </p>
    </section>
  </main>
);
