import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  BUSINESS_WEB_PROFILE_TAGLINE_MAX,
  BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX,
  businessWebProfilePublicUrl,
  businessWebProfileSlugFromName,
  emptyBusinessPublicProfileSettings,
  mergeBusinessPublicProfileMetadata,
  parseBusinessPublicProfileSettings,
  type BusinessPublicProfileSettings,
} from "../lib/businessPublicProfile"

type Props = {
  profileUserId: string
  /** Saved business name only — updates after Contact & profile save, not on every keystroke. */
  businessNameForSlug: string
  companyLogoUrl: string | null
}

export function BusinessWebProfilePanel({ profileUserId, businessNameForSlug, companyLogoUrl }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [settings, setSettings] = useState<BusinessPublicProfileSettings>(() => emptyBusinessPublicProfileSettings())
  const [slug, setSlug] = useState("")

  const publicUrl = useMemo(() => {
    if (!slug) return ""
    return businessWebProfilePublicUrl(slug, typeof window !== "undefined" ? window.location.origin : undefined)
  }, [slug])

  const load = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    setError("")
    try {
      const { data, error: qErr } = await supabase
        .from("profiles")
        .select("display_name, business_web_profile_slug, metadata")
        .eq("id", profileUserId)
        .maybeSingle()
      if (qErr) throw qErr
      const savedName = (businessNameForSlug || data?.display_name || "").trim()
      setSlug(
        typeof data?.business_web_profile_slug === "string" && data.business_web_profile_slug.trim()
          ? data.business_web_profile_slug.trim().toLowerCase()
          : businessWebProfileSlugFromName(savedName),
      )
      setSettings(parseBusinessPublicProfileSettings(data?.metadata))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [profileUserId, businessNameForSlug])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const savedName = businessNameForSlug.trim()
    if (!savedName) return
    setSlug(businessWebProfileSlugFromName(savedName))
  }, [businessNameForSlug])

  async function persist(next: BusinessPublicProfileSettings) {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const name = businessNameForSlug.trim()
      const nextSlug = businessWebProfileSlugFromName(name)
      if (!nextSlug || nextSlug.length < 3) {
        throw new Error("Save a business name (at least 3 letters/numbers) in Contact & profile before publishing.")
      }

      const { data: metaRow, error: metaErr } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (metaErr) throw metaErr
      const prevMeta =
        metaRow?.metadata && typeof metaRow.metadata === "object" && !Array.isArray(metaRow.metadata)
          ? { ...(metaRow.metadata as Record<string, unknown>) }
          : {}

      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          metadata: mergeBusinessPublicProfileMetadata(prevMeta, next, nextSlug),
          business_web_profile_slug: next.enabled ? nextSlug : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileUserId)

      if (upErr) {
        if (/business_web_profile_slug|column.*does not exist/i.test(upErr.message)) {
          const { error: metaOnlyErr } = await supabase
            .from("profiles")
            .update({
              metadata: mergeBusinessPublicProfileMetadata(prevMeta, next, nextSlug),
              updated_at: new Date().toISOString(),
            })
            .eq("id", profileUserId)
          if (metaOnlyErr) throw metaOnlyErr
        } else if (/duplicate|unique/i.test(upErr.message)) {
          throw new Error(
            "Another business already uses this web address. Adjust your business name slightly (it must be unique on tradesman-us.com).",
          )
        }
        throw upErr
      }
      setSettings(next)
      setSlug(nextSlug)
      setMessage(next.enabled ? "Public business profile saved and published." : "Business web profile saved (not published).")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleWorkPhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !supabase) return
    if (settings.workPhotoUrls.length >= BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX) {
      setError(`You can upload up to ${BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX} work photos.`)
      return
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.")
      return
    }
    setUploadingPhoto(true)
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const path = `${profileUserId}/web-profile/work_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) throw new Error("Upload failed.")
      const next = { ...settings, workPhotoUrls: [...settings.workPhotoUrls, url] }
      setSettings(next)
      await persist(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingPhoto(false)
    }
  }

  function removeWorkPhoto(url: string) {
    const next = { ...settings, workPhotoUrls: settings.workPhotoUrls.filter((u) => u !== url) }
    setSettings(next)
    void persist(next)
  }

  function copyPublicUrl() {
    if (!publicUrl) return
    void navigator.clipboard?.writeText(publicUrl).then(
      () => setMessage("Public profile URL copied."),
      () => setMessage(publicUrl),
    )
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading business web profile…</p>
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
        Publish a simple public page you can list on Google Business Profile, social media, and your marketing. The address
        is always <strong>tradesman-us.com/your-business-name</strong> (from your saved business name — not editable here).
      </p>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
        />
        Publish public business profile
      </label>

      <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>Your public web address</div>
        <div
          style={{
            minHeight: 44,
            fontSize: 14,
            fontWeight: 800,
            color: "#0f766e",
            wordBreak: "break-all",
            lineHeight: 1.45,
          }}
        >
          {publicUrl || "Save business name in Contact & profile (min. 3 characters)"}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
          Updates when you save Contact & profile — not while you are still typing.
        </p>
        <button
          type="button"
          onClick={copyPublicUrl}
          disabled={!publicUrl}
          style={{
            marginTop: 10,
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: publicUrl ? "#0f172a" : "#cbd5e1",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: publicUrl ? "pointer" : "not-allowed",
          }}
        >
          Copy URL
        </button>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            width: 96,
            height: 72,
            borderRadius: 12,
            border: `2px solid ${theme.border}`,
            overflow: "hidden",
            background: "#f1f5f9",
            flexShrink: 0,
          }}
        >
          {companyLogoUrl ? (
            <img src={companyLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#94a3b8", padding: 6, textAlign: "center" }}>
              Company logo
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Public profile image</div>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45, maxWidth: 420 }}>
            Uses your <strong>company logo</strong> from Contact & profile. Upload it there — not your personal profile photo.
          </p>
        </div>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Short description ({BUSINESS_WEB_PROFILE_TAGLINE_MAX} characters max)</span>
        <textarea
          value={settings.tagline}
          maxLength={BUSINESS_WEB_PROFILE_TAGLINE_MAX}
          rows={2}
          onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
          placeholder="Brief tagline for Google Business and social profiles"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{settings.tagline.length}/{BUSINESS_WEB_PROFILE_TAGLINE_MAX}</span>
      </label>

      <fieldset style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, margin: 0 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 6px" }}>Contact us (public)</legend>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={settings.showPhone} onChange={(e) => setSettings((s) => ({ ...s, showPhone: e.target.checked }))} />
            Show business phone (your advertised Twilio line)
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={settings.showEmail} onChange={(e) => setSettings((s) => ({ ...s, showEmail: e.target.checked }))} />
            Show business email
          </label>
          {settings.showEmail ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginLeft: 24, fontSize: 13 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="web-profile-email"
                  checked={settings.emailSource === "tradesman"}
                  onChange={() => setSettings((s) => ({ ...s, emailSource: "tradesman" }))}
                />
                Option A — Tradesman email (@tradesman-us.com)
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="web-profile-email"
                  checked={settings.emailSource === "custom"}
                  onChange={() => setSettings((s) => ({ ...s, emailSource: "custom" }))}
                />
                Option B — Custom domain email
              </label>
            </div>
          ) : null}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={settings.showAddress} onChange={(e) => setSettings((s) => ({ ...s, showAddress: e.target.checked }))} />
            Show business address
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={settings.showServiceArea} onChange={(e) => setSettings((s) => ({ ...s, showServiceArea: e.target.checked }))} />
            Show service area (radius from address)
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.showBusinessHours}
              onChange={(e) => setSettings((s) => ({ ...s, showBusinessHours: e.target.checked }))}
            />
            Show business hours
          </label>
        </div>
      </fieldset>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          Work photos ({settings.workPhotoUrls.length}/{BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {settings.workPhotoUrls.map((url) => (
            <div key={url} style={{ position: "relative" }}>
              <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${theme.border}` }} />
              <button
                type="button"
                onClick={() => removeWorkPhoto(url)}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {settings.workPhotoUrls.length < BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX ? (
          <label>
            <span style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Add work photo
            </span>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => void handleWorkPhotoUpload(e)} disabled={uploadingPhoto} />
          </label>
        ) : null}
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>About us</span>
        <textarea
          value={settings.aboutUs}
          rows={5}
          onChange={(e) => setSettings((s) => ({ ...s, aboutUs: e.target.value }))}
          placeholder="Longer story shown at the bottom of your public profile"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
      </label>

      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      {message ? <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>{message}</p> : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void persist(settings)}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: theme.primary,
          color: "#fff",
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
          justifySelf: "start",
        }}
      >
        {saving ? "Saving…" : "Save business web profile"}
      </button>
    </div>
  )
}
