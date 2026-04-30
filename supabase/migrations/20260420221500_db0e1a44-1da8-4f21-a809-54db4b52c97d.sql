ALTER TABLE public.onboarding_state
ADD COLUMN IF NOT EXISTS hot_conversion_rate numeric NOT NULL DEFAULT 40,
ADD COLUMN IF NOT EXISTS cold_conversion_rate numeric NOT NULL DEFAULT 10;

ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS hot_conversion_rate numeric NOT NULL DEFAULT 40,
ADD COLUMN IF NOT EXISTS cold_conversion_rate numeric NOT NULL DEFAULT 10;