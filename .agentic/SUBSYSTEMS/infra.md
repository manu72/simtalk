# infra

> Status: planned. Code not yet implemented at init time. Update this file once deploy / CI configs land.

## Purpose

Deployment, environment, and CI configuration for SimTalk. Phase 1 targets Vercel; Phase 2 targets Google Cloud Run with managed secrets and an HTTPS load balancer.

## Source-of-truth files

- `.github/workflows/` — Unknown (not yet present). Expected: lint, typecheck, test, build, deploy gates.
- Vercel project settings (out of repo) — environment variables, password protection, custom domain `simtalk.app`.
- `backend/.env.example`, `frontend/.env.example` — Unknown until packages exist; canonical variable names live in `README.md` "Environment Variables".
- Future: `Dockerfile` and Cloud Run service configs in Phase 2.

## Public contracts

- Environment variables (Phase 1):
  - Backend: `OPENAI_API_KEY`, `APP_ENV`, `APP_URL`, `ALLOWED_ORIGINS`, `SESSION_SECRET`, `VERCEL_PROTECTION_BYPASS_SECRET`.
  - Frontend: `VITE_API_BASE_URL`.
- Domains: `simtalk.app` (production), local dev on `http://localhost:5173` (frontend) and `http://localhost:3000` (backend).

## Invariants

- Secrets are stored in Vercel project settings (or, in Phase 2, in a managed secret store), never committed to git.
- Vercel Password Protection is enabled in production for Phase 1; only allowlisted users have access.
- CI MUST run lint, typecheck, unit tests, and (where feasible) E2E before deploy.
- The OpenAI key is only available to the backend environment.

## Common failure modes

- Misaligned `ALLOWED_ORIGINS` between environments breaking CORS.
- Missing or mistyped env var causing token endpoint to fail at runtime.
- Vercel Password Protection bypass secret leaking into client-side bundles or logs.
- CI cache poisoning between frontend and backend workspaces.

## Tests

- Smoke deploy verification: hit `/health` and the password-gated frontend after each deploy. Unknown until pipeline exists.

## Related subsystems

- `api`, `web`.

## Do-not-do rules

- Do not commit any `.env*` file containing secrets.
- Do not expose `OPENAI_API_KEY` to the frontend build environment.
- Do not disable Vercel Password Protection on production in Phase 1.
- Do not introduce a new hosting provider or cloud dependency without a decision entry.
