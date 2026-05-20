# simtalk

Speak naturally. Hear instantly.

SimTalk is a real-time speech translation application built on OpenAI’s gpt-realtime-translate model. It enables people who speak different languages to communicate naturally using live translated audio and transcripts.

Phase 1 is a private, single-user web application focused on rapid validation of three core conversation modes:

- Listener Mode (UN Mode) — Listen to any supported language and hear live translation in your preferred language.
- Turn-about Mode — Two people share one device and take turns speaking.
- Practice Mode — Speak, pause, and review translations for language learning.

Phase 2 will expand SimTalk into a public multi-user application with authenticated accounts and live translation rooms for 2–10 participants.

⸻

Product Context

SimTalk solves a simple but universal problem: two people want to communicate, but they do not share a common language.

Unlike traditional translation apps that rely on text input or awkward turn-based interactions, SimTalk is designed for low-latency speech-to-speech translation that feels as close as possible to a natural conversation.

For product scope and architectural decisions, see:

- [Product Requirements Document (PRD)](./PRD.md)
- [System Architecture Specification](./System_Architecture.md)

⸻

Project Status

Status: Pre-MVP

Current objective:

Build a private Phase 1 prototype that proves low-latency speech translation works reliably in real-world conversations.

The primary success criterion is product validation, not scale.

Current scaffold:

- pnpm workspace with `frontend`, `backend`, and `shared/types` packages.
- React 19 + Vite frontend shell.
- Node.js + Hono backend shell with a typed `/health` endpoint.
- Shared Zod-backed TypeScript contracts.
- Vitest unit tests and Playwright E2E smoke tests.

⸻

Technology Stack

Phase 1

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + Vite 7 + TypeScript |
| UI | CSS variables now; planned Tailwind CSS + shadcn/ui |
| Backend | Node.js + Hono |
| Shared contracts | TypeScript + Zod |
| Realtime Translation | OpenAI gpt-realtime-translate |
| Transport | Browser WebRTC |
| Deployment | Vercel |
| Authentication | Vercel Password Protection + allowlist |
| Database | None |
| Storage | Browser-local only |
| Domain | simtalk.app |

Phase 2

| Layer | Technology |
| --- | --- |
| Backend Hosting | Google Cloud Run |
| Authentication | Supabase Auth or equivalent |
| Database | Supabase Postgres |
| Realtime Rooms | LiveKit (likely) |
| Storage | GCS / Supabase Storage |

⸻

Core Design Principles

1. Conversation first — Optimize for fluid communication, not perfect literal translation.
2. Ship fast — Validate with real users before adding complexity.
3. Privacy by default — No server-side storage in Phase 1.
4. Keep architecture simple — Introduce only the components needed today.
5. AI-friendly codebase — Clear conventions, deterministic structure, and comprehensive documentation.
6. Security by default — Secrets never exposed to the browser.
7. Evolutionary architecture — Phase 1 decisions should not block Phase 2.

⸻

Functional Requirements

Listener Mode (UN Mode)

- Capture live microphone audio.
- Translate from any supported input language.
- Play translated audio in selected target language.
- Display source and translated transcripts.

Turn-about Mode

- Configure two language directions.
- Large toggle to switch speaker roles.
- Shared-device conversational workflow.

Practice Mode

- Push-to-talk or record/pause workflow.
- Replay translated response.
- Review transcripts.

Optional Local Recording

- Off by default.
- Record audio locally in browser.
- Allow transcript and audio download.
- Never upload recordings to SimTalk servers.

⸻

Non-Goals (Phase 1)

- Public signup.
- Multi-user rooms.
- Server-side transcript storage.
- Billing.
- Native mobile apps.
- Video conferencing.
- Offline translation.
- AI teaching/tutoring.

⸻

Repository Structure

simtalk/
├── README.md
├── PRD.md
├── System_Architecture.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── playwright.config.ts
├── .agentic/                  # AI memory layer (PROJECT_BRIEF, MEMORY_INDEX, SUBSYSTEMS)
├── docs/                      # planned: api.md, security.md, deployment.md
├── frontend/
│ ├── index.html
│ ├── src/
│ ├── public/
│ └── package.json
├── backend/
│ ├── src/
│ │ ├── routes/
│ │ ├── services/
│ │ ├── middleware/
│ │ ├── schemas/
│ │ └── utils/
│ └── package.json
├── shared/
│ └── types/
│   ├── src/
│   └── package.json
├── scripts/
├── tests/
└── .github/
└── workflows/

⸻

Architecture Overview

Browser Responsibilities

- Microphone capture.
- WebRTC session establishment.
- Playback of translated audio.
- Transcript rendering.
- Local recording and download.

Backend Responsibilities

- Health checks.
- OpenAI ephemeral token generation.
- Request validation.
- Rate limiting.
- Security enforcement.

OpenAI Responsibilities

- Speech recognition.
- Translation.
- Audio synthesis.
- Transcript streaming.

⸻

Security Model

Phase 1 Security Controls

- Vercel Password Protection.
- Single-user allowlist.
- No public registration.
- OpenAI API key stored server-side only.
- Ephemeral tokens issued to browser.
- Strict CORS.
- Rate limiting on token endpoints.
- No transcript logging.
- Secure response headers.
- Dependency scanning.

Data Handling

Data Type Stored Server-Side?
Audio streams No
Transcripts No
User accounts No
Usage metrics Minimal, non-content only
Local recordings Browser only

⸻

Development Workflow

Branch Strategy

- main — Production-ready.
- develop — Integration branch.
- feature/\* — Feature work.
- fix/\* — Bug fixes.

Commit Style

Conventional Commits:

- feat:
- fix:
- refactor:
- docs:
- test:
- chore:

Pull Requests

Each PR should include:

- Problem statement.
- Scope.
- Security considerations.
- Testing evidence.
- Rollback notes.

⸻

AI Coding Assistant Guidelines

This repository is optimized for AI-assisted development.

Operating Rules

1. Read README.md and .agentic/PROJECT_BRIEF.md before making changes.
2. Prefer minimal, targeted changes.
3. Do not introduce new dependencies without justification.
4. Preserve backward compatibility.
5. Update documentation when architecture changes.
6. Add or update tests for all non-trivial logic.
7. Never expose secrets to client-side code.
8. If requirements are ambiguous, stop and ask.

Success Criteria for Tasks

- Build passes.
- Tests pass.
- No lint/type errors.
- No security regressions.
- Documentation updated.

⸻

Coding Standards

General

- TypeScript strict mode enabled.
- Avoid any unless documented.
- Use Zod for schema validation.
- Prefer pure functions.
- Keep modules focused.

Frontend

- Functional React components.
- Custom hooks for complex logic.
- Presentation and business logic separated.

Backend

- Thin routes.
- Business logic in services.
- Centralized error handling.
- Schema validation at boundaries.

⸻

Testing Strategy

Frontend

- Vitest.
- React Testing Library.

Backend

- Vitest.
- Integration tests for API endpoints.

End-to-End

- Playwright.

Critical Scenarios

- Session token generation.
- WebRTC session establishment.
- Translation stream handling.
- Mode switching.
- Recording/download.
- Security enforcement.

⸻

Observability

Phase 1 observability should be lightweight.

Capture:

- Session start/end.
- Selected mode.
- Languages used.
- Time to first translated audio (TTFT).
- Session duration.
- Error rates.

Do not capture:

- Transcript content.
- Audio content.

⸻

Environment Variables

Backend

```bash
OPENAI_API_KEY=
APP_ENV=development
PORT=3000
APP_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://simtalk.app
SESSION_SECRET=
VERCEL_PROTECTION_BYPASS_SECRET=
```

Frontend

```bash
VITE_API_BASE_URL=http://localhost:3000
```

⸻

Local Development

Prerequisites

- Node.js 22+
- pnpm 10+
- OpenAI API key

Setup

```bash
git clone git@github.com:t8/simtalk.git
cd simtalk
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
pnpm dev
```

Services

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

⸻

Deployment

Phase 1 (Vercel)

- Frontend and backend deployed to Vercel.
- Protected with Vercel password access.
- Environment variables configured in project settings.
- Custom domain simtalk.app.

Phase 2 (Google Cloud Run)

- Containerized services.
- HTTPS load balancer.
- Managed secrets.
- Autoscaling.

⸻

Roadmap

Phase 1

- Listener Mode.
- Turn-about Mode.
- Practice Mode.
- Local recording.
- Private deployment.

Phase 2

- User accounts.
- Persistent preferences.
- 2-user rooms.
- 3–10 participant rooms.

Phase 3

- Teach Me Mode.
- Subscription billing.
- Mobile apps.

⸻

Known Risks

- Translation latency.
- Browser audio quirks.
- Bluetooth compatibility.
- OpenAI API cost.
- Overlapping speech.

⸻

Decision Log

Date Decision
2026-05-20 Build Phase 1 as a private web app.
2026-05-20 Use React/Vite + Node/Hono.
2026-05-20 Use OpenAI gpt-realtime-translate.
2026-05-20 No database in Phase 1.
2026-05-20 No server-side transcript storage.
2026-05-20 Deploy to Vercel.
2026-05-20 Migrate to Cloud Run in Phase 2.

⸻

Contribution Philosophy

The best code is:

- Simple.
- Secure.
- Observable.
- Well-tested.
- Well-documented.
- Easy for both humans and AI to understand.

When in doubt, choose the simpler design.

⸻

License

Proprietary.

Copyright © Throwing Eights Pty Ltd (t8). All rights reserved.
