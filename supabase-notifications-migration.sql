-- Persistent notifications, preferences, and post likes for Coucou.
-- Apply only after reviewing and applying
-- supabase-profile-privacy-media-migration.sql.
-- This migration does not delete or rewrite existing user data.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL
       OR to_regclass('public.posts') IS NULL
       OR to_regclass('public.comments') IS NULL
       OR to_regclass('public.follows') IS NULL
       OR to_regclass('public.follow_requests') IS NULL THEN
        RAISE EXCEPTION
            'Apply the Coucou profile privacy/media migration first; required profile, post, follow, or comment tables are missing.';
    END IF;

    IF to_regprocedure('public.coucou_can_view_profile(uuid)') IS NULL THEN
        RAISE EXCEPTION
            'Apply the Coucou profile privacy/media migration first; public.coucou_can_view_profile(uuid) is missing.';
    END IF;

    IF to_regclass('public.notifications') IS NOT NULL
       OR to_regclass('public.notification_preferences') IS NOT NULL
       OR to_regclass('public.post_likes') IS NOT NULL THEN
        RAISE EXCEPTION
            'A notifications, notification_preferences, or post_likes object already exists. Inspect its schema and dependencies before adapting this migration.';
    END IF;

    IF to_regprocedure('public.coucou_notification_preference_enabled(uuid,text)') IS NOT NULL
       OR to_regprocedure('public.coucou_emit_notification(uuid,uuid,text,uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.coucou_notify_follow_event()') IS NOT NULL
       OR to_regprocedure('public.coucou_notify_follow_request()') IS NOT NULL
       OR to_regprocedure('public.coucou_notify_post_like()') IS NOT NULL
       OR to_regprocedure('public.coucou_notify_post_comment()') IS NOT NULL THEN
        RAISE EXCEPTION
            'A Coucou notification function already exists. Inspect its definition and dependencies before applying this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger_row
        WHERE NOT trigger_row.tgisinternal
          AND trigger_row.tgname IN (
              'coucou_notify_follow_event',
              'coucou_notify_follow_request',
              'coucou_notify_post_like',
              'coucou_notify_post_comment'
          )
    ) THEN
        RAISE EXCEPTION
            'A Coucou notification trigger already exists. Inspect its definition and dependencies before applying this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'public_id' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'author_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comments'
          AND column_name = 'id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comments'
          AND column_name = 'post_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comments'
          AND column_name = 'author_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION
            'Unexpected Coucou schema. Verify profile public_id, post author_id, and comment post_id/author_id before applying this migration.';
    END IF;
END;
$$;

CREATE TABLE public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    new_followers_enabled boolean NOT NULL DEFAULT true,
    follow_requests_enabled boolean NOT NULL DEFAULT true,
    post_likes_enabled boolean NOT NULL DEFAULT true,
    post_comments_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_username text,
    actor_public_id text,
    notification_type text NOT NULL CHECK (
        notification_type IN (
            'new_follower',
            'follow_request',
            'follow_request_accepted',
            'post_like',
            'post_comment'
        )
    ),
    post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT notifications_event_shape_check CHECK (
        (
            notification_type IN (
                'new_follower',
                'follow_request',
                'follow_request_accepted'
            )
            AND post_id IS NULL
            AND comment_id IS NULL
        )
        OR (
            notification_type = 'post_like'
            AND post_id IS NOT NULL
            AND comment_id IS NULL
        )
        OR (
            notification_type = 'post_comment'
            AND post_id IS NOT NULL
            AND comment_id IS NOT NULL
        )
    )
);

CREATE INDEX notifications_recipient_created_idx
    ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX notifications_unread_recipient_idx
    ON public.notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX notifications_post_id_idx
    ON public.notifications (post_id)
    WHERE post_id IS NOT NULL;

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX post_likes_user_id_idx
    ON public.post_likes (user_id, created_at DESC);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notification preferences"
    ON public.notification_preferences
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users create their own notification preferences"
    ON public.notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own notification preferences"
    ON public.notification_preferences
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read their own notifications"
    ON public.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

CREATE POLICY "Users mark their own notifications as read"
    ON public.notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Visible post likes can be counted"
    ON public.post_likes
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts AS post
            WHERE post.id = post_likes.post_id
              AND public.coucou_can_view_profile(post.author_id)
        )
    );

CREATE POLICY "Authenticated users like visible posts"
    ON public.post_likes
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.posts AS post
            WHERE post.id = post_likes.post_id
              AND public.coucou_can_view_profile(post.author_id)
        )
    );

CREATE POLICY "Users remove their own post likes"
    ON public.post_likes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.post_likes FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.notification_preferences TO authenticated;
GRANT SELECT
    ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read_at)
    ON TABLE public.notifications TO authenticated;
GRANT SELECT
    ON TABLE public.post_likes TO anon, authenticated;
GRANT INSERT, DELETE
    ON TABLE public.post_likes TO authenticated;

CREATE FUNCTION public.coucou_notification_preference_enabled(
    p_user_id uuid,
    p_notification_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT CASE p_notification_type
        WHEN 'new_follower' THEN COALESCE(preference.new_followers_enabled, true)
        WHEN 'follow_request' THEN COALESCE(preference.follow_requests_enabled, true)
        WHEN 'follow_request_accepted' THEN COALESCE(preference.follow_requests_enabled, true)
        WHEN 'post_like' THEN COALESCE(preference.post_likes_enabled, true)
        WHEN 'post_comment' THEN COALESCE(preference.post_comments_enabled, true)
        ELSE false
    END
    FROM (SELECT 1) AS singleton
    LEFT JOIN public.notification_preferences AS preference
      ON preference.user_id = p_user_id;
$function$;

CREATE FUNCTION public.coucou_emit_notification(
    p_recipient_id uuid,
    p_actor_id uuid,
    p_notification_type text,
    p_post_id uuid,
    p_comment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    actor_username text;
    actor_public_id text;
BEGIN
    IF p_recipient_id IS NULL
       OR p_actor_id IS NULL
       OR p_recipient_id = p_actor_id
       OR NOT public.coucou_notification_preference_enabled(
           p_recipient_id,
           p_notification_type
       ) THEN
        RETURN;
    END IF;

    SELECT profile.username, profile.public_id
    INTO actor_username, actor_public_id
    FROM public.profiles AS profile
    WHERE profile.id = p_actor_id;

    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        actor_username,
        actor_public_id,
        notification_type,
        post_id,
        comment_id
    )
    VALUES (
        p_recipient_id,
        p_actor_id,
        actor_username,
        actor_public_id,
        p_notification_type,
        p_post_id,
        p_comment_id
    );
END;
$function$;

CREATE FUNCTION public.coucou_notify_follow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.follow_requests AS request
        WHERE request.requester_id = NEW.follower_id
          AND request.requested_id = NEW.following_id
    ) THEN
        PERFORM public.coucou_emit_notification(
            NEW.follower_id,
            NEW.following_id,
            'follow_request_accepted',
            NULL,
            NULL
        );
    ELSE
        PERFORM public.coucou_emit_notification(
            NEW.following_id,
            NEW.follower_id,
            'new_follower',
            NULL,
            NULL
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE FUNCTION public.coucou_notify_follow_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
    PERFORM public.coucou_emit_notification(
        NEW.requested_id,
        NEW.requester_id,
        'follow_request',
        NULL,
        NULL
    );
    RETURN NEW;
END;
$function$;

CREATE FUNCTION public.coucou_notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    recipient_id uuid;
BEGIN
    IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
        RETURN NEW;
    END IF;

    SELECT post.author_id
    INTO recipient_id
    FROM public.posts AS post
    WHERE post.id = NEW.post_id
      AND public.coucou_can_view_profile(post.author_id);

    IF recipient_id IS NOT NULL THEN
        PERFORM public.coucou_emit_notification(
            recipient_id,
            NEW.user_id,
            'post_like',
            NEW.post_id,
            NULL
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE FUNCTION public.coucou_notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
    recipient_id uuid;
BEGIN
    IF auth.uid() IS DISTINCT FROM NEW.author_id THEN
        RETURN NEW;
    END IF;

    SELECT post.author_id
    INTO recipient_id
    FROM public.posts AS post
    WHERE post.id = NEW.post_id
      AND public.coucou_can_view_profile(post.author_id);

    IF recipient_id IS NOT NULL THEN
        PERFORM public.coucou_emit_notification(
            recipient_id,
            NEW.author_id,
            'post_comment',
            NEW.post_id,
            NEW.id
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.coucou_notification_preference_enabled(uuid, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coucou_emit_notification(uuid, uuid, text, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coucou_notify_follow_event()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coucou_notify_follow_request()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coucou_notify_post_like()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coucou_notify_post_comment()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER coucou_notify_follow_event
    AFTER INSERT ON public.follows
    FOR EACH ROW
    EXECUTE FUNCTION public.coucou_notify_follow_event();

CREATE TRIGGER coucou_notify_follow_request
    AFTER INSERT ON public.follow_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.coucou_notify_follow_request();

CREATE TRIGGER coucou_notify_post_like
    AFTER INSERT ON public.post_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.coucou_notify_post_like();

CREATE TRIGGER coucou_notify_post_comment
    AFTER INSERT ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.coucou_notify_post_comment();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime
            ADD TABLE public.notifications;
    END IF;
END;
$$;

COMMIT;
