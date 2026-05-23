import type { ConversationMode } from '@simtalk/shared-types';

import { STIcon, type IconName } from './Icons';
import { FONT_DISPLAY, ST } from './primitives';

const MODES: ReadonlyArray<{ readonly id: ConversationMode; readonly label: string; readonly icon: IconName }> = [
  { id: 'listener',  label: 'LISTEN',   icon: 'headphones' },
  { id: 'turnabout', label: 'TALK',     icon: 'swap' },
  { id: 'practice',  label: 'PRACTICE', icon: 'spark' }
];

type ModeSegmentedProps = {
  readonly value: ConversationMode;
  readonly onChange: (mode: ConversationMode) => void;
};

export const ModeSegmented = ({ value, onChange }: ModeSegmentedProps) => (
  <div
    role="radiogroup"
    aria-label="Conversation mode"
    style={{
      display: 'flex',
      gap: 6,
      background: 'rgba(255,255,255,0.10)',
      padding: 4,
      borderRadius: 999,
      border: '2px solid rgba(255,255,255,0.18)'
    }}
  >
    {MODES.map((mode) => {
      const active = mode.id === value;
      return (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(mode.id)}
          style={{
            flex: 1,
            padding: '10px 6px',
            borderRadius: 999,
            background: active ? ST.pink : 'transparent',
            color: ST.white,
            border: active ? `2px solid ${ST.navy}` : '2px solid transparent',
            boxShadow: active ? `0 3px 0 0 ${ST.navy}` : 'none',
            fontFamily: FONT_DISPLAY,
            fontSize: 14,
            letterSpacing: '0.06em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'background 120ms, box-shadow 120ms'
          }}
        >
          <STIcon name={mode.icon} size={14} color={ST.white} />
          {mode.label}
        </button>
      );
    })}
  </div>
);
