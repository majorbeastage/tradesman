import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"

/** Site-wide assistant mic (indigo) — distinct from the orange variance-report mic. */
export default function GlobalAssistantFab() {
  const ga = useGlobalAssistantOptional()
  if (!ga?.micFabVisible) return null

  return (
    <>
      <style>{`
        @keyframes tradesman-global-assistant-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.35), 0 8px 22px rgba(79, 70, 229, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0.12), 0 10px 28px rgba(79, 70, 229, 0.5); }
        }
      `}</style>
      <button
        type="button"
        title="Platform assistant — voice & navigation"
        aria-label="Open platform assistant"
        onClick={() => {
          void ga.runAssistantCommand("take me to dashboard")
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
          background: "linear-gradient(145deg, #6366f1 0%, #4f46e5 100%)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          animation: "tradesman-global-assistant-pulse 1.6s ease-in-out infinite",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"
            fill="currentColor"
            opacity="0.95"
          />
          <path
            d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"
            fill="currentColor"
          />
          <path
            d="M19 11a7 7 0 01-14 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  )
}
