-- ============================================================================
-- TEAM COLLABORATION ARCHITECTURE
-- ============================================================================
-- Step 1: Extend app_role enum with team roles. Enum ADD VALUE must be
-- committed before the new values can be used in subsequent statements, so
-- we run only the enum change here. Helper functions reference the new
-- values via cast at call time, which is allowed.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'assistant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'junior_agent';