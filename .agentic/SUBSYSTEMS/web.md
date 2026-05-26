<!-- agentic:managed:start -->
# web

## Purpose

Browser-side React/Vite app that captures microphone audio, establishes a WebRTC session with OpenAI Realtime Translate, plays translated audio, renders source/translated transcripts, and (optionally) records locally.

## Owned paths

- `frontend/`
- `frontend/src/styles/tokens.css` (active global CSS, brand tokens, reduced-motion handling)

## Public contracts

- Calls backend token endpoints (`POST /realtime/token`, room token routes) using Zod-validated shared contracts from `@simtalk/shared-types`.
- Establishes WebRTC peer connection directly with OpenAI Realtime Translate using the issued ephemeral token. Reference: OpenAI `gpt-realtime-translate` and `/v1/realtime/translations`.
- Consumes translated audio frames and transcript deltas from OpenAI; emits no audio or transcripts back to the SimTalk backend.

## Source-of-truth files

- `frontend/src/App.tsx` — top-level mode/session/access-gate/room flow orchestration.
- `frontend/src/realtimeTranslationSession.ts` — WebRTC session lifecycle (mic, RTCPeerConnection, SDP exchange, playback, transcripts, teardown).
- `frontend/src/realtimeTokenClient.ts`, `frontend/src/roomTokenClient.ts` — backend token clients; attach `X-Access-Password` when present.
- `frontend/src/accessGate.ts`, `frontend/src/components/screens/AccessGateModal.tsx` — local access-gate UX and session storage (UX only, not auth).
- `PRD.md` — mode specifications.
- `System_Architecture.md` §2, §6 — browser responsibilities and per-mode behaviour.

## Related tests

- Unit/component: `tests/frontend/{unit,component}/` (Vitest + React Testing Library).
- E2E: `tests/e2e/` (Playwright); gated flows preload the access password in session storage.

## Dependencies

- `api` — issues ephemeral OpenAI tokens.
- `shared` — request/response Zod contracts.
- OpenAI Realtime Translate (external) — direct WebRTC peer.

## Invariants

- The browser MUST NOT receive or store the OpenAI API key. It only ever holds short-lived ephemeral tokens.
- The access-gate password in `sessionStorage` is UX convenience only; backend middleware is the enforcement boundary.
- Translated audio playback latency target: time-to-first-audio < 2 seconds (PRD success metric).
- Recording is OFF by default. If enabled, audio and transcripts stay in browser memory or local file blobs only.
- Refreshing the page MUST clear unsaved session data; nothing persists to a server.
- All UI state changes from session events must be derived from declared event handlers; do not poll OpenAI state.
- TypeScript strict mode required; no `any` without explicit, documented justification.
- Active CSS lives in `frontend/src/styles/tokens.css`; preserve the 8px spacing rhythm and `prefers-reduced-motion` handling.

## Common failure modes

- Mic permissions denied or revoked mid-session.
- Bluetooth/AirPods routing changing input or output device unexpectedly.
- WebRTC ICE failures or NAT traversal issues; degraded networks producing audio dropouts.
- Backend ephemeral token expired or rate-limited.
- Overlapping speech in Turn-about mode confusing the listener.
- Browser tab backgrounded suspending audio context.

## Do-not-do rules

- Do not embed `OPENAI_API_KEY` or any long-lived secret in the bundle or environment exposed to the browser.
- Do not POST audio or transcripts to the SimTalk backend.
- Do not auto-start recording; require an explicit user action.
- Do not introduce new audio/WebRTC libraries without a decision entry; prefer browser-native APIs first.
- Do not break Phase 2 evolvability (rooms / multi-peer) by hard-coding single-peer assumptions in shared abstractions.
- Do not revive Tailwind / shadcn/ui scaffold (`components.json`, `frontend/src/components/ui/`, `frontend/src/lib/utils.ts`) without a deliberate decision — those packages are not installed in the active frontend.
- Do not use emojis in the UI; prefer icons (lucide).

## Related lessons

- `LESSONS/decisions.md` — 2026-05-20 entries on React/Vite stack, OpenAI gpt-realtime-translate, no server-side transcript storage; 2026-05-24 access-gate decision.

## Unknowns

- Concrete supported language allowlist for Listener and Turn-about modes (PRD says "any supported"; no explicit allowlist defined).
- Whether the recorded "Tailwind + shadcn/ui" decision should be retracted given current code uses custom CSS tokens.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
- Latency is the product. Any change to the WebRTC lifecycle, session event handling, or playback path is latency-critical — measure time-to-first-translated-audio before merging.
- The access-gate UX must fail closed in production. If `APP_ACCESS_PASSWORD` is unset outside dev, the modal should not pretend the user is authorised.
- `frontend/src/components/ui/`, `frontend/src/lib/utils.ts`, and `components.json` are stale scaffold remnants per `CLAUDE.md` — leave them alone or remove with a decision entry; do not silently revive Tailwind/shadcn dependencies.
- The 2026-05-20 React+Vite+Tailwind+shadcn decision predates the move to custom CSS tokens; treat it as an open architectural inconsistency until reconciled in `LESSONS/decisions.md`.
<!-- human:notes:end -->
