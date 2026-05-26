import { useState } from 'react';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

import { STIcon } from '../brand/Icons';
import { LangCard, LanguagePickerSheet } from '../brand/LanguagePicker';
import { AUTO_LANGUAGE, LANGUAGES, type Language } from '../brand/languages';

// AUTO ("Automatic" / language detection) is offered as a THEY SPEAK option
// so a single user can prepare a room before the partner arrives without
// committing to a specific source language. YOU HEAR stays restricted to
// concrete languages (translated audio always has a destination).
const SOURCE_LANGUAGES: ReadonlyArray<Language> = [AUTO_LANGUAGE, ...LANGUAGES];
import { FONT_BODY, FONT_DISPLAY, ST, STButton, STCard, STTitle } from '../brand/primitives';
import { VideoTile } from '../brand/VideoTile';

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
  readonly localDisplayName: string;
  readonly remoteDisplayName: string | null;
  readonly localVideoTrack: LocalVideoTrack | null;
  readonly remoteVideoTrack: RemoteVideoTrack | null;
  readonly localMicMuted: boolean;
  readonly localCameraEnabled: boolean;
  readonly remoteMicMuted: boolean;
  readonly remoteIsSpeaking: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onToggleOriginalAudio: () => void;
  readonly onToggleLocalMic: () => void;
  readonly onToggleLocalCamera: () => void;
  readonly onCopyLink: () => void;
  readonly onChangeSource: (lang: Language) => void;
  readonly onChangeTarget: (lang: Language) => void;
};

const STATUS_LABELS: Record<RemoteRoomStatus, string> = {
  idle: 'Ready to join',
  joining: 'Joining room...',
  live: 'Room live',
  error: 'Needs attention'
};

const PageShell = ({ children }: { readonly children: React.ReactNode }) => (
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
      {children}
    </section>
  </main>
);

const Header = () => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          opacity: 0.85,
          textTransform: 'uppercase',
          letterSpacing: '0.10em'
        }}
      >
        Private two-person room
      </span>
      <div style={{ marginTop: 10 }}>
        <STTitle id="remote-room-title" as="h1" size={56} stroke={4} shadow={6}>
          Remote Talk.
        </STTitle>
      </div>
    </div>
    <a href="/" aria-label="SimTalk home" style={{ flexShrink: 0, marginTop: 4, lineHeight: 0 }}>
      <img
        src="/rocket-logo_100x132.png"
        alt=""
        aria-hidden="true"
        width={100}
        height={132}
        style={{ width: 100, height: 'auto' }}
      />
    </a>
  </div>
);

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
  localDisplayName,
  remoteDisplayName,
  localVideoTrack,
  remoteVideoTrack,
  localMicMuted,
  localCameraEnabled,
  remoteMicMuted,
  remoteIsSpeaking,
  onJoin,
  onLeave,
  onToggleOriginalAudio,
  onToggleLocalMic,
  onToggleLocalCamera,
  onCopyLink,
  onChangeSource,
  onChangeTarget
}: RemoteRoomSurfaceProps) => {
  const isLive = status === 'live';
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);

  if (isLive) {
    const totalInRoom = Math.min(2, participantCount + 1);
    const remoteName = remoteDisplayName ?? 'Other participant';
    const captionAttribution = remoteDisplayName
      ? `${remoteName.toUpperCase()} · TRANSLATED FROM ${source.name.toUpperCase()}`
      : `TRANSLATED FROM ${source.name.toUpperCase()}`;

    return (
      <PageShell>
        <Header />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 10
          }}
        >
          <VideoTile
            tone="pink"
            displayName={localDisplayName || 'You'}
            language={target}
            isLocal={true}
            isMicMuted={localMicMuted}
            isSpeaking={false}
            videoTrack={localVideoTrack}
            onToggleMic={onToggleLocalMic}
            onLanguageClick={() => setPicker('target')}
          />
          <VideoTile
            tone="teal"
            displayName={remoteName}
            language={source}
            isLocal={false}
            isMicMuted={remoteMicMuted}
            isSpeaking={remoteIsSpeaking}
            videoTrack={remoteVideoTrack}
            waiting={remoteDisplayName === null}
          />
        </div>

        <STCard tone="glass" padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    opacity: 0.75
                  }}
                >
                  ROOM LIVE
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                  {totalInRoom} of 2 in the room.
                </p>
              </div>
              <span
                aria-label="Live"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 12,
                  letterSpacing: '0.08em'
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: ST.success,
                    boxShadow: `0 0 14px ${ST.successGlow}`
                  }}
                />
                LIVE
              </span>
            </div>

            <div
              aria-live="polite"
              style={{
                minHeight: 96,
                padding: '14px 16px',
                borderRadius: 18,
                border: '2px dashed rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.04)',
                fontFamily: FONT_BODY,
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.4,
                opacity: translatedCaption ? 1 : 0.55
              }}
            >
              {translatedCaption ? (
                <>
                  <p style={{ margin: 0 }}>&ldquo;{translatedCaption}&rdquo;</p>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontFamily: FONT_DISPLAY,
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      opacity: 0.7
                    }}
                  >
                    {captionAttribution}
                  </p>
                </>
              ) : (
                'Translated captions from the other person will appear here.'
              )}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={onToggleLocalMic}
              aria-label={localMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-pressed={localMicMuted}
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: localMicMuted ? ST.white : ST.cyan,
                border: `3px solid ${ST.navy}`,
                boxShadow: `0 4px 0 0 ${ST.navy}`,
                color: ST.navy,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: 'pointer'
              }}
            >
              <STIcon name={localMicMuted ? 'mic-off' : 'mic'} size={24} color={ST.navy} />
            </button>
            <button
              type="button"
              onClick={onToggleLocalCamera}
              aria-label={localCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              aria-pressed={localCameraEnabled}
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: localCameraEnabled ? ST.cyan : ST.white,
                border: `3px solid ${ST.navy}`,
                boxShadow: `0 4px 0 0 ${ST.navy}`,
                color: ST.navy,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: 'pointer'
              }}
            >
              <STIcon
                name={localCameraEnabled ? 'video' : 'video-off'}
                size={24}
                color={ST.navy}
              />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <STButton
                variant="secondary"
                size="md"
                full
                onClick={onToggleOriginalAudio}
                icon="headphones"
              >
                {originalAudioMuted ? 'Original Muted' : 'Mute Original'}
              </STButton>
            </div>
          </div>
          <STButton variant="dark" size="lg" full onClick={onLeave} icon="x">
            Leave Room
          </STButton>
        </div>

        <LanguagePickerSheet
          open={picker === 'target'}
          value={target}
          onPick={(lang) => {
            onChangeTarget(lang);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          title="YOU HEAR"
        />
      </PageShell>
    );
  }

  // Pre-join state (idle | joining | error)
  return (
    <PageShell>
      <Header />

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
              aria-label="Waiting"
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: ST.yellow,
                border: `2px solid ${ST.white}`
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
              opacity: 0.55
            }}
          >
            Translated captions from the other person will appear here.
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <STButton
          variant="primary"
          size="lg"
          full
          onClick={onJoin}
          disabled={status === 'joining'}
          icon="mic"
        >
          {status === 'joining' ? 'Joining...' : 'Join Room'}
        </STButton>
        <STButton
          variant="dark"
          size="md"
          full
          onClick={onLeave}
          icon="x"
          disabled={status === 'joining'}
        >
          Cancel
        </STButton>
      </div>

      <LanguagePickerSheet
        open={picker === 'source'}
        value={source}
        onPick={(lang) => {
          onChangeSource(lang);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        title="THEY SPEAK"
        languages={SOURCE_LANGUAGES}
      />
      <LanguagePickerSheet
        open={picker === 'target'}
        value={target}
        onPick={(lang) => {
          onChangeTarget(lang);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        title="YOU HEAR"
      />
    </PageShell>
  );
};
