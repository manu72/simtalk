import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const tokenResponse = {
  clientSecret: 'ek_test_client_secret',
  expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
  sessionId: 'sess_test',
  sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
  translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
};

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
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

  it('surfaces backend validation errors accessibly', async () => {
    mockFetch(
      Response.json(
        {
          error: {
            code: 'validation_error',
            message: 'Source and target languages must be different'
          }
        },
        { status: 400 }
      )
    );
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.change(screen.getByLabelText(/Translation language/i), {
      target: { value: 'en' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Source and target languages must be different')
      ).toBeInTheDocument();
    });
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

  it('returns to the idle status when switching modes after a request error', async () => {
    mockFetch(
      Response.json(
        {
          error: {
            code: 'validation_error',
            message: 'Source and target languages must be different'
          }
        },
        { status: 400 }
      )
    );
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /Turn-about Mode/i }));
    fireEvent.change(screen.getByLabelText(/Translation language/i), {
      target: { value: 'en' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Prepare translation session/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveClass('status-card--error');
    });

    fireEvent.click(screen.getByRole('radio', { name: /Practice Mode/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'No translation session has been prepared yet. Audio capture will remain inactive.'
    );
    expect(screen.getByRole('status')).not.toHaveClass('status-card--error');
  });
});
