CREATE TABLE public.broker_import_agency_registry (
  agency_key text NOT NULL,
  criteria_key text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('checked','disqualified')),
  reason text NOT NULL,
  listing_count integer CHECK (listing_count >= 0),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_key, criteria_key)
);
GRANT ALL ON public.broker_import_agency_registry TO service_role;
ALTER TABLE public.broker_import_agency_registry ENABLE ROW LEVEL SECURITY;
CREATE INDEX broker_import_agency_registry_checked_idx ON public.broker_import_agency_registry(checked_at);
COMMENT ON TABLE public.broker_import_agency_registry IS 'Service-only completed agency checks; seven-day non-sliding suppression per canonical agency and configured volume criteria. Failures never qualify.';