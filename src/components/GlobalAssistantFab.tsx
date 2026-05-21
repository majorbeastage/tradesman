import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"

/** Site-wide assistant mic (indigo) — distinct from the orange variance-report mic. */
export default function GlobalAssistantFab() {
  const ga = useGlobalAssistantOptional()
  if (!ga?.micFabVisible || ga.reportModalOpen) return null

  const { voiceListening, speechSupported, toggleVoiceListening, assistantText } = ga

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
      `}</style>
      <button
        type="button"
        className={voiceListening ? "tradesman-global-assistant-fab--listening" : undefined}
        title={voiceListening ? "Stop platform assistant voice" : "Platform assistant — voice & navigation"}
        aria-label={voiceListening ? "Stop listening" : "Start platform assistant voice"}
        onClick={() => {
          if (!speechSupported) return
          toggleVoiceListening(assistantText)
        }}
        style={{
          position: "fixed",
          zIndex: 10050,
          right: 20,
          bottom: "max(20px, calc(12px + env(safe-area-inset-bottom, 0px)))",
          width: 54,
          height: 54,
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
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"
            fill="currentColor"
          />
          <path
            d="M19 11a7 7 0 01-14 0M12 18v3M8 21h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  )
}
