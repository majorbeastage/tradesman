import { useEffect, useState } from "react"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"

const GREEN_SEND = "#059669"

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(pointer: coarse)")
    const apply = () => setCoarse(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])
  return coarse
}

/** Site-wide assistant mic (indigo) + green Send — distinct from the orange variance-report mic. */
export default function GlobalAssistantFab() {
  const ga = useGlobalAssistantOptional()
  const isMobile = useCoarsePointer()
  if (!ga?.micFabVisible || ga.reportModalOpen) return null

  const {
    voiceListening,
    speechSupported,
    toggleVoiceListening,
    submitVoiceAssistant,
    assistantText,
    assistantBusy,
  } = ga

  const canSend = Boolean(assistantText.trim()) && !assistantBusy
  const previewTrim = assistantText.trim()
  const showPreview = voiceListening
  const previewLabel = previewTrim || (showPreview ? "Listening…" : "")

  return (
    <>
      <style>{`
        @keyframes tradesman-global-assistant-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.35), 0 8px 22px rgba(79, 70, 229, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0.12), 0 10px 28px rgba(79, 70, 229, 0.5); }
        }
        .tradesman-global-assistant-fab--listening {
          animation: tradesman-global-assistant-pulse 1.6s ease-in-out infinite;
        }
        @keyframes tradesman-assistant-preview-dots {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        .tradesman-assistant-preview--waiting {
          animation: tradesman-assistant-preview-dots 1.2s ease-in-out infinite;
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          zIndex: 10050,
          right: isMobile ? 12 : 20,
          bottom: "max(20px, calc(12px + env(safe-area-inset-bottom, 0px)))",
          display: "flex",
          flexDirection: "row-reverse",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        {voiceListening || canSend ? (
          <button
            type="button"
            title="Send command (Go)"
            aria-label="Send assistant command"
            disabled={!canSend}
            onClick={() => submitVoiceAssistant()}
            style={{
              width: isMobile ? 44 : 48,
              height: isMobile ? 44 : 48,
              borderRadius: "50%",
              border: "2px solid #fff",
              background: canSend ? GREEN_SEND : "#94a3b8",
              color: "#fff",
              cursor: canSend ? "pointer" : "not-allowed",
              opacity: canSend ? 1 : 0.65,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              boxShadow: voiceListening ? "0 0 0 4px rgba(5,150,105,0.3)" : "0 6px 16px rgba(5,150,105,0.35)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h12M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className={voiceListening ? "tradesman-global-assistant-fab--listening" : undefined}
          title={voiceListening ? "Stop listening (runs Go when you stop)" : "Platform assistant — voice & navigation"}
          aria-label={voiceListening ? "Stop listening" : "Start platform assistant voice"}
          onClick={() => {
            if (!speechSupported) return
            toggleVoiceListening()
          }}
          style={{
            width: isMobile ? 50 : 54,
            height: isMobile ? 50 : 54,
            borderRadius: "50%",
            border: "2px solid #fff",
            background: voiceListening
              ? "linear-gradient(145deg, #4f46e5 0%, #3730a3 100%)"
              : "linear-gradient(145deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff",
            cursor: speechSupported ? "pointer" : "not-allowed",
            opacity: speechSupported ? 1 : 0.55,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <svg width={isMobile ? 24 : 26} height={isMobile ? 24 : 26} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" fill="currentColor" />
            <path
              d="M19 11a7 7 0 01-14 0M12 18v3M8 21h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {showPreview && previewLabel ? (
        <div
          role="status"
          aria-live="polite"
          className={!previewTrim ? "tradesman-assistant-preview--waiting" : undefined}
          style={{
            position: "fixed",
            zIndex: 10049,
            right: isMobile ? 12 : 20,
            bottom: isMobile
              ? "max(72px, calc(64px + env(safe-area-inset-bottom, 0px)))"
              : "max(88px, calc(80px + env(safe-area-inset-bottom, 0px)))",
            maxWidth: isMobile ? "min(58vw, 210px)" : 300,
            padding: isMobile ? "6px 10px" : "8px 12px",
            borderRadius: isMobile ? 8 : 10,
            background: "rgba(15,23,42,0.94)",
            color: "#f8fafc",
            fontSize: isMobile ? 11 : 12,
            lineHeight: 1.35,
            boxShadow: "0 8px 24px rgba(15,23,42,0.28)",
            pointerEvents: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: isMobile ? 3 : 4,
            WebkitBoxOrient: "vertical",
          }}
        >
          {previewLabel}
        </div>
      ) : null}
    </>
  )
}
