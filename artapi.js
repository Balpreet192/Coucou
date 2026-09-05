/*
 * Art data module for Coucou's Art section.
 * Artist bios/photos: Wikipedia REST API (https://en.wikipedia.org/api/rest_v1/)
 * Artwork images: The Art Institute of Chicago API (https://api.artic.edu/docs/)
 * Both are free, keyless, public APIs with CORS enabled for browser use.
 */
const ArtAPI = (() => {
    const WIKI_ACTION_BASE = "https://en.wikipedia.org/w/api.php";
    const WIKI_SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary";
    const AIC_SEARCH_BASE = "https://api.artic.edu/api/v1/artworks/search";
    const AIC_IIIF_BASE = "https://www.artic.edu/iiif/2";
    const CACHE_KEY = "coucouArtApiCache";
    const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

    function getCached(key) {
        const cache = readCache();
        const entry = cache[key];
        if (entry && Date.now() - entry.time < CACHE_TTL_MS) {
            return entry.data;
        }
        return null;
    }

    function setCached(key, data) {
        const cache = readCache();
        cache[key] = { time: Date.now(), data };
        writeCache(cache);
    }

    async function fetchJsonCached(url, cacheKey) {
        const key = cacheKey || url;
        const cached = getCached(key);
        if (cached) return cached;

        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();
        setCached(key, data);
        return data;
    }

    async function searchArtistTitles(query, limit) {
        const trimmed = (query || "").trim();
        if (!trimmed) return [];

        const url = `${WIKI_ACTION_BASE}?action=opensearch&search=${encodeURIComponent(trimmed)}&limit=${limit}&namespace=0&format=json&origin=*`;
        const data = await fetchJsonCached(url);
        return Array.isArray(data[1]) ? data[1] : [];
    }

    // Uses Wikipedia's regular full-text search (list=search), which supports
    // an offset, so search results can be paginated with a "Load more" button.
    async function searchArtistTitlesPaged(query, offset, limit) {
        const trimmed = (query || "").trim();
        if (!trimmed) return { titles: [], hasMore: false };

        const params = new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: trimmed,
            srlimit: String(limit || 8),
            sroffset: String(offset || 0),
            format: "json",
            origin: "*"
        });
        const url = `${WIKI_ACTION_BASE}?${params.toString()}`;
        const data = await fetchJsonCached(url, `searchpaged:${trimmed.toLowerCase()}:${offset || 0}:${limit || 8}`);
        const results = (data.query && data.query.search) || [];
        return {
            titles: results.map((result) => result.title),
            hasMore: Boolean(data.continue)
        };
    }

    // Browses real Wikipedia categories (e.g. "Category:Painters") page by
    // page using the API's own cmcontinue token, so we can surface many real
    // artists without hand-curating a big list.
    async function browseCategoryMembers(category, cmcontinue, limit) {
        const params = new URLSearchParams({
            action: "query",
            list: "categorymembers",
            cmtitle: category,
            cmlimit: String(limit || 20),
            cmnamespace: "0",
            format: "json",
            origin: "*"
        });
        if (cmcontinue) {
            params.set("cmcontinue", cmcontinue);
        }

        const url = `${WIKI_ACTION_BASE}?${params.toString()}`;
        // Continuation tokens are session-specific, so this call bypasses the cache.
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();
        const members = (data.query && data.query.categorymembers) || [];
        return {
            titles: members.map((member) => member.title),
            cmcontinue: (data.continue && data.continue.cmcontinue) || null
        };
    }

    async function getArtistSummary(title) {
        const url = `${WIKI_SUMMARY_BASE}/${encodeURIComponent(title)}`;
        return fetchJsonCached(url, `summary:${title}`);
    }

    // Finds candidate artist pages on Wikipedia and fetches a short summary
    // (photo + one-line description + bio) for each.
    async function searchArtists(query) {
        const candidateTitles = await searchArtistTitles(query, 8);
        if (candidateTitles.length === 0) return [];

        const results = await Promise.allSettled(candidateTitles.map((title) => getArtistSummary(title)));

        return results
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value)
            .filter((summary) => summary && summary.type !== "disambiguation");
    }

    // Paginated version of searchArtists used for "Load more" on search results.
    async function searchArtistsPaged(query, offset, limit) {
        const { titles, hasMore } = await searchArtistTitlesPaged(query, offset, limit);
        if (titles.length === 0) return { summaries: [], hasMore: false };

        const results = await Promise.allSettled(titles.map((title) => getArtistSummary(title)));
        const summaries = results
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value)
            .filter((summary) => summary && summary.type !== "disambiguation");

        return { summaries, hasMore };
    }

    // Fetches one batch of real artist pages from a Wikipedia category so the
    // Art section can show a long, ever-growing list without a manual roster.
    async function browseArtistsByCategory(category, cmcontinue, limit) {
        const { titles, cmcontinue: nextContinue } = await browseCategoryMembers(category, cmcontinue, limit);
        if (titles.length === 0) return { summaries: [], cmcontinue: nextContinue };

        const results = await Promise.allSettled(titles.map((title) => getArtistSummary(title)));
        const summaries = results
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value)
            .filter((summary) => summary && summary.type !== "disambiguation");

        return { summaries, cmcontinue: nextContinue };
    }

    // Only keeps artworks whose catalogued artist name matches the query, so
    // photos of/about an artist don't get misattributed as their own work.
    async function getArtworksByArtist(artistName, limit) {
        const trimmed = (artistName || "").trim();
        if (!trimmed) return [];

        const url = `${AIC_SEARCH_BASE}?q=${encodeURIComponent(trimmed)}&limit=20&fields=id,title,image_id,artist_title,date_display`;
        const data = await fetchJsonCached(url, `artworks:${trimmed.toLowerCase()}`);
        const items = Array.isArray(data.data) ? data.data : [];

        const query = trimmed.toLowerCase();
        const matches = items.filter((item) => {
            if (!item.image_id) return false;
            const artistTitle = (item.artist_title || "").trim().toLowerCase();
            if (!artistTitle) return false;
            return artistTitle === query || artistTitle.includes(query) || query.includes(artistTitle);
        });

        return matches.slice(0, limit || 4);
    }

    function getArtworkImageUrl(imageId, width) {
        return `${AIC_IIIF_BASE}/${imageId}/full/${width || 600},/0/default.jpg`;
    }

    return {
        searchArtists,
        searchArtistsPaged,
        browseArtistsByCategory,
        getArtistSummary,
        getArtworksByArtist,
        getArtworkImageUrl
    };
})();
