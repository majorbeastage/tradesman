# Emergency: login timeout / Supabase connection lost

## Confirmed symptom

`GET https://<project>.supabase.co/auth/v1/health` times out.  
When Auth is down, **no app code can log you in**. Vercel will show ~90%+ API failures.

## Recover the project (do this first)

1. Open https://supabase.com/dashboard → project **Tradesman** (`othemzceycphhuwojxge`)
2. If you see **Project paused** → **Restore project** and wait until green
3. **Project Settings** (gear) → **General** → scroll to **Restart project** / **Pause project**  
   - Prefer **Restart** if available  
   - Or **Pause** → wait 60s → **Restore**
4. Wait 2–3 minutes
5. Open **SQL Editor**. If it loads, run `supabase/RUN-NOW-fix-profiles-rls-login.sql`
6. Optional (if SQL Editor works) — free stuck connections:

```sql
SELECT pid, usename, state, left(query, 80) AS query, now() - query_start AS age
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start ASC NULLS LAST
LIMIT 40;

-- Only if you see many idle/stuck app connections (review first):
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE datname = current_database()
--   AND pid <> pg_backend_pid()
--   AND state = 'idle'
--   AND now() - state_change > interval '10 minutes';
```

7. Retry login in an **incognito** window: `/#/login` or `/admin`

## What to paste back if still broken

1. Screenshot of Supabase project home (paused / healthy / restarting)
2. Whether **SQL Editor** opens or hangs
3. One Vercel failed log: path + error text
4. Result of opening in browser:  
   `https://othemzceycphhuwojxge.supabase.co/auth/v1/health`  
   (should not spin forever)
