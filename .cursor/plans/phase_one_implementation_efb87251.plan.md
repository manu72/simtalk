---
name: Phase One Implementation
overview: "Implement Phase 1 as a private single-device SimTalk MVP in thin, verifiable slices: first verify the gpt-realtime-translate credential flow, then lock the shared/API contract, wire browser WebRTC, add the three conversation modes, and keep recording local-only."
todos:
  - id: translation-docs
    content: Verify the official gpt-realtime-translate translation endpoint credential/session shape before finalizing contracts.
    status: completed
  - id: shared-contracts
    content: Stabilize shared token, language, mode, and error schemas with tests using the verified translation-specific response shape.
    status: completed
  - id: backend-token
    content: Implement and test the backend gpt-realtime-translate token endpoint with strict validation, CORS, headers, conservative session/rate guardrails, and sanitized errors.
    status: completed
  - id: frontend-session
    content: Replace the static frontend shell with accessible mode/language/session controls wired to the backend token contract.
    status: completed
  - id: webrtc-translation
    content: Implement browser-native WebRTC setup for gpt-realtime-translate, remote translated audio playback, transcript deltas, and teardown.
    status: completed
  - id: mode-flows
    content: Implement Listener, Turn-about, and Practice mode behavior without diarisation or multi-user room assumptions.
    status: pending
  - id: local-recording
    content: Add explicit browser-local recording and download support with recording off by default.
    status: pending
  - id: verification
    content: Expand unit/component/E2E coverage and run typecheck, tests, build, plus manual realtime validation.
    status: pending
isProject: false
---

# Phase 1 Coding Plan

## Grounding

Use the current `gpt-realtime-translate` model documentation as the realtime source of truth:

- Model: `gpt-realtime-translate`
- Endpoint family: `v1/realtime/translations`
- Modalities: audio input, audio + text output
- Product expectation: translated audio and transcript deltas while source audio is still arriving
- Pricing/rate-limit posture: priced by audio duration (`$0.034/min` in the current docs), with minute-of-audio rate limits by account tier
- Do not use the older generic realtime-session flow unless the translation docs explicitly require a shared helper primitive.

Relevant docs and repo files:

- [PRD.md](PRD.md) defines Listener, Turn-about, and Practice mode behavior.
- [System_Architecture.md](System_Architecture.md) defines the Phase 1 browser-to-OpenAI WebRTC flow and backend token boundary.
- [.agentic/PROJECT_BRIEF.md](.agentic/PROJECT_BRIEF.md) captures current invariants and unknowns.
- [shared/types/src/index.ts](shared/types/src/index.ts) already has the initial mode, language, token request, token response, error, and health schemas.
- [backend/src/app.ts](backend/src/app.ts), [backend/src/config.ts](backend/src/config.ts), [backend/src/middleware/cors.ts](backend/src/middleware/cors.ts), and [backend/src/middleware/securityHeaders.ts](backend/src/middleware/securityHeaders.ts) already provide a Hono shell with health, CORS, and baseline security headers.
- [frontend/src/App.tsx](frontend/src/App.tsx) is currently a static Phase 1 shell with inert mode cards.

Agentic OS routing confidence was low because the full Phase 1 build spans `shared`, `api`, `web`, `tests`, `security`, `privacy`, and `realtime`. To keep implementation safe, the first coding pass should use `api/shared` as the primary subsystem, then move into `web` once the contract is stable.

## Invariants And Do-Not-Do Rules

- Never expose `OPENAI_API_KEY` or any long-lived secret to the browser.
- The backend must validate mode and language requests before calling OpenAI.
- The backend must not receive, proxy, log, or store audio or transcript content.
- The browser should connect directly to OpenAI using short-lived translation credentials.
- Recording must be off by default, explicit, browser-local only, and cleared on refresh unless downloaded by the user.
- Do not add a database, ORM, persistent transcript storage, public signup, or multi-user room layer in Phase 1.
- Keep CORS strict; do not use `*`.
- Use Zod at API boundaries and preserve the shared typed contract.
- UI work must use semantic HTML, CSS variables for colors, visible focus states, 8px spacing, keyboard-accessible controls, and reduced-motion-safe behavior.

## Unknowns To Resolve Before Contract Work

- Exact `gpt-realtime-translate` token/session creation request and response fields must be verified against the official translation endpoint docs before finalizing `RealtimeTokenResponse` names.
- The plan currently knows the correct model and endpoint family, but not the exact browser credential payload. Do not code the shared response schema from older realtime docs or from memory.
- Supported language policy is still undefined. Default plan: start with BCP-47 syntax validation plus a small curated UI language list, then keep backend policy easy to tighten.
- Rate limit and session duration thresholds are not specified. Default plan: conservative in-memory per-IP token issuance limiting plus a short Phase 1 session duration/cost guardrail, documented as best-effort for Vercel/serverless.
- Real WebRTC/audio behavior needs manual browser verification with a real OpenAI key; CI should mock OpenAI and avoid live cost.

## Implementation Slices

1. Verify the translation-specific OpenAI contract.
   - Use the official `gpt-realtime-translate` documentation, especially the `v1/realtime/translations` endpoint and browser WebRTC credential flow.
   - Confirm the server-side request shape, browser credential response fields, TTL semantics if documented, and transcript/audio event names before editing [shared/types/src/index.ts](shared/types/src/index.ts).
   - Record any remaining uncertainty in code comments/tests only where it affects implementation behavior; do not preserve compatibility with older generic realtime assumptions.

2. Stabilize shared contracts.
   - Extend [shared/types/src/index.ts](shared/types/src/index.ts) for a fixed token route contract, mode-aware language validation, a small error-code taxonomy, and the verified translation-specific token response shape.
   - Add tests in [shared/types/src/index.test.ts](shared/types/src/index.test.ts) for token response parsing, error envelopes, invalid mode/language combinations, and the backend route path constant if introduced.

3. Add the backend translation-token endpoint.
   - Add a Hono route such as `POST /realtime/token` under [backend/src/routes/](backend/src/routes/).
   - Add a service layer under [backend/src/services/](backend/src/services/) that calls the verified OpenAI `v1/realtime/translations` credential/session path using `OPENAI_API_KEY` server-side only.
   - Add config for `OPENAI_API_KEY`, conservative per-client token issuance limits, and a Phase 1 session duration/cost guardrail aligned with audio-duration pricing.
   - Add validation, sanitized upstream error mapping, and no-content logging. Logs may include mode, language codes, status, request duration, and non-secret request IDs, but never audio, transcripts, full upstream payloads, or tokens.
   - Test with mocked OpenAI responses in backend Vitest tests.

4. Wire the frontend session start flow.
   - Split the current static [frontend/src/App.tsx](frontend/src/App.tsx) into small components/hooks as needed.
   - Add an API client using `VITE_API_BASE_URL` and the shared token schemas.
   - Add language selectors, mode selection, session start/stop controls, loading/error states, and accessible status messaging.
   - Keep buttons native and keyboard accessible.

5. Implement browser-native WebRTC translation.
   - Add a frontend service/hook for microphone capture, `RTCPeerConnection`, translation session negotiation, remote audio playback, transcript event handling, and teardown.
   - Use the translation-specific docs and endpoint assumptions throughout.
   - Avoid uploading audio/transcripts to the SimTalk backend.
   - Track time-to-first-audio locally for lightweight observability without transcript content.

6. Implement Phase 1 mode behavior.
   - Listener: continuous listen/translate to one target language.
   - Turn-about: two configured language directions with a clear manual switch; do not rely on diarisation.
   - Practice: deliberate push-to-speak or record/pause/translate flow, with source and target transcript review.

7. Add local-only recording and downloads.
   - Add explicit opt-in recording controls using browser APIs.
   - Keep recorded audio/transcript data in memory/local blob URLs only.
   - Add transcript and audio download actions without server upload.
   - Add clear UI copy that recording is off by default.

8. Expand tests and verification.
   - Unit-test shared schemas and backend token validation/error/rate-limit/session-guardrail behavior.
   - Component-test frontend mode controls, token request behavior, recording default-off state, and error/status rendering.
   - Update Playwright for core UI flows with OpenAI mocked; keep real OpenAI WebRTC as a manual validation step unless explicitly approved.
   - Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and targeted `pnpm test:e2e` once the frontend/backend dev-server setup supports it.

## Recommended First Coding Pass

Start with slices 1 through 3 only: verify the official `gpt-realtime-translate` credential flow, then implement shared contracts plus backend `POST /realtime/token` using mocked OpenAI tests. This creates the safest foundation for frontend work and resolves the highest-risk secrets/security boundary before adding browser audio complexity.

Do not start frontend WebRTC until the backend contract is proven against mocked translation endpoint responses and the response shape is not inherited from older realtime docs.

After that passes, proceed to slices 4 and 5 for the frontend API/WebRTC path, then slices 6 and 7 for mode polish and local recording.
