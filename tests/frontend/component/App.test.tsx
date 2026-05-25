import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  createLiveKitRemoteRoomSessionMock.mockResolvedValue({
    participantIdentity: 'participant_abcdefghijklmnop',
    setOriginalAudioMuted: vi.fn(),
    stop: vi.fn()
  });
  createRealtimeTranslationSessionMock.mockResolvedValue({ stop: vi.fn(), setLocalAudioEnabled: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  createLiveKitRemoteRoomSessionMock.mockReset();
  createRealtimeTranslationSessionMock.mockReset();
  window.history.pushState({}, '', '/');
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

  it('Turn-about mode shows Person A and Person B pickers with a swap chip', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /talk/i }));
    expect(screen.getByText(/person a/i)).toBeInTheDocument();
    expect(screen.getByText(/person b/i)).toBeInTheDocument();
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
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    createLiveKitRemoteRoomSessionMock
      .mockRejectedValueOnce(new AccessDeniedError())
      .mockResolvedValueOnce({
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
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
