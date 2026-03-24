import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

const HIDDEN_IDS_KEY = "tradesman_admin_hidden_setting_ids_v1"
const SHOW_HIDDEN_KEY = "tradesman_admin_show_hidden_settings_v1"

function loadHiddenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_IDS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === "string"))
  } catch {
    return new Set()
  }
}

function loadShowHidden(): boolean {
  try {
    return localStorage.getItem(SHOW_HIDDEN_KEY) === "true"
  } catch {
    return false
  }
}

type AdminVisibilityValue = {
  showHiddenSettings: boolean
  setShowHiddenSettings: (v: boolean) => void
  isHidden: (id: string) => boolean
  setHidden: (id: string, hidden: boolean) => void
}

const AdminVisibilityContext = createContext<AdminVisibilityValue | null>(null)

export function AdminVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(loadHiddenIds)
  const [showHiddenSettings, setShowHiddenSettingsState] = useState(loadShowHidden)

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify([...hiddenIds]))
    } catch {
      /* ignore */
    }
  }, [hiddenIds])

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_HIDDEN_KEY, showHiddenSettings ? "true" : "false")
    } catch {
      /* ignore */
    }
  }, [showHiddenSettings])

  const setShowHiddenSettings = useCallback((v: boolean) => {
    setShowHiddenSettingsState(v)
  }, [])

  const isHidden = useCallback((id: string) => hiddenIds.has(id), [hiddenIds])

  const setHidden = useCallback((id: string, hidden: boolean) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ showHiddenSettings, setShowHiddenSettings, isHidden, setHidden }),
    [showHiddenSettings, setShowHiddenSettings, isHidden, setHidden]
  )

  return <AdminVisibilityContext.Provider value={value}>{children}</AdminVisibilityContext.Provider>
}

export function useAdminVisibility(): AdminVisibilityValue {
  const ctx = useContext(AdminVisibilityContext)
  if (!ctx) throw new Error("useAdminVisibility must be used within AdminVisibilityProvider")
  return ctx
}
