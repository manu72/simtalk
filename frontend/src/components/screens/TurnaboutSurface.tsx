import { useEffect, useRef } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';
import type { Language } from '../brand/languages';

export type ConversationTurn = {
  readonly id: string;
  readonly side: 'you' | 'them';
  readonly srcLang: Language;
  readonly dstLang: Language;
  readonly src: string;
  readonly dst: string;
  readonly status: 'translating' | 'done';
};

type TurnaboutSurfaceProps = {
  readonly source: Language;
  readonly target: Language;
  readonly activeSide: 'source' | 'target';
  readonly turns: ReadonlyArray<ConversationTurn>;
  readonly recording: boolean;
  readonly onFlip: () => void;
  readonly onMicDown: () => void;
  readonly onMicUp: () => void;
};

const SpeakerBadge = ({
  lang,
  you,
  speaking
}: {
  readonly lang: Language;
  readonly you: boolean;
  readonly speaking: boolean;
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: FONT_DISPLAY,
      fontSize: 11,
      letterSpacing: '0.06em',
      color: ST.navy,
      padding: '3px 10px',
      borderRadius: 999,
      background: lang.color,
      border: `2px solid ${ST.navy}`
    }}
  >
    {speaking ? (
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: ST.navy,
          animation: 'st-pulse-soft 900ms ease-in-out infinite'
        }}
      />
    ) : null}
    {you ? 'YOU' : 'THEM'} · {lang.code}
  </span>
);

const Bubble = ({ turn }: { readonly turn: ConversationTurn }) => {
  const fromYou = turn.side === 'you';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: fromYou ? 'flex-end' : 'flex-start',
        gap: 6,
        marginBottom: 18,
        width: '100%',
        animation: 'st-fade-in 220ms ease-out both'
      }}
    >
      <SpeakerBadge lang={turn.srcLang} you={fromYou} speaking={turn.status === 'translating'} />
      <div
        style={{
          maxWidth: '78%',
          background: fromYou ? ST.pink : ST.white,
          color: fromYou ? ST.white : ST.navy,
          border: `3px solid ${ST.navy}`,
          borderRadius: 18,
          padding: '10px 14px',
          boxShadow: `0 4px 0 0 ${ST.navy}`,
          fontFamily: FONT_BODY,
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.35
        }}
      >
        {turn.src || '…'}
      </div>
      <div
        style={{
          maxWidth: '78%',
          marginTop: 2,
          background: 'rgba(255,255,255,0.96)',
          color: ST.navy,
          border: `2px dashed ${ST.navy}`,
          borderRadius: 16,
          padding: '8px 12px',
          fontFamily: FONT_BODY,
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.35
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            opacity: 0.65,
            marginBottom: 4
          }}
        >
          {turn.status === 'translating' ? 'translating…' : `${turn.dstLang.code} · translated`}
        </div>
        <div style={{ opacity: turn.status === 'translating' ? 0.7 : 1 }}>{turn.dst || '…'}</div>
      </div>
    </div>
  );
};

export const TurnaboutSurface = ({
  source,
  target,
  activeSide,
  turns,
  recording,
  onFlip,
  onMicDown,
  onMicUp
}: TurnaboutSurfaceProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const speakerLang = activeSide === 'source' ? source : target;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 16px 8px',
          maxWidth: 560,
          width: '100%',
          margin: '0 auto'
        }}
      >
        {turns.length === 0 ? (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              fontFamily: FONT_DISPLAY,
              fontSize: 14,
              letterSpacing: '0.06em',
              color: ST.white,
              opacity: 0.7
            }}
          >
            HOLD THE MIC AND SPEAK.
            <br />
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>
              Pass the phone to flip sides.
            </span>
          </div>
        ) : (
          turns.map((turn) => <Bubble key={turn.id} turn={turn} />)
        )}
      </div>

      <div
        style={{
          background: ST.white,
          borderTop: `3px solid ${ST.navy}`,
          padding: '14px 16px 22px',
          color: ST.navy,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'space-between'
        }}
      >
        <button
          type="button"
          onClick={onFlip}
          aria-label="Flip speaker sides"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: ST.cyan,
            color: ST.navy,
            border: `3px solid ${ST.navy}`,
            borderRadius: 16,
            boxShadow: `0 4px 0 0 ${ST.navy}`,
            fontFamily: FONT_DISPLAY,
            fontSize: 14,
            letterSpacing: '0.06em'
          }}
        >
          <STIcon name="flip" size={16} color={ST.navy} />
          FLIP
        </button>

        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: '0.06em' }}>
            {recording ? 'LISTENING…' : 'HOLD TO TALK'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
            Speaker: {speakerLang.code} {speakerLang.flag}
          </div>
        </div>

        <STButton
          variant="primary"
          size="lg"
          onMouseDown={onMicDown}
          onMouseUp={onMicUp}
          onTouchStart={onMicDown}
          onTouchEnd={onMicUp}
          aria-label="Hold to talk"
          style={{ borderRadius: 999, padding: '14px 18px' }}
        >
          <STIcon name="mic" size={24} color={ST.white} />
        </STButton>
      </div>
    </div>
  );
};
