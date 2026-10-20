# SOLE Phase 1 — audit and checklist

Status: foundation started in this Tradesman repository. Not production onboarding. Not live charges. Not an App Store build.

This cloud session cannot write files onto a desktop Cursor machine. The only repository available here is `majorbeastage/tradesman`. The running site at https://sole.systems is a separate deployment. Its source is not in this repo. Growth already calls it with `SOLE_API_ORIGIN`, `SOLE_PUBLIC_ORIGIN`, and `SOLE_USER_API_KEY`, then embeds `/c/{token}`.

## What already existed

- Growth tab (`src/modules/growth/GrowthPage.tsx`) with website capture, profile grades, budgets, and Tradesman-admin campaign approval.
- SOLE applet iframe (`GrowthSoleAppletPanel`) issued by `api/_growthSoleApplet.ts`.
- Admin SOLE workspace that stores encrypted site logins, including passwords, for Meta, Google, Yelp, and similar. That conflicts with the new rule to use platform OAuth and never ask for advertising passwords. It was left in place so current admin access does not break. Do not extend it.
- Tradesman Terms, Privacy, and SMS pages, edited in admin and stored in `platform_settings`.
- Ad campaign tables used by Tradesman billing. Those are not SOLE’s ledger.

## What this phase added

- Draft SOLE legal documents in `sole/documents.ts`, version `2026-10-20.1`, marked under counsel review.
- Public pages at `/sole/legal/{slug}` on the Tradesman host so Growth can link to them now.
- Enforcement helpers and tests (`npm run test:sole`): wholesale fee, versioned acceptance, spend gate, rejection of customer identity fields.
- `supabase/sole-foundation.sql` for acceptances, spend authorizations, and an attribution outbox. Run it in Supabase before the Growth buttons can save. Until then the API returns 503 and does not pretend acceptance succeeded.
- `api/sole-consent.ts` records acceptance and a manual spend authorization with status `recorded_not_charged`. Automatic mode is rejected. No Stripe charge is created.
- Growth shows the acceptance panel above the existing applet. The applet still loads so current profile grants keep working. Advertising launch is not enabled by the applet or by these new buttons.
- Tradesman Terms and Privacy pages append a SOLE section when the stored text does not already contain it. Prior Tradesman acceptance is not treated as SOLE acceptance.

## Not built yet

- Developer Portal on sole.systems (registration, theme editor, install snippets, webhook tester).
- OAuth adapters for Google Ads, Meta, and TikTok.
- Replacing the external sole.systems applet with the new workspace.
- Cross-tenant intelligence, recommendation models, and partner invoicing.
- Moving legal pages onto the sole.systems host. Counsel must review the drafts before they are called final.
- Hooking every Tradesman lead, conversation, and job into the attribution outbox. The enqueue action exists and refuses identity fields. Callers are not wired, so customer creation does not depend on SOLE.

## Production gate

Do not onboard developers, collect SOLE fees, or launch ads until counsel approves the drafts, `sole-foundation.sql` is applied, and a processor-approved funds flow exists. The default remains: the business’s own ad platform bills the business, and SOLE only records authorizations.
