# Meta API setup

Tradesman’s Meta connector is available under **Admin → Ads & campaigns → Meta API — Facebook & Instagram**.

## Vercel server secrets

Add these to Production (and Preview if used), then redeploy:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_SYSTEM_USER_TOKEN`
- `META_BUSINESS_ID` — numeric Business Portfolio ID from Business settings
- `META_GRAPH_API_VERSION` — optional; defaults to `v25.0`

Never use `VITE_` prefixes for these values. They are server secrets.

The System User token needs the applicable scopes and assigned assets:

- Asset discovery: `business_management`
- Ads read/sync: `ads_read` (or `ads_management`)
- Campaign creation/management: `ads_management`
- Facebook publishing: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- Instagram publishing: `instagram_basic`, `instagram_content_publish`

Meta may require Business Verification, Advanced Access/App Review, Page Publishing Authorization, and two-factor authentication before production calls work for client assets.

## Supabase media bucket

Run `supabase/meta-social-media-storage.sql` once in the Supabase SQL editor (storage policy ownership may block CLI apply). It creates a public image bucket because Meta must download the supplied `image_url` without authentication. Only Tradesman admins can upload, update, or delete objects. Until that SQL is applied, Admin can fall back to the existing public `about-us-images` bucket for temporary Meta media uploads.

## Safe operating sequence

1. Test the connection and load assets.
2. Select a client and map their Meta ad account and Facebook Page. A linked Instagram professional account is detected from the Page.
3. Sync campaigns and Ads Insights. Imported Meta spend updates the local campaign record.
4. Publish organic Page/Instagram content from the mapped assets.
5. Create Meta campaigns only from a local campaign that the client approved. New Meta campaigns, ad sets, and ads are always created **PAUSED**.
6. Review creative, targeting, dates, budget, destination, disclosures, and Meta’s policy preview before selecting **Activate**.

Campaign creation rejects a media budget above the client-approved amount. Special Ad Categories must be selected when applicable; Meta applies additional targeting restrictions.
