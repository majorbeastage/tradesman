# SEO campaigns for Tradesman clients — reference guide

Saved from product planning (Aug 2026). Use this when scoping Growth campaigns, client access, and platform integrations.

---

## SEO is not one API

Paid Meta ads = one platform, one token, create/pause campaigns.

**SEO / local visibility** is usually a **bundle**:

| Layer | Examples | Typical access |
|--------|-----------|----------------|
| **Local SEO** | Google Business Profile posts, reviews, categories, photos, service areas | GBP **Manager** invite |
| **Website SEO** | Title tags, service pages, schema, speed, mobile | Website admin / hosting / DNS |
| **Reviews & reputation** | Review requests, responses (Google, Yelp, Facebook) | GBP + Yelp for Business + Meta Page |
| **Content** | Blog/service-area pages, landing pages | Website CMS |
| **Reporting** | Rankings, traffic, conversions | Google Search Console, Analytics |
| **Paid (optional)** | Google Ads / LSA | Google Ads **Manager (MCC)** link |

Developer apps (Yelp API, future GBP API) are for **reading/syncing data**. They do not “launch an SEO campaign” by themselves.

---

## What clients give Tradesman (by goal)

### If you only **monitor + recommend** (Phase 1)

- **Website URL** (Growth — already in app)
- **Google Business Profile URL** + **Manager invite** to Tradesman ops email
- **Yelp / Facebook URLs** + manager access if you’ll respond to reviews
- **No** developer-app connection from the client

### If you **run local SEO** (most trades clients)

- **Google Business Profile — Manager** (not just viewer)
- Optional: **Yelp for Business** user invite
- **Tradesman CTA slug** (`/cta/{slug}`) for tracked leads — already in Growth campaigns

### If you **fix the website**

- WordPress/Wix/Squarespace **admin**, or agency collaborator
- Sometimes **DNS** (for SSL, redirects, verification files)

### If you **prove results**

- **Google Search Console** — property owner or full user on their domain
- **Google Analytics 4** — editor or admin on their property

### If you also run **Google Ads** (often sold with “SEO”)

- Client links their Google Ads account to **Tradesman’s MCC** (Manager account)
- Separate from GBP; separate from organic SEO

**None of this goes through the Yelp developer app.** That app is only for Tradesman’s server to pull public Yelp data. Listing management stays on **Yelp for Business** invites.

---

## Yelp developer app vs Yelp for Business (FAQ)

| Question | Answer |
|----------|--------|
| Does the client grant access **to your Yelp developer app**? | **No** — not for SEO campaigns or read-only sync. |
| Is the API linked to **your** Yelp Business account? | **No** — developer key = consumer developer account; separate from biz.yelp.com. |
| What **does** the client grant for SEO? | **GBP Manager**, website access, optionally GSC/GA, Yelp/Meta **business** manager invites — each platform its own. |
| Can Tradesman “launch SEO” like Meta ads? | **Not as one click** — you launch a **managed campaign** with tasks, access, and reporting inside Growth + Admin. |

---

## What Tradesman already has

Growth is built as a **campaign request + admin fulfillment** pipeline:

- **Growth → Campaigns** — client builds/submits campaigns (budget, areas, landing slug, snapshots)
- **Admin → Ads & campaigns** — ops creates `ad_campaigns`, client approval, spend tracking
- **Meta** — fully wired for paid social
- **Channels today:** Google Ads/LSA, GBP, Meta, Yelp, etc. — mostly **manual ops**, not API-driven SEO
- **Planned (growth-module-spec):** GBP OAuth sync (5C), website SEO audit crawl (5D), review hub (5E)

---

## How to productize “SEO campaigns” in Tradesman

Treat an SEO campaign as a **managed package** with deliverables and access checklist:

```
Client (Growth)                    Tradesman Admin
─────────────────                  ─────────────────
New campaign → type: Local SEO     Create linked ad_campaign
Pick services + cities/ZIPs        Assign deliverables + timeline
Set monthly budget / fee           Track tasks (GBP posts, pages, reviews)
Submit for approval                Mark milestones complete
See before/after snapshots         Log spend / management fees
```

### Suggested campaign types

1. **Local SEO** — GBP optimization, review velocity, maps visibility
2. **Website SEO** — audit + page/schema/speed fixes
3. **Local + Website** — bundle (typical for trades)
4. **SEO + Google LSA/Ads** — organic + paid (separate ad spend line)

### Suggested channel ids

- `seo_local` / `seo_website` (or one `seo` with subtype in metadata) — distinct from `google` (paid).

### Per-campaign deliverables (campaign metadata, Admin checklist)

- GBP: categories, hours, photos, posts, Q&A, review responses
- Website: N service-area pages, schema, meta, Core Web Vitals fixes
- Reviews: X review requests via SMS (Communications)
- Citations: manual list (Yelp, BBB, Angi, etc.) — no universal API

### Attribution

- Leads tagged `google_search`, `google_maps`, `campaign`, CTA slug
- Tie completed jobs/revenue back to the active SEO campaign in reporting

---

## Recommended launch order

| Phase | What you ship | Client grants |
|-------|----------------|---------------|
| **1 — Now (manual)** | SEO campaign template in Growth + Admin task checklist + access log | GBP Manager, website admin, URLs in Growth |
| **2 — Read sync** | GBP + website audit scores in Growth dashboard | Same + optional GSC read-only |
| **3 — Execution helpers** | Review request campaigns (SMS), GBP post drafts, AI page copy → client/ops publish | GBP Manager, comms opt-in |
| **4 — Paid add-on** | Google Ads / LSA via MCC (like Meta panel) | Ads MCC link |

Yelp fits **Local SEO reporting + review reminders**, not the core “launch” mechanism — unless you sell Yelp Ads as a separate paid channel.

---

## Practical first SKU example

**“Local Visibility — 90 days”**

- GBP tune-up
- 2 posts/month
- Review request flow
- 1 service-area page
- Monthly snapshot in Growth

Can run **fully manual in Admin** using existing `ad_campaigns` + Growth campaigns while adding:

- SEO campaign template + access checklist in the client UI
- Admin task board per campaign
- GBP + website connectors for before/after scores

---

## Decision checklist (when ready to build)

1. First SEO SKU: **local only**, **website only**, or **bundle**?
2. Is **Google Ads / LSA** included in the same package or separate?
3. That drives Growth templates, Admin channels, and which OAuth connections to prioritize.
