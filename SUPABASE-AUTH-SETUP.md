# Supabase setup for login portal

So each user sees only their own data, do the following in the **Supabase Dashboard**.

## 1. Enable Email auth

1. Go to **Authentication** → **Providers**.
2. Ensure **Email** is enabled (default).
3. **Sign-up emails not arriving?** Choose one:
   - **Easiest:** Under **Email**, turn **off** “Confirm email”. Users can sign in right after sign-up with no email link. No SMTP needed.
   - **Use your own email:** Keep “Confirm email” on and set up **Custom SMTP** (see “Sign-up emails” below) so confirmation emails are sent from your provider.

## 2. Sign-up emails (when “Confirm email” is on)

Supabase’s built-in sender has strict limits and often doesn’t deliver to real inboxes. To get sign-up/confirmation emails reliably, use **Custom SMTP** (see Zoho section below) or turn off “Confirm email”.

### 2a. Zoho Mail + GoDaddy domain (Custom SMTP)

If your domain is on GoDaddy and you use **Zoho Mail** for that domain:

1. In Supabase: **Project Settings** (gear) → **Authentication** → scroll to **SMTP Settings**.
2. Enable **Custom SMTP** and use:

   | Field | Value |
   |-------|--------|
   | **Sender email** | One of your Zoho addresses (e.g. `noreply@yourdomain.com`) |
   | **Sender name** | e.g. `Tradesman` or your app name |
   | **Host** | `smtp.zoho.com` (or `smtppro.zoho.com` if you use Zoho for business/custom domain) |
   | **Port** | `465` (SSL) or `587` (TLS) |
   | **Username** | Your full Zoho email (same as sender email) |
   | **Password** | Your Zoho account password, or an [app-specific password](https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html) if you use 2FA |

3. Save. Supabase will send confirmation and password-reset emails through Zoho.

**If login “ends quickly” or sign-in fails:** With “Confirm email” on, users must click the link in the confirmation email before they can sign in. If they never got that email (before SMTP was set up), their account is still **unconfirmed**. Either:

- **Option A:** In Supabase go to **Authentication** → **Users**, open that user, and use **Confirm user** (or the three-dots menu) so they can sign in without the email link.
- **Option B:** Turn off “Confirm email” under **Authentication** → **Providers** → **Email** so new sign-ups can sign in immediately; then existing unconfirmed users can be confirmed manually once as above.

## 3. Redirect URLs (for production)

1. Go to **Authentication** → **URL Configuration**.
2. Add your app URLs to **Redirect URLs**, e.g.:
   - `http://localhost:5173` (local dev)
   - `https://yourdomain.com` (production)
   So after sign-in/sign-up, Supabase can redirect back to your app.

## 4. Run the auth RLS script

1. Go to **SQL Editor** → **New query**.
2. Paste the contents of **`supabase-auth-rls.sql`** and run it.

This creates Row Level Security policies so that:

- Only **authenticated** users can read/write data.
- Each user can only access rows where `user_id = auth.uid()` (their own user id from Supabase Auth).

## 5. Optional: stop using the dev user

The app no longer uses a hardcoded dev user when you’re logged in. If you previously had RLS policies that allowed the **anon** role for a fixed dev UUID (e.g. from `supabase-run-this.sql`), you can leave them for local testing without login, or remove them so that **only logged-in users** can access app data. The policies in `supabase-auth-rls.sql` apply to the **authenticated** role.

## 6. Support tickets (Web / Tech)

The **support_tickets** table is unchanged: it still allows **anon** to insert (so the public form works without login). Only the main app data (customers, leads, quotes, calendar, etc.) is restricted to authenticated users.
