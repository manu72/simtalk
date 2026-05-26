<!-- agentic:managed:start -->
# api

## Purpose

Small Node/Hono service that authorises sessions, validates input (mode + languages) with Zod, mints short-lived OpenAI Realtime Translate ephemeral tokens, enforces CORS / rate limits / security headers, and exposes a health check. It does NOT proxy audio or transcripts.

## Owned paths

- `backend/`

A top-level `api/` directory also exists at the repo root with its own `tsconfig.json` and a `pnpm typecheck:api` script. It is **not** yet documented as belonging to this subsystem — see Unknowns.

## Public contracts

- `POST /realtime/token` — Zod-validated request (mode, source/target language). Response: short-lived ephemeral client secret + translation calls URL.
- Room routes under `/rooms` issue LiveKit room/session tokens for remote-room flows.
- `GET /health` — liveness check; no secrets in payload.
- All API responses use shared Zod contracts and typed error shapes from `shared/types/src/index.ts`.
- Token responses are `Cache-Control: no-store`.

## Source-of-truth files

- `backend/src/server.ts` → `backend/src/app.ts` — entrypoint and route/middleware wiring.
- `backend/src/routes/{health,realtime}.ts` — API surface.
- `backend/src/services/openAiRealtime.ts` — OpenAI client-secret call wrapper.
- `backend/src/middleware/{accessGate,cors,rateLimit,securityHeaders}.ts` — security boundary.
- `backend/src/config.ts`, `backend/.env.example` — environment contract (`OPENAI_API_KEY`, `APP_ACCESS_PASSWORD`, `ALLOWED_ORIGINS`, etc.).
- `shared/types/src/index.ts` — Zod request/response contracts.
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
- `APP_ACCESS_PASSWORD` is required outside development and protects paid action routes via `X-Access-Password`; `GET /health` remains public.
- Every request to the token endpoint is validated with Zod before any OpenAI call.
- CORS is restricted to the configured `ALLOWED_ORIGINS` (`simtalk.app` in production, plus local dev). Never `*`.
- The token endpoint is rate-limited per client. The Phase 1 limiter is in-memory and resets with process lifecycle.
- Required response headers: CSP, HSTS, X-Frame-Options / `frame-ancestors`, Referrer-Policy, X-Content-Type-Options.
- Logs MUST NOT contain transcript content, audio, or full OpenAI tokens.
- Backend never stores audio or transcripts and has no database in Phase 1.
- Errors from OpenAI are sanitized before returning to the client.
- Routes stay thin; external-API/business logic lives in `backend/src/services/`.

## Common failure modes

- OpenAI API outages or 429s on token issuance.
- Misconfigured `ALLOWED_ORIGINS` blocking the production frontend.
- Token TTL too short (browser fails to connect) or too long (expanded blast radius if leaked).
- In-memory rate limiter losing state on cold starts (if running serverless) → inconsistent throttling.
- Missing or weak security headers.
- Vercel Password Protection bypass secret leaking via logs.

## Do-not-do rules

- Do not return `OPENAI_API_KEY`, full session state, or non-redacted upstream errors to the client.
- Do not treat frontend access-gate state as authorization; backend middleware must enforce protected routes.
- Do not log transcript content, audio, ephemeral tokens, or PII.
- Do not add a database, ORM, or persistent store in Phase 1.
- Do not relax CORS to `*` even in development without a decision entry.
- Do not skip Zod validation on any new endpoint.
- Do not create endpoints that proxy realtime audio or transcripts; the browser must talk to OpenAI directly.

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
- The in-memory rate limiter is a Phase 1 guardrail, not a durable solution. Plan to externalise (Redis / Upstash / similar) when moving to Cloud Run.
- `SESSION_SECRET` and `VERCEL_PROTECTION_BYPASS_SECRET` are placeholders in `.env.example` and not consumed by code yet. Don't assume they exist as runtime config.
<!-- human:notes:end -->
