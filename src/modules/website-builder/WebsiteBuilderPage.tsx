import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react"
import { BusinessProfilePublicSite, type PublicBusinessProfileData } from "../public/BusinessProfilePublicSite"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useCustomerDataScope } from "../../hooks/useCustomerDataScope"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import {
  BUSINESS_PROFILE_BRAND_PRESETS,
  BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX,
  WEBSITE_BUILDER_PREVIEW_STORAGE_KEY,
  WEBSITE_FONT_OPTIONS,
  WEBSITE_FONT_SIZE_OPTIONS,
  WEBSITE_HOME_SECTION_OPTIONS,
  businessWebProfilePublicUrl,
  businessWebProfileSlugFromName,
  emptyBusinessPublicProfileSettings,
  mergeBusinessPublicProfileMetadata,
  parseBusinessProfileListField,
  parseBusinessPublicProfileSettings,
  type BusinessPublicProfileSettings,
  type WebsiteHomeSectionId,
  type WebsiteImageSlotId,
  type WebsitePublicPageId,
  type WebsiteTextStyle,
} from "../../lib/businessPublicProfile"
import { mergeHostedWebsiteMetadata, parseHostedWebsiteDoc, VERCEL_DNS_INSTRUCTIONS } from "../../lib/hostedWebsite"
import { mergeSocialPresenceIntoMetadata, readSocialPresenceFromMetadata } from "../../lib/socialPresenceSync"
import {
  getWebsiteTextValue,
  hideSectionFromSettings,
  patchWebsiteTextStyle,
  sectionIdFromEditTarget,
  setWebsiteTextValue,
  showSectionInSettings,
  websiteEditTargetKind,
  websiteEditTargetLabel,
} from "../../lib/websiteBuilderEdit"

const COMPANY_LOGO_META_KEY = "company_logo_url"
const EDITOR_INK = "#0f172a"

const field: CSSProperties = { ...theme.formInput, color: EDITOR_INK, background: "#fff" }
const sectionCard: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  display: "grid",
  gap: 10,
  color: EDITOR_INK,
}

type ContactSnapshot = {
  businessName: string
  phone: string | null
  email: string | null
  address: string | null
  companyLogoUrl: string | null
}

type PreviewDevice = "desktop" | "mobile"

type ContextMenuState = { x: number; y: number; targetId: string }

function formatUsPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw.trim()
}

function normalizeDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
}

export default function WebsiteBuilderPage() {
  const { userId: authUserId } = useAuth()
  const scopedUserId = useScopedUserId()
  const { dataUserId } = useCustomerDataScope()
  /** Hair Plumbing / org sites live on the account owner; Bhair should edit Shair's hosted site. */
  const userId = dataUserId || scopedUserId
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [settings, setSettings] = useState<BusinessPublicProfileSettings>(() => emptyBusinessPublicProfileSettings())
  const [contact, setContact] = useState<ContactSnapshot>({
    businessName: "",
    phone: null,
    email: null,
    address: null,
    companyLogoUrl: null,
  })
  const [slug, setSlug] = useState("")
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop")
  const [previewPage, setPreviewPage] = useState<WebsitePublicPageId>("home")
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [dnsOpen, setDnsOpen] = useState(false)

  const publicUrl = useMemo(() => {
    if (settings.customDomain.trim()) return `https://${normalizeDomainInput(settings.customDomain)}`
    if (!slug) return ""
    return businessWebProfilePublicUrl(slug, typeof window !== "undefined" ? window.location.origin : undefined)
  }, [slug, settings.customDomain])

  const load = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setError("")
    try {
      const [{ data: profile, error: pErr }, { data: channels }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "display_name, email, primary_phone, best_contact_phone, business_web_profile_slug, metadata, business_address, address_line_1, address_line_2, address_city, address_state, address_zip",
          )
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("client_communication_channels")
          .select("public_address, sms_enabled, voice_enabled, active, channel_kind")
          .eq("user_id", userId)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(20),
      ])
      if (pErr) throw pErr
      const meta =
        profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
          ? (profile.metadata as Record<string, unknown>)
          : {}
      const parsed = parseBusinessPublicProfileSettings(meta)
      const social = readSocialPresenceFromMetadata(meta)
      const hosted = parseHostedWebsiteDoc(meta)
      const nextSettings: BusinessPublicProfileSettings = {
        ...parsed,
        facebookUrl: parsed.facebookUrl || social.facebook,
        instagramUrl: parsed.instagramUrl || social.instagram,
        showServicesOffered: true,
        showContactForm: parsed.showContactForm !== false,
        showPhone: parsed.showPhone !== false,
        showEmail: parsed.showEmail !== false,
        customDomain: parsed.customDomain || hosted.customDomain || "",
      }
      if (!nextSettings.templateId || nextSettings.templateId === "classic") {
        nextSettings.templateId = "hair_plumbing"
        if (!parsed.theme || parsed.templateId === "classic") {
          nextSettings.theme = { ...BUSINESS_PROFILE_BRAND_PRESETS[0].theme }
        }
      }
      if (!nextSettings.theme.accentColor) {
        nextSettings.theme = { ...nextSettings.theme, accentColor: BUSINESS_PROFILE_BRAND_PRESETS[0].theme.accentColor }
      }
      setSettings(nextSettings)

      const name = (profile?.display_name || "").trim()
      const nextSlug =
        typeof profile?.business_web_profile_slug === "string" && profile.business_web_profile_slug.trim()
          ? profile.business_web_profile_slug.trim().toLowerCase()
          : businessWebProfileSlugFromName(name)
      setSlug(nextSlug)

      const channelRows = channels ?? []
      const phoneFromChannel = channelRows.find(
        (r) =>
          typeof r.public_address === "string" &&
          r.public_address.trim() &&
          !r.public_address.includes("@") &&
          (r.channel_kind === "voice_sms" || r.sms_enabled === true || r.voice_enabled === true),
      )
      const emailFromChannel = channelRows.find(
        (r) =>
          typeof r.public_address === "string" &&
          r.public_address.includes("@") &&
          (r.channel_kind === "email" || !r.channel_kind),
      )

      const addressParts = [
        typeof profile?.address_line_1 === "string" ? profile.address_line_1 : "",
        typeof profile?.address_line_2 === "string" ? profile.address_line_2 : "",
      ]
        .map((x) => x.trim())
        .filter(Boolean)
      const cityStateZip = [
        typeof profile?.address_city === "string" ? profile.address_city : "",
        typeof profile?.address_state === "string" ? profile.address_state : "",
        typeof profile?.address_zip === "string" ? profile.address_zip : "",
      ]
        .map((x) => x.trim())
        .filter(Boolean)
      if (cityStateZip.length) addressParts.push(cityStateZip.join(", "))
      const address =
        addressParts.length > 0
          ? addressParts.join("\n")
          : typeof profile?.business_address === "string"
            ? profile.business_address.trim()
            : null

      const logo =
        (typeof nextSettings.profilePhotoUrl === "string" && nextSettings.profilePhotoUrl.trim()
          ? nextSettings.profilePhotoUrl.trim()
          : null) ||
        (typeof meta[COMPANY_LOGO_META_KEY] === "string" && String(meta[COMPANY_LOGO_META_KEY]).trim()
          ? String(meta[COMPANY_LOGO_META_KEY]).trim()
          : null)

      const phone =
        formatUsPhone(
          typeof phoneFromChannel?.public_address === "string"
            ? phoneFromChannel.public_address
            : typeof profile?.primary_phone === "string"
              ? profile.primary_phone
              : typeof profile?.best_contact_phone === "string"
                ? profile.best_contact_phone
                : null,
        ) || null

      const email =
        (typeof emailFromChannel?.public_address === "string" && emailFromChannel.public_address.includes("@")
          ? emailFromChannel.public_address.trim()
          : null) ||
        (typeof profile?.email === "string" && profile.email.includes("@") ? profile.email.trim() : null)

      setContact({
        businessName: name || "Your business",
        phone,
        email,
        address: address || null,
        companyLogoUrl: logo,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [])

  const previewData: PublicBusinessProfileData = useMemo(() => {
    const logo = settings.profilePhotoUrl || contact.companyLogoUrl
    return {
      ok: true,
      slug: slug || "preview",
      businessName: contact.businessName,
      tagline: settings.tagline || undefined,
      aboutUs: settings.aboutUs || undefined,
      profilePhotoUrl: logo,
      workPhotoUrls: settings.workPhotoUrls,
      phone: settings.showPhone ? contact.phone : null,
      email: settings.showEmail ? contact.email : null,
      address: settings.showAddress ? contact.address : null,
      serviceAreas: settings.showServiceAreasList ? parseBusinessProfileListField(settings.serviceAreasText) : [],
      servicesOffered: settings.serviceCards.map((c) => c.title).filter(Boolean),
      businessHours: [],
      templateId: settings.templateId,
      theme: settings.theme,
      showContactForm: settings.showContactForm,
      facebookUrl: settings.showSocialLinks ? settings.facebookUrl : null,
      instagramUrl: settings.showSocialLinks ? settings.instagramUrl : null,
      imageSlots: settings.imageSlots,
      scrollBands: settings.scrollBands,
      heroHeadline: settings.heroHeadline || undefined,
      ctaLabel: settings.ctaLabel || undefined,
      customDomain: settings.customDomain || undefined,
      homeSections: settings.homeSections,
      subPages: settings.subPages,
      featureCards: settings.featureCards,
      serviceCards: settings.serviceCards,
      textStyles: settings.textStyles,
      homeSectionOrder: settings.homeSectionOrder,
      fixedBackground: settings.fixedBackground,
      footerCopyright: settings.footerCopyright || undefined,
      showPoweredBy: settings.showPoweredBy === true,
    }
  }, [settings, contact, slug])

  function openPopoutPreview() {
    try {
      const payload = JSON.stringify(previewData)
      // localStorage is shared across windows; sessionStorage is not when open() uses noopener.
      localStorage.setItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY, payload)
      sessionStorage.setItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY, payload)
    } catch {
      setError("Could not open preview window (storage blocked).")
      return
    }
    // Do not pass noopener — it returns null and isolates storage from the opener.
    const w = window.open(
      "/website-builder-preview",
      "tradesman-website-preview",
      "width=1280,height=900,menubar=no,toolbar=no,location=no,status=no",
    )
    if (!w) setError("Pop-out blocked — allow pop-ups for this site, then try again.")
    else {
      try {
        w.focus()
      } catch {
        /* ignore */
      }
    }
  }

  function patchTextStyle(targetId: string, patch: Partial<WebsiteTextStyle>) {
    setSettings((s) => ({
      ...s,
      textStyles: patchWebsiteTextStyle(s.textStyles, targetId, patch),
    }))
  }

  function moveSection(fromId: WebsiteHomeSectionId, direction: -1 | 1) {
    setSettings((s) => {
      const order = [...s.homeSectionOrder]
      const idx = order.indexOf(fromId)
      if (idx < 0) return s
      const next = idx + direction
      if (next < 0 || next >= order.length) return s
      const tmp = order[idx]!
      order[idx] = order[next]!
      order[next] = tmp
      return { ...s, homeSectionOrder: order }
    })
  }

  function onSectionListDragStart(id: WebsiteHomeSectionId, e: DragEvent) {
    e.dataTransfer.setData("text/section-id", id)
    e.dataTransfer.effectAllowed = "move"
  }

  function onSectionListDrop(toId: WebsiteHomeSectionId, e: DragEvent) {
    e.preventDefault()
    const fromId = e.dataTransfer.getData("text/section-id") as WebsiteHomeSectionId
    if (!fromId || fromId === toId) return
    setSettings((s) => {
      const order = [...s.homeSectionOrder]
      const from = order.indexOf(fromId)
      const to = order.indexOf(toId)
      if (from < 0 || to < 0) return s
      order.splice(from, 1)
      order.splice(to, 0, fromId)
      return { ...s, homeSectionOrder: order }
    })
  }

  async function persist(next: BusinessPublicProfileSettings, opts?: { logoUrl?: string | null }) {
    if (!supabase || !userId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const name = contact.businessName.trim()
      const nextSlug = businessWebProfileSlugFromName(name)
      if (!nextSlug || nextSlug.length < 3) {
        throw new Error("Set a business name in MyT → Account (Contact & profile) before publishing.")
      }
      const { data: metaRow, error: metaErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (metaErr) throw metaErr
      let prevMeta =
        metaRow?.metadata && typeof metaRow.metadata === "object" && !Array.isArray(metaRow.metadata)
          ? { ...(metaRow.metadata as Record<string, unknown>) }
          : {}
      if (opts && "logoUrl" in opts && opts.logoUrl) {
        prevMeta[COMPANY_LOGO_META_KEY] = opts.logoUrl
      }
      const domain = normalizeDomainInput(next.customDomain)
      const withSite = mergeBusinessPublicProfileMetadata(prevMeta, { ...next, customDomain: domain }, nextSlug)
      const withSocial = mergeSocialPresenceIntoMetadata(withSite, {
        facebook: next.facebookUrl,
        instagram: next.instagramUrl,
      })
      const nextMeta = mergeHostedWebsiteMetadata(withSocial, {
        hosting: "tradesman",
        siteSlug: nextSlug,
        customDomain: domain,
        publicUrl: domain
          ? `https://${domain}`
          : businessWebProfilePublicUrl(nextSlug, typeof window !== "undefined" ? window.location.origin : undefined),
      })
      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          metadata: nextMeta,
          business_web_profile_slug: next.enabled ? nextSlug : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
      if (upErr) {
        if (/duplicate|unique/i.test(upErr.message)) {
          throw new Error("That public web address is already taken. Adjust the business name slightly.")
        }
        throw upErr
      }
      setSettings({ ...next, customDomain: domain })
      setSlug(nextSlug)
      if (opts?.logoUrl) setContact((c) => ({ ...c, companyLogoUrl: opts.logoUrl ?? c.companyLogoUrl }))
      setMessage(next.enabled ? "Website published." : "Website draft saved (not published).")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File, kind: "work" | "logo") {
    if (!supabase || !userId) return null
    if (!authUserId) {
      setError("Sign in again to upload images.")
      return null
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.")
      return null
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
    // Storage RLS requires the first path segment to be auth.uid() (not the org data user).
    const path = `${authUserId}/web-profile/${kind}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, {
      upsert: true,
      contentType: file.type,
    })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path)
    if (!pub?.publicUrl) throw new Error("Upload failed.")
    return pub.publicUrl
  }

  async function onPhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (settings.workPhotoUrls.length >= BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX) {
      setError(`Up to ${BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX} photos.`)
      return
    }
    setUploading(true)
    setError("")
    try {
      const url = await uploadImage(file, "work")
      if (!url) return
      setSettings((s) => ({ ...s, workPhotoUrls: [...s.workPhotoUrls, url] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  async function onLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadingLogo(true)
    setError("")
    try {
      const url = await uploadImage(file, "logo")
      if (!url) return
      setSettings((s) => ({ ...s, profilePhotoUrl: url }))
      setContact((c) => ({ ...c, companyLogoUrl: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  function assignSlot(slot: WebsiteImageSlotId, url: string | null) {
    setSettings((s) => {
      const imageSlots = { ...s.imageSlots }
      if (!url) delete imageSlots[slot]
      else imageSlots[slot] = url
      return { ...s, imageSlots }
    })
  }

  function onPhotoDragStart(url: string, e: DragEvent) {
    e.dataTransfer.setData("text/plain", url)
    e.dataTransfer.setData("text/uri-list", url)
    e.dataTransfer.effectAllowed = "copy"
  }

  function onSelectTarget(id: string | null) {
    setSelectedTargetId(id)
    if (!id) setContextMenu(null)
  }

  function onTargetContextMenu(targetId: string, clientX: number, clientY: number) {
    setSelectedTargetId(targetId)
    setContextMenu({ x: clientX, y: clientY, targetId })
  }

  function onDropImageOnSlot(slotId: string, imageUrl: string) {
    assignSlot(slotId as WebsiteImageSlotId, imageUrl)
    setSelectedTargetId(`slot.${slotId}`)
  }

  function removeSelected() {
    if (!selectedTargetId) return
    const sectionId = sectionIdFromEditTarget(selectedTargetId)
    if (sectionId) {
      setSettings((s) => hideSectionFromSettings(s, sectionId))
      setSelectedTargetId(null)
      setContextMenu(null)
      return
    }
    if (selectedTargetId.startsWith("slot.")) {
      const slot = selectedTargetId.slice("slot.".length) as WebsiteImageSlotId
      assignSlot(slot, null)
      setContextMenu(null)
    }
  }

  const selectedKind = selectedTargetId ? websiteEditTargetKind(selectedTargetId) : null
  const selectedText = selectedTargetId && selectedKind === "text" ? getWebsiteTextValue(settings, selectedTargetId) : ""
  const selectedStyle = selectedTargetId ? settings.textStyles[selectedTargetId] ?? {} : {}
  const hiddenSections = WEBSITE_HOME_SECTION_OPTIONS.filter((o) => settings.homeSections[o.id] === false)

  if (loading) {
    return <p style={{ margin: 24, color: "#64748b" }}>Loading website builder…</p>
  }

  const previewWidth = previewDevice === "mobile" ? 390 : "100%"

  return (
    <div className="wb-root">
      <style>{`
        .wb-root {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          gap: 0;
          min-height: calc(100vh - 64px);
        }
        .wb-editor { color: ${EDITOR_INK}; }
        .wb-editor input, .wb-editor textarea, .wb-editor select, .wb-editor button { color: ${EDITOR_INK}; }
        @media (max-width: 960px) {
          .wb-root { grid-template-columns: 1fr; min-height: auto; }
          .wb-preview { min-height: 70vh; }
        }
      `}</style>

      <aside
        className="wb-editor"
        style={{
          borderRight: `1px solid ${theme.border}`,
          background: "#f8fafc",
          overflow: "auto",
          padding: 14,
          display: "grid",
          gap: 12,
          alignContent: "start",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900 }}>Website Builder</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
            Click anything in the preview to edit. Right-click to remove. Drag photos onto image slots.
          </p>
        </div>

        <div style={sectionCard}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            />
            Publish live
          </label>
          <div style={{ fontSize: 11, color: "#0f766e", fontWeight: 700, wordBreak: "break-all" }}>
            {publicUrl || "Set business name in Account for a public URL"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persist(settings)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save & publish"}
            </button>
            <button
              type="button"
              onClick={openPopoutPreview}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: EDITOR_INK,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Pop-out preview
            </button>
          </div>
          {message ? <p style={{ margin: 0, fontSize: 12, color: "#0f766e", fontWeight: 800 }}>{message}</p> : null}
          {error ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>{error}</p> : null}
        </div>

        {selectedTargetId && selectedKind === "text" ? (
          <div style={{ ...sectionCard, borderColor: "#2563eb", boxShadow: "0 0 0 1px rgba(37,99,235,0.2)" }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>{websiteEditTargetLabel(selectedTargetId)}</div>
            <textarea
              rows={selectedTargetId.includes("body") || selectedTargetId === "hero.headline" ? 5 : 2}
              value={selectedText}
              onChange={(e) => setSettings((s) => setWebsiteTextValue(s, selectedTargetId, e.target.value))}
              style={{ ...field, resize: "vertical", fontSize: 13 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Color
                <input
                  type="color"
                  value={selectedStyle.color || settings.theme.fontColor}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      textStyles: patchWebsiteTextStyle(s.textStyles, selectedTargetId, { color: e.target.value }),
                    }))
                  }
                  style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Size
                <select
                  value={selectedStyle.fontSize || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      textStyles: patchWebsiteTextStyle(s.textStyles, selectedTargetId, {
                        fontSize: e.target.value || undefined,
                      }),
                    }))
                  }
                  style={field}
                >
                  <option value="">Default</option>
                  {WEBSITE_FONT_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Font
              <select
                value={selectedStyle.fontFamily || ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    textStyles: patchWebsiteTextStyle(s.textStyles, selectedTargetId, {
                      fontFamily: e.target.value || undefined,
                    }),
                  }))
                }
                style={field}
              >
                <option value="">Default</option>
                {WEBSITE_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.stack}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    textStyles: patchWebsiteTextStyle(s.textStyles, selectedTargetId, {
                      fontWeight: selectedStyle.fontWeight === "700" ? "400" : "700",
                    }),
                  }))
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: selectedStyle.fontWeight === "700" ? "#e2e8f0" : "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    textStyles: patchWebsiteTextStyle(s.textStyles, selectedTargetId, {
                      fontStyle: selectedStyle.fontStyle === "italic" ? "normal" : "italic",
                    }),
                  }))
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: selectedStyle.fontStyle === "italic" ? "#e2e8f0" : "#fff",
                  fontStyle: "italic",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => setSelectedTargetId(null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : selectedTargetId && selectedKind === "section" ? (
          <div style={{ ...sectionCard, borderColor: "#2563eb" }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>{websiteEditTargetLabel(selectedTargetId)}</div>
            <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Right-click → Remove to hide this block from the site.</p>
            <button
              type="button"
              onClick={removeSelected}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#b91c1c",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Remove section
            </button>
          </div>
        ) : selectedTargetId && selectedKind === "image" ? (
          <div style={{ ...sectionCard, borderColor: "#2563eb" }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>{websiteEditTargetLabel(selectedTargetId)}</div>
            <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Drag a photo from the tray below onto this slot.</p>
            <button
              type="button"
              onClick={removeSelected}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear image
            </button>
          </div>
        ) : (
          <div style={sectionCard}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Nothing selected</div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Click a headline, paragraph, button, photo slot, or whole section in the preview.
            </p>
          </div>
        )}

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Photos</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <label
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px dashed ${theme.border}`,
                background: "#fff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {uploading ? "Uploading…" : "+ Photo"}
              <input type="file" accept="image/*" hidden onChange={(e) => void onPhotoUpload(e)} disabled={uploading} />
            </label>
            <label
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px dashed ${theme.border}`,
                background: "#fff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {uploadingLogo ? "Uploading…" : "Logo"}
              <input type="file" accept="image/*" hidden onChange={(e) => void onLogoUpload(e)} disabled={uploadingLogo} />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {settings.workPhotoUrls.map((url) => (
              <div key={url} style={{ position: "relative" }}>
                <img
                  src={url}
                  alt=""
                  draggable
                  onDragStart={(e) => onPhotoDragStart(url, e)}
                  title="Drag onto a photo slot in the preview"
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: 8,
                    border:
                      settings.imageSlots.background === url ? "2px solid #c81e1e" : `1px solid ${theme.border}`,
                    cursor: "grab",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  title="Use as fixed page background"
                  onClick={() => assignSlot("background", url)}
                  style={{
                    position: "absolute",
                    left: 2,
                    right: 2,
                    bottom: 2,
                    border: "none",
                    borderRadius: 4,
                    background: "rgba(15,23,42,0.82)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 800,
                    padding: "2px 0",
                    cursor: "pointer",
                  }}
                >
                  BG
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK }}>Stationary background</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700, color: EDITOR_INK }}>
            <input
              type="checkbox"
              checked={settings.fixedBackground !== false}
              onChange={(e) => setSettings((s) => ({ ...s, fixedBackground: e.target.checked }))}
            />
            Keep background photo fixed while bars scroll over it
          </label>
          <p style={{ margin: 0, fontSize: 11, color: "#475569", lineHeight: 1.45 }}>
            Drag a photo from the library onto the page background, or click <strong>BG</strong> on a thumbnail. Keep
            “stationary background” checked so sections scroll over the image.
          </p>
        </div>

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK }}>Section order (drag)</div>
          <div style={{ display: "grid", gap: 6 }}>
            {settings.homeSectionOrder.map((id) => {
              const opt = WEBSITE_HOME_SECTION_OPTIONS.find((o) => o.id === id)
              const on = settings.homeSections[id] !== false
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => onSectionListDragStart(id, e)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onSectionListDrop(id, e)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: on ? "#fff" : "#f1f5f9",
                    color: EDITOR_INK,
                    cursor: "grab",
                    opacity: on ? 1 : 0.65,
                  }}
                >
                  <span style={{ fontWeight: 900, fontSize: 12, color: "#64748b" }}>⋮⋮</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: EDITOR_INK }}>{opt?.label ?? id}</span>
                  <button
                    type="button"
                    title="Move up"
                    onClick={() => moveSection(id, -1)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: EDITOR_INK, fontWeight: 900 }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    onClick={() => moveSection(id, 1)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: EDITOR_INK, fontWeight: 900 }}
                  >
                    ↓
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK }}>Add / restore sections</div>
          {hiddenSections.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>All sections are on the page.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hiddenSections.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSettings((s) => showSectionInSettings(s, opt.id as WebsiteHomeSectionId))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  + {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Brand colors</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {BUSINESS_PROFILE_BRAND_PRESETS.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, theme: { ...preset.theme } }))}
                title={preset.label}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `2px solid ${theme.border}`,
                  background: `linear-gradient(135deg, ${preset.theme.primaryColor}, ${preset.theme.accentColor})`,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(
              [
                ["primaryColor", "Primary"],
                ["accentColor", "Accent"],
                ["fontColor", "Text"],
              ] as const
            ).map(([key, name]) => (
              <label key={key} style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
                {name}
                <input
                  type="color"
                  value={settings.theme[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, theme: { ...s.theme, [key]: e.target.value } }))}
                  style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              </label>
            ))}
          </div>
        </div>

        <details style={sectionCard} open={dnsOpen} onToggle={(e) => setDnsOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Custom domain / DNS</summary>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
            Put the <strong>customer’s public domain</strong> here (example: <code>www.hairplumbing.com</code>), not the
            Vercel preview URL. Tradesman already hosts the site at{" "}
            <code>/{slug || "your-slug"}</code> on tradesman-us.com. The custom domain is what homeowners type in the
            browser after DNS is pointed at us.
          </p>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, marginTop: 10 }}>
            Customer domain
            <input
              value={settings.customDomain}
              onChange={(e) => setSettings((s) => ({ ...s, customDomain: e.target.value }))}
              placeholder="www.hairplumbing.com"
              style={field}
            />
          </label>
          <p style={{ margin: 0, fontSize: 11, color: "#475569", lineHeight: 1.45 }}>
            Why we ask: so the live link, sitemap, and publish URL show their brand domain. You still add that same
            domain in the Vercel project, and the customer (or you) still creates the DNS records below at their
            registrar.
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 11,
              background: "#f1f5f9",
              padding: 10,
              borderRadius: 8,
              color: "#334155",
            }}
          >
            {`At the customer’s DNS host (GoDaddy, Cloudflare, etc.):

A record (apex hairplumbing.com) → ${VERCEL_DNS_INSTRUCTIONS.apexA}
CNAME (www.hairplumbing.com) → ${VERCEL_DNS_INSTRUCTIONS.wwwCname}

Then in Vercel → Project → Domains: add www.hairplumbing.com (and apex if used).
${VERCEL_DNS_INSTRUCTIONS.note}

Until DNS + Vercel domain are connected, the working public URL is:
${slug ? businessWebProfilePublicUrl(slug, typeof window !== "undefined" ? window.location.origin : undefined) : "https://www.tradesman-us.com/{slug}"}`}
          </pre>
        </details>

        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
          Contact phone / email / address come from this account’s profile &amp; Communications channels.
        </div>
      </aside>

      <main className="wb-preview" style={{ background: "#0f172a", position: "relative" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            position: "sticky",
            top: 0,
            zIndex: 5,
            background: "rgba(15,23,42,0.96)",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {(
              [
                ["home", "Home"],
                ["about", "About"],
                ["contact", "Contact"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreviewPage(id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: previewPage === id ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.25)",
                  background: previewPage === id ? "rgba(251,191,36,0.15)" : "transparent",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={openPopoutPreview}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Pop-out
            </button>
            {(
              [
                ["desktop", "Desktop"],
                ["mobile", "Mobile"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreviewDevice(id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: previewDevice === id ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.25)",
                  background: previewDevice === id ? "rgba(251,191,36,0.15)" : "transparent",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: previewDevice === "mobile" ? "16px 0 32px" : 0,
            display: "flex",
            justifyContent: "center",
            height: "calc(100vh - 120px)",
            minHeight: 480,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: previewWidth,
              maxWidth: "100%",
              height: "100%",
              borderRadius: previewDevice === "mobile" ? 24 : 0,
              overflow: "auto",
              border: previewDevice === "mobile" ? "10px solid #1e293b" : "none",
              boxShadow: previewDevice === "mobile" ? "0 20px 50px rgba(0,0,0,0.45)" : "none",
              background: "#111",
              position: "relative",
            }}
          >
            <BusinessProfilePublicSite
              data={previewData}
              previewMode
              activePage={previewPage}
              onNavigatePage={setPreviewPage}
              editor={{
                selectedTargetId,
                onSelectTarget,
                onTargetContextMenu,
                onDropImageOnSlot,
                onPatchTextStyle: patchTextStyle,
              }}
            />
          </div>
        </div>

        {contextMenu ? (
          <div
            role="menu"
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 80,
              minWidth: 200,
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
              padding: 6,
              color: "#0f172a",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: "none",
                background: "transparent",
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
                color: "#0f172a",
              }}
              onClick={() => {
                setSelectedTargetId(contextMenu.targetId)
                setContextMenu(null)
              }}
            >
              Edit “{websiteEditTargetLabel(contextMenu.targetId)}”
            </button>
            {websiteEditTargetKind(contextMenu.targetId) === "text" ? (
              <>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = settings.textStyles[id]?.fontSize || "22px"
                    const idx = WEBSITE_FONT_SIZE_OPTIONS.indexOf(cur as (typeof WEBSITE_FONT_SIZE_OPTIONS)[number])
                    const next = WEBSITE_FONT_SIZE_OPTIONS[Math.min(WEBSITE_FONT_SIZE_OPTIONS.length - 1, Math.max(0, idx) + 1)]
                    patchTextStyle(id, { fontSize: next })
                    setContextMenu(null)
                  }}
                >
                  Larger text
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = settings.textStyles[id]?.fontSize || "22px"
                    const idx = WEBSITE_FONT_SIZE_OPTIONS.indexOf(cur as (typeof WEBSITE_FONT_SIZE_OPTIONS)[number])
                    const next = WEBSITE_FONT_SIZE_OPTIONS[Math.max(0, (idx < 0 ? 4 : idx) - 1)]
                    patchTextStyle(id, { fontSize: next })
                    setContextMenu(null)
                  }}
                >
                  Smaller text
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    patchTextStyle(contextMenu.targetId, { offsetX: 0, offsetY: 0 })
                    setContextMenu(null)
                  }}
                >
                  Reset position
                </button>
              </>
            ) : null}
            {(websiteEditTargetKind(contextMenu.targetId) === "section" ||
              websiteEditTargetKind(contextMenu.targetId) === "image") && (
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: "none",
                  background: "transparent",
                  borderRadius: 6,
                  fontWeight: 700,
                  color: "#b91c1c",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const tid = contextMenu.targetId
                  setContextMenu(null)
                  const sectionId = sectionIdFromEditTarget(tid)
                  if (sectionId) {
                    setSettings((s) => hideSectionFromSettings(s, sectionId))
                    setSelectedTargetId(null)
                    return
                  }
                  if (tid.startsWith("slot.")) {
                    assignSlot(tid.slice("slot.".length) as WebsiteImageSlotId, null)
                    setSelectedTargetId(null)
                  }
                }}
              >
                {websiteEditTargetKind(contextMenu.targetId) === "image" ? "Clear image" : "Remove section"}
              </button>
            )}
          </div>
        ) : null}
      </main>
    </div>
  )
}
