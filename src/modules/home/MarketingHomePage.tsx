import { MarketingPreviewStory } from "./marketing/MarketingPreviewStory"
import { MarketingPreviewShell } from "./marketing/MarketingPreviewShared"

type Props = {
  onLogin: () => void
  onAdminLogin: () => void
  onSignup: () => void
  onTrial: () => void
  onAboutUs: () => void
  onPricing: () => void
}

/** Production homepage — story scroll (no preview banner). */
export default function MarketingHomePage({ onLogin, onAdminLogin, onSignup, onTrial, onAboutUs, onPricing }: Props) {
  return (
    <MarketingPreviewShell fullWidth hideFooter banner={null}>
      <MarketingPreviewStory
        topInsetPx={0}
        onLogin={onLogin}
        onSignup={onSignup}
        onTrial={onTrial}
        onPricing={onPricing}
        onAdminLogin={onAdminLogin}
        onAboutUs={onAboutUs}
      />
    </MarketingPreviewShell>
  )
}
