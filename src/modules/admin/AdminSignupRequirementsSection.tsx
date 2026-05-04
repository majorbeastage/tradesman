import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"
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

function CollapsibleLegalBlock({
  sectionId,
  title,
  open,
  onToggle,
  children,
}: {
  sectionId: string
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <AdminSettingBlock id={sectionId}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 0,
          marginBottom: open ? 12 : 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, color: theme.text }}>{title}</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, flexShrink: 0 }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? children : null}
    </AdminSettingBlock>
  )
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
  const [privacyOpen, setPrivacyOpen] = useState(true)
  const [termsOpen, setTermsOpen] = useState(true)
  const [smsOpen, setSmsOpen] = useState(true)

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
        { key: SMS_CONSENT_SETTINGS_KEY, value: sms, updated_at: now },
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
              <code style={{ fontSize: 12 }}>signup_extras</code>), and edit Privacy, Terms, and SMS consent copy. Public pages{" "}
              <code style={{ fontSize: 12 }}>/privacy</code>, <code style={{ fontSize: 12 }}>/terms</code>, and{" "}
              <code style={{ fontSize: 12 }}>/sms</code> read from the same saved JSON (including crawlable HTML from the API). Saving
              requires an admin account (<code style={{ fontSize: 12 }}>is_admin()</code> on <code style={{ fontSize: 12 }}>platform_settings</code>). Run{" "}
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
            style={secondaryOutlineButton}
          >
            + Add field
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

      <CollapsibleLegalBlock
        sectionId="admin:signup:privacy"
        title="Privacy page (/privacy)"
        open={privacyOpen}
        onToggle={() => setPrivacyOpen((v) => !v)}
      >
        <p style={{ fontSize: 13, color: theme.text, opacity: 0.8, margin: "0 0 12px", lineHeight: 1.5 }}>
          Same JSON as the public <code style={{ fontSize: 12 }}>/privacy</code> page and crawlable HTML. Leave optional fields blank to use product defaults where noted.
        </p>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Hero line (small caps above title; blank = “Tradesman Systems”)
          <input
            value={privacy.hero_kicker ?? ""}
            onChange={(e) => setPrivacy((p) => ({ ...p, hero_kicker: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={privacy.title} onChange={(e) => setPrivacy((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle
          <textarea value={privacy.subtitle} onChange={(e) => setPrivacy((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice heading (optional card above body; leave heading and body empty to hide)
          <input
            value={privacy.notice_title ?? ""}
            onChange={(e) => setPrivacy((p) => ({ ...p, notice_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice body
          <textarea
            value={privacy.notice_body ?? ""}
            onChange={(e) => setPrivacy((p) => ({ ...p, notice_body: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 72, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Main body
          <textarea value={privacy.body} onChange={(e) => setPrivacy((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 220, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Footer note under nav (plain text; blank = default line with link to SMS consent)
          <textarea
            value={privacy.footer_note ?? ""}
            onChange={(e) => setPrivacy((p) => ({ ...p, footer_note: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 56, display: "block" }}
          />
        </label>
      </CollapsibleLegalBlock>

      <CollapsibleLegalBlock
        sectionId="admin:signup:terms"
        title="Terms page (/terms)"
        open={termsOpen}
        onToggle={() => setTermsOpen((v) => !v)}
      >
        <p style={{ fontSize: 13, color: theme.text, opacity: 0.8, margin: "0 0 12px", lineHeight: 1.5 }}>
          Same JSON as the public <code style={{ fontSize: 12 }}>/terms</code> page and crawlable HTML.
        </p>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Hero line (blank = “Tradesman Systems”)
          <input
            value={terms.hero_kicker ?? ""}
            onChange={(e) => setTerms((p) => ({ ...p, hero_kicker: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={terms.title} onChange={(e) => setTerms((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle
          <textarea value={terms.subtitle} onChange={(e) => setTerms((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice heading (optional; hide when heading and body both empty)
          <input
            value={terms.notice_title ?? ""}
            onChange={(e) => setTerms((p) => ({ ...p, notice_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice body
          <textarea
            value={terms.notice_body ?? ""}
            onChange={(e) => setTerms((p) => ({ ...p, notice_body: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 72, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Main body
          <textarea value={terms.body} onChange={(e) => setTerms((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 220, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Footer note under nav (blank = default SMS strapline)
          <textarea
            value={terms.footer_note ?? ""}
            onChange={(e) => setTerms((p) => ({ ...p, footer_note: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 56, display: "block" }}
          />
        </label>
      </CollapsibleLegalBlock>

      <CollapsibleLegalBlock
        sectionId="admin:signup:sms"
        title="SMS consent (/sms and /sms-consent)"
        open={smsOpen}
        onToggle={() => setSmsOpen((v) => !v)}
      >
        <p style={{ fontSize: 13, color: theme.text, opacity: 0.8, margin: "0 0 12px", lineHeight: 1.5 }}>
          Order matches the public page: hero → notice (optional) → details body → consent box → samples → footer. Clear both notice fields to hide that card. Section titles fall back to sensible defaults when left blank.
        </p>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Hero line (blank = “Tradesman Systems”)
          <input
            value={sms.hero_kicker ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, hero_kicker: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Title
          <input value={sms.title} onChange={(e) => setSms((p) => ({ ...p, title: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Subtitle (under title in hero)
          <textarea value={sms.subtitle} onChange={(e) => setSms((p) => ({ ...p, subtitle: e.target.value }))} style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 64, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Hero “last updated” line (optional; e.g. Last updated: May 4, 2026)
          <input
            value={sms.hero_last_updated ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, hero_last_updated: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice heading (blank with blank body = hide notice card)
          <input
            value={sms.notice_title ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, notice_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Notice body
          <textarea
            value={sms.notice_body ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, notice_body: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 80, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Details section title (blank = “Details”)
          <input
            value={sms.details_section_title ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, details_section_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Details body (main narrative; pre-wrap)
          <textarea value={sms.body} onChange={(e) => setSms((p) => ({ ...p, body: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 220, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Consent section title (blank = default consent heading)
          <input
            value={sms.consent_section_title ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, consent_section_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Consent language (highlighted block)
          <textarea value={sms.consent_statement} onChange={(e) => setSms((p) => ({ ...p, consent_statement: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 100, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Sample section title (blank = default)
          <input
            value={sms.sample_section_title ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, sample_section_title: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", maxWidth: 560, marginTop: 6, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Sample section intro (line above sample block)
          <textarea
            value={sms.sample_section_intro ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, sample_section_intro: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 48, display: "block" }}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 10, color: theme.text }}>
          Sample messages (examples; pre-wrap)
          <textarea value={sms.sample_message} onChange={(e) => setSms((p) => ({ ...p, sample_message: e.target.value }))} style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 120, display: "block" }} />
        </label>
        <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
          Footer note under nav (plain text; blank = default Privacy/Terms links line)
          <textarea
            value={sms.footer_note ?? ""}
            onChange={(e) => setSms((p) => ({ ...p, footer_note: e.target.value }))}
            style={{ ...theme.formInput, width: "100%", marginTop: 6, minHeight: 56, display: "block" }}
          />
        </label>
      </CollapsibleLegalBlock>
    </div>
  )
}
