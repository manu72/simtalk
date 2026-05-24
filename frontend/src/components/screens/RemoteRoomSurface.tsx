import { useState } from 'react';

import { STIcon } from '../brand/Icons';
import { LangCard, LanguagePickerSheet } from '../brand/LanguagePicker';
import { AUTO_LANGUAGE, LANGUAGES, type Language } from '../brand/languages';
import { FONT_BODY, FONT_DISPLAY, ST, STButton, STCard, STTitle } from '../brand/primitives';

export type RemoteRoomStatus = 'idle' | 'joining' | 'live' | 'error';

type RemoteRoomSurfaceProps = {
  readonly roomId: string;
  readonly roomUrl: string;
  readonly source: Language;
  readonly target: Language;
  readonly status: RemoteRoomStatus;
  readonly participantCount: number;
  readonly translatedCaption: string;
  readonly originalAudioMuted: boolean;
  readonly errorMessage: string | null;
  readonly onChangeSource: (language: Language) => void;
  readonly onChangeTarget: (language: Language) => void;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onToggleOriginalAudio: () => void;
  readonly onCopyLink: () => void;
};

const STATUS_LABELS: Record<RemoteRoomStatus, string> = {
  idle: 'Ready to join',
  joining: 'Joining room...',
  live: 'Room live',
  error: 'Needs attention'
};

export const RemoteRoomSurface = ({
  roomId,
  roomUrl,
  source,
  target,
  status,
  participantCount,
  translatedCaption,
  originalAudioMuted,
  errorMessage,
  onChangeSource,
  onChangeTarget,
  onJoin,
  onLeave,
  onToggleOriginalAudio,
  onCopyLink
}: RemoteRoomSurfaceProps) => {
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);
  const isLive = status === 'live';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: ST.white
      }}
    >
      <section
        aria-labelledby="remote-room-title"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          padding: '24px 20px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: FONT_DISPLAY,
              fontSize: 12,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              opacity: 0.8
            }}
          >
            Private two-person room
          </p>
          <STTitle id="remote-room-title" as="h1" size={44} stroke={3} shadow={5}>
            Remote Talk.
          </STTitle>
        </div>

        <STCard tone="white" padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    color: ST.navy,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    opacity: 0.7
                  }}
                >
                  ROOM
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    color: ST.navy,
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    fontWeight: 700,
                    overflowWrap: 'anywhere'
                  }}
                >
                  {roomId}
                </p>
              </div>
              <button
                type="button"
                onClick={onCopyLink}
                aria-label="Copy room link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: `2px solid ${ST.navy}`,
                  borderRadius: 999,
                  padding: '8px 12px',
                  color: ST.navy,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 12,
                  letterSpacing: '0.06em'
                }}
              >
                <STIcon name="copy" size={14} color={ST.navy} />
                Copy link
              </button>
            </div>

            <p
              style={{
                margin: 0,
                color: ST.navy,
                opacity: 0.65,
                fontSize: 12,
                lineHeight: 1.5,
                overflowWrap: 'anywhere'
              }}
            >
              {roomUrl}
            </p>
          </div>
        </STCard>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <LangCard label="They speak" lang={source} onPick={() => setPicker('source')} />
          <LangCard label="You hear" lang={target} onPick={() => setPicker('target')} />
        </div>

        <STCard tone="glass" padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    opacity: 0.75
                  }}
                >
                  {STATUS_LABELS[status]}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                  {participantCount + 1} of 2 participants visible to this browser.
                </p>
              </div>
              <span
                aria-label={isLive ? 'Live' : 'Waiting'}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: isLive ? ST.success : ST.yellow,
                  border: `2px solid ${ST.white}`,
                  boxShadow: isLive ? `0 0 18px ${ST.successGlow}` : 'none'
                }}
              />
            </div>

            <div
              aria-live="polite"
              style={{
                minHeight: 112,
                padding: '14px 16px',
                borderRadius: 18,
                border: '2px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.06)',
                fontFamily: FONT_BODY,
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.35,
                opacity: translatedCaption ? 1 : 0.55
              }}
            >
              {translatedCaption || 'Translated captions from the other person will appear here.'}
            </div>

            {errorMessage ? (
              <div
                role="alert"
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: `2px solid ${ST.danger}`,
                  background: ST.dangerSoft,
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                {errorMessage}
              </div>
            ) : null}
          </div>
        </STCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
          {!isLive ? (
            <STButton variant="primary" size="lg" full onClick={onJoin} disabled={status === 'joining'} icon="mic">
              {status === 'joining' ? 'Joining...' : 'Join Room'}
            </STButton>
          ) : (
            <>
              <STButton variant="secondary" size="md" full onClick={onToggleOriginalAudio} icon="headphones">
                {originalAudioMuted ? 'Original Muted' : 'Mute Original'}
              </STButton>
              <STButton variant="dark" size="lg" full onClick={onLeave} icon="stop">
                Leave Room
              </STButton>
            </>
          )}
        </div>

        <LanguagePickerSheet
          open={picker === 'source'}
          value={source}
          onPick={(language) => {
            onChangeSource(language);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          title="THEY SPEAK"
          languages={[AUTO_LANGUAGE, ...LANGUAGES]}
        />
        <LanguagePickerSheet
          open={picker === 'target'}
          value={target}
          onPick={(language) => {
            onChangeTarget(language);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          title="YOU HEAR"
        />
      </section>
    </main>
  );
};
