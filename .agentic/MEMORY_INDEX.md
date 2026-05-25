<!-- generated-on-init: after bootstrap this file is curated; do not overwrite without explicit confirmation. -->

# Memory index

## Architecture rules

- See `.agentic/PROJECT_BRIEF.md` for stack, constraints, and high-level architecture.
- See `System_Architecture.md` for the authoritative Phase 1/Phase 2 architecture spec.
- See `PRD.md` for product scope, modes, and non-goals.
- Phase 1 has no database and no server-side transcript or audio storage.
- OpenAI API key is server-side only; the browser receives only short-lived ephemeral realtime tokens.

## Subsystem rules

- See `.agentic/SUBSYSTEMS/` (one file per subsystem):
  - `.agentic/SUBSYSTEMS/web.md` — React/Vite frontend, mic capture, WebRTC, transcripts.
  - `.agentic/SUBSYSTEMS/api.md` — Node/Hono backend, token minting, validation, rate limiting.
  - `.agentic/SUBSYSTEMS/shared.md` — Cross-package TypeScript types and contracts.
  - `.agentic/SUBSYSTEMS/tests.md` — Playwright E2E suite.
  - `.agentic/SUBSYSTEMS/infra.md` — Vercel deploy config, GitHub Actions, Phase 2 Cloud Run plan.

## Decisions

- See `.agentic/LESSONS/decisions.md`. Seeded from the README "Decision Log" (2026-05-20).

## Incidents

- See `.agentic/LESSONS/incidents.md`. None recorded yet (pre-MVP).

## Lessons learned

- See `.agentic/LESSONS/decisions.md` and `.agentic/LESSONS/incidents.md`.

## High-risk areas

- Backend OpenAI ephemeral-token endpoint and any code reading `OPENAI_API_KEY` — secrets and AuthZ. Tag: `secrets`, `security`.
- WebRTC session establishment in the frontend — latency-critical and easy to regress. Tag: `realtime`, `latency`.
- Rate limiting and CORS configuration on the backend — anti-abuse boundary. Tag: `security`.
- Local browser recording flow — privacy boundary; must never upload to servers. Tag: `privacy`.
- Vercel/CI deploy configuration — affects every environment. Tag: `infra`.

## Routing hints

Human-maintained mappings from task intent to relevant subsystems, files, tests, risks, and lessons.

- "Realtime token", "ephemeral token", "OpenAI session" → subsystem `api`. Read `backend/src/routes/`, `backend/src/services/`, `backend/src/schemas/`. Risk tags: `secrets`, `security`. Confirm CORS and rate limits before changes.
- "WebRTC", "audio playback", "mic", "translate stream" → subsystem `web`. Read `frontend/src/` (hooks, services). Risk tags: `realtime`, `latency`.
- "Listener mode", "Turn-about", "Practice mode" → subsystem `web`. Cross-check `PRD.md` modes section.
- "Recording", "download transcript" → subsystem `web`. Risk tag: `privacy`. Recording must remain local-only and opt-in.
- "Access gate", "password protection", "allowlist" → subsystem `api` + `web` + `infra`. Phase 1 protects paid actions with backend `APP_ACCESS_PASSWORD`/`X-Access-Password`; frontend storage/modal is UX only, not auth.
- "Deploy", "Vercel", "Cloud Run", "CI" → subsystem `infra`. Read `.agentic/SUBSYSTEMS/infra.md`; GitHub Actions workflows are not yet present in-repo, and Vercel project settings are out-of-tree.
- "Schema", "Zod", "request validation" → subsystem `api` + `shared`. All API boundaries validate with Zod.
- "Rate limit", "abuse", "DoS" → subsystem `api`. Risk tag: `security`.
- "Phase 2", "rooms", "LiveKit", "Supabase", "multi-user" → out of current scope; flag as architectural change requiring a decision entry.
