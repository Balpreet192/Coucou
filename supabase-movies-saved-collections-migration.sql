-- Extend existing account-backed saved collections to support movies.
-- Run only after reviewing this migration in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.saved_collections
    DROP CONSTRAINT IF EXISTS saved_collections_collection_type_check;

ALTER TABLE public.saved_collections
    ADD CONSTRAINT saved_collections_collection_type_check
    CHECK (collection_type IN ('movies', 'books', 'music', 'art'));

COMMIT;
