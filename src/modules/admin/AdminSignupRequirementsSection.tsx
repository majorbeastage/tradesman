import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import {
  DEFAULT_PRIVACY_PAGE,
  DEFAULT_SMS_CONSENT_PAGE,
  DEFAULT_TERMS_PAGE,
  PRIVACY_SETTINGS_KEY,
  SMS_CONSENT_SETTINGS_KEY,
  TERMS_SETTINGS_KEY,
  parseSimpleLegalPage,
  parseSmsConsentLegalPage,
  type SimpleLegalPage,
  type SmsConsentLegalPage,
} from "../../types/legal-pages"
import {
  DEFAULT_SIGNUP_REQUIREMENTS,
  SIGNUP_REQUIREMENTS_KEY,
  parseSignupRequirements,
  type SignupBuiltInFieldKey,
  type SignupCustomField,
  type SignupRequirementsValue,
} from "../../types/signup-requirements"

const FIELD_LABELS: Record<SignupBuiltInFieldKey, string> = {
  email: "Login email",
  password: "Password",
  display_name: "Business / display name",
  website_url: "Website URL",
  primary_phone: "Primary phone",
  best_contact_phone: "Best contact phone",
  address: "Business address (lines, city, state, zip)",
  timezone: "Timezone",
}

const LOCKED_REQUIRED: SignupBuiltInFieldKey[] = ["email", "password"]

function newCustomField(): SignupCustomField {
  return { id: `field-${crypto.randomUUID().slice(0, 8)}`, label: "", required: false }
}

export default function AdminSignupRequirementsSection() {
  const [signup, setSignup] = useState<SignupRequirementsValue>({
    ...DEFAULT_SIGNUP_REQUIREMENTS,
    fields: { ...DEFAULT_SIGNUP_REQUIREMENTS.fields },
    custom_fields: [...DEFAULT_SIGNUP_REQUIREMENTS.custom_fields],
  })
  const [privacy, setPrivacy] = useState<SimpleLegalPage>({ ...DEFAULT_PRIVACY_PAGE })
  const [terms, setTerms] = useState<SimpleLegalPage>({ ...DEFAULT_TERMS_PAGE })
  const [sms, setSms] = useState<SmsConsentLegalPage>({ ...DEFAULT_SMS_CONSENT_PAGE })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

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
        .select("key, value")
        .in("key", [SIGNUP_REQUIREMENTS_KEY, PRIVACY_SETTINGS_KEY, TERMS_SETTINGS_KEY, SMS_CONSENT_SETTINGS_KEY])
      if (err) throw err
      const byKey = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
      setSignup(parseSignupRequirements(byKey.get(SIGNUP_REQUIREMENTS_KEY)))
      setPrivacy(parseSimpleLegalPage(byKey.get(PRIVACY_SETTINGS_KEY), DEFAULT_PRIVACY_PAGE))
      setTerms(parseSimpleLegalPage(byKey.get(TERMS_SETTINGS_KEY), DEFAULT_TERMS_PAGE))
      setSms(parseSmsConsentLegalPage(byKey.get(SMS_CONSENT_SETTINGS_KEY), DEFAULT_SMS_CONSENT_PAGE))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!supabase) return
    setSaving(true)
    setMessage("")
    setError("")
    const now = new Date().toISOString()
    try {
      const rows = [
        { key: SIGNUP_REQUIREMENTS_KEY, value: signup, updated_at: now },
        { key: PRIVACY_SETTINGS_KEY, value: privacy, updated_at: now },
        { key: TERMS_SETTINGS_KEY, value: terms, updated_at: now },
        {
          key: SMS_CONSENT_SETTINGS_KEY,
          value: {
            title: sms.title,
            subtitle: sms.subtitle,
            body: sms.body,
            consent_statement: sms.consent_statement,
            sample_message: sms.sample_message,
          },
          updated_at: now,
        },
      ]
      const { error: err } = await supabase.from("platform_settings").upsert(rows, { onConflict: "key" })
      if (err) throw err
      setMessage("Sign up requirements and legal pages saved.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function setFieldReq(key: SignupBuiltInFieldKey, req: SignupRequirementsValue["fields"][SignupBuiltInFieldKey]) {
    if (LOCKED_REQUIRED.includes(key)) return
    setSignup((prev) => ({ ...prev, fields: { ...prev.fields, [key]: req } }))
  }

  function updateCustomField(index: number, patch: Partial<SignupCustomField>) {
    setSignup((prev) => {
      const custom_fields = [...prev.custom_fields]
      const cur = custom_fields[index]
      if (!cur) return prev
      custom_fields[index] = { ...cur, ...patch }
      return { ...prev, custom_fields }
    })
  }

  if (loading) {
    return (
      <AdminSettingBlock id="admin:signup:loading">
        <p style={{ color: theme.text }}>Loading…</p>
      </AdminSettingBlock>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminSettingBlock id="admin:signup:header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Sign up requirements</h1>
            <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.55, fontSize: 14 }}>
              Control which fields are required on the public sign-up form, add custom questions (saved on the profile as{" "}
              <code style={{ fontSize: 12 }}>signup_extras</code>), and edit Privacy, Terms, and SMS consent copy. Run{" "}
              <code style={{ fontSize: 12 }}>supabase-public-legal-signup.sql</code> once so anon users can read these keys and{" "}
              <code style={{ fontSize: 12 }}>signup_extras</code> exists on <code style={{ fontSize: 12 }}>profiles</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "white",
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>
        {message ? <p style={{ color: "#059669", margin: "12px 0 0" }}>{message}</p> : null}
        {error ? <p style={{ color: "#b91c1c", margin: "12px 0 0" }}>{error}</p> : null}
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:fields">
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: theme.text }}>Built-in fields</h2>
        <p style={{ fontSize: 13, color: theme.text, opacity: 0.8, margin: "0 0 12px" }}>
          Login email and password are always required for account creation.
        </p>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          {(Object.keys(FIELD_LABELS) as SignupBuiltInFieldKey[]).map((key) => {
            const locked = LOCKED_REQUIRED.includes(key)
            return (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14, color: theme.text }}
              >
                <span>{FIELD_LABELS[key]}</span>
                <select
                  value={signup.fields[key]}
                  disabled={locked}
                  onChange={(e) => setFieldReq(key, e.target.value as "required" | "optional")}
                  style={{ ...theme.formInput, opacity: locked ? 0.65 : 1, minWidth: 140 }}
                >
                  <option value="required">Required</option>
                  <option value="optional">Optional</option>
                </select>
              </label>
            )
          })}
        </div>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:consent">
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: theme.text }}>Legal links on sign-up</h2>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: theme.text }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.show_terms_link}
              onChange={(e) => setSignup((p) => ({ ...p, show_terms_link: e.target.checked }))}
            />
            Show Terms &amp; Conditions link
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.require_terms_ack}
              onChange={(e) => setSignup((p) => ({ ...p, require_terms_ack: e.target.checked }))}
            />
            Require checkbox: agree to Terms
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.show_privacy_link}
              onChange={(e) => setSignup((p) => ({ ...p, show_privacy_link: e.target.checked }))}
            />
            Show Privacy (Settings) link
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.require_privacy_ack}
              onChange={(e) => setSignup((p) => ({ ...p, require_privacy_ack: e.target.checked }))}
            />
            Require checkbox: acknowledge Privacy
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.show_sms_consent_link}
              onChange={(e) => setSignup((p) => ({ ...p, show_sms_consent_link: e.target.checked }))}
            />
            Show SMS Consent link
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={signup.require_sms_consent_ack}
              onChange={(e) => setSignup((p) => ({ ...p, require_sms_consent_ack: e.target.checked }))}
            />
            Require checkbox: SMS consent
          </label>
        </div>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:custom">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: theme.text }}>Additional fields</h2>
          <button
            type="button"
            onClick={() => setSignup((p) => ({ ...p, custom_fields: [...p.custom_fields, newCustomField()] }))}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontWeight: 600 }}
          >
            Add field
          </button>
        </div>
        {signup.custom_fields.length === 0 ? (
          <p style={{ color: theme.text, opacity: 0.75, margin: 0 }}>No custom fields. Values are stored under each profile&apos;s signup_extras JSON.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {signup.custom_fields.map((field, index) => (
              <div
                key={field.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 10, alignItems: "end", border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, background: "#fff" }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: theme.text }}>
                  Label
                  <input
                    value={field.label}
                    onChange={(e) => updateCustomField(index, { label: e.target.value })}
                    style={theme.formInput}
                    placeholder="e.g. License number"
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: theme.text }}>
                  <span>Required</span>
                  <select
                    value={field.required ? "yes" : "no"}
                    onChange={(e) => updateCustomField(index, { required: e.target.value === "yes" })}
                    style={theme.formInput}
                  >
                    <option value="no">Optional</option>
                    <option value="yes">Required</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setSignup((p) => ({ ...p, custom_fields: p.custom_fields.filter((_, i) => i !== index) }))}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", cursor: "pointer", height: 40 }}
                >
                  Remove
                </button>
                <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 11, color: theme.text, opacity: 0.65 }}>
                  Field id: <code>{field.id}</code>
                </p>
              </div>
            ))}
          </div>
        )}
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:privacy">
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: theme.text }}>Privacy page (/privacy)</h2>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={privacy.title} onChange={(e) => setPrivacy((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle
          <textarea value={privacy.subtitle} onChange={(e) => setPrivacy((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Body
          <textarea value={privacy.body} onChange={(e) => setPrivacy((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 200, display: "block" }} />
        </label>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:terms">
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: theme.text }}>Terms page (/terms)</h2>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={terms.title} onChange={(e) => setTerms((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle
          <textarea value={terms.subtitle} onChange={(e) => setTerms((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Body
          <textarea value={terms.body} onChange={(e) => setTerms((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 200, display: "block" }} />
        </label>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:signup:sms">
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: theme.text }}>SMS consent page (/sms-consent)</h2>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={sms.title} onChange={(e) => setSms((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle
          <textarea value={sms.subtitle} onChange={(e) => setSms((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Consent language (highlighted block)
          <textarea value={sms.consent_statement} onChange={(e) => setSms((p) => ({ ...p, consent_statement: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 100, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Sample message
          <textarea value={sms.sample_message} onChange={(e) => setSms((p) => ({ ...p, sample_message: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 72, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Remaining body (pre-wrap; optional sections, bullet lines, etc.)
          <textarea value={sms.body} onChange={(e) => setSms((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 180, display: "block" }} />
        </label>
      </AdminSettingBlock>
    </div>
  )
}
