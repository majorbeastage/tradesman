-- Add Clover to payment provider enums (existing deployments).
-- Run: npm run supabase:sql:payment-requests-add-clover

alter table public.payment_provider_credentials
  drop constraint if exists payment_provider_credentials_provider_check;

alter table public.payment_provider_credentials
  add constraint payment_provider_credentials_provider_check
  check (provider in ('helcim', 'square', 'clover', 'manual'));

alter table public.payment_requests
  drop constraint if exists payment_requests_provider_check;

alter table public.payment_requests
  add constraint payment_requests_provider_check
  check (provider in ('helcim', 'square', 'clover', 'manual'));
