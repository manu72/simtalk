import { expect, test, type Page } from '@playwright/test';

const tokenResponse = {
  clientSecret: 'ek_test_client_secret',
  expiresAt: new Date('2026-05-20T13:00:00.000Z').toISOString(),
  sessionId: 'sess_test',
  sessionExpiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString(),
  translationCallUrl: 'https://api.openai.com/v1/realtime/translations/calls'
};

const mockRealtimeTokenRoute = async (page: Page) => {
  const tokenRequests: unknown[] = [];

  await page.route('**/realtime/token', async (route) => {
    tokenRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: tokenResponse });
  });

  return tokenRequests;
};

const installBrowserRealtimeMocks = async (page: Page) => {
  await page.addInitScript(() => {
    class MockDataChannel extends EventTarget {
      close() {}
    }

    class MockPeerConnection {
      ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack | null }) => void) | null =
        null;

      addTrack() {}

      close() {}

      createDataChannel() {
        return new MockDataChannel();
      }

      async createOffer() {
        return { type: 'offer', sdp: 'offer-sdp' };
      }

      async setLocalDescription() {}

      async setRemoteDescription() {
        this.ontrack?.({ streams: [new MediaStream()], track: null });
      }
    }

    class MockMediaRecorder extends EventTarget {
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      state: RecordingState = 'inactive';

      constructor(readonly stream: MediaStream) {
        super();
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        const event = new BlobEvent('dataavailable', {
          data: new Blob(['audio-data'], { type: 'audio/webm' })
        });
        this.ondataavailable?.(event);
        this.onstop?.();
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => new MediaStream()
      }
    });
    window.RTCPeerConnection = MockPeerConnection as unknown as typeof RTCPeerConnection;
    window.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
  });

  await page.route('https://api.openai.com/v1/realtime/translations/calls', async (route) => {
    await route.fulfill({
      body: 'answer-sdp',
      contentType: 'application/sdp'
    });
  });
};

test('renders the SimTalk scaffold shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SimTalk' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Listener Mode/i })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Turn-about Mode/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Practice Mode/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prepare translation session/i })).toBeVisible();
});

test('turn-about mode switches direction and clears stale prepared sessions', async ({ page }) => {
  const tokenRequests = await mockRealtimeTokenRoute(page);
  await page.goto('/');

  await page.getByRole('radio', { name: /Turn-about Mode/i }).click();
  await page.getByRole('button', { name: /Prepare translation session/i }).click();

  await expect(page.getByText('sess_test')).toBeVisible();
  expect(tokenRequests).toContainEqual({
    mode: 'turnabout',
    sourceLanguage: 'en',
    targetLanguage: 'es'
  });

  await page.getByRole('button', { name: /Switch speaker direction/i }).click();

  await expect(page.getByText('sess_test')).toHaveCount(0);
  await page.getByRole('button', { name: /Prepare translation session/i }).click();

  await expect(page.getByText('sess_test')).toBeVisible();
  expect(tokenRequests).toContainEqual({
    mode: 'turnabout',
    sourceLanguage: 'es',
    targetLanguage: 'en'
  });
});

test('local recording is opt-in and produces a browser blob download', async ({ page }) => {
  await installBrowserRealtimeMocks(page);
  await mockRealtimeTokenRoute(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Start local recording/i })).toBeDisabled();

  await page.getByRole('button', { name: /Prepare translation session/i }).click();
  await page.getByRole('button', { name: /Start microphone and WebRTC/i }).click();

  await expect(page.getByRole('button', { name: /Start local recording/i })).toBeEnabled();
  await page.getByRole('button', { name: /Start local recording/i }).click();
  await expect(page.getByText(/Local microphone recording is active/i)).toBeVisible();

  await page.getByRole('button', { name: /Stop local recording/i }).click();

  const downloadLink = page.getByRole('link', { name: /Download audio recording/i });
  await expect(downloadLink).toBeVisible();
  await expect(downloadLink).toHaveAttribute('href', /^blob:/);
  await expect(page.getByText(/stored as a local browser blob/i)).toBeVisible();
});
