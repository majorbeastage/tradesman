# Office manager portal

## What it is

Office managers use the **same modules** as end users (leads, quotes, calendar, …) but act **on behalf of assigned users** in their organization. The portal header includes a **User** dropdown; all queries use that user’s `user_id` rows.

## Database: who manages whom

| Piece | Purpose |
|--------|---------|
| `public.profiles.role` | `office_manager` (or `admin` for full admin UI). One role per auth user. |
| `public.office_manager_clients` | Rows `(office_manager_id, user_id)` = “this office manager may access this user’s data.” |

- Not every **user** needs an office manager.
- Every **office manager** gets users by having rows pointing **to** them as `office_manager_id`.

**Admins and office manager:** `profiles` allows only one `role`. If someone should both run **Admin** and **Office manager** portals:

1. Keep their role as **`admin`** (recommended), and  
2. In **Admin → Users**, assign them an **Office manager** link to themselves **or** add rows where `office_manager_id` = their UUID and `user_id` = each tech they supervise.

Alternatively, use a **second login** with role `office_manager` only.

## One-time Supabase SQL

1. Run **`supabase-profiles-roles.sql`** (creates `office_manager_clients` + RLS on it).
2. Run **`supabase-auth-rls.sql`** (per-user data policies).
3. Run **`supabase-office-manager-rls.sql`** (lets office managers touch assigned users’ data and read/update their `profiles`).

Without step 3, the office manager dropdown can load, but Supabase will block reads on `leads`, `quotes`, etc.

## Assigning users in the Admin portal (Tradesman app, not Supabase)

There is no **“Admin → Users”** folder in the Supabase dashboard. Use your **local app** (or deployed site):

1. Home → **Admin Login** (sign in as a user whose `profiles.role` is `admin`).
2. In the dark admin sidebar, click **Users & office managers** (under **Portal builder**).
3. In the table, use the **Office manager** column for each **user** row: choose an office manager or admin. That writes to `office_manager_clients`.

Supabase only shows this as table **`office_manager_clients`** under **Table Editor** if you want to verify rows.

## Calendar: quote vs calendar tab (duration)

Scheduling from **Quotes** now uses the same rules as the calendar tab: **local** date/time parsing and, when you pick a **job type**, the duration defaults to that type’s **duration_minutes**.

## Roadmap (not built yet)

- **Team calendar**: combined week view with one column per assigned user + drag-and-drop (likely `@hello-pangea/dnd` or similar + `calendar_events` updates).  
- **Office manager “settings” depth**: today you can toggle **user portal tabs** per managed user; full admin-style builder parity can follow.
