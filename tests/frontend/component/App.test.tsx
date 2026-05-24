import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createRealtimeTranslationSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../frontend/src/realtimeTranslationSession', () => ({
  createRealtimeTranslationSession: createRealtimeTranslationSessionMock,
  RealtimeTranslationSessionError: class RealtimeTranslationSessionError extends Error {}
}));

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
  createRealtimeTranslationSessionMock.mockResolvedValue({ stop: vi.fn(), setLocalAudioEnabled: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  createRealtimeTranslationSessionMock.mockReset();
  window.history.pushState({}, '', '/');
});

describe('Lobby', () => {
  it('renders three mode pills with Listener selected by default', () => {
    render(<App />);
    const listener = screen.getByRole('radio', { name: /listen/i });
    const turnabout = screen.getByRole('radio', { name: /talk/i });
    const practice = screen.getByRole('radio', { name: /practice/i });
    expect(listener).toHaveAttribute('aria-checked', 'true');
    expect(turnabout).toHaveAttribute('aria-checked', 'false');
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
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/rooms', { method: 'POST' });
  });

  it('Listener mode shows two language cards: a Detect (Automatic) source and a Translate-into target', () => {
    render(<App />);
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
  it('Listener session shows Pause Listening and ending it routes to Summary', async () => {
    mockFetch(tokenJsonResponse());
    render(<App />);

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

describe('Dev drawer', () => {
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
