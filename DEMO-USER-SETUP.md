# Demo user: skip email verification & reset portal settings every 12 hours

## 1. Let the user sign in without email verification

Pick **one** approach (demo / staging is fine; production should keep confirmations on).

### A) Turn off confirmation for the whole project (simplest for demos)

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Turn **off** “Confirm email” (wording may be “Enable email confirmations” — disable it).
3. New sign-ups get a session immediately; existing users who were “unconfirmed” can sign in after you confirm them once (see B) or they re-register.

### B) Confirm one user only (keep confirmations on for everyone else)

1. **Authentication** → **Users** → open the demo user.
2. If you see **Confirm user** / **Email confirmed** toggle, use it so the account is confirmed.
3. If the UI has no toggle, use the **SQL Editor** (service role context) or **Auth Admin API** below.

**Auth Admin API** (one-off script or Edge Function with `SUPABASE_SERVICE_ROLE_KEY` — never expose this key in the browser):

```ts
// Node / script only
import { createClient } from '@supabase/supabase-js'
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
await admin.auth.admin.updateUserById('USER_UUID_HERE', { email_confirm: true })
```

### C) Manually create a confirmed user (no inbox needed)

Dashboard → **Authentication** → **Users** → **Add user** → enter email/password and check **Auto Confirm User** (if shown).

---

## 2. Ensure they exist in `profiles`

The admin “User (profile)” list reads **`public.profiles`**, not only Auth.

- **Table Editor** → **profiles** → row with `id` = that user’s UUID from Authentication.
- If missing, run the snippet in `FIRST-ADMIN-SETUP.md` (repair SQL) or create the user from the Admin portal again after fixing email confirmation.

---

## 3. Reset demo user’s portal settings every 12 hours

“Settings” in this app mostly live in **`profiles.portal_config`** (JSON). Resetting that to `{}` restores default visibility/options for the portal builder.

### Option A — `pg_cron` (database schedule)

Requires the **`pg_cron`** extension (Supabase: **Database** → **Extensions**; availability depends on plan).

**Do not run `CREATE EXTENSION pg_cron` in the SQL Editor** on Supabase — it can fail with:

`ERROR: 2BP01: dependent privileges exist` (internal Supabase/pg_cron setup).

**Correct flow:**

1. **Dashboard only:** **Database** → **Extensions** → find **pg_cron** → enable with the **toggle** (not SQL).
2. If the toggle errors, your plan may not include it — use Option B.
3. Open **`supabase-demo-profile-reset-cron.sql`**, replace `YOUR_DEMO_USER_UUID`, then run **only that file** in **SQL Editor** (it schedules the job; it does not create the extension).

The job runs **every 12 hours** (UTC): `0 */12 * * *` → 00:00 and 12:00 UTC. Adjust the cron expression in the file if you want different times.

### Option B — No `pg_cron` (free tier / no extension)

Use any external scheduler every 12 hours:

- **GitHub Actions** `schedule` cron  
- **cron-job.org**, **EasyCron**, etc.  
- Your own server

Call a **Supabase Edge Function** that runs:

```sql
UPDATE public.profiles
SET portal_config = '{}'::jsonb, updated_at = now()
WHERE id = 'YOUR_DEMO_USER_UUID'::uuid;
```

…using the **service role** (never from the browser). Or run that `UPDATE` from a secure admin script with the service role key.

### What gets reset

- **`portal_config` → `{}`** clears per-user tab/setting/dropdown visibility and related JSON stored there.

It does **not** delete the Auth user, password, or `role` / `display_name` unless you add more `UPDATE` columns. To also clear `display_name` or force `role`, extend the SQL in `supabase-demo-profile-reset-cron.sql`.

---

## Quick checklist

| Goal | Where |
|------|--------|
| User can log in without verifying email | Auth → Providers → Email, or confirm user / Admin API |
| User appears in admin dropdown | Row in **profiles** with same `id` as Auth user |
| Portal “settings” reset on a timer | `pg_cron` SQL file or external cron + service-role `UPDATE` |
