import { useEffect, useRef } from 'react';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

import { STIcon } from './Icons';
import type { Language } from './languages';
import { FONT_DISPLAY, ST } from './primitives';

export type VideoTileTone = 'teal' | 'pink';

export type VideoTileProps = {
  readonly tone: VideoTileTone;
  readonly displayName: string;
  readonly language: Language | null;
  readonly isLocal: boolean;
  readonly isMicMuted: boolean;
  readonly isSpeaking: boolean;
  readonly videoTrack: LocalVideoTrack | RemoteVideoTrack | null;
  readonly onToggleMic?: () => void;
  readonly waiting?: boolean;
};

const TONE_BACKGROUNDS: Record<VideoTileTone, string> = {
  teal: `radial-gradient(120% 90% at 30% 30%, ${ST.cyan} 0%, ${ST.cyanDeep} 40%, #0A6E76 80%, ${ST.navyDeep} 100%)`,
  pink: `radial-gradient(120% 90% at 70% 35%, ${ST.pink} 0%, ${ST.pinkDeep} 40%, #6B0F45 80%, ${ST.navyDeep} 100%)`
};

const TONE_AVATAR_BG: Record<VideoTileTone, string> = {
  teal: '#1F4C56',
  pink: '#4A1238'
};

const TONE_NAME_PILL_BG: Record<VideoTileTone, string> = {
  teal: ST.white,
  pink: ST.pink
};

const TONE_NAME_PILL_FG: Record<VideoTileTone, string> = {
  teal: ST.navy,
  pink: ST.white
};

const initialOf = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0]!.toUpperCase();
};

const Pill = ({
  bg,
  fg,
  children
}: {
  readonly bg: string;
  readonly fg: string;
  readonly children: React.ReactNode;
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: bg,
      color: fg,
      border: `2px solid ${ST.navy}`,
      borderRadius: 999,
      padding: '3px 8px',
      fontFamily: FONT_DISPLAY,
      fontSize: 10,
      letterSpacing: '0.04em',
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </span>
);

export const VideoTile = ({
  tone,
  displayName,
  language,
  isLocal,
  isMicMuted,
  isSpeaking,
  videoTrack,
  onToggleMic,
  waiting = false
}: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach/detach the LiveKit track only when the track reference changes.
  // LiveKit's track.attach()/detach() manage MediaStream binding internally.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !videoTrack) return undefined;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack]);

  const showVideo = videoTrack !== null;
  const initial = initialOf(displayName);
  const cornerDotColor = isSpeaking ? ST.cyan : 'rgba(255,255,255,0.45)';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 18,
        border: `3px solid ${ST.navy}`,
        boxShadow: `0 6px 0 0 ${ST.navy}`,
        overflow: 'hidden',
        background: TONE_BACKGROUNDS[tone],
        outline: isSpeaking ? `3px solid ${ST.cyan}` : 'none',
        outlineOffset: -3,
        transition: 'outline-color 120ms ease'
      }}
      aria-label={
        isLocal
          ? `Your tile, ${displayName}, microphone ${isMicMuted ? 'muted' : 'live'}`
          : `${displayName} tile, microphone ${isMicMuted ? 'muted' : 'live'}`
      }
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: isLocal ? 'scaleX(-1)' : undefined
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              background: TONE_AVATAR_BG[tone],
              border: `3px solid ${ST.white}`,
              color: ST.white,
              fontFamily: FONT_DISPLAY,
              fontSize: 30,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: waiting ? 0.45 : 1
            }}
          >
            {waiting ? '·' : initial}
          </div>
        </div>
      )}

      {/* Top-right corner activity dot */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: 999,
          background: cornerDotColor,
          boxShadow: isSpeaking ? `0 0 12px ${ST.cyan}` : 'none'
        }}
      />

      {/* Bottom-left pills: name + language */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <Pill bg={TONE_NAME_PILL_BG[tone]} fg={TONE_NAME_PILL_FG[tone]}>
          {displayName.toUpperCase()}
        </Pill>
        {language ? (
          <Pill bg={language.color} fg={ST.navy}>
            <span aria-hidden="true">{language.flag}</span>
            {language.code}
          </Pill>
        ) : null}
      </div>

      {/* Bottom-right: mic toggle (local) or audio activity (remote) */}
      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8
        }}
      >
        {isLocal ? (
          <button
            type="button"
            onClick={onToggleMic}
            aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: ST.white,
              border: `2px solid ${ST.navy}`,
              boxShadow: `0 2px 0 0 ${ST.navy}`,
              color: ST.navy,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <STIcon name={isMicMuted ? 'mic-off' : 'mic'} size={14} color={ST.navy} />
          </button>
        ) : (
          <span
            aria-label={isMicMuted ? 'Remote microphone muted' : 'Remote audio active'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: isMicMuted ? ST.white : ST.pink,
              border: `2px solid ${ST.navy}`,
              color: isMicMuted ? ST.navy : ST.white,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <STIcon
              name={isMicMuted ? 'mic-off' : 'audio-bars'}
              size={14}
              color={isMicMuted ? ST.navy : ST.white}
            />
          </span>
        )}
      </div>
    </div>
  );
};
