# Tradesman Website Admin (separate Vercel project)

Standalone website editor opened from **Growth → Open website editor** in the main Tradesman app.

## Auth

Uses one-time SSO handoff (`/api/website-admin-handoff` on the main Tradesman deploy):

1. Main app issues `wh_…` code (60s TTL)
2. Admin app redeems code → Supabase magic link → session
3. **No separate website username/password**

## Env (Vercel project for this app)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PUBLIC_APP_ORIGIN=https://www.tradesman-us.com
```

## Main app env (Growth tab links)

```
VITE_HOSTED_WEBSITE_ADMIN_ORIGIN=https://your-website-admin.vercel.app
VITE_HOSTED_WEBSITE_SITES_ORIGIN=https://your-customer-sites.vercel.app
```

## Local dev

```bash
cd website-admin-app
npm install
npm run dev
```

Runs on http://localhost:5181 — handoff API is proxied to `VITE_PUBLIC_APP_ORIGIN` (defaults to production).

## Supabase

Run once on the main project:

```bash
npm run supabase:sql:website-admin-handoff
```

## Deploy

Create a **second Vercel project** pointing at `website-admin-app/` (root directory setting) or deploy as a monorepo subfolder.

Customer **public sites** deploy to a third Vercel project (`VITE_HOSTED_WEBSITE_SITES_ORIGIN`) — templates TBD.
