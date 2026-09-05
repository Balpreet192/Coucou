// Paste the Project URL and publishable (anon) key from Supabase here.
const SUPABASE_URL = "https://bmvydwemvrwkcwovsjnc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aZQVHRYLb6VXRHniGKSJbQ_gYnYTfEA";

window.coucouSupabase = null;

if (
    SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
    SUPABASE_PUBLISHABLE_KEY !== "YOUR_SUPABASE_PUBLISHABLE_KEY" &&
    window.supabase && window.supabase.createClient
) {
    window.coucouSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );
}
