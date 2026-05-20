# shared

> Status: planned. Code not yet implemented at init time. Update this file once `shared/types/` lands.

## Purpose

Cross-package TypeScript types and contracts used by both the frontend and the backend. Keeps API request/response shapes, mode/language enums, and error envelopes consistent.

## Source-of-truth files

- `shared/types/` — Unknown (not yet present).
- Future: any Zod schemas that should live in both packages can be co-located here and re-exported.

## Public contracts

- API request/response types for the realtime token endpoint.
- `Mode` enum: `listener` | `turnabout` | `practice`.
- Language code type (BCP-47 string; concrete allowlist Unknown).
- Standard error envelope shape used by the backend.

## Invariants

- Types in `shared/` are pure: no runtime side effects, no Node-only or browser-only imports.
- Anything exported from `shared/` must compile cleanly under both Node and browser TS configs.
- Schemas/types here are the single source of truth; frontend and backend MUST consume them rather than redeclare.

## Common failure modes

- Drift between Zod runtime validators and TypeScript types if they are declared separately. Prefer `z.infer` from a single Zod schema.
- Accidentally importing Node-only modules (e.g. `node:fs`) into `shared/` and breaking the browser build.

## Tests

- Type-only; covered indirectly by frontend and backend test suites.
- Run `pnpm typecheck` (Unknown until configured) at the workspace root.

## Related subsystems

- `web`, `api` — both consume types here.

## Do-not-do rules

- Do not place runtime logic, env variable reads, or framework-specific code in `shared/`.
- Do not duplicate types across packages; import from `shared/` instead.
