import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { participantIdentitySchema } from '../../../shared/types/src/index';

const createLiveKitRemoteRoomSessionMock = vi.hoisted(() => vi.fn());
const createRealtimeTranslationSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../frontend/src/liveKitRemoteRoomSession', () => ({
  createLiveKitRemoteRoomSession: createLiveKitRemoteRoomSessionMock
}));

vi.mock('../../../frontend/src/realtimeTranslationSession', () => ({
  createRealtimeTranslationSession: createRealtimeTranslationSessionMock,
  RealtimeTranslationSessionError: class RealtimeTranslationSessionError extends Error {}
}));

import { AccessDeniedError } from '../../../frontend/src/accessGate';
import { App } from '../../../frontend/src/App';

const tokenResponse = {
  clientSecret: 'ek_test_client_secret',
  expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
  sessionId: 'sess_test',
  sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
  translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
};

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn(async () => response.clone());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const tokenJsonResponse = () =>
  new Response(JSON.stringify(tokenResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

const roomCreateJsonResponse = () =>
  new Response(
    JSON.stringify({
      roomId: 'room_abcdefghijklmnopqrstuvwxyz',
      roomUrlPath: '/rooms/room_abcdefghijklmnopqrstuvwxyz',
      expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }
  );

const TEST_REMOTE_ROOM_ID = 'room_abcdefghijklmnopqrstuvwxyz';
const TEST_REMOTE_ROOM_DISPLAY_NAME_KEY = `simtalk.room.${TEST_REMOTE_ROOM_ID}.displayName`;

beforeEach(() => {
  createLiveKitRemoteRoomSessionMock.mockResolvedValue({
    participantIdentity: 'participant_abcdefghijklmnop',
    setOriginalAudioMuted: vi.fn(),
    setLocalYouHear: vi.fn(),
    stop: vi.fn()
  });
  createRealtimeTranslationSessionMock.mockResolvedValue({ stop: vi.fn(), setLocalAudioEnabled: vi.fn() });
  // Pre-seed the per-room display name so existing join-room tests skip past
  // the name prompt. Tests that exercise the name modal explicitly remove
  // this entry first.
  window.sessionStorage.setItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY, 'Tester');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  createLiveKitRemoteRoomSessionMock.mockReset();
  createRealtimeTranslationSessionMock.mockReset();
  window.history.pushState({}, '', '/');
  window.localStorage.removeItem('simtalk.remoteRoom.sourceLanguage');
  window.localStorage.removeItem('simtalk.remoteRoom.targetLanguage');
  window.sessionStorage.removeItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY);
});

describe('Lobby', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('renders three mode pills with Turn-about selected by default', () => {
    render(<App />);
    const listener = screen.getByRole('radio', { name: /listen/i });
    const turnabout = screen.getByRole('radio', { name: /talk/i });
    const practice = screen.getByRole('radio', { name: /practice/i });
    expect(turnabout).toHaveAttribute('aria-checked', 'true');
    expect(listener).toHaveAttribute('aria-checked', 'false');
    expect(practice).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the LAUNCH primary CTA', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument();
  });

  it('creates a remote room and routes to the room screen', async () => {
    const fetchMock = mockFetch(roomCreateJsonResponse());
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create remote room/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /remote talk/i })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/rooms',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Password': 'hunter2' })
      })
    );
  });

  it('generates a schema-valid fallback participant identity when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(Date, 'now').mockReturnValue(1);
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /join room/i }));
    });

    await waitFor(() => expect(createLiveKitRemoteRoomSessionMock).toHaveBeenCalled());
    const call = createLiveKitRemoteRoomSessionMock.mock.calls[0] as
      | [{ roomTokenRequest: { participantIdentity?: string } }]
      | undefined;
    const participantIdentity = call?.[0].roomTokenRequest.participantIdentity;
    expect(participantIdentitySchema.safeParse(participantIdentity).success).toBe(true);
  });

  it('Listener mode shows two language cards: a Detect (Automatic) source and a Translate-into target', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /listen/i }));
    expect(screen.getByText(/^detect$/i)).toBeInTheDocument();
    expect(screen.getByText(/^translate into$/i)).toBeInTheDocument();
    expect(screen.getByText(/^automatic$/i)).toBeInTheDocument();
    expect(screen.queryByText(/you speak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/person a/i)).not.toBeInTheDocument();
  });

  it('Turn-about mode shows You speak and They speak pickers with a swap chip', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));
    expect(screen.getByText(/you speak/i)).toBeInTheDocument();
    expect(screen.getByText(/they speak/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /swap a and b/i })).toBeInTheDocument();
  });

  it('Practice mode shows directional You-speak / Translate-to pair', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /practice/i }));
    expect(screen.getByText(/you speak/i)).toBeInTheDocument();
    expect(screen.getByText(/translate to/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reverse source and target/i })).toBeInTheDocument();
  });

  it('omits sourceLanguage in token request when launching Listener mode', async () => {
    const fetchMock = mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /listen/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse((call?.[1]?.body as string) ?? '{}');
    expect(body).toEqual({ mode: 'listener', targetLanguage: 'es' });
    expect(body.sourceLanguage).toBeUndefined();
  });

  it('includes sourceLanguage in token request when launching Turn-about', async () => {
    const fetchMock = mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse((call?.[1]?.body as string) ?? '{}');
    expect(body).toMatchObject({ mode: 'turnabout', sourceLanguage: 'en', targetLanguage: 'es' });
  });
});

describe('Launch flow', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('transitions from lobby to session header after a successful launch', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
    });
    expect(createRealtimeTranslationSessionMock).toHaveBeenCalledTimes(1);
  });

  it('stops a translation session that resolves after the user ended launch', async () => {
    const translationSession = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    let resolveTranslationSession: ((session: typeof translationSession) => void) | undefined;

    createRealtimeTranslationSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranslationSession = resolve;
        })
    );
    mockFetch(tokenJsonResponse());
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    await act(async () => {
      resolveTranslationSession?.(translationSession);
    });

    await waitFor(() => {
      expect(translationSession.stop).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces an error in the lobby when the token request fails', async () => {
    const failedResponse = new Response(
      JSON.stringify({ error: { code: 'rate_limited', message: 'Too many launches' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
    mockFetch(failedResponse);
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many launches/i);
    });
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument();
  });
});

describe('Session controls', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('Listener session shows Pause Listening and ending it routes to Summary', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /listen/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /pause listening/i }));

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument();
  });

  it('Turn-about session renders the flip and hold-to-talk controls', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /flip speaker sides/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /hold to talk/i })).toBeInTheDocument();
  });

  it('captures Turn-about transcript deltas that arrive before mic release renders', async () => {
    const session = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    let onTranscriptDelta: ((delta: { readonly kind: 'input' | 'output'; readonly text: string }) => void) | undefined;

    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      onTranscriptDelta = options.onTranscriptDelta;
      return session;
    });
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    const micButton = await screen.findByRole('button', { name: /hold to talk/i });
    micButton.setPointerCapture = vi.fn();
    micButton.hasPointerCapture = vi.fn(() => true);
    micButton.releasePointerCapture = vi.fn();

    await act(async () => {
      fireEvent.pointerDown(micButton, { pointerId: 1 });
      onTranscriptDelta?.({ kind: 'input', text: 'hello there' });
      onTranscriptDelta?.({ kind: 'output', text: 'hola alli' });
      fireEvent.pointerUp(micButton, { pointerId: 1 });
    });

    await waitFor(() => {
      expect(screen.getByText('hello there')).toBeInTheDocument();
      expect(screen.getByText('hola alli')).toBeInTheDocument();
    });
  });

  it('Turn-about FLIP re-mints a token with swapped source and target', async () => {
    const fetchMock = mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /flip speaker sides/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /flip speaker sides/i }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const second = fetchMock.mock.calls[1] as unknown as [string, RequestInit] | undefined;
    expect(JSON.parse((first?.[1]?.body as string) ?? '{}')).toMatchObject({
      mode: 'turnabout',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    });
    expect(JSON.parse((second?.[1]?.body as string) ?? '{}')).toMatchObject({
      mode: 'turnabout',
      sourceLanguage: 'es',
      targetLanguage: 'en'
    });
  });

  it('Practice session starts in IDLE with Tap to Record', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /practice/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tap to record/i })).toBeInTheDocument();
    });
  });

  it('keeps the Practice microphone muted except during active recording', async () => {
    const session = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    const localStream = { getTracks: vi.fn(() => []) };
    class FakeMediaRecorder {
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['practice-audio'], { type: this.mimeType }) } as BlobEvent);
          this.onstop?.();
        });
      }
    }
    const createObjectURL = vi.fn(() => 'blob:practice-audio');

    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream?.(localStream as unknown as MediaStream);
      return session;
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn()
    });
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /practice/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /tap to record/i }));

    const sessionOptions = createRealtimeTranslationSessionMock.mock.calls[0]?.[0];
    expect(sessionOptions.startLocalAudioEnabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /tap to record/i }));
    expect(session.setLocalAudioEnabled).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(session.setLocalAudioEnabled).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /type your guess/i })).toBeInTheDocument();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it('keeps Practice idle when recording starts without a local stream', async () => {
    const session = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    createRealtimeTranslationSessionMock.mockResolvedValue(session);
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /practice/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /tap to record/i }));

    fireEvent.click(screen.getByRole('button', { name: /tap to record/i }));

    expect(screen.getByRole('button', { name: /tap to record/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stop recording/i })).not.toBeInTheDocument();
    expect(session.setLocalAudioEnabled).toHaveBeenLastCalledWith(false);
  });

  it('keeps Practice idle when MediaRecorder cannot start', async () => {
    const session = { stop: vi.fn(), setLocalAudioEnabled: vi.fn() };
    const localStream = { getTracks: vi.fn(() => []) };
    class FailingMediaRecorder {
      constructor() {
        throw new Error('recorder unavailable');
      }
    }

    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream?.(localStream as unknown as MediaStream);
      return session;
    });
    vi.stubGlobal('MediaRecorder', FailingMediaRecorder);
    mockFetch(tokenJsonResponse());
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /practice/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /tap to record/i }));

    fireEvent.click(screen.getByRole('button', { name: /tap to record/i }));

    expect(screen.getByRole('button', { name: /tap to record/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stop recording/i })).not.toBeInTheDocument();
    expect(session.setLocalAudioEnabled).toHaveBeenLastCalledWith(false);
  });
});

describe('access gate', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('prompts for password on LAUNCH and stores it on submit', async () => {
    const fetchMock = mockFetch(tokenJsonResponse());
    createRealtimeTranslationSessionMock.mockResolvedValue({
      stop: vi.fn(),
      setLocalAudioEnabled: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /launch/i }));

    const dialog = await screen.findByRole('dialog', { name: /access required/i });
    expect(dialog).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/realtime/token'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Access-Password': 'hunter2' })
        })
      );
    });

    expect(window.sessionStorage.getItem('simtalk:access-password')).toBe('hunter2');
  });

  it('re-opens modal with an error when the password is wrong', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    fireEvent.change(await screen.findByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
  });

  it('resets launch state and retries after access denied on launch with stored password', async () => {
    window.sessionStorage.setItem('simtalk:access-password', 'wrong');
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    createRealtimeTranslationSessionMock.mockResolvedValue({
      stop: vi.fn(),
      setLocalAudioEnabled: vi.fn()
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^launch$/i })).not.toBeDisabled();

    fetchMock.mockImplementation(async () => tokenJsonResponse());

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => screen.getByRole('button', { name: /end session/i }));
  });

  it('resets join state and retries after access denied on join room', async () => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    window.sessionStorage.setItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY, 'Tester');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    createLiveKitRemoteRoomSessionMock
      .mockRejectedValueOnce(new AccessDeniedError())
      .mockResolvedValueOnce({
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setLocalYouHear: vi.fn(),
        stop: vi.fn()
      });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /join room/i }));
    });

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join room/i })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    await waitFor(() => expect(createLiveKitRemoteRoomSessionMock).toHaveBeenCalledTimes(2));
  });

  it('does not show the modal on launch when a password is already stored', async () => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    mockFetch(tokenJsonResponse());
    createRealtimeTranslationSessionMock.mockResolvedValue({
      stop: vi.fn(),
      setLocalAudioEnabled: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /launch/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /access required/i })).toBeNull()
    );
  });
});

describe('Remote room language pickers', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('keeps the They speak and You hear pickers enabled before joining', () => {
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    expect(screen.getByRole('button', { name: /they speak/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /you hear/i })).not.toBeDisabled();
  });

  it('persists the selected target language to localStorage and rehydrates it on next mount', async () => {
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    const { unmount } = render(<App />);

    const youHear = screen.getByRole('button', { name: /you hear/i });
    fireEvent.click(youHear);
    const filterInput = await screen.findByLabelText(/filter languages/i);
    fireEvent.change(filterInput, { target: { value: 'english' } });
    const englishOption = await screen.findByRole('button', { name: /EN\s*·\s*English/i });
    fireEvent.click(englishOption);

    await waitFor(() =>
      expect(window.localStorage.getItem('simtalk.remoteRoom.targetLanguage')).toBe('en')
    );

    unmount();
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    expect(screen.getByRole('button', { name: /you hear/i })).toHaveTextContent(/english/i);
  });
});

describe('Remote room language mirroring', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('mirrors partner youHear into THEY SPEAK and resets to Automatic on leave', async () => {
    let capturedOnRemoteYouHearChange: ((v: string | null) => void) | undefined;
    createLiveKitRemoteRoomSessionMock.mockImplementationOnce(async (opts) => {
      capturedOnRemoteYouHearChange = opts.onRemoteYouHearChange;
      return {
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setCameraEnabled: vi.fn(async () => undefined),
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setLocalYouHear: vi.fn(),
        stop: vi.fn()
      };
    });

    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });
    await waitFor(() => expect(capturedOnRemoteYouHearChange).toBeDefined());
    // After join completes the UI transitions to the live surface. The remote
    // VideoTile's language pill exposes the partner's source language as its
    // BCP-47 code (e.g. "TL", "AUTO") — that is the user-visible mirror of
    // remoteSource.
    await screen.findByText('AUTO');

    await act(async () => {
      capturedOnRemoteYouHearChange!('tl');
    });
    expect(await screen.findByText('TL')).toBeInTheDocument();
    expect(screen.queryByText('AUTO')).not.toBeInTheDocument();

    await act(async () => {
      capturedOnRemoteYouHearChange!(null);
    });
    expect(await screen.findByText('AUTO')).toBeInTheDocument();
    expect(screen.queryByText('TL')).not.toBeInTheDocument();
  });

  it('never overwrites remoteTarget when partner youHear matches it', async () => {
    // Regression: the partner mirror used to feed remoteSource into an
    // anti-collision effect that would silently rewrite remoteTarget — i.e.
    // the user's chosen YOU HEAR language — and broadcast that involuntary
    // change back out via session.setLocalYouHear.
    let capturedOnRemoteYouHearChange: ((v: string | null) => void) | undefined;
    const setLocalYouHear = vi.fn();
    createLiveKitRemoteRoomSessionMock.mockImplementationOnce(async (opts) => {
      capturedOnRemoteYouHearChange = opts.onRemoteYouHearChange;
      opts.onRemoteYouHearChange?.(null);
      return {
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setCameraEnabled: vi.fn(async () => undefined),
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setLocalYouHear,
        stop: vi.fn()
      };
    });

    // Pre-set the user's target to English so the partner's 'en' collides.
    window.localStorage.setItem('simtalk.remoteRoom.targetLanguage', 'en');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });
    await waitFor(() => expect(setLocalYouHear).toHaveBeenCalledWith('en'));
    setLocalYouHear.mockClear();

    // Partner mirrors back the same youHear the local user already chose.
    await act(async () => {
      capturedOnRemoteYouHearChange!('en');
    });

    // The user-chosen target must not change, so nothing new gets published.
    expect(setLocalYouHear).not.toHaveBeenCalled();
    // Both video tiles legitimately show EN (THEY SPEAK = English, YOU HEAR
    // = English) — neither side has been silently rewritten.
    expect(screen.getAllByText('EN')).toHaveLength(2);
  });

  it('does not flip status to live after the join is superseded mid-startup', async () => {
    // Regression: joinRemoteRoom used to call setRemoteStatus('live')
    // unconditionally after awaiting setCameraEnabled. If teardown (popstate,
    // leave, etc.) ran during that await, the stale join still flipped status
    // to 'live', rendering a ghost live surface with no underlying session.
    let resolveCamera: (() => void) | undefined;
    const session = {
      participantIdentity: 'participant_abcdefghijklmnop',
      setOriginalAudioMuted: vi.fn(),
      setCameraEnabled: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCamera = () => resolve();
          })
      ),
      setMicrophoneEnabled: vi.fn(async () => undefined),
      setLocalYouHear: vi.fn(),
      stop: vi.fn()
    };
    createLiveKitRemoteRoomSessionMock.mockResolvedValueOnce(session);

    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });
    await waitFor(() => expect(session.setCameraEnabled).toHaveBeenCalledWith(true));

    // User navigates back, then forward to the same room. The two popstate
    // teardowns bump joinGenerationRef so the still-pending join is stale.
    await act(async () => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {
      window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Camera promise resolves AFTER the join was superseded.
    await act(async () => {
      resolveCamera!();
      await Promise.resolve();
    });

    // Pre-join surface must still be visible — the live branch (with its
    // "Leave Room" button) would only render if status had flipped to 'live'.
    expect(screen.getByRole('button', { name: /join room/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /leave room/i })).not.toBeInTheDocument();
  });

  it('pushes remoteTarget into the session as youHear', async () => {
    const setLocalYouHear = vi.fn();
    createLiveKitRemoteRoomSessionMock.mockImplementationOnce(async (opts) => {
      // Replay the initial sync the session would have done so the live UI
      // settles before we assert.
      opts.onRemoteYouHearChange?.(null);
      return {
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setCameraEnabled: vi.fn(async () => undefined),
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setLocalYouHear,
        stop: vi.fn()
      };
    });

    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });
    // YOU HEAR defaults to English (the user's primary language) when no
    // stored preference exists — it is NOT seeded from the lobby's THEY SPEAK.
    await waitFor(() => expect(setLocalYouHear).toHaveBeenCalledWith('en'));
  });

  it('defaults THEY SPEAK to Automatic and YOU HEAR to the lobby YOU SPEAK after Create Remote Room', async () => {
    mockFetch(roomCreateJsonResponse());
    render(<App />);

    // Sanity: lobby defaults are YOU SPEAK=English and THEY SPEAK=Spanish.
    const lobbyCards = screen.getAllByRole('button', { name: /you speak|they speak/i });
    expect(lobbyCards.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create remote room/i }));
    });

    await screen.findByRole('heading', { name: /remote talk/i });

    // THEY SPEAK in the remote room must default to Automatic — never the
    // lobby's YOU SPEAK value (English here).
    const theySpeak = screen.getByRole('button', { name: /they speak/i });
    expect(theySpeak).toHaveTextContent(/automatic/i);
    expect(theySpeak).not.toHaveTextContent(/english/i);

    // YOU HEAR must default to the lobby's YOU SPEAK (English) — never the
    // lobby's THEY SPEAK (Spanish).
    const youHear = screen.getByRole('button', { name: /you hear/i });
    expect(youHear).toHaveTextContent(/english/i);
    expect(youHear).not.toHaveTextContent(/spanish/i);
  });

  it('preserves a stored YOU HEAR preference when entering a remote room via Create Remote Room', async () => {
    // Stored YOU HEAR from a previous remote-room visit takes precedence over
    // any lobby-derived default on subsequent Create Remote Room actions.
    window.localStorage.setItem('simtalk.remoteRoom.targetLanguage', 'fr');
    mockFetch(roomCreateJsonResponse());
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create remote room/i }));
    });

    await screen.findByRole('heading', { name: /remote talk/i });
    const youHear = screen.getByRole('button', { name: /you hear/i });
    expect(youHear).toHaveTextContent(/french/i);
  });
});

describe('Remote room name prompt', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    // Force the modal path: no cached name for this room.
    window.sessionStorage.removeItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY);
  });

  it('opens the name modal on Join Room when no name is cached and forwards it to the LiveKit token request', async () => {
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /join room/i }));

    const dialog = await screen.findByRole('dialog', { name: /choose a name for this room/i });
    expect(dialog).toBeInTheDocument();
    expect(createLiveKitRemoteRoomSessionMock).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: 'Sam' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^join room$/i }));
    });

    await waitFor(() => expect(createLiveKitRemoteRoomSessionMock).toHaveBeenCalled());
    const call = createLiveKitRemoteRoomSessionMock.mock.calls[0] as
      | [{ roomTokenRequest: { displayName?: string } }]
      | undefined;
    expect(call?.[0].roomTokenRequest.displayName).toBe('Sam');
    expect(window.sessionStorage.getItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY)).toBe('Sam');
  });

  it('skips the name modal on Join Room when a name is already cached for this room', async () => {
    window.sessionStorage.setItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY, 'Cached');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });

    expect(
      screen.queryByRole('dialog', { name: /choose a name for this room/i })
    ).toBeNull();
    await waitFor(() => expect(createLiveKitRemoteRoomSessionMock).toHaveBeenCalled());
    const call = createLiveKitRemoteRoomSessionMock.mock.calls[0] as
      | [{ roomTokenRequest: { displayName?: string } }]
      | undefined;
    expect(call?.[0].roomTokenRequest.displayName).toBe('Cached');
  });

  it('closes the name modal and drops the queued join when the active room changes mid-flow', async () => {
    // Regression: the queued name action captures joinRemoteRoom for the
    // room that was active when the modal opened. If the user navigates to a
    // different room (popstate) or back to the lobby while the modal is open
    // and then submits, the captured closure would join the wrong room and
    // the typed name would be persisted under the new room's storage key.
    // The remoteRoomId effect must reset name-gating state.
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    const dialog = await screen.findByRole('dialog', { name: /choose a name for this room/i });
    expect(dialog).toBeInTheDocument();

    await act(async () => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(
      screen.queryByRole('dialog', { name: /choose a name for this room/i })
    ).toBeNull();
    expect(createLiveKitRemoteRoomSessionMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY)).toBeNull();
  });

  it('reloads the cached display name for a different room after popstate', async () => {
    const otherRoomId = 'room_zyxwvutsrqponmlkjihgfedcba';
    const otherRoomKey = `simtalk.room.${otherRoomId}.displayName`;
    window.sessionStorage.setItem(TEST_REMOTE_ROOM_DISPLAY_NAME_KEY, 'Alice');
    window.sessionStorage.setItem(otherRoomKey, 'Bob');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    await act(async () => {
      window.history.pushState({}, '', `/rooms/${otherRoomId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    });

    await waitFor(() => expect(createLiveKitRemoteRoomSessionMock).toHaveBeenCalled());
    const call = createLiveKitRemoteRoomSessionMock.mock.calls[0] as
      | [{ roomId: string; roomTokenRequest: { displayName?: string } }]
      | undefined;
    expect(call?.[0].roomId).toBe(otherRoomId);
    expect(call?.[0].roomTokenRequest.displayName).toBe('Bob');
    window.sessionStorage.removeItem(otherRoomKey);
  });
});

describe('Dev drawer', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
  });

  it('opens with Alt+D and surfaces sessionId after a launch', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /launch/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /end session/i }));

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd', altKey: true });
    });

    expect(screen.getByText(/dev drawer/i)).toBeInTheDocument();
    expect(screen.getByText('sess_test')).toBeInTheDocument();
  });
});
