# Tradesman Email Architecture v2 (locked)

> **Tradesman owns the root domain.**
>
> Every email to `@tradesman-us.com` belongs to the platform.
>
> External mailbox providers are optional integrations, not the system of record.
>
> Staff mailboxes live on `mail.tradesman-us.com` — never on the customer-facing root domain.

---

## Product promise

**Customer-facing addresses are clean and on the root domain:**

- `stillcreek@tradesman-us.com`
- `abcplumbing@tradesman-us.com`
- `joeselectric@tradesman-us.com`

**Not** `businessname@mail.tradesman-us.com`. The `mail.` subdomain is for Tradesman staff only.

The root domain is the **platform communication layer**. Every message to `@tradesman-us.com` hits Tradesman first, is stored in the database, appears in Conversations, and only then may optionally forward to an outside mailbox.

When a business signs up, they get access to a professional communications identity without Google Workspace, Microsoft 365, or Zoho. Tradesman is the hub — not a forwarding tool.

---

## Locked architecture assumptions

| Assumption | Detail |
|------------|--------|
| Root MX | `@tradesman-us.com` MX → Tradesman inbound provider (Resend v2) |
| Staff mail | Separate namespace: `@mail.tradesman-us.com` (Zoho may host temporarily) |
| Zoho | Must **not** own root MX; optional staff host on `mail.` only |
| Customer addresses | **Routes**, not mailbox seats |
| Departments | **Routes / queues**, not paid inboxes |
| Inbound order | **Store first, forward second** — always |
| Inbound provider | **Resend — production-ready, locked for v2**; abstract ingest only if scale forces Mailgun/SES later |
| Reserved names | Database registry; enforced at claim time |
| Customer UI | Email name selection in **myT → Account settings** |
| Custom domains | Future verified routes; same store-first behavior |

**Inbound path (required order):**

```text
Internet → Inbound provider webhook → Tradesman ingest → Database → Conversations → Optional forward
```

**Outbound:** Customer sends from Tradesman. Recipients see the business address (`stillcreek@tradesman-us.com` or verified custom domain). Replies return to the platform.

---

## Customer flow (v2)

1. **Customer signs up** — no email slug required at signup; account is created first.
2. **myT → Account settings** — customer chooses their Tradesman email name (e.g. `stillcreek@tradesman-us.com`).
3. **Tradesman validates** — reserved local-part registry + uniqueness across all tenants.
4. **Incoming mail** to that address hits Tradesman inbound (root MX) before anything else.
5. **Tradesman stores** the message, shows it in Conversations, links it to the right customer/account, and **optionally** forwards a copy to the client’s personal or existing business email.
6. **Reply capture** — if the client replies from their external inbox, outbound messages and threading should keep the `@tradesman-us.com` address in the loop (Reply-To / From / thread headers) so the conversation stays captured in Tradesman.

Customer addresses are **routes** into the platform. They do not require a Zoho seat, Google license, or any external mailbox.

---

## myT account settings — customer-facing copy

The account communications section should explain two paths simply. Both make clear that **Tradesman is the communication hub**, not just a forwarder.

### Option A — Free Tradesman address (v2 launch)

> **Use a free Tradesman address**
>
> Example: `stillcreek@tradesman-us.com`
>
> Mail sent to this address is received by Tradesman first. Messages appear in your Conversations inbox. You can optionally forward copies to your personal email. You send customer email from Tradesman using this address.

**UI elements to build:**

- Local-part text field with live preview: `{slug}@tradesman-us.com`
- Availability check (reserved + taken)
- Optional **Forward copies to** email (applied after store)
- Short explainer: “Tradesman stores every message. Forwarding is optional.”

### Option B — Your own domain (future)

> **Use your own domain**
>
> Example: `servicerequests@stillcreeklandscaping.com`
>
> Verify your domain in Tradesman. Mail to this address is received by Tradesman first — same Conversations inbox, same optional forward. Your team can still use personal addresses (e.g. `nick@stillcreeklandscaping.com`) through their normal email provider.

**UI elements to build (later):**

- Domain connect wizard (DNS verification: MX and/or CNAME per provider docs)
- Local-part picker on verified domain
- Status: pending / verified / failed
- Same optional forward field and same hub messaging as Option A

**Product rule:** Option A and Option B behave identically inside Tradesman. Only the visible address and DNS setup differ.

---

## Future custom domain flow

**Example business:** Still Creek Landscaping

| Address | Who owns it | Where mail goes |
|---------|-------------|-----------------|
| `stillcreek@tradesman-us.com` | Tradesman (Option A) | Tradesman → DB → Conversations |
| `servicerequests@stillcreeklandscaping.com` | Tradesman verified route (Option B) | Tradesman → DB → Conversations |
| `nick@stillcreeklandscaping.com` | Nick’s normal provider (Google, etc.) | Nick’s inbox — **not** Tradesman unless he chooses to forward |

Tradesman **owns** `servicerequests@stillcreeklandscaping.com` as a verified platform route:

1. Customer adds domain in myT.
2. Tradesman provides DNS records (MX for inbound, SPF/DKIM for outbound send-as).
3. Customer verifies ownership.
4. Customer picks local-part (e.g. `servicerequests`, `office`, `info`).
5. Inbound: same pipeline as root — **store first, forward second**.
6. Outbound: Tradesman sends as `servicerequests@stillcreeklandscaping.com`; replies return to Tradesman.

Nick keeps using `nick@stillcreeklandscaping.com` through his existing provider. No conflict. Tradesman does not need to host every employee mailbox — only the **platform routes** the business designates for customer-facing communication.

The Tradesman root address (`stillcreek@tradesman-us.com`) can remain active alongside the custom domain, or the business can prefer the custom domain for outbound — product policy TBD; both routes can coexist.

**Internal model:** `platform_email_routes` rows for both `tradesman-us.com` and verified custom domains share the same `account_id`, `route_kind`, and ingest pipeline.

---

## Address classes

### 1. Root — `@tradesman-us.com` (platform-owned forever)

**Customer primary routes** — chosen in myT account settings:

| Address | Owner |
|---------|--------|
| `stillcreek@tradesman-us.com` | Customer account |
| `abcplumbing@tradesman-us.com` | Customer account |
| `joeselectric@tradesman-us.com` | Customer account |

**Department routes** — routing keys, not mailboxes:

```text
parts@tradesman-us.com  →  Department queue  →  Assign  →  Notify  →  Conversation
```

Examples: `parts@`, `permits@`, `scheduling@`. Per-tenant department addresses (e.g. `parts-stillcreek@` or plus-addressing) — design TBD; primitive is **route → queue**.

**System / platform** — reserved local-parts, never customer-assignable:

| Address | Purpose |
|---------|---------|
| `noreply@tradesman-us.com` | Automated sends |
| `accounts@tradesman-us.com` | Platform billing (avoid `billing@` collision with dept routes) |
| `support@tradesman-us.com` | Platform support |
| `admin@`, `helpdesk@`, `onboarding@`, … | Ops / automation |

### 2. Staff — `@mail.tradesman-us.com` (internal only)

Never shown as customer-facing addresses.

| Address | Purpose |
|---------|---------|
| `joe@mail.tradesman-us.com` | Staff |
| `justin@mail.tradesman-us.com` | Staff |
| `admin@mail.tradesman-us.com` | Staff / ops |

MX for `mail.tradesman-us.com` → Zoho during transition (or Tradesman staff routing later). **Independent** of root MX.

### 3. Verified custom domains — `@customer-domain.com` (future)

Same route semantics as root customer addresses. Verified in myT; inbound MX (or provider-specific setup) points to Tradesman ingest.

---

## Department routing

Departments are **routes / queues**, not paid inboxes:

```text
scheduling@tradesman-us.com
        ↓
   Department queue (per account)
        ↓
   Assignment rules / office manager
        ↓
   Notifications (push, SMS, in-app)
        ↓
   Conversation thread
```

Aligns with org chart and business workflow features already in the product.

---

## Data model (target)

```sql
-- Every address Tradesman accepts (root + verified custom domains)
platform_email_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_part text NOT NULL,
  domain text NOT NULL,                    -- 'tradesman-us.com' or verified custom domain
  route_kind text NOT NULL,                -- 'customer_primary' | 'department' | 'system' | 'reserved'
  account_id uuid REFERENCES auth.users(id),
  department_key text,
  forward_to_email text,                   -- optional; applied AFTER store
  verified_at timestamptz,                 -- null for tradesman-us.com slugs; set for custom domains
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (local_part, domain)
);

-- Reserved local-parts (admin-seeded + dynamic blocklist)
platform_email_reserved_local_parts (
  local_part text PRIMARY KEY,
  reason text
);

-- Extends existing communication_events
communication_events (
  ...
  route_id uuid REFERENCES platform_email_routes(id),
  department_key text,
  provider_inbound_id text UNIQUE,
  forward_status text,
  raw_headers jsonb
);
```

**Evolution:** Today’s `client_communication_channels.public_address` becomes the customer-facing field backed by `platform_email_routes` — evolve, don’t fork.

---

## DNS (target state)

### Root `@tradesman-us.com`

| Record | Purpose |
|--------|---------|
| **MX** → inbound provider | All `@tradesman-us.com` mail → Tradesman |
| **SPF** | Include inbound + send providers |
| **DKIM** | Outbound signing |
| **DMARC** | Gradual enforcement (`none` → `quarantine` → `reject`) |
| **A/CNAME** | Vercel (website) |

**No Zoho MX on root.**

### Staff `@mail.tradesman-us.com`

| Record | Purpose |
|--------|---------|
| **MX** → Zoho (transition) | Staff inboxes only |
| SPF/DKIM | Per Zoho docs if staff send from Zoho |

### Verified custom domain (per customer)

| Record | Purpose |
|--------|---------|
| **MX** → Tradesman inbound (or provider CNAME) | Customer route inbound |
| **SPF/DKIM** | Send-as customer domain from Tradesman |

---

## Ingest architecture

```text
Resend email.received (v2)
        ↓
POST /functions/v1/resend-inbound
        ↓
1. Verify webhook signature
2. Dedupe (provider message id)
3. Resolve (local_part, domain) → platform_email_routes
4. INSERT communication_events (+ attachments → Storage)
5. Link conversation / customer / department queue
6. Optional async forward (forward_to_email) — AFTER commit
7. Return 200; heavy work → queue if needed
```

### Inbound provider abstraction

Normalize all providers to an internal type:

```typescript
type InboundMessage = {
  provider: "resend" | "mailgun" | "ses";
  providerMessageId: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
};
```

`EmailIngressProvider` interface: `verifyWebhook()`, `parsePayload()`, optional `fetchRaw()`. Product code only sees `InboundMessage`.

**v2:** Resend. **Scale path:** Mailgun or SES behind same interface without rewriting Conversations or routing logic.

---

## Build roadmap

### Phase 1 — Foundation (v2 launch)

- [x] `platform_email_reserved_local_parts` + seed — SQL in repo (`supabase/platform-email-routes.sql`)
- [x] `platform_email_routes` table + RLS + claim RPC
- [x] Route resolver in `resend-inbound` + `_shared/inbound-email-channel.ts`
- [x] **myT account settings UI** — slug picker (`TradesmanEmailSettingsPanel`)
- [x] Store-first in ingest (forward after `communication_events` insert)
- [ ] Run SQL + deploy Edge + push frontend to production
- [ ] Deprecate `RESEND_ZOHO_FORWARD_JSON`; DB-driven `forward_to_email` only
- [ ] Root MX confirmed Resend-only; `mail.` on Zoho for staff — [email-dns-inventory.md](./email-dns-inventory.md)

### Phase 2 — Departments + outbound polish

- [x] Department `route_kind` + per-account addresses (`parts-{slug}@tradesman-us.com`)
- [x] myT UI to enable department routes (`sync_platform_department_routes`)
- [x] Reply-To defaults to business address (hub); personal inbox via BCC copy only
- [x] Inbound thread matching via In-Reply-To / References / Message-ID
- [x] Resend delivery/bounce webhook handling on `resend-inbound`
- [x] Deprecated `RESEND_ZOHO_FORWARD_JSON` skip-Tradesman path on Vercel `incoming-email`
- [ ] Run `supabase/platform-email-phase2.sql` in production
- [ ] Register bounce/delivery events on Resend webhook (same endpoint as `email.received`)

### Phase 3 — Custom domains

- [ ] Domain verification wizard in myT (Option B)
- [ ] Per-domain DNS instructions + verification polling
- [ ] Inbound + send-as on verified domain
- [ ] myT copy for Option A vs Option B (hub messaging)

### Phase 4 — Scale + cleanup

- [ ] Resend enterprise validation (volume, catch-all, multi-domain)
- [ ] Remove Zoho from root if any legacy MX remains
- [ ] Single `ADMIN_SIGNUP_NOTIFY_EMAIL` ops recipient list
- [ ] DMARC tighten on root

---

## Relationship to current codebase

| v2 concept | Today |
|------------|--------|
| Customer address | `client_communication_channels.public_address` |
| Inbound ingest | `supabase/functions/resend-inbound`, `api/incoming-email` |
| Event store | `communication_events`, `communication_attachments` |
| Optional forward | `forward_to_email` on channel; legacy `RESEND_ZOHO_FORWARD_JSON` → deprecate |
| Outbound | `api/outbound-messages.ts` |
| Loop prevention | `inbound-email-loop-guard` |
| Account settings UI | `TradesmanEmailSettingsPanel` in myT Account (push to Vercel pending) |

---

## Inbound provider — locked (Resend)

**Decision:** Treat **Resend as production-ready** unless inventory finds a required DNS or authentication gap. **Do not replace or restructure** the existing Resend integration (webhook → `resend-inbound`, outbound → `api/outbound-messages`, Vercel/Edge secrets).

**Focus migration effort on:**

1. **GoDaddy DNS** — root MX → Resend; staff on `mail.` → Zoho; SPF/DKIM/DMARC alignment
2. **Zoho domain separation** — stop owning root MX; staff mailboxes on `@mail.tradesman-us.com` only

The `EmailIngressProvider` abstraction exists for **future scale**, not a near-term vendor swap.

**Validated in production:** Inbound to `joe@tradesman-us.com` → Resend → `resend-inbound` → Tradesman Conversations.

Before marketing provisioned addresses at large scale, optional Resend enterprise check: catch-all / arbitrary local-parts, inbound volume, multi-domain inbound, pricing.

Operational inventory worksheet: [email-dns-inventory.md](./email-dns-inventory.md).

---

## Inbound provider note (historical — alternatives)

Mailgun or SES remain the documented **scale path** if Resend limits bite — not a product redesign. No action unless enterprise review finds a blocker.

---

## Migration (safe cutover)

1. **Inventory** GoDaddy DNS — mark keep / replace / delete.
2. **Lower MX TTL** (300s).
3. **Point root MX** → Resend inbound; webhook → `resend-inbound`.
4. **Keep `mail.` on Zoho** for staff (`joe@`, `justin@`, `admin@`).
5. **Test** `testbusiness@tradesman-us.com` → DB → Conversations → optional forward.
6. **Launch** myT slug picker for customers.
7. **Retire** root Zoho MX and legacy forward JSON when confident.

---

## Design principles (checklist)

- [x] Product promise locked: customer addresses on root `@tradesman-us.com`, not `mail.`
- [ ] Root MX → Tradesman inbound only; Zoho not on root
- [ ] Store every message before optional forward
- [ ] Customer slugs: reserved registry + uniqueness; chosen in myT account settings
- [ ] Customer addresses and departments are routes, not mailbox seats
- [ ] Staff on `mail.tradesman-us.com` only
- [ ] Custom domains: verified routes, same hub behavior (Option B)
- [ ] Ingest abstracted for Resend → Mailgun/SES migration
- [ ] External providers (Zoho, Google, M365) = optional forward targets, never required

---

## Open decisions

1. **Per-account department addresses** — Global `parts@` vs per-tenant (`parts-stillcreek@` or plus-tags).
2. **Coexistence** — Can Option A and Option B addresses both receive inbound for one account simultaneously? (Recommended: yes.)
3. **Staff mail long-term** — Zoho on `mail.` vs Tradesman-internal staff inbox.
4. **Slug change policy** — Can customers rename their `@tradesman-us.com` local-part after claim?

---

*Locked direction: 2026-06. Aligns with `resend-inbound`, `communication_events`, and `client_communication_channels`.*
