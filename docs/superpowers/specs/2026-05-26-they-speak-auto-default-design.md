# THEY SPEAK auto-default + partner-language mirroring

Date: 2026-05-26
Branch: `sit`
Scope: Remote Talk room (pre-join + live)

## Goal

Make the THEY SPEAK selector in a Remote Talk room behave like a smart label rather than a required choice:

1. **No partner present** -> default to AUTO. The OpenAI realtime translation works fine on AUTO, so this is always a safe value.
2. **Partner present** -> mirror the partner's YOU HEAR value (their `target` language) into our THEY SPEAK. This is a proxy for "what the partner speaks."
3. **User can still pick a value manually.** A subsequent attribute push from the partner overrides the manual pick (auto-track always; Q2-A).
4. Persistence of both `remoteSource` and `remoteTarget` in `localStorage` stays as today (Q3-C).
5. **Live edit of YOU HEAR.** In the live room, clicking the existing language pill on the local (pink) video tile opens the YOU HEAR picker.

## Non-goals

- No backend changes. Backend never sees language data.
- No new participant UI on the partner's side -- they don't need to declare "I speak X." YOU HEAR is the implicit proxy.
- No multi-language inference / detection beyond OpenAI's existing AUTO support.

## Architecture

### Cross-participant signaling: LiveKit participant attributes

Single attribute key per participant:

| Key       | Type              | Meaning                                    |
| --------- | ----------------- | ------------------------------------------ |
| `youHear` | BCP-47 string     | Language that participant wants to hear in |

- Empty / missing -> unknown.
- LiveKit retains attributes for late joiners and emits `ParticipantEvent.AttributesChanged` deltas.

### `liveKitRemoteRoomSession` changes

Additions to the session module:

- After `room.connect()` succeeds, push the initial `youHear` value with
  `room.localParticipant.setAttributes({ youHear: <bcp47> })`.
  Skip when the value is empty (e.g. AUTO is not a meaningful "you hear" value).
- Expose a new method on the returned `RemoteRoomSession`:
  ```ts
  setLocalYouHear(bcp47: string): void
  ```
  Re-publishes the attribute; no-ops when value unchanged.
- New optional callback in `CreateLiveKitRemoteRoomSessionOptions`:
  ```ts
  onRemoteYouHearChange?: (youHear: string | null) => void
  ```
  Fires when the partner's `youHear` attribute is first observed, changes, or the partner leaves (-> `null`). Reading `participant.attributes.youHear` on `ParticipantConnected` is required to seed late-joiner cases.

### `App.tsx` changes

- New state: `remotePartnerYouHear: string | null` (defaults `null`).
- Pass `onRemoteYouHearChange={setRemotePartnerYouHear}` to `createLiveKitRemoteRoomSession`.
- Effect keyed on `remotePartnerYouHear`:
  - non-null + resolvable via `findLanguage` -> `setRemoteSource(match)`
  - non-null but not resolvable -> no-op (warn in dev console)
  - `null` -> `setRemoteSource(AUTO_LANGUAGE)`
- Effect keyed on `remoteTarget.bcp47` and the live `RemoteRoomSession` ref (only fires once the session exists, i.e. while `remoteStatus === 'live'`) -> `session.setLocalYouHear(remoteTarget.bcp47)`.
- Existing `writeStoredLanguage` effects on `remoteSource` / `remoteTarget` are untouched.

### `RemoteRoomSurface` changes

- **Pre-join THEY SPEAK picker**: include AUTO. Concretely, pass `languages={[AUTO_LANGUAGE, ...LANGUAGES]}` to the `LanguagePickerSheet` for `picker === 'source'`. YOU HEAR picker continues to exclude AUTO.
- **Live state**: also render a YOU HEAR `LanguagePickerSheet` (re-using the same `picker` state machine as pre-join). Pass `onLanguageClick={() => setPicker('target')}` to the local `VideoTile`. The remote tile gets no `onLanguageClick` (its pill remains a read-only indicator).

### `VideoTile` changes

- New optional prop:
  ```ts
  onLanguageClick?: () => void;
  ```
- When provided, wrap the language Pill in a `<button type="button">` with reset styles (background/border/padding 0, cursor pointer) and `aria-label="Change the language you hear"`. Visual appearance of the Pill itself is unchanged.
- When omitted, render the Pill as today (plain `<span>`).

## Data flow (happy path)

```
partner picks new YOU HEAR ("tl")
  -> partner's App: setRemoteTarget(...)
  -> partner's session.setLocalYouHear('tl')
  -> LiveKit fans out AttributesChanged on partner participant
  -> our session reads attributes.youHear, fires onRemoteYouHearChange('tl')
  -> our App: setRemotePartnerYouHear('tl')
  -> effect: setRemoteSource(findLanguage('tl'))
  -> persisted to localStorage
  -> rendered: THEY SPEAK LangCard + remote VideoTile pill both show Tagalog
```

## Edge cases

| Case | Behavior |
| ---- | -------- |
| Partner publishes unknown BCP-47 | No-op, dev console warn. `remoteSource` unchanged. |
| Partner disconnects | `onRemoteYouHearChange(null)` -> `remoteSource` reverts to AUTO. |
| User manually picks THEY SPEAK while partner connected | Reflected immediately; next attribute push from partner overrides (per Q2-A). |
| Local user toggles YOU HEAR live via pill | Standard `setRemoteTarget` path; attribute push effect republishes to LiveKit. |
| AUTO selected as YOU HEAR | Not offered (target picker excludes AUTO). Defensive: `setLocalYouHear` skips empty strings. |
| LocalStorage has stale `remoteSource` from before partner attribute arrives | Stale value shown momentarily; replaced by partner attribute on first sync. Acceptable. |

## Testing

- **Session unit test** (`tests/frontend/unit/liveKitRemoteRoomSession.test.ts`, create if absent):
  - Fake `Room`/`LocalParticipant` with spy `setAttributes`.
  - Assert initial connect pushes `youHear` matching the supplied target.
  - Assert `setLocalYouHear('xx')` invokes `setAttributes({ youHear: 'xx' })`.
  - Fake remote participant emits `AttributesChanged` -> `onRemoteYouHearChange` fires with new value.
  - Partner disconnect -> callback fires with `null`.
- **Component test** (`tests/frontend/component/App.test.tsx`):
  - With mocked session, simulate partner `youHear='tl'` -> THEY SPEAK card text contains `Tagalog`.
  - Simulate partner-leave -> THEY SPEAK card text contains `Automatic`.
- **Component test** (`RemoteRoomSurface`):
  - Render in live state with a `target` and an `onChangeTarget` spy.
  - Click local pill button -> picker opens -> select language -> spy called.
- All existing 68 frontend + 52 backend tests must continue to pass.
- Manual verification: two browsers, one partner changes YOU HEAR; observe the other's THEY SPEAK update within one render cycle.

## Files touched

- `frontend/src/liveKitRemoteRoomSession.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/screens/RemoteRoomSurface.tsx`
- `frontend/src/components/brand/VideoTile.tsx`
- `tests/frontend/component/App.test.tsx`
- `tests/frontend/unit/liveKitRemoteRoomSession.test.ts` (create or extend)

## Out of scope

- Inferring "spoken language" from anything other than YOU HEAR.
- Persisting partner's `youHear` across sessions.
- Adding AUTO to YOU HEAR.
- Backend or shared-types changes.
