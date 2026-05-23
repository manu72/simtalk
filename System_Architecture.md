# **System Architecture Specification v0.1**

Based on the PRD: Phase 1 is a single-device web app with Listener, Turn-about, and Practice modes; Phase 2 adds authenticated multi-user rooms for 2–10 participants.

## **1\. Architecture Recommendation**

Build Phase 1 as a private web app on **Vercel**, using:

Frontend: React \+ Vite \+ TypeScript  
 Backend: small Node/Hono service  
 Auth/security: Vercel Password Protection \+ allowlisted email/session gate  
 Database: none  
 Realtime: OpenAI `gpt-realtime-translate` via browser WebRTC  
 Domain: `simtalk.app` TBC

Phase 2 should move the backend/runtime to **Google Cloud Run**, introduce proper auth, persistence, room management, and likely a WebRTC room layer such as LiveKit.

## **2\. Phase 1 Architecture**

Browser handles:

Microphone capture  
 Speaker/headphone playback  
 Mode UI  
 Transcript display  
 Local-only recording  
 Download of local transcript/audio files  
 WebRTC connection to OpenAI Realtime Translate

Node service handles:

Health check  
 Session authorization  
 OpenAI ephemeral realtime token creation  
 Input/output language validation  
 Basic usage logging without transcript content

OpenAI handles:

Live speech-to-speech translation  
 Translated audio output  
 Transcript deltas  
 Realtime translation session state

OpenAI documents `gpt-realtime-translate` as a streaming speech-to-speech model using the dedicated `/v1/realtime/translations` endpoint, returning translated audio and transcript deltas while source audio is still arriving.

## **3\. Phase 1 Data Policy**

No server database.

No server-side transcript storage.

No conversation history.

Optional browser-only recording is acceptable if:

Recording is off by default.  
 User explicitly starts recording.  
 Audio/transcripts stay in browser memory or local file blobs.  
 Downloads are generated locally.  
 Refreshing the page clears unsaved session data.  
 No recording is uploaded to SimTalk servers.

This is the right compromise for testing without creating privacy/compliance baggage too early.

## **4\. Phase 1 Security Controls**

Phase 1 should be private/internal only.

Minimum controls:

Vercel Password Protection enabled.  
 Single allowlisted user/email.  
 No public signup.  
 No OpenAI API key in browser.  
 Browser receives only short-lived ephemeral OpenAI tokens.  
 Backend validates requested mode/languages before issuing session token.  
 Strict CORS for `simtalk.app`.  
 Rate limit token creation endpoint.  
 Disable transcript logging.  
 Set security headers: CSP, HSTS, X-Frame-Options / frame-ancestors, Referrer-Policy.  
 Environment variables stored only in Vercel project settings.

Big warning: Vercel password protection is fine for Phase 1 internal testing, but it is not a production auth model.

## **5\. Phase 1 Runtime Flow**

User opens `simtalk.app`.

Vercel protection gates access.

User selects mode and languages.

Frontend asks Node service for a short-lived OpenAI realtime translation session.

Backend validates request and calls OpenAI.

Backend returns ephemeral session credentials.

Browser establishes WebRTC session directly with OpenAI.

Translated audio and transcript deltas stream back to browser.

Optional recording/download remains local.

## **6\. Mode Implementation**

Listener Mode: one input stream, one selected output language.

Turn-about Mode: two configured language directions, manual switch toggle. Do not rely on diarisation in v1.

Practice Mode: push-to-speak or record/pause/translate flow. This should feel deliberate, not continuous.

Teach Me Mode: excluded from Phase 1 core architecture. It should later use a separate teacher/assistant model, not the translation-only path.

## **7\. Phase 2 Architecture**

Move to:

Frontend: React/Vite or Next.js  
 Backend: Google Cloud Run  
 Auth: Supabase Auth, Firebase Auth, or Auth0  
 Database: Supabase Postgres or Cloud SQL  
 Room/media layer: LiveKit or equivalent  
 Realtime translation: OpenAI Realtime Translate  
 Storage: optional encrypted object storage for user-controlled recordings

Cloud Run services:

`simtalk-api` — auth, rooms, preferences, billing, session policy  
 `simtalk-realtime` — room orchestration, token minting, media/session coordination  
 `simtalk-worker` — async summaries, usage rollups, cleanup jobs

## **8\. Phase 2 Room Model**

Start with 2-user rooms.

Then support up to 10 participants.

Each participant chooses:

Spoken language  
 Preferred hearing language  
 Caption preference  
 Audio output preference

Avoid translating every participant to every other participant by default. Translate active speaker audio into distinct target languages required by listeners.

## **9\. Key Risks**

Latency may make the app feel broken even if technically correct.

Bluetooth and AirPods routing may be inconsistent across browsers.

Group mode can become expensive if every speaker/language pair creates separate translation sessions.

Recording creates privacy risk; keep it local until there is a proper consent and retention model.

## **10\. Open Questions Before Build**

The only real unresolved decision is whether the Phase 1 “small Node service” lives as:

A Vercel serverless API route, simplest deployment, or  
 A standalone Node/Hono service, easier to migrate to Cloud Run later.

My recommendation: **standalone Node/Hono service deployed on Vercel for Phase 1**, then move the same service to Cloud Run in Phase 2\.
