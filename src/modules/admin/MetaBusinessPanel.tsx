import { useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatUsdFromCents, type AdCampaignRow } from "../../lib/adCampaigns"
import PlatformBadge from "../../components/PlatformBadge"

type ClientOption = { id: string; label: string }
type MetaAsset = {
  id: string
  account_id?: string
  name?: string
  account_status?: number
  currency?: string
  instagram_business_account?: { id?: string; username?: string; name?: string }
}
type MetaConnection = {
  adAccountId?: string
  adAccountName?: string
  pageId?: string
  pageName?: string
  instagramAccountId?: string
  instagramUsername?: string
  lastSyncedAt?: string
}

async function metaApi<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error("Sign in again to use Meta.")
  const response = await fetch("/api/meta-business", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Meta request failed (${response.status}).`)
  return payload
}

function isoDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function csv(value: string): string[] {
  return value
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function MetaBusinessPanel({
  clients,
  campaigns,
  onChanged,
}: {
  clients: ClientOption[]
  campaigns: AdCampaignRow[]
  onChanged: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [profileId, setProfileId] = useState("")
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [version, setVersion] = useState("")
  const [systemUserName, setSystemUserName] = useState("")
  const [assets, setAssets] = useState<{ adAccounts: MetaAsset[]; pages: MetaAsset[] }>({ adAccounts: [], pages: [] })
  const [connection, setConnection] = useState<MetaConnection>({})
  const [adAccountId, setAdAccountId] = useState("")
  const [pageId, setPageId] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [postChannels, setPostChannels] = useState<string[]>(["facebook", "instagram"])
  const [postMessage, setPostMessage] = useState("")
  const [postMediaUrl, setPostMediaUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  const [localCampaignId, setLocalCampaignId] = useState("")
  const objective = "OUTCOME_TRAFFIC"
  const [linkUrl, setLinkUrl] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [headline, setHeadline] = useState("")
  const [primaryText, setPrimaryText] = useState("")
  const [startDate, setStartDate] = useState(isoDate(1))
  const [endDate, setEndDate] = useState(isoDate(31))
  const [cities, setCities] = useState("")
  const [states, setStates] = useState("")
  const [zipCodes, setZipCodes] = useState("")
  const [radiusMiles, setRadiusMiles] = useState("15")
  const [specialCategory, setSpecialCategory] = useState("")

  const profileCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.profile_id === profileId), [campaigns, profileId])
  const approvedCampaigns = profileCampaigns.filter((campaign) => campaign.status === "approved")
  const metaManagedCampaigns = profileCampaigns.filter((campaign) => {
    const metadata = campaign.metadata ?? {}
    return typeof metadata.metaCampaignId === "string" && metadata.metaCampaignId
  })
  const selectedCampaign = profileCampaigns.find((campaign) => campaign.id === localCampaignId)

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Meta action failed.")
    } finally {
      setBusy(false)
    }
  }

  const checkConnection = () =>
    run(async () => {
      const status = await metaApi<{
        configured: boolean
        businessIdConfigured: boolean
        version: string
        marketingVersion?: string
        systemUser?: { name?: string; id?: string } | null
      }>({ action: "status" })
      setConfigured(status.configured && status.businessIdConfigured)
      setVersion(`${status.version}${status.marketingVersion ? ` / ads ${status.marketingVersion}` : ""}`)
      setSystemUserName(status.systemUser?.name || status.systemUser?.id || "")
      if (!status.businessIdConfigured) throw new Error("Meta credentials are present, but META_BUSINESS_ID is missing in Vercel.")
      const discovered = await metaApi<{ adAccounts: MetaAsset[]; pages: MetaAsset[] }>({ action: "list_assets" })
      setAssets(discovered)
      setMessage(`Connected to Meta Graph ${status.version}. Found ${discovered.adAccounts.length} ad account(s) and ${discovered.pages.length} Page(s).`)
    })

  const loadProfileConnection = (nextProfileId: string) => {
    setProfileId(nextProfileId)
    setAdAccountId("")
    setPageId("")
    setConnection({})
    if (!nextProfileId) return
    void run(async () => {
      const payload = await metaApi<{ connection: MetaConnection }>({ action: "get_connection", profileId: nextProfileId })
      setConnection(payload.connection)
      setAdAccountId(payload.connection.adAccountId || "")
      setPageId(payload.connection.pageId || "")
    })
  }

  const saveMapping = () =>
    run(async () => {
      if (!profileId || !adAccountId || !pageId) throw new Error("Select a client, ad account, and Facebook Page.")
      const account = assets.adAccounts.find((item) => (item.account_id || item.id.replace(/^act_/, "")) === adAccountId)
      const page = assets.pages.find((item) => item.id === pageId)
      const instagram = page?.instagram_business_account
      const payload = await metaApi<{ connection: MetaConnection }>({
        action: "save_connection",
        profileId,
        adAccountId,
        adAccountName: account?.name || "",
        pageId,
        pageName: page?.name || "",
        instagramAccountId: instagram?.id || "",
        instagramUsername: instagram?.username || instagram?.name || "",
      })
      setConnection(payload.connection)
      setMessage(`Saved Meta assets for ${clients.find((client) => client.id === profileId)?.label || "client"}.`)
    })

  const syncCampaigns = () =>
    run(async () => {
      if (!profileId) throw new Error("Select a client first.")
      const result = await metaApi<{ imported: number; updated: number }>({ action: "sync_campaigns", profileId })
      setMessage(`Meta sync complete: ${result.imported} imported, ${result.updated} updated.`)
      await onChanged()
    })

  const uploadMedia = async (file: File | null) => {
    if (!file || !supabase || !profileId) return
    setUploading(true)
    setError("")
    try {
      const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg"
      const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
      let bucket = "meta-social-media"
      let { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      })
      // Existing deployments can publish immediately while the dedicated bucket SQL
      // is being applied; about-us-images is already public and admin-writable.
      if (uploadError && /bucket.*not found|not found/i.test(uploadError.message)) {
        bucket = "about-us-images"
        const fallback = await supabase.storage.from(bucket).upload(`meta/${path}`, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        })
        uploadError = fallback.error
      }
      if (uploadError) throw uploadError
      const publicPath = bucket === "meta-social-media" ? path : `meta/${path}`
      const { data } = supabase.storage.from(bucket).getPublicUrl(publicPath)
      setPostMediaUrl(data.publicUrl)
      setImageUrl(data.publicUrl)
      setMessage("Media uploaded and ready for Meta.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Media upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const publish = () =>
    run(async () => {
      if (!profileId) throw new Error("Select a client first.")
      const result = await metaApi<{ results: { channel: string; id: string }[] }>({
        action: "publish",
        profileId,
        channels: postChannels,
        message: postMessage,
        mediaUrl: postMediaUrl,
      })
      setMessage(`Published to ${result.results.map((item) => item.channel).join(" and ")}.`)
      setPostMessage("")
    })

  const createCampaign = () =>
    run(async () => {
      if (!profileId || !selectedCampaign) throw new Error("Select an approved campaign.")
      const payload = await metaApi<{ campaignId: string }>({
        action: "create_campaign",
        profileId,
        localCampaignId: selectedCampaign.id,
        objective,
        budgetCents: selectedCampaign.requested_budget_cents,
        linkUrl,
        imageUrl,
        headline,
        primaryText,
        startTime: `${startDate}T12:00:00-0400`,
        endTime: `${endDate}T12:00:00-0400`,
        specialAdCategories: specialCategory ? [specialCategory] : [],
        targeting: {
          cities: csv(cities),
          states: csv(states),
          zipCodes: csv(zipCodes),
          radiusMiles: Number(radiusMiles) || 15,
        },
      })
      setMessage(`Created Meta campaign ${payload.campaignId} in PAUSED status for final review.`)
      setLocalCampaignId("")
      await onChanged()
    })

  const setCampaignStatus = (campaign: AdCampaignRow, status: "ACTIVE" | "PAUSED") =>
    run(async () => {
      await metaApi({
        action: "set_campaign_status",
        profileId: campaign.profile_id,
        localCampaignId: campaign.id,
        status,
      })
      setMessage(`${campaign.name} is now ${status.toLowerCase()} in Meta.`)
      await onChanged()
    })

  const togglePostChannel = (channel: string) =>
    setPostChannels((current) => (current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]))

  return (
    <section style={panelStyle}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ width: "100%", border: 0, background: "transparent", padding: 0, display: "flex", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: theme.text }}>Meta API — Facebook &amp; Instagram</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Map client assets, sync Ads Insights, publish posts, and create approved campaigns.
          </p>
        </div>
        <span style={{ color: "#64748b" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button type="button" disabled={busy} onClick={() => void checkConnection()} style={secondaryBtn}>
              Test connection &amp; load assets
            </button>
            {configured != null ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: configured ? "#15803d" : "#b91c1c" }}>
                {configured ? `Connected ${version}${systemUserName ? ` · ${systemUserName}` : ""}` : "Configuration incomplete"}
              </span>
            ) : null}
          </div>

          <label style={labelStyle}>
            Client
            <select value={profileId} onChange={(event) => loadProfileConnection(event.target.value)} style={theme.formInput}>
              <option value="">Select a client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </select>
          </label>

          {profileId ? (
            <>
              <div style={subPanelStyle}>
                <h4 style={h4Style}>1. Connect this client’s Meta assets</h4>
                <div style={twoColumnStyle}>
                  <label style={labelStyle}>
                    Meta ad account
                    <select value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)} style={theme.formInput}>
                      <option value="">Select ad account…</option>
                      {assets.adAccounts.map((account) => {
                        const id = account.account_id || account.id.replace(/^act_/, "")
                        return (
                          <option key={account.id} value={id}>
                            {account.name || "Unnamed"} · act_{id}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Facebook Page / linked Instagram
                    <select value={pageId} onChange={(event) => setPageId(event.target.value)} style={theme.formInput}>
                      <option value="">Select Page…</option>
                      {assets.pages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.name || "Unnamed Page"}
                          {page.instagram_business_account?.username ? ` · @${page.instagram_business_account.username}` : " · no linked Instagram"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={busy} onClick={() => void saveMapping()} style={primaryBtn}>
                    Save client asset mapping
                  </button>
                  <button type="button" disabled={busy || !connection.adAccountId} onClick={() => void syncCampaigns()} style={secondaryBtn}>
                    Sync campaigns &amp; spend
                  </button>
                </div>
                {connection.adAccountName || connection.pageName ? (
                  <p style={statusTextStyle}>
                    Connected: {connection.adAccountName || connection.adAccountId} · {connection.pageName || connection.pageId}
                    {connection.instagramUsername ? ` · Instagram @${connection.instagramUsername}` : ""}
                    {connection.lastSyncedAt ? ` · synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : ""}
                  </p>
                ) : null}
              </div>

              <div style={subPanelStyle}>
                <h4 style={h4Style}>2. Publish an organic post</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
                  <label style={checkStyle}>
                    <input type="checkbox" checked={postChannels.includes("facebook")} onChange={() => togglePostChannel("facebook")} />
                    <PlatformBadge id="facebook" size={18} /> Facebook
                  </label>
                  <label style={checkStyle}>
                    <input type="checkbox" checked={postChannels.includes("instagram")} onChange={() => togglePostChannel("instagram")} />
                    <PlatformBadge id="instagram" size={18} /> Instagram
                  </label>
                </div>
                <label style={labelStyle}>
                  Post text / caption
                  <textarea value={postMessage} onChange={(event) => setPostMessage(event.target.value)} rows={4} style={{ ...theme.formInput, resize: "vertical" }} />
                </label>
                <div style={{ ...twoColumnStyle, marginTop: 8 }}>
                  <label style={labelStyle}>
                    Public image URL
                    <input value={postMediaUrl} onChange={(event) => setPostMediaUrl(event.target.value)} placeholder="https://…" style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    Or upload an image
                    <input type="file" accept="image/jpeg,image/png" disabled={uploading} onChange={(event) => void uploadMedia(event.target.files?.[0] ?? null)} style={theme.formInput} />
                  </label>
                </div>
                <button type="button" disabled={busy || uploading} onClick={() => void publish()} style={{ ...primaryBtn, marginTop: 10 }}>
                  {uploading ? "Uploading…" : "Publish now"}
                </button>
              </div>

              <div style={subPanelStyle}>
                <h4 style={h4Style}>3. Create a Meta campaign from a client-approved request</h4>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
                  Tradesman creates the campaign, ad set, creative, and ad as <strong>PAUSED</strong>. Activate only after final review.
                </p>
                <label style={labelStyle}>
                  Approved campaign
                  <select
                    value={localCampaignId}
                    onChange={(event) => {
                      const id = event.target.value
                      const campaign = profileCampaigns.find((item) => item.id === id)
                      setLocalCampaignId(id)
                      setHeadline(campaign?.name || "")
                      setPrimaryText(campaign?.request_details || "")
                    }}
                    style={theme.formInput}
                  >
                    <option value="">Select approved campaign…</option>
                    {approvedCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} · approved {formatUsdFromCents(campaign.requested_budget_cents)}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ ...twoColumnStyle, marginTop: 8 }}>
                  <label style={labelStyle}>
                    Objective
                    <select value={objective} disabled style={theme.formInput}>
                      <option value="OUTCOME_TRAFFIC">Website traffic (initial supported objective)</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Special Ad Category
                    <select value={specialCategory} onChange={(event) => setSpecialCategory(event.target.value)} style={theme.formInput}>
                      <option value="">None</option>
                      <option value="EMPLOYMENT">Employment</option>
                      <option value="HOUSING">Housing</option>
                      <option value="CREDIT">Credit</option>
                      <option value="FINANCIAL_PRODUCTS_SERVICES">Financial products/services</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Start date
                    <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    End date
                    <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    Landing page URL
                    <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    Creative image URL
                    <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" style={theme.formInput} />
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: 8 }}>
                  Headline
                  <input value={headline} onChange={(event) => setHeadline(event.target.value)} style={theme.formInput} />
                </label>
                <label style={{ ...labelStyle, marginTop: 8 }}>
                  Primary ad text
                  <textarea value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
                </label>
                <div style={{ ...twoColumnStyle, marginTop: 8 }}>
                  <label style={labelStyle}>
                    Cities (comma-separated)
                    <input value={cities} onChange={(event) => setCities(event.target.value)} placeholder="Nashville, Franklin" style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    States
                    <input value={states} onChange={(event) => setStates(event.target.value)} placeholder="TN, KY" style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    ZIP codes
                    <input value={zipCodes} onChange={(event) => setZipCodes(event.target.value)} placeholder="37201, 37064" style={theme.formInput} />
                  </label>
                  <label style={labelStyle}>
                    City radius (miles)
                    <input type="number" min={15} value={radiusMiles} onChange={(event) => setRadiusMiles(event.target.value)} style={theme.formInput} />
                  </label>
                </div>
                <button type="button" disabled={busy || !selectedCampaign} onClick={() => void createCampaign()} style={{ ...primaryBtn, marginTop: 10 }}>
                  Create paused Meta campaign
                </button>
              </div>

              {metaManagedCampaigns.length ? (
                <div style={subPanelStyle}>
                  <h4 style={h4Style}>4. Manage Meta campaigns</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    {metaManagedCampaigns.map((campaign) => (
                      <div key={campaign.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 9, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                        <div>
                          <strong style={{ color: theme.text }}>{campaign.name}</strong>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {campaign.status} · spent {formatUsdFromCents(campaign.spent_cents)} · Meta {String(campaign.metadata?.metaCampaignId || "")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" disabled={busy || campaign.status === "active"} onClick={() => void setCampaignStatus(campaign, "ACTIVE")} style={primaryBtn}>
                            Activate
                          </button>
                          <button type="button" disabled={busy || campaign.status === "paused"} onClick={() => void setCampaignStatus(campaign, "PAUSED")} style={secondaryBtn}>
                            Pause
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {message ? <p style={{ margin: 0, color: "#15803d", fontSize: 12, fontWeight: 700 }}>{message}</p> : null}
          {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>{error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

const panelStyle: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff", padding: 14 }
const subPanelStyle: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 10, background: "#f8fafc", padding: 12 }
const h4Style: CSSProperties = { margin: "0 0 10px", fontSize: 14, fontWeight: 900, color: theme.text }
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }
const labelStyle: CSSProperties = { display: "grid", gap: 5, fontSize: 12, fontWeight: 800, color: "#334155" }
const checkStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: theme.text }
const statusTextStyle: CSSProperties = { margin: "8px 0 0", fontSize: 11, color: "#475569" }
const primaryBtn: CSSProperties = { border: 0, borderRadius: 8, background: theme.primary, color: "#fff", padding: "8px 12px", fontWeight: 800, cursor: "pointer" }
const secondaryBtn: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff", color: theme.text, padding: "8px 12px", fontWeight: 800, cursor: "pointer" }
