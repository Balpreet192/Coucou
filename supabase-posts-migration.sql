-- Run this in the Supabase SQL Editor only after reviewing it.
-- This migration creates a new posts table and does not change Coucou's current
-- localStorage-based post, like, or comment behavior.

DO $$
BEGIN
    IF to_regclass('public.posts') IS NOT NULL THEN
        RAISE EXCEPTION 'public.posts already exists; this migration made no changes.';
    END IF;
END
$$;

CREATE TABLE public.posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_post_id text UNIQUE,
    text text NOT NULL CHECK (char_length(btrim(text)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX posts_author_id_idx ON public.posts (author_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are readable by everyone"
    ON public.posts
    FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create their own posts"
    ON public.posts
    FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own posts"
    ON public.posts
    FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());
