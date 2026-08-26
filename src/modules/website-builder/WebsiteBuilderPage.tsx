import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type SetStateAction,
} from "react"
import { BusinessProfilePublicSite, type PublicBusinessProfileData } from "../public/BusinessProfilePublicSite"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useCustomerDataScope } from "../../hooks/useCustomerDataScope"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import {
  BUSINESS_PUBLIC_PROFILE_META_KEY,
  BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX,
  DEFAULT_BUSINESS_PROFILE_THEME,
  WEBSITE_BAND_TEXTURE_OPTIONS,
  WEBSITE_BUILT_IN_LINK_OPTIONS,
  WEBSITE_BUILDER_PREVIEW_CHANNEL,
  WEBSITE_BUILDER_PREVIEW_MESSAGE,
  WEBSITE_BUILDER_PREVIEW_STORAGE_KEY,
  WEBSITE_FONT_OPTIONS,
  WEBSITE_FONT_SIZE_OPTIONS,
  WEBSITE_FREEFORM_DESIGN_WIDTH,
  WEBSITE_HOME_SECTION_OPTIONS,
  WEBSITE_SOCIAL_PLATFORM_OPTIONS,
  businessWebProfilePublicUrl,
  businessWebProfileSlugFromName,
  defaultWebsiteNavBar,
  emptyBusinessPublicProfileSettings,
  mergeBusinessPublicProfileMetadata,
  parseBusinessProfileListField,
  parseBusinessPublicProfileSettings,
  randomizeBusinessProfileTheme,
  canvasItemOnAllEnabledPages,
  enabledWebsitePublicPageIds,
  type BusinessProfileTemplateId,
  type BusinessPublicProfileSettings,
  type WebsiteBuiltInLinkTarget,
  type WebsiteCanvasItem,
  type WebsiteHomeSectionId,
  type WebsiteImageSlotId,
  type WebsitePublicPageId,
  type WebsiteSavedDraft,
  type WebsiteScrollBand,
  type WebsiteSocialPlatformId,
  type WebsiteTextStyle,
} from "../../lib/businessPublicProfile"
import { mergeHostedWebsiteMetadata, parseHostedWebsiteDoc, VERCEL_DNS_INSTRUCTIONS } from "../../lib/hostedWebsite"
import { mergeSocialPresenceIntoMetadata, readSocialPresenceFromMetadata } from "../../lib/socialPresenceSync"
import PlatformBadge from "../../components/PlatformBadge"
import { BusinessProfileTemplatePicker } from "../../components/BusinessProfileTemplatePicker"
import {
  getCanvasItemIdFromTarget,
  getWebsiteTextValue,
  hiddenWebsiteEditTargetIds,
  hideSectionFromSettings,
  hideWebsiteEditTarget,
  patchWebsiteLayoutStyle,
  resolveWebsiteEditTargetKind,
  sectionIdFromEditTarget,
  seedCanvasStyleBothLayouts,
  setWebsiteTextValue,
  showSectionInSettings,
  showWebsiteEditTarget,
  websiteEditTargetKind,
  websiteEditTargetLabel,
} from "../../lib/websiteBuilderEdit"

const HISTORY_MAX = 40

function cloneSettings(s: BusinessPublicProfileSettings): BusinessPublicProfileSettings {
  return JSON.parse(JSON.stringify(s)) as BusinessPublicProfileSettings
}

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
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [settings, setSettingsState] = useState<BusinessPublicProfileSettings>(() => emptyBusinessPublicProfileSettings())
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
  const [isHairPlumbingAccount, setIsHairPlumbingAccount] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const undoStackRef = useRef<BusinessPublicProfileSettings[]>([])
  const redoStackRef = useRef<BusinessPublicProfileSettings[]>([])
  const skipHistoryRef = useRef(false)

  const canUndo = historyTick >= 0 && undoStackRef.current.length > 0
  const canRedo = historyTick >= 0 && redoStackRef.current.length > 0

  const setSettings = useCallback((updater: SetStateAction<BusinessPublicProfileSettings>) => {
    setSettingsState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: BusinessPublicProfileSettings) => BusinessPublicProfileSettings)(prev) : updater
      if (!skipHistoryRef.current) {
        undoStackRef.current = [...undoStackRef.current, cloneSettings(prev)].slice(-HISTORY_MAX)
        redoStackRef.current = []
        queueMicrotask(() => setHistoryTick((t) => t + 1))
      }
      return next
    })
  }, [])

  const setSettingsSilent = useCallback((updater: SetStateAction<BusinessPublicProfileSettings>) => {
    skipHistoryRef.current = true
    setSettingsState(updater)
    queueMicrotask(() => {
      skipHistoryRef.current = false
    })
  }, [])

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (!stack.length) return
    const snapshot = stack[stack.length - 1]!
    undoStackRef.current = stack.slice(0, -1)
    setSettingsState((cur) => {
      redoStackRef.current = [...redoStackRef.current, cloneSettings(cur)].slice(-HISTORY_MAX)
      queueMicrotask(() => setHistoryTick((t) => t + 1))
      return snapshot
    })
  }, [])

  const redo = useCallback(() => {
    const stack = redoStackRef.current
    if (!stack.length) return
    const snapshot = stack[stack.length - 1]!
    redoStackRef.current = stack.slice(0, -1)
    setSettingsState((cur) => {
      undoStackRef.current = [...undoStackRef.current, cloneSettings(cur)].slice(-HISTORY_MAX)
      queueMicrotask(() => setHistoryTick((t) => t + 1))
      return snapshot
    })
  }, [])

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
      const name = (profile?.display_name || "").trim()
      const nextSlug =
        typeof profile?.business_web_profile_slug === "string" && profile.business_web_profile_slug.trim()
          ? profile.business_web_profile_slug.trim().toLowerCase()
          : businessWebProfileSlugFromName(name)
      const profileEmail = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : ""
      const isHairPlumbingAccount =
        profileEmail === "shair@hairplumbing.com" ||
        nextSlug === "hair-plumbing" ||
        nextSlug === "hairplumbing" ||
        Boolean(meta.hair_plumbing_site_seed_v)

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
      // Classic / Hair Plumbing layout is reserved for that account — everyone else keeps Showcase / other templates.
      if (!parsed.templateId || parsed.templateId === "classic") {
        nextSettings.templateId = isHairPlumbingAccount ? "hair_plumbing" : "showcase"
      }
      if (isHairPlumbingAccount && nextSettings.templateId === "showcase" && meta.hair_plumbing_site_seed_v) {
        nextSettings.templateId = "hair_plumbing"
      }
      if (!nextSettings.theme.accentColor) {
        nextSettings.theme = {
          ...nextSettings.theme,
          accentColor: isHairPlumbingAccount
            ? "#c41e3a"
            : DEFAULT_BUSINESS_PROFILE_THEME.accentColor || "#b91c1c",
        }
      }
      setIsHairPlumbingAccount(isHairPlumbingAccount)
      undoStackRef.current = []
      redoStackRef.current = []
      setHistoryTick((t) => t + 1)
      setSettingsSilent(nextSettings)
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
  }, [userId, setSettingsSilent])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.("[data-wb-context-menu]")) return
      close()
    }
    window.addEventListener("keydown", onKey)
    // Capture so canvas stopPropagation cannot keep the menu stuck open.
    window.addEventListener("pointerdown", onPointer, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer, true)
    }
  }, [contextMenu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === "z" && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }
      if (key === "z") {
        e.preventDefault()
        undo()
        return
      }
      if (key === "y") {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])

  const previewData: PublicBusinessProfileData = useMemo(() => {
    const logo = settings.profilePhotoUrl || contact.companyLogoUrl
    const social = settings.socialLinks
    return {
      ok: true,
      slug: slug || "preview",
      businessName: contact.businessName,
      tagline: settings.tagline || undefined,
      aboutUs: settings.aboutUs || undefined,
      profilePhotoUrl: logo,
      faviconUrl: settings.faviconUrl || logo || null,
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
      facebookUrl: settings.showSocialLinks ? social.facebook || settings.facebookUrl : null,
      instagramUrl: settings.showSocialLinks ? social.instagram || settings.instagramUrl : null,
      socialLinks: settings.showSocialLinks ? social : null,
      imageSlots: settings.imageSlots,
      scrollBands: settings.scrollBands,
      heroHeadline: settings.heroHeadline || undefined,
      ctaLabel: settings.ctaLabel || undefined,
      customDomain: settings.customDomain || undefined,
      homeSections: settings.homeSections,
      subPages: settings.subPages,
      customPages: settings.customPages,
      canvasItems: settings.canvasItems,
      featureCards: settings.featureCards,
      serviceCards: settings.serviceCards,
      textStyles: settings.textStyles,
      textStylesMobile: settings.textStylesMobile,
      homeSectionOrder: settings.homeSectionOrder,
      fixedBackground: settings.fixedBackground,
      footerCopyright: settings.footerCopyright || undefined,
      showPoweredBy: settings.showPoweredBy === true,
      navBar: settings.navBar,
    }
  }, [settings, contact, slug])

  const popoutRef = useRef<Window | null>(null)

  const publishPreview = useCallback(
    (target?: Window | null) => {
      try {
        const payload = JSON.stringify(previewData)
        localStorage.setItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY, payload)
        sessionStorage.setItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY, payload)
      } catch {
        return false
      }
      try {
        const bc = new BroadcastChannel(WEBSITE_BUILDER_PREVIEW_CHANNEL)
        bc.postMessage({ type: WEBSITE_BUILDER_PREVIEW_MESSAGE })
        bc.close()
      } catch {
        /* ignore */
      }
      const w = target ?? popoutRef.current
      try {
        if (w && !w.closed) w.postMessage({ type: WEBSITE_BUILDER_PREVIEW_MESSAGE }, window.location.origin)
      } catch {
        /* ignore */
      }
      return true
    },
    [previewData],
  )

  useEffect(() => {
    const t = window.setTimeout(() => {
      void publishPreview()
    }, 250)
    return () => window.clearTimeout(t)
  }, [publishPreview])

  function openPopoutPreview() {
    if (!publishPreview()) {
      setError("Could not open preview window (storage blocked).")
      return
    }
    const w = window.open(
      "/website-builder-preview",
      "tradesman-website-preview",
      "width=1280,height=900,menubar=no,toolbar=no,location=no,status=no",
    )
    if (!w) setError("Pop-out blocked — allow pop-ups for this site, then try again.")
    else {
      popoutRef.current = w
      try {
        w.focus()
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        void publishPreview(w)
      }, 80)
    }
  }

  function patchTextStyle(targetId: string, patch: Partial<WebsiteTextStyle>) {
    setSettings((s) => patchWebsiteLayoutStyle(s, previewDevice, targetId, patch))
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

  async function persist(next: BusinessPublicProfileSettings, opts?: { logoUrl?: string | null; draft?: boolean }) {
    if (!supabase || !userId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const name = contact.businessName.trim()
      const computedSlug = businessWebProfileSlugFromName(name)
      const nextSlug =
        isHairPlumbingAccount && (slug === "hair-plumbing" || slug === "hairplumbing") ? slug : computedSlug
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
        facebook: next.socialLinks.facebook || next.facebookUrl,
        instagram: next.socialLinks.instagram || next.instagramUrl,
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
      setSettingsSilent({ ...next, customDomain: domain })
      setSlug(nextSlug)
      if (opts?.logoUrl) setContact((c) => ({ ...c, companyLogoUrl: opts.logoUrl ?? c.companyLogoUrl }))
      setMessage(
        opts?.draft
          ? next.enabled
            ? "Draft saved. Live website is still published."
            : "Website draft saved (not published)."
          : next.enabled
            ? "Website published."
            : "Website draft saved (not published).",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File, kind: "work" | "logo" | "favicon") {
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

  async function onFaviconUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadingFavicon(true)
    setError("")
    try {
      const url = await uploadImage(file, "favicon")
      if (!url) return
      setSettings((s) => ({ ...s, faviconUrl: url }))
      setMessage("Browser icon updated — click Save & publish to go live.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingFavicon(false)
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
    setContextMenu(null)
  }

  function onTargetContextMenu(targetId: string, clientX: number, clientY: number) {
    setSelectedTargetId(targetId)
    setContextMenu({ x: clientX, y: clientY, targetId })
  }

  function onDropImageOnSlot(slotId: string, imageUrl: string) {
    assignSlot(slotId as WebsiteImageSlotId, imageUrl)
    setSelectedTargetId(`slot.${slotId}`)
    setContextMenu(null)
  }

  function onDropImageOnCanvasItem(itemId: string, imageUrl: string) {
    setSettings((s) => ({
      ...s,
      canvasItems: s.canvasItems.map((c) => (c.id === itemId ? { ...c, imageUrl } : c)),
    }))
    setSelectedTargetId(`canvas.${itemId}`)
    setContextMenu(null)
  }

  function addTextField() {
    const id = `t_${Date.now().toString(36)}`
    const targetId = `canvas.${id}`
    const stack = settings.canvasItems.length
    const page = previewPage
    setSettings((s) =>
      seedCanvasStyleBothLayouts(
        {
          ...s,
          canvasItems: [
            ...s.canvasItems,
            { id, kind: "text" as const, text: "New text — click to edit", pages: [page] },
          ].slice(0, 24),
        },
        targetId,
        {
          offsetX: 0,
          offsetY: 40 + stack * 28,
          maxWidth: 280,
          fontSize: "22px",
          fontWeight: "700",
          showFieldBackground: false,
        },
      ),
    )
    setSelectedTargetId(targetId)
    setMessage("Text field added — drag it on the page, edit copy in the panel above.")
  }

  function addPhotoFieldAt(imageUrl: string | null, offsetX: number, offsetY: number) {
    const id = `p_${Date.now().toString(36)}`
    const targetId = `canvas.${id}`
    const page = previewPage
    setSettings((s) =>
      seedCanvasStyleBothLayouts(
        {
          ...s,
          canvasItems: [
            ...s.canvasItems,
            { id, kind: "photo" as const, imageUrl: imageUrl?.trim() || null, pages: [page] },
          ].slice(0, 24),
        },
        targetId,
        {
          offsetX,
          offsetY,
          maxWidth: 200,
          imageSize: 150,
        },
      ),
    )
    setSelectedTargetId(targetId)
    setMessage(imageUrl ? "Photo added on the page — drag to reposition." : "Photo field added — drop a tray photo onto it.")
  }

  function addPhotoField() {
    const stack = settings.canvasItems.length
    addPhotoFieldAt(null, 40 + (stack % 3) * 24, 60 + stack * 28)
  }

  function onCreatePhotoAtDrop(imageUrl: string, offsetX: number, offsetY: number) {
    addPhotoFieldAt(imageUrl, offsetX, offsetY)
    setContextMenu(null)
  }

  function removeCanvasItem(itemId: string) {
    setSettings((s) => {
      const textStyles = { ...s.textStyles }
      const textStylesMobile = { ...s.textStylesMobile }
      delete textStyles[`canvas.${itemId}`]
      delete textStylesMobile[`canvas.${itemId}`]
      return {
        ...s,
        canvasItems: s.canvasItems.filter((c) => c.id !== itemId),
        textStyles,
        textStylesMobile,
      }
    })
    setSelectedTargetId(null)
    setContextMenu(null)
  }

  function setCanvasItemOnAllPages(itemId: string, allPages: boolean) {
    setSettings((s) => {
      const pages = allPages ? enabledWebsitePublicPageIds(s) : [previewPage]
      return {
        ...s,
        canvasItems: s.canvasItems.map((c) => (c.id === itemId ? { ...c, pages } : c)),
      }
    })
  }

  function moveCanvasItem(itemId: string, dir: -1 | 1) {
    setSettings((s) => {
      const list = [...s.canvasItems]
      const from = list.findIndex((c) => c.id === itemId)
      const to = from + dir
      if (from < 0 || to < 0 || to >= list.length) return s
      const tmp = list[from]
      list[from] = list[to]
      list[to] = tmp
      return { ...s, canvasItems: list }
    })
  }

  function canvasPageScopeControl(item: WebsiteCanvasItem) {
    const allPages = enabledWebsitePublicPageIds(settings)
    const onAll = canvasItemOnAllEnabledPages(item, allPages)
    return (
      <fieldset style={{ display: "grid", gap: 6, margin: 0, padding: 0, border: "none" }}>
        <legend style={{ fontSize: 11, fontWeight: 800, color: "#334155" }}>Show this field on</legend>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
          <input
            type="radio"
            name={`canvas-pages-${item.id}`}
            checked={!onAll}
            onChange={() => setCanvasItemOnAllPages(item.id, false)}
          />
          This page only
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
          <input
            type="radio"
            name={`canvas-pages-${item.id}`}
            checked={onAll}
            onChange={() => setCanvasItemOnAllPages(item.id, true)}
          />
          Home and all subpages
        </label>
      </fieldset>
    )
  }

  function addSubPage() {
    setSettings((s) => {
      if (!s.subPages.about.enabled) {
        return { ...s, subPages: { ...s.subPages, about: { ...s.subPages.about, enabled: true } } }
      }
      if (!s.subPages.contact.enabled) {
        return { ...s, subPages: { ...s.subPages, contact: { ...s.subPages.contact, enabled: true } } }
      }
      const id = `page_${Date.now().toString(36)}`
      return {
        ...s,
        customPages: [
          ...s.customPages,
          { id, enabled: true, title: "New page", body: "Tell customers about this topic…" },
        ].slice(0, 6),
      }
    })
    setMessage("Sub-page ready — use the preview page tabs to open it.")
  }

  function addSocialPlatform(platform: WebsiteSocialPlatformId) {
    setSettings((s) => ({
      ...s,
      showSocialLinks: true,
      socialLinks: {
        ...s.socialLinks,
        [platform]: s.socialLinks[platform] || "",
      },
      facebookUrl: platform === "facebook" ? s.facebookUrl || s.socialLinks.facebook || "" : s.facebookUrl,
      instagramUrl: platform === "instagram" ? s.instagramUrl || s.socialLinks.instagram || "" : s.instagramUrl,
    }))
    setMessage(`Add the ${platform} URL below, then Save & publish.`)
  }

  function setSocialUrl(platform: WebsiteSocialPlatformId, url: string) {
    setSettings((s) => {
      const socialLinks = { ...s.socialLinks }
      if (!url.trim()) delete socialLinks[platform]
      else socialLinks[platform] = url.trim()
      return {
        ...s,
        socialLinks,
        facebookUrl: platform === "facebook" ? url.trim() : s.facebookUrl,
        instagramUrl: platform === "instagram" ? url.trim() : s.instagramUrl,
        showSocialLinks: true,
      }
    })
  }

  function removeSelected() {
    if (!selectedTargetId) return
    const canvasId = getCanvasItemIdFromTarget(selectedTargetId)
    if (canvasId) {
      removeCanvasItem(canvasId)
      return
    }
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
      return
    }
    setSettings((s) => hideWebsiteEditTarget(s, selectedTargetId, previewDevice))
    setSelectedTargetId(null)
    setContextMenu(null)
  }

  const selectedKind = selectedTargetId
    ? resolveWebsiteEditTargetKind(selectedTargetId, settings.canvasItems)
    : null
  const selectedCanvasId = selectedTargetId ? getCanvasItemIdFromTarget(selectedTargetId) : null
  const selectedCanvasItem = selectedCanvasId
    ? settings.canvasItems.find((c) => c.id === selectedCanvasId) || null
    : null
  const selectedText =
    selectedTargetId && selectedKind === "text" ? getWebsiteTextValue(settings, selectedTargetId) : ""
  const layoutStyles = previewDevice === "mobile" ? settings.textStylesMobile : settings.textStyles
  const selectedStyle = selectedTargetId ? layoutStyles[selectedTargetId] ?? {} : {}
  const hiddenSections = WEBSITE_HOME_SECTION_OPTIONS.filter((o) => settings.homeSections[o.id] === false)
  const hiddenFields = hiddenWebsiteEditTargetIds(layoutStyles)
  const navBar = settings.navBar ?? defaultWebsiteNavBar()
  const showTemplatesAtTop = !settings.enabled || !settings.publishedSlug
  const brandSwatches: Array<{ label: string; color: string }> = [
    { label: "Primary", color: settings.theme.primaryColor },
    { label: "Accent", color: settings.theme.accentColor },
    { label: "Secondary", color: settings.theme.secondaryColor },
    ...(settings.theme.customColors ?? []).map((color, i) => ({ label: `Custom ${i + 1}`, color })),
  ]

  function applySelectedColor(hex: string) {
    if (!selectedTargetId) return
    if (selectedKind === "image") {
      patchTextStyle(selectedTargetId, { tintColor: hex, tintOpacity: selectedStyle.tintOpacity ?? 40 })
      return
    }
    patchTextStyle(selectedTargetId, { color: hex })
  }

  function onTemplateChange(id: BusinessProfileTemplateId) {
    if (id === "hair_plumbing" && !isHairPlumbingAccount) {
      setSettings((s) => ({ ...s, templateId: "showcase" }))
      setMessage("Classic template is reserved for Hair Plumbing — Showcase selected.")
      return
    }
    setSettings((s) => ({ ...s, templateId: id }))
  }

  function loadDraft(draft: WebsiteSavedDraft) {
    const parsed = parseBusinessPublicProfileSettings({
      [BUSINESS_PUBLIC_PROFILE_META_KEY]: draft.snapshot,
    })
    setSettings((s) => ({
      ...parsed,
      enabled: s.enabled,
      publishedSlug: s.publishedSlug,
      customDomain: s.customDomain,
      savedDrafts: s.savedDrafts,
      navBar: parsed.navBar ?? defaultWebsiteNavBar(),
    }))
    setSelectedTargetId(null)
    setMessage(`Loaded draft “${draft.name}”.`)
  }

  async function saveAsDraft() {
    const stamp = new Date()
    const draft: WebsiteSavedDraft = {
      id: `draft_${stamp.getTime()}`,
      name: `Draft ${stamp.toLocaleString()}`,
      savedAt: stamp.toISOString(),
      snapshot: cloneSettings(settings) as unknown as Record<string, unknown>,
    }
    const next: BusinessPublicProfileSettings = {
      ...settings,
      savedDrafts: [draft, ...(settings.savedDrafts ?? [])].slice(0, 20),
    }
    await persist(next, { draft: true })
  }

  function renderTemplatesCard(compact: boolean) {
    return (
      <details style={{ ...sectionCard, ...(compact ? { padding: 10, gap: 8 } : null) }}>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>
          {compact ? "Templates" : "Choose a template"}
        </summary>
        {!compact ? (
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Pick a layout before you publish. Saved drafts appear here too.
          </p>
        ) : null}
        <BusinessProfileTemplatePicker value={settings.templateId} onChange={onTemplateChange} theme={settings.theme} />
        {(settings.savedDrafts ?? []).length ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>Saved drafts</div>
            {(settings.savedDrafts ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => loadDraft(d)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        ) : null}
      </details>
    )
  }

  if (loading) {
    return <p style={{ margin: 24, color: "#64748b" }}>Loading website builder…</p>
  }

  const previewEditor = {
    selectedTargetId,
    onSelectTarget,
    onTargetContextMenu,
    onDropImageOnSlot,
    onDropImageOnCanvasItem,
    onCreatePhotoAtDrop,
    onPatchTextStyle: patchTextStyle,
  }

  return (
    <div className="wb-root">
      <style>{`
        .wb-root {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          height: calc(100vh - 64px);
          max-height: calc(100vh - 64px);
          overflow: hidden;
        }
        .wb-editor {
          color: ${EDITOR_INK};
          min-height: 0;
          height: 100%;
          overflow: auto;
        }
        .wb-editor input, .wb-editor textarea, .wb-editor select, .wb-editor button { color: ${EDITOR_INK}; }
        .wb-preview {
          min-height: 0;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .wb-preview-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }
        .wb-phone-stage {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 20px 12px 32px;
          box-sizing: border-box;
          min-height: 100%;
        }
        .wb-phone-frame {
          width: 390px;
          height: 844px;
          flex-shrink: 0;
          border-radius: 36px;
          border: 10px solid #1e293b;
          box-shadow: 0 20px 50px rgba(0,0,0,0.45);
          overflow: hidden;
          background: #111;
          position: relative;
        }
        .wb-phone-screen {
          width: 100%;
          height: 100%;
          overflow: auto;
          overflow-x: hidden;
          background: #111;
        }
        @media (max-width: 960px) {
          .wb-root {
            grid-template-columns: 1fr;
            height: auto;
            max-height: none;
            overflow: visible;
          }
          .wb-editor { height: auto; max-height: 50vh; }
          .wb-preview { min-height: 70vh; height: auto; }
        }
      `}</style>

      <aside
        className="wb-editor"
        style={{
          borderRight: `1px solid ${theme.border}`,
          background: "#f8fafc",
          padding: 14,
          display: "grid",
          gap: 12,
          alignContent: "start",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Website Builder</h1>
        </div>

        <div style={{ ...sectionCard, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 6 }}>History</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!canUndo}
              onClick={undo}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: canUndo ? "#fff" : "#f1f5f9",
                fontWeight: 800,
                cursor: canUndo ? "pointer" : "not-allowed",
                opacity: canUndo ? 1 : 0.55,
              }}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={redo}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: canRedo ? "#fff" : "#f1f5f9",
                fontWeight: 800,
                cursor: canRedo ? "pointer" : "not-allowed",
                opacity: canRedo ? 1 : 0.55,
              }}
            >
              Redo
            </button>
          </div>
        </div>

        {showTemplatesAtTop ? renderTemplatesCard(false) : null}

        {selectedTargetId && selectedKind === "text" ? (
          <div style={{ ...sectionCard, borderColor: "#2563eb", boxShadow: "0 0 0 1px rgba(37,99,235,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>
                {selectedCanvasItem ? "Custom text field" : websiteEditTargetLabel(selectedTargetId)}
              </div>
              <button
                type="button"
                title="Deselect"
                aria-label="Deselect"
                onClick={() => onSelectTarget(null)}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  fontWeight: 800,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {selectedCanvasItem ? canvasPageScopeControl(selectedCanvasItem) : null}
            <textarea
              rows={selectedTargetId.includes("body") || selectedTargetId === "hero.headline" || selectedCanvasItem ? 4 : 2}
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
                  onChange={(e) => patchTextStyle(selectedTargetId, { color: e.target.value })}
                  style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Size
                <select
                  value={selectedStyle.fontSize || ""}
                  onChange={(e) => patchTextStyle(selectedTargetId, { fontSize: e.target.value || undefined })}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brandSwatches.map((sw) => (
                <button
                  key={sw.label}
                  type="button"
                  title={sw.label}
                  onClick={() => applySelectedColor(sw.color)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: sw.color, border: "1px solid #cbd5e1" }} />
                  {sw.label}
                </button>
              ))}
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Font
              <select
                  value={selectedStyle.fontFamily || ""}
                  onChange={(e) => patchTextStyle(selectedTargetId, { fontFamily: e.target.value || undefined })}
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
            {selectedCanvasItem ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={selectedStyle.showFieldBackground === true}
                    onChange={(e) =>
                      patchTextStyle(selectedTargetId, {
                        showFieldBackground: e.target.checked,
                        ...(e.target.checked && !selectedStyle.fieldBackgroundColor
                          ? { fieldBackgroundColor: "#ffffff" }
                          : {}),
                      })
                    }
                  />
                  Text background panel
                </label>
                {selectedStyle.showFieldBackground ? (
                  <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    Background color
                    <input
                      type="color"
                      value={selectedStyle.fieldBackgroundColor || "#ffffff"}
                      onChange={(e) => patchTextStyle(selectedTargetId, { fieldBackgroundColor: e.target.value })}
                      style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${theme.border}` }}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={selectedStyle.scrollFixed === true}
                onChange={(e) => patchTextStyle(selectedTargetId, { scrollFixed: e.target.checked })}
              />
              Fixed while scrolling
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  patchTextStyle(selectedTargetId, {
                    fontWeight: selectedStyle.fontWeight === "700" ? "400" : "700",
                  })
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
                  patchTextStyle(selectedTargetId, {
                    fontStyle: selectedStyle.fontStyle === "italic" ? "normal" : "italic",
                  })
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
              {selectedTargetId && selectedKind === "text" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCanvasItem) {
                      removeCanvasItem(selectedCanvasItem.id)
                      setMessage("Field removed from the editor. Tap Save & publish to update the live site.")
                    }
                    else removeSelected()
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#b91c1c",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Remove field
                </button>
              ) : null}
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
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Link to
              <select
                value={(selectedStyle.linkTarget as WebsiteBuiltInLinkTarget | undefined) || (selectedTargetId === "hero.cta" ? "contact" : "none")}
                onChange={(e) => {
                  const value = e.target.value as WebsiteBuiltInLinkTarget
                  patchTextStyle(selectedTargetId, { linkTarget: value === "none" ? undefined : value })
                }}
                style={field}
              >
                {WEBSITE_BUILT_IN_LINK_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
              Drag the field on the preview to move it. Corner handle resizes width.
            </p>
          </div>
        ) : selectedTargetId && selectedKind === "section" ? (
          <div style={{ ...sectionCard, borderColor: "#2563eb" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{websiteEditTargetLabel(selectedTargetId)}</div>
              <button
                type="button"
                title="Deselect"
                aria-label="Deselect"
                onClick={() => onSelectTarget(null)}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  fontWeight: 800,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
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
          <div style={{ ...sectionCard, borderColor: "#2563eb", boxShadow: "0 0 0 1px rgba(37,99,235,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>
                {selectedCanvasItem ? "Custom photo field" : websiteEditTargetLabel(selectedTargetId)}
              </div>
              <button
                type="button"
                title="Deselect"
                aria-label="Deselect"
                onClick={() => onSelectTarget(null)}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  fontWeight: 800,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {selectedCanvasItem ? canvasPageScopeControl(selectedCanvasItem) : null}
            <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
              {selectedTargetId === "slot.background"
                ? "Background selected — set tint below, or drag a tray photo onto the page to replace the background."
                : selectedCanvasItem
                  ? "Drag a photo from the tray onto this field on the page. Drag to move; corner handle to resize."
                  : "Drag a photo from the tray below onto this slot, or clear it."}
            </p>
            {selectedTargetId === "slot.background" ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>Background tint</div>
                <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                  Tint color
                  <input
                    type="color"
                    value={selectedStyle.tintColor || "#0f172a"}
                    onChange={(e) => patchTextStyle(selectedTargetId, { tintColor: e.target.value })}
                    style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${theme.border}` }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                  Tint strength ({selectedStyle.tintOpacity ?? 0}%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedStyle.tintOpacity ?? 0}
                    onChange={(e) => patchTextStyle(selectedTargetId, { tintOpacity: Number(e.target.value) })}
                  />
                </label>
              </div>
            ) : null}
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Scale mode
              <select
                value={selectedStyle.scaleMode || "fixed"}
                onChange={(e) =>
                  patchTextStyle(selectedTargetId, {
                    scaleMode: e.target.value === "free" ? "free" : "fixed",
                  })
                }
                style={field}
              >
                <option value="fixed">Fixed scale</option>
                <option value="free">Free scale</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Size ({selectedStyle.imageSize ?? selectedStyle.maxWidth ?? 120}px)
              <input
                type="range"
                min={40}
                max={640}
                value={selectedStyle.imageSize ?? selectedStyle.maxWidth ?? (selectedCanvasItem ? 200 : 120)}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  patchTextStyle(selectedTargetId, {
                    imageSize: n,
                    maxWidth: n,
                  })
                }}
              />
            </label>
            {(selectedStyle.scaleMode === "free" || selectedCanvasItem) && (
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Height ({selectedStyle.imageSize ?? 150}px)
                <input
                  type="range"
                  min={40}
                  max={640}
                  value={selectedStyle.imageSize ?? 150}
                  onChange={(e) => patchTextStyle(selectedTargetId, { imageSize: Number(e.target.value) })}
                />
              </label>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800 }}>Tint</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {brandSwatches.map((sw) => (
                  <button
                    key={`tint-${sw.label}`}
                    type="button"
                    title={sw.label}
                    onClick={() =>
                      patchTextStyle(selectedTargetId, {
                        tintColor: sw.color,
                        tintOpacity: selectedStyle.tintOpacity ?? 35,
                      })
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: sw.color }} />
                    {sw.label}
                  </button>
                ))}
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Tint color
                <input
                  type="color"
                  value={selectedStyle.tintColor || settings.theme.primaryColor}
                  onChange={(e) => patchTextStyle(selectedTargetId, { tintColor: e.target.value })}
                  style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Tint strength ({selectedStyle.tintOpacity ?? 0}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedStyle.tintOpacity ?? 0}
                  onChange={(e) => patchTextStyle(selectedTargetId, { tintOpacity: Number(e.target.value) })}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800 }}>Crop</div>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Focus X ({selectedStyle.cropX ?? 50}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedStyle.cropX ?? 50}
                  onChange={(e) => patchTextStyle(selectedTargetId, { cropX: Number(e.target.value) })}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Focus Y ({selectedStyle.cropY ?? 50}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedStyle.cropY ?? 50}
                  onChange={(e) => patchTextStyle(selectedTargetId, { cropY: Number(e.target.value) })}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                Zoom ({selectedStyle.cropZoom ?? 100}%)
                <input
                  type="range"
                  min={100}
                  max={300}
                  value={selectedStyle.cropZoom ?? 100}
                  onChange={(e) => patchTextStyle(selectedTargetId, { cropZoom: Number(e.target.value) })}
                />
              </label>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={selectedStyle.scrollFixed === true}
                onChange={(e) => patchTextStyle(selectedTargetId, { scrollFixed: e.target.checked })}
              />
              Fixed while scrolling
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  if (selectedCanvasItem) {
                    setSettings((s) => ({
                      ...s,
                      canvasItems: s.canvasItems.map((c) =>
                        c.id === selectedCanvasItem.id ? { ...c, imageUrl: null } : c,
                      ),
                    }))
                  } else {
                    removeSelected()
                  }
                }}
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
              {selectedCanvasItem ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      removeCanvasItem(selectedCanvasItem.id)
                      setMessage("Field removed from the editor. Tap Save & publish to update the live site.")
                    }}
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
                  Remove field
                </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedTargetId(null)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div style={sectionCard}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Nothing selected</div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Click a field in the preview, then drag it — headlines, body copy, service/feature photos, and freeform
              items all move. Use Quick add for new text/photo fields you can place anywhere.
            </p>
          </div>
        )}

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
              onClick={() => void persist({ ...settings, enabled: true })}
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
              disabled={saving}
              onClick={() => void saveAsDraft()}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: EDITOR_INK,
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              Save as draft
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

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Quick add</summary>
          <div style={{ display: "grid", gap: 6 }}>
            {(
              [
                ["Add a text field", addTextField],
                ["Add photo field", addPhotoField],
                ["Add new sub-page", addSubPage],
              ] as const
            ).map(([label, fn]) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  textAlign: "left",
                  color: EDITOR_INK,
                }}
              >
                + {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 4 }}>Add social media link</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {WEBSITE_SOCIAL_PLATFORM_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                onClick={() => addSocialPlatform(opt.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <PlatformBadge id={opt.id} size={18} />
                {opt.label}
              </button>
            ))}
          </div>
          {Object.keys(settings.socialLinks).length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {WEBSITE_SOCIAL_PLATFORM_OPTIONS.filter((opt) => opt.id in settings.socialLinks).map((opt) => (
                <label key={opt.id} style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PlatformBadge id={opt.id} size={18} />
                    {opt.label} URL
                  </span>
                  <input
                    value={settings.socialLinks[opt.id] || ""}
                    onChange={(e) => setSocialUrl(opt.id, e.target.value)}
                    placeholder={`https://…`}
                    style={field}
                  />
                </label>
              ))}
            </div>
          ) : null}
          {settings.customPages.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800 }}>Custom sub-pages</div>
              {settings.customPages.map((page) => (
                <div key={page.id} style={{ display: "grid", gap: 6, padding: 8, borderRadius: 8, border: `1px solid ${theme.border}` }}>
                  <input
                    value={page.title}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        customPages: s.customPages.map((p) => (p.id === page.id ? { ...p, title: e.target.value } : p)),
                      }))
                    }
                    style={field}
                  />
                  <textarea
                    rows={3}
                    value={page.body}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        customPages: s.customPages.map((p) => (p.id === page.id ? { ...p, body: e.target.value } : p)),
                      }))
                    }
                    style={{ ...field, resize: "vertical", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        customPages: s.customPages.filter((p) => p.id !== page.id),
                      }))
                    }
                    style={{
                      justifySelf: "start",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fff1f2",
                      color: "#b91c1c",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    Remove page
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </details>

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Top navigation bar</summary>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Show or hide each piece of the top bar. Turn everything off to hide the bar.
          </p>
          {(
            [
              ["showLogo", "Logo"],
              ["showBusinessName", "Company name"],
              ["showHome", "Home"],
              ["showAbout", "About Us"],
              ["showContact", "Contact"],
              ["showCall", "Call button"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={navBar[key] !== false}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    navBar: { ...(s.navBar ?? defaultWebsiteNavBar()), [key]: e.target.checked },
                  }))
                }
              />
              {label}
            </label>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Bar background
              <input
                type="color"
                value={navBar.backgroundColor || "#ffffff"}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    navBar: { ...(s.navBar ?? defaultWebsiteNavBar()), backgroundColor: e.target.value },
                  }))
                }
                style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700 }}>
              Bar text
              <input
                type="color"
                value={navBar.textColor || "#0f172a"}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    navBar: { ...(s.navBar ?? defaultWebsiteNavBar()), textColor: e.target.value },
                  }))
                }
                style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
          </div>
        </details>

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Scroll bands</summary>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Dark/light bars that scroll over the fixed background. Add, remove, recolor, or texture them.
          </p>
          {settings.scrollBands.map((band, idx) => (
            <div key={band.id} style={{ display: "grid", gap: 6, padding: 8, borderRadius: 8, border: `1px solid ${theme.border}` }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={band.enabled !== false}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      scrollBands: s.scrollBands.map((b, i) => (i === idx ? { ...b, enabled: e.target.checked } : b)),
                    }))
                  }
                />
                Visible
              </label>
              <input
                value={band.title}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    scrollBands: s.scrollBands.map((b, i) => (i === idx ? { ...b, title: e.target.value } : b)),
                  }))
                }
                placeholder="Band title"
                style={field}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
                  Tone
                  <select
                    value={band.tone}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        scrollBands: s.scrollBands.map((b, i) =>
                          i === idx
                            ? { ...b, tone: e.target.value as WebsiteScrollBand["tone"] }
                            : b,
                        ),
                      }))
                    }
                    style={field}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="clear">Clear</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
                  Color
                  <input
                    type="color"
                    value={band.backgroundColor || (band.tone === "light" ? "#ffffff" : "#000000")}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        scrollBands: s.scrollBands.map((b, i) =>
                          i === idx ? { ...b, backgroundColor: e.target.value } : b,
                        ),
                      }))
                    }
                    style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
                  />
                </label>
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
                Texture
                <select
                  value={band.texture || "none"}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      scrollBands: s.scrollBands.map((b, i) =>
                        i === idx
                          ? {
                              ...b,
                              texture: e.target.value === "none" ? undefined : (e.target.value as WebsiteScrollBand["texture"]),
                            }
                          : b,
                      ),
                    }))
                  }
                  style={field}
                >
                  {WEBSITE_BAND_TEXTURE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
                Overlay ({band.overlayOpacity ?? 85}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={band.overlayOpacity ?? 85}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      scrollBands: s.scrollBands.map((b, i) =>
                        i === idx ? { ...b, overlayOpacity: Number(e.target.value) } : b,
                      ),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    scrollBands: s.scrollBands.filter((_, i) => i !== idx),
                  }))
                }
                style={{
                  justifySelf: "start",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#b91c1c",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Remove band
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={settings.scrollBands.length >= 12}
            onClick={() =>
              setSettings((s) => ({
                ...s,
                scrollBands: [
                  ...s.scrollBands,
                  {
                    id: `band_${Date.now()}`,
                    title: "New band",
                    body: "",
                    tone: "dark",
                    enabled: true,
                  },
                ],
              }))
            }
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              fontWeight: 800,
              cursor: settings.scrollBands.length >= 12 ? "not-allowed" : "pointer",
            }}
          >
            + Add scroll band
          </button>
        </details>

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Photos</summary>
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
              title="Browser tab icon (favicon)"
            >
              {uploadingFavicon ? "Uploading…" : "Browser icon"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
                hidden
                onChange={(e) => void onFaviconUpload(e)}
                disabled={uploadingFavicon}
              />
            </label>
          </div>
          {settings.faviconUrl || settings.profilePhotoUrl || contact.companyLogoUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#475569" }}>
              <img
                src={settings.faviconUrl || settings.profilePhotoUrl || contact.companyLogoUrl || ""}
                alt=""
                style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff" }}
              />
              <span style={{ flex: 1 }}>
                Browser tab icon {settings.faviconUrl ? "(custom)" : "(uses logo until you upload one)"}
              </span>
              {settings.faviconUrl ? (
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, faviconUrl: null }))}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
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
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK, marginTop: 8 }}>Stationary background</div>
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
        </details>

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900, color: EDITOR_INK }}>Section order</summary>
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
                  onClick={() => {
                    const targetId = `section.${id}`
                    setSelectedTargetId(targetId)
                    setContextMenu(null)
                    requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-edit-target="${targetId}"]`) as HTMLElement | null
                      el?.scrollIntoView({ behavior: "smooth", block: "center" })
                    })
                    setMessage(`Selected ${opt?.label ?? id} — use the inspector options above for this section.`)
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: on ? "#fff" : "#f1f5f9",
                    color: EDITOR_INK,
                    cursor: "pointer",
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
          {settings.canvasItems.length ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK, marginTop: 10 }}>Custom fields</div>
              <div style={{ display: "grid", gap: 6 }}>
                {settings.canvasItems.map((item) => {
                  const label =
                    item.kind === "text"
                      ? (item.text || "Text field").replace(/\s+/g, " ").trim().slice(0, 42) || "Text field"
                      : "Photo field"
                  const pages = item.pages && item.pages.length ? item.pages : enabledWebsitePublicPageIds(settings)
                  const scope =
                    !item.pages || item.pages.length === 0 || canvasItemOnAllEnabledPages(item, enabledWebsitePublicPageIds(settings))
                      ? "All pages"
                      : pages.length === 1
                        ? "This page"
                        : `${pages.length} pages`
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        const targetId = `canvas.${item.id}`
                        setSelectedTargetId(targetId)
                        setContextMenu(null)
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${theme.border}`,
                        background: selectedTargetId === `canvas.${item.id}` ? "#eff6ff" : "#fff",
                        color: EDITOR_INK,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: 12, color: "#64748b" }}>⋮⋮</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: EDITOR_INK }}>
                        {label}
                        <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748b" }}>{scope}</span>
                      </span>
                      <button
                        type="button"
                        title="Move up"
                        onClick={(e) => {
                          e.stopPropagation()
                          moveCanvasItem(item.id, -1)
                        }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: EDITOR_INK, fontWeight: 900 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        onClick={(e) => {
                          e.stopPropagation()
                          moveCanvasItem(item.id, 1)
                        }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: EDITOR_INK, fontWeight: 900 }}
                      >
                        ↓
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK, marginTop: 10 }}>Add / restore sections</div>
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
          <div style={{ fontSize: 12, fontWeight: 900, color: EDITOR_INK, marginTop: 10 }}>Hidden fields</div>
          {hiddenFields.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Right-click any headline, tagline, or button → Remove field. Restore it here.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hiddenFields.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSettings((s) => showWebsiteEditTarget(s, id, previewDevice))}
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
                  + {websiteEditTargetLabel(id)}
                </button>
              ))}
            </div>
          )}
        </details>

        <details style={sectionCard}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Brand colors</summary>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Primary, Accent, and Secondary appear on selected text/images. Add extra colors, or randomize.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(
              [
                ["primaryColor", "Primary"],
                ["accentColor", "Accent"],
                ["secondaryColor", "Secondary"],
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
              Field background
              <input
                type="color"
                value={settings.theme.fieldBackgroundColor}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, theme: { ...s.theme, fieldBackgroundColor: e.target.value } }))
                }
                style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, fontWeight: 700 }}>
              Default text
              <input
                type="color"
                value={settings.theme.fontColor}
                onChange={(e) => setSettings((s) => ({ ...s, theme: { ...s.theme, fontColor: e.target.value } }))}
                style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {(settings.theme.customColors ?? []).map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                title="Remove custom color"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    theme: {
                      ...s.theme,
                      customColors: (s.theme.customColors ?? []).filter((_, idx) => idx !== i),
                    },
                  }))
                }
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `2px solid ${theme.border}`,
                  background: c,
                  cursor: "pointer",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                const hex = `#${Math.floor(Math.random() * 0xffffff)
                  .toString(16)
                  .padStart(6, "0")}`
                setSettings((s) => ({
                  ...s,
                  theme: {
                    ...s.theme,
                    customColors: [...(s.theme.customColors ?? []), hex].slice(0, 12),
                  },
                }))
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              + Add color
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, theme: randomizeBusinessProfileTheme(s.theme) }))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Randomize
            </button>
          </div>
        </details>

        {!showTemplatesAtTop ? renderTemplatesCard(true) : null}

        <details style={sectionCard} open={dnsOpen} onToggle={(e) => setDnsOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>Custom domain / DNS</summary>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
            Put the <strong>customer’s public domain</strong> here (example: <code>www.hairplumbing.com</code>).
            Saving in this editor updates the live Tradesman-hosted site immediately — there is no separate “push to
            Vercel” step for content.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
            <strong>Important:</strong> add <code>hairplumbing.com</code> / <code>www.hairplumbing.com</code> on the{" "}
            <strong>Tradesman</strong> Vercel project (this app — tradesman-us.com), not the old static{" "}
            <code>hair-plumbing.vercel.app</code> project. That static project is only a leftover Design.com shell.
            Point Squarespace DNS at the Tradesman project so visitors see what you edit here.
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
            {`At Squarespace (or their DNS host) for hairplumbing.com:

A record (apex) → ${VERCEL_DNS_INSTRUCTIONS.apexA}
CNAME www → ${VERCEL_DNS_INSTRUCTIONS.wwwCname}
  (or CNAME www → cname.vercel-dns.com)

In Vercel → Tradesman project → Settings → Domains:
  add hairplumbing.com and www.hairplumbing.com

${VERCEL_DNS_INSTRUCTIONS.note}

Editor save → Supabase profile → public site.
Custom domain only routes that same published site to their brand URL.

Working URL today: ${slug ? businessWebProfilePublicUrl(slug, typeof window !== "undefined" ? window.location.origin : undefined) : "https://www.tradesman-us.com/hair-plumbing"}`}
          </pre>
        </details>

      </aside>

      <main className="wb-preview" style={{ background: "#0f172a" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            flexShrink: 0,
            zIndex: 5,
            background: "rgba(15,23,42,0.96)",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            {settings.customPages.filter((p) => p.enabled !== false).map((page) => {
              const id = `custom:${page.id}` as WebsitePublicPageId
              return (
                <button
                  key={page.id}
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
                  {page.title || "Page"}
                </button>
              )
            })}
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
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "rgba(255,255,255,0.72)", lineHeight: 1.4 }}>
            {previewDevice === "mobile"
              ? "Editing the Mobile layout. Moves and style changes here stay on phones and do not change Desktop."
              : "Editing the Desktop layout. Moves and style changes here stay on wide screens and do not change Mobile."}
          </p>
        </div>

        <div
          className="wb-preview-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "auto",
            boxSizing: "border-box",
            background: "#0b1220",
          }}
        >
          {previewDevice === "mobile" ? (
            <div className="wb-phone-stage">
              <div className="wb-phone-frame">
                <div className="wb-phone-screen">
                  <BusinessProfilePublicSite
                    data={previewData}
                    previewMode
                    layoutViewport="mobile"
                    activePage={previewPage}
                    onNavigatePage={setPreviewPage}
                    editor={previewEditor}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: WEBSITE_FREEFORM_DESIGN_WIDTH,
                minWidth: WEBSITE_FREEFORM_DESIGN_WIDTH,
                minHeight: "100%",
                margin: "0 auto",
                background: "#111",
                position: "relative",
              }}
            >
              <BusinessProfilePublicSite
                data={previewData}
                previewMode
                layoutViewport="desktop"
                activePage={previewPage}
                onNavigatePage={setPreviewPage}
                editor={previewEditor}
              />
            </div>
          )}
        </div>

        {contextMenu ? (
          <div
            role="menu"
            data-wb-context-menu
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 80,
              minWidth: 168,
              maxWidth: 240,
              background: "#ffffff",
              border: "1px solid #94a3b8",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
              padding: 4,
              color: "#0f172a",
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: "none",
                background: "transparent",
                borderRadius: 4,
                fontWeight: 650,
                fontSize: 12.5,
                lineHeight: 1.35,
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
            {websiteEditTargetKind(contextMenu.targetId) === "text" ||
            resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "text" ? (
              <>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = layoutStyles[id]?.fontSize || "22px"
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
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = layoutStyles[id]?.fontSize || "22px"
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
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
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
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const on = layoutStyles[id]?.scrollFixed === true
                    patchTextStyle(id, { scrollFixed: !on })
                    setContextMenu(null)
                  }}
                >
                  {layoutStyles[contextMenu.targetId]?.scrollFixed
                    ? "Unpin (scroll with page)"
                    : "Pin (fixed while scrolling)"}
                </button>
              </>
            ) : null}
            {resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "image" ? (
              <>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = layoutStyles[id]?.scaleMode || "fixed"
                    patchTextStyle(id, { scaleMode: cur === "free" ? "fixed" : "free" })
                    setSelectedTargetId(id)
                    setContextMenu(null)
                  }}
                >
                  {(layoutStyles[contextMenu.targetId]?.scaleMode || "fixed") === "free"
                    ? "Use fixed scale"
                    : "Use free scale"}
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = layoutStyles[id]?.imageSize ?? layoutStyles[id]?.maxWidth ?? 120
                    patchTextStyle(id, { imageSize: Math.min(640, cur + 24), maxWidth: Math.min(640, cur + 24) })
                    setContextMenu(null)
                  }}
                >
                  Larger image
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const cur = layoutStyles[id]?.imageSize ?? layoutStyles[id]?.maxWidth ?? 120
                    patchTextStyle(id, { imageSize: Math.max(40, cur - 24), maxWidth: Math.max(40, cur - 24) })
                    setContextMenu(null)
                  }}
                >
                  Smaller image
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    setSelectedTargetId(contextMenu.targetId)
                    setContextMenu(null)
                    setMessage("Adjust crop focus and zoom in the left inspector.")
                  }}
                >
                  Crop…
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    patchTextStyle(id, {
                      tintColor: settings.theme.primaryColor,
                      tintOpacity: Math.min(100, (layoutStyles[id]?.tintOpacity ?? 0) + 20 || 35),
                    })
                    setSelectedTargetId(id)
                    setContextMenu(null)
                  }}
                >
                  Tint…
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 4,
                    fontWeight: 650,
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                  onClick={() => {
                    const id = contextMenu.targetId
                    const on = layoutStyles[id]?.scrollFixed === true
                    patchTextStyle(id, { scrollFixed: !on })
                    setSelectedTargetId(id)
                    setContextMenu(null)
                  }}
                >
                  {layoutStyles[contextMenu.targetId]?.scrollFixed
                    ? "Unpin (scroll with page)"
                    : "Pin (fixed while scrolling)"}
                </button>
              </>
            ) : null}
            {(resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "section" ||
              resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "image" ||
              getCanvasItemIdFromTarget(contextMenu.targetId) ||
              resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "text") && (
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
                  const canvasId = getCanvasItemIdFromTarget(tid)
                  if (canvasId) {
                    removeCanvasItem(canvasId)
                    return
                  }
                  const sectionId = sectionIdFromEditTarget(tid)
                  if (sectionId) {
                    setSettings((s) => hideSectionFromSettings(s, sectionId))
                    setSelectedTargetId(null)
                    return
                  }
                  if (tid.startsWith("slot.")) {
                    assignSlot(tid.slice("slot.".length) as WebsiteImageSlotId, null)
                    setSelectedTargetId(null)
                    return
                  }
                  setSettings((s) => hideWebsiteEditTarget(s, tid, previewDevice))
                  setSelectedTargetId(null)
                }}
              >
                {getCanvasItemIdFromTarget(contextMenu.targetId)
                  ? "Remove field"
                  : resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "image"
                    ? "Clear image"
                    : resolveWebsiteEditTargetKind(contextMenu.targetId, settings.canvasItems) === "section"
                      ? "Remove section"
                      : "Remove field"}
              </button>
            )}
          </div>
        ) : null}
      </main>
    </div>
  )
}
