import { useEffect, useState } from 'react';

import type { ConversationMode } from '@simtalk/shared-types';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, LiveDot, ST } from '../brand/primitives';
import type { Language } from '../brand/languages';

type SessionHeaderProps = {
  readonly mode: ConversationMode;
  readonly source: Language | null;
  readonly target: Language;
  readonly activeSide?: 'source' | 'target';
  readonly status: 'connecting' | 'live' | 'paused' | 'idle';
  readonly onExit: () => void;
  readonly onToggleDev?: () => void;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const SessionHeader = ({
  mode,
  source,
  target,
  activeSide,
  status,
  onExit,
  onToggleDev
}: SessionHeaderProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'live') return;
    const start = Date.now() - elapsed * 1000;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const isListener = mode === 'listener';

  return (
    <header
      style={{
        padding: '12px 16px',
        background: ST.white,
        borderBottom: `3px solid ${ST.navy}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: FONT_BODY,
        color: ST.navy
      }}
    >
      <button
        type="button"
        onClick={onExit}
        aria-label="End session"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          border: `2px solid ${ST.navy}`,
          background: ST.white,
          boxShadow: `0 3px 0 0 ${ST.navy}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <STIcon name="x" size={16} color={ST.navy} />
      </button>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isListener ? (
            <div
              aria-label="Auto-detect any language"
              title="Auto-detect any language"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: ST.cyan,
                border: `2px solid ${ST.navy}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <STIcon name="headphones" size={14} color={ST.navy} />
            </div>
          ) : source ? (
            <span
              style={{
                fontSize: 22,
                lineHeight: 1,
                opacity: activeSide === 'source' ? 1 : 0.5,
                filter: activeSide === 'source' ? 'none' : 'saturate(0.7)'
              }}
            >
              {source.flag}
            </span>
          ) : null}
          <STIcon name={isListener ? 'arrow-right' : 'swap'} size={14} color={ST.navy} style={{ opacity: 0.6 }} />
          <span
            style={{
              fontSize: 22,
              lineHeight: 1,
              opacity: activeSide === undefined || activeSide === 'target' ? 1 : 0.5
            }}
          >
            {target.flag}
          </span>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, lineHeight: 1, letterSpacing: '0.03em' }}>
            {isListener ? `AUTO → ${target.code}` : `${source?.code ?? '??'} ↔ ${target.code}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {status === 'live' ? <LiveDot color="#34D27A" /> : null}
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
              {status === 'connecting' && 'CONNECTING…'}
              {status === 'live' && `LIVE · ${formatDuration(elapsed)}`}
              {status === 'paused' && 'PAUSED'}
              {status === 'idle' && 'READY'}
            </span>
          </div>
        </div>
      </div>

      {onToggleDev ? (
        <button
          type="button"
          onClick={onToggleDev}
          aria-label="Toggle developer drawer"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: `2px solid ${ST.navy}`,
            background: ST.white,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <STIcon name="info" size={18} color={ST.navy} />
        </button>
      ) : null}
    </header>
  );
};
