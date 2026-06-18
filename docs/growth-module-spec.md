# Tradesman Growth Module — Product Specification

**Status:** Framework v1 in app (`growth` tab). Integrations (Google Business Profile API, website crawl, ad platforms) are **partial / planned**.

---

## Philosophy

The Growth module is **not** a marketing agency replacement or an advertising platform.

It helps businesses:

- Attract **better** customers  
- Convert more leads  
- Improve online presence  
- Measure whether marketing dollars produce **completed work and revenue**

Growth is another engine inside Tradesman:

| Engine | Role |
|--------|------|
| **Communications** | Brings customers into the platform |
| **Workflow** | Manages the work |
| **Operations** | Completes the work |
| **Growth** | Creates more opportunities to enter the system |

**Design principle:** Every Growth feature connects to Communications, CRM, Conversations, Workflow, Estimates, Reporting, Calendar, Operations, and AI. Nothing exists in isolation. Every lead flows into the rest of the platform.

---

## Primary questions (dashboard)

1. How are customers finding me?  
2. How can I attract more of the **right** customers?  
3. Which marketing efforts actually make me money?  
4. What should I improve next?

Emphasis: **actionable recommendations**, not vanity metrics.

---

## Dashboard metrics (target)

- Overall Growth Score  
- Lead Health Score  
- Google Business Profile Score  
- Website Health Score  
- Review Score  
- Conversion Rate  
- Marketing ROI  
- Monthly Revenue Attributed to Marketing  
- Trend graphs  

*v1 framework:* placeholder scores + manual checklist until APIs connect.

---

## Lead Acquisition

**Not** fake or purchased leads — **better qualified** leads.

| Capability | v1 | v2+ |
|------------|----|-----|
| Google Business Profile optimization | Checklist + score placeholder | GBP API sync |
| Website optimization / SEO tips | URL + checklist | Automated crawl |
| Local service area recommendations | Manual | Geo + competitor hints |
| Landing pages / CTA | Link to `/cta/{slug}` | Builder in Growth |
| Call tracking | Twilio numbers (existing) | Attribution tie-in |
| Contact forms | CTA embed (existing) | Form designer |
| Campaign templates | Template list (draft) | Provider integrations |
| Referral / review campaigns | Link to Conversations | Automated sequences |

---

## Google Business Profile

Strongest long-term area. Monitor: verification, categories, hours, photos, reviews, posts, service areas, phone, website, missing fields, ranking opportunities.

**Health score + AI recommendations** (example):

> Growth Score: 82/100  
> • Add 10 new project photos  
> • Respond to three unanswered reviews  
> • Add Easley as a service area  
> • Publish one Google Business post  
> • Ask five recent customers for reviews  

---

## Website Health

Analyze customer websites: SSL, mobile, speed, SEO, meta, broken links, schema, accessibility, contact consistency. One-click AI improvement suggestions.

---

## Reviews

Central management: Google, Facebook, future providers. Trends, rating, velocity, AI response drafts, review request campaigns via SMS/email (Communications).

---

## Campaign Builder

**Not an ad agency** — **templates** + configuration:

- Budget, radius, service area, phone, landing page, target service, duration  
- Examples: Spring HVAC Tune-Up, Free Roof Inspection, Holiday Lighting, Landscape Maintenance  
- Integrate with ad providers when possible rather than replacing them  

---

## Attribution

Attribute every lead when possible:

`Google Search · Google Maps · Facebook · Website · Referral · Repeat · Phone · Email · Direct · Campaign`

Lifecycle:

```text
Source → Conversation → Lead → Estimate → Work Order → Invoice → Revenue
```

Business questions:

- Which source generated the most **completed work**?  
- Which campaign generated the highest **revenue**?  
- Which channel has the highest **close rate**?  

*v1:* `lead_attribution` on leads/customers metadata; Growth dashboard reads aggregates (future SQL).

---

## AI Growth Advisor

Recommendations, not raw charts:

- "You haven't posted to Google Business in 21 days."  
- "You are receiving fewer reviews than competitors."  
- "Your website is missing pages for three nearby service areas."  
- "Landscape Maintenance has the highest close rate this month."  

Uses platform assistant + rules; full LLM advisor is ongoing (Phase 2 hardening).

---

## Long-term vision

Growth = business development engine — easier to find, contact, and choose. Tradesman makes every marketing dollar more valuable without competing with agencies.

---

## Implementation map (repo)

| Area | Path |
|------|------|
| UI shell | `src/modules/growth/GrowthPage.tsx` |
| Types / metadata | `src/lib/growthModule.ts` |
| Portal tab | `growth` + `enable_growth_tab` in `portal-builder.ts` |
| Quick link | `growth` in `dashboardQuickLinksPrefs.ts` |
| Launch tasks | `docs/launch-work-list.md` Phase 5 |

---

## Phased delivery (aligned with launch work list)

| Phase | Deliverable |
|-------|-------------|
| **5A (now)** | Tab, page shell, scores placeholders, section nav, CTA links, metadata persistence |
| **5B** | Lead attribution fields on Leads + dashboard rollups |
| **5C** | GBP OAuth + health sync |
| **5D** | Website audit job (SSL/speed/SEO) |
| **5E** | Review hub + request campaigns |
| **5F** | Campaign templates + optional ad API hooks |
| **5G** | AI Growth Advisor (scheduled insights) |
