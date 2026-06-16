import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import JobTypesManagerModal from "../components/JobTypesManagerModal"
import { APP_OVERLAY_JOB_TYPES, parseAppHash } from "../lib/appNavigationHistory"
import { consumeOpenEstimateJobTypesModalFlag } from "../lib/assistantHandoff"
import { consumeOpenJobTypesModal, queueOpenJobTypesModal } from "../lib/workflowNavigation"
import { usePortalConfigForPage, useScopedUserId } from "../contexts/OfficeManagerScopeContext"
import { useAppNavigationOptional } from "./AppNavigationContext"

export type OpenJobTypesModalOptions = {
  expandCreate?: boolean
  initialName?: string
  initialPresetChecks?: Record<string, boolean>
  onCreated?: (jobTypeId: string) => void
  onChanged?: () => void
}

type JobTypesModalContextValue = {
  openJobTypesModal: (opts?: OpenJobTypesModalOptions) => void
  closeJobTypesModal: () => void
  isJobTypesModalOpen: boolean
}

const JobTypesModalContext = createContext<JobTypesModalContextValue | null>(null)

export function JobTypesModalProvider({ children }: { children: ReactNode }) {
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
  const nav = useAppNavigationOptional()
  const [open, setOpen] = useState(false)
  const [expandCreate, setExpandCreate] = useState(false)
  const [initialName, setInitialName] = useState("")
  const [initialPresetChecks, setInitialPresetChecks] = useState<Record<string, boolean>>({})
  const pendingOptsRef = useRef<OpenJobTypesModalOptions>({})
  const onChangedRef = useRef<(() => void) | undefined>(undefined)
  const onCreatedRef = useRef<((id: string) => void) | undefined>(undefined)

  const title = portalConfig?.controlLabels?.job_types ?? "Job types"
  const estimateLineItemsLabel = portalConfig?.controlLabels?.estimate_line_items ?? "Saved line templates"

  const closeJobTypesModal = useCallback(() => {
    setOpen(false)
    setExpandCreate(false)
    setInitialName("")
    setInitialPresetChecks({})
    pendingOptsRef.current = {}
    onChangedRef.current = undefined
    onCreatedRef.current = undefined
    nav?.closeOverlay(APP_OVERLAY_JOB_TYPES)
  }, [nav])

  const openJobTypesModal = useCallback(
    (opts?: OpenJobTypesModalOptions) => {
      pendingOptsRef.current = opts ?? {}
      onChangedRef.current = opts?.onChanged
      onCreatedRef.current = opts?.onCreated
      setExpandCreate(opts?.expandCreate === true)
      setInitialName(opts?.initialName?.trim() ?? "")
      setInitialPresetChecks(opts?.initialPresetChecks ?? {})
      setOpen(true)
      nav?.openOverlay(APP_OVERLAY_JOB_TYPES)
    },
    [nav],
  )

  useEffect(() => {
    if (!nav) return
    return nav.registerOverlay(APP_OVERLAY_JOB_TYPES, () => {
      setOpen(false)
      setExpandCreate(false)
    setInitialName("")
    setInitialPresetChecks({})
      pendingOptsRef.current = {}
      onChangedRef.current = undefined
      onCreatedRef.current = undefined
    })
  }, [nav])

  useEffect(() => {
    const parsed = parseAppHash(window.location.hash)
    if (parsed.overlay === APP_OVERLAY_JOB_TYPES && !open) {
      openJobTypesModal()
    }
  }, [open, openJobTypesModal])

  useEffect(() => {
    const tryOpenFromQueue = () => {
      if (consumeOpenJobTypesModal() || consumeOpenEstimateJobTypesModalFlag()) {
        openJobTypesModal()
      }
    }
    tryOpenFromQueue()
    const onQueued = () => tryOpenFromQueue()
    window.addEventListener("tradesman:open-job-types-modal", onQueued)
    return () => window.removeEventListener("tradesman:open-job-types-modal", onQueued)
  }, [openJobTypesModal])

  return (
    <JobTypesModalContext.Provider value={{ openJobTypesModal, closeJobTypesModal, isJobTypesModalOpen: open }}>
      {children}
      <JobTypesManagerModal
        open={open}
        onClose={closeJobTypesModal}
        userId={userId}
        title={title}
        estimateLineItemsLabel={estimateLineItemsLabel}
        showSetupWizard
        expandCreateOnOpen={expandCreate}
        initialName={initialName}
        initialPresetChecks={initialPresetChecks}
        onChanged={() => onChangedRef.current?.()}
        onCreated={(id) => onCreatedRef.current?.(id)}
      />
    </JobTypesModalContext.Provider>
  )
}

export function useJobTypesModal(): JobTypesModalContextValue {
  const ctx = useContext(JobTypesModalContext)
  if (!ctx) throw new Error("useJobTypesModal must be used within JobTypesModalProvider")
  return ctx
}

export function useJobTypesModalOptional(): JobTypesModalContextValue | null {
  return useContext(JobTypesModalContext)
}

/** Queue job types modal before navigating (e.g. dashboard tile). */
export function queueAndOpenJobTypesModal(): void {
  queueOpenJobTypesModal()
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tradesman:open-job-types-modal"))
  }
}
