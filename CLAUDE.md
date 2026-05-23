# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Shape

pnpm workspace (Node 22+, pnpm 10+) with three packages:

- `frontend/` — `@simtalk/frontend`, React 19 + Vite 7, TypeScript strict. Dev server on `127.0.0.1:5173`.
- `backend/` — `@simtalk/backend`, Hono on `@hono/node-server`, run via `tsx watch`. Listens on `:3000`.
- `shared/types/` — `@simtalk/shared-types`, Zod schemas + inferred TS types. **Must be built before backend/frontend typecheck or test** (root scripts do this automatically; individual package commands may not).

Tests live at the repo root in `tests/` (not colocated): `tests/{backend,frontend,shared}/{unit,integration,component,support}` and `tests/e2e/` (Playwright). Test layout is governed by `.cursor/skills/test-structure/SKILL.md` — preserve this when adding tests.

## Commands

Root (run from repo root, build `shared-types` first):

```bash
pnpm dev          # parallel: shared-types build, backend (tsx watch), frontend (vite)
pnpm build        # shared-types -> backend (tsc) -> frontend (tsc -b && vite build)
pnpm typecheck    # all packages, including tsconfig.test.json
pnpm test         # vitest run across shared, backend, frontend
pnpm test:e2e     # Playwright (shared-types built first)
```

Per-package (cd into the package; remember `pnpm --filter @simtalk/shared-types build` first if you've touched shared types):

```bash
pnpm --filter @simtalk/backend test
pnpm --filter @simtalk/frontend test
pnpm --filter @simtalk/shared-types test
```

Single test file / test name:

```bash
pnpm --filter @simtalk/backend exec vitest run path/to/file.test.ts
pnpm --filter @simtalk/frontend exec vitest run -t "test name pattern"
pnpm exec playwright test tests/e2e/foo.spec.ts --grep "smoke"
```

## Architecture

Three-boundary realtime translation flow. The backend is a **token-minting service only** — it never sees audio or transcripts.

1. **Browser** (`frontend/src/`)
   - `App.tsx` renders mode/language/session UI.
   - `realtimeTokenClient.ts` POSTs to backend `/realtime/token`, schema-validates the response with `@simtalk/shared-types`.
   - `realtimeTranslationSession.ts` owns mic capture, `RTCPeerConnection`, SDP exchange directly with OpenAI, remote audio playback, transcript deltas, and teardown. All WebRTC lifecycle lives here.

2. **Hono backend** (`backend/src/`)
   - `server.ts` -> `app.ts` wires middleware (`middleware/{cors,rateLimit,securityHeaders}.ts`) and routes (`routes/{health,realtime}.ts`).
   - `routes/realtime.ts` validates request with shared Zod schemas, then calls `services/openAiRealtime.ts`, which hits OpenAI's client-secret endpoint using server-only `OPENAI_API_KEY`.
   - Returns a short-lived client secret + translation calls URL. Never returns the server API key. Errors from OpenAI are sanitized before returning to the client. Responses are `Cache-Control: no-store`.
   - In-memory rate limiter on `POST /realtime/token` — resets with process lifecycle (Phase 1 guardrail, not durable).

3. **OpenAI Realtime Translate** — browser sends SDP offer directly to the translation calls URL using the issued client secret; OpenAI returns SDP answer, translated audio, and transcript deltas.

Shared contracts in `shared/types/src/index.ts` are the **source of truth** for request/response shapes (modes, language tags, token req/resp, API errors, health). Use them at every cross-boundary point; do not redefine.

## Hard Invariants (Phase 1)

- `OPENAI_API_KEY` is backend-only — never exposed via `VITE_*` or returned in responses.
- No server-side persistence of audio, transcripts, or PII. No database. No backend audio proxy.
- CORS strictly reflects `ALLOWED_ORIGINS` — never `*`.
- Required response headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options.
- Validate every cross-boundary payload with Zod from `@simtalk/shared-types`.
- Keep routes thin; put external-API/business logic in `services/`.
- TypeScript strict everywhere.

## Frontend Notes

- UI uses semantic HTML + native controls; custom CSS variables and inline component styles should preserve the existing 8px spacing rhythm.
- Active global CSS lives in `frontend/src/styles/tokens.css`, imported by `frontend/src/main.tsx`. It defines SimTalk brand tokens, semantic color aliases, base styles, and reduced-motion handling.
- Tailwind, shadcn/ui runtime dependencies, `@radix-ui/react-slot`, `class-variance-authority`, and `tailwind-merge` are not installed in the active frontend package. `components.json`, `frontend/src/components/ui/`, and `frontend/src/lib/utils.ts` are stale scaffold remnants unless revived deliberately.
- Respect `prefers-reduced-motion`; never rely on color alone for state.

## Agentic OS

`.agentic/` and `scripts/agentic/` form an in-repo task-routing/memory system (Python 3, unittest). Do not modify these unless explicitly asked. Subsystem notes under `.agentic/SUBSYSTEMS/` (`api.md`, `web.md`, `shared.md`, `tests.md`) lag the implementation — verify against code before trusting them. README flags this drift explicitly.

When running Python scripts here, use `python3` (macOS default).

## Environment

Copy `backend/.env.example` -> `backend/.env` and `frontend/.env.example` -> `frontend/.env`. Backend needs `OPENAI_API_KEY` to exercise `POST /realtime/token` against OpenAI live. `SESSION_SECRET` and `VERCEL_PROTECTION_BYPASS_SECRET` are placeholders for deployment access control and are not consumed by code yet.
