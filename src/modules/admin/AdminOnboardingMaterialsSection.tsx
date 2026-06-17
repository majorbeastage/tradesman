import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import {
  DEFAULT_ONBOARDING_MATERIALS,
  ONBOARDING_MATERIALS_KEY,
  parseOnboardingMaterials,
  type OnboardingMaterialLink,
  type OnboardingMaterialsValue,
} from "../../types/onboarding-materials"

const fieldLabel: CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 700,
  fontSize: 14,
  color: theme.text,
}

const fieldInput: CSSProperties = {
  ...theme.formInput,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#f8fafc",
  color: theme.text,
}

const sectionTitle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 15,
  fontWeight: 800,
  color: theme.text,
}

function newLink(): OnboardingMaterialLink {
  return { title: "", url: "", description: "" }
}

export default function AdminOnboardingMaterialsSection() {
  const [materials, setMaterials] = useState<OnboardingMaterialsValue>({
    ...DEFAULT_ONBOARDING_MATERIALS,
    links: [...DEFAULT_ONBOARDING_MATERIALS.links],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", ONBOARDING_MATERIALS_KEY)
      .maybeSingle()
    if (err) setError(err.message)
    else if (data?.value) setMaterials(parseOnboardingMaterials(data.value))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setSaving(true)
    setMessage("")
    setError("")
    const { error: upErr } = await supabase.from("platform_settings").upsert(
      { key: ONBOARDING_MATERIALS_KEY, value: materials, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
    setSaving(false)
    if (upErr) setError(upErr.message)
    else setMessage("Onboarding materials saved. New paid signups receive this checklist by email.")
  }

  if (loading) return <p style={{ color: theme.text }}>Loading onboarding materials…</p>

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      style={{ display: "grid", gap: 16, maxWidth: 720, color: theme.text, colorScheme: "light" }}
    >
      <AdminSettingBlock id="admin:onboarding:intro">
        <h2 style={{ margin: "0 0 8px", fontSize: 17, color: theme.text, fontWeight: 800 }}>Onboarding materials</h2>
        <p style={{ margin: 0, fontSize: 14, color: theme.text, lineHeight: 1.55 }}>
          Sent automatically to customers after a successful paid signup. Include SMS-CTA, Twilio number request, Google
          Business Profile, and SMS consent wording links.
        </p>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:onboarding:welcome">
        <label style={fieldLabel}>
          Welcome email subject
          <input
            type="text"
            value={materials.welcome_subject}
            onChange={(e) => setMaterials((m) => ({ ...m, welcome_subject: e.target.value }))}
            style={fieldInput}
          />
        </label>
        <label style={{ ...fieldLabel, marginTop: 12 }}>
          Welcome intro paragraph
          <textarea
            value={materials.welcome_intro}
            onChange={(e) => setMaterials((m) => ({ ...m, welcome_intro: e.target.value }))}
            rows={3}
            style={{ ...fieldInput, resize: "vertical" }}
          />
        </label>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:onboarding:quick_links">
        <h3 style={sectionTitle}>Quick reference URLs</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {(
            [
              ["sms_cta_url", "SMS-CTA guidance page URL"],
              ["onboarding_phone_request_email", "Onboarding phone request email (ops inbox)"],
              ["google_business_profile_url", "Google Business Profile URL"],
              ["sms_consent_guide_url", "SMS consent wording guide URL"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ ...fieldLabel, fontSize: 13 }}>
              {label}
              <input
                type="text"
                value={materials[key]}
                onChange={(e) => setMaterials((m) => ({ ...m, [key]: e.target.value }))}
                style={fieldInput}
              />
            </label>
          ))}
        </div>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:onboarding:links">
        <h3 style={sectionTitle}>Checklist links</h3>
        {materials.links.map((link, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f1f5f9",
            }}
          >
            <label style={{ ...fieldLabel, fontSize: 13 }}>
              Title
              <input
                type="text"
                value={link.title}
                onChange={(e) =>
                  setMaterials((m) => {
                    const links = [...m.links]
                    links[idx] = { ...links[idx], title: e.target.value }
                    return { ...m, links }
                  })
                }
                style={{ ...fieldInput, padding: "8px 10px", borderRadius: 6 }}
              />
            </label>
            <label style={{ ...fieldLabel, fontSize: 13, marginTop: 8 }}>
              URL
              <input
                type="text"
                value={link.url}
                onChange={(e) =>
                  setMaterials((m) => {
                    const links = [...m.links]
                    links[idx] = { ...links[idx], url: e.target.value }
                    return { ...m, links }
                  })
                }
                style={{ ...fieldInput, padding: "8px 10px", borderRadius: 6 }}
              />
            </label>
            <label style={{ ...fieldLabel, fontSize: 13, marginTop: 8 }}>
              Description
              <input
                type="text"
                value={link.description}
                onChange={(e) =>
                  setMaterials((m) => {
                    const links = [...m.links]
                    links[idx] = { ...links[idx], description: e.target.value }
                    return { ...m, links }
                  })
                }
                style={{ ...fieldInput, padding: "8px 10px", borderRadius: 6 }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setMaterials((m) => ({ ...m, links: m.links.filter((_, i) => i !== idx) }))
              }
              style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              Remove link
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMaterials((m) => ({ ...m, links: [...m.links, newLink()] }))}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#f8fafc",
            color: theme.text,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Add link
        </button>
      </AdminSettingBlock>

      {error ? <p style={{ color: "#b91c1c", margin: 0, fontWeight: 600 }}>{error}</p> : null}
      {message ? <p style={{ color: "#059669", margin: 0, fontWeight: 600 }}>{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        style={{
          padding: "12px 20px",
          background: theme.primary,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
          maxWidth: 200,
        }}
      >
        {saving ? "Saving…" : "Save materials"}
      </button>
    </form>
  )
}
