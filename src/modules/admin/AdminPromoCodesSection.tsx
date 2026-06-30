import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import {
  BILLING_PROMO_CODES_KEY,
  newPromoCodeDraft,
  normalizePromoCodeInput,
  parseBillingPromoCodesStore,
  type BillingPromoCode,
} from "../../types/billing-promo-codes"

const secondaryOutlineButton: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
}

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  fontSize: 13,
  width: "100%",
}

function formatPromoSummary(p: BillingPromoCode): string {
  const pct = `${p.percent_off}% off`
  const tier =
    p.monthly_price_cap_usd != null && p.max_credit_usd != null
      ? ` · ≤$${p.monthly_price_cap_usd}/mo full · >$${p.monthly_price_cap_usd}/mo up to $${p.max_credit_usd} credit`
      : ""
  return `${pct}${tier} · ${p.benefit_start} → ${p.benefit_end}${p.billing_resume_date ? ` · resumes ${p.billing_resume_date}` : ""}`
}

export default function AdminPromoCodesSection() {
  const [codes, setCodes] = useState<BillingPromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BillingPromoCode | null>(null)

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const { data, error: err } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", BILLING_PROMO_CODES_KEY)
        .maybeSingle()
      if (err) throw err
      setCodes(parseBillingPromoCodesStore(data?.value).codes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startAdd() {
    const row = newPromoCodeDraft()
    setDraft(row)
    setEditingId(row.id)
    setMessage("")
    setError("")
  }

  function startEdit(row: BillingPromoCode) {
    setDraft({ ...row })
    setEditingId(row.id)
    setMessage("")
    setError("")
  }

  function cancelEdit() {
    setDraft(null)
    setEditingId(null)
  }

  function validateDraft(row: BillingPromoCode): string | null {
    if (!normalizePromoCodeInput(row.code)) return "Promo code is required."
    if (!row.description.trim()) return "Description is required."
    if (!row.benefit_start || !row.benefit_end) return "Benefit start and end dates are required."
    if (row.benefit_end < row.benefit_start) return "Benefit end must be on or after benefit start."
    const codeNorm = normalizePromoCodeInput(row.code)
    const dup = codes.find((c) => c.id !== row.id && normalizePromoCodeInput(c.code) === codeNorm)
    if (dup) return `Code ${codeNorm} is already used by another promo.`
    return null
  }

  async function persistCodes(next: BillingPromoCode[]) {
    if (!supabase) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const now = new Date().toISOString()
      const normalized = next.map((c) => ({
        ...c,
        code: normalizePromoCodeInput(c.code),
        updated_at: now,
        created_at: c.created_at ?? now,
      }))
      const { error: err } = await supabase.from("platform_settings").upsert(
        { key: BILLING_PROMO_CODES_KEY, value: { codes: normalized } },
        { onConflict: "key" },
      )
      if (err) throw err
      setCodes(normalized)
      setMessage("Promo codes saved.")
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    if (!draft) return
    const errMsg = validateDraft(draft)
    if (errMsg) {
      setError(errMsg)
      return
    }
    const exists = codes.some((c) => c.id === draft.id)
    const next = exists ? codes.map((c) => (c.id === draft.id ? draft : c)) : [...codes, draft]
    await persistCodes(next)
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this promo code? Existing accounts that already redeemed it keep their profile metadata.")) return
    await persistCodes(codes.filter((c) => c.id !== id))
  }

  return (
    <AdminSettingBlock id="admin:billing:promo-codes">
      <h2 style={{ color: theme.charcoal, margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>Signup promo codes</h2>
      <p style={{ color: theme.charcoal, margin: "0 0 12px", fontSize: 13, lineHeight: 1.55, maxWidth: 820, opacity: 0.95 }}>
        Promo codes appear on the public signup form. Each code can offer a <strong>percentage off</strong> the prorated signup
        charge when the signup day falls inside the benefit window, and can set a <strong>billing resume date</strong> on the
        new account. Run <code style={{ fontSize: 12 }}>supabase/billing-promo-codes.sql</code> once so anonymous signup can
        read codes from <code style={{ fontSize: 12 }}>platform_settings</code>.
      </p>

      {loading ? <p style={{ fontSize: 14, color: theme.charcoal }}>Loading promo codes…</p> : null}
      {error ? <p style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p> : null}
      {message ? <p style={{ color: "#059669", fontSize: 14 }}>{message}</p> : null}

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        {codes.map((row) => (
          <div
            key={row.id}
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: row.active ? "#fff" : "#f9fafb",
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 15, color: theme.charcoal }}>{normalizePromoCodeInput(row.code) || "—"}</strong>
                {!row.active ? (
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>Inactive</span>
                ) : null}
                <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.charcoal, opacity: 0.9 }}>{row.description}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{formatPromoSummary(row)}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button type="button" style={secondaryOutlineButton} onClick={() => startEdit(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  style={{ ...secondaryOutlineButton, color: "#b91c1c", borderColor: "#fecaca" }}
                  onClick={() => void handleDelete(row.id)}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && codes.length === 0 ? (
          <p style={{ fontSize: 13, color: theme.charcoal, opacity: 0.85 }}>No promo codes yet.</p>
        ) : null}
      </div>

      <button type="button" style={secondaryOutlineButton} onClick={startAdd} disabled={saving || Boolean(editingId)}>
        Add promo code
      </button>

      {draft && editingId === draft.id ? (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 10,
            border: `2px solid ${theme.primary}`,
            background: "#fff",
            display: "grid",
            gap: 12,
            maxWidth: 640,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, color: theme.charcoal }}>{codes.some((c) => c.id === draft.id) ? "Edit promo" : "New promo"}</h3>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
            Code
            <input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              placeholder="JULY250"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
            Description (shown on signup when applied)
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
            Percent off (0–100)
            <input
              type="number"
              min={0}
              max={100}
              value={draft.percent_off}
              onChange={(e) => setDraft({ ...draft, percent_off: Number(e.target.value) })}
              style={{ ...inputStyle, maxWidth: 120 }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Benefit starts
              <input
                type="date"
                value={draft.benefit_start}
                onChange={(e) => setDraft({ ...draft, benefit_start: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Benefit ends
              <input
                type="date"
                value={draft.benefit_end}
                onChange={(e) => setDraft({ ...draft, benefit_end: e.target.value })}
                style={inputStyle}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
            Billing resumes (due date on new account)
            <input
              type="date"
              value={draft.billing_resume_date ?? ""}
              onChange={(e) => setDraft({ ...draft, billing_resume_date: e.target.value || undefined })}
              style={{ ...inputStyle, maxWidth: 200 }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Redeemable from
              <input
                type="date"
                value={draft.redeemable_from ?? ""}
                onChange={(e) => setDraft({ ...draft, redeemable_from: e.target.value || undefined })}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Redeemable until
              <input
                type="date"
                value={draft.redeemable_until ?? ""}
                onChange={(e) => setDraft({ ...draft, redeemable_until: e.target.value || undefined })}
                style={inputStyle}
              />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: theme.charcoal, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={draft.show_homepage_banner === true}
              onChange={(e) => setDraft({ ...draft, show_homepage_banner: e.target.checked })}
            />
            Show homepage banner (while redeemable)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Monthly price cap ($)
              <input
                type="number"
                min={0}
                value={draft.monthly_price_cap_usd ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    monthly_price_cap_usd: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="e.g. 250"
                style={{ ...inputStyle, maxWidth: 140 }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: theme.charcoal }}>
              Max credit above cap ($)
              <input
                type="number"
                min={0}
                value={draft.max_credit_usd ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, max_credit_usd: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                placeholder="e.g. 250"
                style={{ ...inputStyle, maxWidth: 140 }}
              />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: theme.charcoal, cursor: "pointer" }}>
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Active
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: theme.charcoal, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={draft.new_signups_only !== false}
              onChange={(e) => setDraft({ ...draft, new_signups_only: e.target.checked })}
            />
            New signups only
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveDraft()}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save promo code"}
            </button>
            <button type="button" style={secondaryOutlineButton} onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </AdminSettingBlock>
  )
}
