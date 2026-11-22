-- Additive profile privacy, follow-request, profile-photo, and photo-post
-- migration. Review before running in Supabase SQL Editor.
--
-- This targets the live Coucou shape: profiles.id/username/bio, posts.id/
-- author_id/text/created_at, and comments.post_id/author_id. It preserves
-- existing rows and does not migrate browser-local data.
--
-- Keep this migration separate from application code deployment. Apply it
-- before enabling the new privacy, profile-photo, and photo-post controls.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL OR
       to_regclass('public.posts') IS NULL OR
       to_regclass('public.comments') IS NULL THEN
        RAISE EXCEPTION 'Expected public.profiles, public.posts, and public.comments. Inspect the live schema before applying this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'username'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'bio'
    ) THEN
        RAISE EXCEPTION 'Expected public.profiles.id, username, and bio. Inspect the live schema before applying this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'author_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'text'
    ) THEN
        RAISE EXCEPTION 'Expected public.posts.id, author_id, and text. Inspect the live schema before applying this migration.';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'public_id'
          AND data_type <> 'text'
    ) THEN
        RAISE EXCEPTION 'public.profiles.public_id exists with a non-text type. Inspect the live schema before applying this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM storage.buckets AS bucket
        WHERE id = 'coucou-media'
          AND bucket.public IS TRUE
    ) THEN
        RAISE EXCEPTION 'The coucou-media bucket already exists as public. Make it private and inspect its policies before applying this migration.';
    END IF;
END;
$$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS public_id text,
    ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS avatar_path text;

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

CREATE TABLE IF NOT EXISTS public.follows (
    follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT follows_follower_following_unique UNIQUE (follower_id, following_id),
    CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx
    ON public.follows (following_id);

CREATE TABLE IF NOT EXISTS public.follow_requests (
    requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT follow_requests_requester_requested_unique
        UNIQUE (requester_id, requested_id),
    CONSTRAINT follow_requests_no_self_request
        CHECK (requester_id <> requested_id)
);

CREATE INDEX IF NOT EXISTS follow_requests_requested_id_idx
    ON public.follow_requests (requested_id, created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.coucou_can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = p_profile_id
          AND (
              NOT profile.is_private
              OR profile.id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.follows AS relation
                  WHERE relation.follower_id = auth.uid()
                    AND relation.following_id = profile.id
              )
          )
    );
$function$;

CREATE OR REPLACE FUNCTION public.coucou_profile_is_public(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = p_profile_id AND NOT profile.is_private
    );
$function$;

CREATE OR REPLACE FUNCTION public.coucou_profile_is_private(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = p_profile_id AND profile.is_private
    );
$function$;

GRANT EXECUTE ON FUNCTION public.coucou_can_view_profile(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coucou_profile_is_public(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coucou_profile_is_private(uuid) TO authenticated;

-- Restrictive policies narrow the existing broad SELECT policies without
-- removing or replacing user-created policies.
CREATE POLICY "Coucou profile visibility"
    ON public.profiles AS RESTRICTIVE
    FOR SELECT TO anon, authenticated
    USING (public.coucou_can_view_profile(id));

CREATE POLICY "Coucou post visibility"
    ON public.posts AS RESTRICTIVE
    FOR SELECT TO anon, authenticated
    USING (public.coucou_can_view_profile(author_id));

CREATE POLICY "Coucou comment visibility"
    ON public.comments AS RESTRICTIVE
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts AS post
            WHERE post.id = comments.post_id
              AND public.coucou_can_view_profile(post.author_id)
        )
    );

CREATE POLICY "Coucou own profile updates"
    ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Coucou profile media path ownership"
    ON public.profiles AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND (
            avatar_path IS NULL
            OR avatar_path LIKE auth.uid()::text || '/avatars/%'
        )
    );

CREATE POLICY "Coucou follow requests are visible to participants"
    ON public.follow_requests
    FOR SELECT TO authenticated
    USING (requester_id = auth.uid() OR requested_id = auth.uid());

CREATE POLICY "Coucou follow requests are sent by the caller"
    ON public.follow_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        requester_id = auth.uid()
        AND public.coucou_profile_is_private(requested_id)
    );

CREATE POLICY "Coucou follow requests can be resolved by participants"
    ON public.follow_requests
    FOR DELETE TO authenticated
    USING (requester_id = auth.uid() OR requested_id = auth.uid());

CREATE POLICY "Coucou direct follows only target public profiles"
    ON public.follows AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (
        follower_id = auth.uid()
        AND public.coucou_profile_is_public(following_id)
    );

CREATE OR REPLACE FUNCTION public.search_coucou_profiles(p_query text)
RETURNS TABLE (
    public_id text,
    username text,
    bio text,
    avatar_path text,
    is_private boolean,
    can_view boolean
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
                    '%', E'\\%'
                ),
                '_', E'\\_'
            ) AS escaped_term
    )
    SELECT
        profile.public_id,
        profile.username,
        CASE WHEN public.coucou_can_view_profile(profile.id) THEN profile.bio ELSE NULL END,
        CASE WHEN public.coucou_can_view_profile(profile.id) THEN profile.avatar_path ELSE NULL END,
        profile.is_private,
        public.coucou_can_view_profile(profile.id)
    FROM public.profiles AS profile
    CROSS JOIN input
    WHERE auth.uid() IS NOT NULL
      AND char_length(input.term) >= 2
      AND profile.id <> auth.uid()
      AND (
          lower(btrim(COALESCE(profile.username, ''))) ILIKE '%' || input.escaped_term || '%' ESCAPE E'\\'
          OR (
              profile.public_id = input.term
              AND input.term ~ '^u_[0-9a-f]{16}$'
          )
      )
    ORDER BY
        CASE WHEN profile.public_id = input.term THEN 0 ELSE 1 END,
        lower(btrim(COALESCE(profile.username, '')))
    LIMIT 12;
$function$;

-- Keep the prior RPC safe for already-deployed clients that have not yet
-- switched to search_coucou_profiles.
CREATE OR REPLACE FUNCTION public.search_public_profiles(p_query text)
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
    SELECT
        profile.public_id,
        profile.username,
        CASE WHEN public.coucou_can_view_profile(profile.id) THEN profile.bio ELSE NULL END
    FROM public.profiles AS profile
    WHERE auth.uid() IS NOT NULL
      AND profile.id <> auth.uid()
      AND (
          lower(btrim(COALESCE(profile.username, ''))) ILIKE '%' || lower(btrim(COALESCE(p_query, ''))) || '%'
          OR profile.public_id = lower(btrim(COALESCE(p_query, '')))
      )
    ORDER BY profile.username
    LIMIT 12;
$function$;

CREATE OR REPLACE FUNCTION public.list_coucou_profiles()
RETURNS TABLE (
    public_id text,
    username text,
    bio text,
    avatar_path text,
    is_private boolean,
    can_view boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    SELECT
        profile.public_id,
        profile.username,
        profile.bio,
        profile.avatar_path,
        profile.is_private,
        true
    FROM public.profiles AS profile
    WHERE auth.uid() IS NOT NULL
      AND profile.id <> auth.uid()
      AND NOT profile.is_private
      AND profile.username IS NOT NULL
    ORDER BY profile.created_at DESC NULLS LAST, profile.username
    LIMIT 100;
$function$;

CREATE OR REPLACE FUNCTION public.get_coucou_social_state(p_public_ids text[])
RETURNS TABLE (
    public_id text,
    followers_count bigint,
    following_count bigint,
    is_following boolean,
    has_pending_request boolean,
    has_received_request boolean
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
    )
    SELECT
        requested.public_id,
        (
            SELECT count(*)
            FROM public.follows AS relation
            WHERE relation.following_id = requested.id
        ),
        (
            SELECT count(*)
            FROM public.follows AS relation
            WHERE relation.follower_id = requested.id
        ),
        EXISTS (
            SELECT 1
            FROM public.follows AS relation
            WHERE relation.follower_id = auth.uid()
              AND relation.following_id = requested.id
        ),
        EXISTS (
            SELECT 1
            FROM public.follow_requests AS request
            WHERE request.requester_id = auth.uid()
              AND request.requested_id = requested.id
        ),
        EXISTS (
            SELECT 1
            FROM public.follow_requests AS request
            WHERE request.requester_id = requested.id
              AND request.requested_id = auth.uid()
        )
    FROM requested_profiles AS requested;
$function$;

CREATE OR REPLACE FUNCTION public.get_coucou_profile(p_public_id text)
RETURNS TABLE (
    public_id text,
    username text,
    bio text,
    avatar_path text,
    is_private boolean,
    can_view boolean,
    followers_count bigint,
    following_count bigint,
    is_following boolean,
    has_pending_request boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    SELECT
        profile.public_id,
        profile.username,
        CASE WHEN public.coucou_can_view_profile(profile.id) THEN profile.bio ELSE NULL END,
        CASE WHEN public.coucou_can_view_profile(profile.id) THEN profile.avatar_path ELSE NULL END,
        profile.is_private,
        public.coucou_can_view_profile(profile.id),
        (SELECT count(*) FROM public.follows relation WHERE relation.following_id = profile.id),
        (SELECT count(*) FROM public.follows relation WHERE relation.follower_id = profile.id),
        EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = auth.uid()
              AND relation.following_id = profile.id
        ),
        EXISTS (
            SELECT 1 FROM public.follow_requests request
            WHERE request.requester_id = auth.uid()
              AND request.requested_id = profile.id
        )
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id))
      AND auth.uid() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.request_follow_by_public_id(p_public_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    target_id uuid;
    target_is_private boolean;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to follow users.';
    END IF;

    SELECT profile.id, profile.is_private
    INTO target_id, target_is_private
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id));

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'The requested profile was not found.';
    END IF;
    IF target_id = caller_id THEN
        RAISE EXCEPTION 'You cannot follow your own account.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = caller_id AND following_id = target_id
    ) THEN
        RETURN;
    END IF;

    IF target_is_private THEN
        INSERT INTO public.follow_requests (requester_id, requested_id)
        VALUES (caller_id, target_id)
        ON CONFLICT (requester_id, requested_id) DO NOTHING;
    ELSE
        DELETE FROM public.follow_requests
        WHERE requester_id = caller_id AND requested_id = target_id;
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (caller_id, target_id)
        ON CONFLICT (follower_id, following_id) DO NOTHING;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_follow_request(p_public_id text)
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
        RAISE EXCEPTION 'Authentication is required to cancel a follow request.';
    END IF;

    SELECT profile.id INTO target_id
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id));

    DELETE FROM public.follow_requests
    WHERE requester_id = caller_id AND requested_id = target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_follow_request(
    p_public_id text,
    p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    requester uuid;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to respond to follow requests.';
    END IF;

    SELECT profile.id INTO requester
    FROM public.profiles AS profile
    JOIN public.follow_requests AS request
      ON request.requester_id = profile.id
    WHERE profile.public_id = lower(btrim(p_public_id))
      AND request.requested_id = caller_id;

    IF requester IS NULL THEN
        RAISE EXCEPTION 'The follow request was not found.';
    END IF;

    IF p_accept THEN
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (requester, caller_id)
        ON CONFLICT (follower_id, following_id) DO NOTHING;
    END IF;

    DELETE FROM public.follow_requests
    WHERE requester_id = requester AND requested_id = caller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_follow_requests()
RETURNS TABLE (
    public_id text,
    username text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
    SELECT profile.public_id, profile.username, request.created_at
    FROM public.follow_requests AS request
    JOIN public.profiles AS profile ON profile.id = request.requester_id
    WHERE request.requested_id = auth.uid()
    ORDER BY request.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.unfollow_user_by_public_id(p_public_id text)
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

    SELECT profile.id INTO target_id
    FROM public.profiles AS profile
    WHERE profile.public_id = lower(btrim(p_public_id));

    DELETE FROM public.follows
    WHERE follower_id = caller_id AND following_id = target_id;
END;
$function$;

-- The original public follow RPC is security-definer. Route it through the
-- privacy-aware implementation so stale clients cannot bypass requests.
CREATE OR REPLACE FUNCTION public.follow_user_by_public_id(p_public_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
    PERFORM public.request_follow_by_public_id(p_public_id);
END;
$function$;

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT ARRAY[]::text[];

DO $$
DECLARE
    existing_check record;
BEGIN
    FOR existing_check IN
        SELECT constraint_row.conname, pg_get_constraintdef(constraint_row.oid) AS definition
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.posts'::regclass
          AND constraint_row.contype = 'c'
    LOOP
        IF replace(lower(existing_check.definition), ' ', '')
            LIKE '%char_length(btrim(text))>0%' THEN
            EXECUTE format(
                'ALTER TABLE public.posts DROP CONSTRAINT %I',
                existing_check.conname
            );
        END IF;
    END LOOP;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.posts'::regclass
          AND conname = 'posts_text_or_media_check'
    ) THEN
        ALTER TABLE public.posts
            ADD CONSTRAINT posts_text_or_media_check
            CHECK (
                char_length(btrim(text)) > 0
                OR cardinality(image_paths) > 0
            ) NOT VALID;
    END IF;
END;
$$;

CREATE POLICY "Coucou posts can be edited by their authors"
    ON public.posts
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Coucou post media paths belong to their author"
    ON public.posts AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND NOT EXISTS (
            SELECT 1
            FROM unnest(image_paths) AS image_path
            WHERE image_path NOT LIKE auth.uid()::text || '/posts/%'
        )
    );

CREATE POLICY "Coucou edited media paths belong to their author"
    ON public.posts AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (
        author_id = auth.uid()
        AND NOT EXISTS (
            SELECT 1
            FROM unnest(image_paths) AS image_path
            WHERE image_path NOT LIKE auth.uid()::text || '/posts/%'
        )
    );

CREATE OR REPLACE FUNCTION public.coucou_can_read_media(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    parts text[] := string_to_array(p_name, '/');
    owner_id uuid;
    post_id uuid;
BEGIN
    IF cardinality(parts) < 3 THEN
        RETURN false;
    END IF;

    owner_id := parts[1]::uuid;
    IF parts[2] = 'avatars' THEN
        RETURN public.coucou_can_view_profile(owner_id);
    END IF;

    IF parts[2] = 'posts' AND cardinality(parts) >= 4 THEN
        post_id := parts[3]::uuid;
        RETURN EXISTS (
            SELECT 1
            FROM public.posts AS post
            WHERE post.id = post_id
              AND post.author_id = owner_id
              AND public.coucou_can_view_profile(post.author_id)
        );
    END IF;

    RETURN false;
EXCEPTION
    WHEN invalid_text_representation THEN RETURN false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.coucou_can_read_media(text) TO anon, authenticated;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'coucou-media',
    'coucou-media',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Coucou media is visible with its profile"
    ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (
        bucket_id = 'coucou-media'
        AND public.coucou_can_read_media(name)
    );

CREATE POLICY "Coucou users upload their own media"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'coucou-media'
        AND split_part(name, '/', 1) = auth.uid()::text
        AND (
            split_part(name, '/', 2) = 'avatars'
            OR split_part(name, '/', 2) = 'posts'
        )
    );

CREATE POLICY "Coucou users delete their own media"
    ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'coucou-media'
        AND split_part(name, '/', 1) = auth.uid()::text
    );

REVOKE ALL ON FUNCTION public.search_coucou_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_public_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_coucou_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_coucou_social_state(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_coucou_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_follow_by_public_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_follow_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_follow_request(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_follow_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfollow_user_by_public_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.follow_user_by_public_id(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_coucou_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_coucou_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coucou_social_state(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coucou_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_follow_by_public_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_follow_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_follow_request(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user_by_public_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follow_user_by_public_id(text) TO authenticated;

COMMIT;
