import { useMemo } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST, STButton, STCard } from '../brand/primitives';
import type { Language } from '../brand/languages';

export type PracticeStage = 'idle' | 'recording' | 'reviewing' | 'attempting' | 'revealed';

type PracticeSurfaceProps = {
  readonly source: Language;
  readonly target: Language;
  readonly stage: PracticeStage;
  readonly heardText: string;
  readonly modelTranslation: string;
  readonly attempt: string;
  readonly audioUrl: string | null;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onAttemptChange: (value: string) => void;
  readonly onSubmitAttempt: () => void;
  readonly onReveal: () => void;
  readonly onTryAgain: () => void;
  readonly onNextPhrase: () => void;
};

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();

const tokenize = (s: string): string[] => normalize(s).split(/\s+/).filter(Boolean);

type DiffToken = { readonly text: string; readonly match: boolean };

const diff = (attempt: string, reference: string): DiffToken[] => {
  const refSet = new Set(tokenize(reference));
  const attemptDisplay = attempt.split(/(\s+)/);
  return attemptDisplay
    .filter((t) => t.length > 0)
    .map((token) => {
      if (/^\s+$/.test(token)) return { text: token, match: true };
      const cleaned = normalize(token);
      return { text: token, match: cleaned.length > 0 && refSet.has(cleaned) };
    });
};

const COACHING: Record<PracticeStage, string> = {
  idle: 'Tap record and say something in your language.',
  recording: 'Listening… speak naturally, then tap stop.',
  reviewing: "Here's what we heard. Now try translating it yourself.",
  attempting: 'Type your guess, then reveal the answer.',
  revealed: 'Compare and try again, or move on to a new phrase.'
};

export const PracticeSurface = ({
  source,
  target,
  stage,
  heardText,
  modelTranslation,
  attempt,
  audioUrl,
  onStartRecording,
  onStopRecording,
  onAttemptChange,
  onSubmitAttempt,
  onReveal,
  onTryAgain,
  onNextPhrase
}: PracticeSurfaceProps) => {
  const diffTokens = useMemo(
    () => (stage === 'revealed' ? diff(attempt, modelTranslation) : []),
    [stage, attempt, modelTranslation]
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 18px 28px',
        gap: 16,
        color: ST.white,
        maxWidth: 560,
        width: '100%',
        margin: '0 auto'
      }}
    >
      <p
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 13,
          letterSpacing: '0.08em',
          color: ST.white,
          opacity: 0.85,
          margin: 0,
          textAlign: 'center'
        }}
      >
        {COACHING[stage]}
      </p>

      <STCard tone="white" padding={18}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            letterSpacing: '0.08em',
            color: ST.navy,
            opacity: 0.7,
            marginBottom: 6
          }}
        >
          YOU SAID · {source.code}
        </div>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.4,
            color: ST.navy,
            minHeight: 28
          }}
        >
          {heardText || (stage === 'recording' ? 'Listening…' : '—')}
        </div>

        {audioUrl && stage !== 'idle' && stage !== 'recording' ? (
          <audio
            controls
            src={audioUrl}
            style={{
              marginTop: 10,
              width: '100%',
              borderRadius: 12
            }}
          />
        ) : null}

        {stage === 'attempting' || stage === 'revealed' ? (
          <>
            <hr style={{ border: 'none', borderTop: `2px dashed ${ST.navy}`, opacity: 0.25, margin: '14px 0' }} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 12,
                letterSpacing: '0.08em',
                color: ST.navy,
                opacity: 0.7,
                marginBottom: 6
              }}
            >
              YOUR ATTEMPT · {target.code}
            </div>
            {stage === 'attempting' ? (
              <textarea
                value={attempt}
                onChange={(event) => onAttemptChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    onSubmitAttempt();
                  }
                }}
                placeholder={`Say it in ${target.name}…`}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `2px solid ${ST.navy}`,
                  borderRadius: 14,
                  background: 'rgba(11,17,73,0.04)',
                  color: ST.navy,
                  fontFamily: FONT_BODY,
                  fontSize: 16,
                  fontWeight: 500,
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            ) : (
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 16,
                  fontWeight: 500,
                  color: ST.navy,
                  lineHeight: 1.45,
                  minHeight: 24
                }}
              >
                {attempt
                  ? diffTokens.map((tok, i) => (
                      <span
                        key={i}
                        style={{
                          background: tok.match ? 'rgba(43,230,242,0.4)' : 'rgba(255,62,158,0.25)',
                          borderRadius: 4,
                          padding: '1px 2px'
                        }}
                      >
                        {tok.text}
                      </span>
                    ))
                  : <span style={{ opacity: 0.5 }}>—</span>}
              </div>
            )}
          </>
        ) : null}

        {stage === 'revealed' ? (
          <>
            <hr style={{ border: 'none', borderTop: `2px dashed ${ST.navy}`, opacity: 0.25, margin: '14px 0' }} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 12,
                letterSpacing: '0.08em',
                color: ST.navy,
                opacity: 0.7,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>MODEL TRANSLATION · {target.code}</span>
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.4,
                color: ST.navy
              }}
            >
              {modelTranslation || '…'}
            </div>
          </>
        ) : null}
      </STCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        {stage === 'idle' ? (
          <STButton variant="primary" size="lg" full onClick={onStartRecording} icon="mic">
            Tap to Record
          </STButton>
        ) : null}

        {stage === 'recording' ? (
          <STButton variant="primary" size="lg" full onClick={onStopRecording} icon="stop">
            Stop Recording
          </STButton>
        ) : null}

        {stage === 'reviewing' ? (
          <>
            <STButton variant="secondary" size="lg" full onClick={onSubmitAttempt} icon="keyboard">
              Type your guess
            </STButton>
            <button
              type="button"
              onClick={onReveal}
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 13,
                color: ST.white,
                opacity: 0.7,
                background: 'transparent',
                border: 'none',
                letterSpacing: '0.06em'
              }}
            >
              Skip → reveal answer
            </button>
          </>
        ) : null}

        {stage === 'attempting' ? (
          <STButton variant="primary" size="lg" full onClick={onReveal} icon="check">
            Reveal Answer
          </STButton>
        ) : null}

        {stage === 'revealed' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <STButton variant="secondary" size="md" full onClick={onTryAgain} icon="rotate">
              Try Again
            </STButton>
            <STButton variant="primary" size="md" full onClick={onNextPhrase} icon="arrow-right">
              Next Phrase
            </STButton>
          </div>
        ) : null}
      </div>

      <p
        style={{
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.55,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        <STIcon name="spark" size={12} color={ST.white} />
        {source.name} → {target.name}
      </p>
    </div>
  );
};
