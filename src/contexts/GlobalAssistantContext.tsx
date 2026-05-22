import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import AssistantConfirmDialog, { type AssistantConfirmOption } from "../components/AssistantConfirmDialog"
import AssistantVocabularyTrainPanel from "../components/AssistantVocabularyTrainPanel"
import { searchCustomersByQuery } from "../lib/customerAssistantSearch"
import { findLastMissedCallCustomer } from "../lib/customerAssistantMissedCall"
import type { AssistantPageSnapshot } from "../lib/assistantPageContext"
import { resolveCustomerIdForAssistant } from "../lib/assistantResolveCustomer"
import { queueCustomerFocus } from "../lib/customerNavigation"
import { queueAssistantHandoff, type AssistantHandoffPayload } from "../lib/assistantHandoff"
import { queueCustomerAssistantSmsFocus, queueQuotesCustomerPrefill } from "../lib/workflowNavigation"
import { supabase } from "../lib/supabase"
import {
  ASSISTANT_ADMIN_PANEL_STORAGE_KEY,
  ASSISTANT_AUTO_CONFIDENCE,
  ASSISTANT_CONFIRM_MIN,
  buildAssistantRoutingCatalog,
  parseAssistantCommand,
  shouldFallbackToLlm,
  type GlobalAssistantAction,
  type GlobalAssistantParseContext,
} from "../lib/globalAssistantNav"
import {
  loadPlatformAssistantVocabulary,
  savePlatformAssistantVocabulary,
  type AssistantCustomVocabularyEntry,
} from "../lib/platformAssistantCustomVocabulary"
import { routePlatformAssistantWithLlm } from "../lib/platformAssistantLlm"
import { useView } from "./ViewContext"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import {
  canTrainPlatformAssistantVocabulary,
  isGlobalAssistantMicEnabled,
  mergeGlobalAssistantMic,
} from "../lib/setupGuideState"
import { useSetupWizardOptional } from "./SetupWizardContext"
import { getSetupMiniWizardDef } from "../lib/setupGuideWizards"


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
  /** Customers (and other pages) publish selection for “this customer” commands. */
  setPageSnapshot: (patch: AssistantPageSnapshot) => void
  openSetupGuide: () => void
  registerSetupGuideOpener: (fn: () => void) => void
  /** True when profile role is admin — some admin-only assistant actions. */
  isAdmin: boolean
  /** Amber Train FAB + vocabulary panel (admin role or metadata flag). */
  canTrainVocabulary: boolean
  vocabularyTrainOpen: boolean
  toggleVocabularyTrain: () => void
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
  /** Active portal tab — passed into parseContext for menu-aware routing. */
  currentPage?: string
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
  currentPage,
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
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    options: AssistantConfirmOption[]
  } | null>(null)
  const [pageSnapshot, setPageSnapshot] = useState<AssistantPageSnapshot>({})

  const canTrainVocabulary = useMemo(
    () => canTrainPlatformAssistantVocabulary({ authRole: isAdmin ? "admin" : null }),
    [isAdmin],
  )
  const [customVocabulary, setCustomVocabulary] = useState<AssistantCustomVocabularyEntry[]>([])
  const [vocabularyTrainOpen, setVocabularyTrainOpen] = useState(false)
  const [vocabularySaveBusy, setVocabularySaveBusy] = useState(false)
  const [vocabularySaveError, setVocabularySaveError] = useState<string | null>(null)

  const reloadCustomVocabulary = useCallback(async () => {
    if (!supabase) return
    try {
      const entries = await loadPlatformAssistantVocabulary(supabase)
      setCustomVocabulary(entries)
    } catch {
      setCustomVocabulary([])
    }
  }, [])

  useEffect(() => {
    void reloadCustomVocabulary()
  }, [reloadCustomVocabulary, profileUserId])

  const parseContext = useMemo<GlobalAssistantParseContext>(
    () => ({
      platform,
      availableTabIds,
      isAdmin,
      currentPage,
      selectedCustomerId: pageSnapshot.selectedCustomerId,
      selectedCustomerName: pageSnapshot.selectedCustomerName,
      customVocabulary,
    }),
    [platform, availableTabIds, isAdmin, currentPage, pageSnapshot, customVocabulary],
  )

  const toggleVocabularyTrain = useCallback(() => {
    setVocabularyTrainOpen((o) => !o)
    setVocabularySaveError(null)
  }, [])

  const persistVocabularyEntries = useCallback(
    async (entries: AssistantCustomVocabularyEntry[]) => {
      if (!supabase) throw new Error("Not connected.")
      setVocabularySaveBusy(true)
      setVocabularySaveError(null)
      try {
        await savePlatformAssistantVocabulary(supabase, entries)
        setCustomVocabulary(entries)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save vocabulary."
        setVocabularySaveError(msg)
        throw e
      } finally {
        setVocabularySaveBusy(false)
      }
    },
    [],
  )

  const saveCustomVocabularyEntry = useCallback(
    async (draft: Omit<AssistantCustomVocabularyEntry, "id" | "createdAt" | "createdBy">) => {
      const entry: AssistantCustomVocabularyEntry = {
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        createdBy: profileUserId ?? undefined,
      }
      await persistVocabularyEntries([entry, ...customVocabulary])
      setAssistantNote(`Saved training for “${entry.phrase}”.`)
    },
    [customVocabulary, persistVocabularyEntries, profileUserId],
  )

  const deleteCustomVocabularyEntry = useCallback(
    async (id: string) => {
      await persistVocabularyEntries(customVocabulary.filter((e) => e.id !== id))
    },
    [customVocabulary, persistVocabularyEntries],
  )

  const registerSetupGuideOpener = useCallback((fn: () => void) => {
    setupGuideOpenerRef.current = fn
  }, [])

  const openSetupGuide = useCallback(() => {
    setupGuideOpenerRef.current?.()
  }, [])

  const executeAssistantAction = useCallback(
    async (action: GlobalAssistantAction) => {
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
      if (action.type === "explain") {
        setAssistantNote(action.message)
        return
      }
      if (action.type === "open_current_customer") {
        const id = pageSnapshot.selectedCustomerId?.trim()
        if (!id) {
          setAssistantNote("Open a customer on the Customers tab first, then try again.")
          return
        }
        queueCustomerFocus(id)
        setPage("customers")
        setAssistantNote(action.message)
        return
      }
      if (action.type === "create_estimate" || action.type === "focus_customer_sms") {
        if (!supabase || !profileUserId) {
          setAssistantNote("Sign in to use customer actions.")
          return
        }
        setAssistantNote(action.message)
        try {
          const resolved = await resolveCustomerIdForAssistant(supabase, profileUserId, {
            customerId: action.customerId,
            customerQuery: action.customerQuery,
          })
          if (!resolved) {
            setAssistantNote("Name a customer or open their record on Customers first.")
            return
          }
          if ("picks" in resolved) {
            setConfirmDialog({
              message: `Several customers match. Which one?`,
              options: resolved.picks.slice(0, 5).map((h) => ({
                label: h.phone ? `${h.display_name} · ${h.phone}` : h.display_name,
                action:
                  action.type === "create_estimate"
                    ? {
                        type: "create_estimate",
                        customerId: h.id,
                        message: `Starting estimate for ${h.display_name}.`,
                      }
                    : {
                        type: "focus_customer_sms",
                        customerId: h.id,
                        message: `Opening ${h.display_name} for SMS.`,
                      },
              })),
            })
            return
          }
          if (action.type === "create_estimate") {
            const tabs = parseContext.availableTabIds
            if (tabs?.length && !tabs.includes("quotes")) {
              setAssistantNote("Estimates is not enabled on your portal menu.")
              return
            }
            queueQuotesCustomerPrefill(resolved.id)
            setPage("quotes")
            setAssistantNote(`Opening estimate for ${resolved.name}.`)
            return
          }
          queueCustomerFocus(resolved.id)
          queueCustomerAssistantSmsFocus(resolved.id)
          setPage("customers")
          setAssistantNote(`Opening ${resolved.name} — SMS compose is below (complete opt-in if required).`)
        } catch (e) {
          setAssistantNote(e instanceof Error ? e.message : "Could not resolve customer.")
        }
        return
      }
      if (action.type === "open_customer") {
        queueCustomerFocus(action.customerId)
        setPage("customers")
        setAssistantNote(action.message)
        return
      }
      if (action.type === "open_last_missed_call") {
        if (!supabase || !profileUserId) {
          setAssistantNote("Sign in to look up missed calls.")
          return
        }
        setAssistantNote(action.message)
        try {
          const hit = await findLastMissedCallCustomer(supabase, profileUserId)
          if (!hit) {
            setAssistantNote(
              "No missed call with a customer record found yet. Check Customers after an inbound call goes to voicemail.",
            )
            return
          }
          await executeAssistantAction({
            type: "open_customer",
            customerId: hit.customerId,
            customerName: hit.display_name,
            message: `Opening ${hit.display_name} (last missed call).`,
          })
        } catch (e) {
          setAssistantNote(e instanceof Error ? e.message : "Could not load missed call.")
        }
        return
      }
      if (action.type === "find_customer") {
        if (!supabase || !profileUserId) {
          setAssistantNote("Sign in to look up customers.")
          return
        }
        setAssistantNote(action.message)
        const hits = await searchCustomersByQuery(supabase, profileUserId, action.query)
        if (hits.length === 0) {
          setAssistantNote(`No customer matched “${action.query}”. Try their full name from your customer list.`)
          return
        }
        if (hits.length === 1) {
          await executeAssistantAction({
            type: "open_customer",
            customerId: hits[0].id,
            customerName: hits[0].display_name,
            message: `Opening ${hits[0].display_name}.`,
          })
          return
        }
        setConfirmDialog({
          message: `Several customers match “${action.query}”. Which one?`,
          options: hits.slice(0, 5).map((h) => ({
            label: h.phone ? `${h.display_name} · ${h.phone}` : h.display_name,
            action: {
              type: "open_customer",
              customerId: h.id,
              customerName: h.display_name,
              message: `Opening ${h.display_name}.`,
            },
          })),
        })
        return
      }
      if (action.type === "handoff_specialist_assistant") {
        const payload: AssistantHandoffPayload = {
          specialist: action.specialist,
          scopeText: action.scopeText,
          jobTypeName: action.jobTypeName,
          mode: action.mode,
        }
        queueAssistantHandoff(payload)
        setPage("quotes")
        setAssistantNote(action.message)
        return
      }
      if (action.type === "navigate") {
        setPage(action.page)
        setAssistantNote(action.message)
      }
    },
    [openSetupGuide, pageSnapshot.selectedCustomerId, parseContext.availableTabIds, profileUserId, setPage, setView, setupWizard],
  )

  const runAssistantCommand = useCallback(
    async (raw: string) => {
      setAssistantBusy(true)
      setAssistantNote(null)
      setConfirmDialog(null)
      try {
        let parsed = parseAssistantCommand(raw, parseContext)

        if (shouldFallbackToLlm(parsed, raw) && supabase) {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          if (token) {
            setAssistantNote("Understanding phrasing…")
            const llmParsed = await routePlatformAssistantWithLlm(
              token,
              raw,
              buildAssistantRoutingCatalog(parseContext),
              {
                isAdmin: parseContext.isAdmin,
                availableTabIds: parseContext.availableTabIds,
              },
            )
            if (llmParsed) parsed = llmParsed
          }
        }

        const { action, confidence, alternatives } = parsed

        if (action.type === "clarify" || confidence < ASSISTANT_CONFIRM_MIN) {
          setAssistantNote(action.message)
          return
        }

        if (confidence >= ASSISTANT_AUTO_CONFIDENCE) {
          await executeAssistantAction(action)
          return
        }

        const options: AssistantConfirmOption[] = [
          {
            label:
              action.type === "navigate"
                ? `Open ${action.message.replace(/^Opening\s+/i, "").replace(/\.$/, "")}`
                : action.type === "open_mini_wizard"
                  ? getSetupMiniWizardDef(action.wizardId)?.label ?? "Open setup wizard"
                  : action.type === "find_customer"
                    ? `Find customer “${action.query}”`
                    : action.type === "open_last_missed_call"
                      ? "Open last missed call"
                      : action.type === "create_estimate"
                        ? "Start estimate"
                        : action.type === "focus_customer_sms"
                          ? "Open SMS compose"
                          : action.type === "explain"
                            ? "Show help"
                            : action.type === "open_current_customer"
                              ? "Open this customer"
                              : action.type === "handoff_specialist_assistant"
                                ? action.message.replace(/\.$/, "") || "Open specialist assistant"
                                : action.message.replace(/\.$/, ""),
            action,
          },
        ]
        for (const alt of alternatives ?? []) {
          if (options.length >= 3) break
          options.push({ label: alt.label, action: alt.action })
        }
        setConfirmDialog({
          message: `I'm about ${Math.round(confidence)}% sure. Confirm what you meant:`,
          options,
        })
      } finally {
        setAssistantBusy(false)
      }
    },
    [executeAssistantAction, parseContext],
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
  } = useSpeechRecognitionInput(setAssistantText, {
    onSessionEnd: onVoiceSessionEnd,
    preferLiveTranscript: true,
  })

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
      setPageSnapshot: (patch: AssistantPageSnapshot) => {
        setPageSnapshot((prev) => ({ ...prev, ...patch }))
      },
      openSetupGuide,
      registerSetupGuideOpener,
      isAdmin,
      canTrainVocabulary,
      vocabularyTrainOpen,
      toggleVocabularyTrain,
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
      isAdmin,
      canTrainVocabulary,
      vocabularyTrainOpen,
      toggleVocabularyTrain,
    ],
  )

  return (
    <GlobalAssistantContext.Provider value={value}>
      {children}
      {canTrainVocabulary ? (
        <AssistantVocabularyTrainPanel
          open={vocabularyTrainOpen}
          onClose={() => setVocabularyTrainOpen(false)}
          initialPhrase={assistantText.trim()}
          selectedCustomerName={pageSnapshot.selectedCustomerName}
          entries={customVocabulary}
          saveBusy={vocabularySaveBusy}
          saveError={vocabularySaveError}
          onSave={saveCustomVocabularyEntry}
          onDelete={deleteCustomVocabularyEntry}
        />
      ) : null}
      <AssistantConfirmDialog
        open={Boolean(confirmDialog)}
        message={confirmDialog?.message ?? ""}
        options={confirmDialog?.options ?? []}
        onPick={(action) => {
          setConfirmDialog(null)
          void executeAssistantAction(action)
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </GlobalAssistantContext.Provider>
  )
}

export function useGlobalAssistant(): GlobalAssistantContextValue {
  const ctx = useContext(GlobalAssistantContext)
  if (!ctx) throw new Error("useGlobalAssistant must be used within GlobalAssistantProvider")
  return ctx
}

export function useGlobalAssistantOptional(): GlobalAssistantContextValue | null {
  return useContext(GlobalAssistantContext)
}
