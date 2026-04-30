
-- B-tree indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_voters_phone_number ON public.voters USING btree (phone_number);
CREATE INDEX IF NOT EXISTS idx_voters_city ON public.voters USING btree (city);
CREATE INDEX IF NOT EXISTS idx_voters_status ON public.voters USING btree (status);
CREATE INDEX IF NOT EXISTS idx_voters_engagement ON public.voters USING btree (engagement_score);
CREATE INDEX IF NOT EXISTS idx_voters_created_at ON public.voters USING btree (created_at DESC);

-- Full-text search: generated tsvector column + GIN index
ALTER TABLE public.voters
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(full_name, '') || ' ' ||
    coalesce(phone_number, '') || ' ' ||
    coalesce(city, '') || ' ' ||
    coalesce(interest_tag, '')
  )
) STORED;

CREATE INDEX IF NOT EXISTS idx_voters_fts ON public.voters USING gin (fts);

-- Indexes for chat_history and messages joins
CREATE INDEX IF NOT EXISTS idx_chat_history_voter_id ON public.chat_history USING btree (voter_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_voter_id ON public.messages USING btree (voter_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages USING btree (created_at DESC);
