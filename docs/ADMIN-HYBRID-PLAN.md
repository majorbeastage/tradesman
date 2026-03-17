# Admin portal: Supabase hybrid build plan

**Idea:** Code defines *what can be configured*; Supabase stores *the actual config*. Admins change config in the admin UI → no deploy.

---

## Terminology (who is who)

- **Your customers** (the people you bill; they get a portal to manage their business): we call them **clients** (table `clients`) or **users** / **contractors** in the UI. They log in as role **user** or **office_manager** and are linked to a **client** via `profiles.client_id`. They use the portal to manage *their* customers.
- **Your customers' customers** (the people your clients serve – homeowners, businesses, etc.): these are the records in **Customers**, **Leads**, **Conversations**, **Quotes**. You (the platform) do not bill these people; only your clients (contractors) do. Admins, office managers, and users all create and manage these records on behalf of the client.

So: **client** / **user** / **contractor** = your customer (tenant). **Customer** (table) / leads / quotes = their customer (end consumer).

---

## What's already in place

- **Supabase:** `clients`, `portal_tabs`, `custom_fields`, `custom_field_dependencies` (see `supabase-admin-portal-builder.sql`).
- **Profiles:** `profiles.client_id` links a user to a client (optional).
- **Admin UI:** Portal Builder → pick a client, then:
  - **Custom fields** – add/edit/delete; types: checkbox, dropdown, text, textarea; optional dependencies.
  - **User portal tabs** – which tabs show for "user" portal, order, visible, custom labels.
  - **Office Manager portal tabs** – same for office manager portal.
- **App:** Reads `client_id` from auth (profile), fetches `portal_tabs` and `custom_fields` for that client. Sidebar and Settings use that config.

So: **per-client tabs and custom fields are already data-driven.** What's missing is making sure users are *assigned* to the right client and adding more "knobs" (settings, toggles) in Supabase.

---

## Build phases

### Phase 1 – Done  
Clients, portal tabs, custom fields. Admin can configure tabs and custom fields per client.

### Phase 2 – Assign users to a client (next)

**Goal:** When a user logs in, they see the portal for *their* client. Right now `profiles.client_id` exists but there's no admin UI to set it.

**Supabase:** Already have `profiles.client_id`. No schema change if RLS allows admins to update it.

**Admin UI:**
- In **Users** (or a new "User management" section): list users (from profiles or admin-users Edge Function). Per user: **Client** dropdown (from `clients`). Save updates `profiles.client_id` for that user.
- Optional: bulk "Assign all to Default client" for migration.

**Result:** Admins assign each user to a client on the fly; that user's portal (tabs, custom fields) is that client's config.

### Phase 3 – Portal "settings" (per-client defaults)

**Goal:** Admins set default values for things like "Calendar default view", "First day of week", "Leads default status", etc., per client. App reads from Supabase first, then falls back to code defaults.

**Supabase:**
- New table: `client_settings`  
  `(client_id, key, value)`  
  e.g. `('client-uuid', 'calendar_default_view', 'week')`, `('client-uuid', 'first_day_of_week', '1')`.

**Code:**
- **Registry:** One place (e.g. `constants/portal-settings.ts`) listing all keys, labels, types, and code defaults.
- **API:** `fetchClientSettings(clientId)`, `upsertClientSetting(clientId, key, value)`.
- **App:** When loading Calendar/Leads/etc., merge client_settings over code defaults (and optionally keep localStorage for user overrides if you want).

**Admin UI:** In Portal Builder, new section "Portal settings" (or under each tab): for selected client, show the registry of settings; admin can set value per key. Save writes to `client_settings`.

**Result:** Admins control default behavior per client without code changes.

### Phase 4 – Feature toggles (optional)

**Goal:** Per-client flags like "Quotes enabled", "Calendar enabled". App shows/hides whole sections based on these.

**Options:**
- **A)** Reuse **portal_tabs**: turning off the "quotes" tab already hides it. So "feature toggles" = tab visibility. No new table.
- **B)** New table `client_features(client_id, feature_id, enabled)` if you want toggles that aren't 1:1 with tabs (e.g. "Allow export").

Start with (A); add (B) only if you need toggles that aren't tabs.

### Phase 5 – More "building blocks" over time

- **Dropdown options** for quotes/leads/etc. stored in Supabase, admin-editable (you have some of this; extend as needed).
- **Branding:** `clients.logo_url`, `clients.primary_color`; app reads and applies. Optional.
- **New tab types / pages:** Still require code + deploy; then the *visibility* and *order* for that tab are controlled via existing `portal_tabs`.

---

## Suggested order

1. **Phase 2** – Assign users to clients in the admin UI. Ensures "custom portal per user" actually works.
2. **Phase 3** – Add `client_settings` + registry + admin UI so admins can set per-client defaults (calendar, leads, etc.) on the fly.
3. Rely on **Phase 1 + 2 + 3** for a solid hybrid; add Phase 4–5 as needed.

---

## Where things live (summary)

| What | Where | Who changes it |
|------|--------|----------------|
| Clients | Supabase `clients` | Admin |
| Which tabs, order, labels | Supabase `portal_tabs` | Admin |
| Custom fields (definitions) | Supabase `custom_fields` | Admin |
| User → client | Supabase `profiles.client_id` | Admin (Phase 2) |
| Per-client default settings | Supabase `client_settings` (Phase 3) | Admin |
| List of possible settings | Code (registry) | Dev (once per new setting type) |
| New pages / new tab ids | Code | Dev (deploy) |

This is the Supabase hybrid: **capabilities in code, configuration in Supabase.**
