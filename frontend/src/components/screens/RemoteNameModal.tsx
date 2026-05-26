import { useEffect, useRef, useState } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';

export const REMOTE_DISPLAY_NAME_MAX_LENGTH = 10;

type RemoteNameModalProps = {
  readonly open: boolean;
  readonly defaultValue?: string;
  readonly onSubmit: (displayName: string) => void;
  readonly onClose: () => void;
};

export const RemoteNameModal = ({
  open,
  defaultValue = '',
  onSubmit,
  onClose
}: RemoteNameModalProps) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset to the latest defaultValue every time the modal opens. This keeps the
  // pre-fill behaviour predictable when the user re-enters the name flow (e.g.
  // after the access gate succeeds) without leaking stale state when the modal
  // is closed and re-opened with a different default.
  useEffect(() => {
    if (!open) {
      setValue(defaultValue);
      return;
    }
    setValue(defaultValue);
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => window.removeEventListener('keydown', handler);
  }, [open, defaultValue, onClose]);

  if (!open) return null;

  const trimmed = value.trim();
  // Schema permits up to 80, but the room UI caps at 10 so the name fits the
  // tile pill. The schema acts as a loose backstop, not the user-facing limit.
  const submitDisabled = trimmed.length === 0 || trimmed.length > REMOTE_DISPLAY_NAME_MAX_LENGTH;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitDisabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a name for this room"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
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
            YOUR NAME
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close name dialog"
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
          Shown to the other person in this room. Up to {REMOTE_DISPLAY_NAME_MAX_LENGTH} characters.
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
          NAME
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="given-name"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={REMOTE_DISPLAY_NAME_MAX_LENGTH}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="remote-name-hint"
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

        <p
          id="remote-name-hint"
          aria-live="polite"
          style={{
            margin: 0,
            fontFamily: FONT_BODY,
            fontSize: 12,
            opacity: 0.6,
            textAlign: 'right'
          }}
        >
          {trimmed.length}/{REMOTE_DISPLAY_NAME_MAX_LENGTH}
        </p>

        <STButton type="submit" variant="primary" size="md" full disabled={submitDisabled} icon="mic">
          Join Room
        </STButton>
      </form>
    </div>
  );
};
