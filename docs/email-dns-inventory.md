# Email DNS inventory & migration — GoDaddy, Resend, Zoho

Use this while inventorying with GoDaddy / Resend / Zoho. Fill in **Current** from each dashboard; mark **Target** when cutover is done.

**Locked provider decision:** Treat **Resend as production-ready**. Do **not** replace or restructure the Resend integration unless a required DNS or authentication gap is found. **Migration effort goes to GoDaddy DNS and Zoho domain separation** — not swapping inbound vendors.

See also: [email-architecture-v2.md](./email-architecture-v2.md)

---

## Target state (one page)

| Zone | MX owner | Purpose |
|------|----------|---------|
| `tradesman-us.com` (root) | **Resend** | All customer + platform mail → Tradesman (`resend-inbound` → DB → Conversations) |
| `mail.tradesman-us.com` | **Zoho** (transition) | Staff only: `joe@`, `justin@`, `admin@` |
| Website (`www`, apex) | **Vercel** | Unchanged |

```text
Internet
   ├─ @tradesman-us.com        → Resend MX → webhook → Tradesman
   ├─ @mail.tradesman-us.com   → Zoho MX   → staff inboxes (optional forward targets)
   └─ www / apex               → Vercel
```

**Validated:** Inbound to `joe@tradesman-us.com` already lands in Tradesman Conversations (Resend + `resend-inbound` path works).

---

## 1. GoDaddy — `tradesman-us.com` (root)

Export every DNS record. For each row: **Keep | Change | Delete** and note **why**.

| Type | Host / Name | Current value | TTL | Target | Notes |
|------|-------------|---------------|-----|--------|-------|
| MX | `@` | | | Resend inbound MX | **Remove Zoho MX on root** when ready |
| TXT | `@` | SPF | | Include Resend send + receive | Merge one SPF; avoid duplicate TXT |
| TXT | `_dmarc` | | | Start `p=none`, tighten later | |
| CNAME | `resend._domainkey` (or per Resend UI) | | | Resend DKIM | Outbound signing |
| CNAME | `www` | | | Vercel | |
| A / ALIAS | `@` | | | Vercel | |
| MX | `mail` | | | **Do not point root here** | Staff subdomain only |
| TXT | other | | | | Google verification, etc. |

**Pre-cutover:** Lower MX TTL to **300** (5 min) 24–48h before changing MX.

**Do not delete** until Resend domain shows **Verified** for both **Sending** and **Receiving** (if Resend separates them).

---

## 2. GoDaddy — `mail.tradesman-us.com` (staff subdomain)

Create this zone if it does not exist yet.

| Type | Host | Current | Target | Notes |
|------|------|---------|--------|-------|
| MX | `mail` | | Zoho MX records | `joe@mail.tradesman-us.com`, etc. |
| TXT | `mail` | | Zoho SPF | Per Zoho setup wizard |
| CNAME | Zoho DKIM selectors | | Zoho | Staff send from Zoho if needed |

**Staff addresses to create in Zoho on `mail.`:**

- `joe@mail.tradesman-us.com`
- `justin@mail.tradesman-us.com`
- `admin@mail.tradesman-us.com`

Root `joe@tradesman-us.com` can remain temporarily as a **Tradesman platform channel** (legacy); long-term staff moves to `mail.`.

---

## 3. Resend dashboard

| Item | Where to check | Current | Action |
|------|----------------|---------|--------|
| Domain `tradesman-us.com` | Domains | | Must be **Verified** for send |
| Inbound / receiving | Domain → Receiving | | Note MX values Resend expects on root |
| Webhook `email.received` | Webhooks | | URL = `https://<project>.supabase.co/functions/v1/resend-inbound` |
| Webhook signing secret | Webhook detail | | = Supabase secret `RESEND_WEBHOOK_SECRET` (not API key) |
| API key | API Keys | | `RESEND_API_KEY` on Supabase Edge + Vercel |
| From address | Sends / domain | | `RESEND_FROM_EMAIL` on Vercel (ops + outbound) |
| Inbound test | Logs | | Confirm `email.received` → HTTP 200, `routed: true` |

**Do not change** unless inventory finds a gap:

- Webhook URL (Supabase Edge, not Vercel SPA)
- Svix signature verification in `resend-inbound`
- Outbound send path (`api/outbound-messages.ts`)

**Retire when DB forward is enough:**

- Vercel `RESEND_ZOHO_FORWARD_JSON` (legacy skip-Tradesman forward map) — replace with per-channel `forward_to_email` after store

---

## 4. Zoho Mail

| Item | Current | Target |
|------|---------|--------|
| Primary domain on root `@` | | **Remove** as MX owner on root |
| Mailboxes on `@tradesman-us.com` | e.g. `joe@…` | Migrate staff to `@mail.tradesman-us.com` |
| Forwards from root to Zoho | | Optional copy only; Tradesman stores first |
| SPF/DKIM on root | | After cutover: root SPF/DKIM = Resend, not Zoho |

---

## 5. Supabase (Tradesman app)

| Item | Status | Notes |
|------|--------|-------|
| SQL `supabase/platform-email-routes.sql` | ☐ Run in SQL Editor | Routes + myT slug claim |
| Edge `resend-inbound` deployed | ☐ | `npm run supabase:deploy:resend-inbound` (CLI pin 2.92.1 on Windows) |
| Secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | ☐ | Edge Functions |
| Frontend: myT Tradesman email section | ☐ | Push to Vercel after commit |

---

## 6. Cutover sequence (safe order)

1. **Inventory** — complete tables above; no DNS deletes yet.
2. **Add `mail.` zone** — Zoho MX for staff; create `joe@mail.…` mailboxes; test send/receive on `mail.` only.
3. **Verify Resend** — root domain sending + receiving green; webhook test message → Conversations.
4. **Lower TTL** on root MX.
5. **Switch root MX** to Resend (if not already).
6. **Test matrix:**

   | Send to | Expect |
   |---------|--------|
   | `joe@tradesman-us.com` | Tradesman Conversations (Joe's account) |
   | Claimed slug `@tradesman-us.com` | That customer's Conversations |
   | `joe@mail.tradesman-us.com` | Zoho inbox (not Tradesman unless you add a route later) |

7. **Remove** root Zoho MX and legacy `RESEND_ZOHO_FORWARD_JSON` when confident.
8. **Ops mail** — set `ADMIN_SIGNUP_NOTIFY_EMAIL` to one explicit list (e.g. `joe@mail.tradesman-us.com,justin@mail.tradesman-us.com`).

---

## 7. What we are explicitly NOT doing now

- Replacing Resend with Mailgun/SES (abstract layer exists for future scale only)
- Rebuilding outbound send (`api/outbound-messages.ts`)
- Moving customer addresses to `@mail.tradesman-us.com`
- Dual MX on the same hostname

---

## 8. Open inventory questions (fill in as you go)

1. Does root MX today point to **Zoho**, **Resend**, or **both** (priority order)?
2. Is `tradesman-us.com` **fully verified** in Resend for inbound catch-all / arbitrary local-parts?
3. Which `@tradesman-us.com` addresses still have **Zoho mailboxes** vs **Tradesman channels only**?
4. Is `mail.tradesman-us.com` already a zone in GoDaddy, or only root?
5. Any **Google Workspace** or other MX on subdomains?

---

*Last updated: 2026-06. Resend = production inbound/outbound for v2; migration = DNS + Zoho separation.*
