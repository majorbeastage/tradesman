-- Public business web profile slug (derived from display_name; not user-editable in UI).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_web_profile_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_business_web_profile_slug_unique
  ON public.profiles (lower(trim(business_web_profile_slug)))
  WHERE business_web_profile_slug IS NOT NULL AND trim(business_web_profile_slug) <> '';

COMMENT ON COLUMN public.profiles.business_web_profile_slug IS
  'Lowercase URL slug for public business profile at tradesman-us.com/{slug}. Set when web profile is enabled.';
