import { soleLegalDocument, SOLE_LEGAL_DOCUMENTS, soleLegalPath } from "../../../sole/documents"
import { PublicLegalLayout } from "../public/PublicLegalLayout"
import { theme } from "../../styles/theme"

type Props = { slug: string }

export default function SoleLegalPage({ slug }: Props) {
  const document = soleLegalDocument(slug)
  if (!document) {
    return (
      <PublicLegalLayout heroKicker="SOLE" title="Document not found" subtitle="That SOLE legal draft is not in this version.">
        <p style={{ margin: 0, color: theme.text }}>
          Available drafts: {SOLE_LEGAL_DOCUMENTS.map((d) => d.title).join(", ")}.
        </p>
      </PublicLegalLayout>
    )
  }
  return (
    <PublicLegalLayout
      heroKicker="SOLE draft"
      title={document.title}
      subtitle={document.summary}
      heroSubline={`Draft version ${document.version}. Under legal review. Not a final contract.`}
      noticeTitle="Counsel review required"
      noticeBody="This page is an implementation draft. It must be reviewed by qualified counsel before production onboarding, payment collection, or live campaign activation. The live sole.systems app is a separate deployment; this copy is served with the Tradesman site so Growth can link to a stable page today."
      showSmsComplianceStrapline={false}
    >
      <article
        style={{
          background: "#fff",
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          padding: 22,
          color: "#334155",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {document.body}
      </article>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14 }}>
        {SOLE_LEGAL_DOCUMENTS.map((d) => (
          <a key={d.slug} href={soleLegalPath(d.slug)} style={{ color: theme.primary, fontWeight: 700 }}>
            {d.title}
          </a>
        ))}
      </nav>
    </PublicLegalLayout>
  )
}
