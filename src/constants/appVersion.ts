/**
 * Product version: **only change `version` in root `package.json`.**
 * Vite injects it at build time (`vite.config.ts` → `define` → `__APP_VERSION__`).
 *
 * Release 1.2.0: Quotes estimate/legal + lead fit automation (rules-first).
 * **1.2.2** — Quotes load fallbacks + Vercel TS fixes.
 * **1.2.4** — Receipt: full quote lines on PDF, calendar receipt editor + event metadata; materials SQL reminder.
 * **1.2.5** — quote_items.update retries without metadata + clearer SQL hint; run quote-items-metadata.sql for crew.
 * **1.2.6** — Itemized receipt: labor/materials/misc + mileage $ (rate in template); quote→calendar materials; live quote sync on event.
 *
 * @see CopyrightVersionFooter
 */
export const APP_VERSION: string = __APP_VERSION__
