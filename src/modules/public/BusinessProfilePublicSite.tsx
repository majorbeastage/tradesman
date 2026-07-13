import { useMemo, useState, type CSSProperties, type FormEvent } from "react"
import logo from "../../assets/logo.png"
import { PhotoLightbox } from "../../components/PhotoLightbox"
import type { BusinessProfileTemplateId, BusinessProfileTheme } from "../../lib/businessPublicProfile"
import { DEFAULT_BUSINESS_PROFILE_THEME } from "../../lib/businessPublicProfile"

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
  }
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

function ContactBlock({ data }: { data: PublicBusinessProfileData }) {
  if (!data.phone && !data.email && !data.address && !data.serviceArea) return null
  return (
    <section style={{ padding: "24px 0" }}>
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
    </section>
  )
}

function ServiceAreasBlock({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section style={{ padding: "24px 0" }}>
      <SectionHeading>Service areas</SectionHeading>
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 16, color: "var(--bp-font)" }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function ServicesBlock({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section style={{ padding: "24px 0" }}>
      <SectionHeading>Services offered</SectionHeading>
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 16, color: "var(--bp-font)" }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function HoursBlock({ hours }: { hours: Array<{ day: string; hours: string }> }) {
  if (!hours.length) return null
  return (
    <section style={{ padding: "24px 0" }}>
      <SectionHeading>Business hours</SectionHeading>
      <div style={{ display: "grid", gap: 6, fontSize: 15, color: "var(--bp-font)" }}>
        {hours.map((row) => (
          <div key={row.day} style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{row.day}</span>
            <span>{row.hours}</span>
          </div>
        ))}
      </div>
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
    <section style={{ padding: dense ? "12px 0 24px" : "24px 0" }}>
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
    <section style={{ padding: "24px 0" }}>
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
    <section style={{ padding: "24px 0" }}>
      <SectionHeading>About us</SectionHeading>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--bp-font)", whiteSpace: "pre-wrap" }}>{aboutUs}</p>
    </section>
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

export function BusinessProfilePublicSite({ data }: { data: PublicBusinessProfileData }) {
  const theme = useMemo(() => ({ ...DEFAULT_BUSINESS_PROFILE_THEME, ...(data.theme ?? {}) }), [data.theme])
  const templateId = data.templateId ?? "classic"
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  const openPhoto = (url: string, alt = "Work photo") => setLightbox({ src: url, alt })

  const shell: CSSProperties = {
    minHeight: "100vh",
    width: "100%",
    background: templateId === "hero" ? "#eef2f6" : "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: theme.fontColor,
    ...themeVars(theme),
  }

  const layoutProps = { data, theme, onPhotoClick: openPhoto }

  return (
    <div style={shell}>
      <style>{`
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
          .bp-split-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      {templateId === "hero" ? (
        <HeroLayout {...layoutProps} />
      ) : templateId === "split" ? (
        <SplitLayout {...layoutProps} />
      ) : templateId === "gallery" ? (
        <GalleryLayout {...layoutProps} />
      ) : (
        <ClassicLayout {...layoutProps} />
      )}
      <PoweredByFooter />
      {lightbox ? <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} /> : null}
    </div>
  )
}
