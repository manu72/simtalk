import { useEffect } from 'react';

import type { RealtimeTokenResponse } from '@simtalk/shared-types';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST } from '../brand/primitives';

type DevDrawerProps = {
  readonly open: boolean;
  readonly token: RealtimeTokenResponse | null;
  readonly status: string;
  readonly recordingStatus: string;
  readonly recentDeltas: ReadonlyArray<string>;
  readonly onClose: () => void;
};

const Row = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <div style={{ display: 'grid', gap: 2, marginBottom: 10 }}>
    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: '0.08em', opacity: 0.6 }}>
      {label}
    </div>
    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, wordBreak: 'break-all' }}>
      {value || '—'}
    </div>
  </div>
);

export const DevDrawer = ({
  open,
  token,
  status,
  recordingStatus,
  recentDeltas,
  onClose
}: DevDrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Developer details"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6,10,46,0.5)',
        display: 'flex',
        justifyContent: 'flex-end'
      }}
    >
      <aside
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          height: '100%',
          background: ST.navy,
          color: ST.white,
          borderLeft: `3px solid ${ST.navyDeep}`,
          padding: 20,
          overflowY: 'auto',
          fontFamily: FONT_BODY
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: '0.04em' }}>DEV DRAWER</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close developer drawer"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              color: ST.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <STIcon name="x" size={14} color={ST.white} />
          </button>
        </div>

        <Row label="UI STATUS" value={status} />
        <Row label="RECORDING" value={recordingStatus} />
        <Row label="SESSION ID" value={token?.sessionId ?? ''} />
        <Row label="CREDENTIAL EXPIRES" value={token ? new Date(token.expiresAt).toLocaleString() : ''} />
        <Row label="SESSION EXPIRES" value={token ? new Date(token.sessionExpiresAt).toLocaleString() : ''} />
        <Row label="WEBRTC ENDPOINT" value={token?.translationCallUrl ?? ''} />

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: '0.08em', opacity: 0.7, marginBottom: 8 }}>
            RECENT TRANSCRIPT DELTAS
          </div>
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: 10,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              lineHeight: 1.5,
              maxHeight: 240,
              overflowY: 'auto'
            }}
          >
            {recentDeltas.length === 0 ? (
              <span style={{ opacity: 0.5 }}>(none yet)</span>
            ) : (
              recentDeltas.map((line, i) => (
                <div key={i} style={{ marginBottom: 2 }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        <p style={{ marginTop: 18, fontSize: 12, opacity: 0.55 }}>
          Toggle with <kbd>Alt+D</kbd> or <code>?dev=1</code>. Hidden in production view.
        </p>
      </aside>
    </div>
  );
};
