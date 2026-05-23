import { useMemo } from 'react';

import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';
import type { Language } from '../brand/languages';

type ListenerSurfaceProps = {
  readonly target: Language;
  readonly liveText: string;
  readonly history: ReadonlyArray<string>;
  readonly isStreaming: boolean;
  readonly onPause: () => void;
  readonly onOpenTranscript: () => void;
};

const splitIntoSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/g)
    .map((line) => line.trim())
    .filter(Boolean);

export const ListenerSurface = ({
  target,
  liveText,
  history,
  isStreaming,
  onPause,
  onOpenTranscript
}: ListenerSurfaceProps) => {
  const liveCaption = useMemo(() => {
    const sentences = splitIntoSentences(liveText);
    return sentences.slice(-2).join(' ');
  }, [liveText]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 20px 32px',
        gap: 18,
        color: ST.white,
        maxWidth: 520,
        width: '100%',
        margin: '0 auto'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0 4px',
          gap: 16
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 140,
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              background: ST.cyan,
              opacity: isStreaming ? 0.18 : 0.08,
              boxShadow: 'var(--st-halo-cyan)',
              animation: 'st-pulse-soft 2.6s ease-in-out infinite'
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: 20,
              borderRadius: 999,
              background: ST.cyan,
              opacity: isStreaming ? 0.35 : 0.16,
              animation: 'st-pulse-soft 2s ease-in-out infinite reverse'
            }}
          />
          <span
            style={{
              position: 'relative',
              width: 64,
              height: 64,
              borderRadius: 999,
              background: ST.cyan,
              border: `3px solid ${ST.navy}`,
              boxShadow: `0 4px 0 0 ${ST.navy}`,
              fontFamily: FONT_DISPLAY,
              color: ST.navy,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              letterSpacing: '0.04em'
            }}
          >
            {target.code}
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 13,
            letterSpacing: '0.10em',
            color: ST.white,
            opacity: 0.8
          }}
        >
          {isStreaming ? 'TRANSLATING…' : 'LISTENING…'}
        </span>
      </div>

      <div
        aria-live="polite"
        style={{
          fontFamily: FONT_BODY,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.3,
          minHeight: 120,
          textAlign: 'center',
          padding: '0 4px',
          opacity: liveCaption ? 1 : 0.4,
          transition: 'opacity 200ms'
        }}
      >
        {liveCaption || 'Waiting for incoming speech…'}
      </div>

      <button
        type="button"
        onClick={onOpenTranscript}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.06)',
          border: '2px solid rgba(255,255,255,0.14)',
          borderRadius: 22,
          padding: '14px 16px',
          textAlign: 'left',
          color: ST.white,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            letterSpacing: '0.10em',
            opacity: 0.7
          }}
        >
          TRANSLATED TRANSCRIPT · TAP TO EXPAND
        </span>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            opacity: 0.85,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          {history.length === 0 ? (
            <span style={{ opacity: 0.5 }}>Translations will land here as they arrive.</span>
          ) : (
            history.slice(-6).map((line, i) => (
              <span key={i} style={{ opacity: 0.5 + (i / 6) * 0.5 }}>
                {line}
              </span>
            ))
          )}
        </div>
      </button>

      <STButton variant="secondary" size="lg" full onClick={onPause} icon="pause">
        Pause Listening
      </STButton>
    </div>
  );
};
