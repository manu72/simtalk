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
- `backend/src/routes/imageTranslate.ts` and `backend/src/services/openAiImageTranslate.ts` — secrets boundary; reads `OPENAI_API_KEY`; paid action; content-policy surface. Tags: `secrets`, `security`.
- `backend/src/middleware/{accessGate,cors,rateLimit,securityHeaders}.ts` — anti-abuse / authZ boundary. Tag: `security`.
- `frontend/src/realtimeTranslationSession.ts` — WebRTC session lifecycle; latency-critical. Tags: `realtime`, `latency`.
- `frontend/src/cameraTranslateClient.ts`, `frontend/src/components/screens/CameraTranslateModal.tsx` — paid action client (access-gated); validates outbound request with shared schema before assembling FormData. Tag: `security`.
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

- Last refreshed: 2026-05-27T07:14:16Z
- Files refreshed this run: .agentic/GRAPH_INDEX.md, .agentic/MEMORY_INDEX.md, .cursor/plans/phase_1.6_camera_translate_ee0ea704.plan.md, backend/.env.example, backend/src/app.ts, backend/src/config.ts, backend/src/middleware/rateLimit.ts, backend/src/routes/imageTranslate.ts, backend/src/routes/realtime.ts, backend/src/routes/rooms.ts, backend/src/services/openAiImageTranslate.ts, backend/src/services/openAiRealtime.ts, frontend/src/App.tsx, frontend/src/cameraTranslateClient.ts, frontend/src/components/brand/Icons.tsx, frontend/src/components/brand/LanguagePicker.tsx, frontend/src/components/screens/AccessGateModal.tsx, frontend/src/components/screens/CameraTranslateModal.tsx, frontend/src/components/screens/Lobby.tsx, frontend/src/components/screens/RemoteNameModal.tsx, frontend/src/components/screens/cameraTranslate/compressImage.ts, frontend/src/styles/tokens.css, shared/types/src/index.ts, tests/backend/unit/services/openAiImageTranslate.test.ts, tests/backend/unit/services/openAiRealtime.test.ts, tests/e2e/home.spec.ts, tests/frontend/component/App.test.tsx, tests/frontend/component/RemoteNameModal.test.tsx
- Source: scripts/agentic/update_memory.py
<!-- agentic:managed:end -->

<!-- human:notes:start -->
## Routing hints

Human-maintained mappings from task intent to relevant subsystems, files, tests, risks, and lessons.

- "Realtime token", "ephemeral token", "OpenAI session" → subsystem `api`. Read `backend/src/routes/realtime.ts`, `backend/src/services/openAiRealtime.ts`, `shared/types/src/index.ts`. Risk tags: `secrets`, `security`. Confirm CORS and rate limits before changes.
- "WebRTC", "audio playback", "mic", "translate stream" → subsystem `web`. Read `frontend/src/realtimeTranslationSession.ts`, `frontend/src/realtimeTokenClient.ts`. Risk tags: `realtime`, `latency`.
- "Camera translate", "image translate", "OCR", "vision", "photo translation" → subsystem `api` + `web`. Read `backend/src/routes/imageTranslate.ts`, `backend/src/services/openAiImageTranslate.ts`, `frontend/src/cameraTranslateClient.ts`, `frontend/src/components/screens/CameraTranslateModal.tsx`. Paid action; gated by `APP_ACCESS_PASSWORD`. Risk tags: `secrets`, `security`. Unlike realtime, the backend reads image bytes (not persisted) and calls OpenAI chat completions directly.
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
