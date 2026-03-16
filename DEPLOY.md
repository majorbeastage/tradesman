# Deploy & setup: Calendar app (tradesman)

Use this when **job types won’t add** or **deployed site doesn’t show calendar updates**.

---

## 1. Job types not saving

The app needs the `job_types` table and RLS policies in Supabase.

**Do this once (or again if you get “policy” / “permission” errors):**

1. Open **Supabase Dashboard** → your project → **SQL Editor** → **New query**.
2. Copy the **entire** contents of **`tradesman/supabase-job-types-setup.sql`** and paste into the editor.
3. Click **Run**.
4. Try **Add job type** again in the app.

If it still fails, open the browser **Developer Tools (F12)** → **Console** and look for `[Job type save failed]` when you click Add. The error message there (and in the alert) tells you what’s wrong.

---

## 2. Deployed site not showing calendar updates

The repo has two apps: **root** (different app) and **tradesman** (this one, with Calendar). Vercel must build **tradesman**, not the repo root.

**In Vercel:**

1. Open **Vercel Dashboard** → your project → **Settings** → **General**.
2. Find **Root Directory**.
3. Set it to: **`tradesman`** (no leading/trailing slash).
4. Save.
5. Go to **Deployments** → open **⋯** on the latest deployment → **Redeploy** (optionally enable **Clear build cache**).

After this, each deploy runs `npm install` and `npm run build` inside the `tradesman` folder, so the live site will include Calendar and job types.

**Check:** In the deployment **Build** log, the build should run from the `tradesman` directory, not the repo root.
