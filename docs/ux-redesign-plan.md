# SimTalk Phase 1 — UX Simplification & Design-System Migration Plan

Status: proposal. No code touched yet. Confirm scope, then we execute incrementally.

Source of truth for visual language: the SimTalk Design System bundle (`README.md`, `colors_and_type.css`, `ui_kits/app/*.jsx`) fetched from the supplied handoff URL. Where the bundle and current implementation conflict, the bundle wins for visuals; the current Zod contracts and `realtimeTranslationSession.ts` win for behavior.

## Phase 1 modes — locked definitions

These three modes are the only product surfaces in scope. The IA, screens, components, and flows below are derived from them:

1. **Listener Mode (UN Mode)** — auto-detects the incoming spoken language, returns **live translated audio + live transcription** in the user-selected target language. No source-language picker. Ambient; the user is listening, not speaking. One target language input only.
2. **Turn-about Mode** — two people share **one device**, manually flipping speaker direction between turns. Needs an explicit language pair (A↔B). The active speaker holds-to-talk; the other listens, then flips.
3. **Practice Mode** — single user practising a target language. Speak, pause, listen back to the model's translation, **attempt the translation themselves** (typed or spoken), then reveal & review. Needs an explicit source→target pair; loop is one phrase at a time.

These differences shape: language pickers (Listener = 1 card; Turn-about/Practice = 2 cards), composer (Listener = pause; Turn-about = hold-to-talk + flip; Practice = record/listen/attempt/reveal), and what's shown on the surface (Listener = live caption + scrolling transcript; Turn-about = chat turns; Practice = single phrase card + self-attempt input).

---

## 1. UX Audit — current problems

Sample: `frontend/src/App.tsx` (1,070 lines, single component).

| #   | Problem                                                                                                                                                                                                                                                                     | Evidence                                         | Cost                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | Single screen exposes 6 stacked panels at once: hero, status card #1, session-setup card, status card #2 (duplicate), mode-flow card, two transcript cards, footer.                                                                                                         | App.tsx:674–1066                                 | User cannot find the dominant action.                                          |
| 2   | Two competing "status" surfaces (`ListeningOrb` rendered in hero **and** status card) showing the same `activeStatusDetails`.                                                                                                                                               | App.tsx:696–707 + 837–861                        | Double cognitive load; conflicting focal points.                               |
| 3   | Implementation detail leaked into chrome: `sessionId`, `translationCallUrl`, credential expiry timestamps rendered as a `dl` in the primary surface.                                                                                                                        | App.tsx:885–904                                  | Reads as developer console; violates "chrome stays out of the way" brand rule. |
| 4   | Engineering vocabulary in user-facing copy: "Preparing a session only requests a short-lived credential", "WebRTC endpoint", "Translation language", "credential prepared".                                                                                                 | App.tsx:131–161, 718, 805                        | Brand voice rule: "loud, hyped, warm" → all caps display, simple verbs.        |
| 5   | Two-step flow (prepare credential → start mic) is forced on the user even though token-mint can be lazy under start.                                                                                                                                                        | App.tsx:539–578 + 580–638                        | Doubles taps for the dominant action.                                          |
| 6   | Mode selection rendered as three full radio cards with eyebrow + icon + description + helper text.                                                                                                                                                                          | App.tsx:729–765                                  | Three large competing cards instead of a single segmented control.             |
| 7   | Listener Mode shows two side-by-side transcript panels with "Waiting for input transcript deltas" placeholders. Listener should be ambient — single live transcript in the target language only (source-language transcript adds no value when the user is just listening). | App.tsx:1027–1059                                | Practice's dual-pane needs leak into Listener.                                 |
| 8   | Recording panel always visible, with five micro-states and three buttons, even on the lobby.                                                                                                                                                                                | App.tsx:906–955                                  | Should be in-session and secondary.                                            |
| 9   | Visual system uses washed neutrals + `bg-background/72 backdrop-blur` (App.tsx:679, 696, etc). Brand rule is **dark-first, nebula gradient, no washed neutrals**.                                                                                                           | App.tsx + tailwind `bg-card/78`, `border-border` | Beige/glass aesthetic violates brand.                                          |
| 10  | Font stack defaults to UI sans; no Luckiest Guy display, no `paint-order: stroke fill` shouty headings.                                                                                                                                                                     | No `--font-display` in styles.css                | Brand voice missing entirely.                                                  |
| 11  | Language selection is two native `<select>` boxes + a flip button bolted on. Brand pattern uses two large language cards with overlapping swap chip.                                                                                                                        | App.tsx:770–822                                  | Cheaper alternative exists in design kit.                                      |
| 12  | Mode-flow card is pure explanatory chrome ("Current direction", "Mode rule", "Next action").                                                                                                                                                                                | App.tsx:960–1009                                 | Reads as docs; should be deleted.                                              |
| 13  | Hero says "polished browser-owned translation console for validating live speech…" — describes the implementation, not the user task.                                                                                                                                       | App.tsx:689–693                                  | Cut.                                                                           |
| 14  | Layout is 7-col fluid desktop dashboard. PRD is single-device prototype — should be mobile-first.                                                                                                                                                                           | `lg:grid-cols-…` everywhere                      | Wrong default surface.                                                         |

**Root cause:** App.tsx is a debug HUD with brand paint, not a product. Every backend state is surfaced. Every option is always visible.

---

## 2. Proposed Information Architecture

Single-surface app with one optional sheet and one optional drawer.

```
┌─────────────────────────────────────┐
│           NebulaBackground          │  ← always-on radial gradient (--bg-nebula)
│                                     │
│   ┌─ Header (minimal) ──────────┐   │  status pill + ⓘ drawer trigger
│   ┌─ Main Surface ──────────────┐   │
│   │  changes per route          │   │
│   │                             │   │
│   │  routes:                    │   │
│   │  /            → Lobby       │   │
│   │  /session     → Live        │   │
│   │  /session/end → Summary     │   │
│   └─────────────────────────────┘   │
│   ┌─ One dominant CTA ──────────┐   │  Hyper Pink launch / mic
│                                     │
└─────────────────────────────────────┘

Modals (overlay nebula):
  • LanguagePickerSheet — bottom sheet, swipe-down dismiss
  • OnboardingCard     — first visit only, single card
  • DevDrawer (debug)  — slide-from-right, hidden behind ⌥/alt-D
                         shows sessionId, expiresAt, translationCallUrl,
                         WebRTC state, raw transcript stream
```

Three routes total. No tabs, no sidebar, no permanent panels.

---

## 3. Screen Hierarchy

### Lobby (`/`) — replaces current dashboard

- Hero: 3D shouty title — mode-dependent.
  - Listener → **"JUST / LISTEN."**
  - Turn-about → **"TALK TO / ANYONE."**
  - Practice → **"PRACTICE."**
- Mode segmented control (3 pills) — Listener / Turn-about / Practice. Default = Listener (it's the lowest-friction mode and matches the README phrasing "any supported spoken language").
- Language pickers — **shape depends on mode**:
  - Listener (UN Mode): one card only, labelled **"Translate into"**. No source picker, since OpenAI auto-detects the incoming language. A small caption underneath: "Any spoken language. We'll detect it."
  - Turn-about: two cards side-by-side ("Person A" / "Person B") with a 44px swap chip overlapping the gutter — direction is symmetrical and the flip is in-session.
  - Practice: two cards ("You speak" → "Translate to"). Arrow chip instead of swap chip — the relationship is directional (source→target), not symmetrical.
- One dominant CTA: **LAUNCH** (Hyper Pink, `STButton size="lg"`).
- That's it. No status, no credential, no transcripts.

### Live Session (`/session`) — mode-aware variants on one component

- Top bar: ✕ end, language pair flags, live indicator (cyan dot + duration). 56px tall.
- Body: changes per mode (see §7).
- Bottom: composer — mic button (or play-pause for Listener; turn-flip for Turn-about; record/review for Practice).

### Summary (`/session/end`)

- Title: "SESSION ENDED" (3D shouty).
- Transcript card (white on nebula, navy border, navy 6px shadow) — both halves of the conversation.
- Buttons: **NEW SESSION** (pink primary) + COPY TRANSCRIPT (cyan secondary) + Save audio (ghost) if a local recording exists.

### Onboarding card (first visit only)

- Single card on nebula. Three lines: what it does, mic permission ask, "LAUNCH" CTA. Dismissed forever after first launch.

### Dev drawer (hidden)

- Right-side sheet. Toggled by `?dev=1`, `⌥+D`, or a near-invisible navy `·` in top-right corner.
- Contents: session ID, credential expires, translation call URL, current WebRTC state, recent transcript-delta log, copy-as-JSON.
- Default: closed. Never visible to a normal user.

---

## 4. Component Inventory

| Component                  | Source                         | Purpose                                                                                                        | Replaces                                                                         |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `NebulaBackground`         | new                            | fixed radial gradient + optional star noise layer                                                              | `bg-card/78 backdrop-blur` shell                                                 |
| `STButton`                 | port from kit `Primitives.jsx` | 3D pink/cyan/ghost CTA with hover-lift, press-flatten                                                          | `components/ui/button.tsx` (kept internally if shadcn-shape preserved; restyled) |
| `STCard`                   | port                           | white card with 3px navy border + 6px navy block-shadow                                                        | `components/ui/card.tsx`                                                         |
| `STTitle`                  | port                           | shouty 3D `paint-order: stroke fill` text                                                                      | replaces hero `<h1>`                                                             |
| `STChip` / `STPill`        | port                           | small caps labels                                                                                              | replaces `<Badge>`                                                               |
| `STIcon` + `Icons.jsx` set | port                           | in-house chunky filled SVG icons                                                                               | removes `lucide-react` dep (or wraps so we keep tree-shaken usage minimal)       |
| `LangCard`                 | port                           | language selector card with flag chip                                                                          | replaces `<select>` boxes                                                        |
| `LanguagePickerSheet`      | port                           | bottom-sheet picker with full language list                                                                    | new                                                                              |
| `ModeSegmented`            | new                            | 3-pill segmented control                                                                                       | replaces 3 radio cards                                                           |
| `LobbyLangPickers`         | new                            | mode-aware picker layout (1 card / 2 cards-swap / 2 cards-arrow)                                               | new                                                                              |
| `LaunchHero`               | new                            | combines `STTitle` + tagline + mode segmented + lang pickers + LAUNCH                                          | replaces Session Setup card                                                      |
| `SessionHeader`            | port (TranslateScreen)         | 56px top bar with flag(s) + live dot                                                                           | new                                                                              |
| `ListenerSurface`          | new                            | ambient halo + live target-language caption + auto-scrolling rolling transcript (target language only) + PAUSE | replaces transcript dual-panel                                                   |
| `TurnaboutSurface`         | port (TranslateScreen)         | chat-style turns, hold-to-talk mic, manual flip between turns                                                  | new                                                                              |
| `PracticeSurface`          | new                            | one-phrase loop: record → listen-back → self-attempt (type/speak) → reveal → review                            | new                                                                              |
| `SelfAttemptInput`         | new                            | text input + optional mic for the user's own translation guess in Practice                                     | new                                                                              |
| `DevDrawer`                | new                            | dev-only sheet                                                                                                 | replaces inline `dl` of session details                                          |
| `SessionStatusPill`        | new                            | small caps "TRANSLATING…" / "LIVE 02:14" indicator                                                             | replaces `statusDetails` chatter                                                 |

Kept as-is (logic, no visuals): `realtimeTokenClient.ts`, `realtimeTranslationSession.ts`, `RealtimeTokenClientError`, transcript delta handler, local recording state machine, abort/teardown lifecycle.

Deleted: `ListeningOrb`, `statusDetails` map, `modeMeta`, `modeDescriptions`, "Mode flow" card, dual transcript card grid, footer paragraph.

---

## 5. Design Tokens

Port `colors_and_type.css` verbatim into `frontend/src/styles/tokens.css` and import once from `main.tsx`. Aliases for the legacy variables already used in `styles.css` so we can migrate incrementally:

```css
/* tokens.css — verbatim from design kit, with semantic aliases */

@import url("https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Poppins:wght@400;500;600;700;800&display=swap");

:root {
  --color-navy: #0b1149;
  --color-navy-deep: #060a2e;
  --color-purple: #6b3fd0;
  --color-purple-soft: #8b5bff;
  --color-pink: #ff3e9e;
  --color-pink-deep: #d81f7e;
  --color-cyan: #2be6f2;
  --color-cyan-deep: #0fb8c5;
  --color-yellow: #ffd23f;
  --color-white: #ffffff;

  --bg-nebula: radial-gradient(120% 90% at 50% 45%, #7a4de6 0%, #4327b0 28%, #1a1a78 55%, var(--color-navy-deep) 100%);

  --font-display: "Luckiest Guy", system-ui, sans-serif;
  --font-body: "Poppins", system-ui, sans-serif;

  --r-md: 16px;
  --r-lg: 22px;
  --r-xl: 32px;
  --r-pill: 999px;
  --shadow-3d-sm: 0 3px 0 0 var(--color-navy);
  --shadow-3d-md: 0 6px 0 0 var(--color-navy);
  --shadow-3d-lg: 0 10px 0 0 var(--color-navy);
  --halo-pink: 0 0 40px rgba(255, 62, 158, 0.45);
  --halo-cyan: 0 0 40px rgba(43, 230, 242, 0.35);

  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 120ms;
  --dur-base: 220ms;

  /* Aliases to map legacy Tailwind/shadcn vars in current styles.css */
  --background: var(--color-navy-deep);
  --foreground: var(--color-white);
  --primary: var(--color-pink);
  --primary-foreground: var(--color-white);
  --secondary: var(--color-cyan);
  --secondary-foreground: var(--color-navy);
  --border: var(--color-navy);
  --ring: var(--color-cyan);
}
```

Rules (enforced in PR review):

- No beige/neutral grays. `bg-muted`, `bg-background/72`, `text-muted-foreground` are removed during migration.
- Every primary CTA → Hyper Pink with navy 6px block-shadow.
- Every secondary CTA → Orbit Cyan, navy border.
- Surfaces over nebula either go transparent (`rgba(255,255,255,0.08–0.20)` scrim) or white card with navy border. Never gray.
- Body text in `Poppins`. Display in `Luckiest Guy`, ALL CAPS, with the 4px navy stroke + 6px navy shadow for hero only.
- Borders: 3px for buttons/cards, 2px for chips. No 1px hairlines.

---

## 6. Mobile-First Layout

Default viewport: 390×844 (iPhone 14). Three breakpoints only:

| Width       | Layout                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `<480px`    | single column, 18px gutters, 110px bottom padding (room for CTA). Lobby hero stacks; lang cards stack only when name overflows. |
| `480–820px` | same single column, max-width 480px centered, 24px gutters.                                                                     |
| `>820px`    | center the 480px column on nebula; show a faint orbit ring SVG behind. **No multi-column dashboard.**                           |

The desktop power-user experience is the mobile experience centered with breathing room. This matches Phase 1's single-device positioning and avoids re-doing layout in Phase 2 when rooms ship.

---

## 7. Mode-Specific Flows

### Listener Mode — UN Mode (ambient/passive)

Intent: user listens to incoming speech in **any** language and hears + reads it in their chosen target language. No setup beyond "translate into X".

```
Header:  ←   🎧 → 🇪🇸 ES   • LIVE 02:14   ⓘ
            (auto-detect badge,
             no source flag)
─────────────────────────────────────────
                ◯◯◯
       large pulsing cyan halo (--halo-cyan)
       reacts to incoming audio amplitude

       "translating…" caption (when streaming)
       "listening…"    caption (idle/silence)
─────────────────────────────────────────
  ╔═══════════════════════════════════════╗
  ║  LIVE CAPTION (target language only)  ║   ← single line, large,
  ║  Last 2–3 sentences, opacity-fade     ║     `STTitle` size 22
  ║  Always visible, dominant focal       ║
  ╚═══════════════════════════════════════╝

  ┌─ Rolling transcript ─────────────────┐
  │ Older translated sentences, scrolls  │   ← scrollable, dimmed
  │ down as new ones arrive. Tap to      │     (`--fg-on-dark-2`),
  │ open full transcript sheet.          │     last ~6 entries visible
  └──────────────────────────────────────┘
─────────────────────────────────────────
        [ ◼ PAUSE LISTENING ]              ← cyan secondary, full-width
```

Rules:

- **No source-language transcript displayed.** Auto-detect, single-direction. The source-language input deltas are still captured (for the dev drawer and exportable summary) but never rendered on the surface.
- One large live caption is the focal point; the rolling transcript below is supporting context.
- Auto-detect is shown explicitly: a "🎧" headphone glyph or "AUTO" pill replaces the source-language flag in the header.
- Pause stops the WebRTC session cleanly and surfaces a **RESUME** + **END** pair (resume re-mints token if expired).
- Tapping anywhere on the rolling transcript opens a full-history bottom sheet (read-only, copy-all).

### Turn-about Mode — shared single device (conversational/tactile)

Intent: two people, one phone, one language pair (A↔B). They pass the device between turns; the **active speaker** is whichever side last held the mic. This is NOT a remote call — both speakers and the device are in the same room.

```
Header: ←  🇬🇧 EN  ⇄  🇪🇸 ES   • LIVE 02:14   ⓘ
              ↑ active speaker side is highlighted
                with a hyper-pink underline; tap header
                flag to manually set active speaker.
─────────────────────────────────────────
  Chat bubbles, **active speaker side = right** (pink, "YOU"),
  other side = left (white, "THEM"). The labels swap when the
  device is flipped, so whoever's holding it is always "YOU".

  Each turn:
    [SPEAKER BADGE · LANG]
    "Original utterance"                    ← pink (active) or white
    ┌ translating… → settled ──────────┐
    │ Translated text · target language │   ← dashed-navy bordered
    └───────────────────────────────────┘
  Auto-scroll on new turn.
─────────────────────────────────────────
   [ ⇄ FLIP SIDES ]   ●  HOLD TO TALK
   cyan secondary     68px pink mic, navy 6px shadow
                      press → flatten + LISTENING… + waveform
                      release → auto-sends, translation streams
```

Rules:

- **One mic, one CTA.** Hold-to-talk is the only speak affordance. Releasing the press auto-sends; no separate "stop" button.
- The active direction at any moment is derived from `(activeSide, langPair)` — same backend token works for both directions because the token was minted with both langs. Flipping is a pure UI swap; **no token re-mint** unless the user re-opens the lobby.
- **FLIP SIDES** physically rotates which side is "YOU" (i.e. who's about to speak). Visual cue: a 180° card-flip animation on the chat thread alignment, plus the active flag in the header swaps highlight.
- Tap-and-hold ergonomics: the pink mic sits bottom-center within thumb reach; flip button is left of mic and reachable by the other hand when passing the device.
- Audio replay is per-bubble (cyan secondary chip on the translation card) so the listener can hear it again if they missed it.

### Practice Mode (calm/guided, self-test)

Intent: one user practising a target language. The loop is **speak → pause → listen back → attempt the translation yourself → reveal → review**. The "test yourself" step is the differentiator vs Listener.

State machine (one phrase at a time):

```
IDLE  →  RECORDING  →  REVIEWING_SOURCE  →  ATTEMPTING  →  REVEALED  →  IDLE
 ▲         ▲                                                              │
 │         └─────────  TRY AGAIN  ────────────────────────────────────────┤
 └──────────────────  NEXT PHRASE  ───────────────────────────────────────┘
```

Per-state surfaces:

```
─── IDLE ──────────────────────────────────────
Header: ←  🇬🇧 EN → 🇪🇸 ES   • PRACTICE   ⓘ
              "Say something in English."           ← coaching line
              (empty phrase card placeholder, dimmed)
              ●  TAP TO RECORD                     ← pink, large

─── RECORDING ─────────────────────────────────
              "Listening… speak naturally."
              (live waveform fills phrase card top)
              ■  STOP RECORDING                    ← pink, large

─── REVIEWING_SOURCE ──────────────────────────
              "Here's what we heard:"
              ┌─ PHRASE CARD ──────────────────┐
              │  YOU SAID  · EN                 │
              │  "The one near the river."      │
              │                                 │
              │  ▶︎ Replay your audio            │   ← cyan secondary chip
              └─────────────────────────────────┘
              "Now try translating it yourself."
              [ TYPE YOUR GUESS ]  [ 🎤 SAY IT ]   ← cyan + ghost

─── ATTEMPTING ────────────────────────────────
              (same phrase card, plus:)
              ┌─ YOUR ATTEMPT ─────────────────┐
              │  [text input or live mic capture]│
              │                                 │
              │  [ REVEAL ANSWER ]              │   ← pink primary
              └─────────────────────────────────┘

─── REVEALED ──────────────────────────────────
              ┌─ PHRASE CARD ──────────────────┐
              │  YOU SAID                       │
              │  "The one near the river."      │
              │                                 │
              │  YOUR ATTEMPT  · self           │
              │  "El que está cerca del río."   │
              │                                 │
              │  MODEL TRANSLATION  · ES        │
              │  "El que está junto al río."    │
              │  ▶︎ Play translation             │
              │                                 │
              │  Subtle diff highlight on the   │
              │  two ES strings (word-level,    │
              │  cyan for match, pink for diff) │
              └─────────────────────────────────┘
              [ TRY AGAIN ]     [ NEXT PHRASE ]
              cyan secondary     pink primary
```

Rules:

- One phrase at a time. **No streaming caption** during recording — the user is talking, not reading.
- The self-attempt is **optional but encouraged** by the layout. Skipping straight to "REVEAL ANSWER" with an empty attempt is allowed (defaults to "—").
- `TRY AGAIN` clears attempt + recording, returns to IDLE with the same source/target pair.
- `NEXT PHRASE` archives the current loop to the in-session summary buffer and returns to IDLE.
- Diff highlighting: simple word-level token diff on `(userAttempt, modelTranslation)` — cyan = exact match, pink = mismatch. Pure client-side, no extra API call.
- Tone: instructional, calm. No streaks, no XP, no scoring numbers (despite the design kit having `STPill` for XP — explicitly out of scope for Phase 1).
- Practice never auto-progresses. Every state transition is a deliberate user action.

---

## 8. Incremental Implementation Plan

Eight PRs, each independently mergeable and reversible. No big-bang rewrite. The behavior layer (`realtimeTokenClient.ts`, `realtimeTranslationSession.ts`, all hooks, all schemas) is untouched in PRs 1–6.

### PR 1 — Tokens + nebula shell (no behavior change)

- Add `frontend/src/styles/tokens.css` (verbatim from design kit + aliases).
- Replace `<main className="…bg-background…">` with `bg-nebula` shell.
- Map legacy Tailwind vars (`--primary`, `--border`, etc.) to brand tokens so existing shadcn components instantly re-skin.
- Add `Luckiest Guy` + `Poppins` via Google Fonts in `index.html`.
- Verify: visual screenshot diff; no test changes.

### PR 2 — STButton, STCard, STTitle, STChip primitives

- Add `frontend/src/components/brand/*` with React+TS ports of `Primitives.jsx`.
- Convert existing `components/ui/button.tsx` to wrap `STButton` (preserves call sites).
- Convert `components/ui/card.tsx` to wrap `STCard`.
- Convert `<Badge>` → `STChip`.
- Component tests in `tests/frontend/component/` for hover-lift, press-flatten, focus ring.

### PR 3 — Icon set + LangCard + LanguagePickerSheet

- Port `Icons.jsx` to TS as `frontend/src/components/brand/icons.tsx` with `STIcon` component.
- Remove `lucide-react` usage from App.tsx (keep dep until last call site is gone).
- Add `LangCard` and `LanguagePickerSheet`. Wire them to existing `sourceLanguage`/`targetLanguage` state behind a feature toggle; native `<select>` still mounted in DOM as fallback for current tests.

### PR 4 — Lobby route (Launch flow)

- Add `react-router` (already justified by 3 routes) **or** keep a single component with a `view` state — cheaper if routing is overkill. Recommend the latter for Phase 1.
- Build `LaunchHero` (title varies by mode + mode segmented + mode-aware `LobbyLangPickers` + LAUNCH).
- `LobbyLangPickers` switches layout per mode:
  - Listener → 1 target-only card + "Any spoken language. We'll detect it." caption.
  - Turn-about → 2 cards + swap chip (symmetric pair).
  - Practice → 2 cards + arrow chip (directional pair).
- Inline the prepare-token step into LAUNCH: tapping LAUNCH calls `requestRealtimeToken` (with `sourceLanguage` omitted for Listener, populated for Turn-about/Practice — matches existing Zod contract) then `createRealtimeTranslationSession` back-to-back. Show "LAUNCHING…" then transition to live view. Surface failures inline on the lobby (don't navigate away).
- Delete: Session Setup card form, Mode-flow card, dual status orbs, footer copy.
- Existing component tests are updated, not rewritten — same `getByRole('button', { name: /launch/i })` style assertions.

### PR 5 — Live session shell + Turn-about surface

- Add `SessionHeader` with mode-aware flag display (Listener = `🎧 → flag`, Turn-about = `flag ⇄ flag` with active-side highlight, Practice = `flag → flag`).
- Add `TurnaboutSurface` with chat bubbles, hold-to-talk composer, and **FLIP SIDES** button. Active-side derivation is local UI state (no token re-mint).
- Wire to existing `onTranscriptDelta` — group by `activeSide` change to form turns. Per-turn replay uses cached `Blob` from the local recording feed (gated on Phase 1 — drop if `realtimeTranslationSession.ts` doesn't expose per-turn audio).
- Existing transcript-delta unit tests stay; add component tests for turn rendering and flip-side state swap.

### PR 6 — Listener + Practice surfaces

- **Listener:** `ListenerSurface` with ambient cyan halo (reacts to amplitude via `AnalyserNode` on the remote MediaStream), large single live caption (target-only), rolling translated-transcript list below, `PAUSE LISTENING` CTA. Source-language transcript deltas are still received but not rendered.
- **Practice:** `PracticeSurface` implementing the IDLE → RECORDING → REVIEWING_SOURCE → ATTEMPTING → REVEALED state machine. `SelfAttemptInput` (text input + optional mic) for the user's translation guess. Word-level diff on reveal using a small in-house tokenizer (no library).
- Mode is read from app state; surface chosen at render time. Existing mode-specific token request fields (`sourceLanguage` omitted for Listener, required for Turn-about/Practice) are unchanged.

### PR 7 — Summary screen + local recording move

- Add `/end` view (or `view === 'summary'`) with full transcript card.
- Move recording controls **into** the session header overflow menu — out of the lobby entirely.
- Auto-show recording download as a button on Summary when a blob exists.
- Delete the dedicated `<section aria-labelledby="local-recording-title">` from App.tsx.

### PR 8 — Dev drawer + cleanup

- Add `DevDrawer` mounted at app root, hidden by default. Trigger via `?dev=1`, `⌥+D`, or three taps on the version chip.
- Move `sessionId`, `expiresAt`, `translationCallUrl`, WebRTC state, raw transcript deltas into the drawer.
- Delete: `ListeningOrb` (replaced by halo), `statusDetails` map, `modeMeta`, `modeDescriptions`, all "validating live speech" copy.
- Remove `lucide-react` from `package.json` if no remaining usages.
- Component tests for drawer toggle + dev-mode-only rendering.

### Net diff after PR 8

- App.tsx → roughly 200 lines, orchestration only (state machine + view router).
- New `components/brand/` directory (~700 lines, mostly verbatim ports).
- Three view components, each ~150 lines.
- `styles.css` mostly deleted; `tokens.css` is the only global stylesheet.
- Behavior surface (`realtimeTranslationSession.ts`, schemas, backend) unchanged.

### What we explicitly do NOT do in this plan

- No backend changes. `POST /realtime/token` stays. CORS, headers, rate limit untouched.
- No new dependencies beyond fonts. Tailwind v4 stays; we use it as a token consumer, not for new utilities.
- No Phase 2 features (auth, rooms, accounts).
- No animation framework swap. `framer-motion` stays for the halo pulse and bubble entrance; we just don't add to it.
- No design tooling. Components are hand-coded React; the design kit's `.jsx` files are reference, not runtime.

---

## Locked Decisions (answered 2026-05-23)

1. **Routing:** single-component with `view` state for Phase 1. No `react-router`.
2. **Audio replay:** Practice replay shipped (local `MediaRecorder` snippet). Turn-about per-turn replay deferred.
3. **Onboarding card:** skipped. Mic permission prompt is implicit on LAUNCH.
4. **`lucide-react`:** removed. In-house `STIcon` set only.
5. **Practice scoring:** soft word-level diff (cyan match / pink mismatch). No verdicts, no scoring.
6. **Listener auto-detect badge:** `🎧` headphone glyph in place of source flag.
7. **Turn-about flip:** no token re-mint. Token assumed bidirectional for the issued pair.

## Open Questions Before PR 1

1. **Routing:** add `react-router` (clean URLs, deep-linkable summary), or stay single-component with `view` state? Recommend single-component for Phase 1. [Stay single-component for phase 1]
2. **Audio replay primitive:** keep the per-turn replay button (design kit shows it) or drop, since `gpt-realtime-translate` streams playback live and there's no per-utterance audio cache in `realtimeTranslationSession.ts` today? Practice mode's "▶︎ Replay your audio" needs at minimum a local-mic snippet, which we can capture via the existing `MediaRecorder` plumbing. Recommend: ship Practice replay (cheap, local recorder already exists); defer Turn-about per-turn replay until the session service can chunk outbound audio. [Yes ship Practice replay]
3. **Onboarding card:** required for first visit, or skip entirely (mic permission prompt is implicit on LAUNCH)? Recommend skip; the design kit's README confirms onboarding is out of scope for v1. [mic permission is implicit on LAUNCH]
4. **`lucide-react` removal:** OK to remove and rely solely on the in-house `STIcon` set? Currently ~10 lucide icons in use. Recommend yes — design kit explicitly says no third-party icons. [Yes use STIcon set]
5. **Practice self-attempt scoring:** word-level diff with cyan/pink highlights is the proposed feedback. Acceptable, or do you want a stricter "right / partial / wrong" verdict (e.g. normalised string equality after diacritics + casing strip)? Recommend the soft diff — keeps the tone calm, never gamified, and avoids the model judging the user. [Yes soft diff]
6. **Listener auto-detect surface affordance:** the proposal uses a `🎧` headphone glyph in place of a source flag. Alternatives: an "AUTO" pill, or a globe `🌐` icon. Recommend the headphone — it's the only mode where the user is purely listening, and it matches the brand's chunky-icon style. [Yes headphone]
7. **Turn-about flip without re-mint:** confirmed the OpenAI token issued for `(source, target)` works in both directions of the live session? The current `realtimeTokenClient` posts both langs; backend forwards to `gpt-realtime-translate`. If the upstream model only translates one way per token, Turn-about needs a token re-mint on flip — adds ~300ms latency to each flip and changes the UX (loading state on FLIP SIDES button). **This is the single biggest unknown to validate before PR 5.** [without token re-mint]

Answer these and we start with PR 1.
