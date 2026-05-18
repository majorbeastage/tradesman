import ClientPublicCtaPage from "./ClientPublicCtaPage"

/** @deprecated Use ClientPublicCtaPage — kept for /embed/lead/:slug imports */
export default function EmbedLeadPage({ slug }: { slug: string }) {
  return <ClientPublicCtaPage slug={slug} />
}
