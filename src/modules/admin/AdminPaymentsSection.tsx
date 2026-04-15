import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import {
  mergeBillingIntoProfileMetadata,
  parseBillingMetadata,
  type BillingProfileMetadata,
} from "../../lib/billingProfileMetadata"
import {
  BILLING_PRODUCT_OPTIONS,
  formatUsdMonthly,
  isBillingProductTypeId,
  monthlyUsdForBillingProductType,
  sumMonthlyBillingUsd,
  type BillingProductTypeId,
} from "../../lib/billingProductTypes"

type BillingRow = {
  id: string
  email: string | null
  display_name: string | null
  role: string
  account_disabled: boolean
  client_id: string | null
  billing: BillingProfileMetadata
}

type BillingDraft = {
  billing_helcim_customer_code: string
  helcim_pay_portal_url: string
  billing_automation_paused: boolean
  billing_product_type: string
  billing_additional_products: string[]
}

function emptyDraft(): BillingDraft {
  return {
    billing_helcim_customer_code: "",
    helcim_pay_portal_url: "",
    billing_automation_paused: false,
    billing_product_type: "",
    billing_additional_products: [],
  }
}

function draftFromBilling(b: BillingProfileMetadata): BillingDraft {
  const primary = typeof b.billing_product_type === "string" && isBillingProductTypeId(b.billing_product_type.trim())
    ? b.billing_product_type.trim()
    : ""
  const add = Array.isArray(b.billing_additional_products) ? [...b.billing_additional_products] : []
  return {
    billing_helcim_customer_code: b.billing_helcim_customer_code ?? "",
    helcim_pay_portal_url: b.helcim_pay_portal_url ?? "",
    billing_automation_paused: b.billing_automation_paused === true,
    billing_product_type: primary,
    billing_additional_products: add,
  }
}

export default function AdminPaymentsSection() {
  const { session } = useAuth()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""
  const [rows, setRows] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, BillingDraft>>({})
  const [searchQuery, setSearchQuery] = useState("")
  /** When true, row shows full billing fields. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const webhookUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/billing-webhook` : ""

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    const { data: list } = await supabase.from("admin_users_list").select("id, email")
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, role, account_disabled, metadata, client_id, created_at")
      .order("created_at", { ascending: false })
    if (pErr) {
      setError(pErr.message)
      setRows([])
      setLoading(false)
      return
    }
    const emailById = new Map((list ?? []).map((r: { id: string; email?: string | null }) => [r.id, r.email ?? null]))
    const next: BillingRow[] = (profiles ?? []).map((p: Record<string, unknown>) => {
      const meta =
        p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
          ? (p.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      return {
        id: String(p.id),
        email: emailById.get(String(p.id)) ?? null,
        display_name: (p.display_name as string | null) ?? null,
        role: String(p.role ?? "user"),
        account_disabled: p.account_disabled === true,
        client_id: typeof p.client_id === "string" ? p.client_id : null,
        billing,
      }
    })
    setRows(next)
    const d: Record<string, BillingDraft> = {}
    for (const r of next) {
      d[r.id] = draftFromBilling(r.billing)
    }
    setDrafts(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, session?.access_token])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const dr = drafts[r.id]
      const code = (dr?.billing_helcim_customer_code ?? "").toLowerCase()
      const name = (r.display_name ?? "").toLowerCase()
      const email = (r.email ?? "").toLowerCase()
      const idStr = r.id.toLowerCase()
      const client = (r.client_id ?? "").toLowerCase()
      return (
        name.includes(q) ||
        email.includes(q) ||
        idStr.includes(q) ||
        code.includes(q) ||
        client.includes(q)
      )
    })
  }, [rows, drafts, searchQuery])

  async function saveRow(userId: string) {
    if (!supabase) return
    const d = drafts[userId]
    if (!d) return
    setSavingId(userId)
    setError("")
    try {
      const { data: row, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (fetchErr) throw fetchErr
      const prev =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const additionalClean = d.billing_additional_products
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x): x is BillingProductTypeId => isBillingProductTypeId(x))
      const nextMeta = mergeBillingIntoProfileMetadata(prev, {
        billing_helcim_customer_code: d.billing_helcim_customer_code?.trim() ?? "",
        helcim_pay_portal_url: d.helcim_pay_portal_url?.trim() ?? "",
        billing_automation_paused: d.billing_automation_paused === true ? true : false,
        billing_product_type: d.billing_product_type?.trim() && isBillingProductTypeId(d.billing_product_type.trim())
          ? d.billing_product_type.trim()
          : "",
        billing_additional_products: additionalClean,
      })
      const { error: upErr } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
      if (upErr) throw upErr
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  function setDraft(userId: string, patch: Partial<BillingDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? emptyDraft()), ...patch },
    }))
  }

  function setAdditional(userId: string, index: number, value: string) {
    const d = drafts[userId] ?? emptyDraft()
    const next = [...d.billing_additional_products]
    next[index] = value
    setDraft(userId, { billing_additional_products: next })
  }

  function removeAdditional(userId: string, index: number) {
    const d = drafts[userId] ?? emptyDraft()
    const next = d.billing_additional_products.filter((_, i) => i !== index)
    setDraft(userId, { billing_additional_products: next })
  }

  function addAdditional(userId: string) {
    const d = drafts[userId] ?? emptyDraft()
    setDraft(userId, { billing_additional_products: [...d.billing_additional_products, ""] })
  }

  const productSelect = (value: string, onChange: (v: string) => void, id: string) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", maxWidth: 320, padding: 8, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }}
    >
      <option value="">— Select product type —</option>
      {BILLING_PRODUCT_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label} ({formatUsdMonthly(o.monthlyUsd)}/mo)
        </option>
      ))}
    </select>
  )

  return (
    <div>
      <AdminSettingBlock id="admin:billing:intro">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Billing &amp; Helcim</h1>
        <p style={{ color: theme.text, opacity: 0.85, margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, maxWidth: 820 }}>
          <strong>Hands-off billing:</strong> set <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> once on your web/mobile build so every user
          shares the same Helcim hosted page; you do <strong>not</strong> need a different pay URL per row. Map each Tradesman user to a{" "}
          <strong>Helcim customer code</strong> so webhooks and the in-app pay link can associate activity with the right profile. The
          app appends <code>customerCode=…</code> to the portal URL when supported — confirm with Helcim that your page template accepts
          that query (or adjust after your support call). Per-user <strong>Pay portal URL</strong> below is optional override only.
          Webhooks reactivate or deactivate the portal (<code>profiles.account_disabled</code>) for <strong>user</strong> roles only —{" "}
          <strong>admin</strong>, <strong>office_manager</strong>, and <strong>demo_user</strong> are exempt (events still log). Use{" "}
          <strong>Pause billing automation</strong> for grace periods. Deploy <code>billing-webhook</code> and run{" "}
          <code>supabase-billing-helcim.sql</code>.
        </p>
        {webhookUrl ? (
          <p style={{ margin: 0, fontSize: 13, color: theme.text, opacity: 0.9 }}>
            <strong>Helcim webhook URL:</strong>{" "}
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{webhookUrl}</code>
          </p>
        ) : null}
        <p style={{ margin: "12px 0 0", fontSize: 12, color: theme.text, opacity: 0.75, lineHeight: 1.45 }}>
          Paste the URL above into the processor webhook &quot;Deliver URL&quot; field (path is <code>billing-webhook</code> so the URL does not
          contain their brand name — otherwise their API returns <strong>400</strong> and save fails). Set <code>HELCIM_WEBHOOK_VERIFIER_TOKEN</code>{" "}
          and <code>HELCIM_API_TOKEN</code> on the Edge function. If the verifier won&apos;t copy from their UI, select-all in the dialog, paste into
          Notes, then copy from there.
        </p>
      </AdminSettingBlock>

      {error ? (
        <AdminSettingBlock id="admin:billing:error">
          <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
        </AdminSettingBlock>
      ) : null}

      <AdminSettingBlock id="admin:billing:table">
        <label style={{ display: "block", marginBottom: 12, fontSize: 13, fontWeight: 600, color: theme.text }}>
          Search users
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, email, profile id, client id, or Helcim customer code…"
            autoComplete="off"
            style={{
              display: "block",
              width: "100%",
              maxWidth: 480,
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: theme.text, opacity: 0.75 }}>
          {loading ? "Loading…" : `${filteredRows.length} of ${rows.length} profile(s) shown`}
        </p>

        {loading ? (
          <p style={{ color: theme.text }}>Loading profiles…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredRows.map((r) => {
              const d = drafts[r.id] ?? emptyDraft()
              const sum = sumMonthlyBillingUsd(d.billing_product_type, d.billing_additional_products)
              const isOpen = expanded[r.id] === true
              return (
                <div
                  key={r.id}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      border: "none",
                      background: isOpen ? "rgba(249,115,22,0.08)" : "#f8fafc",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 14,
                      color: theme.text,
                    }}
                  >
                    <span style={{ fontSize: 12, width: 18, flexShrink: 0 }} aria-hidden>
                      {isOpen ? "▼" : "▶"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{r.display_name?.trim() || "—"}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{r.email ?? r.id.slice(0, 8) + "…"}</div>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>{r.role}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.04 }}>Sum (est. / mo)</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: theme.charcoal }}>{formatUsdMonthly(sum)}</div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div style={{ padding: "16px 14px 18px", borderTop: `1px solid ${theme.border}` }}>
                      <div style={{ display: "grid", gap: 14, maxWidth: 900 }}>
                        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Product type
                          {productSelect(d.billing_product_type, (v) => setDraft(r.id, { billing_product_type: v }), `primary-${r.id}`)}
                        </label>

                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Additional products</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {d.billing_additional_products.map((ap, idx) => (
                              <div key={`${r.id}-add-${idx}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                {productSelect(ap, (v) => setAdditional(r.id, idx, v), `add-${r.id}-${idx}`)}
                                <button
                                  type="button"
                                  onClick={() => removeAdditional(r.id, idx)}
                                  style={{
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    borderRadius: 6,
                                    border: `1px solid ${theme.border}`,
                                    background: "#fff",
                                    cursor: "pointer",
                                    color: "#b91c1c",
                                    fontWeight: 600,
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addAdditional(r.id)}
                              style={{
                                alignSelf: "flex-start",
                                padding: "6px 12px",
                                fontSize: 13,
                                borderRadius: 6,
                                border: `1px dashed ${theme.primary}`,
                                background: "rgba(249,115,22,0.06)",
                                cursor: "pointer",
                                color: theme.primary,
                                fontWeight: 600,
                              }}
                            >
                              + Add product
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: "#f1f5f9",
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase" }}>Monthly sum (selected products)</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: theme.charcoal }}>{formatUsdMonthly(sum)}</div>
                            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
                              Primary:{" "}
                              {d.billing_product_type
                                ? `${formatUsdMonthly(monthlyUsdForBillingProductType(d.billing_product_type))} · ${d.billing_product_type}`
                                : "—"}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                            Helcim customer code
                            <input
                              value={d.billing_helcim_customer_code}
                              onChange={(e) => setDraft(r.id, { billing_helcim_customer_code: e.target.value })}
                              placeholder="From Helcim customer"
                              style={{ padding: 8, borderRadius: 6, border: `1px solid ${theme.border}` }}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                            Pay portal URL override (optional)
                            <input
                              value={d.helcim_pay_portal_url}
                              onChange={(e) => setDraft(r.id, { helcim_pay_portal_url: e.target.value })}
                              placeholder="Leave blank if using VITE_HELCIM…"
                              style={{ padding: 8, borderRadius: 6, border: `1px solid ${theme.border}` }}
                            />
                          </label>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={d.billing_automation_paused === true}
                            onChange={(e) => setDraft(r.id, { billing_automation_paused: e.target.checked })}
                          />
                          Pause billing automation
                        </label>
                        <div style={{ fontSize: 13, color: theme.text }}>
                          <strong>Last paid:</strong> {r.billing.billing_last_success_at?.trim() || "—"}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <strong>Access:</strong>{" "}
                          {r.account_disabled ? <span style={{ color: "#b91c1c" }}>Inactive</span> : <span style={{ color: "#047857" }}>Active</span>}
                          {r.client_id ? (
                            <span style={{ marginLeft: 12, opacity: 0.85 }}>
                              · Client id: <code style={{ fontSize: 12 }}>{r.client_id}</code>
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={savingId === r.id}
                          onClick={() => void saveRow(r.id)}
                          style={{
                            padding: "10px 18px",
                            borderRadius: 8,
                            border: "none",
                            background: theme.primary,
                            color: "white",
                            cursor: savingId === r.id ? "wait" : "pointer",
                            fontWeight: 700,
                            fontSize: 14,
                            width: "fit-content",
                          }}
                        >
                          {savingId === r.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </AdminSettingBlock>
    </div>
  )
}
