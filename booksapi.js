/*
 * Open Library data module for Coucou's Books section.
 * Search + work details: https://openlibrary.org/developers/api
 * Covers: https://openlibrary.org/dev/docs/api/covers
 */
const BooksAPI = (() => {
    const SEARCH_BASE = "https://openlibrary.org/search.json";
    const WORK_BASE = "https://openlibrary.org";
    const COVER_BASE = "https://covers.openlibrary.org/b/id";
    const CACHE_KEY = "coucouBooksApiCache";
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
            // Storage may be unavailable; caching is best-effort only.
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

    function buildSearchUrl(params) {
        const searchParams = new URLSearchParams({
            limit: String(params.limit || 10),
            fields: "key,title,author_name,first_publish_year,subject,cover_i,first_sentence"
        });

        Object.entries(params).forEach(([key, value]) => {
            if (!value || key === "limit") return;
            searchParams.set(key, value);
        });

        return `${SEARCH_BASE}?${searchParams.toString()}`;
    }

    async function searchBooks(query, limit) {
        const trimmed = (query || "").trim();
        if (!trimmed) return [];

        const url = buildSearchUrl({ q: trimmed, limit: limit || 12 });
        const data = await fetchJsonCached(url, `search:${trimmed.toLowerCase()}:${limit || 12}`);
        return Array.isArray(data.docs) ? data.docs : [];
    }

    // Paginated version of searchBooks used for "Load more" on search results.
    async function searchBooksPaged(query, offset, limit) {
        const trimmed = (query || "").trim();
        if (!trimmed) return { books: [], hasMore: false };

        const url = buildSearchUrl({ q: trimmed, limit: limit || 12, offset: offset || 0 });
        const data = await fetchJsonCached(url, `search:${trimmed.toLowerCase()}:${offset || 0}:${limit || 12}`);
        const books = Array.isArray(data.docs) ? data.docs : [];
        const numFound = Number(data.numFound) || 0;

        return { books, hasMore: (offset || 0) + books.length < numFound };
    }

    // Browses a real Open Library subject (e.g. "fantasy") page by page, so
    // the Books section can show many real titles without a manual list.
    async function getSubjectWorks(subject, limit, offset) {
        const trimmed = (subject || "").trim();
        if (!trimmed) return { works: [], hasMore: false };

        const url = `https://openlibrary.org/subjects/${encodeURIComponent(trimmed)}.json?limit=${limit || 18}&offset=${offset || 0}`;
        const data = await fetchJsonCached(url, `subject:${trimmed}:${offset || 0}:${limit || 18}`);
        const works = Array.isArray(data.works) ? data.works : [];
        const workCount = Number(data.work_count) || 0;

        return { works, hasMore: (offset || 0) + works.length < workCount };
    }

    async function searchBooksByTitleAuthor(title, author, limit) {
        const trimmedTitle = (title || "").trim();
        if (!trimmedTitle) return [];

        const url = buildSearchUrl({
            title: trimmedTitle,
            author: (author || "").trim(),
            limit: limit || 8
        });
        const cacheKey = `title-author:${trimmedTitle.toLowerCase()}:${(author || "").trim().toLowerCase()}:${limit || 8}`;
        const data = await fetchJsonCached(url, cacheKey);
        return Array.isArray(data.docs) ? data.docs : [];
    }

    async function getWorkDetails(workKey) {
        const trimmed = (workKey || "").trim();
        if (!trimmed) {
            throw new Error("A work key is required");
        }

        const url = `${WORK_BASE}${trimmed}.json`;
        return fetchJsonCached(url, `work:${trimmed}`);
    }

    function getCoverUrl(coverId, size) {
        if (!coverId) return "";
        return `${COVER_BASE}/${encodeURIComponent(coverId)}-${size || "L"}.jpg`;
    }

    return {
        searchBooks,
        searchBooksPaged,
        searchBooksByTitleAuthor,
        getSubjectWorks,
        getWorkDetails,
        getCoverUrl
    };
})();
