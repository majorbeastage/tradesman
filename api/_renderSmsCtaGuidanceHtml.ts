import {
  DEFAULT_SMS_CTA_GUIDANCE_PAGE,
  SMS_CTA_GUIDANCE_SETTINGS_KEY,
  parseSmsCtaGuidancePage,
  type SmsCtaGuidancePage,
} from "./legal-pages-ssr.js"
import { fetchPlatformSettingValue } from "./_renderPublicLegalHtml.js"

function esc(s: unknown): string {
  const t = s == null ? "" : String(s)
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function linkifyKnownPaths(htmlEsc: string, u: (path: string) => string): string {
  return htmlEsc
    .replace(/\/sms-cta\/submit/g, `<a href="${u("/sms-cta/submit")}">/sms-cta/submit</a>`)
    .replace(/\/sms-cta\/consent-form\.pdf/g, `<a href="${u("/sms-cta/consent-form.pdf")}">/sms-cta/consent-form.pdf</a>`)
}

const SMS_CTA_STYLES = `
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;color:#111827;line-height:1.65;font-size:16px;}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 48px;}
header{margin-bottom:18px;}
header .kicker{font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;margin:0 0 8px;}
header h1{margin:0 0 10px;font-size:clamp(1.5rem,4vw,2rem);line-height:1.2;}
header .lead{margin:0;color:#4b5563;font-size:15px;max-width:720px;}
main{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px 24px;}
main h2{margin:28px 0 14px;font-size:1.25rem;color:#0f172a;}
main h2:first-of-type{margin-top:0;}
main h3{margin:0 0 10px;font-size:1.05rem;color:#0f172a;}
main p{margin:0 0 14px;color:#374151;}
.disclosure{margin:0 0 18px;padding:16px 18px;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc;color:#1e293b;font-size:15px;line-height:1.6;}
.notice{margin:0 0 18px;padding:12px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#78350f;font-size:14px;line-height:1.55;}
.form-card,.shots-card{margin:0 0 22px;padding:16px 18px;border-radius:10px;border:1px solid #e5e7eb;background:#fafafa;}
.form-card{border-color:#fed7aa;background:#fff7ed;}
.form-card h2,.shots-card h2{margin-top:0;}
.form-grid{display:grid;gap:12px;margin:14px 0 16px;}
.form-grid label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334155;}
.form-grid input{padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;}
.btn-row{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px;}
.btn{display:inline-block;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer;border:none;}
.btn-primary{background:#ea580c;color:#fff;}
.btn-secondary{background:#fff;color:#374151;border:1px solid #cbd5e1;}
.hint{font-size:13px;color:#64748b;margin:0 0 10px;}
.purchase-disclaimer{font-size:13px;color:#64748b;margin:12px 0 0;}
.pdf-preview{width:100%;min-height:420px;border:1px solid #e5e7eb;border-radius:8px;margin-top:12px;}
figure.shot{margin:0 0 22px;}
figure.shot figcaption{margin:0 0 10px;font-size:14px;color:#334155;line-height:1.55;}
figure.shot img{max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px;display:block;}
footer.nav{margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:14px;}
footer.nav ul{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;}
footer.nav li{margin:0;}
footer.nav a{color:#ea580c;font-weight:600;text-decoration:none;}
.process-card{margin:0 0 22px;padding:20px 22px;border-radius:14px;border:1px solid #e5e7eb;background:#fff;}
.process-card h2{margin:24px 0 12px;font-size:1.25rem;color:#0f172a;}
.process-card h2:first-child{margin-top:0;}
.process-card p{margin:0 0 12px;color:#374151;line-height:1.65;}
.process-card ol{margin:0 0 14px;padding-left:1.35rem;color:#374151;line-height:1.65;}
.process-card li{margin-bottom:8px;}
`

function renderInlineBold(text: string): string {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
}

/** Plain text: numbered lines → ol; blank lines → paragraphs; **bold** inline. */
function renderGuidanceRichText(raw: string): string {
  const lines = raw.trim().split(/\n/)
  const out: string[] = []
  let ol: string[] = []
  let para: string[] = []

  const flushOl = () => {
    if (ol.length) {
      out.push(`<ol>${ol.map((l) => `<li>${renderInlineBold(l)}</li>`).join("")}</ol>`)
      ol = []
    }
  }
  const flushPara = () => {
    flushOl()
    if (para.length) {
      out.push(`<p>${renderInlineBold(para.join(" "))}</p>`)
      para = []
    }
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      flushPara()
      continue
    }
    const num = /^(\d+)\.\s+(.*)$/.exec(t)
    if (num) {
      if (para.length) flushPara()
      ol.push(num[2])
      continue
    }
    if (ol.length) flushOl()
    para.push(t)
  }
  flushPara()
  flushOl()
  return out.join("\n")
}

function renderSmsCtaBody(page: SmsCtaGuidancePage, requestOrigin?: string): string {
  const u = (path: string) => (requestOrigin ? `${requestOrigin}${path}` : path)
  const kicker = esc((page.hero_kicker ?? "").trim() || DEFAULT_SMS_CTA_GUIDANCE_PAGE.hero_kicker)
  const title = esc(page.title)
  const lead = esc(page.lead)
  const printableIntro = esc(page.printable_intro)
  const onlineBlurb = linkifyKnownPaths(esc(page.online_submit_blurb), u)
  const shotsIntro = esc(page.screenshots_intro)
  const disclosureTitle = esc(page.disclosure_title)
  const disclosurePlacement = esc(page.disclosure_placement_note)
  const disclosureText = esc(page.disclosure_text)
  const closing = esc(page.closing_paragraph)
  const processFlowHtml = renderGuidanceRichText(page.process_flow_body)
  const definitionsHtml = renderGuidanceRichText(page.definitions_body)
  const figure3Caption = esc(page.figure_3_caption)
  const canonical = u("/sms-cta")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="description" content="${esc(page.lead.slice(0, 240))}"/>
<title>${title} | Tradesman Systems</title>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${esc(canonical)}"/>
<style>${SMS_CTA_STYLES}</style>
</head>
<body>
<div class="wrap">
<header>
<p class="kicker">${kicker}</p>
<h1>${title}</h1>
<p class="lead">${lead.replace(
    "online consent submission form",
    `<a href="${u("/sms-cta/submit")}">online consent submission form</a>`,
  )}</p>
</header>
<main>
<p class="notice">${linkifyKnownPaths(esc(page.notice_body), u)}</p>
<div class="process-card" id="sms-opt-in-process">
<h2>SMS Opt-In Process</h2>
${processFlowHtml}
<h2>Definitions</h2>
${definitionsHtml}
</div>
<div class="form-card" id="printable-form">
<h2>Printable SMS opt-in consent form (PDF)</h2>
<p>${printableIntro}</p>
<p>${onlineBlurb}</p>
<div class="form-grid">
<label>Your business name (optional — pre-fills the disclosure)
<input type="text" id="biz-name" placeholder="e.g. Acme Plumbing LLC" maxlength="120" autocomplete="organization"/>
</label>
<label>Business phone (optional)
<input type="tel" id="biz-phone" placeholder="e.g. (555) 123-4567" maxlength="40" autocomplete="tel"/>
</label>
</div>
<div class="btn-row">
<a class="btn btn-primary" id="btn-download" href="${u("/api/sms-opt-in-consent-form-pdf?download=1")}">Download PDF</a>
<a class="btn btn-secondary" id="btn-download-named" href="${u("/api/sms-opt-in-consent-form-pdf?download=1")}">Download with business name</a>
<button type="button" class="btn btn-secondary" id="btn-print">Open PDF to print</button>
</div>
<p class="hint">Direct link: <a href="${u("/sms-cta/consent-form.pdf")}">/sms-cta/consent-form.pdf</a> · API: <a href="${u("/api/sms-opt-in-consent-form-pdf?download=1")}">/api/sms-opt-in-consent-form-pdf</a></p>
<p class="purchase-disclaimer">Consent to receive SMS messages is not required as a condition of purchasing goods or services.</p>
<iframe class="pdf-preview" id="pdf-preview" title="SMS opt-in consent form PDF preview" src="${u("/api/sms-opt-in-consent-form-pdf")}"></iframe>
</div>
<div class="shots-card" id="platform-screenshots">
<h2>Platform screenshots (A2P / manual consent)</h2>
<p style="margin-bottom:18px">${shotsIntro}</p>
<figure class="shot"><figcaption><strong>Figure 1 — Opt-in method requirement (default view)</strong> Example of Opt In method requirement default view, unchecked box.</figcaption><img src="${u("/sms-cta/figure1.png")}" alt="Example of Opt In method requirement default view, unchecked box" width="1200" height="auto" loading="lazy"/></figure>
<figure class="shot"><figcaption><strong>Figure 2 — Manually entered contact (consent required)</strong> Platform view of a manually entered contact. The business must select an end-user consent method (checkbox plus consent source, including external website URL when applicable) before SMS can be sent.</figcaption><img src="${u("/sms-cta/figure2.png")}" alt="Tradesman customer panel showing SMS opt-in consent form with consent source dropdown" width="1200" height="auto" loading="lazy"/></figure>
<figure class="shot"><figcaption><strong>Figure 3 — ${figure3Caption}</strong></figcaption><img src="${u("/sms-cta/3.png")}" alt="${figure3Caption}" width="1200" height="auto" loading="lazy"/></figure>
<figure class="shot"><figcaption><strong>Figure 4 — SMS console after consent or inbound contact</strong> Platform view of the SMS console after consent has been recorded by the client/business and/or after the end user initiated contact with the business number (inbound call). Texting is enabled; the first outbound SMS includes an automatic compliance footer.</figcaption><img src="${u("/sms-cta/sms-console-enabled.png")}" alt="Tradesman SMS channel enabled with first-text compliance notice" width="1200" height="auto" loading="lazy"/></figure>
</div>
<h2>${disclosureTitle}</h2>
<p>${disclosurePlacement}</p>
<blockquote class="disclosure" cite="${esc(canonical)}">${disclosureText}</blockquote>
<p>${closing}</p>
<footer class="nav" aria-label="Related pages">
<ul>
<li><a href="${u("/privacy")}">Privacy Policy</a></li>
<li><a href="${u("/terms")}">Terms &amp; Conditions</a></li>
<li><a href="${u("/sms")}">SMS Consent and Messaging Terms</a></li>
<li><a href="${u("/sms-cta/submit")}">Submit SMS opt-in consent</a></li>
<li><a href="${u("/")}">Home</a></li>
</ul>
</footer>
</main>
<p style="margin:18px 0 0;font-size:13px;color:#6b7280;text-align:center">Tradesman Systems — public compliance documentation</p>
</div>
<script>
(function(){var nameEl=document.getElementById("biz-name");var phoneEl=document.getElementById("biz-phone");var btnDownload=document.getElementById("btn-download");var btnDownloadNamed=document.getElementById("btn-download-named");var btnPrint=document.getElementById("btn-print");var pdfPreview=document.getElementById("pdf-preview");if(!nameEl||!btnDownload)return;function pdfQuery(download){var q=new URLSearchParams();if(download)q.set("download","1");var n=(nameEl.value||"").trim();var p=phoneEl&&phoneEl.value?phoneEl.value.trim():"";if(n)q.set("businessName",n.slice(0,120));if(p)q.set("businessPhone",p.slice(0,40));var s=q.toString();return "/api/sms-opt-in-consent-form-pdf"+(s?"?"+s:"");}function refreshLinks(){var dl=pdfQuery(true);var inline=pdfQuery(false);btnDownload.href=dl;btnDownloadNamed.href=dl;if(pdfPreview)pdfPreview.src=inline;}nameEl.addEventListener("input",refreshLinks);if(phoneEl)phoneEl.addEventListener("input",refreshLinks);refreshLinks();if(btnPrint){btnPrint.addEventListener("click",function(){window.open(pdfQuery(false),"_blank","noopener,noreferrer");});}})();
</script>
</body>
</html>`
}

export async function renderSmsCtaGuidanceHtmlPage(options?: { requestOrigin?: string }): Promise<string> {
  const raw = await fetchPlatformSettingValue(SMS_CTA_GUIDANCE_SETTINGS_KEY)
  const page = parseSmsCtaGuidancePage(raw, DEFAULT_SMS_CTA_GUIDANCE_PAGE)
  return renderSmsCtaBody(page, options?.requestOrigin)
}
