---
name: test-structure
description: Reviews established repositories with inconsistent test locations and migrates tests into a clean /tests/ structure. Use when reorganizing test files, consolidating colocated tests, standardizing test directories, or auditing test discovery across backend, frontend, mobile, monorepo, or full-stack projects.
---

# Test Structure

Use this skill to inventory, classify, and safely migrate an established repo's tests into a clean, repo-aware `/tests/` structure without changing test behaviour.

## Operating Rules

- Inspect the repo before proposing changes. Do not guess when test runner behaviour is unclear.
- Account for every test, test config, fixture, mock, snapshot, factory, setup file, e2e asset, and CI test command.
- Preserve existing naming conventions unless there is a clear reason to standardise.
- Do not move generated files, vendor files, build outputs, coverage output, screenshots, videos, traces, caches, or other test artifacts.
- Prefer small, verifiable migrations over large risky rewrites.
- Propose the target structure before moving files. If the user has not already approved migration, ask before applying file moves.
- Do not change test behaviour while restructuring. If behaviour changes seem necessary, report them as separate follow-up work.

## 1. Discovery

Create a repo inventory before editing:

- Identify stack shape: backend-only, frontend-only, mobile, monorepo, or full-stack.
- Detect languages, package managers, workspace boundaries, and test runners.
- Look for pytest, unittest, Jest, Vitest, Playwright, Cypress, React Testing Library, Mocha, Node test runner, JUnit, XCTest, Detox, or other configured runners.
- Map all test files, colocated tests, existing `/tests/` folders, package-level test folders, fixtures, mocks, snapshots, factories, setup files, helpers, and e2e assets.
- Inspect test config and discovery rules: `package.json`, workspace manifests, `pytest.ini`, `pyproject.toml`, `setup.cfg`, `tox.ini`, `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`, `tsconfig*`, `vite.config.*`, CI workflows, Makefiles, task runners, and docs.
- Record current test commands and discovery commands. Use runner-native discovery where available, such as `pytest --collect-only`, Jest list tests, Vitest list mode, or Playwright list where supported.
- Inspect and update coverage configuration where relevant, including `.coveragerc`, `coverage.py`, `nyc`, `c8`, Jest/Vitest coverage settings, Codecov, Coveralls, and CI coverage upload paths.

Stop and ask the user if runner configuration is dynamic, generated, undocumented, or unsafe to execute.

## 2. Classification

Classify each test and support file before planning moves:

- Test level: unit, integration, e2e, smoke, contract, snapshot, visual, or unknown.
- Owner area: backend, frontend, mobile, shared, package name, app name, or service name.
- Dependency type: pure unit, framework-rendered, networked, database-backed, filesystem-backed, browser-driven, or external-service-backed.
- Required support: fixtures, mocks, factories, setup files, snapshots, test data, browser assets, environment files, or aliases.
- Risk: low, medium, or high based on relative imports, snapshot paths, runner discovery rules, CI coupling, and generated artifacts.

If a file cannot be classified confidently, keep it in place or include it in a staged migration plan.

## 3. Proposed Structure

Choose the smallest structure that fits the repo:

- Full-stack repos:
  - `tests/backend/unit`
  - `tests/backend/integration`
  - `tests/frontend/unit`
  - `tests/frontend/integration`
  - `tests/frontend/e2e`
- Single-stack repos:
  - `tests/unit`
  - `tests/integration`
  - `tests/e2e`
- Monorepos: prefer the same pattern inside each package only when package-local test runners require it; otherwise use a root `tests/` layout grouped by package or domain.
- Mobile repos: use `tests/mobile/{unit,integration,e2e}` when it matches the detected runner model; otherwise preserve the platform's conventional layout.

Keep shared fixtures, mocks, factories, and helpers near the tests that use them. Use `tests/shared`, `tests/fixtures`, or package-scoped support folders only when multiple suites depend on them.

- Respect strong ecosystem conventions when they conflict with a root `/tests/` layout, such as Go package tests, Java/Maven/Gradle `src/test`, Rails specs, Django app tests, XCTest, or Android/iOS test targets. In those cases, propose standardisation within the ecosystem convention rather than forcing `/tests/`.

Before editing, show:

- Current inventory summary.
- Proposed target tree.
- File move mapping.
- Required config, import, alias, documentation, and CI updates.
- Commands that will verify discovery and execution.
- Assumptions, unknowns, and risks.

## 4. Migration Plan

Plan in small batches:

1. Move low-risk isolated unit tests first.
2. Update relative imports, fixture paths, snapshot locations, setup references, and aliases for that batch.
3. Run targeted discovery and targeted tests for the moved batch.
4. Continue with integration tests, then e2e tests and assets.
5. Update CI and documentation after local discovery works.

If full migration is risky, produce a staged migration plan instead of moving files. Include phases, blockers, verification commands, and the files that should remain untouched for now.

## 5. File Moves And Config Updates

When applying the migration:

- Use file moves that preserve history where possible.
- Update imports and relative paths mechanically and review them manually.
- Update snapshot paths or serializers according to the detected runner's rules.
- Update pytest config, Jest config, Vitest config, Playwright config, Cypress config, package scripts, workspace scripts, Makefiles, CI workflows, docs, `tsconfig` paths, and Vite aliases as needed.
- Keep generated snapshots or artifacts in the runner-approved location. Do not regenerate snapshots unless the user explicitly approves it.
- Avoid broad rewrites, formatting churn, dependency changes, or test logic edits.

## 6. Verification

Run the narrowest useful checks first, then broader checks:

- Test discovery for each affected runner.
- Targeted tests for moved files or suites.
- Full relevant test suite commands when practical.
- Typecheck or lint only if imports, aliases, TypeScript config, or package scripts changed.
- CI-equivalent commands if local scripts exist.

If a command cannot be run, explain why and list the exact command the user should run. If verification fails, stop and diagnose before continuing migration.

## 7. Final Report

Report concisely:

- Structure chosen and why.
- Moved files, grouped by batch or destination.
- Config, script, CI, alias, and documentation changes.
- Commands run and results.
- Files intentionally left in place.
- Unresolved risks, assumptions, and follow-up recommendations.

## Acceptance Criteria

- All existing tests and support files are accounted for.
- Test discovery still works for every affected runner.
- CI commands are updated if needed.
- Imports, aliases, fixtures, factories, mocks, setup files, and snapshots still resolve.
- E2E assets remain usable.
- Final report lists moved files, config changes, commands run, and unresolved risks.
