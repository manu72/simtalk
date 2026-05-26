<!-- agentic:managed:start -->
# Project brief

## Purpose

SimTalk is a realtime speech-to-speech translation web app that lets people who speak different languages converse on a single device. Phase 1 is a private, single-user prototype validating low-latency translated audio across three modes (Listener, Turn-about, Practice).

## Stack

- Languages: TypeScript (strict), Python (Agentic OS tooling only)
- Frameworks: React 19 + Vite 7 (frontend), Hono on `@hono/node-server` (backend), Zod (schema validation), Vitest + React Testing Library, Playwright
- Runtime: Node.js 22+, modern evergreen browsers (WebRTC required)
- Package manager: pnpm 10+
- Realtime: OpenAI `gpt-realtime-translate` via `/v1/realtime/translations` over browser WebRTC

## Deployment

- Phase 1: Vercel (frontend + standalone Node/Hono backend), custom domain `simtalk.app`, Vercel Password Protection plus app-level `APP_ACCESS_PASSWORD` for protected actions.
- CI: `.github/workflows/ci.yml` and `.github/workflows/vercel-deploy.yml` are present.
- Phase 2: Google Cloud Run services (`simtalk-api`, `simtalk-realtime`, `simtalk-worker`), HTTPS load balancer, managed secrets.

## Major subsystems

- `web` — React/Vite/TS frontend; mic, WebRTC, mode UI, transcripts, local recording. `frontend/`. See `SUBSYSTEMS/web.md`.
- `api` — Node/Hono backend; ephemeral token minting, validation, rate limiting, security headers. `backend/`. See `SUBSYSTEMS/api.md`.
- `shared` — Cross-package TypeScript types and Zod contracts. `shared/types/`. See `SUBSYSTEMS/shared.md`.
- `tests` — Vitest + Playwright suites at repo root. `tests/`. See `SUBSYSTEMS/tests.md`.
- `infra` — Vercel deploy config, GitHub Actions, Phase 2 Cloud Run plan. `.github/workflows/`. See `SUBSYSTEMS/infra.md`.

## Source-of-truth files

- `PRD.md` — product scope, modes, non-goals, success metrics.
- `System_Architecture.md` — Phase 1/2 architecture, security controls, runtime flow.
- `README.md` — repo conventions, commands, env vars, decision log.
- `CLAUDE.md` — repo-shape and hard invariants for agents.
- `backend/src/routes/` — API surface (realtime + room tokens).
- `backend/src/middleware/accessGate.ts` — app-level shared-password gate.
- `shared/types/src/index.ts` — Zod contracts shared between frontend and backend.

## External agent instruction sources

- `CLAUDE.md` — repo-shape, commands, hard invariants, frontend notes, environment.
- `AGENTS.md` — absent.
- `.cursor/rules/*` — absent (no per-file rule files).
- `.cursor/skills/*` — repo-local skills: `agenticOS-context`, `agenticOS-update`, `test-structure`.
- `.github/copilot-instructions.md` — absent.

## Conflicts

- `LESSONS/decisions.md` records "Tailwind CSS, shadcn/ui" as the frontend stack (2026-05-20). `CLAUDE.md` and current state describe Tailwind/shadcn as stale scaffold; the active CSS lives in `frontend/src/styles/tokens.css`. Flagged for human review — see human notes below.

## Unknowns

- Top-level `api/` directory (with its own `tsconfig.json` and `pnpm typecheck:api` script) is not documented in any current subsystem file. Likely Vercel API route or compatibility shim; needs classification (`api`? `infra`? new subsystem?).
- Whether the Phase 1 backend deploys as a Vercel serverless function or standalone service — README leans standalone, final call not committed in code.
- Concrete supported language allowlist for Listener and Turn-about modes.
- Rate-limit thresholds and storage strategy for the token endpoint (currently in-memory per `CLAUDE.md`).
- Observability stack (logging/metrics provider).
- Phase 1 session length / cost ceilings.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
## Product intent

SimTalk validates whether OpenAI's realtime translation can deliver "natural" cross-language conversation on a single device with sub-2s time-to-first-translated-audio. The MVP is intentionally narrow: private user, no accounts, three modes (Listener, Turn-about, Practice), no persistence. Phase 1 success unlocks Phase 2 (rooms, multi-user, Cloud Run).

## Architectural philosophy

- The backend is a token-minting service only — it never sees audio or transcripts. This is the single most important architectural constraint and shapes every other decision (no DB, no audio proxy, browser-direct WebRTC to OpenAI).
- Privacy-by-default: optional recording is browser-local, off by default, cleared on refresh.
- Phase 1 decisions must not block Phase 2 — keep the backend thin and portable; avoid hard-coding single-peer assumptions in shared abstractions.
- TypeScript strict mode everywhere; validate every cross-boundary payload with Zod from `@simtalk/shared-types`.

## Business constraints

- OpenAI API cost is per-minute of audio; session-length and cost ceilings are an open question.
- Vercel Password Protection is the deployment-level allowlist; `APP_ACCESS_PASSWORD` is the application-level gate. Neither is a real auth model — both are interim.
- Time-to-first-translated-audio < 2s is a product-critical metric; latency regressions block release.

## Project-specific judgement

- Treat `LESSONS/decisions.md` as authoritative for *recorded* intent, but cross-check with `CLAUDE.md` and current code before assuming a recorded decision still describes the system. The Tailwind/shadcn entry is the current known mismatch.
- Phase 2 work (LiveKit rooms, Supabase, multi-user) is **out of current scope** — surface as an architectural change requiring a decision entry, not as ordinary work.
- The Agentic OS tooling under `.agentic/` and `scripts/agentic/` is not application code; do not modify it during normal feature work.
<!-- human:notes:end -->
