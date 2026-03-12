# Admin portal: profiles created only through Admin

All user profiles are created from the **Admin portal** (no public sign-up). You do **not** need new tables; the existing **`profiles`** and **`office_manager_clients`** tables are enough.

## 1. First admin (one-time)

You need one admin to log in and create everyone else:

1. **Option A – Supabase Dashboard**  
   - **Authentication** → **Users** → **Invite user** (or **Add user**).  
   - Create a user with the email you want for the first admin.  
   - In **SQL Editor** run (use the new user’s id from Authentication → Users):

   ```sql
   INSERT INTO public.profiles (id, role) VALUES ('<that-user-uuid>', 'admin')
   ON CONFLICT (id) DO UPDATE SET role = 'admin';
   ```

2. **Option B – Self-signup then promote**  
   - Temporarily keep sign-up enabled.  
   - Sign up once with the admin email.  
   - Run the same `INSERT` / `ON CONFLICT` SQL above with that user’s id.  
   - Then disable sign-up (see below) so only admins can create users.

After that, log in to the app with that email, use **Admin Login** on the home page, and you’ll land in the Admin portal.

## 2. Create users (including admins) from Admin portal

- In **Admin** → **Users** you can:
  - **Add user**: email, password, role (**User**, **Office Manager**, or **Admin**).  
  - **List users**: all users and their role (loaded via the Edge Function).

This uses the **Edge Function** `admin-users`, which calls Supabase’s Auth Admin API (service role) to create the user and then upsert **`profiles`** with the chosen role.

## 3. Deploy the Edge Function

The Admin **Users** page calls `https://<your-project>.supabase.co/functions/v1/admin-users`. You must deploy the function once:

1. Install Supabase CLI and log in (see [Supabase Functions](https://supabase.com/docs/guides/functions)).
2. From the **tradesman** folder (where `supabase/functions/admin-users` lives):

   ```bash
   supabase functions deploy admin-users
   ```

3. The function uses **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY**; these are set automatically in the Supabase project for Edge Functions. No extra env needed.

4. Optional: restrict who can call the function (e.g. only your app origin) via **Supabase** → **Edge Functions** → **admin-users** → settings.

## 4. Disable public sign-up (recommended)

So that only admins create users:

1. **Supabase Dashboard** → **Authentication** → **Providers** → **Email**.  
2. Turn **off** “Enable sign up” (or equivalent).  
3. Leave “Confirm email” on or off as you prefer.

Then only users created via the Admin portal (or via Dashboard invite + SQL profile) can log in.

## 5. Tables involved (no new ones)

- **`public.profiles`** – one row per user: `id` (auth user id), `role` (`user` | `office_manager` | `admin`), `display_name`, timestamps.  
- **`public.office_manager_clients`** – which users each office manager manages (for future Office Manager features).

The Edge Function creates the user in **auth.users** (Supabase Auth) and then inserts/updates **`profiles`** with the chosen role. No extra tables are required for “all profiles created through admin” or for adding Admin profiles.
