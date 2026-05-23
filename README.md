# SimTalk

Speak naturally. Hear instantly.

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
- Hono backend with `GET /health` and `POST /realtime/token`.
- Shared Zod schemas and inferred TypeScript types for modes, language tags, token requests/responses, API errors, and health responses.
- Server-side OpenAI realtime translation client-secret minting.
- Configured-origin CORS, baseline security headers, and in-memory rate limiting for token issuance.
- Browser token request client with schema validation and timeout handling.
- Browser-native WebRTC setup using microphone capture, `RTCPeerConnection`, SDP exchange with OpenAI, remote translated audio playback, transcript delta handling, and cleanup.
- Browser-local listener recording, practice recording, transcript copy/download, and audio download when a recording exists.
- Vitest coverage for shared contracts, backend config/routes/services, frontend components/clients/WebRTC service, plus Playwright browser flows with mocked token/OpenAI network boundaries.

Still pending:

- Polishing and broader validation of the implemented Listener, Turn-about, and Practice flows.
- Broader recording coverage and UX hardening beyond the current browser-local implementation.
- In-repo CI/deploy configuration.
- Manual realtime validation with a real OpenAI key and browser microphone permissions.

## Technology Stack

Phase 1:

| Layer | Current technology |
| --- | --- |
| Frontend | React 19, Vite 7, TypeScript |
| UI styling | CSS variables, brand primitives, and component styles |
| Backend | Node.js 22+, Hono |
| Shared contracts | TypeScript, Zod |
| Realtime translation | OpenAI `gpt-realtime-translate` |
| Browser transport | WebRTC |
| Package manager | pnpm 10.16.1 |
| Unit/component tests | Vitest, React Testing Library, jsdom |
| E2E tests | Playwright |
| Deployment target | Vercel for Phase 1 |
| Authentication/access | Vercel Password Protection and allowlist, configured out of repo |
| Database | None in Phase 1 |
| Server-side audio/transcript storage | None |

Tailwind CSS and shadcn/ui are architecture options from earlier planning, but they are not installed in the active frontend package. `components.json`, `frontend/src/components/ui/`, and `frontend/src/lib/utils.ts` remain as scaffold remnants and are not part of the current UI path.

Phase 2 target stack:

| Layer | Planned technology |
| --- | --- |
| Backend hosting | Google Cloud Run |
| Authentication | Supabase Auth, Firebase Auth, Auth0, or equivalent |
| Database | Supabase Postgres or Cloud SQL |
| Realtime rooms | LiveKit or equivalent |
| Object storage | GCS or Supabase Storage for explicitly user-controlled recordings |

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
   - Validates requests with shared Zod schemas.
   - Reads `OPENAI_API_KEY` server-side only.
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
- Token requests are validated before any OpenAI call.
- `POST /realtime/token` uses an in-memory per-client rate limiter.
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

Set `OPENAI_API_KEY` in `backend/.env` before exercising `POST /realtime/token` against OpenAI.

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
APP_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
OPENAI_API_KEY=
OPENAI_REALTIME_CLIENT_SECRET_URL=https://api.openai.com/v1/realtime/translations/client_secrets
OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS=600
OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL=gpt-realtime-whisper
REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS=60000
REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS=5
SESSION_SECRET=
VERCEL_PROTECTION_BYPASS_SECRET=
```

Frontend variables in `frontend/.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

Notes:

- `OPENAI_API_KEY` must never be exposed through a frontend `VITE_*` variable.
- `OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL` controls the input transcription model sent to OpenAI when minting a realtime translation client secret.
- `APP_URL`, `SESSION_SECRET`, and `VERCEL_PROTECTION_BYPASS_SECRET` are reserved for Phase 1 deployment/access-control integration and are not currently consumed by backend code.
- `ALLOWED_ORIGINS` should include the production frontend origin in deployed environments.

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

- Vercel for the frontend and thin Node/Hono backend.
- Custom domain: `simtalk.app`.
- Vercel Password Protection and a single-user allowlist for private access.
- Environment variables configured in Vercel project settings.

Current repo status:

- No `.github/workflows/` directory exists.
- No Vercel config file exists.
- No Dockerfile or Cloud Run config exists.
- Deployment settings are currently out-of-repo.

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
- `docs/ux-redesign-plan.md` still reads like a proposal even though much of the UX redesign has landed.
- Refreshing Agentic memory should be done through the dedicated Agentic OS update flow, not by ad hoc edits during ordinary README work.

## Roadmap

Phase 1:

- Polish and validate Listener, Turn-about, and Practice mode behavior.
- Harden browser-local recording and transcript/audio downloads.
- Broaden E2E coverage with OpenAI mocked at the network boundary.
- Add deployment/CI configuration.
- Validate realtime behavior manually with a real OpenAI key and supported browser.

Phase 2:

- Add real user accounts.
- Add persistent preferences.
- Add 2-user rooms, then 3-10 participant rooms.
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
