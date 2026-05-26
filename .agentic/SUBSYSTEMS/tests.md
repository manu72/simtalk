<!-- agentic:managed:start -->
# tests

## Purpose

Test suites for SimTalk — Vitest unit/integration/component tests for backend, frontend, and shared types, plus Playwright end-to-end tests for critical user flows. Tests live at the repo root in `tests/`, not colocated with source.

## Owned paths

- `tests/backend/{unit,integration,support}/`
- `tests/frontend/{unit,integration,component,support}/`
- `tests/shared/{unit,support}/`
- `tests/e2e/` (Playwright specs)
- `playwright.config.ts` (repo root)

## Public contracts

- Discoverable test patterns governed by `agentic.json.test_discovery` (`**/tests/**`, `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.py`).
- Repo-level scripts:
  - `pnpm test` — runs Vitest across shared, backend, frontend (after building shared-types).
  - `pnpm test:e2e` — runs Playwright after building shared-types.
  - Per-package: `pnpm --filter @simtalk/{backend,frontend,shared-types} test`.
  - Single file: `pnpm --filter @simtalk/<pkg> exec vitest run path/to/file.test.ts`.
- Test layout governance: `.cursor/skills/test-structure/SKILL.md`.

## Source-of-truth files

- `playwright.config.ts` — E2E config.
- Per-package `vitest.config.ts` files (under `frontend/`, `backend/`, `shared/types/`).
- `.cursor/skills/test-structure/SKILL.md` — canonical test layout.

## Related tests

- Self-referential.

## Dependencies

- `web`, `api`, `shared`, `infra`.
- Playwright browser binaries (installed separately).

## Invariants

- E2E tests MUST run against a deterministic local stack (frontend + backend) or a sandboxed staging environment.
- Tests MUST NOT call live OpenAI from untrusted CI without explicit allowlisting and cost guards. Prefer mocking the OpenAI realtime endpoint at the network boundary.
- Tests MUST NOT hard-code transcript or audio content; treat realtime translation as non-deterministic.
- Test layout (`/tests/{backend,frontend,shared}/{unit,integration,component,support}/` + `tests/e2e/`) is governed by the `test-structure` skill — preserve this when adding tests.
- `@simtalk/shared-types` MUST be built before any package-level test run depending on the shared dist.

## Common failure modes

- Flaky timing on WebRTC negotiation; prefer event-driven waits over fixed sleeps.
- Mic / audio capture blocked in headless browsers; configure Playwright launch options accordingly.
- Cost overruns from accidentally hitting real OpenAI in CI.
- Stale `shared/types/dist/` causing confusing type errors in downstream tests.

## Do-not-do rules

- Do not commit fixtures containing real audio or transcripts of real users.
- Do not call live OpenAI from untrusted CI environments.
- Do not use sleeps in place of selector/event waits.
- Do not colocate tests next to source; the project is committed to the repo-root `tests/` layout.

## Related lessons

- None recorded. See `.cursor/skills/test-structure/SKILL.md` for layout enforcement.

## Unknowns

- Whether CI runs Playwright on every push, or only on a subset (e.g. main / release branches). Inspect `.github/workflows/ci.yml` before changing E2E scope.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
- The repo-root `tests/` layout is intentional and enforced by a skill. Do not let editor scaffolding or framework defaults pull tests back into colocated `__tests__/` folders.
- Treat OpenAI realtime calls in tests as the most expensive thing in the suite. If you find yourself reaching for a real key in CI, stop and add a network-boundary mock instead.
<!-- human:notes:end -->
