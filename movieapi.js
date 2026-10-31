/*
 * Wikidata film metadata and Wikimedia Commons poster lookup.
 * Both public MediaWiki APIs are available without an API key.
 */
const MoviesAPI = (() => {
    const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
    const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
    const FILM_CLASS_ID = "Q11424";
    const MAX_SEARCH_CANDIDATES = 50;

    async function fetchJson(url) {
        const response = await fetch(url, {
            headers: { Accept: "application/json" }
        });
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.info || "The movie catalogue returned an error.");
        }
        return data;
    }

    function getClaimValues(claims, property) {
        const statements = claims[property];
        if (!Array.isArray(statements)) return [];
        return statements
            .map((statement) => statement.mainsnak && statement.mainsnak.datavalue
                ? statement.mainsnak.datavalue.value
                : null)
            .filter(Boolean);
    }

    function getYear(dateValue) {
        const match = String(dateValue || "").match(/\d{4}/);
        return match ? match[0] : "";
    }

    function readMetadataValue(metadata, key) {
        const value = metadata[key] && metadata[key].value;
        if (!value) return "";
        const document = new DOMParser().parseFromString(String(value), "text/html");
        return (document.body.textContent || "").trim();
    }

    function hasReusableLicense(license) {
        const normalized = license.trim().toLowerCase();
        return normalized === "cc0" ||
            normalized.startsWith("cc0 ") ||
            /^cc by(?:-sa)?(?:\s|$)/i.test(license.trim()) ||
            normalized === "public domain";
    }

    function normalizeFileTitle(title) {
        return String(title || "").replace(/_/g, " ").trim().toLowerCase();
    }

    async function searchMovies(query, limit) {
        const trimmed = String(query || "").trim();
        if (!trimmed) return [];

        const searchParams = new URLSearchParams({
            action: "wbsearchentities",
            search: trimmed,
            language: "en",
            uselang: "en",
            type: "item",
            limit: String(MAX_SEARCH_CANDIDATES),
            format: "json",
            origin: "*"
        });
        const searchData = await fetchJson(`${WIKIDATA_API}?${searchParams}`);
        const searchResults = Array.isArray(searchData.search) ? searchData.search : [];
        if (searchResults.length === 0) return [];

        const entityParams = new URLSearchParams({
            action: "wbgetentities",
            ids: searchResults.map((item) => item.id).join("|"),
            props: "labels|claims",
            languages: "en",
            format: "json",
            origin: "*"
        });
        const entityData = await fetchJson(`${WIKIDATA_API}?${entityParams}`);
        const candidates = searchResults
            .map((result) => {
                const entity = entityData.entities && entityData.entities[result.id];
                if (!entity || !entity.claims) return null;

                const isFilm = getClaimValues(entity.claims, "P31")
                    .some((instance) => instance.id === FILM_CLASS_ID);
                const year = getYear(getClaimValues(entity.claims, "P577")[0] &&
                    getClaimValues(entity.claims, "P577")[0].time);
                const posterFile = getClaimValues(entity.claims, "P3383")
                    .find((file) => typeof file === "string");
                const title = entity.labels && entity.labels.en
                    ? entity.labels.en.value
                    : result.label;

                if (!isFilm || !title || !year) return null;
                return {
                    id: result.id,
                    title,
                    year,
                    posterFile
                };
            })
            .filter(Boolean);
        if (candidates.length === 0) return [];

        const posterCandidates = candidates.filter((movie) => movie.posterFile);
        if (posterCandidates.length === 0) {
            return candidates.slice(0, Math.max(1, Number(limit) || 12));
        }

        const commonsParams = new URLSearchParams({
            action: "query",
            titles: posterCandidates.map((movie) => `File:${movie.posterFile}`).join("|"),
            prop: "imageinfo",
            iiprop: "url|extmetadata",
            iiurlwidth: "500",
            format: "json",
            formatversion: "2",
            origin: "*"
        });
        let commonsData;
        try {
            commonsData = await fetchJson(`${COMMONS_API}?${commonsParams}`);
        } catch (error) {
            console.warn("[Movies] Commons poster lookup failed; showing film records without posters:", error.message);
            return candidates.slice(0, Math.max(1, Number(limit) || 12));
        }
        const filePages = new Map(
            (commonsData.query && Array.isArray(commonsData.query.pages)
                ? commonsData.query.pages
                : []).map((page) => [normalizeFileTitle(page.title.replace(/^File:/i, "")), page])
        );

        const moviesWithPosters = new Map(posterCandidates
            .map((movie) => {
                const page = filePages.get(normalizeFileTitle(movie.posterFile));
                const imageInfo = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
                if (!imageInfo || !imageInfo.thumburl || !imageInfo.extmetadata) return null;

                const license = readMetadataValue(imageInfo.extmetadata, "LicenseShortName");
                const artist = readMetadataValue(imageInfo.extmetadata, "Artist");
                if (!hasReusableLicense(license)) return null;
                if (/^cc by/i.test(license) && !artist) return null;

                return [movie.id, {
                    posterUrl: imageInfo.thumburl,
                    posterFilePageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
                    posterArtist: artist,
                    posterLicense: license
                }];
            })
            .filter(Boolean));

        return candidates
            .map((movie) => ({ ...movie, ...(moviesWithPosters.get(movie.id) || {}) }))
            .slice(0, Math.max(1, Number(limit) || 12));
    }

    return { searchMovies };
})();
