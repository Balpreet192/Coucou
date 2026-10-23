-- Additive migration for public profile IDs and authenticated follow features.
-- Review the live Supabase schema before running. The checked-in migrations
-- define profiles.id as auth.users.id and do not define a follows table.
--
-- This migration intentionally stops if public.follows already exists, so an
-- uninspected live table is never silently reused with unknown constraints.
-- It does not change profiles RLS policies or add/rename timestamp columns.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'public.profiles does not exist; verify the live schema before running this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class AS profile_table
        WHERE profile_table.oid = 'public.profiles'::regclass
          AND profile_table.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Row level security is not enabled on public.profiles; inspect the live policy setup before running this migration.';
    END IF;

    IF to_regclass('public.follows') IS NOT NULL THEN
        RAISE EXCEPTION 'public.follows already exists. Inspect its columns, constraints, RLS, and policies before adapting this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'id'
          AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'Expected public.profiles.id to be UUID; verify its relationship to auth.users.id before running this migration.';
    END IF;

    IF EXISTS (
        SELECT required.column_name
        FROM (VALUES ('username'), ('username_normalized'), ('bio')) AS required(column_name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM information_schema.columns AS present
            WHERE present.table_schema = 'public'
              AND present.table_name = 'profiles'
              AND present.column_name = required.column_name
        )
    ) THEN
        RAISE EXCEPTION 'Expected username, username_normalized, and bio columns on public.profiles; verify the live schema before running this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS profile_fk
        WHERE profile_fk.conrelid = 'public.profiles'::regclass
          AND profile_fk.confrelid = 'auth.users'::regclass
          AND profile_fk.contype = 'f'
          AND profile_fk.conkey = ARRAY[
              (
                  SELECT attribute.attnum
                  FROM pg_attribute AS attribute
                  WHERE attribute.attrelid = 'public.profiles'::regclass
                    AND attribute.attname = 'id'
                    AND NOT attribute.attisdropped
              )
          ]::smallint[]
    ) THEN
        RAISE EXCEPTION 'Expected public.profiles.id to reference auth.users.id; verify the live foreign key before running this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'public_id'
          AND data_type <> 'text'
    ) THEN
        RAISE EXCEPTION 'public.profiles.public_id already exists with a non-text type; inspect it before running this migration.';
    END IF;
END;
$$;

-- public_id is a randomly generated public identifier and is deliberately
-- separate from the auth.users UUID. Existing profiles receive an ID once.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS public_id text;

ALTER TABLE public.profiles
    ALTER COLUMN public_id
    SET DEFAULT ('u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

UPDATE public.profiles
SET public_id = 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE public_id IS NULL;

ALTER TABLE public.profiles
    ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_unique_idx
    ON public.profiles (public_id);

-- Trigram search supports case-insensitive substring matches without scanning
-- every profile row. Locate the operator class in whichever schema Supabase
-- installed pg_trgm into.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE
    trigram_schema text;
BEGIN
    SELECT namespace.nspname
    INTO trigram_schema
    FROM pg_opclass AS operator_class
    JOIN pg_namespace AS namespace
      ON namespace.oid = operator_class.opcnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = operator_class.opcmethod
    WHERE operator_class.opcname = 'gin_trgm_ops'
      AND access_method.amname = 'gin'
    LIMIT 1;

    IF trigram_schema IS NULL THEN
        RAISE EXCEPTION 'pg_trgm gin_trgm_ops is unavailable; enable the pg_trgm extension and rerun after review.';
    END IF;

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS profiles_username_normalized_trgm_idx ON public.profiles USING gin (username_normalized %I.gin_trgm_ops)',
        trigram_schema
    );
END;
$$;

CREATE TABLE public.follows (
    follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT follows_follower_following_unique UNIQUE (follower_id, following_id),
    CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX follows_following_id_idx ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read follow relationships involving themselves"
    ON public.follows
    FOR SELECT
    TO authenticated
    USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "Users can create their own follow relationships"
    ON public.follows
    FOR INSERT
    TO authenticated
    WITH CHECK (follower_id = auth.uid() AND follower_id <> following_id);

CREATE POLICY "Users can remove their own follow relationships"
    ON public.follows
    FOR DELETE
    TO authenticated
    USING (follower_id = auth.uid());

REVOKE ALL ON TABLE public.follows FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.follows TO authenticated;

-- Search exposes only fields intended for public display and excludes the
-- caller's own profile. The auth UUID is used only inside the database.
CREATE FUNCTION public.search_public_profiles(p_query text)
RETURNS TABLE (
    public_id text,
    username text,
    bio text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    WITH input AS (
        SELECT
            lower(btrim(COALESCE(p_query, ''))) AS term,
            replace(
                replace(
                    replace(lower(btrim(COALESCE(p_query, ''))), E'\\', E'\\\\'),
                    '%',
                    E'\\%'
                ),
                '_',
                E'\\_'
            ) AS escaped_term
    )
    SELECT profile.public_id, profile.username, profile.bio
    FROM public.profiles AS profile
    CROSS JOIN input
    WHERE auth.uid() IS NOT NULL
      AND char_length(input.term) >= 2
      AND profile.id <> auth.uid()
      AND (
          profile.username_normalized ILIKE '%' || input.escaped_term || '%' ESCAPE E'\\'
          OR (
              profile.public_id = input.term
              AND input.term ~ '^u_[0-9a-f]{16}$'
          )
      )
    ORDER BY
        CASE WHEN profile.public_id = input.term THEN 0 ELSE 1 END,
        profile.username_normalized
    LIMIT 12;
$function$;

-- Return only public IDs, counts, and the caller's follow state; auth UUIDs
-- stay inside the database. Only authenticated clients may execute this RPC.
CREATE FUNCTION public.get_public_user_social_state(p_public_ids text[])
RETURNS TABLE (
    public_id text,
    followers_count bigint,
    following_count bigint,
    is_following boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    WITH requested_profiles AS (
        SELECT profile.id, profile.public_id
        FROM public.profiles AS profile
        WHERE profile.public_id = ANY(COALESCE(p_public_ids, ARRAY[]::text[]))
    ),
    follower_counts AS (
        SELECT relation.following_id AS profile_id, count(*) AS total
        FROM public.follows AS relation
        JOIN requested_profiles AS requested
          ON requested.id = relation.following_id
        GROUP BY relation.following_id
    ),
    following_counts AS (
        SELECT relation.follower_id AS profile_id, count(*) AS total
        FROM public.follows AS relation
        JOIN requested_profiles AS requested
          ON requested.id = relation.follower_id
        GROUP BY relation.follower_id
    )
    SELECT
        requested.public_id,
        COALESCE(follower_counts.total, 0)::bigint,
        COALESCE(following_counts.total, 0)::bigint,
        EXISTS (
            SELECT 1
            FROM public.follows AS relation
            WHERE relation.follower_id = auth.uid()
              AND relation.following_id = requested.id
        )
    FROM requested_profiles AS requested
    LEFT JOIN follower_counts
      ON follower_counts.profile_id = requested.id
    LEFT JOIN following_counts
      ON following_counts.profile_id = requested.id;
$function$;

CREATE FUNCTION public.follow_user_by_public_id(p_public_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    target_id uuid;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to follow users.';
    END IF;

    SELECT profile.id
    INTO target_id
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id));

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'The requested public profile was not found.';
    END IF;

    IF target_id = caller_id THEN
        RAISE EXCEPTION 'You cannot follow your own account.';
    END IF;

    INSERT INTO public.follows (follower_id, following_id)
    VALUES (caller_id, target_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;
END;
$function$;

CREATE FUNCTION public.unfollow_user_by_public_id(p_public_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    target_id uuid;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to unfollow users.';
    END IF;

    SELECT profile.id
    INTO target_id
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id));

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'The requested public profile was not found.';
    END IF;

    DELETE FROM public.follows
    WHERE follower_id = caller_id
      AND following_id = target_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_user_social_state(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_public_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.follow_user_by_public_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfollow_user_by_public_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_user_social_state(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follow_user_by_public_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user_by_public_id(text) TO authenticated;

-- The checked-in profile schema and script use updated_at. This migration
-- deliberately does not add a second timestamp column or alter profile saves.
COMMIT;
