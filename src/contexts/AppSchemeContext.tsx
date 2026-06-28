import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import defaultLogo from "../assets/logo.png"
import { supabase } from "../lib/supabase"
import {
  APP_SCHEME_META_KEY,
  customSchemeCssVars,
  defaultAppSchemeV1,
  mergeAppSchemeV1,
  parseAppSchemeV1,
  type AppSchemeCustomConfig,
  type AppSchemeId,
  type AppSchemeV1,
} from "../lib/appSchemes"

type AppSchemeContextValue = {
  scheme: AppSchemeV1
  schemeId: AppSchemeId
  logoUrl: string
  portalStyle: CSSProperties
  loading: boolean
  saving: boolean
  setSchemeId: (id: AppSchemeId) => Promise<void>
  updateCustom: (patch: Partial<AppSchemeCustomConfig>) => Promise<void>
  uploadCustomLogo: (file: File) => Promise<void>
}

const AppSchemeContext = createContext<AppSchemeContextValue | null>(null)

export function AppSchemeProvider({
  profileUserId,
  children,
}: {
  profileUserId: string | null | undefined
  children: ReactNode
}) {
  const [scheme, setScheme] = useState<AppSchemeV1>(() => defaultAppSchemeV1())
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profileUserId || !supabase) {
      setScheme(defaultAppSchemeV1())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.resolve(
      supabase
        .from("profiles")
        .select("metadata")
        .eq("id", profileUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return
          const meta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? (data.metadata as Record<string, unknown>)
              : {}
          setMetadata(meta)
          setScheme(parseAppSchemeV1(meta))
        }),
    ).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [profileUserId])

  const persist = useCallback(
    async (next: AppSchemeV1) => {
      if (!profileUserId || !supabase) return
      setSaving(true)
      const nextMeta = mergeAppSchemeV1(metadata, next)
      setMetadata(nextMeta)
      setScheme(parseAppSchemeV1(nextMeta))
      const { error } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", profileUserId)
      setSaving(false)
      if (error) console.warn("[AppScheme]", error.message)
    },
    [metadata, profileUserId],
  )

  const setSchemeId = useCallback(
    async (id: AppSchemeId) => {
      await persist({ ...scheme, schemeId: id })
    },
    [persist, scheme],
  )

  const updateCustom = useCallback(
    async (patch: Partial<AppSchemeCustomConfig>) => {
      await persist({
        ...scheme,
        schemeId: "custom",
        custom: { ...scheme.custom, ...patch },
      })
    },
    [persist, scheme],
  )

  const uploadCustomLogo = useCallback(
    async (file: File) => {
      if (!profileUserId || !supabase) return
      const ext = file.name.split(".").pop()?.toLowerCase()
      const safeExt = ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" ? ext : "png"
      const path = `${profileUserId}/scheme_logo_${Date.now()}.${safeExt}`
      const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, {
        upsert: true,
        contentType: file.type || "image/png",
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) throw new Error("Could not get public URL for logo.")
      await updateCustom({ logoUrl: url })
    },
    [profileUserId, updateCustom],
  )

  const logoUrl =
    scheme.schemeId === "custom" && scheme.custom.logoUrl ? scheme.custom.logoUrl : defaultLogo

  const portalStyle: CSSProperties = useMemo(() => {
    if (scheme.schemeId !== "custom") return {}
    return customSchemeCssVars(scheme.custom) as CSSProperties
  }, [scheme])

  const value = useMemo(
    () => ({
      scheme,
      schemeId: scheme.schemeId,
      logoUrl,
      portalStyle,
      loading,
      saving,
      setSchemeId,
      updateCustom,
      uploadCustomLogo,
    }),
    [scheme, logoUrl, portalStyle, loading, saving, setSchemeId, updateCustom, uploadCustomLogo],
  )

  return <AppSchemeContext.Provider value={value}>{children}</AppSchemeContext.Provider>
}

export function useAppScheme(): AppSchemeContextValue {
  const ctx = useContext(AppSchemeContext)
  if (!ctx) {
    return {
      scheme: defaultAppSchemeV1(),
      schemeId: "standard",
      logoUrl: defaultLogo,
      portalStyle: {},
      loading: false,
      saving: false,
      setSchemeId: async () => {},
      updateCustom: async () => {},
      uploadCustomLogo: async () => {},
    }
  }
  return ctx
}

export { APP_SCHEME_META_KEY }
