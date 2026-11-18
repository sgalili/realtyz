CREATE TABLE public.broker_invitation_template_texts (
  gender text PRIMARY KEY CHECK (gender IN ('male','female')),
  body text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broker_invitation_template_texts TO service_role;
ALTER TABLE public.broker_invitation_template_texts ENABLE ROW LEVEL SECURITY;