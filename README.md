# SimTalk

Listen Talk Practice.

SimTalk is a realtime speech-to-speech translation web app built around OpenAI `gpt-realtime-translate`. It is designed to let people who do not share a spoken language hold a low-latency conversation with live translated audio and transcripts.

OpenAI describes `gpt-realtime-translate` as using dynamic voice adaptation for translated speech. In practice, translated audio is intended to follow the source speaker's general tone, pitch, and speaking style, so the rendered voice can adapt as different speakers talk and may align with perceived speaker characteristics such as gender. This is adaptive translated voice rendering, not exact voice cloning or a guaranteed speaker-identity match.

Phase 1 is a private, single-device prototype for validating three conversation workflows:

- Listener Mode (UN Mode): listen to any supported spoken language and hear translation in a selected target language.
- Turn-about Mode: two people share one device and manually switch speaker direction.
- Practice Mode: speak deliberately, pause, replay, and review translation output for language learning.

Phase 2 is planned to add authenticated accounts, persistence, and remote multi-user rooms.

For source product and architecture context, see:

- [Product Requirements Document](./PRD.md)
- [System Architecture Specification](./System_Architecture.md)

## Project Status

Status: pre-MVP Phase 1 prototype.

The current codebase is past the initial scaffold. It includes the shared API contract, backend realtime-token boundary, frontend session flows, browser-native WebRTC startup path, and browser-local recording/download paths.

Implemented now:

- pnpm workspace with `frontend`, `backend`, and `shared/types` packages.
- React 19 + Vite 7 frontend with accessible mode/language/session controls and UX-redesigned Lobby, Listener, Turn-about, Practice, transcript, dev drawer, and Summary surfaces.
- 70+ language catalog with automatic source detection for Listener mode and explicit language pairs for Turn-about and Practice.
- Hono backend with `GET /health` and `POST /realtime/token`.
- Shared Zod schemas and inferred TypeScript types for modes, language tags, token requests/responses, API errors, and health responses.
- Server-side OpenAI realtime translation client-secret minting.
- Configured-origin CORS, baseline security headers, and in-memory rate limiting for token issuance.
- Browser token request client with schema validation and timeout handling.
- Browser-native WebRTC setup using microphone capture, `RTCPeerConnection`, SDP exchange with OpenAI, remote translated audio playback, transcript delta handling, and cleanup.
- Turn-about side flips re-mint direction-specific tokens and keep captured turn transcripts when the mic is released.
- Practice keeps the live mic muted until an active recording attempt and captures browser-local practice audio for review when available.
- Browser-local listener recording, practice recording, transcript copy/download, and audio download when a recording exists.
- Vitest coverage for shared contracts, backend config/routes/services, frontend components/clients/WebRTC service, plus Playwright browser flows with mocked token/OpenAI network boundaries.

## Technology Stack

Phase 1:

| Layer                                | Current technology                                               |
| ------------------------------------ | ---------------------------------------------------------------- |
| Frontend                             | React 19, Vite 7, TypeScript                                     |
| UI styling                           | CSS variables, brand primitives, and component styles            |
| Backend                              | Node.js 22+, Hono                                                |
| Shared contracts                     | TypeScript, Zod                                                  |
| Realtime translation                 | OpenAI `gpt-realtime-translate`                                  |
| Browser transport                    | WebRTC                                                           |
| Package manager                      | pnpm 10.16.1                                                     |
| Unit/component tests                 | Vitest, React Testing Library, jsdom                             |
| E2E tests                            | Playwright                                                       |
| Deployment target                    | Vercel for Phase 1                                               |
| Authentication/access                | Vercel Password Protection and allowlist, configured out of repo |
| Database                             | None in Phase 1                                                  |
| Server-side audio/transcript storage | None                                                             |

Tailwind CSS and shadcn/ui are architecture options from earlier planning, but they are not installed in the active frontend package. `components.json`, `frontend/src/components/ui/`, and `frontend/src/lib/utils.ts` remain as scaffold remnants and are not part of the current UI path.

Phase 2 target stack:

| Layer           | Planned technology                                                |
| --------------- | ----------------------------------------------------------------- |
| Backend hosting | Google Cloud Run                                                  |
| Authentication  | Supabase Auth, Firebase Auth, Auth0, or equivalent                |
| Database        | Supabase Postgres or Cloud SQL                                    |
| Realtime rooms  | LiveKit or equivalent                                             |
| Object storage  | GCS or Supabase Storage for explicitly user-controlled recordings |

## Architecture

The Phase 1 runtime has three boundaries:

1. Browser app
   - Renders the mode/language/session UI.
   - Requests a short-lived realtime translation credential from the backend.
   - Captures microphone audio only after explicit user action.
   - Establishes a direct WebRTC session with OpenAI using the short-lived client secret.
   - Plays remote translated audio and renders transcript deltas.
   - Cleans up microphone tracks, peer connection, data channel, and audio elements when stopped or aborted.

2. Hono backend
   - Exposes `GET /health`.
   - Exposes `POST /realtime/token`.
   - Exposes `POST /rooms` and `POST /rooms/:roomId/token` for Phase 1.5 LiveKit rooms.
   - Validates requests with shared Zod schemas.
   - Reads `OPENAI_API_KEY` server-side only.
   - Reads LiveKit credentials server-side only.
   - Calls OpenAI's realtime translations client-secret endpoint.
   - Returns a browser-safe token response.
   - Applies CORS, security headers, and token request rate limiting.
   - Does not receive or proxy audio/transcript content.

3. OpenAI Realtime Translate
   - Issues realtime translation client secrets through the server-side API call.
   - Accepts the browser's SDP offer at the translation calls endpoint.
   - Handles speech recognition, translation, synthesized audio output, and transcript deltas.
   - Dynamically adapts translated audio toward the source speaker's general tone, pitch, and style; this may include speaker-presentation cues such as gender, but should not be treated as exact voice cloning or a guaranteed identity match.

Current token/WebRTC flow:

```text
Browser UI
  -> POST /realtime/token
  -> Hono validates request and rate limit
  -> Hono calls OpenAI client-secret endpoint with OPENAI_API_KEY
  -> Hono returns short-lived client secret and translation call URL
  -> User starts microphone/WebRTC
  -> Browser sends SDP offer directly to OpenAI
  -> OpenAI returns SDP answer, translated audio, and transcript deltas
```

## Security And Privacy

Phase 1 security controls currently in code:

- `OPENAI_API_KEY` is used only by the backend.
- Token responses are schema-validated and must not include the server API key.
- LiveKit room token responses are schema-validated and must not include the LiveKit API secret.
- Token requests are validated before any OpenAI call.
- `POST /realtime/token` and room token routes use in-memory per-client rate limiters.
- CORS only reflects origins listed in `ALLOWED_ORIGINS`.
- Backend responses include baseline security headers:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
- OpenAI upstream errors are mapped to sanitized client responses.
- Token responses are returned with `Cache-Control: no-store`.

Phase 1 privacy invariants:

- No database.
- No server-side transcript storage.
- No server-side audio storage.
- No backend audio proxy.
- Optional recording stays browser-local and explicit.
- Refreshing the page should clear unsaved session data.

Important limitation: Vercel Password Protection and the single-user allowlist are Phase 1 deployment controls configured outside this repo. They are not implemented as in-repo backend auth.

## Project Structure

Generated/vendor folders such as `node_modules/`, `dist/`, `test-results/`, coverage output, and Python `__pycache__/` are intentionally excluded.

```text
simtalk/
|-- README.md
|-- PRD.md
|-- System_Architecture.md
|-- package.json
|-- pnpm-workspace.yaml
|-- pnpm-lock.yaml
|-- tsconfig.base.json
|-- playwright.config.ts
|-- components.json               # stale shadcn scaffold config
|-- .agentic/                    # Agentic OS project memory, codemap, subsystem notes
|-- .cursor/                     # Cursor plans and project-local skills
|-- backend/
|   |-- .env.example
|   |-- package.json
|   |-- tsconfig.json
|   |-- tsconfig.test.json
|   |-- vitest.config.ts
|   `-- src/
|       |-- app.ts
|       |-- config.ts
|       |-- server.ts
|       |-- middleware/
|       |   |-- cors.ts
|       |   |-- rateLimit.ts
|       |   `-- securityHeaders.ts
|       |-- routes/
|       |   |-- health.ts
|       |   `-- realtime.ts
|       `-- services/
|           `-- openAiRealtime.ts
|-- frontend/
|   |-- .env.example
|   |-- index.html
|   |-- package.json
|   |-- tsconfig.json
|   |-- tsconfig.app.json
|   |-- tsconfig.node.json
|   |-- tsconfig.test.json
|   |-- vite.config.ts
|   `-- src/
|       |-- App.tsx
|       |-- main.tsx
|       |-- realtimeTokenClient.ts
|       |-- realtimeTranslationSession.ts
|       |-- styles/
|       |   `-- tokens.css
|       |-- components/
|       |   |-- brand/            # brand primitives, icons, language and mode controls
|       |   |-- screens/          # Lobby, mode surfaces, transcript sheet, summary
|       |   |-- session/          # SessionHeader and DevDrawer
|       |   `-- ui/               # unused shadcn-style scaffold remnants
|       `-- lib/
|           `-- utils.ts          # unused shadcn-style scaffold remnant
|-- shared/
|   `-- types/
|       |-- package.json
|       |-- tsconfig.json
|       |-- tsconfig.test.json
|       |-- vitest.config.ts
|       `-- src/
|           `-- index.ts
|-- tests/
|   |-- backend/
|   |   |-- integration/
|   |   `-- unit/
|   |-- frontend/
|   |   |-- component/
|   |   |-- unit/
|   |   `-- support/
|   |-- shared/
|   |   `-- unit/
|   `-- e2e/
|-- scripts/
|   `-- agentic/
`-- docs/
    `-- _generated/              # docsync working artifacts
```

## Local Development

Prerequisites:

- Node.js 22+
- pnpm 10+
- OpenAI API key for realtime token minting

Setup:

```bash
git clone git@github.com:t8/simtalk.git
cd simtalk
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Populate `backend/.env` before starting the backend:

- `OPENAI_API_KEY` is required for `POST /realtime/token`.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are required for `POST /rooms` and `POST /rooms/:roomId/token` (Phase 1.5 remote rooms). Without these, the remote-room routes return `503 missing_server_config` and the lobby surfaces "Remote rooms are not configured".

The backend dev script loads `backend/.env` via Node's native `--env-file` flag; restarting the backend is required after editing the file.

Run both app packages:

```bash
pnpm dev
```

Services:

- Frontend: `http://127.0.0.1:5173` (`localhost:5173` is also accepted by local CORS config)
- Backend: `http://localhost:3000`

Root scripts:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The root scripts build `@simtalk/shared-types` first where needed so frontend/backend package imports resolve consistently.

## Environment Variables

Backend variables in `backend/.env.example`:

```bash
APP_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
OPENAI_API_KEY=
OPENAI_REALTIME_CLIENT_SECRET_URL=https://api.openai.com/v1/realtime/translations/client_secrets
OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS=600
OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL=gpt-realtime-whisper
REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS=60000
REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS=5
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_TOKEN_TTL_SECONDS=600
LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS=300
LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS=60
ROOM_TOKEN_RATE_LIMIT_WINDOW_MS=60000
ROOM_TOKEN_RATE_LIMIT_MAX_REQUESTS=10
```

Frontend variables in `frontend/.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

Notes:

- `OPENAI_API_KEY` must never be exposed through a frontend `VITE_*` variable.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are backend-only and must never be exposed through frontend `VITE_*` variables.
- `OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL` controls the input transcription model sent to OpenAI when minting a realtime translation client secret.
- `ALLOWED_ORIGINS` should include the production frontend origin in deployed environments, for example `https://simtalk.dev`.
- For the single-project Vercel deploy, set `VITE_API_BASE_URL=/api`.
- Remote room UI stores only an opaque participant identity in `sessionStorage` for reload continuity. It does not store transcripts, room tokens, OpenAI client secrets, or LiveKit participant tokens.

## API Usage

Health check:

```bash
curl http://localhost:3000/health
```

Realtime token request:

```bash
curl -X POST http://localhost:3000/realtime/token \
  -H "Content-Type: application/json" \
  -d '{"mode":"listener","targetLanguage":"es"}'
```

Turn-about and Practice requests include `sourceLanguage`:

```bash
curl -X POST http://localhost:3000/realtime/token \
  -H "Content-Type: application/json" \
  -d '{"mode":"turnabout","sourceLanguage":"en","targetLanguage":"es"}'
```

The token route requires a configured backend `OPENAI_API_KEY`. It returns a short-lived browser credential and OpenAI translation calls URL, not the server API key.

Remote room creation:

```bash
curl -X POST http://localhost:3000/rooms
```

Remote room token request:

```bash
curl -X POST http://localhost:3000/rooms/room_abcdefghijklmnopqrstuvwxyz/token \
  -H "Content-Type: application/json" \
  -d '{"participantIdentity":"participant_abcdefghijklmnop","targetLanguage":"es"}'
```

The room token route requires configured backend LiveKit credentials. It returns a short-lived room-scoped participant token, not the LiveKit API secret.

## Testing

Current test locations:

- `tests/shared/unit/` - shared Zod schemas, constants, and inferred contracts.
- `tests/backend/unit/` - backend config and OpenAI realtime service behavior.
- `tests/backend/integration/` - Hono app routes, CORS, headers, token validation, error mapping, and rate limiting.
- `tests/frontend/unit/` - frontend token client and WebRTC service.
- `tests/frontend/component/` - React UI/session flow tests.
- `tests/frontend/support/` - Testing Library setup.
- `tests/e2e/` - Playwright browser tests with mocked token/OpenAI network boundaries.
- `scripts/agentic/test_*.py` - Python unittest coverage for Agentic OS scripts.

Run all package unit/component/integration tests:

```bash
pnpm test
```

Run browser E2E tests:

```bash
pnpm test:e2e
```

Current E2E coverage is intentionally small: it verifies the frontend shell plus mocked launch/session/summary flows. It does not yet exercise a live OpenAI WebRTC session.

## Deployment

Phase 1 target:

- One Vercel project for the frontend and thin Hono API functions mounted under `/api`.
- Custom domain: `simtalk.dev`.
- Vercel Password Protection for private access in Phase 1 and Phase 1.5.
- Environment variables configured in Vercel project settings.
- Build command: `pnpm --filter @simtalk/shared-types build && pnpm --filter @simtalk/frontend build`.
- Output directory: `frontend/dist`.
- Health check: `GET /api/health` or `/health` via Vercel rewrite.

### Required Vercel environment variables

Set these in **Vercel Project Settings → Environment Variables** for every environment that should serve API traffic (Production, Preview, and any Development environment that hits the deployed API). `vercel.json` intentionally does not list secret values; only the platform settings hold them. The Hono API at `api/[...route].ts` calls `createAppConfig()` which reads `process.env` — any missing variable causes the corresponding feature to return `503 missing_server_config` at request time, not at deploy time.

Required for `POST /realtime/token`:

| Variable         | Purpose                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` | Server-only OpenAI key used to mint short-lived browser client secrets. Never expose via `VITE_*`. |

Required for `POST /rooms` and `POST /rooms/:roomId/token` (Phase 1.5 remote rooms):

| Variable             | Purpose                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVEKIT_URL`        | LiveKit Cloud project URL, e.g. `wss://<project>.livekit.cloud`. Returned to the browser inside the room-token response so the client can connect. |
| `LIVEKIT_API_KEY`    | LiveKit API key. Server-only; never expose via `VITE_*`.                                                                                           |
| `LIVEKIT_API_SECRET` | LiveKit API secret. Server-only; never expose via `VITE_*`.                                                                                        |

Recommended (have safe defaults; override only if you have a reason):

| Variable                                    | Default                                       | Range                                                                                                |
| ------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                   | `development`                                 | free text; set to `production` in prod                                                               |
| `PORT`                                      | `3000`                                        | 1–65535 (ignored on Vercel; used by self-host)                                                       |
| `ALLOWED_ORIGINS`                           | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated origins; **set to the deployed frontend origin in prod**, e.g. `https://simtalk.dev` |
| `OPENAI_REALTIME_CLIENT_SECRET_URL`         | OpenAI translations client-secret endpoint    | full URL                                                                                             |
| `OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS` | `600`                                         | 10–7200                                                                                              |
| `OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL` | `gpt-realtime-whisper`                        | model name                                                                                           |
| `REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS`       | `60000`                                       | 1_000–3_600_000                                                                                      |
| `REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS`    | `5`                                           | 1–100                                                                                                |
| `LIVEKIT_TOKEN_TTL_SECONDS`                 | `600`                                         | 60–3600                                                                                              |
| `LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS`        | `300`                                         | 30–3600                                                                                              |
| `LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS`    | `60`                                          | 10–600                                                                                               |
| `ROOM_TOKEN_RATE_LIMIT_WINDOW_MS`           | `60000`                                       | 1_000–3_600_000                                                                                      |
| `ROOM_TOKEN_RATE_LIMIT_MAX_REQUESTS`        | `10`                                          | 1–100                                                                                                |

Frontend build-time variables (set in the same Vercel UI; safe to expose because they are bundled into the client):

| Variable            | Default                       | Notes                                               |
| ------------------- | ----------------------------- | --------------------------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:3000` (dev) | Set to `/api` for the single-project Vercel deploy. |

Operational checks after deploy:

```bash
curl -i https://<your-domain>/api/health
curl -i -X POST https://<your-domain>/api/rooms
```

The first should return `200`. The second should return `201` with a `roomId` and `roomUrlPath`. A `503 missing_server_config` from either route means the relevant API key/secret is missing or blank in Vercel project settings.

Local-dev parity: the backend dev script uses Node's native `--env-file` flag (`tsx watch --env-file=.env src/server.ts`) to load `backend/.env`. There is no `dotenv` dependency. If `backend/.env` is missing the process will fail to start with a clear error — copy from `backend/.env.example` and populate the secrets locally.

Current repo status:

- GitHub Actions CI and Vercel deploy workflows are configured in `.github/workflows/`.
- Vercel project config is committed in `vercel.json` (rewrites, CSP, security headers — no secret values).
- No Dockerfile or Cloud Run config exists.
- Vercel project settings, password protection, domain, and secrets remain out-of-repo.

Phase 2 target:

- Google Cloud Run services.
- Real authentication.
- Persistent preferences/history where explicitly approved.
- Multi-user room/media orchestration, likely through LiveKit or equivalent.
- Managed secrets and HTTPS load balancing.

## Development Standards

General:

- Keep TypeScript strict.
- Validate runtime boundaries with Zod.
- Prefer shared contracts from `@simtalk/shared-types` over duplicate request/response types.
- Keep routes thin and move OpenAI/API behavior into service modules.
- Avoid exposing secrets, upstream token payloads, audio, transcripts, or PII in client responses or logs.

Frontend:

- Use semantic HTML and native controls unless a custom component is justified.
- Keep interactive elements keyboard-accessible with visible focus states.
- Use semantic CSS variables for colors and maintain the existing 8px spacing scale.
- Respect `prefers-reduced-motion`.
- Do not rely on color alone to convey state.

Backend:

- Keep CORS strict; do not use `*`.
- Validate token requests before calling OpenAI.
- Keep OpenAI API key server-side only.
- Sanitize upstream errors.
- Treat in-memory rate limiting as a Phase 1 guardrail, not a durable abuse-prevention system.

## AI Coding Assistant Notes

This repository is optimized for AI-assisted development.

Before making non-trivial changes:

1. Read `README.md` and `.agentic/PROJECT_BRIEF.md`.
2. Use Agentic OS routing through `scripts/agentic/route_task.py` when applicable.
3. Check the relevant `.agentic/SUBSYSTEMS/*.md` file, but verify it against code because some subsystem notes still lag the current implementation.
4. Add or update tests for non-trivial logic.
5. Preserve Phase 1 privacy and security invariants.

Important current doc drift outside README:

- `.agentic/SUBSYSTEMS/api.md`, `web.md`, `shared.md`, and `tests.md` still contain planned/unknown status text even though implementation exists.
- `.agentic/PROJECT_BRIEF.md` and `.agentic/LESSONS/decisions.md` still mention Tailwind/shadcn as active frontend technology; package manifests are the source of truth.
- `docs/ux-redesign-plan.md` still reads like a proposal even though much of the UX redesign has landed.
- Refreshing Agentic memory should be done through the dedicated Agentic OS update flow, not by ad hoc edits during ordinary README work.

## Roadmap

Phase 1:

- Polish and validate Listener, Turn-about, and Practice mode behavior.
- Harden browser-local recording and transcript/audio downloads.
- Broaden E2E coverage with OpenAI mocked at the network boundary.
- Add deployment/CI configuration.
- Validate realtime behavior manually with a real OpenAI key and supported browser.

Phase 1.5:

- Vercel hosting
- LiveKit Cloud remote rooms for 2 chat participants

Phase 2:

- Add real user accounts.
- Add persistent preferences.
- Increase remote chat rooms for 3-10 participants.
- Introduce a room/media orchestration layer.

Future:

- Teach Me Mode.
- Subscription billing.
- Native mobile apps.

## Known Limitations

- Mode-specific flows are implemented but still need live validation and product polish.
- Browser-local recording/download is implemented for current session artifacts but still needs broader browser/device validation.
- Playwright currently covers only mocked frontend launch/session paths.
- Realtime WebRTC behavior still requires manual browser validation.
- Rate limiting is in-memory and can reset with process/serverless lifecycle.
- Vercel access control and domain settings are out-of-repo.
- No CI/CD pipeline is currently committed.
- No database or persistent storage exists in Phase 1 by design.

## Decision Log

- 2026-05-20: Build Phase 1 as a private single-device web app.
- 2026-05-20: Use React/Vite + TypeScript for the frontend.
- 2026-05-20: Use Node.js + Hono for the backend.
- 2026-05-20: Use OpenAI `gpt-realtime-translate` over browser WebRTC.
- 2026-05-20: No database in Phase 1.
- 2026-05-20: No server-side transcript storage; recording remains browser-local only.
- 2026-05-20: Deploy Phase 1 to Vercel and migrate backend services to Cloud Run in Phase 2.

## License

Proprietary.

Copyright (c) Throwing Eights Pty Ltd (t8). All rights reserved.
