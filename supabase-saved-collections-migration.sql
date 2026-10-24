-- Additive migration for account-backed books, music, and art collections.
-- Existing browser localStorage items are not read, copied, or deleted.
--
-- Run only after reviewing this migration in Supabase SQL Editor. It creates
-- one new table and policies for authenticated users to access only their own
-- saved rows. It does not modify profiles, posts, comments, or other policies.
--
-- The table uses item_id text for Open Library work keys, MusicBrainz UUIDs,
-- and Wikipedia titles; item_data stores the existing public item snapshot.
-- The unique key also prevents duplicate saves for the same user/category.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.saved_collections') IS NOT NULL THEN
        RAISE EXCEPTION 'public.saved_collections already exists. Inspect its columns, constraints, grants, RLS, and policies before adapting this migration.';
    END IF;
END;
$$;

CREATE TABLE public.saved_collections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection_type text NOT NULL
        CHECK (collection_type IN ('books', 'music', 'art')),
    item_id text NOT NULL CHECK (char_length(item_id) > 0),
    item_data jsonb NOT NULL
        CHECK (jsonb_typeof(item_data) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT saved_collections_user_type_item_unique
        UNIQUE (user_id, collection_type, item_id)
);

ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own saved collections"
    ON public.saved_collections
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can save items to their own collections"
    ON public.saved_collections
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove items from their own collections"
    ON public.saved_collections
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.saved_collections FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.saved_collections TO authenticated;

COMMIT;
