/**
 * Admin — Ads & campaigns: client requests, budgets, spend, sync into Payments.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import {
  AD_CHANNEL_OPTIONS,
  AD_CAMPAIGN_FEE_DISCLOSURE,
  AD_CAMPAIGN_SPEND_DISCLAIMER,
  AD_STATUS_OPTIONS,
  SOCIAL_PLATFORM_PROCESS,
  adBalanceDueCents,
  adCampaignProcessingFeeCents,
  adCampaignTotalChargeCents,
  centsToUsd,
  formatUsdFromCents,
  mergeAdBillingIntoMetadata,
  sumAdBalanceDueCents,
  usdToCents,
  type AdCampaignPaymentRow,
  type AdCampaignRow,
  type AdCampaignStatus,
  type AdSpendEntry,
} from "../../lib/adCampaigns"
import { GROWTH_METADATA_KEY, summarizeCampaignTargetAreas, type GrowthModuleDoc } from "../../lib/growthModule"
import { mergeBillingIntoProfileMetadata, parseBillingMetadata } from "../../lib/billingProfileMetadata"
import SocialBannerBuilder from "./SocialBannerBuilder"

type ClientOpt = { id: string; label: string; email: string | null }

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AdminCampaignsSection() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [campaigns, setCampaigns] = useState<AdCampaignRow[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [spendLog, setSpendLog] = useState<AdSpendEntry[]>([])
  const [paymentLog, setPaymentLog] = useState<AdCampaignPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [platformsOpen, setPlatformsOpen] = useState(true)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [platformNotes, setPlatformNotes] = useState("")
  const [platformChecks, setPlatformChecks] = useState<Record<string, boolean>>({})

  // New campaign form
  const [newProfileId, setNewProfileId] = useState("")
  const [newName, setNewName] = useState("Ad campaign")
  const [newBudgetUsd, setNewBudgetUsd] = useState("")
  const [newDetails, setNewDetails] = useState("")
  const [newChannels, setNewChannels] = useState<string[]>(["google"])
  const [newRequiresClientApproval, setNewRequiresClientApproval] = useState(true)

  // Edit / spend
  const [editName, setEditName] = useState("")
  const [editStatus, setEditStatus] = useState<AdCampaignStatus>("requested")
  const [editBudgetUsd, setEditBudgetUsd] = useState("")
  const [editDetails, setEditDetails] = useState("")
  const [editChannels, setEditChannels] = useState<string[]>([])
  const [spendUsd, setSpendUsd] = useState("")
  const [spendVendor, setSpendVendor] = useState("google_ads")
  const [spendNotes, setSpendNotes] = useState("")
  const [spendDate, setSpendDate] = useState(todayIsoDate())

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId])

  async function sendClientApprovalRequest(campaignId: string) {
    if (!supabase) throw new Error("Supabase is not configured.")
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) throw new Error("Sign in again to send the client approval request.")
    const response = await fetch("/api/campaign-approval", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", campaignId }),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: string; email?: { ok?: boolean; disabled?: boolean } }
    if (!response.ok) throw new Error(payload.error || `Approval request failed (${response.status}).`)
    return payload.email
  }

  const clientCampaignOptions = useMemo(() => {
    return campaigns.map((c) => {
      const client = clients.find((x) => x.id === c.profile_id)
      const due = adBalanceDueCents(c)
      return {
        id: c.id,
        label: `${client?.label ?? c.profile_id.slice(0, 8)} — ${c.name} (req ${formatUsdFromCents(c.requested_budget_cents)}, spent ${formatUsdFromCents(c.spent_cents)}${due ? `, due ${formatUsdFromCents(due)}` : ""})`,
      }
    })
  }, [campaigns, clients])

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const { data: list } = await supabase.from("admin_users_list").select("id, email")
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, role, account_disabled")
        .order("display_name", { ascending: true })
      if (pErr) throw pErr
      const emailById = new Map((list ?? []).map((r: { id: string; email?: string }) => [r.id, r.email ?? null]))
      const opts: ClientOpt[] = (profiles ?? [])
        .filter((p) => !p.account_disabled)
        .map((p) => ({
          id: p.id,
          email: emailById.get(p.id) ?? null,
          label: `${p.display_name?.trim() || "Unnamed"}${p.role ? ` (${String(p.role).replace(/_/g, " ")})` : ""}${emailById.get(p.id) ? ` · ${emailById.get(p.id)}` : ""}`,
        }))
      setClients(opts)

      const { data: camps, error: cErr } = await supabase
        .from("ad_campaigns")
        .select("*")
        .order("updated_at", { ascending: false })
      if (cErr) throw cErr
      setCampaigns((camps ?? []) as AdCampaignRow[])
      if (!selectedId && (camps ?? []).length > 0) {
        setSelectedId(String((camps as AdCampaignRow[])[0].id))
      }

      try {
        const { data: socialSetting } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "social_platform_ops_v1")
          .maybeSingle()
        const socialVal =
          socialSetting?.value && typeof socialSetting.value === "object" && !Array.isArray(socialSetting.value)
            ? (socialSetting.value as Record<string, unknown>)
            : {}
        setPlatformNotes(typeof socialVal.notes === "string" ? socialVal.notes : "")
        const checks =
          socialVal.checks && typeof socialVal.checks === "object" && !Array.isArray(socialVal.checks)
            ? (socialVal.checks as Record<string, unknown>)
            : {}
        const nextChecks: Record<string, boolean> = {}
        for (const platform of SOCIAL_PLATFORM_PROCESS) {
          nextChecks[platform.id] = checks[platform.id] === true
        }
        setPlatformChecks(nextChecks)
      } catch {
        /* optional until first save */
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load campaigns. Run supabase/ad-campaigns.sql in the Supabase SQL editor if tables are missing.",
      )
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selected) return
    setEditName(selected.name)
    setEditStatus(selected.status)
    setEditBudgetUsd(String(centsToUsd(selected.requested_budget_cents)))
    setEditDetails(selected.request_details || "")
    setEditChannels(selected.channels?.length ? [...selected.channels] : [])
  }, [selected])

  useEffect(() => {
    if (!supabase || !selectedId) {
      setSpendLog([])
      setPaymentLog([])
      return
    }
    void (async () => {
      const [spendResult, paymentResult] = await Promise.all([
        supabase
          .from("ad_spend_entries")
          .select("*")
          .eq("campaign_id", selectedId)
          .order("spend_date", { ascending: false })
          .limit(40),
        supabase
          .from("ad_campaign_payments")
          .select("*")
          .contains("campaign_ids", [selectedId])
          .order("created_at", { ascending: false })
          .limit(40),
      ])
      setSpendLog((spendResult.data ?? []) as AdSpendEntry[])
      setPaymentLog((paymentResult.data ?? []) as AdCampaignPaymentRow[])
    })()
  }, [selectedId])

  async function createCampaign() {
    if (!supabase || !newProfileId) {
      setError("Pick a client.")
      return
    }
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { data, error: insErr } = await supabase
        .from("ad_campaigns")
        .insert({
          profile_id: newProfileId,
          created_by: user?.id ?? null,
          name: newName.trim() || "Ad campaign",
          status: "requested",
          channels: newChannels,
          request_details: newDetails.trim(),
          requested_budget_cents: usdToCents(Number(newBudgetUsd) || 0),
        })
        .select("*")
        .single()
      if (insErr) throw insErr
      let createdMessage = "Campaign request created."
      if (data?.id && newRequiresClientApproval) {
        const email = await sendClientApprovalRequest(String(data.id))
        createdMessage = email?.ok
          ? "Campaign created and emailed to the client for approval."
          : "Campaign created for client approval. Email delivery is unavailable; it appears in Growth and Today’s to-do."
      }
      setMsg(createdMessage)
      setNewDetails("")
      setNewBudgetUsd("")
      setCreateFormOpen(false)
      setDetailOpen(false)
      await load()
      if (data?.id) setSelectedId(String(data.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.")
    } finally {
      setBusy(false)
    }
  }

  async function saveSocialOps() {
    if (!supabase) return
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { error: upErr } = await supabase.from("platform_settings").upsert(
        {
          key: "social_platform_ops_v1",
          value: { notes: platformNotes, checks: platformChecks, updated_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      )
      if (upErr) throw upErr
      setMsg("Social platform access checklist saved.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save social checklist.")
    } finally {
      setBusy(false)
    }
  }

  async function saveCampaign() {
    if (!supabase || !selected) return
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const approval =
        selected.metadata?.client_approval &&
        typeof selected.metadata.client_approval === "object" &&
        !Array.isArray(selected.metadata.client_approval)
          ? (selected.metadata.client_approval as Record<string, unknown>)
          : null
      if (editStatus === "active" && approval && approval.status !== "approved") {
        throw new Error("The client must approve this campaign before it can be marked Active.")
      }
      const { error: upErr } = await supabase
        .from("ad_campaigns")
        .update({
          name: editName.trim() || selected.name,
          status: editStatus,
          request_details: editDetails,
          requested_budget_cents: usdToCents(Number(editBudgetUsd) || 0),
          channels: editChannels,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id)
      if (upErr) throw upErr
      setMsg("Campaign saved.")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.")
    } finally {
      setBusy(false)
    }
  }

  async function requestSelectedClientApproval() {
    if (!selected) return
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const email = await sendClientApprovalRequest(selected.id)
      setMsg(
        email?.ok
          ? "Client approval requested and email sent."
          : "Client approval requested. It appears in Growth and Today’s to-do; email delivery is not configured.",
      )
      await load()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not request client approval.")
    } finally {
      setBusy(false)
    }
  }

  async function addSpend() {
    if (!supabase || !selected) return
    const cents = usdToCents(Number(spendUsd) || 0)
    if (cents <= 0) {
      setError("Enter a spend amount greater than zero.")
      return
    }
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { error: insErr } = await supabase.from("ad_spend_entries").insert({
        campaign_id: selected.id,
        profile_id: selected.profile_id,
        recorded_by: user?.id ?? null,
        spend_date: spendDate || todayIsoDate(),
        amount_cents: cents,
        vendor: spendVendor.trim() || null,
        kind: "media",
        notes: spendNotes.trim() || null,
      })
      if (insErr) throw insErr
      const nextSpent = (selected.spent_cents || 0) + cents
      const { error: upErr } = await supabase
        .from("ad_campaigns")
        .update({ spent_cents: nextSpent, updated_at: new Date().toISOString(), status: selected.status === "requested" ? "active" : selected.status })
        .eq("id", selected.id)
      if (upErr) throw upErr
      setSpendUsd("")
      setSpendNotes("")
      setMsg(`Logged ${formatUsdFromCents(cents)} spend.`)
      await load()
      const { data } = await supabase
        .from("ad_spend_entries")
        .select("*")
        .eq("campaign_id", selected.id)
        .order("spend_date", { ascending: false })
        .limit(40)
      setSpendLog((data ?? []) as AdSpendEntry[])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spend log failed.")
    } finally {
      setBusy(false)
    }
  }

  /** Push open ad balance into profile metadata + billing due date so Payments hub shows it. */
  async function syncToPayments() {
    if (!supabase || !selected) return
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { data: allForClient, error: qErr } = await supabase
        .from("ad_campaigns")
        .select("id, spent_cents, billed_cents")
        .eq("profile_id", selected.profile_id)
      if (qErr) throw qErr
      const rows = (allForClient ?? []) as Pick<AdCampaignRow, "id" | "spent_cents" | "billed_cents">[]
      const balance = sumAdBalanceDueCents(rows)

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("metadata")
        .eq("id", selected.profile_id)
        .maybeSingle()
      if (pErr) throw pErr

      let nextMeta = mergeAdBillingIntoMetadata(prof?.metadata, {
        balance_due_cents: balance,
        updated_at: new Date().toISOString(),
        campaign_ids: rows.map((r) => r.id),
        notes: `Ads balance from Admin campaigns (${formatUsdFromCents(balance)} due).`,
      })

      const billing = parseBillingMetadata(nextMeta)
      if (balance > 0 && !billing.billing_payment_due_date) {
        nextMeta = mergeBillingIntoProfileMetadata(nextMeta, {
          billing_payment_due_date: todayIsoDate(),
        }) as Record<string, unknown>
      }

      // Mark growth marketing budget as connected when we sync.
      const growthRaw = nextMeta[GROWTH_METADATA_KEY]
      if (growthRaw && typeof growthRaw === "object" && !Array.isArray(growthRaw)) {
        const g = { ...(growthRaw as GrowthModuleDoc) }
        g.marketingBudget = {
          ...(g.marketingBudget ?? {}),
          paymentWiringStatus: "connected",
          notes: g.marketingBudget?.notes || "Linked to Tradesman Payments via Admin Ads & campaigns.",
        }
        g.updatedAt = new Date().toISOString()
        nextMeta[GROWTH_METADATA_KEY] = g
      }

      const { error: upErr } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", selected.profile_id)
      if (upErr) throw upErr

      setMsg(
        balance > 0
          ? `Synced ${formatUsdFromCents(balance)} open ad balance to client Payments. They will see it under Payments → Advertising (pay via Helcim with subscription).`
          : "Synced — no open ad balance (spent ≤ billed) for this client.",
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payments sync failed.")
    } finally {
      setBusy(false)
    }
  }

  async function markCampaignBilled() {
    if (!supabase || !selected) return
    const due = adBalanceDueCents(selected)
    if (due <= 0) {
      setMsg("Nothing to mark billed on this campaign.")
      return
    }
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { error: billErr } = await supabase
        .from("ad_campaigns")
        .update({
          billed_cents: (selected.billed_cents || 0) + due,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id)
      if (billErr) throw billErr

      const { data: allForClient } = await supabase
        .from("ad_campaigns")
        .select("id, spent_cents, billed_cents")
        .eq("profile_id", selected.profile_id)
      const rows = (allForClient ?? []) as Pick<AdCampaignRow, "id" | "spent_cents" | "billed_cents">[]
      // Recompute after this row's local billed bump
      const balance = sumAdBalanceDueCents(
        rows.map((r) => (r.id === selected.id ? { ...r, billed_cents: (selected.billed_cents || 0) + due } : r)),
      )

      const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", selected.profile_id).maybeSingle()
      const nextMeta = mergeAdBillingIntoMetadata(prof?.metadata, {
        balance_due_cents: balance,
        updated_at: new Date().toISOString(),
        campaign_ids: rows.map((r) => r.id),
        notes: balance > 0 ? "Partial ad balance remaining." : "Ad balance cleared after billing.",
      })
      await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", selected.profile_id)

      setMsg(`Marked ${formatUsdFromCents(due)} billed on this campaign. Payments balance updated.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mark billed failed.")
    } finally {
      setBusy(false)
    }
  }

  async function importGrowthSubmitted() {
    if (!supabase) return
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, display_name, metadata").limit(8000)
      if (pErr) throw pErr
      let imported = 0
      for (const p of profiles ?? []) {
        const meta =
          p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
            ? (p.metadata as Record<string, unknown>)
            : {}
        const growth = meta[GROWTH_METADATA_KEY]
        if (!growth || typeof growth !== "object" || Array.isArray(growth)) continue
        const doc = growth as GrowthModuleDoc
        for (const c of doc.campaigns ?? []) {
          if (c.status !== "submitted" && c.status !== "active") continue
          const { data: existing } = await supabase
            .from("ad_campaigns")
            .select("id")
            .eq("profile_id", p.id)
            .eq("growth_campaign_id", c.id)
            .maybeSingle()
          if (existing?.id) continue
          const { error: insErr } = await supabase.from("ad_campaigns").insert({
            profile_id: p.id,
            created_by: user?.id ?? null,
            name: c.name || "Growth campaign",
            status: c.status === "active" ? "active" : "requested",
            channels: ["google"],
            request_details: [
              c.description,
              c.dataCollectionBrief,
              summarizeCampaignTargetAreas(c) ? `Target areas:\n${summarizeCampaignTargetAreas(c)}` : "",
              c.notes,
            ]
              .filter(Boolean)
              .join("\n\n"),
            requested_budget_cents: usdToCents(Number(c.budget) || 0),
            growth_campaign_id: c.id,
          })
          if (!insErr) imported += 1
        }
      }
      setMsg(imported ? `Imported ${imported} Growth campaign request(s).` : "No new submitted Growth campaigns to import.")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.")
    } finally {
      setBusy(false)
    }
  }

  function toggleChannel(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  if (loading) {
    return <p style={{ color: "#64748b" }}>Loading ads &amp; campaigns…</p>
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 980 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.text }}>Ads &amp; campaigns</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Track what each client requested (budget + details), log what we spent, then sync the open balance into their{" "}
          <strong>Payments</strong> tab so it shows with Helcim billing.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>
          First time: run <code>supabase/ad-campaigns.sql</code> in the Supabase SQL editor.
        </p>
      </div>

      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      {msg ? <p style={{ margin: 0, color: "#059669", fontSize: 13, fontWeight: 700 }}>{msg}</p> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void load()} disabled={busy} style={secondaryBtn}>
          Refresh
        </button>
        <button type="button" onClick={() => void importGrowthSubmitted()} disabled={busy} style={secondaryBtn}>
          Import submitted Growth campaigns
        </button>
      </div>

      {/* Client / campaign dropdown */}
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: theme.text }}>Client campaign requests</span>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setDetailOpen(false)
          }}
          style={{ ...theme.formInput, maxWidth: 720 }}
        >
          <option value="">Select a campaign…</option>
          {clientCampaignOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              border: "none",
              background: "#f8fafc",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: theme.text }}>{selected.name}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
                {selected.status} · Due {formatUsdFromCents(adBalanceDueCents(selected))} · click to {detailOpen ? "minimize" : "expand"}
              </div>
            </div>
            <span style={{ color: "#94a3b8" }}>{detailOpen ? "▲" : "▼"}</span>
          </button>
          {detailOpen ? (
        <div style={{ display: "grid", gap: 14, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Stat label="Requested" value={formatUsdFromCents(selected.requested_budget_cents)} />
            <Stat label="Spent" value={formatUsdFromCents(selected.spent_cents)} />
            <Stat label="Processing fee" value={formatUsdFromCents(adCampaignProcessingFeeCents(selected.spent_cents))} />
            <Stat label="Campaign total" value={formatUsdFromCents(adCampaignTotalChargeCents(selected.spent_cents))} />
            <Stat label="Billed" value={formatUsdFromCents(selected.billed_cents)} />
            <Stat label="Due (Payments)" value={formatUsdFromCents(adBalanceDueCents(selected))} accent />
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #fed7aa",
              background: "#fff7ed",
              color: "#9a3412",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>Client campaign disclosure</strong>
            <span>{AD_CAMPAIGN_SPEND_DISCLAIMER}</span>
            <span style={{ display: "block", marginTop: 4 }}>{AD_CAMPAIGN_FEE_DISCLOSURE}</span>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Campaign name</span>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={theme.formInput} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Status</span>
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as AdCampaignStatus)} style={theme.formInput}>
              {AD_STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Amount client requested (USD)</span>
            <input type="number" min={0} step="0.01" value={editBudgetUsd} onChange={(e) => setEditBudgetUsd(e.target.value)} style={theme.formInput} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Request details</span>
            <textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)} rows={5} style={{ ...theme.formInput, resize: "vertical" }} placeholder="Channels, creatives, geo, landing page, notes…" />
          </label>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Channels</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AD_CHANNEL_OPTIONS.map((ch) => (
                <label key={ch.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={editChannels.includes(ch.id)} onChange={() => toggleChannel(editChannels, ch.id, setEditChannels)} />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void saveCampaign()} disabled={busy} style={primaryBtn}>
              Save campaign
            </button>
            <button type="button" onClick={() => void requestSelectedClientApproval()} disabled={busy} style={secondaryBtn}>
              Send to client for approval
            </button>
            <button type="button" onClick={() => void syncToPayments()} disabled={busy} style={primaryBtn}>
              Sync open balance → Payments
            </button>
            <button type="button" onClick={() => void markCampaignBilled()} disabled={busy} style={secondaryBtn}>
              Mark this campaign paid / billed
            </button>
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />

          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Log spend</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Amount (USD)</span>
              <input type="number" min={0} step="0.01" value={spendUsd} onChange={(e) => setSpendUsd(e.target.value)} style={theme.formInput} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Date</span>
              <input type="date" value={spendDate} onChange={(e) => setSpendDate(e.target.value)} style={theme.formInput} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Vendor</span>
              <input value={spendVendor} onChange={(e) => setSpendVendor(e.target.value)} style={theme.formInput} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Spend notes</span>
            <input value={spendNotes} onChange={(e) => setSpendNotes(e.target.value)} style={theme.formInput} />
          </label>
          <button type="button" onClick={() => void addSpend()} disabled={busy} style={primaryBtn}>
            Add spend entry
          </button>

          {spendLog.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>Recent spend</div>
              {spendLog.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 10, fontSize: 13, borderBottom: `1px solid ${theme.border}`, padding: "6px 0" }}>
                  <span style={{ fontWeight: 700 }}>{formatUsdFromCents(s.amount_cents)}</span>
                  <span style={{ color: "#64748b" }}>{s.spend_date}</span>
                  <span style={{ flex: 1 }}>{s.vendor || s.kind}</span>
                  <span style={{ color: "#94a3b8" }}>{s.notes}</span>
                </div>
              ))}
            </div>
          ) : null}
          {paymentLog.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>Verified campaign payments</div>
              {paymentLog.map((payment) => (
                <div
                  key={payment.id}
                  style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13, borderBottom: `1px solid ${theme.border}`, padding: "6px 0" }}
                >
                  <span style={{ fontWeight: 800, color: "#15803d" }}>{formatUsdFromCents(payment.amount_cents)}</span>
                  <span style={{ color: "#64748b" }}>{new Date(payment.created_at).toLocaleString()}</span>
                  <span style={{ textTransform: "capitalize" }}>{payment.provider}</span>
                  <span style={{ color: "#64748b", fontFamily: "monospace" }}>{payment.provider_transaction_id}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, background: "#f8fafc", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setCreateFormOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontWeight: 800,
            color: theme.text,
          }}
        >
          <span>New client request</span>
          <span style={{ color: "#94a3b8", fontWeight: 600 }}>{createFormOpen ? "Minimize ▲" : "Expand ▼"}</span>
        </button>
        {createFormOpen ? (
      <div style={{ display: "grid", gap: 10, padding: "0 16px 16px" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Client</span>
          <select value={newProfileId} onChange={(e) => setNewProfileId(e.target.value)} style={theme.formInput}>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Campaign name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} style={theme.formInput} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Amount requested (USD)</span>
          <input type="number" min={0} step="0.01" value={newBudgetUsd} onChange={(e) => setNewBudgetUsd(e.target.value)} style={theme.formInput} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Details</span>
          <textarea value={newDetails} onChange={(e) => setNewDetails(e.target.value)} rows={4} style={{ ...theme.formInput, resize: "vertical" }} />
        </label>
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Channels</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AD_CHANNEL_OPTIONS.map((ch) => (
              <label key={ch.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={newChannels.includes(ch.id)} onChange={() => toggleChannel(newChannels, ch.id, setNewChannels)} />
                {ch.label}
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: theme.text }}>
          <input
            type="checkbox"
            checked={newRequiresClientApproval}
            onChange={(event) => setNewRequiresClientApproval(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Require client approval before launch</strong>
            <span style={{ display: "block", color: "#64748b", marginTop: 2 }}>
              Adds the request to the client&apos;s Growth tab and Today&apos;s to-do, and emails the client when email delivery is configured.
            </span>
          </span>
        </label>
        <button type="button" onClick={() => void createCampaign()} disabled={busy || !newProfileId} style={primaryBtn}>
          Create request
        </button>
      </div>
        ) : null}
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setPlatformsOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            border: "none",
            background: "#eff6ff",
            cursor: "pointer",
            fontWeight: 800,
            color: theme.text,
            textAlign: "left",
          }}
        >
          <span>Social platform access &amp; automation process</span>
          <span style={{ color: "#94a3b8" }}>{platformsOpen ? "▲" : "▼"}</span>
        </button>
        {platformsOpen ? (
          <div style={{ display: "grid", gap: 12, padding: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
              Yes — to automate Meta, TikTok, LinkedIn, and X you need <strong>Tradesman-owned Business / Ads logins</strong>{" "}
              and/or <strong>partner access</strong> to each client’s accounts, plus <strong>server-side API credentials</strong>{" "}
              (never in the browser). Until those APIs are wired, use this checklist and run spend manually in each Ads Manager,
              then log it on the campaign above.
            </p>
            {SOCIAL_PLATFORM_PROCESS.map((platform) => (
              <div key={platform.id} style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 800, color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={platformChecks[platform.id] === true}
                    onChange={(e) => setPlatformChecks((prev) => ({ ...prev, [platform.id]: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  <span>{platform.label}</span>
                </label>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                  <strong>Access:</strong> {platform.needs}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                  <strong>Automate:</strong> {platform.automate}
                </p>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#334155", lineHeight: 1.45 }}>
                  {platform.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Ops notes (Business Manager IDs, who owns tokens, blockers)</span>
              <textarea
                value={platformNotes}
                onChange={(e) => setPlatformNotes(e.target.value)}
                rows={4}
                style={{ ...theme.formInput, resize: "vertical" }}
                placeholder="Example: Meta BM #… verified; TikTok BC pending; X Ads API waitlist…"
              />
            </label>
            <button type="button" onClick={() => void saveSocialOps()} disabled={busy} style={primaryBtn}>
              Save access checklist
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setBannerOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            border: "none",
            background: "#fff7ed",
            cursor: "pointer",
            fontWeight: 800,
            color: theme.text,
          }}
        >
          <span>Social banner builder</span>
          <span style={{ color: "#94a3b8" }}>{bannerOpen ? "Minimize ▲" : "Expand ▼"}</span>
        </button>
        {bannerOpen ? (
          <div style={{ padding: 12 }}>
      <SocialBannerBuilder
        seed={
          selected
            ? {
                clientName: clients.find((c) => c.id === selected.profile_id)?.label.split(" · ")[0]?.replace(/\s*\(.*\)\s*$/, "").trim() || selected.name,
                headline: selected.name,
                subhead: selected.request_details?.trim().split("\n")[0]?.slice(0, 120) || "Licensed · Local · Fast response",
              }
            : null
        }
      />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ padding: 10, borderRadius: 10, background: accent ? "#fff7ed" : "#f8fafc", border: `1px solid ${accent ? "#fed7aa" : theme.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent ? "#c2410c" : theme.text }}>{value}</div>
    </div>
  )
}

const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: theme.text }
const primaryBtn: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#fff",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  width: "fit-content",
}
const secondaryBtn: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
}