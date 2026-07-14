import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { BusinessProfileTemplatePicker } from "./BusinessProfileTemplatePicker"
import { PhotoLightbox } from "./PhotoLightbox"
import {
  BUSINESS_WEB_PROFILE_TAGLINE_MAX,
  BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX,
  DEFAULT_BUSINESS_PROFILE_THEME,
  businessWebProfilePublicUrl,
  businessWebProfileSlugFromName,
  emptyBusinessPublicProfileSettings,
  mergeBusinessPublicProfileMetadata,
  parseBusinessPublicProfileSettings,
  type BusinessPublicProfileSettings,
} from "../lib/businessPublicProfile"
import { mergeSocialPresenceIntoMetadata, readSocialPresenceFromMetadata } from "../lib/socialPresenceSync"

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
  const [publicCacheBust, setPublicCacheBust] = useState(() => Date.now())
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

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
      const parsed = parseBusinessPublicProfileSettings(data?.metadata)
      const social = readSocialPresenceFromMetadata(data?.metadata)
      setSettings({
        ...parsed,
        facebookUrl: parsed.facebookUrl || social.facebook,
        instagramUrl: parsed.instagramUrl || social.instagram,
      })
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

      const nextMetaRaw = mergeBusinessPublicProfileMetadata(prevMeta, next, nextSlug)
      const nextMeta = mergeSocialPresenceIntoMetadata(nextMetaRaw, {
        facebook: next.facebookUrl,
        instagram: next.instagramUrl,
      })

      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          metadata: nextMeta,
          business_web_profile_slug: next.enabled ? nextSlug : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileUserId)

      if (upErr) {
        if (/business_web_profile_slug|column.*does not exist/i.test(upErr.message)) {
          const { error: metaOnlyErr } = await supabase
            .from("profiles")
            .update({
              metadata: nextMeta,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profileUserId)
          if (metaOnlyErr) throw metaOnlyErr
        } else if (/duplicate|unique/i.test(upErr.message)) {
          throw new Error(
            "Another business already uses this web address. Adjust your business name slightly (it must be unique on tradesman-us.com).",
          )
        } else {
          throw upErr
        }
      }
      setSettings(next)
      setSlug(nextSlug)
      setPublicCacheBust(Date.now())
      await load()
      setMessage(
        next.enabled
          ? "Public business profile saved and published. Open Preview to see changes (allow a few seconds if you viewed the page recently)."
          : "Business web profile saved (not published).",
      )
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
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
        />
        Publish public business profile
      </label>
      {!settings.enabled ? (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
          Not published — visitors will see “profile not found” until you enable publish and save.
        </p>
      ) : null}

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
        </div>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Short description ({BUSINESS_WEB_PROFILE_TAGLINE_MAX} characters max)</span>
        <textarea
          value={settings.tagline}
          maxLength={BUSINESS_WEB_PROFILE_TAGLINE_MAX}
          rows={2}
          onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
          onBlur={(e) => {
            const next = { ...settings, tagline: e.target.value }
            setSettings(next)
            void persist(next)
          }}
          placeholder="Brief tagline for Google Business and social profiles"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{settings.tagline.length}/{BUSINESS_WEB_PROFILE_TAGLINE_MAX}</span>
      </label>

      <fieldset style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, margin: 0 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 6px" }}>Follow us (public)</legend>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>
            Facebook page URL
            <input
              value={settings.facebookUrl}
              onChange={(e) => setSettings((s) => ({ ...s, facebookUrl: e.target.value }))}
              onBlur={(e) => {
                const next = { ...settings, facebookUrl: e.target.value.trim() }
                setSettings(next)
                void persist(next)
              }}
              placeholder="https://www.facebook.com/…"
              style={theme.formInput}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>
            Instagram profile URL
            <input
              value={settings.instagramUrl}
              onChange={(e) => setSettings((s) => ({ ...s, instagramUrl: e.target.value }))}
              onBlur={(e) => {
                const next = { ...settings, instagramUrl: e.target.value.trim() }
                setSettings(next)
                void persist(next)
              }}
              placeholder="https://www.instagram.com/…"
              style={theme.formInput}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.showSocialLinks}
              onChange={(e) => setSettings((s) => ({ ...s, showSocialLinks: e.target.checked }))}
            />
            Show Follow us links at the bottom of the public page
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, margin: 0 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 6px" }}>Page design</legend>
        <div style={{ display: "grid", gap: 12 }}>
          <BusinessProfileTemplatePicker
            value={settings.templateId}
            theme={settings.theme}
            onChange={(templateId) => {
              const next = { ...settings, templateId }
              setSettings(next)
              void persist(next)
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {(
              [
                ["primaryColor", "Primary color"],
                ["secondaryColor", "Secondary color"],
                ["fieldBackgroundColor", "Field background"],
                ["fontColor", "Font color"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>
                {label}
                <input
                  type="color"
                  value={settings.theme[key]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      theme: { ...s.theme, [key]: e.target.value },
                    }))
                  }
                  style={{ width: "100%", height: 40, padding: 2, borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = { ...settings, theme: { ...DEFAULT_BUSINESS_PROFILE_THEME } }
              setSettings(next)
              void persist(next)
            }}
            style={{
              justifySelf: "start",
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f1f5f9",
              color: "#0f172a",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset colors to default
          </button>
        </div>
      </fieldset>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Services offered (comma-separated)</span>
        <textarea
          value={settings.servicesOfferedText}
          rows={3}
          onChange={(e) => setSettings((s) => ({ ...s, servicesOfferedText: e.target.value }))}
          placeholder="e.g. Lawn care, Mulching, Hardscaping, Irrigation repair"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={settings.showServicesOffered}
            onChange={(e) => setSettings((s) => ({ ...s, showServicesOffered: e.target.checked }))}
          />
          Show services offered on public page (each item on its own line)
        </label>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Service areas (cities, counties, states — comma-separated)</span>
        <textarea
          value={settings.serviceAreasText}
          rows={3}
          onChange={(e) => setSettings((s) => ({ ...s, serviceAreasText: e.target.value }))}
          placeholder="e.g. Franklin TN, Williamson County, Nashville, Brentwood"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={settings.showServiceAreasList}
            onChange={(e) => setSettings((s) => ({ ...s, showServiceAreasList: e.target.checked }))}
          />
          Show service areas list on public page
        </label>
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
            <p style={{ margin: "0 0 0 24px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Uses your Tradesman email address from <strong>Tradesman email</strong> above (including custom domain if you set that as preferred).
            </p>
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

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, fontWeight: 600 }}>
        <input
          type="checkbox"
          style={{ marginTop: 3 }}
          checked={settings.showContactForm}
          onChange={(e) => setSettings((s) => ({ ...s, showContactForm: e.target.checked }))}
        />
        <span>
          Show <strong>Contact us</strong> form on public page (name + email required; SMS opt-in when visitor prefers text)
        </span>
      </label>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          Work photos ({settings.workPhotoUrls.length}/{BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {settings.workPhotoUrls.map((url) => (
            <div key={url} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setLightboxUrl(url)}
                aria-label="View work photo full size"
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "zoom-in",
                  borderRadius: 8,
                  display: "block",
                }}
              >
                <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${theme.border}` }} />
              </button>
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
          onBlur={(e) => {
            const next = { ...settings, aboutUs: e.target.value }
            setSettings(next)
            void persist(next)
          }}
          placeholder="Longer story shown on your public profile"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
      </label>

      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      {message ? <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>{message}</p> : null}

      {publicUrl && settings.enabled ? (
        <a
          href={`${publicUrl}?v=${publicCacheBust}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}
        >
          Preview public page ↗
        </a>
      ) : null}

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

      {lightboxUrl ? <PhotoLightbox src={lightboxUrl} alt="Work photo" onClose={() => setLightboxUrl(null)} /> : null}
    </div>
  )
}
