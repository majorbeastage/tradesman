/**
 * Product version: **only change `version` in root `package.json`.**
 * Vite injects it at build time (`vite.config.ts` → `define` → `__APP_VERSION__`).
 *
 * Release 1.2.0: Quotes estimate/legal + lead fit automation (rules-first).
 * **1.2.2** — Quotes load fallbacks + Vercel TS fixes.
 * **1.2.4** — Receipt: full quote lines on PDF, calendar receipt editor + event metadata; materials SQL reminder.
 * **1.2.5** — quote_items.update retries without metadata + clearer SQL hint; run quote-items-metadata.sql for crew.
 * **1.2.6** — Itemized receipt: labor/materials/misc + mileage $ (rate in template); quote→calendar materials; live quote sync on event.
 * **1.2.7** — Version bump (verify deploy / footer).
 * **1.3.0** — Quotes automatic replies (Conversations parity + carry-over), calendar completion via platform email/SMS, job completion settings, receipt template intro/logo, quote→calendar materials sync, platform-tools Supabase body fallback, sidebar footer grouping.
 * **1.4.0** — Mobile shell (safe area, viewport), MyT push/GPS prefs, per-tab Alerts (push/email/SMS + calendar extras), call button (tel:), team map placeholder (OM/admin); Capacitor push + geolocation.
 * **1.4.1** — Fix mobile prefs import + Supabase Promise/finally TypeScript build; version bump for release.
 * **1.4.2** — Push device rows + FCM push-test Edge, Twilio bridge call, GPS last-location + team Leaflet map, quote status → notify-quote-status (email/SMS/push per Alerts prefs).
 * **1.4.3** — Launcher icons generated from public/icon.png (browser tab); npm run icons:generate; adaptive icon background #000000.
 * **1.4.4** — Leads re-run auto scoring: fresh JWT + optional refresh on 401; platform-tools JSON body Buffer parse; OM/admin can run lead-evaluate-fit and AI lead routes for managed users.
 * **1.4.5** — Helcim Payments tab: OM-scoped portal URL; managed users default-hide Payments until User portal tabs; optional RLS for self-read on office_manager_clients; portal URL normalization.
 * **1.4.6** — Lead Hot/Qualified → Conversations automation (client + server); Quotes calendar date picker + decimal unit prices; no auto tab-switch after workflow actions; calendar completion receipts send JWT + Supabase URL/anon to outbound-messages; AI summarize + platform-tools shared body helper; Conversations SMS consent notice; pricing expandable cards + Best Value on Pro.
 * **1.4.10** — Password reset: normalize `/` + recovery hash to `/reset-password`; billing portal config Edge + Payments fallback; Helcim bulk customer-code match (admin); billing webhook last-success for all roles; Twilio-first call button with dialer fallback; calendar status helpers + notify-calendar-status Edge; mobile prefs / native pipeline tweaks; env and Supabase function config docs.
 * **1.4.11** — Payments: read `VITE_HELCIM_*` via `import.meta.env` so Vite embeds the Helcim portal URL in production builds (indirect access left it empty). Sidebar: Payments pinned above My T.
 * **1.4.12** — Native app: primary “Call” uses Twilio bridge (business caller ID); dialer labeled as personal line. TwilioBridgeCallButton `label`/`variant`. Customers detail uses CustomerCallButton + bridge.
 * **1.4.13** — Public `/account-deletion` page + `LEGAL_LINKS.accountDeletion` (Play delete-account URL); nav link; optional `VITE_PUBLIC_ACCOUNT_DELETION_URL`.
 * **1.4.14** — Inbound Twilio: return Dial/voicemail TwiML before CRM (`waitUntil`); native Supabase session via Capacitor Preferences; safer push/GPS permission timing; Quotes estimate-legal-draft sends Supabase URL/anon in body when server env missing.
 * **1.4.17** — Mobile push reliability: startup token re-sync on native installs + safer token upsert wait after permission flow; action bar order unified (Add → Automatic replies → Alerts) in Leads/Conversations/Quotes.
 * **1.4.18** — Customers tab UX aligned with Conversations (charcoal filter bar, row expand/detail panel, selection colors); Calendar primary actions + view toolbar use matching charcoal control strips; version bump for release.
 *
 * @see CopyrightVersionFooter
 */
export const APP_VERSION: string = __APP_VERSION__
