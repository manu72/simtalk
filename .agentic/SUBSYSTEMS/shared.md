<!-- agentic:managed:start -->
# shared

## Purpose

Cross-package TypeScript types and Zod schemas used by both the frontend and the backend. The single source of truth for cross-boundary request/response shapes, mode/language enums, and error envelopes.

## Owned paths

- `shared/types/`
- `shared/types/src/index.ts`
- `shared/types/dist/` (build output)
- `shared/types/vitest.config.ts`, `shared/types/tsconfig.json`, `shared/types/tsconfig.test.json`

## Public contracts

- API request/response Zod schemas + inferred TypeScript types for the realtime token endpoint and room token endpoints.
- `Mode` enum and language tag types.
- Standard error envelope shape used by the backend and consumed by the frontend.
- Package name: `@simtalk/shared-types`. Must be **built before** backend/frontend typecheck or test (root scripts do this; per-package scripts may not).

## Source-of-truth files

- `shared/types/src/index.ts` — Zod schemas + inferred TS types.
- Root `package.json` scripts — `pnpm --filter @simtalk/shared-types build` is invoked before downstream typecheck/test/build/dev.

## Related tests

- `tests/shared/unit/` — schema parse/round-trip tests via Vitest.
- Type contracts are also validated indirectly by backend and frontend test suites.

## Dependencies

- `web`, `api` — both consume types from this package.
- Zod (runtime validator).

## Invariants

- Types in `shared/` are pure: no runtime side effects, no Node-only or browser-only imports.
- Anything exported from `@simtalk/shared-types` must compile cleanly under both Node and browser TS configs.
- Schemas/types here are the single source of truth; frontend and backend MUST consume them rather than redeclare.
- Prefer `z.infer<typeof schema>` over hand-rolled types to keep runtime validators and TS types aligned.

## Common failure modes

- Drift between Zod runtime validators and TypeScript types if they are declared separately.
- Accidentally importing Node-only modules (e.g. `node:fs`) into `shared/` and breaking the browser build.
- Forgetting to build `@simtalk/shared-types` before per-package `pnpm typecheck`/`pnpm test` causing stale `dist/`.

## Do-not-do rules

- Do not place runtime logic, env variable reads, or framework-specific code in `shared/`.
- Do not duplicate types across packages; import from `@simtalk/shared-types` instead.
- Do not skip the shared-types build step in scripts that run downstream typecheck or tests.

## Related lessons

- None recorded. Reference `CLAUDE.md` "Hard Invariants" for the cross-boundary validation rule.

## Unknowns

- None.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
- Build order matters here more than in most workspaces. `@simtalk/shared-types` produces the types that both other packages depend on at typecheck time; if you skip the build, errors surface in confusing places (frontend or backend, not shared).
- Zod schemas in this package double as the security contract — they're what guarantees the backend rejects malformed payloads before any OpenAI call. Treat schema relaxations with the same caution as middleware changes.
<!-- human:notes:end -->
