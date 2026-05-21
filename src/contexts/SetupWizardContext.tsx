import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import SetupMiniWizardModal from "../components/SetupMiniWizardModal"
import {
  SETUP_MINI_WIZARDS,
  getSetupMiniWizardDef,
  type SetupMiniWizardId,
} from "../lib/setupGuideWizards"
import { clearSetupWizardLaunch, readSetupWizardLaunch, writeSetupWizardLaunch } from "../lib/setupWizardLaunch"
import { mergeMiniWizardCompleted } from "../lib/setupGuideState"
import { supabase } from "../lib/supabase"

type SetupWizardContextValue = {
  activeWizardId: SetupMiniWizardId | null
  launchWizard: (id: SetupMiniWizardId, opts?: { fromSetupGuide?: boolean }) => void
  closeWizard: () => void
  lastApplyMessage: string | null
}

const SetupWizardContext = createContext<SetupWizardContextValue | null>(null)

type Props = {
  children: ReactNode
  setPage: (page: string) => void
  userId: string | null
  onMetadataPatch?: (next: Record<string, unknown>) => void
  profileMetadata?: Record<string, unknown> | null
}

export function SetupWizardProvider({ children, setPage, userId, onMetadataPatch, profileMetadata }: Props) {
  const [activeWizardId, setActiveWizardId] = useState<SetupMiniWizardId | null>(null)
  const [lastApplyMessage, setLastApplyMessage] = useState<string | null>(null)

  const launchWizard = useCallback(
    (id: SetupMiniWizardId, opts?: { fromSetupGuide?: boolean }) => {
      const def = getSetupMiniWizardDef(id)
      if (def?.page) setPage(def.page)
      writeSetupWizardLaunch({ wizardId: id, fromSetupGuide: opts?.fromSetupGuide })
      setActiveWizardId(id)
    },
    [setPage],
  )

  const closeWizard = useCallback(() => {
    setActiveWizardId(null)
    clearSetupWizardLaunch()
  }, [])

  useEffect(() => {
    const onLaunch = (ev: Event) => {
      const detail = (ev as CustomEvent<{ wizardId: SetupMiniWizardId }>).detail
      if (detail?.wizardId) setActiveWizardId(detail.wizardId)
    }
    window.addEventListener("tradesman-setup-wizard-launch", onLaunch)
    return () => window.removeEventListener("tradesman-setup-wizard-launch", onLaunch)
  }, [])

  useEffect(() => {
    const pending = readSetupWizardLaunch()
    if (pending?.wizardId) {
      const def = getSetupMiniWizardDef(pending.wizardId)
      if (def?.page) setPage(def.page)
      setActiveWizardId(pending.wizardId)
    }
  }, [setPage])

  const value = useMemo(
    () => ({
      activeWizardId,
      launchWizard,
      closeWizard,
      lastApplyMessage,
    }),
    [activeWizardId, launchWizard, closeWizard, lastApplyMessage],
  )

  return (
    <SetupWizardContext.Provider value={value}>
      {children}
      {userId && activeWizardId ? (
        <SetupMiniWizardModal
          wizardId={activeWizardId}
          userId={userId}
          onClose={closeWizard}
          onApplied={(msg) => {
            setLastApplyMessage(msg)
            if (userId && supabase && profileMetadata) {
              const next = mergeMiniWizardCompleted(profileMetadata, activeWizardId)
              void supabase.from("profiles").update({ metadata: next }).eq("id", userId).then(({ error }) => {
                if (!error) onMetadataPatch?.(next)
              })
            }
          }}
        />
      ) : null}
    </SetupWizardContext.Provider>
  )
}

export function useSetupWizard(): SetupWizardContextValue {
  const ctx = useContext(SetupWizardContext)
  if (!ctx) throw new Error("useSetupWizard must be used within SetupWizardProvider")
  return ctx
}

export function useSetupWizardOptional(): SetupWizardContextValue | null {
  return useContext(SetupWizardContext)
}

export function listSetupMiniWizards() {
  return SETUP_MINI_WIZARDS
}
