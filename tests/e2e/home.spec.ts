import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("simtalk:access-password", "e2e-test-password");
  });
});

const tokenResponse = {
  clientSecret: "ek_test_client_secret",
  expiresAt: new Date("2026-05-20T13:00:00.000Z").toISOString(),
  sessionId: "sess_test",
  sessionExpiresAt: new Date("2026-05-20T13:10:00.000Z").toISOString(),
  translationCallUrl: "https://api.openai.com/v1/realtime/translations/calls",
};

const mockRealtimeTokenRoute = async (page: Page) => {
  const tokenRequests: unknown[] = [];
  await page.route("**/realtime/token", async (route) => {
    tokenRequests.push(route.request().postDataJSON());
    await route.fulfill({
      json: tokenResponse,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  });
  return tokenRequests;
};

const installBrowserRealtimeMocks = async (page: Page) => {
  await page.addInitScript(() => {
    class MockDataChannel {
      addEventListener() {}
      close() {}
    }

    class MockPeerConnection {
      ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack | null }) => void) | null = null;
      addEventListener() {}
      addTrack() {}
      close() {}
      createDataChannel() {
        return new MockDataChannel();
      }
      getConfiguration() {
        return {};
      }
      removeEventListener() {}
      async createOffer() {
        return { type: "offer", sdp: "offer-sdp" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
    }

    class MockMediaRecorder {
      state: RecordingState = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        },
      },
    });
    Object.defineProperty(window, "RTCPeerConnection", {
      configurable: true,
      writable: true,
      value: MockPeerConnection,
    });
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      writable: true,
      value: MockPeerConnection,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });
  });

  await page.route("https://api.openai.com/v1/realtime/translations/calls", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
      });
      return;
    }

    await route.fulfill({
      body: "answer-sdp",
      contentType: "application/sdp",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
};

test("lobby surfaces Turn-about by default with local and remote CTAs", async ({ page }) => {
  await page.goto("/");

  const launch = page.getByRole("button", { name: /launch/i });
  await expect(launch).toBeVisible();
  await expect(page.getByRole("button", { name: /create remote room/i })).toBeVisible();

  await expect(page.getByRole("radio", { name: /talk/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /listen/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /practice/i })).toBeVisible();

  await expect(page.getByText(/you speak/i)).toBeVisible();
  await expect(page.getByText(/they speak/i)).toBeVisible();
});

test("Turn-about lobby shows Person A You Speak and Person B They Speak pickers, and sends pair on launch", async ({
  page,
}) => {
  const tokenRequests = await mockRealtimeTokenRoute(page);
  await installBrowserRealtimeMocks(page);
  await page.goto("/");

  await page.getByRole("radio", { name: /talk/i }).click();
  await expect(page.getByText(/you speak/i)).toBeVisible();
  await expect(page.getByText(/they speak/i)).toBeVisible();

  await page.getByRole("button", { name: /launch/i }).click();

  await expect(page.getByRole("button", { name: /end session/i })).toBeVisible();
  expect(tokenRequests).toContainEqual({
    mode: "turnabout",
    sourceLanguage: "en",
    targetLanguage: "es",
  });
});

test("Listener launches and exposes Pause Listening", async ({ page }) => {
  await mockRealtimeTokenRoute(page);
  await installBrowserRealtimeMocks(page);
  await page.goto("/");

  await page.getByRole("radio", { name: /listen/i }).click();
  await page.getByRole("button", { name: /launch/i }).click();

  await expect(page.getByRole("button", { name: /pause listening/i })).toBeVisible();
  await page.getByRole("button", { name: /end session/i }).click();

  await expect(page.getByRole("button", { name: /new session/i })).toBeVisible();
});

test("remote room creation opens a shareable room screen", async ({ page }) => {
  await page.route("**/rooms", async (route) => {
    await route.fulfill({
      json: {
        roomId: "room_abcdefghijklmnopqrstuvwxyz",
        roomUrlPath: "/rooms/room_abcdefghijklmnopqrstuvwxyz",
        expiresAt: new Date("2026-05-20T13:10:00.000Z").toISOString(),
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: /create remote room/i }).click();

  await expect(page.getByRole("heading", { name: /remote talk/i })).toBeVisible();
  await expect(page.getByText("room_abcdefghijklmnopqrstuvwxyz", { exact: true })).toBeVisible();
});
