# Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single shared-password gate on the three expensive backend endpoints (`POST /realtime/token`, `POST /rooms/`, `POST /rooms/:roomId/token`) with a sessionStorage-backed frontend modal that prompts on LAUNCH / CREATE REMOTE ROOM / JOIN.

**Architecture:** Backend middleware compares an `X-Access-Password` header against `APP_ACCESS_PASSWORD` using SHA-256 + `timingSafeEqual`. Empty env var disables the gate. Frontend clients inject the header from `sessionStorage`; a modal owned by `App.tsx` collects the password on first protected click and re-prompts on 401.

**Tech Stack:** pnpm workspaces, TypeScript strict, Hono on `@hono/node-server` (backend), React 19 + Vite (frontend), vitest + testing-library, Zod via `@simtalk/shared-types`.

**Spec:** `docs/superpowers/specs/2026-05-24-access-gate-design.md`.

---

## Conventions used throughout

- Backend imports use `.js` suffix (NodeNext).
- `pnpm --filter @simtalk/shared-types build` must precede any backend/frontend typecheck or test after touching `shared/types/`.
- Tests use the existing `createApp(createTestConfig(...), deps)` + `app.request(...)` pattern (see `tests/backend/integration/routes/realtime.test.ts`).
- Each task ends with a typecheck + targeted test run + a single focused commit.
- Always confirm a test fails before implementing.

---

### Task 1: Add `'unauthorized'` to shared `apiErrorCodes`

**Files:**
- Modify: `shared/types/src/index.ts` (the `apiErrorCodes` tuple, lines 109–119)
- Modify: `tests/shared/unit/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/shared/unit/index.test.ts`:

```ts
import { apiErrorCodeSchema } from '../../../shared/types/src';

describe('apiErrorCodeSchema', () => {
  it('accepts the unauthorized code', () => {
    expect(apiErrorCodeSchema.parse('unauthorized')).toBe('unauthorized');
  });
});
```

If `describe` / `expect` aren't imported in that file, add `import { describe, expect, it } from 'vitest';` at the top (if not already).

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/shared-types exec vitest run tests/shared/unit/index.test.ts -t "unauthorized"
```

Expected: FAIL with a Zod enum error mentioning that `'unauthorized'` is not a valid value.

- [ ] **Step 3: Add the code to the tuple**

In `shared/types/src/index.ts`, change:

```ts
export const apiErrorCodes = [
  'bad_request',
  'validation_error',
  'rate_limited',
  'missing_server_config',
  'openai_unavailable',
  'livekit_unavailable',
  'not_found',
  'internal_error'
] as const;
```

to:

```ts
export const apiErrorCodes = [
  'bad_request',
  'validation_error',
  'unauthorized',
  'rate_limited',
  'missing_server_config',
  'openai_unavailable',
  'livekit_unavailable',
  'not_found',
  'internal_error'
] as const;
```

- [ ] **Step 4: Rebuild shared-types and re-run the test**

```bash
pnpm --filter @simtalk/shared-types build
pnpm --filter @simtalk/shared-types exec vitest run tests/shared/unit/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types/src/index.ts tests/shared/unit/index.test.ts
git commit -m "feat(shared): add 'unauthorized' api error code"
```

---

### Task 2: Add `APP_ACCESS_PASSWORD` to backend config

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/config.ts`
- Modify: `tests/backend/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/backend/unit/config.test.ts` (inside the existing describe block, or create one):

```ts
describe('createAppConfig — APP_ACCESS_PASSWORD', () => {
  it('exposes the password when set', () => {
    const config = createAppConfig({ APP_ACCESS_PASSWORD: 'hunter2' } as NodeJS.ProcessEnv);
    expect(config.appAccessPassword).toBe('hunter2');
  });

  it('returns undefined when the env var is empty or missing', () => {
    expect(createAppConfig({} as NodeJS.ProcessEnv).appAccessPassword).toBeUndefined();
    expect(
      createAppConfig({ APP_ACCESS_PASSWORD: '   ' } as NodeJS.ProcessEnv).appAccessPassword
    ).toBeUndefined();
  });
});
```

Adjust `createAppConfig` import to match the file's existing import style.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/unit/config.test.ts
```

Expected: FAIL — `appAccessPassword` does not exist on the type / returns undefined incorrectly.

- [ ] **Step 3: Add the field to `AppConfig` and `createAppConfig`**

In `backend/src/config.ts`, add to the `AppConfig` type (alphabetical-adjacent to other optional secrets):

```ts
readonly appAccessPassword: string | undefined;
```

Add to the `createAppConfig` return object:

```ts
appAccessPassword: env.APP_ACCESS_PASSWORD?.trim() || undefined,
```

- [ ] **Step 4: Update `.env.example`**

In `backend/.env.example`, append:

```
APP_ACCESS_PASSWORD=
```

- [ ] **Step 5: Re-run the test**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/unit/config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/.env.example backend/src/config.ts tests/backend/unit/config.test.ts
git commit -m "feat(backend): add APP_ACCESS_PASSWORD config option"
```

---

### Task 3: Implement the access gate middleware

**Files:**
- Create: `backend/src/middleware/accessGate.ts`
- Create: `tests/backend/unit/middleware/accessGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/backend/unit/middleware/accessGate.test.ts`:

```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createAccessGateMiddleware } from '../../../../backend/src/middleware/accessGate.js';

const buildApp = (password: string | undefined) => {
  const app = new Hono();
  app.use('*', createAccessGateMiddleware(password));
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
};

describe('createAccessGateMiddleware', () => {
  it('passes through every request when the password is undefined', async () => {
    const app = buildApp(undefined);

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('passes through every request when the password is an empty string', async () => {
    const app = buildApp('');

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('returns 401 when the X-Access-Password header is missing', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'unauthorized', message: 'Access denied.' }
    });
  });

  it('returns 401 when the X-Access-Password header is wrong', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected', {
      headers: { 'X-Access-Password': 'wrong' }
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 when the header is a prefix or suffix of the password', async () => {
    const app = buildApp('hunter2');

    const prefix = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter' }
    });
    const suffix = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter22' }
    });

    expect(prefix.status).toBe(401);
    expect(suffix.status).toBe(401);
  });

  it('passes through when the X-Access-Password header matches exactly', async () => {
    const app = buildApp('hunter2');

    const response = await app.request('/protected', {
      headers: { 'X-Access-Password': 'hunter2' }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/unit/middleware/accessGate.test.ts
```

Expected: FAIL — module `backend/src/middleware/accessGate.js` does not exist.

- [ ] **Step 3: Implement the middleware**

Create `backend/src/middleware/accessGate.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import { apiErrorSchema } from '@simtalk/shared-types';

const ACCESS_HEADER = 'x-access-password';

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export const createAccessGateMiddleware = (password: string | undefined): MiddlewareHandler => {
  if (!password) {
    return async (_c, next) => {
      await next();
    };
  }

  const expectedHash = sha256(password);

  return async (c, next) => {
    const provided = c.req.raw.headers.get(ACCESS_HEADER);

    if (provided === null) {
      return c.json(
        apiErrorSchema.parse({
          error: { code: 'unauthorized', message: 'Access denied.' }
        }),
        401
      );
    }

    const providedHash = sha256(provided);
    if (!timingSafeEqual(providedHash, expectedHash)) {
      return c.json(
        apiErrorSchema.parse({
          error: { code: 'unauthorized', message: 'Access denied.' }
        }),
        401
      );
    }

    await next();
  };
};
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/unit/middleware/accessGate.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck the package**

```bash
pnpm --filter @simtalk/backend exec tsc -p tsconfig.json --noEmit
pnpm --filter @simtalk/backend exec tsc -p tsconfig.test.json --noEmit
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/accessGate.ts tests/backend/unit/middleware/accessGate.test.ts
git commit -m "feat(backend): add access gate middleware"
```

---

### Task 4: Wire the access gate into `app.ts`

**Files:**
- Modify: `backend/src/app.ts`
- Create: `tests/backend/integration/accessGate.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/backend/integration/accessGate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  realtimeTokenRoute,
  roomCreateRoute,
  roomTokenRoute
} from '@simtalk/shared-types';

import { createApp } from '../../../backend/src/app.js';
import { createAppConfig } from '../../../backend/src/config.js';

const PASSWORD = 'hunter2';
const ROOM_ID = 'room_abcdefghijklmnopqrstuvwxyz';

const baseEnv: NodeJS.ProcessEnv = {
  APP_ENV: 'test',
  OPENAI_API_KEY: 'sk-test-secret',
  APP_ACCESS_PASSWORD: PASSWORD
};

const openAiSuccessPayload = {
  value: 'ek_test_client_secret',
  expires_at: 1_779_280_000,
  session: { id: 'sess_test', expires_at: 1_779_280_600 }
};

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const createRoomService = () => ({
  createRoom: vi.fn(async () => ({
    roomId: ROOM_ID,
    roomUrlPath: `/rooms/${ROOM_ID}`,
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  })),
  createParticipantToken: vi.fn(async () => ({
    liveKitUrl: 'wss://simtalk.livekit.cloud',
    participantToken: 'livekit.jwt',
    roomId: ROOM_ID,
    participantIdentity: 'participant_abcdefghijklmnop',
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  }))
});

const realtimeRequest = (headers: Record<string, string> = {}) =>
  new Request(`http://localhost${realtimeTokenRoute}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers
    },
    body: JSON.stringify({ mode: 'listener', targetLanguage: 'es' })
  });

describe('access gate integration', () => {
  it('rejects /realtime/token without the X-Access-Password header', async () => {
    const app = createApp(createAppConfig(baseEnv), {
      fetch: vi.fn(async () => createJsonResponse(openAiSuccessPayload))
    });

    const response = await app.request(realtimeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'unauthorized', message: 'Access denied.' }
    });
  });

  it('rejects /realtime/token with the wrong password', async () => {
    const app = createApp(createAppConfig(baseEnv), {
      fetch: vi.fn(async () => createJsonResponse(openAiSuccessPayload))
    });

    const response = await app.request(realtimeRequest({ 'X-Access-Password': 'nope' }));

    expect(response.status).toBe(401);
  });

  it('allows /realtime/token with the correct password', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(createAppConfig(baseEnv), { fetch: fetchMock });

    const response = await app.request(realtimeRequest({ 'X-Access-Password': PASSWORD }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects POST /rooms without the header', async () => {
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: createRoomService() });

    const response = await app.request(roomCreateRoute, { method: 'POST' });

    expect(response.status).toBe(401);
  });

  it('allows POST /rooms with the correct header', async () => {
    const roomService = createRoomService();
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: roomService });

    const response = await app.request(roomCreateRoute, {
      method: 'POST',
      headers: { 'X-Access-Password': PASSWORD }
    });

    expect(response.status).toBe(201);
    expect(roomService.createRoom).toHaveBeenCalled();
  });

  it('rejects POST /rooms/:roomId/token without the header', async () => {
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: createRoomService() });

    const response = await app.request(roomTokenRoute(ROOM_ID), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'en'
      })
    });

    expect(response.status).toBe(401);
  });

  it('allows GET /health without the header', async () => {
    const app = createApp(createAppConfig(baseEnv));

    const response = await app.request('/health');

    expect(response.status).toBe(200);
  });

  it('leaves all routes open when APP_ACCESS_PASSWORD is empty', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(
      createAppConfig({ ...baseEnv, APP_ACCESS_PASSWORD: '' }),
      { fetch: fetchMock }
    );

    const response = await app.request(realtimeRequest());

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/integration/accessGate.test.ts
```

Expected: most tests FAIL — every protected route currently returns 200/201/4xx based on its own logic, not 401, because no gate is wired up.

- [ ] **Step 3: Wire the middleware in `backend/src/app.ts`**

Modify `backend/src/app.ts`. Add the import:

```ts
import { createAccessGateMiddleware } from './middleware/accessGate.js';
```

Replace the inside of `createApp` so it reads:

```ts
export const createApp = (
  config: AppConfig = createAppConfig(),
  dependencies: AppDependencies = {}
) => {
  const app = new Hono();
  const accessGate = createAccessGateMiddleware(config.appAccessPassword);

  app.use('*', createCorsMiddleware(config));
  app.use('*', securityHeaders);

  app.route('/health', healthRoute);

  app.use('/realtime/*', accessGate);
  app.use('/rooms/*', accessGate);

  app.route('/realtime', createRealtimeRoute(config, dependencies));
  app.route('/rooms', createRoomsRoute(config, dependencies));

  app.notFound((c) =>
    c.json(
      apiErrorSchema.parse({
        error: {
          code: 'not_found',
          message: 'Route not found'
        }
      }),
      404
    )
  );

  app.onError((error, c) => {
    console.error('Unhandled backend error', {
      name: error.name,
      message: error.message
    });

    return c.json(
      apiErrorSchema.parse({
        error: {
          code: 'internal_error',
          message: 'Unexpected server error'
        }
      }),
      500
    );
  });

  return app;
};
```

- [ ] **Step 4: Re-run the integration test**

```bash
pnpm --filter @simtalk/backend exec vitest run tests/backend/integration/accessGate.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Run the full backend test suite to confirm nothing regressed**

```bash
pnpm --filter @simtalk/backend test
```

Expected: all tests PASS. The pre-existing route tests do not set `APP_ACCESS_PASSWORD`, so the gate is a no-op for them.

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.ts tests/backend/integration/accessGate.test.ts
git commit -m "feat(backend): gate /realtime and /rooms with access password"
```

---

### Task 5: Frontend access-gate storage module

**Files:**
- Create: `frontend/src/accessGate.ts`
- Create: `tests/frontend/unit/accessGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/unit/accessGate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AccessDeniedError,
  clearStoredPassword,
  getStoredPassword,
  setStoredPassword
} from '../../../frontend/src/accessGate';

const STORAGE_KEY = 'simtalk:access-password';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe('access gate storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredPassword()).toBeNull();
  });

  it('persists the password under the documented key', () => {
    setStoredPassword('hunter2');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('hunter2');
    expect(getStoredPassword()).toBe('hunter2');
  });

  it('clears the stored password', () => {
    setStoredPassword('hunter2');
    clearStoredPassword();
    expect(getStoredPassword()).toBeNull();
  });
});

describe('AccessDeniedError', () => {
  it('has a stable name for instanceof checks', () => {
    const error = new AccessDeniedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AccessDeniedError');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/accessGate.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `frontend/src/accessGate.ts`:

```ts
const STORAGE_KEY = 'simtalk:access-password';

export const getStoredPassword = (): string | null =>
  window.sessionStorage.getItem(STORAGE_KEY);

export const setStoredPassword = (value: string): void => {
  window.sessionStorage.setItem(STORAGE_KEY, value);
};

export const clearStoredPassword = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEY);
};

export class AccessDeniedError extends Error {
  constructor() {
    super('Access denied');
    this.name = 'AccessDeniedError';
  }
}
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/accessGate.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/accessGate.ts tests/frontend/unit/accessGate.test.ts
git commit -m "feat(frontend): add access-gate storage helpers"
```

---

### Task 6: Inject the header from `realtimeTokenClient`

**Files:**
- Modify: `frontend/src/realtimeTokenClient.ts`
- Modify: `tests/frontend/unit/realtimeTokenClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/frontend/unit/realtimeTokenClient.test.ts` inside `describe('requestRealtimeToken', ...)`:

```ts
import {
  AccessDeniedError,
  clearStoredPassword,
  setStoredPassword
} from '../../../frontend/src/accessGate';

afterEach(() => {
  clearStoredPassword();
});

it('adds the X-Access-Password header when a password is stored', async () => {
  setStoredPassword('hunter2');
  const fetchImpl = vi.fn(async () => Response.json(tokenResponse)) as unknown as typeof fetch;

  await requestRealtimeToken(tokenRequest, { fetchImpl });

  const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
  expect((init as RequestInit).headers).toMatchObject({
    'Content-Type': 'application/json',
    'X-Access-Password': 'hunter2'
  });
});

it('omits the X-Access-Password header when no password is stored', async () => {
  const fetchImpl = vi.fn(async () => Response.json(tokenResponse)) as unknown as typeof fetch;

  await requestRealtimeToken(tokenRequest, { fetchImpl });

  const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
  expect((init as RequestInit).headers).not.toHaveProperty('X-Access-Password');
});

it('throws AccessDeniedError and clears storage on 401', async () => {
  setStoredPassword('wrong');
  const fetchImpl = vi.fn(async () =>
    new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  ) as unknown as typeof fetch;

  await expect(requestRealtimeToken(tokenRequest, { fetchImpl })).rejects.toBeInstanceOf(
    AccessDeniedError
  );

  expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/realtimeTokenClient.test.ts
```

Expected: the three new tests FAIL — header is not present, 401 path throws `RealtimeTokenClientError` instead of `AccessDeniedError`.

- [ ] **Step 3: Implement the header injection and 401 handling**

In `frontend/src/realtimeTokenClient.ts`:

Add at the top (after existing imports):

```ts
import {
  AccessDeniedError,
  clearStoredPassword,
  getStoredPassword
} from './accessGate';
```

Replace the `fetchImpl(joinUrl(...), { ... })` call so the headers object includes the access password when present. Find this block:

```ts
    response = await fetchImpl(joinUrl(apiBaseUrl, realtimeTokenRoute), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedRequest.data),
      signal: controller.signal
    });
```

Replace with:

```ts
    const accessPassword = getStoredPassword();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessPassword) {
      headers['X-Access-Password'] = accessPassword;
    }

    response = await fetchImpl(joinUrl(apiBaseUrl, realtimeTokenRoute), {
      method: 'POST',
      headers,
      body: JSON.stringify(parsedRequest.data),
      signal: controller.signal
    });
```

Then, immediately after the `response` is obtained and before the existing `if (!response.ok)` block, add:

```ts
  if (response.status === 401) {
    clearStoredPassword();
    throw new AccessDeniedError();
  }
```

- [ ] **Step 4: Re-run the tests**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/realtimeTokenClient.test.ts
```

Expected: PASS (all tests including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/realtimeTokenClient.ts tests/frontend/unit/realtimeTokenClient.test.ts
git commit -m "feat(frontend): send access password header on realtime token requests"
```

---

### Task 7: Inject the header from `roomTokenClient`

**Files:**
- Modify: `frontend/src/roomTokenClient.ts`
- Modify: `tests/frontend/unit/roomTokenClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/frontend/unit/roomTokenClient.test.ts`. If the file lacks shared fixtures for the request, reuse the patterns already present in the file. Add:

```ts
import {
  AccessDeniedError,
  clearStoredPassword,
  setStoredPassword
} from '../../../frontend/src/accessGate';

afterEach(() => {
  clearStoredPassword();
});

describe('access gate header on room endpoints', () => {
  const roomId = 'room_abcdefghijklmnopqrstuvwxyz';
  const roomCreatePayload = {
    roomId,
    roomUrlPath: `/rooms/${roomId}`,
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  };
  const roomTokenPayload = {
    liveKitUrl: 'wss://simtalk.livekit.cloud',
    participantToken: 'livekit.jwt',
    roomId,
    participantIdentity: 'participant_abcdefghijklmnop',
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  };
  const roomTokenRequest = {
    participantIdentity: 'participant_abcdefghijklmnop',
    targetLanguage: 'en'
  } as const;

  it('sends X-Access-Password on requestRoomCreate when stored', async () => {
    setStoredPassword('hunter2');
    const fetchImpl = vi.fn(async () => Response.json(roomCreatePayload)) as unknown as typeof fetch;

    await requestRoomCreate({ fetchImpl });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toMatchObject({ 'X-Access-Password': 'hunter2' });
  });

  it('throws AccessDeniedError and clears storage when requestRoomCreate returns 401', async () => {
    setStoredPassword('wrong');
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    await expect(requestRoomCreate({ fetchImpl })).rejects.toBeInstanceOf(AccessDeniedError);
    expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
  });

  it('sends X-Access-Password on requestRoomToken when stored', async () => {
    setStoredPassword('hunter2');
    const fetchImpl = vi.fn(async () => Response.json(roomTokenPayload)) as unknown as typeof fetch;

    await requestRoomToken(roomId, roomTokenRequest, { fetchImpl });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toMatchObject({ 'X-Access-Password': 'hunter2' });
  });

  it('throws AccessDeniedError and clears storage when requestRoomToken returns 401', async () => {
    setStoredPassword('wrong');
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Access denied.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    await expect(
      requestRoomToken(roomId, roomTokenRequest, { fetchImpl })
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(window.sessionStorage.getItem('simtalk:access-password')).toBeNull();
  });
});
```

If `requestRoomCreate` / `requestRoomToken` aren't already imported in the test file, add them to the existing import line from `frontend/src/roomTokenClient`.

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/roomTokenClient.test.ts
```

Expected: the four new tests FAIL.

- [ ] **Step 3: Modify `frontend/src/roomTokenClient.ts`**

Add imports at the top:

```ts
import {
  AccessDeniedError,
  clearStoredPassword,
  getStoredPassword
} from './accessGate';
```

Add a helper near the top of the file (after `joinUrl`):

```ts
const buildHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...extra };
  const accessPassword = getStoredPassword();
  if (accessPassword) {
    headers['X-Access-Password'] = accessPassword;
  }
  return headers;
};

const handle401 = (response: Response): void => {
  if (response.status === 401) {
    clearStoredPassword();
    throw new AccessDeniedError();
  }
};
```

In `requestRoomCreate`, replace:

```ts
    response = await fetchImpl(joinUrl(apiBaseUrl, roomCreateRoute), { method: 'POST' });
```

with:

```ts
    response = await fetchImpl(joinUrl(apiBaseUrl, roomCreateRoute), {
      method: 'POST',
      headers: buildHeaders()
    });
```

And insert immediately after the `response` is assigned:

```ts
  handle401(response);
```

(before the existing `if (!response.ok)` block).

In `requestRoomToken`, replace the fetch call so headers are built via the helper. Find:

```ts
    response = await fetchImpl(joinUrl(apiBaseUrl, roomTokenRoute(parsedRoomId.data)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedRequest.data)
    });
```

Replace with:

```ts
    response = await fetchImpl(joinUrl(apiBaseUrl, roomTokenRoute(parsedRoomId.data)), {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(parsedRequest.data)
    });
```

And insert immediately after the `response` is assigned:

```ts
  handle401(response);
```

- [ ] **Step 4: Re-run the tests**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/roomTokenClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/roomTokenClient.ts tests/frontend/unit/roomTokenClient.test.ts
git commit -m "feat(frontend): send access password header on room endpoints"
```

---

### Task 8: Build the `AccessGateModal` component

**Files:**
- Create: `frontend/src/components/screens/AccessGateModal.tsx`
- Create: `tests/frontend/component/AccessGateModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/component/AccessGateModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AccessGateModal } from '../../../frontend/src/components/screens/AccessGateModal';

const renderModal = (overrides: Partial<React.ComponentProps<typeof AccessGateModal>> = {}) => {
  const props: React.ComponentProps<typeof AccessGateModal> = {
    open: true,
    errorMessage: null,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
  return { props, ...render(<AccessGateModal {...props} />) };
};

describe('AccessGateModal', () => {
  it('renders nothing when closed', () => {
    render(
      <AccessGateModal
        open={false}
        errorMessage={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the title and password input when open', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('disables Continue while the input is empty and enables when filled', () => {
    renderModal();
    const button = screen.getByRole('button', { name: /continue/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    expect(button).toBeEnabled();
  });

  it('calls onSubmit with the trimmed password on Continue', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '  hunter2  ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(props.onSubmit).toHaveBeenCalledWith('hunter2');
  });

  it('calls onClose when Escape is pressed', () => {
    const { props } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders the error message when provided', () => {
    renderModal({ errorMessage: 'Incorrect password. Try again.' });
    expect(screen.getByText('Incorrect password. Try again.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/AccessGateModal.test.tsx
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/screens/AccessGateModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

import { STIcon } from '../brand/Icons';
import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';

type AccessGateModalProps = {
  readonly open: boolean;
  readonly errorMessage: string | null;
  readonly onSubmit: (password: string) => void;
  readonly onClose: () => void;
};

export const AccessGateModal = ({ open, errorMessage, onSubmit, onClose }: AccessGateModalProps) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setValue('');
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = value.trim();
  const submitDisabled = trimmed.length === 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitDisabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Access required"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(6,10,46,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: ST.white,
          border: `3px solid ${ST.navy}`,
          borderRadius: 28,
          padding: 22,
          boxShadow: `0 10px 0 0 ${ST.navy}`,
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          color: ST.navy
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: '0.03em' }}>
            ACCESS REQUIRED
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close access dialog"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: `2px solid ${ST.navy}`,
              background: ST.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <STIcon name="x" size={16} color={ST.navy} />
          </button>
        </div>

        <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 14, opacity: 0.75 }}>
          Enter the shared test password to continue.
        </p>

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            letterSpacing: '0.08em'
          }}
        >
          PASSWORD
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 16,
              padding: '10px 12px',
              borderRadius: 14,
              border: `2px solid ${ST.navy}`,
              background: ST.white,
              color: ST.navy
            }}
          />
        </label>

        {errorMessage ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 700,
              color: ST.danger
            }}
          >
            {errorMessage}
          </p>
        ) : null}

        <STButton type="submit" variant="primary" size="md" full disabled={submitDisabled}>
          Continue
        </STButton>
      </form>
    </div>
  );
};
```

If `STButton` does not currently accept `type` or `disabled` props, inspect `frontend/src/components/brand/primitives.tsx` and add the missing props (forward them straight to the underlying `<button>`). If the props are already supported, no change is needed.

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/AccessGateModal.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @simtalk/frontend exec tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/screens/AccessGateModal.tsx tests/frontend/component/AccessGateModal.test.tsx
git commit -m "feat(frontend): add AccessGateModal component"
```

If `STButton` was modified, include that file in the commit.

---

### Task 9: Wire `requireAccess` into `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `tests/frontend/component/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/frontend/component/App.test.tsx`:

```tsx
import { AccessDeniedError } from '../../../frontend/src/accessGate';

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

  it('does not show the modal on launch when a password is already stored', async () => {
    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    mockFetch(tokenJsonResponse());
    createRealtimeTranslationSessionMock.mockResolvedValue({
      stop: vi.fn(),
      setLocalAudioEnabled: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /launch/i }));

    // Modal should never appear.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /access required/i })).toBeNull()
    );
  });
});
```

Note: `tokenJsonResponse`, `mockFetch`, `createRealtimeTranslationSessionMock`, `roomCreateJsonResponse` already exist at the top of `App.test.tsx`. The unused `AccessDeniedError` import can be omitted if the linter complains.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx
```

Expected: the three new tests FAIL.

- [ ] **Step 3: Modify `frontend/src/App.tsx`**

Add to the imports near the top:

```ts
import {
  AccessDeniedError,
  getStoredPassword,
  setStoredPassword
} from './accessGate';
import { AccessGateModal } from './components/screens/AccessGateModal';
```

Inside the `App` component, add the access-gate state next to the other top-level `useState` declarations:

```ts
const [accessModalOpen, setAccessModalOpen] = useState(false);
const [accessError, setAccessError] = useState<string | null>(null);
const pendingAccessActionRef = useRef<(() => void) | null>(null);
```

Add the helpers below the existing `useCallback` block:

```ts
const requireAccess = useCallback((action: () => void) => {
  if (getStoredPassword()) {
    action();
    return;
  }
  pendingAccessActionRef.current = action;
  setAccessError(null);
  setAccessModalOpen(true);
}, []);

const handleAccessSubmit = useCallback((password: string) => {
  setStoredPassword(password);
  setAccessModalOpen(false);
  setAccessError(null);
  const action = pendingAccessActionRef.current;
  pendingAccessActionRef.current = null;
  action?.();
}, []);

const handleAccessClose = useCallback(() => {
  setAccessModalOpen(false);
  setAccessError(null);
  pendingAccessActionRef.current = null;
}, []);

const reopenAccessModal = useCallback((action: () => void) => {
  pendingAccessActionRef.current = action;
  setAccessError('Incorrect password. Try again.');
  setAccessModalOpen(true);
}, []);
```

Locate the three protected call sites and wrap their bodies so `AccessDeniedError` re-opens the modal. For each existing async action — the function the Lobby `onLaunch` calls, the function `onCreateRoom` calls, and the `joinRemoteRoom` function — wrap the throwing region with a try/catch:

```ts
try {
  // existing body
} catch (error) {
  if (error instanceof AccessDeniedError) {
    reopenAccessModal(() => void retryFn());
    return;
  }
  // existing error handling (unchanged)
}
```

where `retryFn` is the same async function being defined (e.g. `launchSession`, `createRemoteRoom`, `joinRemoteRoom`). If those functions are defined inside `useCallback`, name them via the `const` and reference the same const in the retry. If the existing flow already wraps the body in a try/catch, fold the `instanceof AccessDeniedError` check into the existing catch as the first branch.

Then change the handler props passed to `Lobby` and `RemoteRoomSurface`:

```tsx
<Lobby
  // ...other props unchanged...
  onLaunch={() => requireAccess(() => void launchSession())}
  onCreateRoom={() => requireAccess(() => void createRemoteRoom())}
/>
```

```tsx
<RemoteRoomSurface
  // ...other props unchanged...
  onJoin={() => requireAccess(() => void joinRemoteRoom())}
/>
```

(Adjust the exact function names to match what already exists in `App.tsx` — the spec describes intent, and the current names are `joinRemoteRoom`, `createRemoteRoom`, and the start-session function feeding `onLaunch`.)

Render the modal at the bottom of the App tree, alongside other top-level overlays (e.g. next to `TranscriptSheet`):

```tsx
<AccessGateModal
  open={accessModalOpen}
  errorMessage={accessError}
  onSubmit={handleAccessSubmit}
  onClose={handleAccessClose}
/>
```

- [ ] **Step 4: Re-run the App test**

```bash
pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx
```

Expected: PASS, including the three new tests.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @simtalk/frontend exec tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx tests/frontend/component/App.test.tsx
git commit -m "feat(frontend): gate LAUNCH, create room, and join with access modal"
```

---

### Task 10: Whole-repo verification

**Files:** none modified — verification only.

- [ ] **Step 1: Rebuild shared-types**

```bash
pnpm --filter @simtalk/shared-types build
```

- [ ] **Step 2: Typecheck the whole workspace**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Run the whole test suite**

```bash
pnpm test
```

Expected: every package passes. Pre-existing route tests must still pass because they do not set `APP_ACCESS_PASSWORD` (gate is no-op).

- [ ] **Step 4: Smoke test locally (manual)**

In one shell:

```bash
echo 'APP_ACCESS_PASSWORD=test1234' >> backend/.env
pnpm dev
```

In another shell or browser, visit `http://127.0.0.1:5173`:

1. Click LAUNCH → modal appears.
2. Submit a wrong password → modal re-appears with `"Incorrect password. Try again."`.
3. Submit `test1234` → translation session starts.
4. Reload the page → click LAUNCH again → modal **does not** appear (`sessionStorage` retains the value).
5. Close the tab and re-open → click LAUNCH → modal **does** appear.
6. Click CREATE REMOTE ROOM → enters the room screen → click Join → no second modal (password persisted).
7. `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/realtime/token -H 'Content-Type: application/json' -d '{"mode":"listener","targetLanguage":"es"}'` → `401`.
8. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health` → `200`.

Remove the `APP_ACCESS_PASSWORD` line from `backend/.env` before committing anything else, or leave it locally if convenient. **Do not commit `backend/.env`.**

- [ ] **Step 5: No additional commit needed for verification.**

---

## Self-Review

Spec sections vs tasks:

- "Boundary / Protected endpoints" → Task 4.
- "Configuration" → Task 2.
- "Shared types — apiErrorCodes addition" → Task 1.
- "Middleware" → Task 3.
- "Wiring" → Task 4.
- "Frontend storage helper" → Task 5.
- "Header injection (both clients)" → Tasks 6 and 7.
- "Modal" → Task 8.
- "App wiring (LAUNCH, CREATE ROOM, JOIN)" → Task 9.
- "UX flows" (first launch, wrong password, shared link, tab close) → covered by Task 9 tests and Task 10 manual smoke list.
- "Threat model" — non-implementation; documented in spec only.
- "Testing" — every test described in the spec has a corresponding task step.

Type / symbol consistency:

- `appAccessPassword` (config field), `APP_ACCESS_PASSWORD` (env), `X-Access-Password` (header), `'unauthorized'` (error code), `simtalk:access-password` (storage key), `AccessDeniedError` class, `createAccessGateMiddleware` function, `AccessGateModal` component, `getStoredPassword` / `setStoredPassword` / `clearStoredPassword` helpers, `requireAccess` / `handleAccessSubmit` / `handleAccessClose` / `reopenAccessModal` handlers in `App.tsx` — all consistent across tasks.

No placeholders. Each step contains the actual command or code an engineer needs.
