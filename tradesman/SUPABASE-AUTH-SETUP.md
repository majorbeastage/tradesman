# Supabase setup for login portal

So each user sees only their own data, do the following in the **Supabase Dashboard**.

## 1. Enable Email auth

1. Go to **Authentication** → **Providers**.
2. Ensure **Email** is enabled (default).
3. Optional: under **Email**, turn on "Confirm email" if you want users to verify their address before signing in. If you leave it off, users can sign in immediately after sign-up.

## 2. Redirect URLs (for production)

1. Go to **Authentication** → **URL Configuration**.
2. Add your app URLs to **Redirect URLs**, e.g.:
   - `http://localhost:5173` (local dev)
   - `https://yourdomain.com` (production)
   So after sign-in/sign-up, Supabase can redirect back to your app.

## 3. Run the auth RLS script

1. Go to **SQL Editor** → **New query**.
2. Paste the contents of **`supabase-auth-rls.sql`** and run it.

This creates Row Level Security policies so that:

- Only **authenticated** users can read/write data.
- Each user can only access rows where `user_id = auth.uid()` (their own user id from Supabase Auth).

## 4. Optional: stop using the dev user

The app no longer uses a hardcoded dev user when you’re logged in. If you previously had RLS policies that allowed the **anon** role for a fixed dev UUID (e.g. from `supabase-run-this.sql`), you can leave them for local testing without login, or remove them so that **only logged-in users** can access app data. The policies in `supabase-auth-rls.sql` apply to the **authenticated** role.

## 5. Support tickets (Web / Tech)

The **support_tickets** table is unchanged: it still allows **anon** to insert (so the public form works without login). Only the main app data (customers, leads, quotes, calendar, etc.) is restricted to authenticated users.
