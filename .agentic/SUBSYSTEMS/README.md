# Subsystems

Create one Markdown file per major subsystem (e.g. `web.md`, `api.md`).

Each subsystem file must contain:

- Purpose
- Source-of-truth files
- Public contracts (APIs, events, schemas)
- Invariants
- Common failure modes
- Tests (paths and how to run)
- Related subsystems
- Do-not-do rules

## SimTalk subsystems

- `.agentic/SUBSYSTEMS/web.md` — React/Vite/TypeScript frontend (mic, WebRTC, modes, transcripts, local recording).
- `.agentic/SUBSYSTEMS/api.md` — Node/Hono backend (ephemeral token minting, request validation, rate limiting, security headers).
- `.agentic/SUBSYSTEMS/shared.md` — Cross-package TypeScript types and contracts in the future `shared/types/` directory.
- `.agentic/SUBSYSTEMS/tests.md` — Playwright E2E suite at the future `tests/` directory.
- `.agentic/SUBSYSTEMS/infra.md` — Vercel deploy config, GitHub Actions, Phase 2 Cloud Run plan.

Stubs are seeded with `Unknown` markers where the codebase does not yet exist (pre-MVP). Fill them in as the corresponding code lands.
