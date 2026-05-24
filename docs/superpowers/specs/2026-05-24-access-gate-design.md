# Phase-1 Access Gate — Design

**Date:** 2026-05-24
**Status:** Approved (pending user spec review)
**Scope:** Single shared password protecting the expensive API actions during phase-1 testing.

## Goal

Restrict the two paid actions in SimTalk — **LAUNCH** (single-device translation) and **CREATE / JOIN REMOTE ROOM** (LiveKit-backed two-person room) — to people who hold a shared test password. Page loads stay public. The gate ships as a small custom layer; we are not paying for Vercel's Password Protection add-on.

## Non-goals

- Per-user accounts, roles, or session management.
- Persistent identity across browser sessions.
- Brute-force isolation beyond the existing IP rate limiters.
- Any auth model that survives past phase 1.

## Boundary

The real boundary is the backend. Gating buttons alone is theatre — anyone could call `/realtime/token` directly. The middleware lives server-side; the modal is a UX layer that avoids surprising users with 401s.

### Protected endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/realtime/token` | Mint OpenAI Realtime client secret |
| POST | `/rooms/` | Create a LiveKit room |
| POST | `/rooms/:roomId/token` | Mint a LiveKit participant token |

### Unprotected endpoints

- `GET /health` — must remain reachable for uptime probes and Vercel routing checks.

## Backend

### Configuration

Add to `backend/src/config.ts` and `backend/.env.example`:

```
APP_ACCESS_PASSWORD=
```

Empty / unset means the gate is disabled. This keeps local dev frictionless. When `APP_ENV !== 'development'` and the value is empty, `config.ts` logs a single loud warning at boot:

```
[config] APP_ACCESS_PASSWORD is empty in a non-development environment — expensive API routes are publicly reachable.
```

### Shared types

In `shared/types/src/index.ts`, extend `apiErrorCodes` with `'unauthorized'`. The middleware uses the existing `apiErrorSchema` shape so frontend error parsing keeps working unchanged.

### Middleware

New file `backend/src/middleware/accessGate.ts` exports `createAccessGateMiddleware(password: string | undefined): MiddlewareHandler`.

Behaviour:

- If `password` is falsy, return a pass-through middleware (`(c, next) => next()`).
- Otherwise:
  - Read `X-Access-Password` from `c.req.raw.headers`.
  - SHA-256 hash both the received value and the configured password (returns a fixed 32-byte buffer regardless of input length, so `timingSafeEqual` does not leak length information).
  - Compare with `crypto.timingSafeEqual`.
  - On mismatch or missing header → return 401 with:
    ```json
    { "error": { "code": "unauthorized", "message": "Access denied." } }
    ```
    Response goes through `apiErrorSchema.parse(...)` to stay shape-consistent with other backend errors.
  - On match → `await next()`.

The middleware never touches request bodies and never logs the supplied password.

### Wiring

In `backend/src/app.ts`:

```ts
const accessGate = createAccessGateMiddleware(config.appAccessPassword);

app.use('*', createCorsMiddleware(config));
app.use('*', securityHeaders);

app.route('/health', healthRoute);                        // unprotected
app.use('/realtime/*', accessGate);                       // gated
app.use('/rooms/*', accessGate);                          // gated
app.route('/realtime', createRealtimeRoute(config, deps));
app.route('/rooms', createRoomsRoute(config, deps));
```

Order: CORS → security headers → access gate → per-route rate limit → handler. The existing IP rate limiter (5/min realtime, 10/min rooms) doubles as brute-force protection — no extra work needed.

## Frontend

### Storage helper

New module `frontend/src/accessGate.ts`:

```ts
const STORAGE_KEY = 'simtalk:access-password';

export const getStoredPassword = (): string | null =>
  sessionStorage.getItem(STORAGE_KEY);

export const setStoredPassword = (value: string): void =>
  sessionStorage.setItem(STORAGE_KEY, value);

export const clearStoredPassword = (): void =>
  sessionStorage.removeItem(STORAGE_KEY);

export class AccessDeniedError extends Error {
  constructor() { super('Access denied'); this.name = 'AccessDeniedError'; }
}
```

`sessionStorage` is intentional: the password lives only until the tab/window closes.

### Header injection

Modify `frontend/src/realtimeTokenClient.ts` and `frontend/src/roomTokenClient.ts`:

- Before `fetch`, read `getStoredPassword()` and, if present, add `X-Access-Password: <value>` to the request headers.
- After `fetch`, if `response.status === 401`, call `clearStoredPassword()` and throw `AccessDeniedError`. All other error handling stays as-is.

No new shared helpers — both clients are short and a localised change is clearer than a new abstraction.

### Modal

New component `frontend/src/components/screens/AccessGateModal.tsx`.

Props:

```ts
type AccessGateModalProps = {
  readonly open: boolean;
  readonly errorMessage: string | null;
  readonly onSubmit: (password: string) => void;
  readonly onClose: () => void;
};
```

Visual language mirrors `TranscriptSheet`:

- Fixed full-viewport overlay with `rgba(6,10,46,0.65)` backdrop + `backdrop-filter: blur(8px)`.
- `ST.navy`-bordered white card, 28px radius, `0 10px 0 0` chunky shadow, 18px padding.
- Header row: `FONT_DISPLAY` title `"ACCESS REQUIRED"`, close button (`STIcon name="x"`).
- Body: short helper text, single `<input type="password">`, error line (only rendered when `errorMessage` truthy).
- Footer: full-width `STButton variant="primary"` labelled `Continue`. Disabled when the input is empty.

Behaviour:

- Esc keypress and backdrop click → `onClose`.
- Form submit / Continue click → `onSubmit(trimmedValue)`. The component does not touch storage or network; the parent owns that.
- Autofocus the input when `open` flips to `true`. Reset the local input value when `open` flips to `false`.

### App wiring

In `frontend/src/App.tsx`:

New state:

```ts
const [accessModalOpen, setAccessModalOpen] = useState(false);
const [accessError, setAccessError] = useState<string | null>(null);
const pendingAccessActionRef = useRef<(() => void) | null>(null);
```

New helper:

```ts
const requireAccess = useCallback((action: () => void) => {
  if (getStoredPassword()) { action(); return; }
  pendingAccessActionRef.current = action;
  setAccessError(null);
  setAccessModalOpen(true);
}, []);
```

Wrap three call sites with `requireAccess`:

1. `onLaunch` → `requireAccess(() => void launchSession())` in the Lobby branch.
2. `onCreateRoom` → `requireAccess(() => void createRemoteRoom())` in the Lobby branch.
3. `onJoin` → `requireAccess(() => void joinRemoteRoom())` in the RemoteRoomSurface branch. Covers users who arrive via a shared `/rooms/...` URL.

Modal submit:

```ts
const handleAccessSubmit = (password: string) => {
  setStoredPassword(password);
  setAccessModalOpen(false);
  setAccessError(null);
  const action = pendingAccessActionRef.current;
  pendingAccessActionRef.current = null;
  action?.();
};
```

Modal close (Esc / backdrop / X):

```ts
const handleAccessClose = () => {
  setAccessModalOpen(false);
  setAccessError(null);
  pendingAccessActionRef.current = null;
};
```

401 handling — wrap each protected action so `AccessDeniedError` re-opens the modal with an error and re-queues the same action:

```ts
const launchSession = async () => {
  try { /* existing flow */ }
  catch (err) {
    if (err instanceof AccessDeniedError) {
      pendingAccessActionRef.current = () => void launchSession();
      setAccessError('Incorrect password. Try again.');
      setAccessModalOpen(true);
      return;
    }
    /* existing error handling */
  }
};
```

Equivalent change in `createRemoteRoom` and `joinRemoteRoom`.

## UX flows

**First LAUNCH in a session:** click LAUNCH → modal appears → enter password → modal closes → translation session starts.

**Subsequent actions same session:** click LAUNCH or CREATE REMOTE ROOM → action runs immediately (header injected from `sessionStorage`).

**Wrong password:** click LAUNCH → modal → enter wrong password → modal closes briefly → backend returns 401 → modal re-appears with `"Incorrect password. Try again."` and the input cleared. Action is re-queued.

**Shared room link recipient:** opens `/rooms/<id>` → page loads → clicks Join Room → modal appears → enter password → join proceeds.

**Tab close:** sessionStorage clears automatically. Next session re-prompts.

## Threat model

- **In scope:** stop random visitors and crawlers from triggering paid OpenAI / LiveKit calls.
- **Out of scope:** insider misuse (everyone with the password has full access), credential rotation, audit trails, defending against a compromised tester.
- **Brute force:** existing IP rate limiter caps attempts at 5/min (realtime) and 10/min (rooms). Combined with a non-trivial password, this is sufficient for phase 1.
- **Transit:** HTTPS in production. The password is sent in a request header on each protected call.
- **Timing:** SHA-256 + `timingSafeEqual` ensures both length and content comparisons are constant-time.
- **Storage:** sessionStorage — readable by any same-origin script (so any XSS = leak), cleared on tab close. Acceptable for phase 1; not acceptable as a permanent auth model.

## Testing

### Backend

- Unit test `accessGate.ts`:
  - Missing env var → middleware is pass-through.
  - Correct password → calls `next()`.
  - Wrong password → 401 with `{ error.code: 'unauthorized' }`.
  - Missing header → 401.
  - Header with whitespace / mixed case → still rejected (no normalisation).
- Integration test (Hono app):
  - `POST /realtime/token` without header → 401.
  - `POST /realtime/token` with correct header → 200 / existing happy path.
  - `POST /rooms/` and `POST /rooms/:roomId/token` mirror the above.
  - `GET /health` is unaffected.

### Frontend

- Unit test `accessGate.ts` storage helpers (jsdom).
- Unit test that `realtimeTokenClient` and `roomTokenClient`:
  - Inject the header when storage has a value.
  - Omit the header when storage is empty.
  - Throw `AccessDeniedError` and clear storage on 401.
- Component test for `AccessGateModal`:
  - Renders title, input, button.
  - Submit invokes `onSubmit` with trimmed value.
  - Esc / backdrop invokes `onClose`.
  - Error message renders only when `errorMessage` is truthy.

### E2E (Playwright)

Optional for phase 1 — skip unless an existing e2e already covers LAUNCH. The unit and integration coverage above is the priority.

## Files touched

```
shared/types/src/index.ts                                 (+1 line: 'unauthorized')
backend/.env.example                                      (+1 line)
backend/src/config.ts                                     (+ field, + warning)
backend/src/middleware/accessGate.ts                      (new)
backend/src/app.ts                                        (wire middleware)
frontend/src/accessGate.ts                                (new)
frontend/src/components/screens/AccessGateModal.tsx       (new)
frontend/src/realtimeTokenClient.ts                       (header + 401)
frontend/src/roomTokenClient.ts                           (header + 401)
frontend/src/App.tsx                                      (requireAccess wiring)
tests/backend/unit/accessGate.test.ts                     (new)
tests/backend/integration/accessGate.test.ts              (new)
tests/frontend/unit/accessGate.test.ts                    (new)
tests/frontend/component/AccessGateModal.test.tsx         (new)
```

## Open questions

None at design time. All decisions captured above.
