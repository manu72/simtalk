# THEY SPEAK auto-default + partner-language mirroring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Remote Talk room's THEY SPEAK selector default to AUTO when no partner is in the room, and mirror the partner's `YOU HEAR` language into THEY SPEAK whenever the partner is connected. Also let the local user change their `YOU HEAR` language live by clicking the language pill in their own video tile.

**Architecture:** Use LiveKit participant attributes (`{ youHear: <bcp47> }`) for cross-participant signaling. Surface partner changes via a new `onRemoteYouHearChange` session callback. App keeps a `remotePartnerYouHear` state, syncs it into `remoteSource`, and pushes `remoteTarget` outward via a new `setLocalYouHear` session method. `VideoTile` gets an optional `onLanguageClick` prop that wraps the existing pill in a button.

**Tech Stack:** React 19, TypeScript strict, `livekit-client` (`Room`, `RoomEvent.ParticipantAttributesChanged`), Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-05-26-they-speak-auto-default-design.md`

---

## File Map

| Path | Action | Responsibility |
| --- | --- | --- |
| `frontend/src/liveKitRemoteRoomSession.ts` | modify | Add `setLocalYouHear`, `onRemoteYouHearChange` callback, RoomEvent attribute listener, initial attribute push, late-joiner attribute read. |
| `frontend/src/App.tsx` | modify | Wire new callback to `remotePartnerYouHear` state. Effect: partner change -> `setRemoteSource`. Effect: `remoteTarget` change -> `session.setLocalYouHear`. |
| `frontend/src/components/screens/RemoteRoomSurface.tsx` | modify | Include AUTO in THEY SPEAK picker. Render `LanguagePickerSheet` for `target` in live state. Pass `onLanguageClick` to local `VideoTile`. |
| `frontend/src/components/brand/VideoTile.tsx` | modify | Add optional `onLanguageClick` prop; when set, wrap Pill in `<button>`. |
| `tests/frontend/unit/liveKitRemoteRoomSession.test.ts` | modify | Add tests for initial attribute push, `setLocalYouHear`, `onRemoteYouHearChange` on connect + on change + on disconnect. |
| `tests/frontend/component/App.test.tsx` | modify | Test partner-attribute -> THEY SPEAK Tagalog; partner-leave -> Automatic; `setLocalYouHear` called on target change. |
| `tests/frontend/component/RemoteRoomSurface.test.tsx` | create | Live-state pill click opens YOU HEAR picker. |

---

## Task 1: Session — `setLocalYouHear` method (push initial attribute on connect)

**Files:**
- Modify: `frontend/src/liveKitRemoteRoomSession.ts`
- Test: `tests/frontend/unit/liveKitRemoteRoomSession.test.ts`

- [ ] **Step 1: Write the failing test.** Append a new `it` block inside the existing `describe('createLiveKitRemoteRoomSession', ...)`. Reuse the existing `createFakeRoom` and `roomTokenResponse`. Add `setAttributes` to the fake `localParticipant` and pass `initialYouHear: 'es'` through the new option.

  ```ts
  // In tests/frontend/unit/liveKitRemoteRoomSession.test.ts

  // Extend createFakeRoom() so localParticipant exposes setAttributes:
  //   localParticipant: {
  //     setMicrophoneEnabled: vi.fn(async () => undefined),
  //     setAttributes: vi.fn(async () => undefined)
  //   }
  // (Add this to the existing helper at the top of the file.)

  it('pushes the initial youHear attribute on connect', async () => {
    const { room } = createFakeRoom();
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);

    await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: { mode: 'listener', targetLanguage: 'es' },
      initialYouHear: 'es',
      createRoom: () => room as never
    });

    expect(room.localParticipant.setAttributes).toHaveBeenCalledWith({ youHear: 'es' });
  });
  ```

- [ ] **Step 2: Run test, expect failure** (option `initialYouHear` does not exist yet).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "pushes the initial youHear"`

  Expected: FAIL — TypeScript or runtime error about unknown option.

- [ ] **Step 3: Implement.** In `frontend/src/liveKitRemoteRoomSession.ts`:

  1. Add `initialYouHear?: string` to `CreateRemoteRoomSessionOptions` (place near the existing `onRemote*` props).
  2. Destructure `initialYouHear` in the function signature.
  3. After the existing `await room.localParticipant.setMicrophoneEnabled(true);` line in the `try` block, add:

     ```ts
     if (initialYouHear && initialYouHear.length > 0) {
       try {
         await room.localParticipant.setAttributes({ youHear: initialYouHear });
       } catch {
         // Attribute push is best-effort; don't fail the join.
       }
     }
     ```

- [ ] **Step 4: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "pushes the initial youHear"`

  Expected: PASS.

- [ ] **Step 5: Commit.** (Ask the user before staging.)

  ```bash
  git add frontend/src/liveKitRemoteRoomSession.ts tests/frontend/unit/liveKitRemoteRoomSession.test.ts
  git commit -m "add initial youHear attribute push on LiveKit connect"
  ```

---

## Task 2: Session — expose `setLocalYouHear` for mid-session updates

**Files:**
- Modify: `frontend/src/liveKitRemoteRoomSession.ts`
- Test: `tests/frontend/unit/liveKitRemoteRoomSession.test.ts`

- [ ] **Step 1: Write the failing test.**

  ```ts
  it('exposes setLocalYouHear that republishes the attribute', async () => {
    const { room } = createFakeRoom();
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);

    const session = await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: { mode: 'listener', targetLanguage: 'es' },
      initialYouHear: 'es',
      createRoom: () => room as never
    });

    room.localParticipant.setAttributes.mockClear();
    session.setLocalYouHear('tl');

    expect(room.localParticipant.setAttributes).toHaveBeenCalledWith({ youHear: 'tl' });

    session.setLocalYouHear('tl'); // duplicate — should no-op
    expect(room.localParticipant.setAttributes).toHaveBeenCalledTimes(1);

    session.setLocalYouHear(''); // empty — should no-op
    expect(room.localParticipant.setAttributes).toHaveBeenCalledTimes(1);
  });
  ```

- [ ] **Step 2: Run test, expect failure** (`setLocalYouHear` is not on the returned session).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "exposes setLocalYouHear"`

  Expected: FAIL.

- [ ] **Step 3: Implement.** In `frontend/src/liveKitRemoteRoomSession.ts`:

  1. Add `setLocalYouHear: (bcp47: string) => void;` to the `RemoteRoomSession` type.
  2. Inside the function (after `let stopped = false;` and other state), add a local `let lastPublishedYouHear: string | null = initialYouHear && initialYouHear.length > 0 ? initialYouHear : null;`.
  3. Add this implementation above the final `return { ... };`:

     ```ts
     const setLocalYouHear = (bcp47: string): void => {
       if (stopped) return;
       if (!bcp47) return;
       if (bcp47 === lastPublishedYouHear) return;
       lastPublishedYouHear = bcp47;
       void room.localParticipant.setAttributes({ youHear: bcp47 }).catch(() => {
         // best-effort
       });
     };
     ```

  4. Include `setLocalYouHear` in the returned object.

- [ ] **Step 4: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "exposes setLocalYouHear"`

  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/liveKitRemoteRoomSession.ts tests/frontend/unit/liveKitRemoteRoomSession.test.ts
  git commit -m "expose setLocalYouHear on remote room session"
  ```

---

## Task 3: Session — `onRemoteYouHearChange` callback (initial seed + AttributesChanged)

**Files:**
- Modify: `frontend/src/liveKitRemoteRoomSession.ts`
- Test: `tests/frontend/unit/liveKitRemoteRoomSession.test.ts`

- [ ] **Step 1: Write the failing test.** Add two `it` blocks. Use the existing handler-map pattern (`handlers.get(RoomEvent.X)?.(...)`).

  ```ts
  // Need to import RoomEvent at the top of the test file if not already imported:
  //   import { RoomEvent } from 'livekit-client';

  it('seeds onRemoteYouHearChange from a partner already in the room', async () => {
    const { room } = createFakeRoom();
    const fakePartner = { identity: 'p2', name: 'Bob', attributes: { youHear: 'tl' } };
    room.remoteParticipants.set('p2', fakePartner);
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);
    const onRemoteYouHearChange = vi.fn();

    await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: { mode: 'listener', targetLanguage: 'es' },
      createRoom: () => room as never,
      onRemoteYouHearChange
    });

    expect(onRemoteYouHearChange).toHaveBeenCalledWith('tl');
  });

  it('fires onRemoteYouHearChange when a partner updates attributes and on disconnect', async () => {
    const { room, handlers } = createFakeRoom();
    requestRoomTokenMock.mockResolvedValue(roomTokenResponse);
    const onRemoteYouHearChange = vi.fn();

    await createLiveKitRemoteRoomSession({
      roomId,
      roomTokenRequest: {
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'es'
      },
      realtimeTokenRequest: { mode: 'listener', targetLanguage: 'es' },
      createRoom: () => room as never,
      onRemoteYouHearChange
    });

    const partner = { identity: 'p2', name: 'Bob', attributes: {} as Record<string, string> };
    handlers.get(RoomEvent.ParticipantConnected)?.(partner as never);

    partner.attributes.youHear = 'en';
    handlers
      .get(RoomEvent.ParticipantAttributesChanged)
      ?.({ youHear: 'en' } as never, partner as never);

    expect(onRemoteYouHearChange).toHaveBeenLastCalledWith('en');

    handlers.get(RoomEvent.ParticipantDisconnected)?.(partner as never);
    expect(onRemoteYouHearChange).toHaveBeenLastCalledWith(null);
  });
  ```

- [ ] **Step 2: Run tests, expect failure** (callback option does not exist; events not wired).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "onRemoteYouHearChange"`

  Expected: FAIL.

- [ ] **Step 3: Implement.** In `frontend/src/liveKitRemoteRoomSession.ts`:

  1. Add `onRemoteYouHearChange?: (youHear: string | null) => void;` to `CreateRemoteRoomSessionOptions`.
  2. Destructure it in the function signature.
  3. Add a small helper near other `setRemote*` helpers:

     ```ts
     let lastRemoteYouHear: string | null = null;
     const emitRemoteYouHear = (value: string | null) => {
       if (value === lastRemoteYouHear) return;
       lastRemoteYouHear = value;
       onRemoteYouHearChange?.(value);
     };
     ```

  4. In `setRemoteParticipant`, after the existing `onRemoteParticipantChange?.(...)` line:

     ```ts
     if (!participant) {
       emitRemoteYouHear(null);
     } else {
       const attr = participant.attributes?.youHear;
       emitRemoteYouHear(typeof attr === 'string' && attr.length > 0 ? attr : null);
     }
     ```

     (Place this so it runs alongside the existing mic/speaking reset logic; don't remove the existing early-return for `!participant` — fold the new call into both branches.)

  5. Register a new room handler:

     ```ts
     .on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
       if (participant !== activeRemoteParticipant) return;
       if (!('youHear' in changed)) return;
       const next = changed.youHear;
       emitRemoteYouHear(typeof next === 'string' && next.length > 0 ? next : null);
     });
     ```

- [ ] **Step 4: Run tests, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts -t "onRemoteYouHearChange"`

  Expected: both new tests PASS.

- [ ] **Step 5: Run full session suite to confirm no regression.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/unit/liveKitRemoteRoomSession.test.ts`

  Expected: all green.

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/liveKitRemoteRoomSession.ts tests/frontend/unit/liveKitRemoteRoomSession.test.ts
  git commit -m "emit partner youHear attribute changes from LiveKit session"
  ```

---

## Task 4: App — wire `onRemoteYouHearChange` -> `remoteSource`

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: `tests/frontend/component/App.test.tsx`

- [ ] **Step 1: Write the failing test.** Add a new `it` block in the appropriate `describe` (search for the `describe('Remote room', ...)` or equivalent block — add a new one named `describe('Remote room language mirroring', ...)` if none exists).

  The test should:
  1. Mock `createLiveKitRemoteRoomSession` so the resolved session captures `onRemoteYouHearChange` for later invocation.
  2. Render the App, navigate to a room (`window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz')`), pass access gate, join.
  3. Invoke the captured callback with `'tl'`.
  4. Assert the THEY SPEAK card displays "Tagalog".
  5. Invoke the callback with `null` and assert it displays "Automatic".

  Use this pattern (adapt to existing helpers in the file):

  ```ts
  it('mirrors partner youHear into THEY SPEAK and resets to Automatic on leave', async () => {
    let capturedOnRemoteYouHearChange: ((v: string | null) => void) | undefined;
    createLiveKitRemoteRoomSessionMock.mockImplementationOnce(async (opts) => {
      capturedOnRemoteYouHearChange = opts.onRemoteYouHearChange;
      return {
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setCameraEnabled: vi.fn(async () => undefined),
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setLocalYouHear: vi.fn(),
        stop: vi.fn()
      };
    });

    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    await waitFor(() => expect(capturedOnRemoteYouHearChange).toBeDefined());

    act(() => capturedOnRemoteYouHearChange!('tl'));
    expect(await screen.findByText(/tagalog/i)).toBeInTheDocument();

    act(() => capturedOnRemoteYouHearChange!(null));
    expect(await screen.findByText(/automatic/i)).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run test, expect failure.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx -t "mirrors partner youHear"`

  Expected: FAIL.

- [ ] **Step 3: Implement in `frontend/src/App.tsx`.**

  1. Near the other remote room state hooks (around line 145), add:

     ```ts
     const [remotePartnerYouHear, setRemotePartnerYouHear] = useState<string | null>(null);
     ```

  2. In the `useEffect`/derived block where remote state initializes (or directly after state declarations), add an effect:

     ```ts
     useEffect(() => {
       if (remotePartnerYouHear === null) {
         setRemoteSource(AUTO_LANGUAGE);
         return;
       }
       const match = LANGUAGES.find((lang) => lang.bcp47 === remotePartnerYouHear);
       if (match) setRemoteSource(match);
     }, [remotePartnerYouHear]);
     ```

  3. Inside `joinRemoteRoom`, add to the `createLiveKitRemoteRoomSession({...})` options object:

     ```ts
     onRemoteYouHearChange: (value) => {
       if (isCurrentJoin()) setRemotePartnerYouHear(value);
     },
     ```

  4. In `teardownRemoteRoom` (or wherever the session is cleared on leave/error), reset:

     ```ts
     setRemotePartnerYouHear(null);
     ```

     If the function doesn't already exist as a single place, add this reset adjacent to the existing `setRemoteStatus('idle')` / `setRemoteParticipantCount(0)` lines.

- [ ] **Step 4: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx -t "mirrors partner youHear"`

  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/App.tsx tests/frontend/component/App.test.tsx
  git commit -m "mirror partner youHear into remoteSource"
  ```

---

## Task 5: App — push local `remoteTarget` outward via `setLocalYouHear`

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: `tests/frontend/component/App.test.tsx`

- [ ] **Step 1: Write the failing test.** Add another `it` block, capturing the mock session object so its `setLocalYouHear` spy can be asserted.

  ```ts
  it('pushes remoteTarget into the session as youHear', async () => {
    const setLocalYouHear = vi.fn();
    createLiveKitRemoteRoomSessionMock.mockImplementationOnce(async (opts) => {
      // Replay the initial sync the session would have done:
      opts.onRemoteYouHearChange?.(null);
      return {
        participantIdentity: 'participant_abcdefghijklmnop',
        setOriginalAudioMuted: vi.fn(),
        setCameraEnabled: vi.fn(async () => undefined),
        setMicrophoneEnabled: vi.fn(async () => undefined),
        setLocalYouHear,
        stop: vi.fn()
      };
    });

    window.sessionStorage.setItem('simtalk:access-password', 'hunter2');
    window.history.pushState({}, '', '/rooms/room_abcdefghijklmnopqrstuvwxyz');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /join room/i }));
    await waitFor(() => expect(setLocalYouHear).toHaveBeenCalledWith('es'));
  });
  ```

- [ ] **Step 2: Run test, expect failure** (App doesn't call `setLocalYouHear` yet).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx -t "pushes remoteTarget"`

  Expected: FAIL.

- [ ] **Step 3: Implement in `frontend/src/App.tsx`.** Add an effect keyed on `remoteTarget` and the session ref:

  ```ts
  useEffect(() => {
    const session = remoteSessionRef.current;
    if (!session) return;
    if (remoteStatus !== 'live' && remoteStatus !== 'joining') return;
    session.setLocalYouHear(remoteTarget.bcp47);
  }, [remoteTarget, remoteStatus]);
  ```

  Also: in `joinRemoteRoom`, pass `initialYouHear: remoteTarget.bcp47` to `createLiveKitRemoteRoomSession`.

- [ ] **Step 4: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx -t "pushes remoteTarget"`

  Expected: PASS.

- [ ] **Step 5: Run full App component suite.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/App.test.tsx`

  Expected: all green.

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/App.tsx tests/frontend/component/App.test.tsx
  git commit -m "publish local remoteTarget as LiveKit youHear attribute"
  ```

---

## Task 6: `RemoteRoomSurface` — include AUTO in THEY SPEAK picker

**Files:**
- Modify: `frontend/src/components/screens/RemoteRoomSurface.tsx`
- Test: `tests/frontend/component/RemoteRoomSurface.test.tsx` (create)

- [ ] **Step 1: Create the test file.** New file `tests/frontend/component/RemoteRoomSurface.test.tsx`:

  ```tsx
  import { fireEvent, render, screen } from '@testing-library/react';
  import { describe, expect, it, vi } from 'vitest';

  import { RemoteRoomSurface } from '../../../frontend/src/components/screens/RemoteRoomSurface';
  import { AUTO_LANGUAGE, findLanguage } from '../../../frontend/src/components/brand/languages';

  const baseProps = {
    roomId: 'room_abcdefghijklmnopqrstuvwxyz',
    roomUrl: 'http://localhost/rooms/room_abcdefghijklmnopqrstuvwxyz',
    source: AUTO_LANGUAGE,
    target: findLanguage('en'),
    status: 'idle' as const,
    participantCount: 0,
    translatedCaption: '',
    originalAudioMuted: true,
    errorMessage: null,
    localDisplayName: 'You',
    remoteDisplayName: null,
    localVideoTrack: null,
    remoteVideoTrack: null,
    localMicMuted: false,
    localCameraEnabled: false,
    remoteMicMuted: true,
    remoteIsSpeaking: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onToggleOriginalAudio: vi.fn(),
    onToggleLocalMic: vi.fn(),
    onToggleLocalCamera: vi.fn(),
    onCopyLink: vi.fn(),
    onChangeSource: vi.fn(),
    onChangeTarget: vi.fn()
  };

  describe('RemoteRoomSurface pre-join THEY SPEAK picker', () => {
    it('includes the Automatic option', () => {
      render(<RemoteRoomSurface {...baseProps} />);
      fireEvent.click(screen.getByRole('button', { name: /they speak/i }));
      expect(screen.getByText(/automatic/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure** (AUTO not in source picker).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/RemoteRoomSurface.test.tsx -t "includes the Automatic option"`

  Expected: FAIL — text "Automatic" not found.

- [ ] **Step 3: Implement.** In `frontend/src/components/screens/RemoteRoomSurface.tsx`:

  1. At the top, change the import:

     ```ts
     import { LangCard, LanguagePickerSheet } from '../brand/LanguagePicker';
     import { AUTO_LANGUAGE, LANGUAGES, type Language } from '../brand/languages';
     ```

  2. Just before the JSX `return`, add:

     ```ts
     const SOURCE_LANGUAGES: ReadonlyArray<Language> = [AUTO_LANGUAGE, ...LANGUAGES];
     ```

     (Place this above the `return (` of the `RemoteRoomSurface` component, alongside any other derived consts.)

  3. Update the source `LanguagePickerSheet`:

     ```tsx
     <LanguagePickerSheet
       open={picker === 'source'}
       value={source}
       onPick={(lang) => {
         onChangeSource(lang);
         setPicker(null);
       }}
       onClose={() => setPicker(null)}
       title="THEY SPEAK"
       languages={SOURCE_LANGUAGES}
     />
     ```

- [ ] **Step 4: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/RemoteRoomSurface.test.tsx -t "includes the Automatic option"`

  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/components/screens/RemoteRoomSurface.tsx tests/frontend/component/RemoteRoomSurface.test.tsx
  git commit -m "offer Automatic in Remote Talk THEY SPEAK picker"
  ```

---

## Task 7: `VideoTile` — optional clickable language pill

**Files:**
- Modify: `frontend/src/components/brand/VideoTile.tsx`
- Test: `tests/frontend/component/RemoteRoomSurface.test.tsx`

- [ ] **Step 1: Write the failing test.** Append to `tests/frontend/component/RemoteRoomSurface.test.tsx`:

  ```tsx
  import { findLanguage as findLang2 } from '../../../frontend/src/components/brand/languages';

  describe('RemoteRoomSurface live state', () => {
    const liveProps = {
      ...baseProps,
      status: 'live' as const,
      participantCount: 1,
      remoteDisplayName: 'Bob',
      source: findLang2('tl'),
      target: findLang2('en')
    };

    it('opens the YOU HEAR picker when the local language pill is clicked', () => {
      render(<RemoteRoomSurface {...liveProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /change the language you hear/i })
      );
      // The picker dialog title text should now be visible:
      expect(screen.getByText(/you hear/i)).toBeInTheDocument();
    });
  });
  ```

  (You can collapse the second `import` into the original `findLanguage` import — shown separately only to make the diff obvious.)

- [ ] **Step 2: Run test, expect failure** (clickable pill button doesn't exist).

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/RemoteRoomSurface.test.tsx -t "opens the YOU HEAR picker"`

  Expected: FAIL — no element with name "change the language you hear".

- [ ] **Step 3: Implement in `frontend/src/components/brand/VideoTile.tsx`.**

  1. Add `onLanguageClick?: () => void;` to `VideoTileProps`.
  2. Destructure it in the component arguments.
  3. Replace the existing language pill block (`{language ? (<Pill ...>...</Pill>) : null}`) with:

     ```tsx
     {language ? (
       onLanguageClick ? (
         <button
           type="button"
           onClick={onLanguageClick}
           aria-label="Change the language you hear"
           style={{
             padding: 0,
             border: 0,
             background: 'transparent',
             cursor: 'pointer',
             lineHeight: 0
           }}
         >
           <Pill bg={language.color} fg={ST.navy}>
             <span aria-hidden="true">{language.flag}</span>
             {language.code}
           </Pill>
         </button>
       ) : (
         <Pill bg={language.color} fg={ST.navy}>
           <span aria-hidden="true">{language.flag}</span>
           {language.code}
         </Pill>
       )
     ) : null}
     ```

- [ ] **Step 4: Render picker + wire callback in `RemoteRoomSurface`.** In `frontend/src/components/screens/RemoteRoomSurface.tsx`, the live-state branch currently has no `LanguagePickerSheet`. Add it inside the `<PageShell>` returned by the live branch (after the `<STButton variant="dark" ... Leave Room>` line), and pass `onLanguageClick` to the local `VideoTile`:

  1. Update the local `VideoTile` to pass the handler:

     ```tsx
     <VideoTile
       tone="pink"
       displayName={localDisplayName || 'You'}
       language={target}
       isLocal={true}
       isMicMuted={localMicMuted}
       isSpeaking={false}
       videoTrack={localVideoTrack}
       onToggleMic={onToggleLocalMic}
       onLanguageClick={() => setPicker('target')}
     />
     ```

  2. Just before the closing `</PageShell>` of the live branch, add:

     ```tsx
     <LanguagePickerSheet
       open={picker === 'target'}
       value={target}
       onPick={(lang) => {
         onChangeTarget(lang);
         setPicker(null);
       }}
       onClose={() => setPicker(null)}
       title="YOU HEAR"
     />
     ```

- [ ] **Step 5: Run test, expect pass.**

  Run: `pnpm --filter @simtalk/frontend exec vitest run tests/frontend/component/RemoteRoomSurface.test.tsx -t "opens the YOU HEAR picker"`

  Expected: PASS.

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/components/brand/VideoTile.tsx \
          frontend/src/components/screens/RemoteRoomSurface.tsx \
          tests/frontend/component/RemoteRoomSurface.test.tsx
  git commit -m "make local VideoTile language pill clickable to change YOU HEAR"
  ```

---

## Task 8: Full verification

**Files:** none modified.

- [ ] **Step 1: Typecheck the whole repo.**

  Run: `pnpm typecheck`

  Expected: clean (shared-types builds, backend `tsc`, frontend `tsc -b` + `tsconfig.test.json`, `tsc -p api/tsconfig.json`).

- [ ] **Step 2: Run all frontend + backend tests.**

  Run: `pnpm test`

  Expected: 9 backend files / 52 tests pass, frontend now ≥ 70 tests pass (68 prior + new ones).

- [ ] **Step 3: Manual UI verification.** Start dev server, open two browser sessions on the same room URL:

  ```bash
  pnpm dev
  ```

  - Verify: with only one tab joined, THEY SPEAK shows AUTO.
  - In tab B, change YOU HEAR to Tagalog. Tab A's THEY SPEAK card and remote video pill both update to Tagalog within ~1 second.
  - In tab A's live view, click the local pink tile's language pill -> YOU HEAR picker opens -> pick Spanish -> tab B's THEY SPEAK card updates to Spanish.
  - Close tab B. Tab A's THEY SPEAK reverts to Automatic.

- [ ] **Step 4: Commit any leftover formatting fixes** (if any).

---

## Notes

- The session module's existing pattern uses `room.on(RoomEvent.X, handler)`. Add `ParticipantAttributesChanged` to that same chain — do not register at the participant level.
- `RemoteParticipant.attributes` is a plain object indexed by string; reading `participant.attributes?.youHear` is safe on a fake.
- `setLocalYouHear` deliberately fires-and-forgets the LiveKit promise: the UI does not need to await its propagation.
- AUTO is purposely **not** added to the YOU HEAR picker — a user must select a real language to hear translated audio in.
- `findLanguage` (used by the partner-mirroring effect) falls back to English. Use `LANGUAGES.find` directly in the effect to enforce no-op-on-unknown semantics (per spec edge cases).
