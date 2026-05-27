import { useEffect, useRef, useState } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';

type AccessGateModalProps = {
  readonly open: boolean;
  readonly errorMessage: string | null;
  readonly onSubmit: (password: string) => void;
  readonly onClose: () => void;
};

export const AccessGateModal = ({ open, errorMessage, onSubmit, onClose }: AccessGateModalProps) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setValue('');
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = value.trim();
  const submitDisabled = trimmed.length === 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitDisabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Access required"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        // The access gate must always sit above every other modal in the app:
        // without auth, nothing else functions, so it has to remain reachable
        // even when triggered from inside the camera translate modal, the
        // language picker, the dev drawer, the remote-name modal, or any
        // future overlay. Keep this strictly higher than every other zIndex
        // used in this app (camera/dev drawer at 200, language picker at 100,
        // remote-name at 90, FAB at 50).
        zIndex: 300,
        background: 'rgba(6,10,46,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: ST.white,
          border: `3px solid ${ST.navy}`,
          borderRadius: 28,
          padding: 22,
          boxShadow: `0 10px 0 0 ${ST.navy}`,
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          color: ST.navy
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: '0.03em' }}>
            ACCESS REQUIRED
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close access dialog"
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

        <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 14, opacity: 0.75 }}>
          Enter the shared test password to continue.
        </p>

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            letterSpacing: '0.08em'
          }}
        >
          PASSWORD
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 16,
              padding: '10px 12px',
              borderRadius: 14,
              border: `2px solid ${ST.navy}`,
              background: ST.white,
              color: ST.navy
            }}
          />
        </label>

        {errorMessage ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 700,
              color: ST.danger
            }}
          >
            {errorMessage}
          </p>
        ) : null}

        <STButton type="submit" variant="primary" size="md" full disabled={submitDisabled}>
          Continue
        </STButton>
      </form>
    </div>
  );
};
