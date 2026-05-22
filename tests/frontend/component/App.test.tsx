import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const backendValidationErrorMessage = 'Backend rejected the requested language pair';
const audioBlob = new Blob(['audio-data'], { type: 'audio/webm' });

class MockMediaRecorder extends EventTarget {
  static beforeStop: (() => void) | null = null;
  static instances: MockMediaRecorder[] = [];
  static lastInstance: MockMediaRecorder | null = null;
  static throwOnStop = false;
  readonly start = vi.fn();
  readonly stop = vi.fn(() => {
    MockMediaRecorder.beforeStop?.();
    if (MockMediaRecorder.throwOnStop) {
      throw new Error('Mock recorder stop failed');
    }
    this.dispatchEvent(new BlobEvent('dataavailable', { data: audioBlob }));
    this.dispatchEvent(new Event('stop'));
  });
  readonly mimeType = 'audio/webm';

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {
    super();
    MockMediaRecorder.instances = [...MockMediaRecorder.instances, this];
    MockMediaRecorder.lastInstance = this;
  }

  override dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    if (event.type === 'dataavailable') {
      this.ondataavailable?.(event as BlobEvent);
    }
    if (event.type === 'stop') {
      this.onstop?.();
    }
    return result;
  }
}

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn(async () => response.clone());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  createRealtimeTranslationSessionMock.mockReset();
  MockMediaRecorder.beforeStop = null;
  MockMediaRecorder.instances = [];
  MockMediaRecorder.lastInstance = null;
  MockMediaRecorder.throwOnStop = false;
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the Phase 1 product shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'SimTalk' })).toBeInTheDocument();
    expect(screen.getByText(/Speak naturally. Hear instantly./i)).toBeInTheDocument();
  });

  it('exposes all conversation modes as keyboard-accessible radio controls', () => {
    render(<App />);

    expect(screen.getByRole('radio', { name: /Listener Mode/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Turn-about Mode/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Practice Mode/i })).toBeInTheDocument();
  });

  it('communicates that recording starts disabled', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /Recording is off by default/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start local recording/i })).toBeDisabled();
  });

  it('requests a realtime token without displaying the client secret', async () => {
    const fetchMock = mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByText('sess_test')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'listener',
        targetLanguage: 'es'
      }),
      signal: expect.any(AbortSignal)
    });
    expect(screen.queryByText('ek_test_client_secret')).not.toBeInTheDocument();
  });

  it('includes source language when preparing turn-about mode', async () => {
    const fetchMock = mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'turnabout',
        sourceLanguage: 'en',
        targetLanguage: 'es'
      }),
      signal: expect.any(AbortSignal)
    });
  });

  it('switches turn-about speaker direction and clears stale prepared sessions', async () => {
    const fetchMock = mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByText('sess_test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Switch speaker direction/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.queryByText('sess_test')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText('sess_test')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenLastCalledWith('http://localhost:3000/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'turnabout',
        sourceLanguage: 'es',
        targetLanguage: 'en'
      }),
      signal: expect.any(AbortSignal)
    });
  });

  it('surfaces backend validation errors accessibly', async () => {
    const fetchMock = mockFetch(
      Response.json(
        {
          error: {
            code: 'validation_error',
            message: backendValidationErrorMessage
          }
        },
        { status: 400 }
      )
    );
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByText(backendValidationErrorMessage)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns to the idle status when switching modes after preparing a session', async () => {
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveClass('status-card--ready');
    });

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.getByRole('status')).not.toHaveClass('status-card--ready');
  });

  it('ignores stale token responses after switching modes while loading', async () => {
    let resolveTokenRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveTokenRequest = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));

    await act(async () => {
      resolveTokenRequest(Response.json(tokenResponse));
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.queryByText('sess_test')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveClass('status-card--ready');
  });

  it('ignores stale token responses after starting a new practice attempt while loading', async () => {
    let resolveTokenRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveTokenRequest = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Practice Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /New practice attempt/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );

    await act(async () => {
      resolveTokenRequest(Response.json(tokenResponse));
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.queryByText('sess_test')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveClass('status-card--ready');
  });

  it('returns to the idle status when switching modes after a request error', async () => {
    const fetchMock = mockFetch(
      Response.json(
        {
          error: {
            code: 'validation_error',
            message: backendValidationErrorMessage
          }
        },
        { status: 400 }
      )
    );
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveClass('status-card--error');
      expect(screen.getByText(backendValidationErrorMessage)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: /Practice Mode/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.getByRole('status')).not.toHaveClass('status-card--error');
  });

  it('starts WebRTC only after an explicit user action', async () => {
    const stop = vi.fn();
    createRealtimeTranslationSessionMock.mockResolvedValue({ stop });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    expect(createRealtimeTranslationSessionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: tokenResponse,
          signal: expect.any(AbortSignal),
          onTranscriptDelta: expect.any(Function),
          onRemoteAudio: expect.any(Function)
        })
      );
    });

    expect(screen.queryByText('ek_test_client_secret')).not.toBeInTheDocument();
  });

  it('renders transcript deltas emitted by the WebRTC session', async () => {
    let onTranscriptDelta!: (delta: { kind: 'input' | 'output'; text: string }) => void;
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      onTranscriptDelta = options.onTranscriptDelta;
      return { stop: vi.fn() };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    act(() => {
      onTranscriptDelta({ kind: 'input', text: 'hello' });
      onTranscriptDelta({ kind: 'output', text: 'hola' });
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hola')).toBeInTheDocument();
  });

  it('records local microphone audio only after explicit opt-in and exposes a local download', async () => {
    const localStream = { getTracks: () => [] } as unknown as MediaStream;
    const createObjectUrl = vi.fn(() => 'blob:simtalk-recording');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl
    });
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream(localStream);
      return { stop: vi.fn() };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start local recording/i }));

    expect(MockMediaRecorder.lastInstance?.stream).toBe(localStream);
    expect(MockMediaRecorder.lastInstance?.start).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Stop local recording/i }));

    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalledWith(audioBlob);
      expect(screen.getByRole('link', { name: /Download audio recording/i })).toHaveAttribute(
        'href',
        'blob:simtalk-recording'
      );
    });
    expect(screen.getByText(/Audio recording is stored as a local browser blob/i)).toBeInTheDocument();
  });

  it('ignores duplicate local recording starts while already recording', async () => {
    const localStream = { getTracks: () => [] } as unknown as MediaStream;
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream(localStream);
      return { stop: vi.fn() };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    const startRecordingButton = screen.getByRole('button', { name: /Start local recording/i });

    act(() => {
      fireEvent.click(startRecordingButton);
      fireEvent.click(startRecordingButton);
    });

    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(MockMediaRecorder.lastInstance?.start).toHaveBeenCalledOnce();
  });

  it('does not show a local recording stop error after a concurrent discard reset', async () => {
    const localStream = { getTracks: () => [] } as unknown as MediaStream;
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream(localStream);
      return { stop: vi.fn() };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start local recording/i }));

    MockMediaRecorder.beforeStop = () => {
      fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    };
    MockMediaRecorder.throwOnStop = true;

    fireEvent.click(screen.getByRole('button', { name: /Stop local recording/i }));

    expect(screen.queryByText('Local audio recording could not be stopped.')).not.toBeInTheDocument();
    expect(screen.getByText(/Audio recording is off by default/i)).toBeInTheDocument();
  });

  it('clears local recording downloads when preparing a new session', async () => {
    const localStream = { getTracks: () => [] } as unknown as MediaStream;
    const createObjectUrl = vi.fn(() => 'blob:simtalk-recording');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl
    });
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      options.onLocalStream(localStream);
      return { stop: vi.fn() };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start local recording/i }));
    fireEvent.click(screen.getByRole('button', { name: /Stop local recording/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Download audio recording/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    expect(screen.queryByRole('link', { name: /Download audio recording/i })).not.toBeInTheDocument();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:simtalk-recording');
    expect(screen.getByText(/Audio recording is off by default/i)).toBeInTheDocument();
  });

  it('lets Practice mode pause for review and start a new attempt', async () => {
    let onTranscriptDelta!: (delta: { kind: 'input' | 'output'; text: string }) => void;
    const stop = vi.fn();
    createRealtimeTranslationSessionMock.mockImplementation(async (options) => {
      onTranscriptDelta = options.onTranscriptDelta;
      return { stop };
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Practice Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start practice attempt/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start practice attempt/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    act(() => {
      onTranscriptDelta({ kind: 'input', text: 'hello' });
      onTranscriptDelta({ kind: 'output', text: 'hola' });
    });

    fireEvent.click(screen.getByRole('button', { name: /Pause and review phrase/i }));

    expect(stop).toHaveBeenCalled();
    expect(screen.getByText(/Review this attempt/i)).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hola')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New practice attempt/i }));

    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    expect(screen.queryByText('hola')).not.toBeInTheDocument();
    expect(screen.getByText(/Ready for another phrase/i)).toBeInTheDocument();
  });

  it('stops the active WebRTC session', async () => {
    const stop = vi.fn();
    createRealtimeTranslationSessionMock.mockResolvedValue({ stop });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Stop audio/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Stop audio/i }));

    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
  });

  it('stops stale WebRTC sessions that resolve after a mode switch', async () => {
    let resolveSession!: (session: { stop: () => void }) => void;
    let webRtcSignal!: AbortSignal;
    const staleStop = vi.fn();
    createRealtimeTranslationSessionMock.mockImplementation((options) => {
      webRtcSignal = options.signal;
      return new Promise((resolve) => {
        resolveSession = resolve;
      });
    });
    mockFetch(Response.json(tokenResponse));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));

    expect(webRtcSignal.aborted).toBe(true);

    await act(async () => {
      resolveSession({ stop: staleStop });
    });

    expect(staleStop).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
  });

  it('aborts and stops pending WebRTC startup when the app unmounts', async () => {
    let resolveSession!: (session: { stop: () => void }) => void;
    let webRtcSignal!: AbortSignal;
    const staleStop = vi.fn();
    createRealtimeTranslationSessionMock.mockImplementation((options) => {
      webRtcSignal = options.signal;
      return new Promise((resolve) => {
        resolveSession = resolve;
      });
    });
    mockFetch(Response.json(tokenResponse));
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start microphone and WebRTC/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start microphone and WebRTC/i }));

    await waitFor(() => {
      expect(createRealtimeTranslationSessionMock).toHaveBeenCalled();
    });

    unmount();

    expect(webRtcSignal.aborted).toBe(true);

    await act(async () => {
      resolveSession({ stop: staleStop });
    });

    expect(staleStop).toHaveBeenCalled();
  });
});
