import { useEffect, useMemo, useRef, useState } from 'react';

import { STIcon } from './Icons';
import { FONT_BODY, FONT_DISPLAY, ST } from './primitives';
import { LANGUAGES, type Language } from './languages';

type LangCardProps = {
  readonly label: string;
  readonly lang: Language;
  readonly onPick: () => void;
};

export const LangCard = ({ label, lang, onPick }: LangCardProps) => (
  <button
    type="button"
    onClick={onPick}
    style={{
      flex: 1,
      minWidth: 0,
      background: ST.white,
      border: `3px solid ${ST.navy}`,
      borderRadius: 22,
      padding: '14px 14px 16px',
      boxShadow: `0 6px 0 0 ${ST.navy}`,
      textAlign: 'left',
      color: ST.navy,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontFamily: FONT_BODY
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
        {label}
      </span>
      <STIcon name="caret-right" size={14} color={ST.navy} style={{ opacity: 0.5 }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          background: lang.color,
          border: `3px solid ${ST.navy}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0
        }}
      >
        {lang.flag}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, lineHeight: 1, letterSpacing: '0.02em' }}>
          {lang.code}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            opacity: 0.7,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {lang.name}
        </div>
      </div>
    </div>
  </button>
);

type LanguagePickerSheetProps = {
  readonly open: boolean;
  readonly value: Language;
  readonly onPick: (lang: Language) => void;
  readonly onClose: () => void;
  readonly title?: string;
  readonly languages?: ReadonlyArray<Language>;
};

export const LanguagePickerSheet = ({
  open,
  value,
  onPick,
  onClose,
  title = 'PICK LANGUAGE',
  languages = LANGUAGES
}: LanguagePickerSheetProps) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter((lang) => {
      const code = lang.code.toLowerCase();
      const name = lang.name.toLowerCase();
      return code.startsWith(q) || name.startsWith(q);
    });
  }, [languages, query]);

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
        zIndex: 100,
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
          maxWidth: 480,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: ST.navy
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: '0.03em' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close language picker"
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
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by code or name"
          aria-label="Filter languages"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: `2px solid ${ST.navy}`,
            borderRadius: 12,
            fontFamily: FONT_BODY,
            fontSize: 14,
            color: ST.navy,
            background: ST.white,
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '12px',
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: ST.navy,
                opacity: 0.6,
                textAlign: 'center'
              }}
            >
              No languages match "{query}"
            </div>
          ) : null}
          {filtered.map((lang) => {
            const active = lang.code === value.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => onPick(lang)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: active ? lang.color : 'rgba(11,17,73,0.04)',
                  border: `2px solid ${active ? ST.navy : 'transparent'}`,
                  borderRadius: 14,
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 24 }}>{lang.flag}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 1, color: ST.navy }}>
                    {lang.code} · {lang.name}
                  </div>
                </div>
                {active ? <STIcon name="check" size={16} color={ST.navy} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
