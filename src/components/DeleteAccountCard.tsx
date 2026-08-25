import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import { useLocale } from "../i18n/LocaleContext"

const CONFIRM_WORD = "DELETE"

/** In-app account deletion required by App Store guideline 5.1.1(v). */
export default function DeleteAccountCard() {
  const { signOut } = useAuth()
  const { t } = useLocale()
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    if (!supabase || typed.trim() !== CONFIRM_WORD) return
    const ok = window.confirm(t("account.delete.confirmDialog"))
    if (!ok) return
    setBusy(true)
    setError("")
    try {
      const { data, error: fnError } = await supabase.functions.invoke("delete-own-account", {
        body: { confirm: CONFIRM_WORD },
      })
      const payload = data as { ok?: boolean; error?: string } | null
      if (fnError) throw new Error(payload?.error || fnError.message)
      if (!payload?.ok) throw new Error(payload?.error || t("account.delete.failed"))
      await signOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.55 }}>{t("account.delete.body")}</p>
      <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: theme.text }}>
        {t("account.delete.typeLabel")}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          disabled={busy}
          style={{ ...theme.formInput, maxWidth: 280, fontWeight: 500 }}
        />
      </label>
      <button
        type="button"
        disabled={busy || typed.trim() !== CONFIRM_WORD}
        onClick={() => void handleDelete()}
        style={{
          width: "fit-content",
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #fecaca",
          background: typed.trim() === CONFIRM_WORD ? "#dc2626" : "#fca5a5",
          color: "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: busy || typed.trim() !== CONFIRM_WORD ? "not-allowed" : "pointer",
          opacity: busy || typed.trim() !== CONFIRM_WORD ? 0.7 : 1,
        }}
      >
        {busy ? t("account.delete.deleting") : t("account.delete.button")}
      </button>
      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
    </div>
  )
}
