import { useEffect } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST } from '../brand/primitives';

type TranscriptSheetProps = {
  readonly open: boolean;
  readonly title: string;
  readonly entries: ReadonlyArray<string>;
  readonly onClose: () => void;
  readonly onCopyAll?: () => void;
};

export const TranscriptSheet = ({
  open,
  title,
  entries,
  onClose,
  onCopyAll
}: TranscriptSheetProps) => {
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
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(6,10,46,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: ST.white,
          border: `3px solid ${ST.navy}`,
          borderRadius: 28,
          padding: 18,
          boxShadow: `0 10px 0 0 ${ST.navy}`,
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: ST.navy
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: '0.03em' }}>{title}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onCopyAll ? (
              <button
                type="button"
                onClick={onCopyAll}
                aria-label="Copy transcript"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  border: `2px solid ${ST.navy}`,
                  background: ST.white,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <STIcon name="copy" size={14} color={ST.navy} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transcript"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: `2px solid ${ST.navy}`,
                background: ST.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <STIcon name="x" size={16} color={ST.navy} />
            </button>
          </div>
        </div>
        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontFamily: FONT_BODY,
            fontSize: 15,
            lineHeight: 1.5
          }}
        >
          {entries.length === 0 ? (
            <p style={{ opacity: 0.55, margin: 0 }}>Nothing captured yet.</p>
          ) : (
            entries.map((line, i) => (
              <p key={i} style={{ margin: 0, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(11,17,73,0.08)' }}>
                {line}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
