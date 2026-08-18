import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import logo from "../../assets/logo.png"
import { PhotoLightbox } from "../../components/PhotoLightbox"
import type {
  BusinessProfileTemplateId,
  BusinessProfileTheme,
  WebsiteContentCard,
  WebsiteHomeSectionId,
  WebsiteHomeSections,
  WebsiteImageSlots,
  WebsitePublicPageId,
  WebsiteScrollBand,
  WebsiteSubPages,
  WebsiteTextStyle,
  WebsiteTextStyles,
} from "../../lib/businessPublicProfile"
import {
  DEFAULT_BUSINESS_PROFILE_THEME,
  defaultWebsiteFeatureCards,
  defaultWebsiteHomeSectionOrder,
  defaultWebsiteServiceCards,
  defaultWebsiteSubPages,
  emptyWebsiteHomeSections,
  resolveWebsiteSlotImage,
  websiteTextStyleToCss,
} from "../../lib/businessPublicProfile"

export type PublicBusinessProfileData = {
  ok: true
  slug: string
  businessName: string
  tagline?: string
  aboutUs?: string
  profilePhotoUrl?: string | null
  workPhotoUrls?: string[]
  phone?: string | null
  email?: string | null
  address?: string | null
  serviceArea?: string | null
  serviceAreas?: string[]
  servicesOffered?: string[]
  businessHours?: Array<{ day: string; hours: string }>
  templateId?: BusinessProfileTemplateId
  theme?: BusinessProfileTheme
  showContactForm?: boolean
  facebookUrl?: string | null
  instagramUrl?: string | null
  imageSlots?: WebsiteImageSlots
  scrollBands?: WebsiteScrollBand[]
  heroHeadline?: string
  ctaLabel?: string
  customDomain?: string
  homeSections?: WebsiteHomeSections
  subPages?: WebsiteSubPages
  featureCards?: WebsiteContentCard[]
  serviceCards?: WebsiteContentCard[]
  textStyles?: WebsiteTextStyles
  homeSectionOrder?: WebsiteHomeSectionId[]
  fixedBackground?: boolean
  /** Client footer line (no Design.com / third-party watermarks). */
  footerCopyright?: string
  /** Opt-in Tradesman badge — off by default for Classic hosted sites. */
  showPoweredBy?: boolean
}

export type WebsiteCanvasEditorProps = {
  selectedTargetId?: string | null
  onSelectTarget?: (targetId: string | null) => void
  onTargetContextMenu?: (targetId: string, clientX: number, clientY: number) => void
  onDropImageOnSlot?: (slotId: string, imageUrl: string) => void
  onPatchTextStyle?: (targetId: string, patch: Partial<WebsiteTextStyle>) => void
  onReorderHomeSection?: (fromId: string, toId: string) => void
}

type ContactFormProps = {
  slug: string
  businessName: string
  theme: BusinessProfileTheme
}

function themeVars(theme: BusinessProfileTheme): CSSProperties {
  return {
    ["--bp-primary" as string]: theme.primaryColor,
    ["--bp-secondary" as string]: theme.secondaryColor,
    ["--bp-field-bg" as string]: theme.fieldBackgroundColor,
    ["--bp-font" as string]: theme.fontColor,
    ["--bp-accent" as string]: theme.accentColor || "#b91c1c",
  }
}

function SocialFollowBlock({
  facebookUrl,
  instagramUrl,
}: {
  facebookUrl?: string | null
  instagramUrl?: string | null
}) {
  if (!facebookUrl && !instagramUrl) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>Follow us</SectionHeading>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15 }}>
          {facebookUrl ? (
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--bp-primary)", fontWeight: 700 }}>
              Facebook
            </a>
          ) : null}
          {instagramUrl ? (
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--bp-primary)", fontWeight: 700 }}>
              Instagram
            </a>
          ) : null}
        </div>
      </SectionFrame>
    </section>
  )
}

function PoweredByFooter() {
  return (
    <footer
      style={{
        width: "100%",
        padding: "28px 20px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        borderTop: "1px solid rgba(15,23,42,0.08)",
        background: "#fff",
        position: "relative",
        zIndex: 2,
      }}
    >
      <a href="https://www.tradesman-us.com" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <img src={logo} alt="Tradesman" style={{ height: 28, width: "auto" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Powered by Tradesman Systems LLC</span>
      </a>
    </footer>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2
      style={{
        margin: "0 0 12px",
        fontSize: 13,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--bp-secondary)",
        opacity: 0.72,
      }}
    >
      {children}
    </h2>
  )
}

function SectionFrame({ children, dense }: { children: ReactNode; dense?: boolean }) {
  return (
    <div
      className="bp-section-frame"
      style={{
        margin: dense ? "10px 0" : "14px 0",
        padding: dense ? "14px 16px" : "18px 18px",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.12)",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.03)",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  )
}

function ContactBlock({ data }: { data: PublicBusinessProfileData }) {
  if (!data.phone && !data.email && !data.address && !data.serviceArea) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>Contact us</SectionHeading>
        <div style={{ display: "grid", gap: 10, fontSize: 16, lineHeight: 1.55, color: "var(--bp-font)" }}>
          {data.phone ? (
            <div>
              <strong>Phone:</strong>{" "}
              <a href={`tel:${data.phone.replace(/\D/g, "")}`} style={{ color: "var(--bp-primary)", fontWeight: 700 }}>
                {data.phone}
              </a>
            </div>
          ) : null}
          {data.email ? (
            <div>
              <strong>Email:</strong>{" "}
              <a href={`mailto:${data.email}`} style={{ color: "var(--bp-primary)", fontWeight: 700 }}>
                {data.email}
              </a>
            </div>
          ) : null}
          {data.address ? (
            <div>
              <strong>Address:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{data.address}</span>
            </div>
          ) : null}
          {data.serviceArea ? (
            <div>
              <strong>Service radius:</strong> {data.serviceArea}
            </div>
          ) : null}
        </div>
      </SectionFrame>
    </section>
  )
}

function ServiceAreasBlock({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>Service areas</SectionHeading>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 16, color: "var(--bp-font)" }}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionFrame>
    </section>
  )
}

function ServicesBlock({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>Services offered</SectionHeading>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 16, color: "var(--bp-font)" }}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionFrame>
    </section>
  )
}

function HoursBlock({ hours }: { hours: Array<{ day: string; hours: string }> }) {
  if (!hours.length) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>Business hours</SectionHeading>
        <div style={{ display: "grid", gap: 6, fontSize: 15, color: "var(--bp-font)" }}>
          {hours.map((row) => (
            <div key={row.day} style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700 }}>{row.day}</span>
              <span>{row.hours}</span>
            </div>
          ))}
        </div>
      </SectionFrame>
    </section>
  )
}

function WorkPhotosBlock({
  urls,
  dense,
  onPhotoClick,
}: {
  urls: string[]
  dense?: boolean
  onPhotoClick?: (url: string, index: number) => void
}) {
  if (!urls.length) return null
  return (
    <section style={{ padding: dense ? "4px 0 8px" : "8px 0" }}>
      <SectionFrame dense={dense}>
        {!dense ? <SectionHeading>Our work</SectionHeading> : null}
        <div
          className={dense ? "bp-work-photos bp-work-photos-dense" : "bp-work-photos"}
          style={{
            display: "grid",
            gap: 12,
          }}
        >
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            className="bp-work-photo-btn"
            onClick={() => onPhotoClick?.(url, index)}
            aria-label={`View work photo ${index + 1} full size`}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: onPhotoClick ? "zoom-in" : "default",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <img
              src={url}
              alt={`Work photo ${index + 1}`}
              style={{
                width: "100%",
                aspectRatio: dense ? "4 / 3" : "1",
                objectFit: "cover",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.08)",
                display: "block",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            />
          </button>
        ))}
      </div>
      </SectionFrame>
    </section>
  )
}

function BusinessProfileContactForm({ slug, businessName, theme }: ContactFormProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [zip, setZip] = useState("")
  const [preferredContact, setPreferredContact] = useState<"phone" | "sms" | "email">("email")
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.12)",
    background: theme.fieldBackgroundColor,
    color: theme.fontColor,
    fontSize: 15,
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!email.trim()) {
      setError("Email is required.")
      return
    }
    if (preferredContact === "sms" && !smsOptIn) {
      setError("Check SMS opt-in consent to prefer text messages.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/platform-tools?__route=public-business-profile-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          zip: zip.trim(),
          preferredContact,
          smsOptIn: preferredContact === "sms" ? smsOptIn : false,
        }),
      })
      const raw = await res.text()
      let json: { ok?: boolean; error?: string } = {}
      try {
        json = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : {}
      } catch {
        json = { ok: false, error: raw.slice(0, 200) || `Server error (${res.status})` }
      }
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not send your message.")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section
        style={{
          padding: 20,
          borderRadius: 14,
          background: "rgba(15, 118, 110, 0.08)",
          border: "1px solid rgba(15, 118, 110, 0.2)",
          color: "var(--bp-font)",
        }}
      >
        <strong>Thank you!</strong> {businessName} received your message and will follow up using your preferred contact method.
      </section>
    )
  }

  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
      <SectionHeading>Contact us</SectionHeading>
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--bp-font)" }}>
          Name *
          <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--bp-font)" }}>
          Email *
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--bp-font)" }}>
          Phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--bp-font)" }}>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--bp-font)" }}>
          ZIP code
          <input value={zip} onChange={(e) => setZip(e.target.value)} style={inputStyle} />
        </label>
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          <legend style={{ fontSize: 13, fontWeight: 700, color: "var(--bp-font)", marginBottom: 4 }}>Preferred contact method</legend>
          {(["email", "phone", "sms"] as const).map((opt) => (
            <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--bp-font)" }}>
              <input type="radio" name="preferred" checked={preferredContact === opt} onChange={() => setPreferredContact(opt)} />
              {opt === "email" ? "Email" : opt === "phone" ? "Phone call" : "Text message (SMS)"}
            </label>
          ))}
        </fieldset>
        {preferredContact === "sms" ? (
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--bp-font)", lineHeight: 1.45 }}>
            <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              I agree to receive text messages from <strong>{businessName}</strong> about quotes, appointments, and job updates.
              Message and data rates may apply. Reply STOP to opt out.
            </span>
          </label>
        ) : null}
        {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            justifySelf: "start",
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: theme.primaryColor,
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
      </SectionFrame>
    </section>
  )
}

function ProfileHeader({
  data,
  hero,
  onPhotoClick,
}: {
  data: PublicBusinessProfileData
  hero?: boolean
  onPhotoClick?: (url: string) => void
}) {
  return (
    <header
      className={hero ? "bp-hero-header" : undefined}
      style={{
        textAlign: hero ? "left" : "center",
        padding: hero ? "48px clamp(20px, 4vw, 64px)" : "36px 24px 24px",
        background: hero ? "linear-gradient(135deg, var(--bp-primary) 0%, var(--bp-secondary) 100%)" : "transparent",
        color: hero ? "#fff" : "var(--bp-font)",
      }}
    >
      <div style={{ display: "flex", flexDirection: hero ? "row" : "column", gap: 20, alignItems: hero ? "center" : "center" }}>
        {data.profilePhotoUrl ? (
          onPhotoClick ? (
            <button
              type="button"
              onClick={() => onPhotoClick(data.profilePhotoUrl!)}
              aria-label="View company logo full size"
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "zoom-in",
                flexShrink: 0,
                borderRadius: hero ? 16 : "50%",
              }}
            >
              <img
                src={data.profilePhotoUrl}
                alt={`${data.businessName} logo`}
                style={{
                  width: hero ? 112 : 104,
                  height: hero ? 112 : 104,
                  borderRadius: hero ? 16 : "50%",
                  objectFit: "cover",
                  border: hero ? "3px solid rgba(255,255,255,0.35)" : "3px solid rgba(15,23,42,0.08)",
                  display: "block",
                }}
              />
            </button>
          ) : (
            <img
              src={data.profilePhotoUrl}
              alt={`${data.businessName} logo`}
              style={{
                width: hero ? 112 : 104,
                height: hero ? 112 : 104,
                borderRadius: hero ? 16 : "50%",
                objectFit: "cover",
                border: hero ? "3px solid rgba(255,255,255,0.35)" : "3px solid rgba(15,23,42,0.08)",
                flexShrink: 0,
              }}
            />
          )
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: hero ? "clamp(28px, 4vw, 42px)" : 30, fontWeight: 900, lineHeight: 1.15 }}>
            {data.businessName}
          </h1>
          {data.tagline ? (
            <p style={{ margin: 0, fontSize: hero ? 18 : 16, lineHeight: 1.5, opacity: hero ? 0.95 : 0.82, maxWidth: 720 }}>
              {data.tagline}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function AboutBlock({ aboutUs }: { aboutUs?: string }) {
  if (!aboutUs?.trim()) return null
  return (
    <section style={{ padding: "8px 0" }}>
      <SectionFrame>
        <SectionHeading>About us</SectionHeading>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--bp-font)", whiteSpace: "pre-wrap" }}>{aboutUs}</p>
      </SectionFrame>
    </section>
  )
}

function CanvasEditable({
  targetId,
  editMode,
  selectedTargetId,
  onSelectTarget,
  onTargetContextMenu,
  onPatchTextStyle,
  as: Tag = "div",
  className,
  style,
  children,
  href,
  onAnchorClick,
  enableMoveResize = false,
  offsetX = 0,
  offsetY = 0,
}: {
  targetId: string
  editMode?: boolean
  selectedTargetId?: string | null
  onSelectTarget?: (targetId: string | null) => void
  onTargetContextMenu?: (targetId: string, clientX: number, clientY: number) => void
  onPatchTextStyle?: (targetId: string, patch: Partial<WebsiteTextStyle>) => void
  as?: "div" | "span" | "h1" | "h2" | "h3" | "p" | "button" | "section" | "strong" | "a"
  className?: string
  style?: CSSProperties
  children: ReactNode
  href?: string
  onAnchorClick?: (e: MouseEvent) => void
  enableMoveResize?: boolean
  offsetX?: number
  offsetY?: number
}) {
  if (!editMode) {
    if (Tag === "a") {
      return (
        <a className={className} style={style} href={href || "#"} onClick={onAnchorClick}>
          {children}
        </a>
      )
    }
    const Comp = Tag
    return (
      <Comp className={className} style={style}>
        {children}
      </Comp>
    )
  }
  const selected = selectedTargetId === targetId
  const Comp = Tag === "a" ? "span" : Tag
  const ox = offsetX || 0
  const oy = offsetY || 0
  const { transform: _styleTransform, ...styleWithoutTransform } = style ?? {}

  const startMove = (e: ReactPointerEvent) => {
    if (!enableMoveResize || !onPatchTextStyle) return
    if ((e.target as HTMLElement).closest?.("[data-resize-handle]")) return
    e.preventDefault()
    e.stopPropagation()
    onSelectTarget?.(targetId)
    const startX = e.clientX
    const startY = e.clientY
    const ox0 = ox
    const oy0 = oy
    const target = e.currentTarget as HTMLElement
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const onMove = (ev: PointerEvent) => {
      const nextX = Math.max(-600, Math.min(600, Math.round(ox0 + (ev.clientX - startX))))
      const nextY = Math.max(-600, Math.min(600, Math.round(oy0 + (ev.clientY - startY))))
      target.style.transform = `translate(${nextX}px, ${nextY}px)`
      target.dataset.dragX = String(nextX)
      target.dataset.dragY = String(nextY)
    }
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      target.removeEventListener("pointercancel", onUp)
      try {
        target.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      const nextX = Number(target.dataset.dragX ?? ox0)
      const nextY = Number(target.dataset.dragY ?? oy0)
      onPatchTextStyle(targetId, { offsetX: nextX, offsetY: nextY })
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
    target.addEventListener("pointercancel", onUp)
  }

  const startResize = (e: ReactPointerEvent) => {
    if (!enableMoveResize || !onPatchTextStyle) return
    e.preventDefault()
    e.stopPropagation()
    onSelectTarget?.(targetId)
    const el = (e.currentTarget as HTMLElement).parentElement
    const startX = e.clientX
    const startW = el?.getBoundingClientRect().width ?? 200
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(80, Math.round(startW + (ev.clientX - startX)))
      if (el) el.style.maxWidth = `${w}px`
      ;(e.currentTarget as HTMLElement).dataset.resizeW = String(w)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      const w = Number((e.currentTarget as HTMLElement).dataset.resizeW ?? startW)
      onPatchTextStyle(targetId, { maxWidth: w })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const baseStyle: CSSProperties = {
    ...styleWithoutTransform,
    cursor: enableMoveResize ? (selected ? "grab" : "pointer") : "pointer",
    position: styleWithoutTransform.position ?? (enableMoveResize ? "relative" : undefined),
    display: styleWithoutTransform.display ?? (enableMoveResize ? "inline-block" : undefined),
    transform: enableMoveResize ? `translate(${ox}px, ${oy}px)` : _styleTransform,
    touchAction: enableMoveResize ? "none" : undefined,
    userSelect: enableMoveResize ? "none" : undefined,
  }

  return (
    <Comp
      className={`${className ?? ""}${selected ? " bp-edit-selected" : " bp-edit-target"}`.trim()}
      style={baseStyle}
      data-edit-target={targetId}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelectTarget?.(targetId)
      }}
      onPointerDown={(e) => {
        if (enableMoveResize && e.button === 0) startMove(e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelectTarget?.(targetId)
        onTargetContextMenu?.(targetId, e.clientX, e.clientY)
      }}
    >
      {children}
      {selected && enableMoveResize ? (
        <span
          data-resize-handle
          className="bp-edit-resize"
          title="Drag to resize width"
          onPointerDown={startResize}
        />
      ) : null}
    </Comp>
  )
}

function ShowcaseLayout({
  data,
  theme,
  onPhotoClick,
  previewMode = false,
  activePage = "home",
  onNavigatePage,
  editor,
}: {
  data: PublicBusinessProfileData
  theme: BusinessProfileTheme
  onPhotoClick: (url: string) => void
  previewMode?: boolean
  activePage?: WebsitePublicPageId
  onNavigatePage?: (page: WebsitePublicPageId) => void
  editor?: WebsiteCanvasEditorProps
}) {
  const editMode = Boolean(previewMode && editor?.onSelectTarget)
  const photos = data.workPhotoUrls ?? []
  const slots = data.imageSlots
  const sections = { ...emptyWebsiteHomeSections(), ...(data.homeSections ?? {}) }
  const subPages = data.subPages ?? defaultWebsiteSubPages()
  const textStyles = data.textStyles ?? {}
  const featureCards = data.featureCards?.length ? data.featureCards : defaultWebsiteFeatureCards()
  const serviceCards = data.serviceCards?.length
    ? data.serviceCards
    : (data.servicesOffered ?? []).length
      ? (data.servicesOffered ?? []).slice(0, 3).map((title, i) => ({
          id: `service_${i + 1}`,
          title,
          body: `Professional ${title.toLowerCase()} for homes and businesses in your area.`,
        }))
      : defaultWebsiteServiceCards()
  const logoUrl = data.profilePhotoUrl || null
  const background =
    resolveWebsiteSlotImage(slots, "background", photos, logoUrl) ||
    resolveWebsiteSlotImage(slots, "hero", photos, logoUrl)
  const feature1 = resolveWebsiteSlotImage(slots, "feature_1", photos)
  const feature2 = resolveWebsiteSlotImage(slots, "feature_2", photos)
  const serviceImgs = [
    resolveWebsiteSlotImage(slots, "service_1", photos),
    resolveWebsiteSlotImage(slots, "service_2", photos),
    resolveWebsiteSlotImage(slots, "service_3", photos),
  ]
  const telHref = data.phone ? `tel:${data.phone.replace(/\D/g, "")}` : null
  const headline = (data.heroHeadline || data.businessName || "").trim()
  const headlineLines = headline.includes("\n")
    ? headline.split(/\n+/).map((x) => x.trim()).filter(Boolean)
    : [headline].filter(Boolean)
  const displayLines = headlineLines.length ? headlineLines : [data.businessName]
  const bands =
    data.scrollBands && data.scrollBands.length
      ? data.scrollBands
      : [
          { id: "about", title: "Your Local Plumbing Professionals", body: data.aboutUs || "", tone: "dark" as const, enabled: true },
          { id: "services", title: "What We Specialize In", body: "", tone: "light" as const, enabled: true },
        ]
  const assigned = new Set(
    Object.values(slots ?? {}).filter((u): u is string => typeof u === "string" && Boolean(u)),
  )
  if (background) assigned.add(background)
  serviceImgs.forEach((u) => {
    if (u) assigned.add(u)
  })
  if (feature1) assigned.add(feature1)
  if (feature2) assigned.add(feature2)
  const gallery = photos.filter((u) => !assigned.has(u))
  const ctaLabel = (data.ctaLabel || "Get a Quote").trim() || "Get a Quote"

  const base = `/${encodeURIComponent(data.slug)}`
  const hrefFor = (page: WebsitePublicPageId) => {
    if (page === "home") return base
    return `${base}/${page}`
  }
  const go = (page: WebsitePublicPageId, e: MouseEvent) => {
    if (editMode) {
      e.preventDefault()
      return
    }
    if (onNavigatePage) {
      e.preventDefault()
      onNavigatePage(page)
    }
  }

  const styleFor = (id: string): CSSProperties => websiteTextStyleToCss(textStyles[id]) as CSSProperties
  const textChrome = (id: string) => ({
    editMode,
    selectedTargetId: editor?.selectedTargetId,
    onSelectTarget: editor?.onSelectTarget,
    onTargetContextMenu: editor?.onTargetContextMenu,
    onPatchTextStyle: editor?.onPatchTextStyle,
    enableMoveResize: editMode,
    offsetX: textStyles[id]?.offsetX ?? 0,
    offsetY: textStyles[id]?.offsetY ?? 0,
    style: styleFor(id),
  })
  const fixedBackground = data.fixedBackground !== false
  const shellRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!previewMode || !fixedBackground) return
    const root = shellRef.current
    if (!root) return
    let scroller: HTMLElement | null = root.parentElement
    while (scroller) {
      const oy = getComputedStyle(scroller).overflowY
      if (oy === "auto" || oy === "scroll") break
      scroller = scroller.parentElement
    }
    if (!scroller) return
    const apply = () => {
      root.style.setProperty("--wb-preview-h", `${Math.max(320, scroller!.clientHeight)}px`)
    }
    apply()
    scroller.scrollTop = 0
    const ro = new ResizeObserver(apply)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [previewMode, fixedBackground, data.slug, data.imageSlots?.background])

  const homeOrder = data.homeSectionOrder?.length ? data.homeSectionOrder : defaultWebsiteHomeSectionOrder()
  const bandRank = (bandId: string) => {
    if (bandId === "about") return homeOrder.indexOf("about_band")
    if (bandId === "services") return homeOrder.indexOf("services_band")
    return 50
  }
  const orderedBands = [...bands].sort((a, b) => bandRank(a.id) - bandRank(b.id))

  const onSlotDrop = (slotId: string, e: DragEvent) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")
    if (url?.startsWith("http")) editor?.onDropImageOnSlot?.(slotId, url.trim())
  }

  const bgStyle = background
    ? { backgroundImage: `url(${background})` }
    : { background: `linear-gradient(135deg, ${theme.secondaryColor}, ${theme.primaryColor})` }

  const nav = (
    <header className="bp-showcase-topbar bp-showcase-topbar-light">
      <div className="bp-showcase-topbar-inner">
        <div className="bp-showcase-topbar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="bp-showcase-topbar-logo" onClick={() => onPhotoClick(logoUrl)} />
          ) : null}
          <a href={hrefFor("home")} onClick={(e) => go("home", e)} style={{ color: "inherit", textDecoration: "none" }}>
            {data.businessName}
          </a>
        </div>
        <nav className="bp-showcase-topbar-actions">
          <a
            href={hrefFor("home")}
            onClick={(e) => go("home", e)}
            className={`bp-showcase-nav-link bp-showcase-nav-link-dark${activePage === "home" ? " bp-showcase-nav-link-active-dark" : ""}`}
          >
            Home
          </a>
          {subPages.about.enabled ? (
            <a
              href={hrefFor("about")}
              onClick={(e) => go("about", e)}
              className={`bp-showcase-nav-link bp-showcase-nav-link-dark${activePage === "about" ? " bp-showcase-nav-link-active-dark" : ""}`}
            >
              {subPages.about.title || "About Us"}
            </a>
          ) : null}
          {subPages.contact.enabled ? (
            <a
              href={hrefFor("contact")}
              onClick={(e) => go("contact", e)}
              className={`bp-showcase-nav-link bp-showcase-nav-link-dark${activePage === "contact" ? " bp-showcase-nav-link-active-dark" : ""}`}
            >
              {subPages.contact.title || "Contact Us"}
            </a>
          ) : null}
          {telHref ? (
            <a href={telHref} className="bp-showcase-btn bp-showcase-btn-dark bp-showcase-btn-sm">
              Call {data.phone}
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  )

  const contactBlock = (
    <div className="bp-showcase-band-inner">
      <CanvasEditable
        as="h2"
        targetId="contact_page.title"
        editMode={editMode}
        selectedTargetId={editor?.selectedTargetId}
        onSelectTarget={editor?.onSelectTarget}
        onTargetContextMenu={editor?.onTargetContextMenu}
        style={styleFor("contact_page.title")}
      >
        {subPages.contact.title || "Contact Us"}
      </CanvasEditable>
      <p className="bp-showcase-band-body" style={{ marginBottom: 16 }}>
        Reach {data.businessName} directly — calls, email, and requests go to this business.
      </p>
      <div className="bp-showcase-contact-direct">
        {data.phone ? (
          <a href={telHref || "#"} className="bp-showcase-contact-line">
            <strong>Phone</strong>
            <span>{data.phone}</span>
          </a>
        ) : null}
        {data.email ? (
          <a href={`mailto:${data.email}`} className="bp-showcase-contact-line">
            <strong>Email</strong>
            <span>{data.email}</span>
          </a>
        ) : null}
        {data.address ? (
          <div className="bp-showcase-contact-line">
            <strong>Address</strong>
            <span style={{ whiteSpace: "pre-wrap" }}>{data.address}</span>
          </div>
        ) : null}
      </div>
      {data.showContactForm ? (
        <BusinessProfileContactForm slug={data.slug} businessName={data.businessName} theme={theme} />
      ) : null}
      <SocialFollowBlock facebookUrl={data.facebookUrl} instagramUrl={data.instagramUrl} />
    </div>
  )

  const homeContent = (
    <>
      {sections.hero ? (
        <CanvasEditable
          as="section"
          targetId="section.hero"
          editMode={editMode}
          selectedTargetId={editor?.selectedTargetId}
          onSelectTarget={editor?.onSelectTarget}
          onTargetContextMenu={editor?.onTargetContextMenu}
          className="bp-showcase-hero bp-showcase-hero-parallax"
        >
          <div className="bp-showcase-hero-inner">
            <div className="bp-showcase-hero-copy">
              <CanvasEditable as="div" targetId="hero.headline" {...textChrome("hero.headline")}>
                {displayLines.map((line) => (
                  <h1 key={line} style={styleFor("hero.headline")}>
                    {line}
                  </h1>
                ))}
              </CanvasEditable>
              {data.tagline ? (
                <CanvasEditable
                  as="p"
                  targetId="hero.tagline"
                  className="bp-showcase-tagline-accent"
                  {...textChrome("hero.tagline")}
                >
                  {data.tagline}
                </CanvasEditable>
              ) : editMode ? (
                <CanvasEditable
                  as="p"
                  targetId="hero.tagline"
                  className="bp-showcase-tagline-accent bp-edit-placeholder"
                  {...textChrome("hero.tagline")}
                >
                  Add accent tagline…
                </CanvasEditable>
              ) : null}
              <div className="bp-showcase-cta-row">
                {subPages.contact.enabled || data.showContactForm || data.email || telHref || editMode ? (
                  <CanvasEditable
                    as="a"
                    targetId="hero.cta"
                    className="bp-showcase-btn bp-showcase-btn-jagged"
                    href={subPages.contact.enabled ? hrefFor("contact") : "#bp-contact"}
                    onAnchorClick={(e) => {
                      if (subPages.contact.enabled) go("contact", e)
                    }}
                    {...textChrome("hero.cta")}
                  >
                    {ctaLabel}
                  </CanvasEditable>
                ) : null}
              </div>
            </div>
          </div>
        </CanvasEditable>
      ) : null}

      {orderedBands.map((band) => {
        if (band.enabled === false) return null
        const isServices = band.id === "services"
        if (isServices && !sections.services_band) return null
        if (!isServices && band.id === "about" && !sections.about_band) return null
        const title = band.title.trim() || (isServices ? "What We Specialize In" : "About us")
        const body = band.body.trim() || (band.id === "about" ? data.aboutUs || "" : "")
        if (isServices) {
          return (
            <CanvasEditable
              key={band.id}
              as="section"
              targetId="section.services_band"
              editMode={editMode}
              selectedTargetId={editor?.selectedTargetId}
              onSelectTarget={editor?.onSelectTarget}
              onTargetContextMenu={editor?.onTargetContextMenu}
              className={`bp-showcase-band bp-showcase-band-${band.tone}`}
            >
              <div className="bp-showcase-band-inner">
                <CanvasEditable
                  as="h2"
                  targetId="band.services.title"
                  editMode={editMode}
                  selectedTargetId={editor?.selectedTargetId}
                  onSelectTarget={editor?.onSelectTarget}
                  onTargetContextMenu={editor?.onTargetContextMenu}
                  style={styleFor("band.services.title")}
                >
                  {title}
                </CanvasEditable>
                <div className="bp-showcase-service-trio">
                  {serviceCards.slice(0, 3).map((card, i) => (
                    <article key={card.id || i} className="bp-showcase-service-photo-card">
                      {serviceImgs[i] ? (
                        <button
                          type="button"
                          className={`bp-showcase-service-photo${editMode ? " bp-edit-target" : ""}`}
                          onClick={() => {
                            if (editMode) editor?.onSelectTarget?.(`slot.service_${i + 1}`)
                            else onPhotoClick(serviceImgs[i]!)
                          }}
                          onDragOver={(e) => editMode && e.preventDefault()}
                          onDrop={(e) => onSlotDrop(`service_${i + 1}`, e)}
                          onContextMenu={(e) => {
                            if (!editMode) return
                            e.preventDefault()
                            editor?.onSelectTarget?.(`slot.service_${i + 1}`)
                            editor?.onTargetContextMenu?.(`slot.service_${i + 1}`, e.clientX, e.clientY)
                          }}
                        >
                          <img src={serviceImgs[i]!} alt="" />
                        </button>
                      ) : (
                        <div
                          className={`bp-showcase-service-photo bp-showcase-service-photo-empty${editMode ? " bp-edit-target" : ""}`}
                          onDragOver={(e) => editMode && e.preventDefault()}
                          onDrop={(e) => onSlotDrop(`service_${i + 1}`, e)}
                          onClick={() => editMode && editor?.onSelectTarget?.(`slot.service_${i + 1}`)}
                        >
                          {editMode ? "Drop photo" : null}
                        </div>
                      )}
                      <CanvasEditable
                        as="h3"
                        targetId={`service.${i}.title`}
                        editMode={editMode}
                        selectedTargetId={editor?.selectedTargetId}
                        onSelectTarget={editor?.onSelectTarget}
                        onTargetContextMenu={editor?.onTargetContextMenu}
                        style={styleFor(`service.${i}.title`)}
                      >
                        {card.title || "Service"}
                      </CanvasEditable>
                      <CanvasEditable
                        as="p"
                        targetId={`service.${i}.body`}
                        editMode={editMode}
                        selectedTargetId={editor?.selectedTargetId}
                        onSelectTarget={editor?.onSelectTarget}
                        onTargetContextMenu={editor?.onTargetContextMenu}
                        style={styleFor(`service.${i}.body`)}
                      >
                        {card.body || "Add a short description…"}
                      </CanvasEditable>
                    </article>
                  ))}
                </div>
              </div>
            </CanvasEditable>
          )
        }
        return (
          <CanvasEditable
            key={band.id}
            as="section"
            targetId="section.about_band"
            editMode={editMode}
            selectedTargetId={editor?.selectedTargetId}
            onSelectTarget={editor?.onSelectTarget}
            onTargetContextMenu={editor?.onTargetContextMenu}
            className={`bp-showcase-band bp-showcase-band-${band.tone}`}
          >
            <div className="bp-showcase-band-inner">
              <CanvasEditable
                as="h2"
                targetId="band.about.title"
                editMode={editMode}
                selectedTargetId={editor?.selectedTargetId}
                onSelectTarget={editor?.onSelectTarget}
                onTargetContextMenu={editor?.onTargetContextMenu}
                style={{ textAlign: "center", ...styleFor("band.about.title") }}
              >
                {title}
              </CanvasEditable>
              <CanvasEditable
                as="p"
                targetId="band.about.body"
                editMode={editMode}
                selectedTargetId={editor?.selectedTargetId}
                onSelectTarget={editor?.onSelectTarget}
                onTargetContextMenu={editor?.onTargetContextMenu}
                className="bp-showcase-band-body"
                style={{ textAlign: "center", maxWidth: 720, margin: "0 auto", ...styleFor("band.about.body") }}
              >
                {body || (editMode ? "Add about text…" : "")}
              </CanvasEditable>
              {(feature1 || feature2 || featureCards.length || editMode) && band.id === "about" ? (
                <div className="bp-showcase-feature-row">
                  {featureCards.slice(0, 2).map((card, idx) => {
                    const url = idx === 0 ? feature1 : feature2
                    const slotId = idx === 0 ? "feature_1" : "feature_2"
                    return (
                      <div key={card.id || idx} className="bp-showcase-feature-item">
                        {url ? (
                          <button
                            type="button"
                            className={`bp-showcase-feature-thumb${editMode ? " bp-edit-target" : ""}`}
                            onClick={() => {
                              if (editMode) editor?.onSelectTarget?.(`slot.${slotId}`)
                              else onPhotoClick(url)
                            }}
                            onDragOver={(e) => editMode && e.preventDefault()}
                            onDrop={(e) => onSlotDrop(slotId, e)}
                          >
                            <img src={url} alt="" />
                          </button>
                        ) : editMode ? (
                          <div
                            className="bp-showcase-feature-thumb bp-edit-target"
                            style={{ display: "grid", placeItems: "center", fontSize: 10 }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => onSlotDrop(slotId, e)}
                            onClick={() => editor?.onSelectTarget?.(`slot.${slotId}`)}
                          >
                            Drop
                          </div>
                        ) : null}
                        <div>
                          <CanvasEditable
                            as="strong"
                            targetId={`feature.${idx}.title`}
                            editMode={editMode}
                            selectedTargetId={editor?.selectedTargetId}
                            onSelectTarget={editor?.onSelectTarget}
                            onTargetContextMenu={editor?.onTargetContextMenu}
                            style={styleFor(`feature.${idx}.title`)}
                          >
                            {card.title}
                          </CanvasEditable>
                          <CanvasEditable
                            as="p"
                            targetId={`feature.${idx}.body`}
                            editMode={editMode}
                            selectedTargetId={editor?.selectedTargetId}
                            onSelectTarget={editor?.onSelectTarget}
                            onTargetContextMenu={editor?.onTargetContextMenu}
                            style={styleFor(`feature.${idx}.body`)}
                          >
                            {card.body}
                          </CanvasEditable>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </CanvasEditable>
        )
      })}

      {sections.gallery && (gallery.length || editMode) ? (
        <CanvasEditable
          as="section"
          targetId="section.gallery"
          editMode={editMode}
          selectedTargetId={editor?.selectedTargetId}
          onSelectTarget={editor?.onSelectTarget}
          onTargetContextMenu={editor?.onTargetContextMenu}
          className="bp-showcase-band bp-showcase-band-light"
        >
          <div className="bp-showcase-band-inner">
            <h2>Our work</h2>
            {gallery.length ? (
              <WorkPhotosBlock urls={gallery} dense onPhotoClick={(url) => onPhotoClick(url)} />
            ) : (
              <p className="bp-showcase-band-body">Upload photos and leave some unassigned to fill the gallery.</p>
            )}
          </div>
        </CanvasEditable>
      ) : null}

      {sections.areas_hours && ((data.serviceAreas ?? []).length || (data.businessHours ?? []).length) ? (
        <CanvasEditable
          as="section"
          targetId="section.areas_hours"
          editMode={editMode}
          selectedTargetId={editor?.selectedTargetId}
          onSelectTarget={editor?.onSelectTarget}
          onTargetContextMenu={editor?.onTargetContextMenu}
          className="bp-showcase-band bp-showcase-band-clear"
        >
          <div className="bp-showcase-band-inner bp-showcase-lower">
            <ServiceAreasBlock items={data.serviceAreas ?? []} />
            <HoursBlock hours={data.businessHours ?? []} />
          </div>
        </CanvasEditable>
      ) : null}

      {sections.contact_home ? (
        <CanvasEditable
          as="section"
          targetId="section.contact_home"
          editMode={editMode}
          selectedTargetId={editor?.selectedTargetId}
          onSelectTarget={editor?.onSelectTarget}
          onTargetContextMenu={editor?.onTargetContextMenu}
          className="bp-showcase-band bp-showcase-band-dark"
        >
          <div id="bp-contact">{contactBlock}</div>
        </CanvasEditable>
      ) : null}

      {sections.sticky_cta && (telHref || data.showContactForm || subPages.contact.enabled) ? (
        <div className={`bp-showcase-sticky${previewMode ? " bp-showcase-sticky-preview" : ""}`}>
          {telHref ? (
            <a href={telHref} className="bp-showcase-btn bp-showcase-btn-primary">
              Call {data.businessName}
            </a>
          ) : null}
          <a
            href={subPages.contact.enabled ? hrefFor("contact") : "#bp-contact"}
            onClick={(e) => {
              if (subPages.contact.enabled) go("contact", e)
            }}
            className="bp-showcase-btn bp-showcase-btn-ghost"
          >
            Contact us
          </a>
        </div>
      ) : null}
    </>
  )

  const aboutBody = (subPages.about.body || data.aboutUs || "").trim()
  const pageContent =
    activePage === "about" && subPages.about.enabled ? (
      <section className="bp-showcase-band bp-showcase-band-light">
        <div className="bp-showcase-band-inner" style={{ maxWidth: 800 }}>
          <CanvasEditable
            as="h2"
            targetId="about_page.title"
            editMode={editMode}
            selectedTargetId={editor?.selectedTargetId}
            onSelectTarget={editor?.onSelectTarget}
            onTargetContextMenu={editor?.onTargetContextMenu}
            style={styleFor("about_page.title")}
          >
            {subPages.about.title || "About Us"}
          </CanvasEditable>
          <CanvasEditable
            as="p"
            targetId="about_page.body"
            editMode={editMode}
            selectedTargetId={editor?.selectedTargetId}
            onSelectTarget={editor?.onSelectTarget}
            onTargetContextMenu={editor?.onTargetContextMenu}
            className="bp-showcase-band-body"
            style={{ whiteSpace: "pre-wrap", ...styleFor("about_page.body") }}
          >
            {aboutBody || (editMode ? "Add About Us copy…" : "")}
          </CanvasEditable>
        </div>
      </section>
    ) : activePage === "contact" && subPages.contact.enabled ? (
      <section id="bp-contact" className="bp-showcase-band bp-showcase-band-dark">
        {contactBlock}
      </section>
    ) : (
      homeContent
    )

  const isHairPlumbing = data.templateId === "hair_plumbing"

  return (
    <div
      ref={shellRef}
      className={`bp-shell bp-shell-showcase${isHairPlumbing ? " bp-shell-hair-plumbing" : ""}${previewMode ? " bp-shell-showcase-preview" : ""}`}
      onClick={() => {
        if (editMode) editor?.onSelectTarget?.(null)
      }}
    >
      <div
        className={
          fixedBackground
            ? `bp-showcase-fixed-bg${previewMode ? " bp-showcase-fixed-bg-preview" : ""}${editMode ? " bp-edit-target" : ""}`
            : `bp-showcase-scroll-bg${editMode ? " bp-edit-target" : ""}`
        }
        style={bgStyle}
        aria-hidden
        onDragOver={(e) => editMode && e.preventDefault()}
        onDrop={(e) => onSlotDrop("background", e)}
        onClick={(e) => {
          if (!editMode) return
          e.stopPropagation()
          editor?.onSelectTarget?.("slot.background")
        }}
      />
      <div className="bp-showcase-scroll-layer">
        {nav}
        {pageContent}
      </div>
    </div>
  )
}

function ClassicLayout({
  data,
  theme,
  onPhotoClick,
}: {
  data: PublicBusinessProfileData
  theme: BusinessProfileTheme
  onPhotoClick: (url: string) => void
}) {
  return (
    <div className="bp-shell bp-shell-classic">
      <ProfileHeader data={data} onPhotoClick={onPhotoClick} />
      <div className="bp-classic-card">
        <AboutBlock aboutUs={data.aboutUs} />
        <WorkPhotosBlock urls={data.workPhotoUrls ?? []} onPhotoClick={(url) => onPhotoClick(url)} />
        <ServicesBlock items={data.servicesOffered ?? []} />
        <ServiceAreasBlock items={data.serviceAreas ?? []} />
        <ContactBlock data={data} />
        <HoursBlock hours={data.businessHours ?? []} />
        {data.showContactForm ? <BusinessProfileContactForm slug={data.slug} businessName={data.businessName} theme={theme} /> : null}
      </div>
    </div>
  )
}

function HeroLayout({
  data,
  theme,
  onPhotoClick,
}: {
  data: PublicBusinessProfileData
  theme: BusinessProfileTheme
  onPhotoClick: (url: string) => void
}) {
  return (
    <>
      <ProfileHeader data={data} hero onPhotoClick={onPhotoClick} />
      <div className="bp-shell bp-shell-hero">
        <div className="bp-hero-body">
          <AboutBlock aboutUs={data.aboutUs} />
          <div className="bp-hero-grid">
            <div>
              <ServicesBlock items={data.servicesOffered ?? []} />
              <ServiceAreasBlock items={data.serviceAreas ?? []} />
              <ContactBlock data={data} />
              <HoursBlock hours={data.businessHours ?? []} />
            </div>
            <WorkPhotosBlock urls={data.workPhotoUrls ?? []} onPhotoClick={(url) => onPhotoClick(url)} />
          </div>
          {data.showContactForm ? <BusinessProfileContactForm slug={data.slug} businessName={data.businessName} theme={theme} /> : null}
        </div>
      </div>
    </>
  )
}

function SplitLayout({
  data,
  theme,
  onPhotoClick,
}: {
  data: PublicBusinessProfileData
  theme: BusinessProfileTheme
  onPhotoClick: (url: string) => void
}) {
  return (
    <div className="bp-shell bp-shell-split">
      <div className="bp-split-grid">
        <div>
          <ProfileHeader data={data} onPhotoClick={onPhotoClick} />
          <AboutBlock aboutUs={data.aboutUs} />
          <ServicesBlock items={data.servicesOffered ?? []} />
          <ServiceAreasBlock items={data.serviceAreas ?? []} />
          <ContactBlock data={data} />
          <HoursBlock hours={data.businessHours ?? []} />
          {data.showContactForm ? <BusinessProfileContactForm slug={data.slug} businessName={data.businessName} theme={theme} /> : null}
        </div>
        <div>
          <WorkPhotosBlock urls={data.workPhotoUrls ?? []} dense onPhotoClick={(url) => onPhotoClick(url)} />
        </div>
      </div>
    </div>
  )
}

function GalleryLayout({
  data,
  theme,
  onPhotoClick,
}: {
  data: PublicBusinessProfileData
  theme: BusinessProfileTheme
  onPhotoClick: (url: string) => void
}) {
  return (
    <div className="bp-shell bp-shell-gallery">
      <div className="bp-gallery-intro">
        <ProfileHeader data={data} onPhotoClick={onPhotoClick} />
        <AboutBlock aboutUs={data.aboutUs} />
      </div>
      <div className="bp-gallery-photos-wrap">
        <WorkPhotosBlock urls={data.workPhotoUrls ?? []} dense onPhotoClick={(url) => onPhotoClick(url)} />
      </div>
      <div className="bp-gallery-details">
        <ServicesBlock items={data.servicesOffered ?? []} />
        <ServiceAreasBlock items={data.serviceAreas ?? []} />
        <ContactBlock data={data} />
        <HoursBlock hours={data.businessHours ?? []} />
        {data.showContactForm ? <BusinessProfileContactForm slug={data.slug} businessName={data.businessName} theme={theme} /> : null}
      </div>
    </div>
  )
}

export function BusinessProfilePublicSite({
  data,
  previewMode = false,
  activePage = "home",
  onNavigatePage,
  editor,
}: {
  data: PublicBusinessProfileData
  /** When true, fixed background is scoped to the preview scroll frame. */
  previewMode?: boolean
  activePage?: WebsitePublicPageId
  onNavigatePage?: (page: WebsitePublicPageId) => void
  /** Builder canvas: click / right-click targets. */
  editor?: WebsiteCanvasEditorProps
}) {
  const theme = useMemo(() => ({ ...DEFAULT_BUSINESS_PROFILE_THEME, ...(data.theme ?? {}) }), [data.theme])
  const templateId = data.templateId ?? "hair_plumbing"
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  const openPhoto = (url: string, alt = "Work photo") => {
    if (editor?.onSelectTarget) return
    setLightbox({ src: url, alt })
  }

  const shell: CSSProperties = {
    minHeight: "100vh",
    width: "100%",
    background:
      templateId === "showcase" || templateId === "hair_plumbing"
        ? "transparent"
        : templateId === "hero"
          ? "#eef2f6"
          : "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
    fontFamily:
      templateId === "showcase" || templateId === "hair_plumbing"
        ? '"Jost", system-ui, -apple-system, "Segoe UI", sans-serif'
        : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: theme.fontColor,
    position: "relative",
    ...themeVars(theme),
  }

  const layoutProps = { data, theme, onPhotoClick: openPhoto }

  return (
    <div style={shell}>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,400;0,600;0,700;1,700&family=Oswald:wght@600;700&display=swap");
        .bp-shell {
          width: 100%;
          box-sizing: border-box;
        }
        .bp-shell-classic {
          max-width: min(1120px, 96vw);
          margin: 0 auto;
          padding: 0 clamp(16px, 3vw, 40px);
        }
        .bp-classic-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid rgba(15,23,42,0.08);
          padding: 8px clamp(20px, 3vw, 36px) 28px;
          box-shadow: 0 12px 40px rgba(15,23,42,0.06);
        }
        .bp-shell-hero {
          padding: 0 clamp(16px, 3vw, 56px) 32px;
        }
        .bp-hero-header {
          width: 100%;
        }
        .bp-hero-body {
          max-width: min(1400px, 100%);
          margin: 0 auto;
          background: #fff;
          border-radius: 0 0 16px 16px;
          padding: 24px clamp(20px, 3vw, 48px);
          border: 1px solid rgba(15,23,42,0.08);
          border-top: none;
        }
        .bp-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: clamp(24px, 4vw, 48px);
        }
        .bp-shell-split {
          padding: clamp(20px, 3vw, 56px);
        }
        .bp-split-grid {
          max-width: min(1680px, 100%);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: clamp(24px, 4vw, 56px);
        }
        .bp-gallery-intro {
          padding: 32px clamp(16px, 3vw, 56px) 12px;
          max-width: min(1400px, 100%);
          margin: 0 auto;
        }
        .bp-gallery-photos-wrap {
          width: 100%;
          padding: 0 clamp(12px, 2.5vw, 48px);
        }
        .bp-gallery-details {
          max-width: min(1120px, 96vw);
          margin: 0 auto;
          padding: 12px clamp(16px, 3vw, 40px) 32px;
        }
        .bp-shell-showcase { background: transparent; color: var(--bp-font); padding-bottom: 88px; position: relative; isolation: isolate; }
        .bp-shell-showcase-preview { min-height: 100%; }
        .bp-edit-target {
          outline: 1px dashed transparent;
          transition: outline-color 0.12s ease, box-shadow 0.12s ease;
        }
        .bp-edit-target:hover { outline-color: rgba(37, 99, 235, 0.55); }
        .bp-edit-selected {
          outline: 2px solid #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18);
          position: relative;
          z-index: 2;
        }
        .bp-edit-placeholder { opacity: 0.55; font-style: italic; }
        .bp-edit-resize {
          position: absolute;
          right: -6px;
          bottom: -6px;
          width: 14px;
          height: 14px;
          border-radius: 3px;
          background: #2563eb;
          border: 2px solid #fff;
          cursor: nwse-resize;
          z-index: 5;
          box-shadow: 0 1px 4px rgba(15,23,42,0.35);
        }
        .bp-showcase-scroll-bg {
          position: absolute; inset: 0; z-index: 0;
          background-size: cover; background-position: center; background-repeat: no-repeat;
          pointer-events: none;
        }
        .bp-showcase-scroll-bg.bp-edit-target { pointer-events: auto; }
        .bp-showcase-fixed-bg {
          position: fixed; inset: 0; z-index: 0;
          background-size: cover; background-position: center; background-repeat: no-repeat;
          background-attachment: fixed;
          pointer-events: none;
        }
        /* Sticky bg inside editor overflow: height must be the scrollport (px via --wb-preview-h).
           Percentage margin-bottom is relative to WIDTH in CSS and broke the preview scroll. */
        .bp-showcase-fixed-bg-preview {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          height: var(--wb-preview-h, 100%);
          width: 100%;
          margin-bottom: calc(-1 * var(--wb-preview-h, 100%));
          inset: auto;
          background-attachment: scroll;
        }
        .bp-showcase-scroll-layer {
          position: relative;
          z-index: 1;
        }
        .bp-showcase-fixed-bg::after,
        .bp-showcase-fixed-bg-preview::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.28) 100%);
        }
        .bp-showcase-topbar {
          position: sticky; top: 0; z-index: 30;
          background: rgba(255,255,255,0.96); backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(15,23,42,0.08);
        }
        .bp-showcase-topbar-dark {
          background: #000; border-bottom: none; color: #fff;
        }
        .bp-showcase-topbar-light {
          background: #fff; color: #0f172a; border-bottom: 1px solid #e5e7eb;
        }
        .bp-showcase-nav-link-dark { color: #0f172a !important; font-weight: 600; }
        .bp-showcase-nav-link-active-dark { color: var(--bp-accent) !important; }
        .bp-showcase-btn-dark { background: #000; color: #fff; border-radius: 999px; }
        .bp-showcase-topbar-inner {
          max-width: 1200px; margin: 0 auto;
          padding: 12px clamp(16px, 3vw, 40px);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          position: relative; z-index: 1;
        }
        .bp-showcase-topbar-brand {
          display: flex; align-items: center; gap: 10px;
          font-family: "Oswald", system-ui, sans-serif;
          font-weight: 700; font-size: 1.35rem; color: inherit; letter-spacing: 0.02em;
        }
        .bp-showcase-topbar-logo {
          width: 56px; height: 56px; object-fit: contain; border-radius: 999px;
          border: 2px solid rgba(15,23,42,0.12); cursor: zoom-in; background: #fff;
          padding: 4px; box-sizing: border-box;
        }
        /* Hair Plumbing: larger mark in the topbar only — keeps nav/CTA readable */
        .bp-shell-hair-plumbing .bp-showcase-topbar-inner {
          padding-top: 10px;
          padding-bottom: 10px;
          min-height: 104px;
        }
        .bp-shell-hair-plumbing .bp-showcase-topbar-brand {
          gap: 14px;
          font-size: clamp(1.05rem, 2.2vw, 1.28rem);
        }
        .bp-shell-hair-plumbing .bp-showcase-topbar-logo {
          width: 92px;
          height: 92px;
          border-radius: 18px;
          padding: 6px;
          border-width: 1px;
          flex-shrink: 0;
        }
        @media (max-width: 720px) {
          .bp-shell-hair-plumbing .bp-showcase-topbar-inner { min-height: 84px; }
          .bp-shell-hair-plumbing .bp-showcase-topbar-logo {
            width: 72px;
            height: 72px;
            border-radius: 14px;
          }
        }
        .bp-showcase-topbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .bp-showcase-nav-link {
          color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 6px 10px;
        }
        .bp-showcase-nav-link-active {
          background: #fff; color: #000; border-radius: 4px;
        }
        .bp-showcase-hero {
          min-height: min(68vh, 560px);
          background-size: cover;
          background-position: center;
          color: #fff;
          display: flex;
          align-items: flex-end;
          position: relative; z-index: 1;
        }
        .bp-showcase-hero-parallax {
          min-height: min(78vh, 720px);
          background: transparent;
          align-items: center;
          color: #0f172a;
        }
        .bp-showcase-hero-inner {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: clamp(28px, 5vw, 64px) clamp(20px, 4vw, 48px);
        }
        .bp-showcase-hero-copy h1 {
          margin: 0;
          font-family: "Oswald", system-ui, sans-serif;
          font-size: clamp(2.8rem, 8vw, 4.8rem);
          font-weight: 700;
          line-height: 1.15;
          max-width: 14ch;
          color: #0f172a;
        }
        .bp-showcase-tagline-accent {
          margin: 14px 0 0;
          font-family: "Jost", system-ui, sans-serif;
          font-size: clamp(1.1rem, 2.5vw, 1.5rem);
          letter-spacing: 0.02em;
          text-transform: none;
          font-weight: 700;
          font-style: italic;
          color: var(--bp-accent);
        }
        .bp-showcase-cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .bp-showcase-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 12px 18px; border-radius: 999px; font-weight: 800; font-size: 14px;
          text-decoration: none; border: 2px solid transparent;
        }
        .bp-showcase-btn-sm { padding: 8px 12px; font-size: 12px; }
        .bp-showcase-btn-primary { background: var(--bp-primary); color: #fff; }
        .bp-showcase-btn-ghost { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.35); }
        .bp-showcase-btn-light { background: #fff; color: #000; border-radius: 6px; }
        .bp-showcase-btn-outline {
          background: #fff; color: var(--bp-font); border-color: rgba(15,23,42,0.12);
        }
        .bp-showcase-btn-jagged {
          background: #000; color: #fff; border: 2px solid #000;
          border-radius: 999px;
          padding: 14px 28px;
          letter-spacing: 0.02em;
          font-family: "Jost", system-ui, sans-serif;
        }
        .bp-showcase-btn-jagged:hover { background: #fff; color: #000; }
        .bp-showcase-band {
          position: relative; z-index: 1;
          padding: clamp(28px, 4vw, 52px) 0;
        }
        .bp-showcase-band-dark { background: rgba(0, 0, 0, 0.78); color: #fff; backdrop-filter: blur(2px); }
        .bp-showcase-band-light { background: rgba(255, 255, 255, 0.92); color: #0f172a; backdrop-filter: blur(2px); }
        .bp-showcase-band-clear { background: transparent; color: #fff; }
        .bp-showcase-band-inner {
          max-width: 1200px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 48px);
        }
        .bp-showcase-band h2 {
          margin: 0 0 16px;
          font-family: "Oswald", system-ui, sans-serif;
          font-size: clamp(1.8rem, 4vw, 2.5rem);
          font-weight: 700;
          line-height: 1.15;
        }
        .bp-showcase-band-split {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: clamp(18px, 3vw, 40px);
          align-items: start;
        }
        .bp-showcase-band-body {
          margin: 0; font-size: 16px; line-height: 1.65; opacity: 0.92;
        }
        .bp-showcase-feature-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px;
          padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.2);
        }
        .bp-showcase-feature-item { display: flex; gap: 12px; align-items: flex-start; }
        .bp-showcase-feature-thumb {
          width: 56px; height: 56px; padding: 0; border: 0; border-radius: 8px; overflow: hidden; cursor: zoom-in; flex: none;
          background: rgba(255,255,255,0.12);
        }
        .bp-showcase-feature-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bp-showcase-feature-item strong { display: block; margin-bottom: 4px; font-size: 15px; }
        .bp-showcase-feature-item p { margin: 0; font-size: 13px; line-height: 1.4; opacity: 0.85; }
        .bp-showcase-service-trio {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          margin-top: 8px;
        }
        .bp-showcase-service-photo-card h3 {
          margin: 12px 0 6px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 20px;
        }
        .bp-showcase-service-photo-card p { margin: 0; font-size: 14px; line-height: 1.5; color: rgba(15,23,42,0.7); }
        .bp-showcase-service-photo {
          display: block; width: 100%; aspect-ratio: 4/3; padding: 0; border: 0; border-radius: 18px; overflow: hidden;
          background: #e2e8f0; cursor: zoom-in;
        }
        .bp-showcase-service-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bp-showcase-service-photo-empty { cursor: default; }
        .bp-showcase-lower {
          display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
          gap: clamp(20px, 3vw, 40px); align-items: start;
        }
        .bp-showcase-contact-direct { display: grid; gap: 10px; margin-bottom: 16px; }
        .bp-showcase-contact-line {
          display: grid; gap: 2px; text-decoration: none; color: inherit;
          padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
        }
        .bp-showcase-contact-line strong { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
        .bp-showcase-contact-line span { font-size: 15px; font-weight: 700; color: #fff; }
        .bp-showcase-sticky {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: none; gap: 8px;
          padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
          background: rgba(15,23,42,0.92); backdrop-filter: blur(8px);
        }
        .bp-showcase-sticky-preview {
          position: absolute;
        }
        .bp-showcase-sticky .bp-showcase-btn { flex: 1; }
        .bp-client-footer {
          position: relative; z-index: 2;
          padding: 28px 24px 36px;
          text-align: center;
          font-size: 14px;
          color: #64748b;
          background: #fff;
          border-top: 1px solid #e2e8f0;
          font-family: "Jost", system-ui, sans-serif;
        }
        .bp-work-photos {
          grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
        }
        .bp-work-photos-dense {
          grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
          max-width: min(1800px, 100%);
          margin: 0 auto;
        }
        .bp-work-photo-btn:hover img {
          transform: scale(1.02);
          box-shadow: 0 8px 24px rgba(15,23,42,0.14);
        }
        @media (min-width: 1200px) {
          .bp-work-photos {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
          .bp-work-photos-dense {
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          }
        }
        @media (max-width: 900px) {
          .bp-hero-grid,
          .bp-split-grid,
          .bp-showcase-lower,
          .bp-showcase-band-split,
          .bp-showcase-feature-row,
          .bp-showcase-service-trio {
            grid-template-columns: 1fr !important;
          }
          .bp-showcase-sticky { display: flex; }
        }
      `}</style>
      {templateId === "showcase" || templateId === "hair_plumbing" ? (
        <ShowcaseLayout
          {...layoutProps}
          previewMode={previewMode}
          activePage={activePage}
          onNavigatePage={onNavigatePage}
          editor={editor}
        />
      ) : templateId === "hero" ? (
        <HeroLayout {...layoutProps} />
      ) : templateId === "split" ? (
        <SplitLayout {...layoutProps} />
      ) : templateId === "gallery" ? (
        <GalleryLayout {...layoutProps} />
      ) : (
        <ClassicLayout {...layoutProps} />
      )}
      {templateId === "showcase" || templateId === "hair_plumbing" ? null : (
        <div
          style={{
            width: "100%",
            maxWidth: 1120,
            margin: "0 auto",
            padding: "8px clamp(16px, 3vw, 40px) 0",
          }}
        >
          <SocialFollowBlock facebookUrl={data.facebookUrl} instagramUrl={data.instagramUrl} />
        </div>
      )}
      <CanvasEditable
          as="div"
          targetId="footer.copyright"
          editMode={Boolean(previewMode && editor?.onSelectTarget)}
          selectedTargetId={editor?.selectedTargetId}
          onSelectTarget={editor?.onSelectTarget}
          onTargetContextMenu={editor?.onTargetContextMenu}
          onPatchTextStyle={editor?.onPatchTextStyle}
          enableMoveResize={Boolean(previewMode && editor?.onSelectTarget)}
          offsetX={data.textStyles?.["footer.copyright"]?.offsetX ?? 0}
          offsetY={data.textStyles?.["footer.copyright"]?.offsetY ?? 0}
          className="bp-client-footer"
          style={websiteTextStyleToCss(data.textStyles?.["footer.copyright"]) as CSSProperties}
        >
          {data.footerCopyright?.trim() || `© ${new Date().getFullYear()} ${data.businessName}. All rights reserved.`}
        </CanvasEditable>
      {data.showPoweredBy === true ? <PoweredByFooter /> : null}
      {lightbox ? <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} /> : null}
    </div>
  )
}
