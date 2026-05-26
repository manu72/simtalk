# Subsystems

One file per major subsystem. Each file is short and routing-oriented:

- Purpose
- Owned paths
- Public contracts
- Source-of-truth files
- Related tests
- Dependencies
- Invariants
- Common failure modes
- Do-not-do rules
- Related lessons
- Unknowns

Create a subsystem file only when evidence is strong (clear top-level folder, manifest/entry point, or explicit doc). Prefer `Unknown` over invention.

## SimTalk subsystems

- `web.md` — React/Vite/TypeScript frontend (mic, WebRTC, modes, transcripts, local recording). Owned: `frontend/`.
- `api.md` — Node/Hono backend (ephemeral token minting, request validation, rate limiting, security headers). Owned: `backend/`.
- `shared.md` — Cross-package TypeScript types and Zod contracts. Owned: `shared/types/`.
- `tests.md` — Vitest + React Testing Library + Playwright suites at repo root. Owned: `tests/`, `playwright.config.ts`.
- `infra.md` — Vercel deploy config, GitHub Actions, Phase 2 Cloud Run plan. Owned: `.github/workflows/`.

A top-level `api/` directory exists with its own `tsconfig.json` and a `pnpm typecheck:api` script. It is **not** yet covered by any subsystem file; classification pending (likely Vercel API route or compatibility shim).
