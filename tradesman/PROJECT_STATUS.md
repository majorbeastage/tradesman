# Tradesman CRM – What’s Saved

This file is a quick reference so you know everything is saved in git and how to push it.

## What’s in this repo (all tracked in git)

- **App** – `src/App.tsx` (Supabase connection check, routing)
- **Layout** – `src/layout/AppLayout.tsx`, `src/components/Sidebar.tsx` (logo glow, MyT account at bottom-left)
- **Pages** – Leads, Conversations, Quotes, Customers, Web Support, Tech Support
- **Features** – Customer notes panel, Add Conversation, Add Customer to Quotes, quote line items, Send to Quotes from Conversations, Conversations/Quotes settings and auto-response options
- **Supabase** – `supabase-rls-dev.sql`, `supabase-quotes-table.sql`
- **Assets** – `src/assets/logo.png`, `src/assets/MyT.png`
- **Config** – `vite.config.ts`, `tsconfig.*`, `package.json`, `.env.example`

## Current git state

- All of the above is **committed** (latest: "Fix TypeScript build and latest changes").
- The only untracked item is `tradesman/tradesman-crm/` (nested folder); it’s in `.gitignore` so it won’t be committed unless you want it.

## How to push to GitHub

From PowerShell (in the repo root):

```powershell
cd c:\Users\snyde\tradesman-systems
git add -A
git status
git commit -m "Your message"   # only if something is new
git push origin main
```

If `git push` asks for credentials, use GitHub CLI (`gh auth login`) or a Personal Access Token.

## Where the app lives on disk

- Repo root: `c:\Users\snyde\tradesman-systems`
- App code: `c:\Users\snyde\tradesman-systems\tradesman\`
- Run dev: `cd tradesman` then `npm run dev`
