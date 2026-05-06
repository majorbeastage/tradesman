import type { CSSProperties, ReactNode } from "react"
import { theme } from "../../styles/theme"
import {
  thimbleCoverageMatrix,
  thimbleFaq,
  thimbleFieldChecklist,
  thimbleOfficialLinks,
  thimbleQuoteWorkflow,
  tradesmanThimblePartnershipBullets,
} from "../../lib/thimbleInsuranceResources"

const panel: CSSProperties = {
  borderRadius: 12,
  border: "1px solid #374151",
  background: "#111827",
  padding: "20px 22px",
}

const muted: CSSProperties = { color: "#d1d5db", lineHeight: 1.65, fontSize: 14, margin: 0 }
const subtle: CSSProperties = { color: "#9ca3af", fontSize: 13, lineHeight: 1.55, margin: 0 }
/** Intro block sits on the light portal main column (not on dark cards). */
const pageIntroTitle: CSSProperties = { color: theme.text }
const pageIntroBody: CSSProperties = { color: "#334155", lineHeight: 1.65, fontSize: 15, margin: 0 }

function renderBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    if (m) return <strong key={i}>{m[1]}</strong>
    return <span key={i}>{part}</span>
  })
}

function PrimaryLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 700 }}>
      {children}
    </a>
  )
}

function OutlineButton({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 18px",
        borderRadius: 10,
        border: `2px solid ${theme.primary}`,
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  )
}

export default function InsuranceOptionsPage() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "12px 4px 48px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 10px", ...pageIntroTitle }}>Insurance options</h1>
        <p style={pageIntroBody}>
          Trades-focused reference, checklists, and a deep dive on{' '}
          <PrimaryLink href={thimbleOfficialLinks.home}>Thimble</PrimaryLink>
          {' '}—built so you can move from “need coverage tomorrow” to a clean COI on file without losing the thread between the job and
          paperwork.
        </p>
      </header>

      <section style={{ ...panel, marginBottom: 20, borderColor: "rgba(249,115,22,0.45)", background: "linear-gradient(135deg,#451a0322,#111827)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 280px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: 0.06, textTransform: "uppercase", color: "#fdba74", fontWeight: 800 }}>
              Partner spotlight · Thimble
            </p>
            <h2 style={{ margin: "0 0 10px", fontSize: "1.35rem", fontWeight: 800, color: "#fff" }}>On-demand liability built for contractors</h2>
            <p style={muted}>
              Thimble publishes flexible general liability and related lines aimed at freelancers and SMBs — many trades use it to{' '}
              <strong>start a policy quickly</strong> for a sprint of work, seasonal hiring, or a new GC gate. Coverage and pricing are issued
              by Thimble&apos;s underwriting partners subject to eligibility and state filings — always read the declaration page your quote
              produces.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
            <OutlineButton href={thimbleOfficialLinks.quoteStart}>Start coverage on Thimble</OutlineButton>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <OutlineButton href={thimbleOfficialLinks.generalLiability}>General liability hub</OutlineButton>
              <OutlineButton href={thimbleOfficialLinks.appHome}>Thimble app login</OutlineButton>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gap: 20 }}>
        <section style={panel}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem", fontWeight: 800, color: "#f9fafb" }}>How to run a Thimble quote (field version)</h2>
          <p style={subtle}>
            These steps mirror what a working foreman or owner actually does on a phone between mobilization and the safety tailgate — not
            generic “shop for insurance” advice.
          </p>
          <ol style={{ margin: "16px 0 0", paddingLeft: 22, color: "#e5e7eb", display: "grid", gap: 18 }}>
            {thimbleQuoteWorkflow.map((step) => (
              <li key={step.title} style={{ lineHeight: 1.55 }}>
                <strong style={{ color: "#fff" }}>{step.title}</strong>
                <p style={{ ...muted, margin: "8px 0 0" }}>{renderBold(step.body)}</p>
                {step.bullets?.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "#cbd5e1", fontSize: 14 }}>
                    {step.bullets.map((b) => (
                      <li key={b} style={{ marginBottom: 6 }}>
                        {renderBold(b)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section style={panel}>
          <h2 style={{ margin: "0 0 14px", fontSize: "1.15rem", fontWeight: 800, color: "#f9fafb" }}>
            Coverage lanes most trades click on first
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {thimbleCoverageMatrix.map((row) => (
              <div
                key={row.name}
                style={{
                  borderRadius: 10,
                  border: "1px solid #1f2937",
                  padding: "14px 16px",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
                  <strong style={{ color: "#fff", fontSize: 16 }}>{row.name}</strong>
                  <PrimaryLink href={row.href}>Read on Thimble →</PrimaryLink>
                </div>
                <p style={subtle}>{renderBold(row.blurb)}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={panel}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem", fontWeight: 800, color: "#f9fafb" }}>GC packet &amp; COI checklist</h2>
          <p style={muted}>
            Before you upload a certificate to <strong>Procore</strong>, <strong>CMiC</strong>, or email it to a residential PM, walk this
            list — it stops the “COI rejected” loop that burns mobilization days.
          </p>
          <ul style={{ margin: "14px 0 0", paddingLeft: 22, color: "#e5e7eb", fontSize: 14, lineHeight: 1.6 }}>
            {thimbleFieldChecklist.map((item) => (
              <li key={item} style={{ marginBottom: 10 }}>
                {renderBold(item)}
              </li>
            ))}
          </ul>
          <p style={{ ...subtle, marginTop: 16 }}>
            Need wording definitions? Browse{' '}
            <PrimaryLink href={thimbleOfficialLinks.helpCenter}>Thimble Help Center</PrimaryLink>.
          </p>
        </section>

        <section style={panel}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem", fontWeight: 800, color: "#f9fafb" }}>
            FAQ — Thimble × working trades
          </h2>
          <div style={{ display: "grid", gap: 10 }}>
            {thimbleFaq.map((item) => (
              <details
                key={item.q}
                style={{
                  borderRadius: 10,
                  border: "1px solid #1f2937",
                  padding: "12px 14px",
                  background: "#0f172a",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 700, color: "#f9fafb", outline: "none" }}>{item.q}</summary>
                <p style={{ ...muted, margin: "12px 0 0" }}>{renderBold(item.a)}</p>
              </details>
            ))}
          </div>
        </section>

        <section style={{ ...panel, borderStyle: "dashed", borderColor: "#475569" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem", fontWeight: 800, color: "#f9fafb" }}>
            Tradesman + Thimble roadmap (engineering + partnerships)
          </h2>
          <p style={muted}>
            {renderBold(
              "You asked for Thimble in-product with real pressure behind the partnership — we hear that. This page is the **first wedge**: deep resources, audited links, and a single place crews learn the workflow. Concurrently we are aligning with Thimble on what a **native handshake** looks like inside Tradesman (attribution-safe links today; deeper integrations as contracts allow).",
            )}
          </p>
          <ul style={{ margin: "14px 0 0", paddingLeft: 22, color: "#cbd5f5", fontSize: 14, lineHeight: 1.65 }}>
            {tradesmanThimblePartnershipBullets.map((b) => (
              <li key={b} style={{ marginBottom: 8 }}>
                {renderBold(b)}
              </li>
            ))}
          </ul>
        </section>

        <section style={panel}>
          <h2 style={{ margin: "0 0 10px", fontSize: "1.05rem", fontWeight: 800, color: "#f9fafb" }}>Disclaimer</h2>
          <p style={subtle}>
            Tradesman does not sell insurance, cannot bind coverage on your behalf, and is not responsible for underwriting decisions or
            claim outcomes. Quotes, limits, exclusions, taxes, and fees are solely between you and Thimble / its insurers. Confirm every
            endorsement with your contractor compliance manager or legal advisor before reliance.
          </p>
        </section>
      </div>
    </div>
  )
}
