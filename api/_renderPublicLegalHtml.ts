/**
 * Server-rendered public legal pages (no JS) for /privacy, /terms, /sms — same copy as platform_settings.
 */
import { createClient } from "@supabase/supabase-js"
import {
  DEFAULT_PRIVACY_PAGE,
  DEFAULT_SMS_CONSENT_PAGE,
  DEFAULT_TERMS_PAGE,
  PRIVACY_SETTINGS_KEY,
  SMS_CONSENT_SETTINGS_KEY,
  TERMS_SETTINGS_KEY,
  parseSimpleLegalPage,
  parseSmsConsentLegalPage,
  resolvedLegalHeroKicker,
  resolvedSmsConsentSectionTitle,
  resolvedSmsDetailsSectionTitle,
  resolvedSmsSampleSectionTitle,
  smsNoticeCardVisible,
  type SimpleLegalPage,
  type SmsConsentLegalPage,
} from "../src/types/legal-pages"
import { pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

async function fetchPlatformSettingValue(key: string): Promise<unknown> {
  const supabaseUrl = pickSupabaseUrlForServer()
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!supabaseUrl || !anonKey) return null
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle()
  return data?.value ?? null
}

function wrapSimplePage(page: SimpleLegalPage, opts: { pathLabel: string; defaultCrossFooter: string }): string {
  const kicker = esc(resolvedLegalHeroKicker(page))
  const title = esc(page.title)
  const subtitle = esc(page.subtitle)
  const body = esc(page.body?.trim() ? page.body : "")
  const showNotice = Boolean((page.notice_title ?? "").trim() || (page.notice_body ?? "").trim())
  const noticeHeading = esc((page.notice_title ?? "").trim() || "Notice")
  const noticeBody = esc((page.notice_body ?? "").trim())
  const noticeBlock = showNotice
    ? `<section style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;margin-bottom:18px"><h2 style="margin:0 0 10px;font-size:1.15rem;color:#111827">${noticeHeading}</h2>${
        noticeBody ? `<p style="margin:0;color:#4b5563;line-height:1.65;white-space:pre-wrap">${noticeBody}</p>` : ""
      }</section>`
    : ""
  const footerInner = page.footer_note?.trim()
    ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;white-space:pre-wrap">${esc(page.footer_note.trim())}</p>`
    : `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">${opts.defaultCrossFooter}</p>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} | Tradesman Systems</title>
<meta name="description" content="${esc(page.subtitle.slice(0, 240))}"/>
<meta name="robots" content="index,follow"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65;color:#111827;margin:0;background:#f3f4f6;}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 48px;}
.hero{background:linear-gradient(135deg,#1f2937,#374151);color:#fff;border-radius:16px;padding:24px;margin-bottom:18px;border:1px solid #374151;}
.hero .kicker{font-size:12px;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85;margin:0 0 8px;}
.hero h1{margin:8px 0 10px;font-size:clamp(1.5rem,4vw,2.125rem);line-height:1.15;}
.hero .sub{margin:0;opacity:0.92;max-width:760px;}
main{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;margin-bottom:18px;}
pre.legal{white-space:pre-wrap;word-wrap:break-word;font-size:15px;margin:0;color:#4b5563;font-family:inherit;}
.navcard{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;}
.navcard a{color:#ea580c;font-weight:600;text-decoration:none;margin-right:8px;}
.navcard a:hover{text-decoration:underline;}
footer{font-size:13px;color:#6b7280;margin-top:8px;}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
<p class="kicker">${kicker}</p>
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
</header>
${noticeBlock}
<main><pre class="legal">${body}</pre></main>
<div class="navcard">
<p style="margin:0 0 8px">
<a href="/privacy">Privacy Policy</a>
<span style="color:#9ca3af">&middot;</span>
<a href="/terms">Terms &amp; Conditions</a>
<span style="color:#9ca3af">&middot;</span>
<a href="/sms">SMS consent</a>
<span style="color:#9ca3af">&middot;</span>
<a href="/">Home</a>
</p>
${footerInner}
</div>
<p class="footer" style="margin-top:16px;font-size:12px;color:#9ca3af">Tradesman Systems — ${esc(opts.pathLabel)} (HTML without JavaScript)</p>
</div>
</body>
</html>`
}

function renderSmsHtml(page: SmsConsentLegalPage): string {
  const kicker = esc(resolvedLegalHeroKicker(page))
  const title = esc(page.title)
  const subtitle = esc(page.subtitle)
  const lastUp = (page.hero_last_updated ?? "").trim()
  const lastBlock = lastUp ? `<p style="margin:14px 0 0;font-size:13px;opacity:0.75">${esc(lastUp)}</p>` : ""
  const showNotice = smsNoticeCardVisible(page)
  const nh = esc((page.notice_title ?? "").trim() || "Notice")
  const nb = esc((page.notice_body ?? "").trim())
  const noticeSection = showNotice
    ? `<section style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;margin-bottom:18px"><h2 style="margin:0 0 10px;font-size:1.15rem">${nh}</h2>${
        nb ? `<p style="margin:0;color:#4b5563;white-space:pre-wrap">${nb}</p>` : ""
      }</section>`
    : ""
  const body = esc(page.body?.trim() ? page.body : "")
  const detailsTitle = esc(resolvedSmsDetailsSectionTitle(page))
  const consentTitle = esc(resolvedSmsConsentSectionTitle(page))
  const sampleTitle = esc(resolvedSmsSampleSectionTitle(page))
  const consent = esc(page.consent_statement?.trim() ? page.consent_statement : DEFAULT_SMS_CONSENT_PAGE.consent_statement)
  const sampleIntroRaw = (page.sample_section_intro ?? "").trim()
  const sampleIntro = sampleIntroRaw ? esc(sampleIntroRaw) : ""
  const sampleIntroBlock = sampleIntro
    ? `<p style="margin:0 0 12px;font-size:14px;color:#4b5563;line-height:1.55">${sampleIntro}</p>`
    : ""
  const sample = esc(page.sample_message?.trim() ? page.sample_message : DEFAULT_SMS_CONSENT_PAGE.sample_message)
  const footerInner = page.footer_note?.trim()
    ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;white-space:pre-wrap">${esc(page.footer_note.trim())}</p>`
    : `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">For general privacy practices see <a href="/privacy" style="color:#ea580c;font-weight:600">Privacy Policy</a> and <a href="/terms" style="color:#ea580c;font-weight:600">Terms &amp; Conditions</a>.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} | Tradesman Systems</title>
<meta name="description" content="${esc(page.subtitle.slice(0, 240))}"/>
<meta name="robots" content="index,follow"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65;color:#111827;margin:0;background:#f3f4f6;}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 48px;}
.hero{background:linear-gradient(135deg,#1f2937,#374151);color:#fff;border-radius:16px;padding:24px;margin-bottom:18px;border:1px solid #374151;}
.hero .kicker{font-size:12px;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85;margin:0 0 8px;}
.hero h1{margin:8px 0 10px;font-size:clamp(1.5rem,4vw,2.125rem);}
.hero .sub{margin:0;opacity:0.92;max-width:760px;}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;margin-bottom:18px;}
.card h2{margin:0 0 10px;font-size:1.15rem;color:#111827;}
.navcard{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;}
.navcard a{color:#ea580c;font-weight:600;text-decoration:none;}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
<p class="kicker">${kicker}</p>
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
${lastBlock}
</header>
${noticeSection}
<section class="card"><h2>${detailsTitle}</h2><p style="margin:0;color:#4b5563;line-height:1.65;white-space:pre-wrap">${body}</p></section>
<section class="card"><h2>${consentTitle}</h2><p style="margin:0;color:#4b5563;line-height:1.65;white-space:pre-wrap">${consent}</p></section>
<section class="card"><h2>${sampleTitle}</h2>${sampleIntroBlock}<p style="margin:0;color:#4b5563;line-height:1.65;white-space:pre-wrap">${sample}</p></section>
<div class="navcard">
<p style="margin:0 0 8px"><a href="/privacy">Privacy Policy</a> &middot; <a href="/terms">Terms &amp; Conditions</a> &middot; <a href="/">Home</a></p>
${footerInner}
</div>
</div>
</body>
</html>`
}

export async function renderPublicLegalHtmlPage(slug: "privacy" | "terms" | "sms"): Promise<string> {
  if (slug === "privacy") {
    const raw = await fetchPlatformSettingValue(PRIVACY_SETTINGS_KEY)
    const page = parseSimpleLegalPage(raw, DEFAULT_PRIVACY_PAGE)
    return wrapSimplePage(page, {
      pathLabel: "/privacy",
      defaultCrossFooter: `For SMS opt-in and carrier compliance details, see <a href="/sms">SMS consent &amp; messaging</a>.`,
    })
  }
  if (slug === "terms") {
    const raw = await fetchPlatformSettingValue(TERMS_SETTINGS_KEY)
    const page = parseSimpleLegalPage(raw, DEFAULT_TERMS_PAGE)
    return wrapSimplePage(page, {
      pathLabel: "/terms",
      defaultCrossFooter: `For SMS opt-in and carrier compliance details, see <a href="/sms">SMS consent &amp; messaging</a>.`,
    })
  }
  const raw = await fetchPlatformSettingValue(SMS_CONSENT_SETTINGS_KEY)
  const page = parseSmsConsentLegalPage(raw, DEFAULT_SMS_CONSENT_PAGE)
  return renderSmsHtml(page)
}
