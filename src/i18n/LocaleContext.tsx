import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { STRINGS, type LocaleCode } from "./strings"

type LocaleContextValue = {
  locale: LocaleCode
  setLocale: (next: LocaleCode) => void
  t: (key: string) => string
  refetchLocale: () => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [locale, setLocaleState] = useState<LocaleCode>("en")

  const refetchLocale = useCallback(async () => {
    if (!supabase || !user?.id) {
      setLocaleState("en")
      return
    }
    const { data } = await supabase.from("profiles").select("metadata").eq("id", user.id).maybeSingle()
    const meta = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata : {}
    const raw = (meta as Record<string, unknown>).ui_language
    setLocaleState(raw === "es" ? "es" : "en")
  }, [user?.id])

  useEffect(() => {
    void refetchLocale()
  }, [refetchLocale])

  useEffect(() => {
    document.documentElement.lang = locale === "es" ? "es" : "en"
  }, [locale])

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next)
  }, [])

  const t = useCallback(
    (key: string) => {
      const pack = STRINGS[locale]
      const en = STRINGS.en
      return pack[key] ?? en[key] ?? key
    },
    [locale],
  )

  const value = useMemo(
    () => ({ locale, setLocale, t, refetchLocale }),
    [locale, setLocale, t, refetchLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider")
  return ctx
}
