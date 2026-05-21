import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { supabase } from "../lib/supabase"
import {
  ASSISTANT_ADMIN_PANEL_STORAGE_KEY,
  parseGlobalAssistantCommand,
  type GlobalAssistantParseContext,
} from "../lib/globalAssistantNav"
import { useView } from "./ViewContext"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import { isGlobalAssistantMicEnabled, mergeGlobalAssistantMic } from "../lib/setupGuideState"
import { useSetupWizardOptional } from "./SetupWizardContext"

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
  /** Pass `seedText` to continue dictation (e.g. variance report); omit for a fresh platform command. */
  toggleVoiceListening: (seedText?: string) => boolean
  submitVoiceAssistant: () => void
  stopVoiceListening: () => void
  reportModalOpen: boolean
  setReportModalOpen: (v: boolean) => void
  runAssistantCommand: (raw: string) => Promise<void>
  parseContext: GlobalAssistantParseContext
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
  /** user vs office_manager — drives registry and tab availability. */
  platform?: GlobalAssistantParseContext["platform"]
  availableTabIds?: string[]
  isAdmin?: boolean
}

export function GlobalAssistantProvider({
  children,
  setPage,
  profileUserId,
  profileMetadata,
  onMetadataPatch,
  platform = "user",
  availableTabIds,
  isAdmin = false,
}: Props) {
  const { setView } = useView()
  const [assistantText, setAssistantText] = useState("")
  const [assistantNote, setAssistantNote] = useState<string | null>(null)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [micFabVisible, setMicFabVisible] = useState(() => isGlobalAssistantMicEnabled(profileMetadata))
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const setupGuideOpenerRef = useRef<(() => void) | null>(null)
  const skipVoiceAutoApplyRef = useRef(false)
  const setupWizard = useSetupWizardOptional()

  const parseContext = useMemo<GlobalAssistantParseContext>(
    () => ({ platform, availableTabIds, isAdmin }),
    [platform, availableTabIds, isAdmin],
  )

  const registerSetupGuideOpener = useCallback((fn: () => void) => {
    setupGuideOpenerRef.current = fn
  }, [])

  const openSetupGuide = useCallback(() => {
    setupGuideOpenerRef.current?.()
  }, [])

  const runAssistantCommand = useCallback(
    async (raw: string) => {
      setAssistantBusy(true)
      setAssistantNote(null)
      try {
        const action = parseGlobalAssistantCommand(raw, parseContext)
        if (action.type === "clarify") {
          setAssistantNote(action.message)
          return
        }
        if (action.type === "open_setup_guide") {
          setAssistantNote(action.message)
          openSetupGuide()
          return
        }
        if (action.type === "open_mini_wizard") {
          setupWizard?.launchWizard(action.wizardId)
          setAssistantNote(action.message)
          return
        }
        if (action.type === "open_admin") {
          try {
            sessionStorage.setItem(ASSISTANT_ADMIN_PANEL_STORAGE_KEY, action.panel)
          } catch {
            /* ignore */
          }
          setView("admin")
          setAssistantNote(action.message)
          return
        }
        setPage(action.page)
        setAssistantNote(action.message)
      } finally {
        setAssistantBusy(false)
      }
    },
    [openSetupGuide, parseContext, setPage, setView, setupWizard],
  )

  const onVoiceSessionEnd = useCallback(
    (text: string) => {
      if (skipVoiceAutoApplyRef.current) {
        skipVoiceAutoApplyRef.current = false
        return
      }
      const t = text.trim()
      if (!t) return
      void runAssistantCommand(t)
      setAssistantText("")
    },
    [runAssistantCommand],
  )

  const {
    speechSupported,
    listening: voiceListening,
    startListening,
    stopListening,
  } = useSpeechRecognitionInput(setAssistantText, { onSessionEnd: onVoiceSessionEnd })

  const persistMicPref = useCallback(
    async (enabled: boolean) => {
      if (!profileUserId || !supabase) return
      const next = mergeGlobalAssistantMic(profileMetadata ?? {}, enabled)
      const { error } = await supabase.from("profiles").update({ metadata: next }).eq("id", profileUserId)
      if (!error) onMetadataPatch?.(next)
    },
    [profileUserId, profileMetadata, onMetadataPatch],
  )

  const submitVoiceAssistant = useCallback(() => {
    const t = assistantText.trim()
    skipVoiceAutoApplyRef.current = true
    stopListening()
    if (t) {
      void runAssistantCommand(t)
      setAssistantText("")
    }
    setAssistantNote(null)
  }, [assistantText, runAssistantCommand, stopListening])

  const toggleVoiceListening = useCallback(
    (seedText?: string) => {
      if (voiceListening) {
        stopListening()
        return false
      }
      const fresh = seedText === undefined
      const base = fresh ? "" : seedText
      if (fresh) {
        setAssistantText("")
        setAssistantNote(null)
      } else if (base.trim()) {
        setAssistantText(base)
      }
      const started = startListening(base.trim() ? base : "")
      if (started) {
        setAssistantNote(
          fresh
            ? "Listening… say a tab or task, then stop or tap Send. Example: take me to customers."
            : "Listening… speak your update, then stop or tap Send.",
        )
      }
      return started
    },
    [startListening, stopListening, voiceListening],
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
      submitVoiceAssistant,
      stopVoiceListening: stopListening,
      reportModalOpen,
      setReportModalOpen,
      runAssistantCommand,
      parseContext,
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
      submitVoiceAssistant,
      stopListening,
      reportModalOpen,
      runAssistantCommand,
      parseContext,
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
