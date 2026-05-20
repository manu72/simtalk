# api (backend)

> Status: planned. Code not yet implemented at init time. Update this file once `backend/` lands.

## Purpose

Small Node/Hono service that authorises sessions, validates input (mode + languages), mints short-lived OpenAI Realtime Translate ephemeral tokens, enforces CORS / rate limits / security headers, and exposes a health check. It does NOT proxy audio or transcripts.

## Source-of-truth files

- `backend/package.json` — Unknown (not yet present).
- `backend/src/routes/` — Unknown. Expected: `health`, realtime token route.
- `backend/src/services/` — Unknown. Expected: OpenAI client wrapper, session policy, rate limiter.
- `backend/src/schemas/` — Unknown. Zod request/response schemas.
- `backend/src/middleware/` — Unknown. Auth gate, CORS, security headers, rate limit.
- `backend/.env.example` — Unknown. Variables documented in `README.md`.
- `System_Architecture.md` §4, §5 — security controls and runtime flow.

## Public contracts

- `POST /<realtime-token-route>` (path TBD): request validated by Zod (mode, source/target language). Response: short-lived ephemeral token + session metadata. Token TTL must be short.
- `GET /health` (path TBD): liveness check, no secrets in payload.
- All requests share a JSON envelope and a typed error shape (TBD in `shared/types/`).

## Invariants

- `OPENAI_API_KEY` is read only on the server; it MUST NOT be returned to clients in any form.
- Every request to the token endpoint is validated with Zod before any OpenAI call.
- CORS is restricted to the configured `ALLOWED_ORIGINS` (`simtalk.app` in production, plus local dev).
- The token endpoint is rate-limited per client. Limits are conservative by default.
- Required response headers: CSP, HSTS, X-Frame-Options / `frame-ancestors`, Referrer-Policy.
- Logs MUST NOT contain transcript content, audio, or full OpenAI tokens. Log only metadata required for observability.
- Backend never stores audio or transcripts and has no database in Phase 1.

## Common failure modes

- OpenAI API outages or 429s on token issuance.
- Misconfigured `ALLOWED_ORIGINS` blocking the production frontend.
- Token TTL too short (browser fails to connect) or too long (expanded blast radius if leaked).
- Rate limiter losing state on cold starts (if running serverless) leading to inconsistent throttling.
- Missing or weak security headers.
- Vercel Password Protection bypass secret leaking via logs.

## Tests

- Vitest unit tests for services, schemas, middleware at `backend/src/**/*.test.ts` — Unknown.
- Vitest integration tests for routes (token issuance, health, error envelopes) at `backend/src/**/*.int.test.ts` or `tests/` — Unknown.
- Run with `pnpm test` from the backend workspace once configured.

## Related subsystems

- `web` — only consumer of the realtime token endpoint.
- `shared` — Zod schemas / TypeScript types shared with the frontend.
- `infra` — environment variables, Vercel project settings, CI.

## Do-not-do rules

- Do not return `OPENAI_API_KEY`, full session state, or non-redacted upstream errors to the client.
- Do not log transcript content, audio, ephemeral tokens, or PII.
- Do not add a database, ORM, or persistent store in Phase 1.
- Do not relax CORS to `*` even in development without a decision entry.
- Do not skip Zod validation on any new endpoint.
- Do not create endpoints that proxy realtime audio or transcripts; the browser must talk to OpenAI directly.
