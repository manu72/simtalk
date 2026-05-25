import { useState } from "react";

import type { ConversationMode } from "@simtalk/shared-types";

import { STIcon } from "../brand/Icons";
import { FONT_DISPLAY, ST, STButton, STTitle } from "../brand/primitives";
import { LangCard, LanguagePickerSheet } from "../brand/LanguagePicker";
import { ModeSegmented } from "../brand/ModeSegmented";
import { AUTO_LANGUAGE, LANGUAGES, isAutoLanguage, type Language } from "../brand/languages";

type LobbyProps = {
  readonly mode: ConversationMode;
  readonly source: Language;
  readonly target: Language;
  readonly isLaunching: boolean;
  readonly isCreatingRoom?: boolean;
  readonly errorMessage: string | null;
  readonly onChangeMode: (mode: ConversationMode) => void;
  readonly onChangeSource: (lang: Language) => void;
  readonly onChangeTarget: (lang: Language) => void;
  readonly onSwap: () => void;
  readonly onLaunch: () => void;
  readonly onCreateRoom?: () => void;
};

const TITLES: Record<ConversationMode, { line1: string; line2?: string; tagline: string }> = {
  listener: {
    line1: "LISTEN.",
    tagline: "Translate any language.",
  },
  turnabout: {
    line1: "SIMTALK.",
    tagline: "Converse with anyone.",
  },
  practice: {
    line1: "PRACTICE.",
    tagline: "Practice in any language.",
  },
};

export const Lobby = ({
  mode,
  source,
  target,
  isLaunching,
  isCreatingRoom = false,
  errorMessage,
  onChangeMode,
  onChangeSource,
  onChangeTarget,
  onSwap,
  onLaunch,
  onCreateRoom,
}: LobbyProps) => {
  const [picker, setPicker] = useState<"source" | "target" | null>(null);
  const titles = TITLES[mode];

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 20px 120px",
        color: ST.white,
        position: "relative",
        maxWidth: 520,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              opacity: 0.85,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            Realtime translation
          </span>
          <div style={{ marginTop: 10 }}>
            <STTitle as="h1" size={56} stroke={4} shadow={6}>
              {titles.line1}
              {titles.line2 ? (
                <>
                  <br />
                  {titles.line2}
                </>
              ) : null}
            </STTitle>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, marginTop: 12, opacity: 0.9, maxWidth: 320 }}>{titles.tagline}</p>
        </div>
        <a
          href="/"
          aria-label="SimTalk home"
          onClick={(e) => {
            if (window.location.pathname === "/") e.preventDefault();
          }}
          style={{ flexShrink: 0, marginTop: 4, lineHeight: 0 }}
        >
          <img
            src="/rocket-logo_100x132.png"
            alt=""
            aria-hidden="true"
            width={100}
            height={132}
            style={{ width: 100, height: "auto" }}
          />
        </a>
      </div>

      <div style={{ marginTop: 24 }}>
        <ModeSegmented value={mode} onChange={onChangeMode} />
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
            <LangCard
              label={mode === "turnabout" ? "Person A" : mode === "practice" ? "You speak" : "Detect"}
              lang={source}
              onPick={() => setPicker("source")}
            />
            <LangCard
              label={mode === "turnabout" ? "Person B" : mode === "practice" ? "Translate to" : "Translate into"}
              lang={target}
              onPick={() => setPicker("target")}
            />
          </div>
          <button
            type="button"
            onClick={onSwap}
            disabled={isAutoLanguage(source)}
            aria-label={mode === "turnabout" ? "Swap A and B" : "Reverse source and target"}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 44,
              height: 44,
              borderRadius: 999,
              background: ST.navy,
              border: `3px solid ${ST.white}`,
              boxShadow: `0 0 0 3px ${ST.navy}`,
              color: ST.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isAutoLanguage(source) ? 0.4 : 1,
              cursor: isAutoLanguage(source) ? "not-allowed" : "pointer",
            }}
          >
            <STIcon name={mode === "turnabout" ? "swap" : "arrow-right"} size={20} color={ST.white} />
          </button>
        </div>
        {mode === "listener" ? (
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              fontWeight: 700,
              opacity: 0.75,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <STIcon name="headphones" size={14} color={ST.white} />
            {isAutoLanguage(source) ? "We'll detect any of 70+ languages." : `Locked to ${source.name} input.`}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        <STButton variant="primary" size="lg" full onClick={onLaunch} disabled={isLaunching} icon="mic">
          {isLaunching ? "LAUNCHING…" : "LAUNCH"}
        </STButton>
        {onCreateRoom ? (
          <STButton variant="secondary" size="md" full onClick={onCreateRoom} disabled={isCreatingRoom} icon="globe">
            {isCreatingRoom ? "CREATING ROOM…" : "CREATE REMOTE ROOM"}
          </STButton>
        ) : null}
        {errorMessage ? (
          <div
            role="alert"
            style={{
              background: ST.dangerSoft,
              border: `2px solid ${ST.danger}`,
              color: ST.white,
              padding: "10px 14px",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            {errorMessage}
          </div>
        ) : (
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              opacity: 0.55,
              textAlign: "center",
              margin: 0,
              fontFamily: FONT_DISPLAY,
            }}
          >
            Use the mic on this device. Audio streams to OpenAI.
          </p>
        )}
      </div>

      <LanguagePickerSheet
        open={picker === "source"}
        value={source}
        onPick={(lang) => {
          onChangeSource(lang);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        title={mode === "turnabout" ? "PICK PERSON A" : mode === "listener" ? "DETECT FROM" : "PICK YOUR LANGUAGE"}
        languages={mode === "listener" ? [AUTO_LANGUAGE, ...LANGUAGES] : LANGUAGES}
      />
      <LanguagePickerSheet
        open={picker === "target"}
        value={target}
        onPick={(lang) => {
          onChangeTarget(lang);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        title={mode === "listener" ? "TRANSLATE INTO" : mode === "turnabout" ? "PICK PERSON B" : "TRANSLATE TO"}
      />
    </div>
  );
};
