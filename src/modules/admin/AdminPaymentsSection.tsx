import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import {
  mergeBillingIntoProfileMetadata,
  parseBillingMetadata,
  type BillingProfileMetadata,
} from "../../lib/billingProfileMetadata"

type BillingRow = {
  id: string
  email: string | null
  display_name: string | null
  role: string
  account_disabled: boolean
  billing: BillingProfileMetadata
}

export default function AdminPaymentsSection() {
  const { session } = useAuth()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""
  const [rows, setRows] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, BillingProfileMetadata>>({})

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
      .select("id, display_name, role, account_disabled, metadata")
      .order("created_at", { ascending: false })
    if (pErr) {
      setError(pErr.message)
      setRows([])
      setLoading(false)
      return
    }
    const emailById = new Map((list ?? []).map((r: { id: string; email?: string | null }) => [r.id, r.email ?? null]))
    const next: BillingRow[] = (profiles ?? []).map((p: any) => {
      const meta =
        p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
          ? (p.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      return {
        id: p.id,
        email: emailById.get(p.id) ?? null,
        display_name: p.display_name ?? null,
        role: p.role ?? "user",
        account_disabled: p.account_disabled === true,
        billing,
      }
    })
    setRows(next)
    const d: Record<string, BillingProfileMetadata> = {}
    for (const r of next) {
      d[r.id] = {
        billing_helcim_customer_code: r.billing.billing_helcim_customer_code ?? "",
        helcim_pay_portal_url: r.billing.helcim_pay_portal_url ?? "",
        billing_automation_paused: r.billing.billing_automation_paused === true,
      }
    }
    setDrafts(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, session?.access_token])

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
      const nextMeta = mergeBillingIntoProfileMetadata(prev, {
        billing_helcim_customer_code: d.billing_helcim_customer_code?.trim() ?? "",
        helcim_pay_portal_url: d.helcim_pay_portal_url?.trim() ?? "",
        billing_automation_paused: d.billing_automation_paused === true ? true : false,
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

  function setDraft(userId: string, patch: Partial<BillingProfileMetadata>) {
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], ...patch },
    }))
  }

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
        {loading ? (
          <p style={{ color: theme.text }}>Loading profiles…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: theme.text }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>User</th>
                  <th style={{ padding: "8px 6px" }}>Helcim customer code</th>
                  <th style={{ padding: "8px 6px" }}>Pay portal URL override (optional)</th>
                  <th style={{ padding: "8px 6px" }}>Pause automation</th>
                  <th style={{ padding: "8px 6px" }}>Last paid</th>
                  <th style={{ padding: "8px 6px" }}>Access</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = drafts[r.id] ?? {}
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: "10px 6px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 600 }}>{r.display_name?.trim() || "—"}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{r.email ?? r.id.slice(0, 8)}</div>
                        <div style={{ fontSize: 11, opacity: 0.65 }}>{r.role}</div>
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top", minWidth: 140 }}>
                        <input
                          value={d.billing_helcim_customer_code ?? ""}
                          onChange={(e) => setDraft(r.id, { billing_helcim_customer_code: e.target.value })}
                          placeholder="From Helcim customer"
                          style={{ width: "100%", maxWidth: 220, padding: 6, borderRadius: 6, border: `1px solid ${theme.border}` }}
                        />
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top", minWidth: 200 }}>
                        <input
                          value={d.helcim_pay_portal_url ?? ""}
                          onChange={(e) => setDraft(r.id, { helcim_pay_portal_url: e.target.value })}
                          placeholder="Leave blank if using VITE_HELCIM…"
                          style={{ width: "100%", maxWidth: 320, padding: 6, borderRadius: 6, border: `1px solid ${theme.border}` }}
                        />
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                        <input
                          type="checkbox"
                          checked={d.billing_automation_paused === true}
                          onChange={(e) => setDraft(r.id, { billing_automation_paused: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top", fontSize: 12, opacity: 0.85 }}>
                        {r.billing.billing_last_success_at?.trim() || "—"}
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top", fontSize: 12 }}>
                        {r.account_disabled ? <span style={{ color: "#b91c1c" }}>Inactive</span> : <span style={{ color: "#047857" }}>Active</span>}
                      </td>
                      <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                        <button
                          type="button"
                          disabled={savingId === r.id}
                          onClick={() => void saveRow(r.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "none",
                            background: theme.primary,
                            color: "white",
                            cursor: savingId === r.id ? "wait" : "pointer",
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {savingId === r.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminSettingBlock>
    </div>
  )
}
