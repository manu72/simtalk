<!-- generated-on-init: after bootstrap this file is curated; do not overwrite without explicit confirmation. -->

# Project brief

## Purpose

SimTalk is a realtime speech-to-speech translation web app that lets people who speak different languages converse naturally on a single device. Phase 1 is a private, single-user prototype validating low-latency translated audio across three modes (Listener, Turn-about, Practice).

## Stack

- Languages: TypeScript
- Frameworks: React 19 + Vite 7 (frontend), Hono (backend), Tailwind CSS + shadcn/ui (UI), Zod (schema validation)
- Runtime: Node.js 22+, modern evergreen browsers (WebRTC required)
- Package manager: pnpm 10+
- Realtime: OpenAI `gpt-realtime-translate` via `/v1/realtime/translations` over browser WebRTC
- Test stack: Vitest + React Testing Library (frontend, backend), Playwright (E2E)

## Architecture (high level)

- Browser owns mic capture, WebRTC session to OpenAI, transcript rendering, optional local-only recording. See `.agentic/SUBSYSTEMS/web.md`.
- Node/Hono backend mints short-lived OpenAI ephemeral realtime tokens, validates mode/language requests, enforces CORS and rate limits. No transcript or audio passes through it. See `.agentic/SUBSYSTEMS/api.md`.
- OpenAI Realtime Translate handles speech recognition, translation, audio synthesis, and transcript deltas. The browser connects directly via WebRTC after the backend issues a token.
- Phase 1 has no database and no server-side transcript storage. Local recordings stay in the browser.
- Phase 2 (out of current scope) moves backend to Google Cloud Run, adds Supabase Auth + Postgres, and a multi-user room layer (likely LiveKit).

## Deployment

- Phase 1: Vercel (frontend + standalone Node/Hono backend), custom domain `simtalk.app`, Vercel Password Protection + single-user allowlist.
- Phase 2: Google Cloud Run services (`simtalk-api`, `simtalk-realtime`, `simtalk-worker`), HTTPS load balancer, managed secrets.

## Major subsystems

- `web` — React/Vite/TS frontend; mic, WebRTC, mode UI, transcripts, local recording. `frontend/`.
- `api` — Node/Hono backend; ephemeral token minting, validation, rate limiting, security headers. `backend/`.
- `shared` — Cross-package TypeScript types and contracts. `shared/types/`.
- `tests` — E2E test suite (Playwright) sitting at repo root. `tests/`.
- `scripts` — Local developer and Agentic OS tooling. `scripts/`.
- `infra` — Vercel project config and planned GitHub Actions workflows; no in-repo infra config exists yet.

## Source-of-truth files

- `PRD.md` — product scope, modes, non-goals, success metrics.
- `System_Architecture.md` — Phase 1/2 architecture, security controls, runtime flow.
- `README.md` — repo conventions, commands, env vars, decision log.
- `backend/src/routes/` (planned) — API surface, including the realtime token endpoint.
- `backend/src/schemas/` (planned) — Zod request/response contracts.
- `shared/types/` (planned) — types shared between frontend and backend.

## Key constraints

- OpenAI API key MUST never reach the browser. The browser only ever sees short-lived ephemeral tokens.
- No server-side storage of audio or transcript content in Phase 1. Local recording is opt-in, off by default, browser-only.
- Strict CORS limited to `simtalk.app` (and local dev origins). Rate-limit the token endpoint.
- Required security headers: CSP, HSTS, X-Frame-Options / frame-ancestors, Referrer-Policy.
- Time-to-first-translated-audio target < 2 seconds. Latency regressions are product-critical.
- TypeScript strict mode; validate at all boundaries with Zod.
- Phase 1 decisions must not block Phase 2 (rooms, auth, persistence).

## Unknowns

- Whether the Phase 1 Node/Hono backend will deploy as a Vercel serverless function or a standalone Vercel-hosted service. README and architecture spec lean toward standalone for easier Cloud Run migration; final call not yet committed in code.
- Concrete supported language list for Listener and Turn-about modes (PRD says "any supported", no explicit allowlist defined yet).
- Rate-limit thresholds and storage (in-memory vs. external) for the token endpoint.
- Observability stack (logging/metrics target) — README mentions lightweight capture but does not name a provider.
- Exact Phase 1 session length / cost ceilings before the user is warned or cut off.

## Maintenance notes

This file is generated during initial bootstrap, then maintained by humans or explicit Agentic OS update tasks only.
