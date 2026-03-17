# Admin portal setup (one-time)

Do these steps once. **No Edge Function is required** to create users from the Admin portal.

---

## 1. Run SQL in Supabase (in this order)

In **Supabase Dashboard → SQL Editor**, run each script as a **New query**:

1. **`supabase-profiles-roles.sql`**  
   Creates `profiles` (role, display_name) and a trigger that creates a profile when someone signs up. Creates `is_admin()` and RLS.

2. **`supabase-admin-portal-config.sql`**  
   Adds **`portal_config`** (JSONB) to `profiles`. The admin portal uses this for per-user visibility (tabs, settings, dropdowns). Default `{}` = all visible.

Optional: **`supabase-admin-portal-builder.sql`** (clients, portal_tabs, custom_fields). Not required for the new admin portal. "—"
---

## 2. First admin user

You need one user with role **admin** so they can open the Admin portal and create others.

**Option A – Supabase Dashboard**

1. **Authentication → Users → Add user** (or Invite). Create a user with the email you want for the first admin.
2. Copy that user's **UUID** from the table.
3. In **SQL Editor** run (replace with the real UUID):

   ```sql
   INSERT INTO public.profiles (id, role) VALUES ('PASTE-USER-UUID-HERE', 'admin')
   ON CONFLICT (id) DO UPDATE SET role = 'admin';
   ```

**Option B – Sign up in the app, then promote**

1. In Supabase: **Authentication → Providers → Email** → turn **Enable Sign Up** on.
2. In your app, sign up once with the admin email.
3. In Supabase **Authentication → Users**, copy that user's UUID.
4. Run the same `INSERT ... ON CONFLICT` SQL above with that UUID.

Then log in to the app, go to the home page, and use **Admin Login** to open the Admin portal.

---

## 3. Environment variables

In your app folder, create or edit **`.env`** (or `.env.local`):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Get both from **Supabase Dashboard → Project Settings → API**. Restart the dev server after changing `.env`.

---

## 4. Supabase Auth settings

- **Authentication → Providers → Email** → **Enable Sign Up** must be **on** so the Admin "Create user" flow can create new users.
- **Authentication → URL Configuration** → add your app URL (e.g. `http://localhost:5173` or your production URL) if you have redirect/email links.

---

## 5. What the Admin portal does

- **Select user**: Dropdown lists all users (profiles) from Supabase. Pick one to configure their portal.
- **Configure view**: For that user you can toggle **visibility** for:
  - **Sidebar tabs**: Dashboard, Leads, Conversations, Quotes, Calendar, Customers, Web Support, Tech Support, Settings. Checked = visible, unchecked = hidden. Default = all visible.
  - **Settings sections**: Custom fields, working hours, quote/lead/conversation settings. Same on/off. Default = all visible.
  - **Dropdowns**: Lead source, job type, status, priority. Same on/off. Default = all visible.
- **Save**: Updates `profiles.portal_config` for that user. When they log in, the main app uses this to show or hide tabs (and in future, settings/dropdowns).

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| "Supabase not configured" | `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; restart dev server. |
| "Could not reach Supabase" / "Failed to fetch" | Same as above; also ensure the project is not **paused** (Dashboard → Project Settings). |
| No profiles in dropdown | Run **`supabase-profiles-roles.sql`** and create at least one user (e.g. sign up or add in Supabase Auth), then set one profile to admin (see step 2). |
| "column portal_config does not exist" | Run **`supabase-admin-portal-config.sql`** in the SQL Editor. |
