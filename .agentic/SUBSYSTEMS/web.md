# web (frontend)

## Purpose

Browser-side application that captures microphone audio, establishes a WebRTC session with OpenAI Realtime Translate, plays translated audio, renders source/translated transcripts, and (optionally) records locally.

## Source-of-truth files

- `frontend/src/App.tsx` — top-level mode, session, access-gate, and room flow orchestration.
- `frontend/src/realtimeTranslationSession.ts` — browser WebRTC session lifecycle with OpenAI Realtime Translate.
- `frontend/src/accessGate.ts` and `frontend/src/components/screens/AccessGateModal.tsx` — local access-gate UX and session storage.
- `frontend/src/realtimeTokenClient.ts` and `frontend/src/roomTokenClient.ts` — token clients that attach `X-Access-Password` when present.
- `PRD.md` — mode specifications.
- `System_Architecture.md` §2, §6 — browser responsibilities and per-mode behaviour.

## Public contracts

- Calls backend token endpoints such as `POST /realtime/token` and room token routes using Zod-validated shared contracts.
- Establishes WebRTC peer connection directly with OpenAI Realtime Translate using the ephemeral token. Reference: `gpt-realtime-translate` docs and `/v1/realtime/translations`.
- Consumes translated audio frames and transcript deltas from OpenAI; emits no audio or transcripts back to the SimTalk backend.

## Invariants

- The browser MUST NOT receive or store the OpenAI API key. It only ever holds short-lived ephemeral tokens.
- The access-gate password in `sessionStorage` is UX convenience only; backend middleware is the enforcement boundary.
- Translated audio playback latency target: time-to-first-audio < 2 seconds (PRD success metric).
- Recording is OFF by default. If enabled, audio and transcripts stay in browser memory or local file blobs only.
- Refreshing the page MUST clear unsaved session data; nothing persists to a server.
- All UI state changes from session events must be derived from declared event handlers; do not poll OpenAI state.
- TypeScript strict mode is required; no `any` without an explicit, documented justification.

## Common failure modes

- Mic permissions denied or revoked mid-session.
- Bluetooth/AirPods routing changing input or output device unexpectedly.
- WebRTC ICE failures or NAT traversal issues; degraded networks producing audio dropouts.
- Backend ephemeral token expired or rate-limited.
- Overlapping speech in Turn-about mode confusing the listener.
- Browser tab backgrounded suspending audio context.

## Tests

- Unit/component: Vitest + React Testing Library under `tests/frontend/`.
- E2E: Playwright under `tests/e2e/`; gated flows preload the access password in session storage when needed.

## Related subsystems

- `api` — issues ephemeral OpenAI tokens.
- `shared` — request/response types between frontend and backend.

## Do-not-do rules

- Do not embed `OPENAI_API_KEY` or any long-lived secret in the bundle or environment exposed to the browser.
- Do not POST audio or transcripts to the SimTalk backend.
- Do not auto-start recording; require an explicit user action.
- Do not introduce new audio/WebRTC libraries without a decision entry; prefer browser-native APIs first.
- Do not break Phase 2 evolvability (rooms / multi-peer) by hard-coding single-peer assumptions in shared abstractions.
