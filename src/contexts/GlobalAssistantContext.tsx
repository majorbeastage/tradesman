import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { supabase } from "../lib/supabase"
import { parseGlobalAssistantCommand } from "../lib/globalAssistantNav"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import { isGlobalAssistantMicEnabled, mergeGlobalAssistantMic } from "../lib/setupGuideState"

type GlobalAssistantContextValue = {
  assistantText: string
  setAssistantText: (v: string) => void
  assistantNote: string | null
  setAssistantNote: (v: string | null) => void
  assistantBusy: boolean
  micFabVisible: boolean
  setMicFabVisible: (v: boolean) => void
  voiceListening: boolean
  speechSupported: boolean
  toggleVoiceListening: (baseText?: string) => boolean
  stopVoiceListening: () => void
  reportModalOpen: boolean
  setReportModalOpen: (v: boolean) => void
  runAssistantCommand: (raw: string) => Promise<void>
  openSetupGuide: () => void
  registerSetupGuideOpener: (fn: () => void) => void
}

const GlobalAssistantContext = createContext<GlobalAssistantContextValue | null>(null)

type Props = {
  children: ReactNode
  setPage: (page: string) => void
  profileUserId: string | null
  profileMetadata: Record<string, unknown> | null
  onMetadataPatch?: (next: Record<string, unknown>) => void
}

export function GlobalAssistantProvider({
  children,
  setPage,
  profileUserId,
  profileMetadata,
  onMetadataPatch,
}: Props) {
  const [assistantText, setAssistantText] = useState("")
  const [assistantNote, setAssistantNote] = useState<string | null>(null)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [micFabVisible, setMicFabVisible] = useState(() => isGlobalAssistantMicEnabled(profileMetadata))
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const setupGuideOpenerRef = useRef<(() => void) | null>(null)

  const {
    speechSupported,
    listening: voiceListening,
    startListening,
    stopListening,
  } = useSpeechRecognitionInput(setAssistantText)

  const registerSetupGuideOpener = useCallback((fn: () => void) => {
    setupGuideOpenerRef.current = fn
  }, [])

  const openSetupGuide = useCallback(() => {
    setupGuideOpenerRef.current?.()
  }, [])

  const persistMicPref = useCallback(
    async (enabled: boolean) => {
      if (!profileUserId || !supabase) return
      const next = mergeGlobalAssistantMic(profileMetadata ?? {}, enabled)
      const { error } = await supabase.from("profiles").update({ metadata: next }).eq("id", profileUserId)
      if (!error) onMetadataPatch?.(next)
    },
    [profileUserId, profileMetadata, onMetadataPatch],
  )

  const runAssistantCommand = useCallback(
    async (raw: string) => {
      setAssistantBusy(true)
      setAssistantNote(null)
      try {
        const action = parseGlobalAssistantCommand(raw)
        if (action.type === "clarify") {
          setAssistantNote(action.message)
          return
        }
        if (action.type === "open_setup_guide") {
          setAssistantNote(action.message)
          openSetupGuide()
          return
        }
        setPage(action.page)
        setAssistantNote(action.message)
      } finally {
        setAssistantBusy(false)
      }
    },
    [openSetupGuide, setPage],
  )

  const toggleVoiceListening = useCallback(
    (baseText?: string) => {
      if (voiceListening) {
        stopListening()
        setAssistantNote(null)
        return false
      }
      const base = typeof baseText === "string" ? baseText : assistantText
      if (base.trim()) setAssistantText(base)
      const started = startListening(base.trim() ? base : assistantText)
      if (started) {
        setAssistantNote("Platform assistant listening — say a tab or task (e.g. “take me to customers”).")
      }
      return started
    },
    [assistantText, startListening, stopListening, voiceListening],
  )

  const value = useMemo(
    () => ({
      assistantText,
      setAssistantText,
      assistantNote,
      setAssistantNote: setAssistantNote,
      assistantBusy,
      micFabVisible,
      setMicFabVisible: (v: boolean) => {
        setMicFabVisible(v)
        void persistMicPref(v)
      },
      voiceListening,
      speechSupported,
      toggleVoiceListening,
      stopVoiceListening: stopListening,
      reportModalOpen,
      setReportModalOpen,
      runAssistantCommand,
      openSetupGuide,
      registerSetupGuideOpener,
    }),
    [
      assistantText,
      assistantNote,
      assistantBusy,
      micFabVisible,
      voiceListening,
      speechSupported,
      toggleVoiceListening,
      stopListening,
      reportModalOpen,
      runAssistantCommand,
      openSetupGuide,
      registerSetupGuideOpener,
      persistMicPref,
    ],
  )

  return <GlobalAssistantContext.Provider value={value}>{children}</GlobalAssistantContext.Provider>
}

export function useGlobalAssistant(): GlobalAssistantContextValue {
  const ctx = useContext(GlobalAssistantContext)
  if (!ctx) throw new Error("useGlobalAssistant must be used within GlobalAssistantProvider")
  return ctx
}

export function useGlobalAssistantOptional(): GlobalAssistantContextValue | null {
  return useContext(GlobalAssistantContext)
}
