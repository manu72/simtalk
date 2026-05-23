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
      ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack | null }) => void) | null = null;
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

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() }
    });
    window.RTCPeerConnection = MockPeerConnection as unknown as typeof RTCPeerConnection;
  });

  await page.route('https://api.openai.com/v1/realtime/translations/calls', async (route) => {
    await route.fulfill({ body: 'answer-sdp', contentType: 'application/sdp' });
  });
};

test('lobby surfaces Listener by default with a single LAUNCH CTA', async ({ page }) => {
  await page.goto('/');

  const launch = page.getByRole('button', { name: /launch/i });
  await expect(launch).toBeVisible();

  await expect(page.getByRole('radio', { name: /listen/i })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /talk/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /practice/i })).toBeVisible();

  await expect(page.getByText(/we'll detect any of 70\+ languages/i)).toBeVisible();
});

test('Turn-about lobby shows Person A and Person B pickers, and sends pair on launch', async ({ page }) => {
  const tokenRequests = await mockRealtimeTokenRoute(page);
  await installBrowserRealtimeMocks(page);
  await page.goto('/');

  await page.getByRole('radio', { name: /talk/i }).click();
  await expect(page.getByText(/person a/i)).toBeVisible();
  await expect(page.getByText(/person b/i)).toBeVisible();

  await page.getByRole('button', { name: /launch/i }).click();

  await expect(page.getByRole('button', { name: /end session/i })).toBeVisible();
  expect(tokenRequests).toContainEqual({
    mode: 'turnabout',
    sourceLanguage: 'en',
    targetLanguage: 'es'
  });
});

test('Listener launches and exposes Pause Listening', async ({ page }) => {
  await mockRealtimeTokenRoute(page);
  await installBrowserRealtimeMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: /launch/i }).click();

  await expect(page.getByRole('button', { name: /pause listening/i })).toBeVisible();
  await page.getByRole('button', { name: /end session/i }).click();

  await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
});
