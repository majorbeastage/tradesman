# How to set up the first admin (simple steps)

You need a **profiles** table and **one row** in it that says “this user is an admin.” Follow these steps in order.

---

## Step 1: Create the `profiles` table in Supabase

1. Open your **Supabase** project in the browser.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query**.
4. Open the file **`supabase-profiles-roles.sql`** from this project (in the `tradesman` folder). Select all its contents and copy them.
5. Paste into the Supabase SQL Editor.
6. Click **Run** (or press the run button).

You should see “Success.” That creates the **profiles** table and related security. You can leave the SQL Editor open; you’ll use it again in Step 4.

---

## Step 2: Create a normal user (that we’ll turn into the first admin)

You need one user account that will become the admin. Create it by signing up in your app:

1. Run your app (e.g. `npm run dev`) and open it in the browser.
2. On the **home page**, click **Login** (the main orange button).
3. At the bottom, click **Sign up**.
4. Enter the **email** and **password** you want for your first admin (e.g. your work email).
5. Click **Sign up** (or “Create account”).
6. If your project uses email confirmation, check your email and confirm. Then **sign in** with that email and password.

You now have a normal user in Supabase. Next we’ll mark that user as an admin in the **profiles** table.

---

## Step 3: Find that user’s ID in Supabase

1. In Supabase, go to **Authentication** in the left sidebar.
2. Click **Users**.
3. Find the user you just created (by email).
4. Click that row (or the user) so you can see their details.
5. Copy the **User UID** (a long UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).  
   You’ll paste this into the next step.

---

## Step 4: Make that user an admin in the database

1. Go back to **SQL Editor** in Supabase.
2. In a **new query** (or clear the previous one), paste this line:

```sql
INSERT INTO public.profiles (id, role) VALUES ('PASTE-THE-USER-UID-HERE', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

3. Replace **`PASTE-THE-USER-UID-HERE`** with the UUID you copied in Step 3 (keep the single quotes).
   - Example: `INSERT INTO public.profiles (id, role) VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'admin') ...`
4. Click **Run**.

You should see “Success.” That one row in **profiles** is what makes that user an admin.

---

## Step 5: Log in as admin in the app

1. In your app, go back to the **home page** (or sign out if you’re still signed in).
2. Click **Admin Login** (top-right, small link).
3. Sign in with the **same email and password** you used in Step 2.

You should land in the **Admin** area. That’s your first admin account. You can use the Admin portal to create more users (including more admins) from there.

---

## Quick recap

| Step | Where        | What you do |
|------|--------------|-------------|
| 1    | Supabase SQL | Run **supabase-profiles-roles.sql** to create the `profiles` table. |
| 2    | Your app     | Sign up once with the email/password you want for the first admin. |
| 3    | Supabase → Authentication → Users | Find that user and copy their **User UID**. |
| 4    | Supabase SQL | Run `INSERT INTO public.profiles (id, role) VALUES ('<uid>', 'admin') ...` with that UID. |
| 5    | Your app     | Use **Admin Login** and sign in with that email/password. |

If anything doesn’t match (e.g. no “User UID” or “profiles” table), say which step you’re on and what you see and we can fix it.
