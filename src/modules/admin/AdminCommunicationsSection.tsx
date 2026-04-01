import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"

type ChannelRow = {
  id: string
  user_id: string
  provider: string
  channel_kind: "voice_sms" | "email"
  provider_sid: string | null
  friendly_name: string | null
  public_address: string
  forward_to_phone: string | null
  forward_to_email: string | null
  voice_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  voicemail_enabled: boolean
  voicemail_mode: "summary" | "full_transcript"
  active: boolean
}

type Props = {
  selectedUserId: string | null
  selectedUserLabel: string
  allUsersId: string
}

function emptyChannel(userId: string): ChannelRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    user_id: userId,
    provider: "twilio",
    channel_kind: "voice_sms",
    provider_sid: "",
    friendly_name: "",
    public_address: "",
    forward_to_phone: "",
    forward_to_email: "",
    voice_enabled: true,
    sms_enabled: true,
    email_enabled: false,
    voicemail_enabled: true,
    voicemail_mode: "summary",
    active: true,
  }
}

export default function AdminCommunicationsSection({ selectedUserId, selectedUserLabel, allUsersId }: Props) {
  const [rows, setRows] = useState<ChannelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!supabase || !selectedUserId || selectedUserId === allUsersId) {
      setRows([])
      return
    }
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from("client_communication_channels")
          .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
          .eq("user_id", selectedUserId)
          .order("created_at", { ascending: true })
        if (err) setError(err.message)
        setRows(((data as ChannelRow[] | null) ?? []).map((r) => ({ ...r })))
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedUserId, allUsersId])

  function updateRow(id: string, patch: Partial<ChannelRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function saveAll() {
    if (!supabase || !selectedUserId || selectedUserId === allUsersId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const existingRows = rows.filter((r) => !r.id.startsWith("new-"))
      const newRows = rows.filter((r) => r.id.startsWith("new-"))
      for (const row of existingRows) {
        const { error: err } = await supabase
          .from("client_communication_channels")
          .update({
            provider: row.provider,
            channel_kind: row.channel_kind,
            provider_sid: row.provider_sid || null,
            friendly_name: row.friendly_name || null,
            public_address: row.public_address.trim(),
            forward_to_phone: row.forward_to_phone || null,
            forward_to_email: row.forward_to_email || null,
            voice_enabled: row.voice_enabled,
            sms_enabled: row.sms_enabled,
            email_enabled: row.email_enabled,
            voicemail_enabled: row.voicemail_enabled,
            voicemail_mode: row.voicemail_mode,
            active: row.active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (err) throw err
      }
      if (newRows.length > 0) {
        const payload = newRows.map((row) => ({
          user_id: selectedUserId,
          provider: row.provider,
          channel_kind: row.channel_kind,
          provider_sid: row.provider_sid || null,
          friendly_name: row.friendly_name || null,
          public_address: row.public_address.trim(),
          forward_to_phone: row.forward_to_phone || null,
          forward_to_email: row.forward_to_email || null,
          voice_enabled: row.voice_enabled,
          sms_enabled: row.sms_enabled,
          email_enabled: row.email_enabled,
          voicemail_enabled: row.voicemail_enabled,
          voicemail_mode: row.voicemail_mode,
          active: row.active,
        }))
        const { error: err } = await supabase.from("client_communication_channels").insert(payload)
        if (err) throw err
      }
      setMessage("Communications settings saved.")
      const { data, error: reloadErr } = await supabase
        .from("client_communication_channels")
        .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
        .eq("user_id", selectedUserId)
        .order("created_at", { ascending: true })
      if (reloadErr) throw reloadErr
      setRows((data as ChannelRow[] | null) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeRow(row: ChannelRow) {
    if (!supabase) return
    if (row.id.startsWith("new-")) {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      return
    }
    if (!window.confirm(`Remove ${row.public_address || "this channel"}?`)) return
    const { error: err } = await supabase.from("client_communication_channels").delete().eq("id", row.id)
    if (err) {
      setError(err.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  if (selectedUserId === allUsersId) {
    return (
      <AdminSettingBlock id="admin:communications:select_user">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Communications</h1>
        <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
          Select a single user in the left sidebar to manage Twilio/Resend routing for that client.
        </p>
      </AdminSettingBlock>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminSettingBlock id="admin:communications:header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Communications for {selectedUserLabel}</h1>
            <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
              Manage phone number routing and voicemail behavior live from Supabase. No redeploy needed for new numbers.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => selectedUserId && setRows((prev) => [...prev, emptyChannel(selectedUserId)])} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
              Add channel
            </button>
            <button type="button" onClick={() => void saveAll()} disabled={saving} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Saving..." : "Save communications"}
            </button>
          </div>
        </div>
        {message && <p style={{ color: "#059669", marginBottom: 0 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:communications:channels">
        {loading ? (
          <p style={{ margin: 0, color: theme.text }}>Loading communication channels...</p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0, color: theme.text, opacity: 0.8 }}>No channels yet. Add the client's Twilio number and forwarding destination above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((row) => (
              <div key={row.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Public number / address</span>
                    <input value={row.public_address} onChange={(e) => updateRow(row.id, { public_address: e.target.value })} style={theme.formInput} placeholder="+15551234567" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone</span>
                    <input value={row.forward_to_phone ?? ""} onChange={(e) => updateRow(row.id, { forward_to_phone: e.target.value })} style={theme.formInput} placeholder="+15557654321" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to email</span>
                    <input value={row.forward_to_email ?? ""} onChange={(e) => updateRow(row.id, { forward_to_email: e.target.value })} style={theme.formInput} placeholder="future@email.com" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Provider SID</span>
                    <input value={row.provider_sid ?? ""} onChange={(e) => updateRow(row.id, { provider_sid: e.target.value })} style={theme.formInput} placeholder="PN..." />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Friendly name</span>
                    <input value={row.friendly_name ?? ""} onChange={(e) => updateRow(row.id, { friendly_name: e.target.value })} style={theme.formInput} placeholder="Main line" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Voicemail mode</span>
                    <select value={row.voicemail_mode} onChange={(e) => updateRow(row.id, { voicemail_mode: e.target.value as ChannelRow["voicemail_mode"] })} style={theme.formInput}>
                      <option value="summary">Summary</option>
                      <option value="full_transcript">Full transcript</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
                  {[
                    ["voice_enabled", "Voice enabled"],
                    ["sms_enabled", "SMS enabled"],
                    ["voicemail_enabled", "Twilio voicemail enabled"],
                    ["active", "Active"],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13 }}>
                      <input type="checkbox" checked={Boolean(row[key as keyof ChannelRow])} onChange={(e) => updateRow(row.id, { [key]: e.target.checked } as Partial<ChannelRow>)} />
                      {label}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => void removeRow(row)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer" }}>
                    Remove channel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSettingBlock>
    </div>
  )
}
