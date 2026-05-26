import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RemoteRoomSurface } from '../../../frontend/src/components/screens/RemoteRoomSurface';
import { AUTO_LANGUAGE, findLanguage } from '../../../frontend/src/components/brand/languages';

const baseProps = {
  roomId: 'room_abcdefghijklmnopqrstuvwxyz',
  roomUrl: 'http://localhost/rooms/room_abcdefghijklmnopqrstuvwxyz',
  source: AUTO_LANGUAGE,
  target: findLanguage('en'),
  status: 'idle' as const,
  participantCount: 0,
  translatedCaption: '',
  originalAudioMuted: true,
  errorMessage: null,
  localDisplayName: 'You',
  remoteDisplayName: null,
  localVideoTrack: null,
  remoteVideoTrack: null,
  localMicMuted: false,
  localCameraEnabled: false,
  remoteMicMuted: true,
  remoteIsSpeaking: false,
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onToggleOriginalAudio: vi.fn(),
  onToggleLocalMic: vi.fn(),
  onToggleLocalCamera: vi.fn(),
  onCopyLink: vi.fn(),
  onChangeSource: vi.fn(),
  onChangeTarget: vi.fn()
};

describe('RemoteRoomSurface pre-join THEY SPEAK picker', () => {
  it('includes the Automatic option', () => {
    render(<RemoteRoomSurface {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /they speak/i }));
    expect(screen.getByText(/AUTO\s*·\s*Automatic/i)).toBeInTheDocument();
  });
});

describe('RemoteRoomSurface live state', () => {
  const liveProps = {
    ...baseProps,
    status: 'live' as const,
    participantCount: 1,
    remoteDisplayName: 'Bob',
    source: findLanguage('tl'),
    target: findLanguage('en')
  };

  it('opens the YOU HEAR picker when the local language pill is clicked', () => {
    render(<RemoteRoomSurface {...liveProps} />);
    fireEvent.click(
      screen.getByRole('button', { name: /change the language you hear/i })
    );
    // The picker dialog is rendered as role=dialog with aria-label="YOU HEAR".
    expect(screen.getByRole('dialog', { name: /you hear/i })).toBeInTheDocument();
  });
});
