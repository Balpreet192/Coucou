/*
 * MusicBrainz API module for Coucou's Music section.
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 * Cover Art Archive: https://musicbrainz.org/doc/Cover_Art_Archive/API
 *
 * No API key is required for normal metadata lookups. This module only
 * reads public metadata - it never sends or stores any credentials.
 */
const MusicBrainzAPI = (() => {
    const BASE_URL = "https://musicbrainz.org/ws/2";
    const COVER_ART_BASE = "https://coverartarchive.org";
    // MusicBrainz asks API consumers to identify themselves with a contact point.
    // Note: browsers forbid scripts from setting the "User-Agent" header, so this
    // is sent on a best-effort basis; it is not required for anonymous metadata reads.
    const USER_AGENT = "Coucou/1.0 (preetkaurbal2130@gmail.com)";
    const MIN_REQUEST_GAP_MS = 1100; // stay under MusicBrainz's ~1 request/second limit
    const CACHE_KEY = "coucouMusicBrainzCache";
    const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

    let lastRequestTime = 0;
    let requestQueue = Promise.resolve();

    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        } catch (error) {
            return {};
        }
    }

    function writeCache(cache) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            // Storage may be full/unavailable; caching is best-effort only.
        }
    }

    function getCached(url) {
        const cache = readCache();
        const entry = cache[url];
        if (entry && Date.now() - entry.time < CACHE_TTL_MS) {
            return entry.data;
        }
        return null;
    }

    function setCached(url, data) {
        const cache = readCache();
        cache[url] = { time: Date.now(), data };
        writeCache(cache);
    }

    // Serializes every MusicBrainz request so they never fire faster than 1/sec.
    function throttledFetch(url) {
        requestQueue = requestQueue.then(async () => {
            const elapsed = Date.now() - lastRequestTime;
            if (elapsed < MIN_REQUEST_GAP_MS) {
                await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed));
            }
            lastRequestTime = Date.now();
        });

        return requestQueue.then(() =>
            fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": USER_AGENT
                }
            })
        );
    }

    async function fetchJson(url) {
        const cached = getCached(url);
        if (cached) return cached;

        const response = await throttledFetch(url);
        if (!response.ok) {
            throw new Error(`MusicBrainz request failed with status ${response.status}`);
        }

        const data = await response.json();
        setCached(url, data);
        return data;
    }

    async function searchArtists(query) {
        const trimmed = (query || "").trim();
        if (!trimmed) return [];

        // Fetch a slightly larger pool so the caller can rerank for relevance.
        const url = `${BASE_URL}/artist/?query=${encodeURIComponent(trimmed)}&fmt=json&limit=12`;
        const data = await fetchJson(url);
        return Array.isArray(data.artists) ? data.artists : [];
    }

    // Same as searchArtists but with offset/limit control, used for paginated
    // search results and for browsing artists by genre tag (e.g. tag:"pop").
    async function searchArtistsPaged(query, offset, limit) {
        const trimmed = (query || "").trim();
        if (!trimmed) return { artists: [], total: 0 };

        const url = `${BASE_URL}/artist/?query=${encodeURIComponent(trimmed)}&fmt=json&limit=${limit || 12}&offset=${offset || 0}`;
        const data = await fetchJson(url);
        return {
            artists: Array.isArray(data.artists) ? data.artists : [],
            total: Number(data.count) || 0
        };
    }

    async function getArtist(mbid) {
        const url = `${BASE_URL}/artist/${encodeURIComponent(mbid)}?fmt=json&inc=tags+genres`;
        return fetchJson(url);
    }

    async function getReleaseGroups(mbid) {
        const url = `${BASE_URL}/release-group/?artist=${encodeURIComponent(mbid)}&fmt=json&limit=25`;
        const data = await fetchJson(url);
        const groups = Array.isArray(data["release-groups"]) ? data["release-groups"] : [];

        return groups.slice().sort((a, b) => {
            const dateA = a["first-release-date"] || "";
            const dateB = b["first-release-date"] || "";
            return dateB.localeCompare(dateA);
        });
    }

    // Cover Art Archive images are fetched directly via <img src>, so callers
    // should provide an onerror fallback in case artwork isn't available.
    function getCoverArtUrl(releaseGroupMbid) {
        return `${COVER_ART_BASE}/release-group/${encodeURIComponent(releaseGroupMbid)}/front-250`;
    }

    return {
        searchArtists,
        searchArtistsPaged,
        getArtist,
        getReleaseGroups,
        getCoverArtUrl
    };
})();
