-- Run this in Supabase Dashboard → SQL Editor after reviewing it.
-- This is an additive migration: it creates public.profiles and does not
-- delete or replace existing posts, comments, users, or local data.

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text,
    username_normalized text GENERATED ALWAYS AS (lower(btrim(username))) STORED,
    bio text,
    age_confirmed boolean NOT NULL DEFAULT false,
    guidelines_accepted boolean NOT NULL DEFAULT false,
    privacy_accepted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_username_format_check
        CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,30}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_unique_idx
    ON public.profiles (username_normalized)
    WHERE username_normalized IS NOT NULL AND username_normalized <> '';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are readable by everyone" ON public.profiles;
CREATE POLICY "Profiles are readable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    calling_user_id uuid := auth.uid();
BEGIN
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.profiles WHERE id = calling_user_id;
    DELETE FROM auth.users WHERE id = calling_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
