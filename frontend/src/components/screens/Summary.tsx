import type { ConversationMode } from "@simtalk/shared-types";

import { STIcon } from "../brand/Icons";
import { FONT_BODY, FONT_DISPLAY, ST, STButton, STCard, STTitle } from "../brand/primitives";
import type { Language } from "../brand/languages";
import type { ConversationTurn } from "./TurnaboutSurface";

type SummaryProps = {
  readonly mode: ConversationMode;
  readonly source: Language | null;
  readonly target: Language;
  readonly inputTranscript: string;
  readonly outputTranscript: string;
  readonly turns: ReadonlyArray<ConversationTurn>;
  readonly audioUrl: string | null;
  readonly audioFilename: string;
  readonly onCopy: () => void;
  readonly onDownloadTranscript: () => void;
  readonly onNewSession: () => void;
};

export const Summary = ({
  mode,
  source,
  target,
  inputTranscript,
  outputTranscript,
  turns,
  audioUrl,
  audioFilename,
  onCopy,
  onDownloadTranscript,
  onNewSession,
}: SummaryProps) => {
  const useTimeline = mode === "turnabout" && turns.length > 0;
  const hasInput = inputTranscript.trim().length > 0;
  const hasOutput = outputTranscript.trim().length > 0;
  const hasContent = useTimeline || hasInput || hasOutput;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "32px 20px 40px",
        color: ST.white,
        maxWidth: 560,
        width: "100%",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <STTitle as="h1" size={44} stroke={3} shadow={5}>
            Session Ended.
            <br />
          </STTitle>
        </div>
        <a href="/" aria-label="SimTalk home" style={{ flexShrink: 0, lineHeight: 0 }}>
          <img
            src="/rocket-logo_100x132.png"
            alt=""
            aria-hidden="true"
            width={80}
            height={106}
            style={{ width: 80, height: "auto" }}
          />
        </a>
      </div>

      <STCard tone="white" padding={20}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: ST.navy,
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            letterSpacing: "0.08em",
            opacity: 0.7,
            marginBottom: 12,
          }}
        >
          {source ? (
            <>
              <span style={{ fontSize: 18 }}>{source.flag}</span>
              <STIcon name="arrow-right" size={12} color={ST.navy} />
            </>
          ) : (
            <span style={{ fontSize: 14, fontFamily: FONT_BODY, fontWeight: 700 }}>AUTO →</span>
          )}
          <span style={{ fontSize: 18 }}>{target.flag}</span>
          <span>· transcript</span>
        </div>

        {useTimeline ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {turns.map((turn, i) => (
              <div
                key={turn.id}
                style={{
                  paddingTop: i === 0 ? 0 : 10,
                  borderTop: i === 0 ? "none" : "1px solid rgba(11,17,73,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: "0.06em",
                    color: ST.navy,
                    opacity: 0.7,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{turn.srcLang.flag}</span>
                  <span>{turn.srcLang.code}</span>
                  <STIcon name="arrow-right" size={12} color={ST.navy} />
                  <span style={{ fontSize: 16 }}>{turn.dstLang.flag}</span>
                  <span>{turn.dstLang.code}</span>
                </div>
                {turn.src ? (
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 15,
                      fontWeight: 600,
                      color: ST.navy,
                      lineHeight: 1.5,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {turn.src}
                  </p>
                ) : null}
                {turn.dst ? (
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 15,
                      color: ST.navy,
                      opacity: 0.85,
                      lineHeight: 1.5,
                      margin: turn.src ? "4px 0 0" : 0,
                      whiteSpace: "pre-wrap",
                      fontStyle: turn.src ? "italic" : "normal",
                      fontWeight: turn.src ? 400 : 600,
                    }}
                  >
                    {turn.dst}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <>
            {hasInput ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    color: ST.navy,
                    opacity: 0.6,
                    marginBottom: 4,
                  }}
                >
                  SOURCE {source ? `· ${source.code}` : ""}
                </div>
                <p
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 15,
                    color: ST.navy,
                    lineHeight: 1.55,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {inputTranscript}
                </p>
              </div>
            ) : null}

            {hasOutput ? (
              <div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    color: ST.navy,
                    opacity: 0.6,
                    marginBottom: 4,
                  }}
                >
                  TRANSLATED · {target.code}
                </div>
                <p
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 16,
                    color: ST.navy,
                    lineHeight: 1.55,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontWeight: 600,
                  }}
                >
                  {outputTranscript}
                </p>
              </div>
            ) : null}
          </>
        )}

        {!hasContent ? (
          <p style={{ color: ST.navy, opacity: 0.6, margin: 0 }}>No transcript captured during this session.</p>
        ) : null}
      </STCard>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <STButton variant="primary" size="lg" full onClick={onNewSession} icon="mic">
          New Session
        </STButton>
        <div style={{ display: "flex", gap: 10 }}>
          <STButton variant="secondary" size="md" full onClick={onCopy} icon="copy" disabled={!hasContent}>
            Copy
          </STButton>
          <STButton
            variant="secondary"
            size="md"
            full
            onClick={onDownloadTranscript}
            icon="download"
            disabled={!hasContent}
          >
            Transcript
          </STButton>
        </div>
        {audioUrl ? (
          <a
            href={audioUrl}
            download={audioFilename}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 16px",
              border: "2px solid rgba(255,255,255,0.3)",
              borderRadius: 16,
              color: ST.white,
              fontFamily: FONT_DISPLAY,
              fontSize: 14,
              letterSpacing: "0.06em",
              textDecoration: "none",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <STIcon name="download" size={16} color={ST.white} />
            DOWNLOAD AUDIO RECORDING
          </a>
        ) : null}
      </div>
    </div>
  );
};
