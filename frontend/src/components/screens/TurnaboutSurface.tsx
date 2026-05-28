import { useEffect, useRef } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST } from '../brand/primitives';
import type { Language } from '../brand/languages';

export type ConversationTurn = {
  readonly id: string;
  readonly side: 'source' | 'target';
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
  readonly liveSrc: string;
  readonly liveDst: string;
  readonly busy?: boolean;
  readonly onFlip: () => void;
  readonly onStop: () => void;
  readonly onMicDown: () => void;
  readonly onMicUp: () => void;
};

const SpeakerBadge = ({
  lang,
  speaking
}: {
  readonly lang: Language;
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
    <span style={{ fontSize: 13, lineHeight: 1 }}>{lang.flag}</span>
    {lang.code}
  </span>
);

const Bubble = ({ turn }: { readonly turn: ConversationTurn }) => {
  const fromSource = turn.side === 'source';
  const hasSrc = turn.src.trim().length > 0;
  const hasDst = turn.dst.trim().length > 0;
  const translating = turn.status === 'translating';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: fromSource ? 'flex-end' : 'flex-start',
        gap: 6,
        marginBottom: 18,
        width: '100%',
        animation: 'st-fade-in 220ms ease-out both'
      }}
    >
      <SpeakerBadge lang={turn.srcLang} speaking={translating} />
      {hasSrc ? (
        <div
          style={{
            maxWidth: '78%',
            background: fromSource ? ST.pink : ST.white,
            color: fromSource ? ST.white : ST.navy,
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
          {turn.src}
        </div>
      ) : null}
      {hasDst || translating ? (
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
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span style={{ fontSize: 12 }}>{turn.dstLang.flag}</span>
            {translating && !hasDst ? 'translating…' : `${turn.dstLang.code}`}
          </div>
          {hasDst ? <div style={{ opacity: translating ? 0.85 : 1 }}>{turn.dst}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

export const TurnaboutSurface = ({
  source,
  target,
  activeSide,
  turns,
  recording,
  liveSrc,
  liveDst,
  busy = false,
  onFlip,
  onStop,
  onMicDown,
  onMicUp
}: TurnaboutSurfaceProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const speakerLang = activeSide === 'source' ? source : target;
  const listenerLang = activeSide === 'source' ? target : source;
  const showLivePreview = recording;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, liveSrc, liveDst]);

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
        {turns.length === 0 && !showLivePreview ? (
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
        ) : null}

        {turns.map((turn) => <Bubble key={turn.id} turn={turn} />)}

        {showLivePreview ? (
          <Bubble
            turn={{
              id: 'live-preview',
              side: activeSide,
              srcLang: speakerLang,
              dstLang: listenerLang,
              src: liveSrc,
              dst: liveDst,
              status: 'translating'
            }}
          />
        ) : null}
      </div>

      <div
        style={{
          background: ST.white,
          borderTop: `3px solid ${ST.navy}`,
          padding: '14px 16px 22px',
          color: ST.navy,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={onFlip}
            aria-label="Flip speaker sides"
            disabled={busy || recording}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: busy || recording ? 'rgba(43,230,242,0.4)' : ST.cyan,
              color: ST.navy,
              border: `3px solid ${ST.navy}`,
              borderRadius: 16,
              boxShadow: `0 4px 0 0 ${ST.navy}`,
              fontFamily: FONT_DISPLAY,
              fontSize: 14,
              letterSpacing: '0.06em',
              opacity: busy || recording ? 0.65 : 1,
              cursor: busy || recording ? 'not-allowed' : 'pointer'
            }}
          >
            <STIcon name="flip" size={16} color={ST.navy} />
            {busy ? 'SWITCHING…' : 'FLIP'}
          </button>
        </div>

        <div style={{ flex: 0, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop session"
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              border: `2px solid ${ST.navy}`,
              background: ST.white,
              boxShadow: `0 4px 0 0 ${ST.navy}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0
            }}
          >
            <STIcon name="stop" size={20} color={ST.navy} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: '0.06em' }}>
              {busy ? 'SWITCHING…' : recording ? 'LISTENING…' : 'HOLD TO TALK'}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              Speaker: {speakerLang.code} {speakerLang.flag}
            </div>
          </div>

          <button
            type="button"
            aria-label="Hold to talk"
            disabled={busy}
            onPointerDown={(event) => {
              if (busy) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onMicDown();
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              onMicUp();
            }}
            onPointerCancel={onMicUp}
            onContextMenu={(event) => event.preventDefault()}
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: busy ? 'rgba(255,62,158,0.4)' : recording ? ST.pinkDeep : ST.pink,
              border: `3px solid ${ST.navy}`,
              boxShadow: recording ? `0 2px 0 0 ${ST.navy}` : `0 6px 0 0 ${ST.navy}`,
              transform: recording ? 'translateY(4px)' : undefined,
              transition: 'transform 100ms cubic-bezier(.34,1.56,.64,1), box-shadow 100ms, background 80ms',
              color: ST.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              touchAction: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
              opacity: busy ? 0.6 : 1,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            <STIcon name="mic" size={28} color={ST.white} />
          </button>
        </div>
      </div>
    </div>
  );
};
