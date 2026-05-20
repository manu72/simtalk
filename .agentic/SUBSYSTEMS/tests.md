# tests (E2E)

> Status: planned. Code not yet implemented at init time. Update this file once `tests/` lands.

## Purpose

End-to-end browser tests using Playwright that exercise critical user-facing flows of the SimTalk web app.

## Source-of-truth files

- `tests/` — Unknown (not yet present).
- `playwright.config.*` — Unknown.
- `package.json` scripts at the repo root — Unknown until pnpm workspace is set up.

## Public contracts

- Test specs map to the critical scenarios listed in `README.md` "Critical Scenarios":
  - Session token generation.
  - WebRTC session establishment.
  - Translation stream handling.
  - Mode switching (Listener / Turn-about / Practice).
  - Recording / download.
  - Security enforcement (e.g. unauthenticated access blocked).

## Invariants

- E2E tests MUST run against a deterministic local stack (frontend + backend) or a sandboxed staging environment.
- Tests MUST NOT use a real `OPENAI_API_KEY` against production OpenAI accounts in CI without explicit allowlisting and cost guards. Prefer mocking the OpenAI realtime endpoint at the network boundary.
- Tests MUST NOT hard-code transcript or audio content; treat realtime translation as non-deterministic.

## Common failure modes

- Flaky timing on WebRTC negotiation; prefer event-driven waits over fixed sleeps.
- Mic / audio capture blocked in headless browsers; configure Playwright launch options accordingly.
- Cost overruns from accidentally hitting real OpenAI in CI.

## Tests

- Self-referential. Run with `pnpm test:e2e` (Unknown until configured).

## Related subsystems

- `web`, `api`, `infra`.

## Do-not-do rules

- Do not commit fixtures containing real audio or transcripts of real users.
- Do not call live OpenAI from untrusted CI environments.
- Do not use sleeps in place of selector/event waits.
