# Decisions

Durable architectural and design decisions only. Not every change.

## Template

- Date:
- Context:
- Decision:
- Consequences:
- Alternatives considered:

---

## 2026-05-20 — Build Phase 1 as a private single-device web app

- Date: 2026-05-20
- Context: PRD requires fast validation of low-latency speech-to-speech translation across three modes; no need for accounts, persistence, or multi-user rooms in MVP.
- Decision: Phase 1 is a private web app behind Vercel Password Protection with a single allowlisted user. No public signup.
- Consequences: Avoids privacy/compliance burden, lets the team focus on conversation flow and latency. Vercel Password Protection is explicitly not a production auth model and must be replaced in Phase 2.
- Alternatives considered: Public beta with throwaway auth; native mobile app; CLI prototype. All rejected as too slow for the validation goal.

## 2026-05-20 — React + Vite + TypeScript for the frontend

- Date: 2026-05-20
- Context: Need fast iteration, strong typing, a modern build pipeline, and good ecosystem support for Tailwind / shadcn/ui.
- Decision: Frontend uses React 19 + Vite 7 + TypeScript (strict), Tailwind CSS, shadcn/ui.
- Consequences: Familiar stack; easy hiring and AI assistance; clean migration path to Phase 2.
- Alternatives considered: Next.js (rejected for Phase 1 to avoid SSR complexity), SvelteKit (rejected for ecosystem fit).

## 2026-05-20 — Node.js + Hono backend

- Date: 2026-05-20
- Context: Backend only needs to mint ephemeral OpenAI tokens, validate input, and enforce CORS / rate limits. Should be portable from Vercel to Cloud Run.
- Decision: Standalone Node/Hono service deployed on Vercel for Phase 1, then migrated to Google Cloud Run in Phase 2.
- Consequences: Small runtime, fast cold starts, easy containerisation later. Slightly more setup than a Vercel serverless function.
- Alternatives considered: Vercel serverless API route (simpler now, harder to migrate); Express (heavier, slower); Bun runtime (less mature in 2026 for our needs).

## 2026-05-20 — Use OpenAI gpt-realtime-translate over browser WebRTC

- Date: 2026-05-20
- Context: Need streaming speech-to-speech translation with translated audio plus transcript deltas while source audio is still arriving.
- Decision: Use OpenAI `gpt-realtime-translate` via the dedicated `/v1/realtime/translations` endpoint, with the browser establishing WebRTC directly to OpenAI using a backend-issued ephemeral token.
- Consequences: Lowest plausible latency; backend never handles audio; cost is per minute of audio. Locks the realtime path to OpenAI for now.
- Alternatives considered: Self-hosted ASR + MT + TTS pipeline (much higher latency and complexity); third-party realtime translation vendors (more integration risk).

## 2026-05-20 — No database in Phase 1

- Date: 2026-05-20
- Context: MVP does not require accounts, history, or shared state.
- Decision: Phase 1 has no server-side database and no server-side transcript or audio storage.
- Consequences: Eliminates a large class of privacy/compliance work and keeps deploys simple. Any persistence requirement reopens this decision.
- Alternatives considered: Supabase Postgres (rejected for Phase 1 only; planned for Phase 2).

## 2026-05-20 — No server-side transcript storage; recording is browser-local only

- Date: 2026-05-20
- Context: Transcript and audio data are sensitive. The product principle is "privacy by default".
- Decision: Backend never receives, processes, or stores transcripts or audio. Optional recording is opt-in, off by default, browser-local, and cleared on refresh.
- Consequences: Strong privacy posture for Phase 1; simplifies the data policy. Limits future analytics options unless explicitly redesigned.
- Alternatives considered: Server-side opt-in recording with retention controls (deferred to a future phase with a proper consent model).

## 2026-05-20 — Deploy Phase 1 to Vercel; migrate to Google Cloud Run for Phase 2

- Date: 2026-05-20
- Context: Vercel gives the fastest path to a private internal deployment for the frontend and the small Node service. Phase 2 needs containerised services, room orchestration, and persistent state.
- Decision: Phase 1 deploys both frontend and backend to Vercel under `simtalk.app`. Phase 2 moves backend services to Google Cloud Run (`simtalk-api`, `simtalk-realtime`, `simtalk-worker`).
- Consequences: Two deployment targets across the product lifecycle; backend is intentionally kept thin and portable to make the migration cheap.
- Alternatives considered: Stay on Vercel for Phase 2 (rejected: room/media orchestration fits Cloud Run better); start on Cloud Run today (rejected: too much overhead for an MVP).

## 2026-05-24 — Protect paid actions with a backend access gate

- Date: 2026-05-24
- Context: Phase 1 remains private, but launch and remote-room token flows need app-level protection in addition to deployment-level password protection.
- Decision: Use a temporary shared-password gate enforced by backend `APP_ACCESS_PASSWORD` and the `X-Access-Password` request header; frontend session storage and modal prompts are UX only.
- Consequences: Protected actions fail closed outside development when the password is not configured. This is not a user auth model and must be replaced before public or multi-user use.
- Alternatives considered: Rely only on Vercel Password Protection (too coarse for API calls); add full auth now (too much Phase 1 scope).

## 2026-05-27 — Add backend-brokered image translation (Phase 1.6)

- Date: 2026-05-27
- Context: Camera/photo translation is a non-realtime, request/response flow with no streaming need. Doing it browser-direct to OpenAI would leak the API key; doing it via a separate service is unjustified for Phase 1.
- Decision: Add `POST /image-translate/translate` on the existing Hono backend. The browser uploads a compressed image as multipart/form-data; the backend reads bytes for the lifetime of one request, calls OpenAI chat completions with vision (primary `gpt-4o`-class model, fallback `gpt-4o-mini`-class), and returns `{ sourceLanguage, originalText, translatedText, modelTier }`. No persistence, no logging of image content or extracted text. Reuses `accessGate`, dedicated rate limiter, and shared Zod contracts.
- Consequences: Backend is no longer a pure token-minting service for all flows — it is a token-minting service for realtime and a thin broker for image translation. Adds a content-policy surface (refusals must be sanitized to `content_blocked`). Adds an OpenAI-vision cost line. Keeps the realtime/audio invariants untouched.
- Alternatives considered: Browser-direct vision calls (rejected: would expose `OPENAI_API_KEY`); separate microservice (rejected: scope inflation for Phase 1); store-and-process worker (rejected: persistence reopens the privacy posture).

## 2026-05-27 — Fail-fast on image-translate AbortController timeout; do not retry the fallback model

- Date: 2026-05-27
- Context: `openAiImageTranslate.ts` wraps each upstream call in an `AbortController` with a bounded timeout. The natural pattern would be to retry the fallback tier on any error, including timeouts.
- Decision: When the primary call aborts because OUR timeout fired, surface the failure as a non-retryable `upstream_unavailable` and do NOT retry the fallback. Genuine transport errors (DNS, ECONNRESET, etc.) still fall through to the fallback.
- Consequences: A timed-out request fails after ~one timeout window instead of ~two. Same-tier fallback rarely recovers from upstream slowness; the cost of double-waiting outweighs the marginal recovery chance. Encoded as an invariant in `SUBSYSTEMS/api.md` and exercised by `tests/backend/unit/services/openAiImageTranslate.test.ts`.
- Alternatives considered: Retry fallback on all errors (rejected: doubles user wait on the most common slow-path); shorter timeouts (rejected: would increase false negatives on genuinely slow large images).
