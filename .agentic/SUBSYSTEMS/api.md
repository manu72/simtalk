<!-- agentic:managed:start -->
# api

## Purpose

Small Node/Hono service that authorises sessions, validates input (mode + languages) with Zod, mints short-lived OpenAI Realtime Translate ephemeral tokens, brokers image-to-text translation via OpenAI vision chat completions, enforces CORS / rate limits / security headers, and exposes a health check. It does NOT proxy realtime audio or transcripts.

## Owned paths

- `backend/`

A top-level `api/` directory also exists at the repo root with its own `tsconfig.json` and a `pnpm typecheck:api` script. It is **not** yet documented as belonging to this subsystem — see Unknowns.

## Public contracts

- `POST /realtime/token` — Zod-validated request (mode, source/target language). Response: short-lived ephemeral client secret + translation calls URL.
- `POST /image-translate/translate` — multipart/form-data (`image` File + `targetLanguage` string). Backend reads bytes (≤ `imageTranslateMaxBytes`), calls OpenAI chat completions with vision, returns `{ sourceLanguage, originalText, translatedText, modelTier }`. Unlike realtime, this is a non-streaming server→OpenAI call; the browser does not talk to OpenAI directly.
- Room routes under `/rooms` issue LiveKit room/session tokens for remote-room flows.
- `GET /health` — liveness check; no secrets in payload.
- All API responses use shared Zod contracts and typed error shapes from `shared/types/src/index.ts`.
- Successful translation/token responses are `Cache-Control: no-store`.

## Source-of-truth files

- `backend/src/server.ts` → `backend/src/app.ts` — entrypoint and route/middleware wiring.
- `backend/src/routes/{health,realtime,imageTranslate,rooms}.ts` — API surface.
- `backend/src/services/openAiRealtime.ts` — OpenAI client-secret call wrapper.
- `backend/src/services/openAiImageTranslate.ts` — OpenAI vision chat-completions wrapper for image translation; primary + fallback model tier with bounded server-side timeout.
- `backend/src/services/liveKitRooms.ts` — LiveKit room/session token issuance for remote rooms.
- `backend/src/middleware/{accessGate,cors,rateLimit,securityHeaders}.ts` — security boundary. Per-route rate limiters: realtime token, image translate, room token.
- `backend/src/config.ts`, `backend/.env.example` — environment contract (`OPENAI_API_KEY`, `APP_ACCESS_PASSWORD`, `ALLOWED_ORIGINS`, image-translate model/timeout/size limits, etc.).
- `shared/types/src/index.ts` — Zod request/response contracts (realtime, image-translate, rooms, API errors).
- `System_Architecture.md` §4, §5 — security controls and runtime flow.
- `CLAUDE.md` "Hard Invariants" — non-negotiable Phase 1 rules.

## Related tests

- Unit: `tests/backend/unit/` — services, config, schemas, middleware.
- Integration: `tests/backend/integration/` — routes and middleware end-to-end.
- Run from repo root with `pnpm test` so `@simtalk/shared-types` builds first.

## Dependencies

- `web` — only consumer of the realtime token endpoint.
- `shared` — Zod schemas / TypeScript types shared with the frontend.
- `infra` — environment variables, Vercel project settings, CI.
- OpenAI client-secret endpoint (external).

## Invariants

- `OPENAI_API_KEY` is read only on the server; it MUST NOT be returned to clients in any form or exposed via `VITE_*`.
- `APP_ACCESS_PASSWORD` is required outside development and protects paid action routes (realtime token, image translate, rooms) via `X-Access-Password`; `GET /health` remains public.
- Every request to a paid action is validated with shared Zod schemas before any OpenAI/LiveKit call. Image-translate also enforces MIME (`imageTranslateMimeTypeSchema`), declared length, and on-disk byte size against `imageTranslateMaxBytes`.
- CORS is restricted to the configured `ALLOWED_ORIGINS` (`simtalk.app` in production, plus local dev). Never `*`.
- Each paid action route has its own rate limiter (realtime, image-translate, rooms). The Phase 1 limiter is in-memory and resets with process lifecycle.
- Required response headers: CSP, HSTS, X-Frame-Options / `frame-ancestors`, Referrer-Policy, X-Content-Type-Options.
- Logs MUST NOT contain transcript content, audio, image bytes, OCR text, or full OpenAI tokens.
- Backend never stores audio, transcripts, or uploaded images and has no database in Phase 1. Image bytes live only for the lifetime of a single request.
- Errors from OpenAI are sanitized into typed kinds before returning to the client: content-policy / refusal → `content_blocked` (HTTP 422); transport / timeout / 5xx → `openai_unavailable` (HTTP 502); missing config → `missing_server_config` (HTTP 503).
- Image-translate uses a primary + fallback model tier with a bounded server-side timeout. AbortController timeouts on the primary model MUST NOT trigger a fallback retry (would roughly double user wait); only genuine transport errors fall through to the fallback.
- Routes stay thin; external-API/business logic lives in `backend/src/services/`.

## Common failure modes

- OpenAI API outages, 429s, or 5xx on token issuance or image translation.
- Misconfigured `ALLOWED_ORIGINS` blocking the production frontend.
- Token TTL too short (browser fails to connect) or too long (expanded blast radius if leaked).
- In-memory rate limiter losing state on cold starts (if running serverless) → inconsistent throttling.
- Missing or weak security headers.
- Vercel Password Protection bypass secret leaking via logs.
- Image-translate server-side timeout firing before OpenAI responds, especially on the fallback model tier; surfaces as `openai_unavailable`/`upstream_unavailable` and must not retry.
- Oversized or non-image multipart uploads bypassing the declared-length pre-check (must still be caught by post-read size guard).

## Do-not-do rules

- Do not return `OPENAI_API_KEY`, full session state, or non-redacted upstream errors to the client.
- Do not treat frontend access-gate state as authorization; backend middleware must enforce protected routes.
- Do not log transcript content, audio, image bytes, OCR'd text, ephemeral tokens, or PII.
- Do not add a database, ORM, or persistent store in Phase 1. Do not persist uploaded images beyond a single request.
- Do not relax CORS to `*` even in development without a decision entry.
- Do not skip Zod validation on any new endpoint. For multipart endpoints, validate the JSON-shaped fields against the shared schema before assembling/parsing the body.
- Do not create endpoints that proxy realtime audio or transcripts; the browser must talk to OpenAI directly for the realtime path.
- Do not retry the image-translate fallback model on an in-process AbortController timeout — fail fast as `upstream_unavailable`.

## Related lessons

- `LESSONS/decisions.md` — 2026-05-20 Node/Hono backend, OpenAI gpt-realtime-translate, no DB, no server-side transcripts; 2026-05-24 access gate.

## Unknowns

- Top-level `api/` directory (separate from `backend/`) — likely a Vercel API route or compatibility shim. Not yet classified. Investigate before treating it as part of this subsystem.
- Final deploy shape (Vercel serverless function vs. standalone Node service).
- Rate-limit thresholds and whether to externalise state for serverless deploys.
- Token TTL chosen for `gpt-realtime-translate` ephemeral secrets.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
- The "no audio or transcript ever touches the backend" rule is the single most important architectural constraint. Any proposed endpoint that ingests audio, transcripts, or large session payloads is a red flag — escalate to a decision entry.
- Image bytes do flow through the backend for the image-translate flow, but only for a single request — they MUST NOT be persisted, logged, or forwarded anywhere except OpenAI's vision endpoint. Any proposal to keep them is a red flag — escalate to a decision entry.
- The in-memory rate limiter is a Phase 1 guardrail, not a durable solution. Plan to externalise (Redis / Upstash / similar) when moving to Cloud Run.
- `SESSION_SECRET` and `VERCEL_PROTECTION_BYPASS_SECRET` are placeholders in `.env.example` and not consumed by code yet. Don't assume they exist as runtime config.
<!-- human:notes:end -->
