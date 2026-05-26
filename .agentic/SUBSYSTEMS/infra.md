<!-- agentic:managed:start -->
# infra

## Purpose

Deployment, environment, and CI configuration for SimTalk. Phase 1 targets Vercel; Phase 2 targets Google Cloud Run with managed secrets and an HTTPS load balancer.

## Owned paths

- `.github/workflows/`
- `frontend/.env.example`, `backend/.env.example`
- (Out-of-repo) Vercel project settings, custom domain `simtalk.app`.

## Public contracts

- CI workflows:
  - `.github/workflows/ci.yml` — lint, typecheck, test pipeline.
  - `.github/workflows/vercel-deploy.yml` — deploy pipeline.
- Environment variables (Phase 1):
  - Backend: `OPENAI_API_KEY`, `APP_ENV`, `APP_URL`, `ALLOWED_ORIGINS`, `APP_ACCESS_PASSWORD`, `SESSION_SECRET` (placeholder), `VERCEL_PROTECTION_BYPASS_SECRET` (placeholder).
  - Frontend: `VITE_API_BASE_URL`.
- Domains: `simtalk.app` (production), local dev `http://localhost:5173` (frontend), `http://localhost:3000` (backend, per `CLAUDE.md`).

## Source-of-truth files

- `.github/workflows/ci.yml`, `.github/workflows/vercel-deploy.yml`.
- `backend/.env.example`, `frontend/.env.example` — canonical env var names.
- `README.md` "Environment Variables" section.
- `System_Architecture.md` deployment sections.

## Related tests

- Smoke deploy verification: hit `/health` and the password-gated frontend after each deploy.
- CI itself is exercised on every push.

## Dependencies

- `api`, `web` — both deploy via this subsystem.
- Vercel (Phase 1 hosting).
- Google Cloud Run (Phase 2; not yet in tree).

## Invariants

- Secrets are stored in Vercel project settings (or, in Phase 2, a managed secret store), never committed to git.
- Vercel Password Protection is enabled in production for Phase 1; only allowlisted users have access.
- CI MUST run lint, typecheck, unit tests, and (where feasible) E2E before deploy.
- The OpenAI key is only available to the backend environment.
- `SESSION_SECRET` and `VERCEL_PROTECTION_BYPASS_SECRET` are placeholders not yet consumed by code; treat as forward-looking, not active config.

## Common failure modes

- Misaligned `ALLOWED_ORIGINS` between environments breaking CORS.
- Missing or mistyped env var causing token endpoint to fail at runtime.
- Vercel Password Protection bypass secret leaking into client-side bundles or logs.
- CI cache poisoning between frontend and backend workspaces.
- Forgotten `pnpm --filter @simtalk/shared-types build` step in a workflow leading to stale type errors.

## Do-not-do rules

- Do not commit any `.env*` file containing secrets.
- Do not expose `OPENAI_API_KEY` to the frontend build environment (no `VITE_*` mirroring).
- Do not disable Vercel Password Protection on production in Phase 1.
- Do not introduce a new hosting provider or cloud dependency without a decision entry.
- Do not bypass the `shared-types` build in any new workflow that runs typecheck/test/build.

## Related lessons

- `LESSONS/decisions.md` — 2026-05-20 deploy on Vercel; migrate to Google Cloud Run for Phase 2.

## Unknowns

- Whether the Phase 1 backend deploys as a Vercel serverless function or a standalone Vercel-hosted Node service. README and `CLAUDE.md` lean standalone, but final deploy shape may be expressed inside `.github/workflows/vercel-deploy.yml` or Vercel project settings.
- The role of the top-level `api/` package — possibly a Vercel API route adapter for the standalone backend.
- Observability stack (logging/metrics provider).
- Concrete CI gates (e.g. coverage thresholds, E2E required on main only?).
<!-- agentic:managed:end -->

<!-- human:notes:start -->
- The top-level `api/` directory is the most likely candidate for a Vercel function adapter that re-exports the Hono app. Check there before assuming the backend is purely standalone.
- Phase 2 (Cloud Run) is intentionally not represented in-tree yet; do not add Cloud Run config files speculatively. Anything Phase-2-shaped should arrive with a decision entry first.
- Vercel project settings are out-of-repo. When debugging deploy issues, the source of truth often lives there, not in the workflows.
<!-- human:notes:end -->
