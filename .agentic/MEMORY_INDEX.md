<!-- agentic:managed:start -->
# Memory index

## Subsystems

See `SUBSYSTEMS/` (one file per major subsystem):

- `SUBSYSTEMS/web.md` — React/Vite frontend, mic capture, WebRTC, transcripts.
- `SUBSYSTEMS/api.md` — Node/Hono backend, token minting, validation, rate limiting.
- `SUBSYSTEMS/shared.md` — Cross-package TypeScript types and Zod contracts.
- `SUBSYSTEMS/tests.md` — Vitest + Playwright suites.
- `SUBSYSTEMS/infra.md` — Vercel deploy config, GitHub Actions, Phase 2 Cloud Run plan.

## High-risk areas

- `backend/src/routes/realtime.ts` and `backend/src/services/openAiRealtime.ts` — secrets boundary; reads `OPENAI_API_KEY`. Tags: `secrets`, `security`.
- `backend/src/middleware/{accessGate,cors,rateLimit,securityHeaders}.ts` — anti-abuse / authZ boundary. Tag: `security`.
- `frontend/src/realtimeTranslationSession.ts` — WebRTC session lifecycle; latency-critical. Tags: `realtime`, `latency`.
- `frontend/src/accessGate.ts`, `frontend/src/components/screens/AccessGateModal.tsx` — UX-only gate; never source of truth for authZ. Tag: `security`.
- `**/.env*` — secrets. Tag: `secrets`.
- `.github/workflows/*` — affects every environment. Tag: `infra`, `ci`.

## Source-of-truth files

- `PRD.md` — modes, non-goals, success metrics.
- `System_Architecture.md` — Phase 1/2 architecture, security controls.
- `README.md` — commands, env vars, decision log.
- `CLAUDE.md` — repo-shape and hard invariants.
- `shared/types/src/index.ts` — cross-boundary Zod contracts.

## Lessons and decisions index

- Decisions: `LESSONS/decisions.md`
- Incidents: `LESSONS/incidents.md` (none recorded; pre-MVP)

## External instruction sources

- `CLAUDE.md` (present, repo-level invariants)
- `AGENTS.md` (absent)
- `.cursor/rules/*` (absent)
- `.cursor/skills/*` (`agenticOS-context`, `agenticOS-update`, `test-structure`)
- `.github/copilot-instructions.md` (absent)

## Graph status (reference)

See `.agentic/GRAPH_INDEX.md`.

- Provider: understand-anything
- Path: `.understand-anything/knowledge-graph.json`
- Fallback: codemap (inactive)
- Last generated: 2026-05-26T03:42:13Z (commit 5308b493, 131 files)
- Parseable: yes

## Memory freshness

- Last refreshed: 2026-05-26T03:51:00Z
- Files refreshed this run: PROJECT_BRIEF.md, MEMORY_INDEX.md, SUBSYSTEMS/{README,web,api,shared,tests,infra}.md
- Bootstrap mode: migration (v1 legacy memory → v2 managed/human regions)
<!-- agentic:managed:end -->

<!-- human:notes:start -->
## Routing hints

Human-maintained mappings from task intent to relevant subsystems, files, tests, risks, and lessons.

- "Realtime token", "ephemeral token", "OpenAI session" → subsystem `api`. Read `backend/src/routes/realtime.ts`, `backend/src/services/openAiRealtime.ts`, `shared/types/src/index.ts`. Risk tags: `secrets`, `security`. Confirm CORS and rate limits before changes.
- "WebRTC", "audio playback", "mic", "translate stream" → subsystem `web`. Read `frontend/src/realtimeTranslationSession.ts`, `frontend/src/realtimeTokenClient.ts`. Risk tags: `realtime`, `latency`.
- "Listener mode", "Turn-about", "Practice mode" → subsystem `web`. Cross-check `PRD.md` modes section.
- "Recording", "download transcript" → subsystem `web`. Risk tag: `privacy`. Recording must remain local-only and opt-in.
- "Access gate", "password protection", "allowlist" → subsystem `api` + `web` + `infra`. Phase 1 protects paid actions with backend `APP_ACCESS_PASSWORD` / `X-Access-Password`; frontend storage/modal is UX only, not auth.
- "Deploy", "Vercel", "Cloud Run", "CI" → subsystem `infra`. `.github/workflows/{ci.yml,vercel-deploy.yml}` exist; Vercel project settings remain out-of-tree.
- "Schema", "Zod", "request validation" → subsystem `api` + `shared`. All API boundaries validate with Zod.
- "Rate limit", "abuse", "DoS" → subsystem `api`. Risk tag: `security`. Rate limiter is in-memory; resets with process lifecycle.
- "Phase 2", "rooms", "LiveKit", "Supabase", "multi-user" → out of current scope; flag as architectural change requiring a decision entry.
- "Tests" → see `SUBSYSTEMS/tests.md`. Layout is governed by `.cursor/skills/test-structure/SKILL.md`; preserve `/tests/{backend,frontend,shared,e2e}/...` shape.

## Priority warnings

- Read `CLAUDE.md` "Hard Invariants (Phase 1)" before any cross-boundary change.
- Top-level `api/` package exists separately from `backend/`. Do not assume "the backend" only means `backend/` until this is classified.
- The `LESSONS/decisions.md` Tailwind/shadcn entry is stale relative to current code (custom CSS tokens are the active path). Treat the decision log entry as a recorded position to be reconsidered, not as current truth, until the decision is updated.
<!-- human:notes:end -->
