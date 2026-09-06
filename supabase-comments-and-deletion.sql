-- ============================================================
-- COUCOU SUPABASE DATABASE MIGRATION: COMMENTS & ACCOUNT DELETION
-- ============================================================
-- Instructions: Run this script in your Supabase Dashboard -> SQL Editor
-- This SQL script sets up the `comments` table with RLS policies, updates
-- `posts` policies, and creates a secure PostgreSQL function for account deletion.

-- ------------------------------------------------------------
-- 1. Ensure `posts` table has Row Level Security (RLS) enabled
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts are readable by everyone" ON public.posts;
CREATE POLICY "Posts are readable by everyone"
    ON public.posts FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can create their own posts" ON public.posts;
CREATE POLICY "Authenticated users can create their own posts"
    ON public.posts FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
CREATE POLICY "Users can delete their own posts"
    ON public.posts FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Create `comments` table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_comment_id text UNIQUE,
    text text NOT NULL CHECK (char_length(btrim(text)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Row Level Security (RLS) Policies for `comments`
-- ------------------------------------------------------------
-- SELECT: Everyone can read comments
DROP POLICY IF EXISTS "Comments are readable by everyone" ON public.comments;
CREATE POLICY "Comments are readable by everyone"
    ON public.comments FOR SELECT
    USING (true);

-- INSERT: Authenticated users can insert their own comments
DROP POLICY IF EXISTS "Authenticated users can create their own comments" ON public.comments;
CREATE POLICY "Authenticated users can create their own comments"
    ON public.comments FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

-- DELETE: Comment author OR Post owner can delete comments
DROP POLICY IF EXISTS "Users can delete their own comments or comments on their posts" ON public.comments;
CREATE POLICY "Users can delete their own comments or comments on their posts"
    ON public.comments FOR DELETE
    TO authenticated
    USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.posts
            WHERE posts.id = comments.post_id
              AND posts.author_id = auth.uid()
        )
    );

-- ------------------------------------------------------------
-- 4. Secure Account Deletion Function
-- ------------------------------------------------------------
-- Allows authenticated users to safely delete their own account and all
-- associated user data via Supabase RPC `supabase.rpc('delete_user_account')`.
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

    -- Deleting the user from auth.users automatically cascades to
    -- public.posts and public.comments via foreign key constraints.
    DELETE FROM auth.users WHERE id = calling_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
