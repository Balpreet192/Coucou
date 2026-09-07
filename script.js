function initNavigation() {
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".content-section");

    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetSection = link.getAttribute("data-section");

            // Hide all sections
            sections.forEach((section) => {
                section.classList.remove("active");
            });

            // Show target section
            const target = document.getElementById(targetSection);
            if (target) {
                target.classList.add("active");
            }

            // Update active nav link
            navLinks.forEach((item) => {
                item.classList.remove("active");
            });
            link.classList.add("active");

            // Scroll to top
            window.scrollTo(0, 0);
        });
    });
}

function initCollectionTabs() {
    const tabs = document.querySelectorAll(".collection-tab");
    const views = document.querySelectorAll(".collection-view");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const collectionType = tab.getAttribute("data-collection");

            // Hide all views
            views.forEach((view) => {
                view.classList.remove("active");
            });

            // Show selected view
            const selectedView = document.getElementById(`collection-${collectionType}`);
            if (selectedView) {
                selectedView.classList.add("active");
            }

            // Update tab active state
            tabs.forEach((t) => {
                t.classList.remove("active");
            });
            tab.classList.add("active");
        });
    });
}

const MOVIE_STORAGE_KEY = "coucouSavedMovies";
const MUSIC_STORAGE_KEY = "coucouSavedMusic";
const ART_STORAGE_KEY = "coucouSavedArt";
const BOOKS_STORAGE_KEY = "coucouSavedBooks";

// Lookup maps from card id -> full data object, kept in sync whenever a card
// is created. Event delegation reads an id from the clicked button and looks
// the full item up here, instead of relying on a closure over stale data.
const movieCardData = new Map();
const musicCardData = new Map();
const artCardData = new Map();
const bookCardData = new Map();

// Single source of truth for wiring up "Details" buttons: every dynamic
// card (movies, music, art, books) renders a button with class "details-btn"
// and a matching data-id, and clicks are handled via delegation on the
// section container so newly loaded/paginated cards work with no extra wiring.
function initDetailsDelegation() {
    const movieSection = document.getElementById("movies");
    if (movieSection) {
        movieSection.addEventListener("click", (e) => {
            const button = e.target.closest(".details-btn");
            if (!button || !movieSection.contains(button)) return;

            const id = button.dataset.id;
            console.log("[Movies] Details button clicked, id:", id);

            const movie = movieCardData.get(id);
            if (!movie) {
                console.warn("[Movies] No movie data found for id:", id);
                return;
            }
            renderMovieDetail(movie);
        });
    } else {
        console.warn("[Details] #movies section not found - movie details delegation skipped.");
    }

    const musicSection = document.getElementById("music");
    if (musicSection) {
        musicSection.addEventListener("click", (e) => {
            const button = e.target.closest(".details-btn");
            if (!button || !musicSection.contains(button)) return;

            e.preventDefault();
            e.stopPropagation();

            const id = button.dataset.id;
            console.log("[Music] Details button clicked, id:", id);

            const artist = musicCardData.get(id);
            if (!artist) {
                console.warn("[Music] No artist data found for id:", id);
                return;
            }
            showArtistDetail(id, artist);
        });
    } else {
        console.warn("[Details] #music section not found - music details delegation skipped.");
    }

    const artSection = document.getElementById("art");
    if (artSection) {
        artSection.addEventListener("click", (e) => {
            const button = e.target.closest(".details-btn");
            if (!button || !artSection.contains(button)) return;

            e.preventDefault();
            e.stopPropagation();

            const id = button.dataset.id;
            console.log("[Art] Details button clicked, id:", id);

            const snapshot = artCardData.get(id);
            if (!snapshot) {
                console.warn("[Art] No artist data found for id:", id);
                return;
            }
            showArtArtistDetail(snapshot);
        });
    } else {
        console.warn("[Details] #art section not found - art details delegation skipped.");
    }

    const booksSection = document.getElementById("books");
    if (booksSection) {
        booksSection.addEventListener("click", (e) => {
            const button = e.target.closest(".details-btn");
            if (!button || !booksSection.contains(button)) return;

            e.preventDefault();
            e.stopPropagation();

            const id = button.dataset.id;
            console.log("[Books] Details button clicked, id:", id);

            const book = bookCardData.get(id);
            if (!book) {
                console.warn("[Books] No book data found for id:", id);
                return;
            }
            renderBookDetail(book);
        });
    } else {
        console.warn("[Details] #books section not found - book details delegation skipped.");
    }
}

function getSavedItemIds(storageKey) {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return Array.isArray(saved) ? saved.map(Number) : [];
    } catch (error) {
        return [];
    }
}

function saveItemIds(storageKey, itemIds) {
    localStorage.setItem(storageKey, JSON.stringify(itemIds));
}

function isItemSaved(storageKey, itemId) {
    return getSavedItemIds(storageKey).includes(Number(itemId));
}

function toggleItemSave(storageKey, itemId) {
    const saved = getSavedItemIds(storageKey);
    const numericId = Number(itemId);
    const existingIndex = saved.indexOf(numericId);

    if (existingIndex >= 0) {
        saved.splice(existingIndex, 1);
    } else {
        saved.push(numericId);
    }

    saveItemIds(storageKey, saved);
}

function getSavedMovieIds() {
    return getSavedItemIds(MOVIE_STORAGE_KEY);
}

function saveMovieIds(movieIds) {
    saveItemIds(MOVIE_STORAGE_KEY, movieIds);
}

function isMovieSaved(movieId) {
    return isItemSaved(MOVIE_STORAGE_KEY, movieId);
}

function toggleMovieSave(movieId) {
    toggleItemSave(MOVIE_STORAGE_KEY, movieId);
    renderMovies();
    renderSavedMovies();
}

// Art is sourced live from Wikipedia (string page-title ids), so saved art
// is stored as full artist snapshots rather than numeric ids like Movies/Books.
function getSavedArtItems() {
    try {
        const saved = JSON.parse(localStorage.getItem(ART_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveArtItems(items) {
    localStorage.setItem(ART_STORAGE_KEY, JSON.stringify(items));
}

function isArtSaved(artId) {
    return getSavedArtItems().some((item) => item.id === artId);
}

function toggleArtSave(artId, snapshot) {
    const saved = getSavedArtItems();
    const existingIndex = saved.findIndex((item) => item.id === artId);

    if (existingIndex >= 0) {
        saved.splice(existingIndex, 1);
    } else if (snapshot) {
        saved.push(snapshot);
    }

    saveArtItems(saved);
    renderSavedArt();
}

// Books are sourced live from Open Library (string work keys), so saved
// books are stored as full snapshots rather than the old numeric ids.
function getSavedBookItems() {
    try {
        const saved = JSON.parse(localStorage.getItem(BOOKS_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveBookItems(items) {
    localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(items));
}

function isBookSaved(bookId) {
    return getSavedBookItems().some((item) => String(item.id) === String(bookId));
}

function toggleBookSave(bookId, snapshot) {
    const saved = getSavedBookItems();
    const existingIndex = saved.findIndex((item) => String(item.id) === String(bookId));

    if (existingIndex >= 0) {
        saved.splice(existingIndex, 1);
    } else if (snapshot) {
        saved.push(snapshot);
    }

    saveBookItems(saved);
    renderSavedBooks();
}

// Music is sourced live from the MusicBrainz API (string MBIDs), so saved
// music is stored as full artist snapshots rather than numeric ids like the
// other sections.
function getSavedMusicItems() {
    try {
        const saved = JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveMusicItems(items) {
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(items));
}

function isMusicSaved(mbid) {
    return getSavedMusicItems().some((item) => item.mbid === mbid);
}

function toggleMusicSave(mbid, snapshot) {
    const saved = getSavedMusicItems();
    const existingIndex = saved.findIndex((item) => item.mbid === mbid);

    if (existingIndex >= 0) {
        saved.splice(existingIndex, 1);
    } else if (snapshot) {
        saved.push(snapshot);
    }

    saveMusicItems(saved);
    renderSavedMusic();
}

// Deterministic soft gradients + initials so real MusicBrainz artists (which
// have no artwork of their own) still get a cute, on-brand "photo". Shared by
// the Music and Art sections since both feature real-world people/bands.
const NAME_GRADIENTS = [
    "linear-gradient(135deg, #f9c74f 0%, #f9844a 30%, #7b2cbf 100%)",
    "linear-gradient(135deg, #90e0ef 0%, #00b4d8 38%, #023e8a 100%)",
    "linear-gradient(135deg, #ffafcc 0%, #cdb4db 42%, #5a189a 100%)",
    "linear-gradient(135deg, #80ed99 0%, #2ec4b6 32%, #1d3557 100%)",
    "linear-gradient(135deg, #f6d365 0%, #fda085 50%, #d7a26d 100%)"
];

function getGradientForName(name) {
    const safeName = name || "";
    let hash = 0;
    for (let i = 0; i < safeName.length; i++) {
        hash = (hash * 31 + safeName.charCodeAt(i)) % NAME_GRADIENTS.length;
    }
    return NAME_GRADIENTS[Math.abs(hash) % NAME_GRADIENTS.length];
}

function getInitialsForName(name) {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// Normalizes a MusicBrainz artist object into the shape the UI/storage use.
function buildArtistSnapshot(artist) {
    const tagSource = artist.genres && artist.genres.length > 0 ? artist.genres : (artist.tags || []);
    const tags = tagSource.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
    const genre = tags.length > 0 ? tags[0].name : "";
    const country = artist.country || (artist.area && artist.area.name) || "";
    const lifeSpan = artist["life-span"] || {};
    const activeYears = lifeSpan.begin ? `${lifeSpan.begin}–${lifeSpan.ended ? (lifeSpan.end || "") : "present"}` : "";

    return {
        mbid: artist.id,
        name: artist.name,
        type: artist.type || "",
        country,
        genre,
        activeYears,
        disambiguation: artist.disambiguation || "",
        photoGradient: getGradientForName(artist.name),
        photoText: getInitialsForName(artist.name)
    };
}

function createSavedMusicItem(item) {
    const safeItem = item || {};
    const titleText = safeItem.name || safeItem.title || "Untitled";
    const thumb = document.createElement("div");
    thumb.className = "saved-item-thumb";

    const poster = document.createElement("div");
    poster.className = "saved-item-poster";
    poster.style.background = safeItem.posterGradient || safeItem.photoGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
    poster.textContent = safeItem.posterText || safeItem.photoText || String(titleText).slice(0, 2).toUpperCase();

    const info = document.createElement("div");
    info.className = "saved-item-info";

    const title = document.createElement("h4");
    title.textContent = titleText;

    const details = document.createElement("p");
    const detailText = safeItem.genre ? `${safeItem.genre} • ${safeItem.activeYears || safeItem.year || safeItem.country || ""}`.trim() : (safeItem.country || safeItem.year || "");
    details.textContent = detailText;

    info.appendChild(title);
    info.appendChild(details);
    thumb.appendChild(poster);
    thumb.appendChild(info);

    return thumb;
}

function renderSavedMusic() {
    const list = document.getElementById("saved-music-list");
    if (!list) return;

    const savedMusic = getSavedMusicItems();
    list.innerHTML = "";

    if (savedMusic.length === 0) {
        list.innerHTML = '<p id="empty-music-message">Your saved music will appear here.</p>';
        return;
    }

    savedMusic.forEach((artist) => {
        list.appendChild(createSavedMusicItem(artist));
    });
}

function setMusicState(kind, message) {
    const stateBox = document.getElementById("music-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "music-state";
        return;
    }

    stateBox.className = `music-state music-state-${kind}`;
    stateBox.textContent = message;
}

function setMusicSectionLabel(text) {
    const label = document.getElementById("music-section-label");
    if (!label) return;
    label.textContent = text || "";
}

function shuffleArray(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// A handful of well-known artists/bands shown by default so Music never
// opens empty. Only MBIDs are stored here - all metadata is fetched live.
const FEATURED_ARTIST_MBIDS = [
    "f59c5520-5f46-4d2c-b2c4-822eabf53419", // Linkin Park
    "cd74f170-639f-4ff9-b01f-29b8e82912ae", // Amrinder Gill
    "42d8064a-2eb1-42ec-8336-b113347c361e", // Nimrat Khaira
    "e513b3f9-87a0-4b7a-9321-8d7fbc81e187", // Miss Pooja
    "6f1a58bf-9b1b-49cf-a44a-6cefad7ae04f", // Dua Lipa
    "d570bb31-b9ca-45a4-a2d9-11b186d9c159", // Wham!
    "5b11f4ce-a62d-471e-81fc-a69a8278c7da", // Nirvana
    "6d390061-b3cd-4db3-b905-e56b7f5357fd", // Louis Tomlinson
    "97529a9e-4b5a-4a9c-9c08-c42401d1c268", // YUNGBLUD
    "9b34cd6a-b874-4e75-bec8-1c174fe295d0", // Arjan Dhillon
    "0383dadf-2a4e-4d10-a46a-e9e041da8eb3", // Queen
    "0307edfc-437c-4b48-8700-80680e66a228", // Whitney Houston
    "2f9ecbed-27be-40e6-abca-6de49d50299e", // Aretha Franklin
    "494e8d09-f85b-4543-892f-a5096aed1cd4" // Mariah Carey
];

let featuredArtistsCache = null;

async function loadFeaturedMusic() {
    const musicGrid = document.getElementById("music-grid");
    if (!musicGrid) return;

    if (featuredArtistsCache) {
        setMusicSectionLabel("Featured artists");
        renderMusicResults(featuredArtistsCache);
        return;
    }

    setMusicSectionLabel("Featured artists");
    setMusicState("loading", "Loading featured artists...");
    musicGrid.innerHTML = "";

    const results = await Promise.allSettled(
        FEATURED_ARTIST_MBIDS.map((mbid) => MusicBrainzAPI.getArtist(mbid))
    );

    const artists = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

    if (artists.length === 0) {
        setMusicState("error", "Couldn't load featured artists from MusicBrainz. Please try again in a moment.");
        return;
    }

    featuredArtistsCache = artists;
    setMusicState(null);
    renderMusicResults(artists);
}

// Genres used to browse a long, ever-changing stream of real MusicBrainz
// artists (via tag search) instead of hand-listing hundreds of artists.
const MUSIC_DISCOVER_TAGS = [
    "pop", "rock", "hip hop", "jazz", "electronic", "classical", "r&b",
    "country", "metal", "indie", "folk", "reggae", "soul", "punk",
    "blues", "dance", "alternative rock", "k-pop", "latin", "funk"
];
const MUSIC_PAGE_SIZE = 12;
const MUSIC_MAX_DISCOVER_PAGES = 12;

let musicDiscoveryState = null;
let musicSearchState = null;

function createMusicDiscoveryState() {
    return {
        tags: shuffleArray(MUSIC_DISCOVER_TAGS),
        tagIndex: 0,
        tagOffset: 0,
        loadedIds: new Set(FEATURED_ARTIST_MBIDS),
        pagesLoaded: 0,
        exhausted: false
    };
}

// Pulls one page's worth of fresh, never-before-shown artists by walking a
// shuffled list of genre tags, so every visit surfaces something new.
async function fetchNextMusicDiscoveryBatch(state, batchSize) {
    const collected = [];

    while (collected.length < batchSize && state.tagIndex < state.tags.length) {
        const tag = state.tags[state.tagIndex];
        let artists = [];
        try {
            const result = await MusicBrainzAPI.searchArtistsPaged(`tag:"${tag}"`, state.tagOffset, batchSize);
            artists = result.artists;
        } catch (error) {
            artists = [];
        }

        const fresh = artists.filter((artist) => !state.loadedIds.has(artist.id));
        fresh.forEach((artist) => state.loadedIds.add(artist.id));
        collected.push(...fresh);

        if (artists.length < batchSize) {
            state.tagIndex += 1;
            state.tagOffset = 0;
        } else {
            state.tagOffset += batchSize;
        }
    }

    state.pagesLoaded += 1;
    if (state.tagIndex >= state.tags.length || state.pagesLoaded >= MUSIC_MAX_DISCOVER_PAGES) {
        state.exhausted = true;
    }

    return collected.slice(0, batchSize);
}

function setMusicDiscoverLoadMoreVisible(visible) {
    const wrap = document.getElementById("music-discover-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setMusicLoadMoreVisible(visible) {
    const wrap = document.getElementById("music-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setMusicDiscoverSectionVisible(visible) {
    const section = document.getElementById("music-discover-section");
    if (section) section.hidden = !visible;
}

function setMusicDiscoverState(kind, message) {
    const stateBox = document.getElementById("music-discover-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "music-state";
        return;
    }

    stateBox.className = `music-state music-state-${kind}`;
    stateBox.textContent = message;
}

async function loadMoreMusicDiscovery() {
    if (!musicDiscoveryState) musicDiscoveryState = createMusicDiscoveryState();
    if (musicDiscoveryState.exhausted) return;

    const grid = document.getElementById("music-discover-grid");
    const button = document.getElementById("music-discover-load-more-button");
    const isFirstLoad = grid && grid.children.length === 0;

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }
    if (isFirstLoad) setMusicDiscoverState("loading", "Loading more artists...");

    try {
        const artists = await fetchNextMusicDiscoveryBatch(musicDiscoveryState, MUSIC_PAGE_SIZE);
        setMusicDiscoverState(null);

        if (grid) {
            artists.forEach((artist) => grid.appendChild(createArtistResultCard(artist)));
        }

        setMusicDiscoverLoadMoreVisible(!musicDiscoveryState.exhausted);
        if (button) {
            button.textContent = musicDiscoveryState.exhausted ? "You've reached the end" : "Load more";
        }
    } catch (error) {
        console.error("Loading more artists failed:", error);
        setMusicDiscoverState("error", "Couldn't load more artists right now. Please try again in a moment.");
    } finally {
        if (button && !musicDiscoveryState.exhausted) {
            button.disabled = false;
        }
    }
}

// Boosts exact-name matches and de-prioritizes tribute/cover acts so the
// artist the user is actually looking for surfaces first.
function scoreArtistRelevance(artist, query) {
    const name = (artist.name || "").toLowerCase();
    const q = query.toLowerCase();
    let score = Number(artist.score) || 0;

    if (name === q) {
        score += 1000;
    } else if (name.startsWith(q) || q.startsWith(name)) {
        score += 200;
    }

    const disambiguation = (artist.disambiguation || "").toLowerCase();
    if (/tribute|cover band|parody|karaoke/.test(disambiguation)) {
        score -= 300;
    }

    return score;
}

function rankArtistsByRelevance(artists, query) {
    return artists
        .slice()
        .sort((a, b) => scoreArtistRelevance(b, query) - scoreArtistRelevance(a, query));
}

function createArtistResultCard(artist) {
    const snapshot = buildArtistSnapshot(artist);
    musicCardData.set(snapshot.mbid, snapshot);

    const card = document.createElement("article");
    card.className = "music-card";
    card.dataset.musicId = snapshot.mbid;

    const photo = document.createElement("div");
    photo.className = "music-photo";
    photo.style.background = snapshot.photoGradient;
    const photoSpan = document.createElement("span");
    photoSpan.textContent = snapshot.photoText;
    photo.appendChild(photoSpan);

    const info = document.createElement("div");
    info.className = "music-info";

    const header = document.createElement("div");
    header.className = "music-header";

    const artistName = document.createElement("h3");
    artistName.className = "music-artist-name";
    artistName.textContent = snapshot.name;

    const genrePill = document.createElement("span");
    genrePill.className = "music-genre-pill";
    genrePill.textContent = snapshot.genre || snapshot.type || "Artist";

    header.appendChild(artistName);
    header.appendChild(genrePill);

    const meta = document.createElement("div");
    meta.className = "music-meta";
    [snapshot.type, snapshot.country, snapshot.activeYears].filter(Boolean).forEach((part) => {
        const span = document.createElement("span");
        span.textContent = part;
        meta.appendChild(span);
    });

    const description = document.createElement("p");
    description.className = "music-description";
    description.textContent = snapshot.disambiguation || "Open details to view albums and releases from MusicBrainz.";

    const mbidLine = document.createElement("p");
    mbidLine.className = "music-mbid";
    mbidLine.textContent = `MBID: ${snapshot.mbid}`;

    const footer = document.createElement("div");
    footer.className = "music-footer";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "music-action";
    if (isMusicSaved(snapshot.mbid)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleMusicSave(snapshot.mbid, snapshot);
        saveButton.classList.toggle("saved", isMusicSaved(snapshot.mbid));
        saveButton.textContent = isMusicSaved(snapshot.mbid) ? "Saved" : "Save";
    });

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "music-action secondary details-btn";
    detailsButton.textContent = "Details";
    detailsButton.dataset.id = snapshot.mbid;

    footer.appendChild(saveButton);
    footer.appendChild(detailsButton);

    info.appendChild(header);
    info.appendChild(meta);
    info.appendChild(description);
    info.appendChild(mbidLine);
    info.appendChild(footer);

    card.appendChild(photo);
    card.appendChild(info);
    return card;
}

function renderMusicResults(artists, options) {
    const musicGrid = document.getElementById("music-grid");
    if (!musicGrid) return;

    const append = Boolean(options && options.append);
    musicGrid.style.display = "grid";
    if (!append) musicGrid.innerHTML = "";
    artists.forEach((artist) => {
        musicGrid.appendChild(createArtistResultCard(artist));
    });
}

async function handleMusicSearch(query) {
    const musicGrid = document.getElementById("music-grid");
    const musicDetail = document.getElementById("music-detail");
    if (!musicGrid) return;

    if (musicDetail) {
        musicDetail.hidden = true;
        musicDetail.innerHTML = "";
    }

    const trimmed = (query || "").trim();
    musicGrid.style.display = "grid";

    if (!trimmed) {
        musicSearchState = null;
        setMusicState(null);
        setMusicLoadMoreVisible(false);
        setMusicDiscoverSectionVisible(true);
        loadFeaturedMusic();
        return;
    }

    musicGrid.innerHTML = "";
    setMusicDiscoverSectionVisible(false);
    setMusicSectionLabel(`Search results for "${trimmed}"`);
    setMusicState("loading", "Searching MusicBrainz...");
    setMusicLoadMoreVisible(false);

    try {
        const { artists, total } = await MusicBrainzAPI.searchArtistsPaged(trimmed, 0, 25);

        if (artists.length === 0) {
            setMusicState("empty", `No artists found for "${trimmed}". Try a different spelling.`);
            return;
        }

        const ranked = rankArtistsByRelevance(artists, trimmed);
        musicSearchState = { query: trimmed, offset: artists.length, total, ranked };
        setMusicState(null);
        renderMusicResults(ranked.slice(0, MUSIC_PAGE_SIZE));
        setMusicLoadMoreVisible(ranked.length > MUSIC_PAGE_SIZE || artists.length < total);
    } catch (error) {
        console.error("MusicBrainz search failed:", error);
        setMusicState("error", "Something went wrong reaching MusicBrainz. Please try again in a moment.");
    }
}

async function loadMoreMusicSearch() {
    if (!musicSearchState) return;

    const button = document.getElementById("music-load-more-button");
    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    try {
        const shownCount = document.getElementById("music-grid").children.length;

        // Serve any already-fetched, ranked results still waiting to be shown first.
        if (shownCount < musicSearchState.ranked.length) {
            const nextBatch = musicSearchState.ranked.slice(shownCount, shownCount + MUSIC_PAGE_SIZE);
            renderMusicResults(nextBatch, { append: true });
            setMusicLoadMoreVisible(
                shownCount + nextBatch.length < musicSearchState.ranked.length ||
                musicSearchState.offset < musicSearchState.total
            );
            return;
        }

        if (musicSearchState.offset >= musicSearchState.total) {
            setMusicLoadMoreVisible(false);
            return;
        }

        const { artists, total } = await MusicBrainzAPI.searchArtistsPaged(
            musicSearchState.query,
            musicSearchState.offset,
            MUSIC_PAGE_SIZE
        );
        musicSearchState.offset += artists.length;
        musicSearchState.total = total;

        const ranked = rankArtistsByRelevance(artists, musicSearchState.query);
        musicSearchState.ranked = musicSearchState.ranked.concat(ranked);
        renderMusicResults(ranked, { append: true });
        setMusicLoadMoreVisible(musicSearchState.offset < musicSearchState.total);
    } catch (error) {
        console.error("Loading more search results failed:", error);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Load more artists";
        }
    }
}


function createReleaseCard(releaseGroup) {
    const card = document.createElement("article");
    card.className = "music-release-card";

    const cover = document.createElement("div");
    cover.className = "music-release-cover";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${releaseGroup.title || "Untitled release"} cover art`;
    img.src = MusicBrainzAPI.getCoverArtUrl(releaseGroup.id);
    img.addEventListener("error", () => {
        cover.innerHTML = "";
        const placeholder = document.createElement("div");
        placeholder.className = "music-release-placeholder";
        placeholder.textContent = "No cover art";
        cover.appendChild(placeholder);
    }, { once: true });
    cover.appendChild(img);

    const info = document.createElement("div");
    info.className = "music-release-info";

    const title = document.createElement("h4");
    title.textContent = releaseGroup.title || "Untitled release";

    const meta = document.createElement("p");
    const year = (releaseGroup["first-release-date"] || "").slice(0, 4);
    const type = releaseGroup["primary-type"] || "Release";
    meta.textContent = year ? `${type} • ${year}` : type;

    const mbidLine = document.createElement("p");
    mbidLine.className = "music-mbid";
    mbidLine.textContent = `MBID: ${releaseGroup.id}`;

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(mbidLine);

    card.appendChild(cover);
    card.appendChild(info);
    return card;
}

function renderArtistDetailShell(snapshot) {
    const detailContainer = document.getElementById("music-detail");
    if (!detailContainer) {
        console.warn("[Music] music-detail container not found in the DOM.");
        return;
    }
    if (!snapshot) {
        console.warn("[Music] renderArtistDetailShell called without a snapshot.");
        return;
    }

    detailContainer.innerHTML = `
        <div class="music-detail-shell">
            <button type="button" class="music-back-button" data-action="close-music-detail">Back to results</button>
            <div class="music-detail-hero">
                <div class="music-portrait" style="background: ${snapshot.photoGradient};">
                    <span>${snapshot.photoText}</span>
                </div>
                <div class="music-detail-header-copy">
                    <p class="music-detail-kicker">${snapshot.genre || snapshot.type || "Artist"}</p>
                    <h3>${snapshot.name}</h3>
                    <div class="music-detail-meta">
                        ${snapshot.type ? `<span>${snapshot.type}</span>` : ""}
                        ${snapshot.country ? `<span>${snapshot.country}</span>` : ""}
                        ${snapshot.activeYears ? `<span>${snapshot.activeYears}</span>` : ""}
                    </div>
                </div>
            </div>

            <div class="music-detail-body">
                <div class="music-detail-panel">
                    <h4>About</h4>
                    <p class="music-detail-about"></p>
                    <p class="music-mbid">MBID: ${snapshot.mbid}</p>
                </div>

                <div class="music-detail-panel music-release-panel">
                    <h4>Albums & releases</h4>
                    <div class="music-release-state"></div>
                    <div class="music-release-grid"></div>
                </div>
            </div>

            <div class="music-detail-actions">
                <button type="button" class="music-action ${isMusicSaved(snapshot.mbid) ? "saved" : ""}" data-music-save="${snapshot.mbid}">
                    ${isMusicSaved(snapshot.mbid) ? "Saved" : "Save"}
                </button>
            </div>
        </div>
    `;

    const aboutText = detailContainer.querySelector(".music-detail-about");
    if (aboutText) {
        aboutText.textContent = snapshot.disambiguation || "MusicBrainz doesn't have a written biography for this artist yet.";
    }

    const closeButton = detailContainer.querySelector('[data-action="close-music-detail"]');
    if (closeButton) {
        closeButton.addEventListener("click", () => {
            detailContainer.hidden = true;
            detailContainer.innerHTML = "";
            const musicGrid = document.getElementById("music-grid");
            if (musicGrid) musicGrid.style.display = "grid";
            setMusicDiscoverSectionVisible(!musicSearchState);
        });
    }

    const saveButton = detailContainer.querySelector("[data-music-save]");
    if (saveButton) {
        saveButton.addEventListener("click", () => {
            toggleMusicSave(snapshot.mbid, snapshot);
            saveButton.classList.toggle("saved", isMusicSaved(snapshot.mbid));
            saveButton.textContent = isMusicSaved(snapshot.mbid) ? "Saved" : "Save";
        });
    }
}

async function showArtistDetail(mbid, fallbackSnapshot) {
    const musicGrid = document.getElementById("music-grid");
    const detailContainer = document.getElementById("music-detail");
    if (!detailContainer) {
        console.warn("[Music] music-detail container not found in the DOM.");
        return;
    }

    console.log("[Music] Rendering detail view for MBID:", mbid);

    if (musicGrid) musicGrid.style.display = "none";
    setMusicDiscoverSectionVisible(false);
    setMusicState(null);
    detailContainer.hidden = false;
    detailContainer.style.display = "block";

    renderArtistDetailShell(fallbackSnapshot);

    const releaseStateBox = detailContainer.querySelector(".music-release-state");
    if (releaseStateBox) {
        releaseStateBox.textContent = "Loading releases...";
        releaseStateBox.className = "music-release-state music-state-loading";   
    }

    try {
        const [artist, releaseGroups] = await Promise.all([
            MusicBrainzAPI.getArtist(mbid),
            MusicBrainzAPI.getReleaseGroups(mbid)
        ]);


        // The detail panel may have been closed while these requests were in flight.
        if (detailContainer.hidden) return;

        renderArtistDetailShell(buildArtistSnapshot(artist));

        const freshReleaseGrid = detailContainer.querySelector(".music-release-grid");
        const freshReleaseState = detailContainer.querySelector(".music-release-state");

        if (releaseGroups.length === 0) {
            if (freshReleaseState) {
                freshReleaseState.textContent = "No albums or releases found for this artist on MusicBrainz.";
                freshReleaseState.className = "music-release-state music-state-empty";
            }
            return;
        }

        if (freshReleaseState) {
            freshReleaseState.textContent = "";
            freshReleaseState.className = "music-release-state";
        }

        if (freshReleaseGrid) {
            releaseGroups.forEach((releaseGroup) => {
                freshReleaseGrid.appendChild(createReleaseCard(releaseGroup));
            });
        }
    } catch (error) {
        console.warn("API fetch failed, rendering fallback data", error);
        if (fallbackSnapshot) {
            renderArtistDetailShell(fallbackSnapshot);
        }
    }
}

function initMusicSearch() {
    const form = document.getElementById("music-search-form");
    const input = document.getElementById("music-search-input");
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleMusicSearch(input.value);
    });

    const loadMoreButton = document.getElementById("music-load-more-button");
    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", () => loadMoreMusicSearch());
    }

    const discoverLoadMoreButton = document.getElementById("music-discover-load-more-button");
    if (discoverLoadMoreButton) {
        discoverLoadMoreButton.addEventListener("click", () => loadMoreMusicDiscovery());
    }

    loadFeaturedMusic();
    loadMoreMusicDiscovery();
}


function setArtState(kind, message) {
    const stateBox = document.getElementById("art-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "art-state";
        return;
    }

    stateBox.className = `art-state art-state-${kind}`;
    stateBox.textContent = message;
}

function setArtSectionLabel(text) {
    const label = document.getElementById("art-section-label");
    if (!label) return;
    label.textContent = text || "";
}

// A handful of well-known painters shown by default so Art never opens
// empty. Only Wikipedia page titles are stored here - bios, photos and
// artworks are all fetched live from Wikipedia and the Art Institute of Chicago.
const FEATURED_ART_TITLES = [
    "Vincent van Gogh",
    "Claude Monet",
    "Pablo Picasso",
    "Katsushika Hokusai",
    "Grant Wood",
    "Georgia O'Keeffe",
    "Edward Hopper"
];

let featuredArtistsArtCache = null;

async function showArtDetail(title, fallbackData) {
    const artGrid = document.getElementById("art-grid");
    const artDetail = document.getElementById("art-detail");
    if (!artDetail) return;

    artDetail.innerHTML = "";
    artDetail.hidden = false;
    artDetail.style.display = "block";

    const artwork = artCardData.get(title) || fallbackData;
    if (artwork) {
        renderArtDetailShell(artwork);
    } else {
        artDetail.innerHTML = `<p style="padding: 10px;">Loading details for ${title}...</p>`;
    }
    
}
    
// Normalizes a Wikipedia page summary into the shape the UI/storage use.
function buildArtSnapshot(summary) {
    const name = summary.title || "Untitled";
    return {
        id: summary.title,
        name,
        description: summary.description || "",
        bio: summary.extract || "No biography available yet.",
        photoUrl: summary.thumbnail && summary.thumbnail.source,
        pageUrl: summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page,
        photoGradient: getGradientForName(name),
        photoText: getInitialsForName(name)
    };
}

function createSavedArtItem(item) {
    const safeItem = item || {};
    const titleText = safeItem.name || safeItem.title || "Untitled";
    const thumb = document.createElement("div");
    thumb.className = "saved-item-thumb";

    const poster = document.createElement("div");
    poster.className = "saved-item-poster";

    if (safeItem.photoUrl) {
        const img = document.createElement("img");
        img.src = safeItem.photoUrl;
        img.alt = titleText;
        img.addEventListener("error", () => {
            poster.innerHTML = "";
            poster.style.background = safeItem.photoGradient || safeItem.imageGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
            poster.textContent = safeItem.photoText || safeItem.imageText || String(titleText).slice(0, 2).toUpperCase();
        }, { once: true });
        poster.appendChild(img);
    } else {
        poster.style.background = safeItem.photoGradient || safeItem.imageGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
        poster.textContent = safeItem.photoText || safeItem.imageText || String(titleText).slice(0, 2).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "saved-item-info";

    const title = document.createElement("h4");
    title.textContent = titleText;

    const details = document.createElement("p");
    details.textContent = safeItem.description || safeItem.style || "Saved artist";

    info.appendChild(title);
    info.appendChild(details);
    thumb.appendChild(poster);
    thumb.appendChild(info);

    return thumb;
}

function renderSavedArt() {
    const list = document.getElementById("saved-art-list");
    if (!list) return;

    const savedArt = getSavedArtItems();
    list.innerHTML = "";

    if (savedArt.length === 0) {
        list.innerHTML = '<p id="empty-art-message">Your saved art will appear here.</p>';
        return;
    }

    savedArt.forEach((artist) => {
        list.appendChild(createSavedArtItem(artist));
    });
}

function createArtistPhotoElement(snapshot, className) {
    const photo = document.createElement("div");
    photo.className = className;

    if (snapshot.photoUrl) {
        const img = document.createElement("img");
        img.src = snapshot.photoUrl;
        img.alt = snapshot.name;
        img.loading = "lazy";
        img.addEventListener("error", () => {
            photo.innerHTML = "";
            photo.style.background = snapshot.photoGradient;
            const span = document.createElement("span");
            span.textContent = snapshot.photoText;
            photo.appendChild(span);
        }, { once: true });
        photo.appendChild(img);
    } else {
        photo.style.background = snapshot.photoGradient;
        const span = document.createElement("span");
        span.textContent = snapshot.photoText;
        photo.appendChild(span);
    }

    return photo;
}

function createArtArtistCard(summary) {
    const snapshot = buildArtSnapshot(summary);
    artCardData.set(snapshot.id, snapshot);

    const card = document.createElement("article");
    card.className = "art-artist-card";
    card.dataset.artId = snapshot.id;

    const photo = createArtistPhotoElement(snapshot, "art-artist-photo");

    const info = document.createElement("div");
    info.className = "art-artist-info";

    const nameEl = document.createElement("h4");
    nameEl.textContent = snapshot.name;

    const descriptionEl = document.createElement("p");
    descriptionEl.className = "art-artist-description";
    descriptionEl.textContent = snapshot.description || "Open details to view their most prominent works.";

    const footer = document.createElement("div");
    footer.className = "art-artist-footer";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "art-action";
    if (isArtSaved(snapshot.id)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleArtSave(snapshot.id, snapshot);
        saveButton.classList.toggle("saved", isArtSaved(snapshot.id));
        saveButton.textContent = isArtSaved(snapshot.id) ? "Saved" : "Save";
    });

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "art-action secondary details-btn";
    detailsButton.textContent = "Details";
    detailsButton.dataset.id = snapshot.id;

    footer.appendChild(saveButton);
    footer.appendChild(detailsButton);

    info.appendChild(nameEl);
    info.appendChild(descriptionEl);
    info.appendChild(footer);

    card.appendChild(photo);
    card.appendChild(info);
    return card;
}

function renderArtResults(summaries, options) {
    const artistGrid = document.getElementById("art-artist-grid");
    if (!artistGrid) return;

    const append = Boolean(options && options.append);
    artistGrid.style.display = "grid";
    if (!append) artistGrid.innerHTML = "";
    summaries.forEach((summary) => {
        artistGrid.appendChild(createArtArtistCard(summary));
    });
}

async function loadFeaturedArt() {
    const artistGrid = document.getElementById("art-artist-grid");
    if (!artistGrid) return;

    if (featuredArtistsArtCache) {
        setArtSectionLabel("Featured artists");
        renderArtResults(featuredArtistsArtCache);
        return;
    }

    setArtSectionLabel("Featured artists");
    setArtState("loading", "Loading featured artists...");
    artistGrid.innerHTML = "";

    const results = await Promise.allSettled(
        FEATURED_ART_TITLES.map((title) => ArtAPI.getArtistSummary(title))
    );

    const summaries = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

    if (summaries.length === 0) {
        setArtState("error", "Couldn't load featured artists right now. Please try again in a moment.");
        return;
    }

    featuredArtistsArtCache = summaries;
    setArtState(null);
    renderArtResults(summaries);
}

// Real Wikipedia categories used to browse a long, ever-changing stream of
// artists instead of hand-listing hundreds of names.
const ART_DISCOVER_CATEGORIES = [
    "Category:Painters",
    "Category:Sculptors",
    "Category:Photographers",
    "Category:Illustrators",
    "Category:Printmakers"
];
const ART_PAGE_SIZE = 12;
const ART_MAX_DISCOVER_PAGES = 12;

let artDiscoveryState = null;
let artSearchState = null;

function createArtDiscoveryState() {
    return {
        categories: shuffleArray(ART_DISCOVER_CATEGORIES),
        categoryIndex: 0,
        cmcontinue: null,
        loadedTitles: new Set(FEATURED_ART_TITLES),
        pagesLoaded: 0,
        exhausted: false
    };
}

// Pulls one page's worth of fresh, never-before-shown artists by walking a
// shuffled list of real Wikipedia categories, so every visit feels new.
async function fetchNextArtDiscoveryBatch(state, batchSize) {
    const collected = [];

    while (collected.length < batchSize && state.categoryIndex < state.categories.length) {
        const category = state.categories[state.categoryIndex];
        let summaries = [];
        let nextContinue = null;

        try {
            const result = await ArtAPI.browseArtistsByCategory(category, state.cmcontinue, batchSize);
            summaries = result.summaries;
            nextContinue = result.cmcontinue;
        } catch (error) {
            summaries = [];
            nextContinue = null;
        }

        const fresh = summaries.filter((summary) => summary && !state.loadedTitles.has(summary.title));
        fresh.forEach((summary) => state.loadedTitles.add(summary.title));
        collected.push(...fresh);

        if (nextContinue) {
            state.cmcontinue = nextContinue;
        } else {
            state.categoryIndex += 1;
            state.cmcontinue = null;
        }
    }

    state.pagesLoaded += 1;
    if (state.categoryIndex >= state.categories.length || state.pagesLoaded >= ART_MAX_DISCOVER_PAGES) {
        state.exhausted = true;
    }

    return collected.slice(0, batchSize);
}

function setArtDiscoverLoadMoreVisible(visible) {
    const wrap = document.getElementById("art-discover-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setArtLoadMoreVisible(visible) {
    const wrap = document.getElementById("art-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setArtDiscoverSectionVisible(visible) {
    const section = document.getElementById("art-discover-section");
    if (section) section.hidden = !visible;
}

function setArtDiscoverState(kind, message) {
    const stateBox = document.getElementById("art-discover-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "art-state";
        return;
    }

    stateBox.className = `art-state art-state-${kind}`;
    stateBox.textContent = message;
}

async function loadMoreArtDiscovery() {
    if (!artDiscoveryState) artDiscoveryState = createArtDiscoveryState();
    if (artDiscoveryState.exhausted) return;

    const grid = document.getElementById("art-discover-grid");
    const button = document.getElementById("art-discover-load-more-button");
    const isFirstLoad = grid && grid.children.length === 0;

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }
    if (isFirstLoad) setArtDiscoverState("loading", "Loading more artists...");

    try {
        const summaries = await fetchNextArtDiscoveryBatch(artDiscoveryState, ART_PAGE_SIZE);
        setArtDiscoverState(null);

        if (grid) {
            summaries.forEach((summary) => grid.appendChild(createArtArtistCard(summary)));
        }

        setArtDiscoverLoadMoreVisible(!artDiscoveryState.exhausted);
        if (button) {
            button.textContent = artDiscoveryState.exhausted ? "You've reached the end" : "Load more";
        }
    } catch (error) {
        console.error("Loading more artists failed:", error);
        setArtDiscoverState("error", "Couldn't load more artists right now. Please try again in a moment.");
    } finally {
        if (button && !artDiscoveryState.exhausted) {
            button.disabled = false;
        }
    }
}

// Boosts exact-name matches so the artist the user is looking for surfaces first.
function scoreArtRelevance(summary, query) {
    const name = (summary.title || "").toLowerCase();
    const q = query.toLowerCase();
    let score = 0;

    if (name === q) score += 1000;
    else if (name.startsWith(q) || q.startsWith(name)) score += 200;
    else if (name.includes(q)) score += 50;

    return score;
}

function rankArtByRelevance(summaries, query) {
    return summaries
        .slice()
        .sort((a, b) => scoreArtRelevance(b, query) - scoreArtRelevance(a, query));
}

async function handleArtSearch(query) {
    const artistGrid = document.getElementById("art-artist-grid");
    const artDetail = document.getElementById("art-detail");
    if (!artistGrid) return;

    if (artDetail) {
        artDetail.hidden = true;
        artDetail.innerHTML = "";
    }

    const trimmed = (query || "").trim();
    artistGrid.style.display = "grid";

    if (!trimmed) {
        artSearchState = null;
        setArtState(null);
        setArtLoadMoreVisible(false);
        setArtDiscoverSectionVisible(true);
        loadFeaturedArt();
        return;
    }

    artistGrid.innerHTML = "";
    setArtDiscoverSectionVisible(false);
    setArtSectionLabel(`Search results for "${trimmed}"`);
    setArtState("loading", "Searching for artists...");
    setArtLoadMoreVisible(false);

    try {
        const { summaries, hasMore } = await ArtAPI.searchArtistsPaged(trimmed, 0, 10);

        if (summaries.length === 0) {
            setArtState("empty", `No artists found for "${trimmed}". Try a different spelling.`);
            return;
        }

        const ranked = rankArtByRelevance(summaries, trimmed);
        artSearchState = { query: trimmed, offset: 10, hasMore };
        setArtState(null);
        renderArtResults(ranked);
        setArtLoadMoreVisible(hasMore);
    } catch (error) {
        console.error("Art search failed:", error);
        setArtState("error", "Something went wrong while searching. Please try again in a moment.");
    }
}

async function loadMoreArtSearch() {
    if (!artSearchState) return;

    const button = document.getElementById("art-load-more-button");
    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    try {
        const { summaries, hasMore } = await ArtAPI.searchArtistsPaged(artSearchState.query, artSearchState.offset, ART_PAGE_SIZE);
        artSearchState.offset += ART_PAGE_SIZE;
        artSearchState.hasMore = hasMore;

        const ranked = rankArtByRelevance(summaries, artSearchState.query);
        renderArtResults(ranked, { append: true });
        setArtLoadMoreVisible(hasMore);
    } catch (error) {
        console.error("Loading more art search results failed:", error);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Load more artists";
        }
    }
}


function createArtworkCard(artwork) {
    const card = document.createElement("article");
    card.className = "art-work-card";

    const cover = document.createElement("div");
    cover.className = "art-work-cover";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${artwork.title || "Untitled artwork"}`;
    img.src = ArtAPI.getArtworkImageUrl(artwork.image_id);
    img.addEventListener("error", () => {
        cover.innerHTML = "";
        const placeholder = document.createElement("div");
        placeholder.className = "art-work-placeholder";
        placeholder.textContent = "No image available";
        cover.appendChild(placeholder);
    }, { once: true });
    cover.appendChild(img);

    const info = document.createElement("div");
    info.className = "art-work-info";

    const title = document.createElement("h4");
    title.textContent = artwork.title || "Untitled";

    const meta = document.createElement("p");
    meta.textContent = artwork.date_display || "";

    info.appendChild(title);
    info.appendChild(meta);

    card.appendChild(cover);
    card.appendChild(info);
    return card;
}

function renderArtDetailShell(snapshot) {
    const detailContainer = document.getElementById("art-detail");
    if (!detailContainer) {
        console.warn("[Art] art-detail container not found in the DOM.");
        return;
    }
    if (!snapshot) {
        console.warn("[Art] renderArtDetailShell called without a snapshot.");
        return;
    }

    detailContainer.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "art-detail-shell";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "art-back-button";
    backButton.textContent = "Back to gallery";
    backButton.addEventListener("click", () => {
        detailContainer.hidden = true;
        detailContainer.innerHTML = "";
        const artistGrid = document.getElementById("art-artist-grid");
        if (artistGrid) artistGrid.style.display = "grid";
        setArtDiscoverSectionVisible(!artSearchState);
    });

    const hero = document.createElement("div");
    hero.className = "art-detail-hero";

    const photo = createArtistPhotoElement(snapshot, "art-detail-image");

    const copy = document.createElement("div");
    copy.className = "art-detail-copy";

    const kicker = document.createElement("p");
    kicker.className = "art-detail-kicker";
    kicker.textContent = snapshot.description || "Artist";

    const heading = document.createElement("h3");
    heading.textContent = snapshot.name;

    copy.appendChild(kicker);
    copy.appendChild(heading);

    hero.appendChild(photo);
    hero.appendChild(copy);

    const body = document.createElement("div");
    body.className = "art-detail-body";

    const aboutPanel = document.createElement("div");
    aboutPanel.className = "art-detail-panel";
    const aboutHeading = document.createElement("h4");
    aboutHeading.textContent = "About the artist";
    const aboutText = document.createElement("p");
    aboutText.textContent = snapshot.bio;
    aboutPanel.appendChild(aboutHeading);
    aboutPanel.appendChild(aboutText);

    const worksPanel = document.createElement("div");
    worksPanel.className = "art-detail-panel art-work-panel";
    const worksHeading = document.createElement("h4");
    worksHeading.textContent = "Prominent works";
    const worksState = document.createElement("div");
    worksState.className = "art-work-state";
    const worksGrid = document.createElement("div");
    worksGrid.className = "art-work-grid";
    worksPanel.appendChild(worksHeading);
    worksPanel.appendChild(worksState);
    worksPanel.appendChild(worksGrid);

    body.appendChild(aboutPanel);
    body.appendChild(worksPanel);

    const actions = document.createElement("div");
    actions.className = "art-detail-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "art-action";
    if (isArtSaved(snapshot.id)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleArtSave(snapshot.id, snapshot);
        saveButton.classList.toggle("saved", isArtSaved(snapshot.id));
        saveButton.textContent = isArtSaved(snapshot.id) ? "Saved" : "Save";
    });
    actions.appendChild(saveButton);

    shell.appendChild(backButton);
    shell.appendChild(hero);
    shell.appendChild(body);
    shell.appendChild(actions);
    detailContainer.appendChild(shell);
}

async function showArtArtistDetail(snapshot) {
    const artistGrid = document.getElementById("art-artist-grid");
    const detailContainer = document.getElementById("art-detail");
    if (!detailContainer) {
        console.warn("[Art] art-detail container not found in the DOM.");
        return;
    }
    if (!snapshot) {
        console.warn("[Art] showArtArtistDetail called without a snapshot.");
        return;
    }

    console.log("[Art] Rendering detail view for:", snapshot.name);

    if (artistGrid) artistGrid.style.display = "none";
    setArtDiscoverSectionVisible(false);
    setArtState(null);
    detailContainer.hidden = false;

    renderArtDetailShell(snapshot);

    const worksState = detailContainer.querySelector(".art-work-state");
    const worksGrid = detailContainer.querySelector(".art-work-grid");
    if (worksState) {
        worksState.textContent = "Loading prominent works...";
        worksState.className = "art-work-state art-state-loading";
    }

    try {
        const artworks = await ArtAPI.getArtworksByArtist(snapshot.name, 4);

        // The detail panel may have been closed while this request was in flight.
        if (detailContainer.hidden) return;

        if (artworks.length === 0) {
            if (worksState) {
                worksState.textContent = `No artworks found in our partner collection for ${snapshot.name}.`;
                worksState.className = "art-work-state art-state-empty";
            }
            return;
        }

        if (worksState) {
            worksState.textContent = "";
            worksState.className = "art-work-state";
        }

        artworks.forEach((artwork) => {
            worksGrid.appendChild(createArtworkCard(artwork));
        });
    } catch (error) {
        console.error("Fetching artworks failed:", error);
        if (worksState) {
            worksState.textContent = "Couldn't load artworks right now. Please try again in a moment.";
            worksState.className = "art-work-state art-state-error";
        }
    }
}

function initArtSearch() {
    const form = document.getElementById("art-search-form");
    const input = document.getElementById("art-search-input");
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleArtSearch(input.value);
    });

    const loadMoreButton = document.getElementById("art-load-more-button");
    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", () => loadMoreArtSearch());
    }

    const discoverLoadMoreButton = document.getElementById("art-discover-load-more-button");
    if (discoverLoadMoreButton) {
        discoverLoadMoreButton.addEventListener("click", () => loadMoreArtDiscovery());
    }

    loadFeaturedArt();
    loadMoreArtDiscovery();
}

// Normalizes an Open Library search/subject doc into the shape the UI/storage use.
function buildBookSnapshot(doc) {
    const safeDoc = doc || {};
    const title = safeDoc.title || "Untitled";
    const authorNames = safeDoc.author_name ||
        (Array.isArray(safeDoc.authors) ? safeDoc.authors.map((a) => a.name).filter(Boolean) : []);
    const author = authorNames.length > 0 ? authorNames.join(", ") : "Unknown author";
    const year = safeDoc.first_publish_year || (safeDoc.first_publish_date || "").slice(0, 4) || "";
    const subjects = safeDoc.subject || [];
    const genre = subjects.length > 0 ? subjects[0] : "Fiction";
    const firstSentence = Array.isArray(safeDoc.first_sentence) ? safeDoc.first_sentence[0] : safeDoc.first_sentence;
    const coverId = safeDoc.cover_i || safeDoc.cover_id;
    const workKey = safeDoc.key || (safeDoc.cover_edition_key ? `/books/${safeDoc.cover_edition_key}` : null);

    return {
        id: workKey || `${title}-${author}`,
        title,
        author,
        genre,
        year,
        description: firstSentence || "Open this book on Open Library to learn more.",
        coverUrl: coverId ? BooksAPI.getCoverUrl(coverId, "M") : "",
        coverGradient: getGradientForName(title),
        coverText: getInitialsForName(title)
    };
}

function createBookCoverElement(bookItem, className) {
    const cover = document.createElement("div");
    cover.className = className;

    if (bookItem.coverUrl) {
        const img = document.createElement("img");
        img.src = bookItem.coverUrl;
        img.alt = bookItem.title;
        img.loading = "lazy";
        img.addEventListener("error", () => {
            cover.innerHTML = "";
            cover.style.background = bookItem.coverGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
            const span = document.createElement("span");
            span.textContent = bookItem.coverText || String(bookItem.title || "").slice(0, 2).toUpperCase();
            cover.appendChild(span);
        }, { once: true });
        cover.appendChild(img);
    } else {
        cover.style.background = bookItem.coverGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
        const span = document.createElement("span");
        span.textContent = bookItem.coverText || String(bookItem.title || "").slice(0, 2).toUpperCase();
        cover.appendChild(span);
    }

    return cover;
}

function createSavedBookItem(item) {
    const safeItem = item || {};
    const titleText = safeItem.title || safeItem.name || "Untitled";
    const thumb = document.createElement("div");
    thumb.className = "saved-item-thumb";

    const cover = document.createElement("div");
    cover.className = "saved-item-poster";

    if (safeItem.coverUrl) {
        const img = document.createElement("img");
        img.src = safeItem.coverUrl;
        img.alt = titleText;
        img.addEventListener("error", () => {
            cover.innerHTML = "";
            cover.style.background = safeItem.posterGradient || safeItem.coverGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
            cover.textContent = safeItem.posterText || safeItem.coverText || String(titleText).slice(0, 2).toUpperCase();
        }, { once: true });
        cover.appendChild(img);
    } else {
        cover.style.background = safeItem.posterGradient || safeItem.coverGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
        cover.textContent = safeItem.posterText || safeItem.coverText || String(titleText).slice(0, 2).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "saved-item-info";

    const title = document.createElement("h4");
    title.textContent = titleText;

    const details = document.createElement("p");
    const detailText = safeItem.genre ? `${safeItem.genre} • ${safeItem.year || ""}`.trim() : (safeItem.author || "Saved book");
    details.textContent = detailText;

    info.appendChild(title);
    info.appendChild(details);
    thumb.appendChild(cover);
    thumb.appendChild(info);

    return thumb;
}

function renderSavedBooks() {
    const list = document.getElementById("saved-books-list");
    if (!list) return;

    const savedBooks = getSavedBookItems();
    list.innerHTML = "";

    if (savedBooks.length === 0) {
        list.innerHTML = '<p id="empty-books-message">Your saved books will appear here.</p>';
        return;
    }

    savedBooks.forEach((book) => {
        list.appendChild(createSavedBookItem(book));
    });
}

function renderBookDetail(bookItem) {
    const detailContainer = document.getElementById("book-detail");
    const bookGrid = document.getElementById("book-grid");
    if (!detailContainer) {
        console.warn("[Books] book-detail container not found in the DOM.");
        return;
    }
    if (!bookItem) {
        console.warn("[Books] renderBookDetail called without a book item.");
        return;
    }

    console.log("[Books] Rendering detail view for:", bookItem.title);

    if (bookGrid) bookGrid.style.display = "none";
    setBookDiscoverSectionVisible(false);
    detailContainer.hidden = false;
    detailContainer.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "book-detail-shell";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "book-back-button";
    backButton.textContent = "Back to books";
    backButton.addEventListener("click", () => {
        detailContainer.hidden = true;
        detailContainer.innerHTML = "";
        if (bookGrid) bookGrid.style.display = "grid";
        setBookDiscoverSectionVisible(!bookSearchState);
    });

    const hero = document.createElement("div");
    hero.className = "book-detail-hero";

    const cover = createBookCoverElement(bookItem, "book-cover-large");

    const copy = document.createElement("div");
    copy.className = "book-detail-copy";
    copy.innerHTML = `
        <p class="book-detail-kicker">${bookItem.genre || "Book"}</p>
        <h3>${bookItem.title}</h3>
        <div class="book-detail-meta">
            <span>By ${bookItem.author}</span>
            <span>${bookItem.year || ""}</span>
        </div>
    `;

    hero.appendChild(cover);
    hero.appendChild(copy);

    const body = document.createElement("div");
    body.className = "book-detail-body";

    const synopsisPanel = document.createElement("div");
    synopsisPanel.className = "book-detail-panel";
    synopsisPanel.innerHTML = `<h4>Synopsis</h4><p>${bookItem.detailDescription || bookItem.description}</p>`;
    body.appendChild(synopsisPanel);

    if (bookItem.themes && bookItem.themes.length > 0) {
        const themesPanel = document.createElement("div");
        themesPanel.className = "book-detail-panel";
        themesPanel.innerHTML = `<h4>Key themes</h4><ul>${bookItem.themes.map((theme) => `<li>${theme}</li>`).join("")}</ul>`;
        body.appendChild(themesPanel);
    }

    const actions = document.createElement("div");
    actions.className = "book-detail-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "book-action";
    if (isBookSaved(bookItem.id)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleBookSave(bookItem.id, bookItem);
        saveButton.classList.toggle("saved", isBookSaved(bookItem.id));
        saveButton.textContent = isBookSaved(bookItem.id) ? "Saved" : "Save";
    });
    actions.appendChild(saveButton);

    shell.appendChild(backButton);
    shell.appendChild(hero);
    shell.appendChild(body);
    shell.appendChild(actions);
    detailContainer.appendChild(shell);
}

function createBookCard(bookItem) {
    bookCardData.set(String(bookItem.id), bookItem);

    const card = document.createElement("article");
    card.className = "book-card";
    card.dataset.bookId = String(bookItem.id);

    const cover = createBookCoverElement(bookItem, "book-cover");

    const info = document.createElement("div");
    info.className = "book-info";

    const titleRow = document.createElement("div");
    titleRow.className = "book-title-row";

    const title = document.createElement("h3");
    title.className = "book-title";
    title.textContent = bookItem.title;

    const genrePill = document.createElement("span");
    genrePill.className = "book-genre-pill";
    genrePill.textContent = bookItem.genre;

    titleRow.appendChild(title);
    titleRow.appendChild(genrePill);

    const author = document.createElement("p");
    author.className = "book-author";
    author.textContent = bookItem.author;

    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.innerHTML = `<span>${bookItem.year || ""}</span><span>${bookItem.genre}</span>`;

    const description = document.createElement("p");
    description.className = "book-description";
    description.textContent = bookItem.description;

    const footer = document.createElement("div");
    footer.className = "book-footer";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "book-action";
    if (isBookSaved(bookItem.id)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleBookSave(bookItem.id, bookItem);
        saveButton.classList.toggle("saved", isBookSaved(bookItem.id));
        saveButton.textContent = isBookSaved(bookItem.id) ? "Saved" : "Save";
    });

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "book-action secondary details-btn";
    detailsButton.textContent = "Details";
    detailsButton.dataset.id = String(bookItem.id);

    footer.appendChild(saveButton);
    footer.appendChild(detailsButton);

    info.appendChild(titleRow);
    info.appendChild(author);
    info.appendChild(meta);
    info.appendChild(description);
    info.appendChild(footer);

    card.appendChild(cover);
    card.appendChild(info);
    return card;
}

let featuredBooksCache = null;

// Real Open Library subject used to seed the "Featured picks" grid so it
// never shows placeholder/sample data.
async function loadFeaturedBooks() {
    const bookGrid = document.getElementById("book-grid");
    const bookDetail = document.getElementById("book-detail");
    if (!bookGrid) return;

    if (bookDetail && !bookDetail.hidden) {
        bookDetail.hidden = true;
        bookDetail.innerHTML = "";
    }

    if (featuredBooksCache) {
        setBookSectionLabel("Featured picks");
        renderBookResults(featuredBooksCache);
        return;
    }

    setBookSectionLabel("Featured picks");
    setBookState("loading", "Loading featured books...");
    bookGrid.innerHTML = "";

    try {
        const { works } = await BooksAPI.getSubjectWorks("fiction", BOOK_PAGE_SIZE, 0);
        const snapshots = works.map(buildBookSnapshot);

        if (snapshots.length === 0) {
            setBookState("error", "Couldn't load featured books right now. Please try again in a moment.");
            return;
        }

        featuredBooksCache = snapshots;
        setBookState(null);
        renderBookResults(snapshots);
    } catch (error) {
        console.error("Loading featured books failed:", error);
        setBookState("error", "Couldn't load featured books right now. Please try again in a moment.");
    }
}

function renderBookResults(books, options) {
    const bookGrid = document.getElementById("book-grid");
    if (!bookGrid) return;

    const append = Boolean(options && options.append);
    bookGrid.style.display = "grid";
    if (!append) bookGrid.innerHTML = "";
    books.forEach((book) => {
        bookGrid.appendChild(createBookCard(book));
    });
}

function setBookState(kind, message) {
    const stateBox = document.getElementById("book-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "music-state";
        return;
    }

    stateBox.className = `music-state music-state-${kind}`;
    stateBox.textContent = message;
}

function setBookSectionLabel(text) {
    const label = document.getElementById("book-section-label");
    if (!label) return;
    label.textContent = text || "";
}

function setBookLoadMoreVisible(visible) {
    const wrap = document.getElementById("book-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setBookDiscoverLoadMoreVisible(visible) {
    const wrap = document.getElementById("book-discover-load-more-wrap");
    if (wrap) wrap.hidden = !visible;
}

function setBookDiscoverSectionVisible(visible) {
    const section = document.getElementById("book-discover-section");
    if (section) section.hidden = !visible;
}

function setBookDiscoverState(kind, message) {
    const stateBox = document.getElementById("book-discover-state");
    if (!stateBox) return;

    if (!kind) {
        stateBox.innerHTML = "";
        stateBox.className = "music-state";
        return;
    }

    stateBox.className = `music-state music-state-${kind}`;
    stateBox.textContent = message;
}

// Real Open Library subjects used to browse a long, ever-changing stream of
// books instead of hand-listing hundreds of titles.
const BOOK_DISCOVER_SUBJECTS = [
    "fiction", "fantasy", "mystery", "romance", "science_fiction",
    "biography", "poetry", "history", "young_adult", "horror",
    "adventure", "self_help", "thriller", "classics"
];
const BOOK_PAGE_SIZE = 12;
const BOOK_MAX_DISCOVER_PAGES = 12;

let bookDiscoveryState = null;
let bookSearchState = null;

function createBookDiscoveryState() {
    return {
        subjects: shuffleArray(BOOK_DISCOVER_SUBJECTS),
        subjectIndex: 0,
        subjectOffset: 0,
        loadedIds: new Set(),
        pagesLoaded: 0,
        exhausted: false
    };
}

// Pulls one page's worth of fresh, never-before-shown books by walking a
// shuffled list of real Open Library subjects, so every visit feels new.
async function fetchNextBookDiscoveryBatch(state, batchSize) {
    const collected = [];

    while (collected.length < batchSize && state.subjectIndex < state.subjects.length) {
        const subject = state.subjects[state.subjectIndex];
        let result = { works: [], hasMore: false };
        try {
            result = await BooksAPI.getSubjectWorks(subject, batchSize, state.subjectOffset);
        } catch (error) {
            result = { works: [], hasMore: false };
        }

        const fresh = result.works.filter((work) => work && work.key && !state.loadedIds.has(work.key));
        fresh.forEach((work) => state.loadedIds.add(work.key));
        collected.push(...fresh);

        if (result.hasMore) {
            state.subjectOffset += batchSize;
        } else {
            state.subjectIndex += 1;
            state.subjectOffset = 0;
        }
    }

    state.pagesLoaded += 1;
    if (state.subjectIndex >= state.subjects.length || state.pagesLoaded >= BOOK_MAX_DISCOVER_PAGES) {
        state.exhausted = true;
    }

    return collected.slice(0, batchSize).map(buildBookSnapshot);
}

async function loadMoreBookDiscovery() {
    if (!bookDiscoveryState) bookDiscoveryState = createBookDiscoveryState();
    if (bookDiscoveryState.exhausted) return;

    const grid = document.getElementById("book-discover-grid");
    const button = document.getElementById("book-discover-load-more-button");
    const isFirstLoad = grid && grid.children.length === 0;

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }
    if (isFirstLoad) setBookDiscoverState("loading", "Loading more books...");

    try {
        const books = await fetchNextBookDiscoveryBatch(bookDiscoveryState, BOOK_PAGE_SIZE);
        setBookDiscoverState(null);

        if (grid) {
            books.forEach((book) => grid.appendChild(createBookCard(book)));
        }

        setBookDiscoverLoadMoreVisible(!bookDiscoveryState.exhausted);
        if (button) {
            button.textContent = bookDiscoveryState.exhausted ? "You've reached the end" : "Load more";
        }
    } catch (error) {
        console.error("Loading more books failed:", error);
        setBookDiscoverState("error", "Couldn't load more books right now. Please try again in a moment.");
    } finally {
        if (button && !bookDiscoveryState.exhausted) {
            button.disabled = false;
        }
    }
}

async function handleBookSearch(query) {
    const bookDetail = document.getElementById("book-detail");
    if (bookDetail) {
        bookDetail.hidden = true;
        bookDetail.innerHTML = "";
    }

    const trimmed = (query || "").trim();

    if (!trimmed) {
        bookSearchState = null;
        setBookState(null);
        setBookLoadMoreVisible(false);
        setBookDiscoverSectionVisible(true);
        loadFeaturedBooks();
        return;
    }

    setBookDiscoverSectionVisible(false);
    setBookSectionLabel(`Search results for "${trimmed}"`);
    setBookState("loading", "Searching Open Library...");
    setBookLoadMoreVisible(false);

    try {
        const { books, hasMore } = await BooksAPI.searchBooksPaged(trimmed, 0, BOOK_PAGE_SIZE);

        if (books.length === 0) {
            setBookState("empty", `No books found for "${trimmed}". Try a different title or author.`);
            return;
        }

        bookSearchState = { query: trimmed, offset: books.length, hasMore };
        setBookState(null);
        renderBookResults(books.map(buildBookSnapshot));
        setBookLoadMoreVisible(hasMore);
    } catch (error) {
        console.error("Book search failed:", error);
        setBookState("error", "Something went wrong searching Open Library. Please try again in a moment.");
    }
}

async function loadMoreBookSearch() {
    if (!bookSearchState) return;

    const button = document.getElementById("book-load-more-button");
    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    try {
        const { books, hasMore } = await BooksAPI.searchBooksPaged(bookSearchState.query, bookSearchState.offset, BOOK_PAGE_SIZE);
        bookSearchState.offset += books.length;
        bookSearchState.hasMore = hasMore;
        renderBookResults(books.map(buildBookSnapshot), { append: true });
        setBookLoadMoreVisible(hasMore);
    } catch (error) {
        console.error("Loading more books failed:", error);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Load more books";
        }
    }
}

function initBookSearch() {
    const form = document.getElementById("book-search-form");
    const input = document.getElementById("book-search-input");
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleBookSearch(input.value);
    });

    const loadMoreButton = document.getElementById("book-load-more-button");
    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", () => loadMoreBookSearch());
    }

    const discoverLoadMoreButton = document.getElementById("book-discover-load-more-button");
    if (discoverLoadMoreButton) {
        discoverLoadMoreButton.addEventListener("click", () => loadMoreBookDiscovery());
    }

    loadMoreBookDiscovery();
}


// DISCOVER CREATORS LOGIC
const CREATOR_SAMPLE_DATA = [
    {
        id: 1,
        name: "Luna Writes",
        handle: "@lunawritess",
        bio: "Storyteller & book lover. Coffee, words, and midnight thoughts.",
        avatar: "LW",
        followers: 2840,
        niche: "Books & Writing"
    },
    {
        id: 2,
        name: "Pixel Dreams",
        handle: "@pixeldreamsart",
        bio: "Digital artist exploring abstract worlds. 3D & animation enthusiast.",
        avatar: "PD",
        followers: 4156,
        niche: "Digital Art"
    },
    {
        id: 3,
        name: "Melody Heart",
        handle: "@melodyheartmusic",
        bio: "Music curator. Always hunting for fresh sounds and hidden gems.",
        avatar: "MH",
        followers: 3421,
        niche: "Music Discovery"
    },
    {
        id: 4,
        name: "Reel Talk",
        handle: "@reeltalkreviews",
        bio: "Film critic with opinions. From indie to blockbusters, I watch it all.",
        avatar: "RT",
        followers: 5789,
        niche: "Film Criticism"
    },
    {
        id: 5,
        name: "Canvas Seeker",
        handle: "@canvasseeker",
        bio: "Gallery explorer and contemporary art enthusiast. Finding beauty everywhere.",
        avatar: "CS",
        followers: 2109,
        niche: "Contemporary Art"
    },
    {
        id: 6,
        name: "Studio Mind",
        handle: "@studiominddev",
        bio: "Creative thinker & multi-disciplinary artist. Blending all the things.",
        avatar: "SM",
        followers: 3654,
        niche: "Mixed Media"
    }
];

const FOLLOWED_CREATORS_KEY = "coucouFollowedCreators";

function getFollowedCreatorIds() {
    try {
        const followed = JSON.parse(localStorage.getItem(FOLLOWED_CREATORS_KEY) || "[]");
        return Array.isArray(followed) ? followed.map(Number) : [];
    } catch (error) {
        return [];
    }
}

function saveFollowedCreatorIds(creatorIds) {
    localStorage.setItem(FOLLOWED_CREATORS_KEY, JSON.stringify(creatorIds));
}

function isCreatorFollowed(creatorId) {
    return getFollowedCreatorIds().includes(Number(creatorId));
}

function toggleCreatorFollow(creatorId) {
    const followed = getFollowedCreatorIds();
    const numericId = Number(creatorId);
    const existingIndex = followed.indexOf(numericId);

    if (existingIndex >= 0) {
        followed.splice(existingIndex, 1);
    } else {
        followed.push(numericId);
    }

    saveFollowedCreatorIds(followed);
    renderCreators();
}

function createCreatorCard(creator) {
    const card = document.createElement("article");
    card.className = "creator-card";

    const avatar = document.createElement("div");
    avatar.className = "creator-avatar";
    avatar.textContent = creator.avatar;

    const info = document.createElement("div");
    info.className = "creator-info";

    const name = document.createElement("h3");
    name.className = "creator-name";
    name.textContent = creator.name;

    const handle = document.createElement("p");
    handle.className = "creator-handle";
    handle.textContent = creator.handle;

    const bio = document.createElement("p");
    bio.className = "creator-bio";
    bio.textContent = creator.bio;

    const niche = document.createElement("span");
    niche.className = "creator-niche";
    niche.textContent = creator.niche;

    const followers = document.createElement("p");
    followers.className = "creator-followers";
    followers.textContent = `${creator.followers.toLocaleString()} followers`;

    const button = document.createElement("button");
    button.className = "creator-follow-button";
    const isFollowed = isCreatorFollowed(creator.id);
    button.textContent = isFollowed ? "Following" : "Follow";
    button.classList.toggle("following", isFollowed);
    button.addEventListener("click", () => {
        toggleCreatorFollow(creator.id);
    });

    info.appendChild(name);
    info.appendChild(handle);
    info.appendChild(bio);
    info.appendChild(niche);
    info.appendChild(followers);
    info.appendChild(button);

    card.appendChild(avatar);
    card.appendChild(info);

    return card;
}

function renderCreators() {
    const grid = document.getElementById("creators-grid");
    if (!grid) return;

    grid.innerHTML = "";
    CREATOR_SAMPLE_DATA.forEach((creator) => {
        grid.appendChild(createCreatorCard(creator));
    });
}

// MOVIES COLLECTION LOGIC
const MOVIE_SAMPLE_DATA = [
    {
        id: 1,
        title: "The Grand Escape",
        year: 2024,
        genre: "Drama",
        rating: 8.7,
        duration: "2h 12m",
        description: "A quiet dreamer learns to brave the unknown and rewrite his own story.",
        posterGradient: "linear-gradient(135deg, #8ecae6 0%, #219ebc 50%, #023047 100%)",
        posterText: "TG"
    },
    {
        id: 2,
        title: "Velvet Night",
        year: 2023,
        genre: "Thriller",
        rating: 8.2,
        duration: "1h 49m",
        description: "A late-night radio host is pulled into a mystery hidden beneath the city lights.",
        posterGradient: "linear-gradient(135deg, #ffafcc 0%, #cdb4db 45%, #3a86ff 100%)",
        posterText: "VN"
    },
    {
        id: 3,
        title: "Sunset Harbor",
        year: 2022,
        genre: "Romance",
        rating: 7.9,
        duration: "2h 04m",
        description: "Two artists reconnect while chasing a future they never planned for.",
        posterGradient: "linear-gradient(135deg, #ffd6a5 0%, #ff9f1c 38%, #ff6b6b 100%)",
        posterText: "SH"
    },
    {
        id: 4,
        title: "Neon Bloom",
        year: 2024,
        genre: "Sci-Fi",
        rating: 9.1,
        duration: "2h 21m",
        description: "In a city powered by memory, one woman must decide what to keep and what to lose.",
        posterGradient: "linear-gradient(135deg, #a0c4ff 0%, #6a4c93 48%, #1d3557 100%)",
        posterText: "NB"
    },
    {
        id: 5,
        title: "Paper Lanterns",
        year: 2021,
        genre: "Family",
        rating: 8.4,
        duration: "1h 38m",
        description: "A young illustrator follows her grandmother's trail across a glowing seaside town.",
        posterGradient: "linear-gradient(135deg, #90f1ef 0%, #7bdff2 32%, #ffc8dd 100%)",
        posterText: "PL"
    }
];

function createSavedItemThumb(item) {
    const safeItem = item || {};
    const titleText = safeItem.title || safeItem.name || "Untitled";
    const thumb = document.createElement("div");
    thumb.className = "saved-item-thumb";

    const poster = document.createElement("div");
    poster.className = "saved-item-poster";
    poster.style.background = safeItem.posterGradient || safeItem.photoGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
    poster.textContent = safeItem.posterText || safeItem.photoText || String(titleText).slice(0, 2).toUpperCase();

    const info = document.createElement("div");
    info.className = "saved-item-info";

    const title = document.createElement("h4");
    title.textContent = titleText;

    const details = document.createElement("p");
    const genre = safeItem.genre || "";
    const yearText = safeItem.year || safeItem.activeYears || safeItem.country || "";
    details.textContent = genre && yearText ? `${genre} • ${yearText}` : (genre || yearText || "Saved item");

    info.appendChild(title);
    info.appendChild(details);
    thumb.appendChild(poster);
    thumb.appendChild(info);

    return thumb;
}

function renderSavedMovies() {
    const list = document.getElementById("saved-movies-list");
    if (!list) return;

    const savedMovies = getSavedMovieIds();
    const filteredMovies = MOVIE_SAMPLE_DATA.filter((movie) => savedMovies.includes(Number(movie.id)));

    list.innerHTML = "";

    if (filteredMovies.length === 0) {
        list.innerHTML = '<p id="empty-movies-message">Your saved movies will appear here.</p>';
        return;
    }

    filteredMovies.forEach((movie) => {
        list.appendChild(createSavedItemThumb(movie));
    });
}

function createMovieCard(movie) {
    const isSaved = isMovieSaved(movie.id);
    movieCardData.set(String(movie.id), movie);

    const card = document.createElement("article");
    card.className = "movie-card";
    card.dataset.movieId = String(movie.id);

    const poster = document.createElement("div");
    poster.className = "movie-poster";
    poster.style.background = movie.posterGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";

    const posterText = document.createElement("span");
    posterText.className = "movie-poster-text";
    posterText.textContent = movie.posterText || movie.title.slice(0, 2).toUpperCase();
    poster.appendChild(posterText);

    const rating = document.createElement("div");
    rating.className = "movie-rating";
    rating.textContent = `★ ${Number(movie.rating || 0).toFixed(1)}`;
    poster.appendChild(rating);

    const info = document.createElement("div");
    info.className = "movie-info";

    const meta = document.createElement("div");
    meta.className = "movie-meta";
    meta.innerHTML = `<span>${movie.genre}</span><span>${movie.year}</span><span>${movie.duration}</span>`;

    const title = document.createElement("h3");
    title.className = "movie-title";
    title.textContent = movie.title;

    const description = document.createElement("p");
    description.className = "movie-description";
    description.textContent = movie.description;

    const footer = document.createElement("div");
    footer.className = "movie-footer";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "movie-action";
    if (isSaved) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }

    saveButton.addEventListener("click", () => {
        toggleMovieSave(movie.id);
    });

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "movie-action secondary details-btn";
    detailsButton.textContent = "Details";
    detailsButton.dataset.id = String(movie.id);

    footer.appendChild(saveButton);
    footer.appendChild(detailsButton);

    info.appendChild(meta);
    info.appendChild(title);
    info.appendChild(description);
    info.appendChild(footer);

    card.appendChild(poster);
    card.appendChild(info);
    return card;
}

function renderMovies() {
    const movieGrid = document.getElementById("movie-grid");
    if (!movieGrid) return;

    movieGrid.innerHTML = "";
    MOVIE_SAMPLE_DATA.forEach((movie) => {
        movieGrid.appendChild(createMovieCard(movie));
    });
}

function renderMovieDetail(movie) {
    const detailContainer = document.getElementById("movie-detail");
    const movieGrid = document.getElementById("movie-grid");
    if (!detailContainer) {
        console.warn("[Movies] movie-detail container not found in the DOM.");
        return;
    }
    if (!movie) {
        console.warn("[Movies] renderMovieDetail called without a movie.");
        return;
    }

    console.log("[Movies] Rendering detail view for:", movie.title);

    if (movieGrid) movieGrid.style.display = "none";
    detailContainer.hidden = false;
    detailContainer.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "movie-detail-shell";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "movie-back-button";
    backButton.textContent = "Back to movies";
    backButton.addEventListener("click", () => {
        detailContainer.hidden = true;
        detailContainer.innerHTML = "";
        if (movieGrid) movieGrid.style.display = "grid";
    });

    const hero = document.createElement("div");
    hero.className = "movie-detail-hero";

    const poster = document.createElement("div");
    poster.className = "movie-poster-large";
    poster.style.background = movie.posterGradient || "linear-gradient(135deg, #d7a26d, #8ecae6)";
    poster.innerHTML = `<span>${movie.posterText || String(movie.title || "").slice(0, 2).toUpperCase()}</span>`;

    const copy = document.createElement("div");
    copy.className = "movie-detail-copy";
    copy.innerHTML = `
        <p class="movie-detail-kicker">${movie.genre || "Movie"}</p>
        <h3>${movie.title}</h3>
        <div class="movie-detail-meta">
            <span>${movie.year || ""}</span>
            <span>${movie.duration || ""}</span>
            <span>★ ${Number(movie.rating || 0).toFixed(1)}</span>
        </div>
    `;

    hero.appendChild(poster);
    hero.appendChild(copy);

    const body = document.createElement("div");
    body.className = "movie-detail-body";

    const synopsisPanel = document.createElement("div");
    synopsisPanel.className = "movie-detail-panel";
    synopsisPanel.innerHTML = `<h4>Synopsis</h4><p>${movie.description || "No description available yet."}</p>`;
    body.appendChild(synopsisPanel);

    const actions = document.createElement("div");
    actions.className = "movie-detail-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "movie-action";
    if (isMovieSaved(movie.id)) {
        saveButton.classList.add("saved");
        saveButton.textContent = "Saved";
    } else {
        saveButton.textContent = "Save";
    }
    saveButton.addEventListener("click", () => {
        toggleMovieSave(movie.id);
        saveButton.classList.toggle("saved", isMovieSaved(movie.id));
        saveButton.textContent = isMovieSaved(movie.id) ? "Saved" : "Save";
    });
    actions.appendChild(saveButton);

    shell.appendChild(backButton);
    shell.appendChild(hero);
    shell.appendChild(body);
    shell.appendChild(actions);
    detailContainer.appendChild(shell);
}

let currentSessionUser = null;
let currentAuthMode = "sign-in";

function setProfileAuthState(message, isError) {
    const state = document.getElementById("profile-auth-state");
    if (!state) return;

    state.textContent = message || "";
    state.classList.toggle("profile-auth-error", Boolean(isError));
}

function renderPosts(posts) {
    const profileFeed = document.querySelector(".profile-posts");
    const myPostsFeed = document.querySelector(".my-posts-feed");
    if (profileFeed) profileFeed.innerHTML = '<p id="empty-post-message">Your photos and thoughts will appear here.</p>';
    if (myPostsFeed) myPostsFeed.innerHTML = '<p id="empty-my-posts-message">Your posts will appear here.</p>';

    if (!posts || posts.length === 0) return;

    if (profileFeed) profileFeed.innerHTML = "";
    if (myPostsFeed) myPostsFeed.innerHTML = "";
    posts.forEach((post) => {
        if (profileFeed) profileFeed.appendChild(createPostElement(post));
        if (myPostsFeed) myPostsFeed.appendChild(createPostElement(post));
    });
}

async function loadPostsFromSupabase() {
    if (!window.coucouSupabase) {
        renderPosts([]);
        return;
    }

    const { data, error } = await window.coucouSupabase
        .from("posts")
        .select("id, author_id, text, created_at, comments(id, post_id, author_id, text, created_at)")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[Posts] Supabase post load failed:", error.message);
        renderPosts([]);
        return;
    }

    renderPosts(data || []);
}

function updateProfileAuthUi(user) {
    currentSessionUser = user || null;

    const name = document.getElementById("profile-display-name");
    const handle = document.getElementById("profile-display-handle");
    const signedOutView = document.getElementById("auth-signed-out-view");
    const signedInView = document.getElementById("auth-signed-in-view");
    const accountEmailDisplay = document.getElementById("account-email-display");
    const confirmEmailTarget = document.getElementById("confirm-email-target");

    // Reset account deletion confirm box
    const confirmBox = document.getElementById("delete-account-confirm-box");
    const confirmInput = document.getElementById("delete-confirm-email-input");
    const confirmBtn = document.getElementById("confirm-delete-account-btn");
    if (confirmBox) confirmBox.hidden = true;
    if (confirmInput) confirmInput.value = "";
    if (confirmBtn) confirmBtn.disabled = true;

    if (user) {
        const metadata = user.user_metadata || {};
        const displayName = metadata.full_name || metadata.name || "Member";
        const userHandle = "@" + (metadata.username || (user.email ? user.email.split("@")[0] : "username"));

        if (name) name.textContent = displayName;
        if (handle) handle.textContent = userHandle;
        if (accountEmailDisplay) accountEmailDisplay.textContent = user.email || "";
        if (confirmEmailTarget) confirmEmailTarget.textContent = user.email || "";

        if (signedOutView) signedOutView.hidden = true;
        if (signedInView) signedInView.hidden = false;
        setProfileAuthState("Signed in.");
    } else {
        if (name) name.textContent = "Your Name";
        if (handle) handle.textContent = "@username";
        if (accountEmailDisplay) accountEmailDisplay.textContent = "";
        if (confirmEmailTarget) confirmEmailTarget.textContent = "";

        if (signedOutView) signedOutView.hidden = false;
        if (signedInView) signedInView.hidden = true;
        setProfileAuthState("");
    }

    void loadPostsFromSupabase();
}

async function submitProfileAuth(action) {
    const emailInput = document.getElementById("profile-auth-email");
    const passwordInput = document.getElementById("profile-auth-password");
    if (!emailInput || !passwordInput || !window.coucouSupabase) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !email.includes("@") || !email.includes(".")) {
        setProfileAuthState("Please enter a valid email address.", true);
        emailInput.focus();
        return;
    }

    if (!password || password.length < 6) {
        setProfileAuthState("Password must be at least 6 characters.", true);
        passwordInput.focus();
        return;
    }

    const signUp = action === "sign-up";
    setProfileAuthState(signUp ? "Creating account..." : "Signing in...");

    try {
        const result = signUp
            ? await window.coucouSupabase.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: "https://balpreet192.github.io/Coucou/" }
              })
            : await window.coucouSupabase.auth.signInWithPassword({ email, password });

        if (result.error) {
            setProfileAuthState(result.error.message, true);
            return;
        }

        passwordInput.value = "";
        if (signUp && !result.data.session) {
            setProfileAuthState("Account created! Check your email to confirm registration.");
        }
    } catch (error) {
        setProfileAuthState("Unable to complete authentication. Please try again.", true);
        console.error("[Auth] Authentication request failed:", error);
    }
}

function initProfileAuth() {
    const form = document.getElementById("profile-auth-form");
    const signOutButton = document.getElementById("profile-sign-out");
    const togglePassBtn = document.getElementById("toggle-password-btn");
    const tabSignIn = document.getElementById("auth-tab-sign-in");
    const tabSignUp = document.getElementById("auth-tab-sign-up");
    const submitBtn = document.getElementById("auth-submit-btn");

    const deleteAccountBtn = document.getElementById("profile-delete-account-btn");
    const cancelDeleteBtn = document.getElementById("cancel-delete-account-btn");
    const confirmDeleteBtn = document.getElementById("confirm-delete-account-btn");
    const confirmEmailInput = document.getElementById("delete-confirm-email-input");
    const deleteConfirmBox = document.getElementById("delete-account-confirm-box");

    if (!form || !signOutButton) return;

    // Mode tabs switching
    if (tabSignIn && tabSignUp && submitBtn) {
        tabSignIn.addEventListener("click", () => {
            currentAuthMode = "sign-in";
            tabSignIn.classList.add("active");
            tabSignUp.classList.remove("active");
            tabSignIn.setAttribute("aria-selected", "true");
            tabSignUp.setAttribute("aria-selected", "false");
            submitBtn.textContent = "Sign in";
        });

        tabSignUp.addEventListener("click", () => {
            currentAuthMode = "sign-up";
            tabSignUp.classList.add("active");
            tabSignIn.classList.remove("active");
            tabSignUp.setAttribute("aria-selected", "true");
            tabSignIn.setAttribute("aria-selected", "false");
            submitBtn.textContent = "Create account";
        });
    }

    // Password visibility toggle
    if (togglePassBtn) {
        togglePassBtn.addEventListener("click", () => {
            const passInput = document.getElementById("profile-auth-password");
            if (passInput) {
                const isPass = passInput.type === "password";
                passInput.type = isPass ? "text" : "password";
                togglePassBtn.textContent = isPass ? "🙈" : "👁️";
            }
        });
    }

    if (!window.coucouSupabase) {
        setProfileAuthState("Authentication is unavailable right now.", true);
        return;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitProfileAuth(currentAuthMode);
    });

    signOutButton.addEventListener("click", async () => {
        setProfileAuthState("Signing out...");
        const { error } = await window.coucouSupabase.auth.signOut();
        if (error) setProfileAuthState(error.message, true);
    });

    // Account deletion UI handlers
    if (deleteAccountBtn && deleteConfirmBox) {
        deleteAccountBtn.addEventListener("click", () => {
            deleteConfirmBox.hidden = false;
        });
    }

    if (cancelDeleteBtn && deleteConfirmBox) {
        cancelDeleteBtn.addEventListener("click", () => {
            deleteConfirmBox.hidden = true;
            if (confirmEmailInput) confirmEmailInput.value = "";
            if (confirmDeleteBtn) confirmDeleteBtn.disabled = true;
        });
    }

    if (confirmEmailInput && confirmDeleteBtn) {
        confirmEmailInput.addEventListener("input", () => {
            const userEmail = currentSessionUser ? (currentSessionUser.email || "").trim().toLowerCase() : "";
            const entered = confirmEmailInput.value.trim().toLowerCase();
            confirmDeleteBtn.disabled = !(userEmail && entered === userEmail);
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async () => {
            if (!currentSessionUser || !window.coucouSupabase) return;

            setProfileAuthState("Deleting account permanently...");
            confirmDeleteBtn.disabled = true;

            try {
                let deleteSuccess = false;
                const { error: rpcError } = await window.coucouSupabase.rpc("delete_user_account");

                if (!rpcError) {
                    deleteSuccess = true;
                } else {
                    const { error: fnError } = await window.coucouSupabase.functions.invoke("delete-account");
                    if (!fnError) {
                        deleteSuccess = true;
                    } else {
                        setProfileAuthState("Account deletion failed: " + rpcError.message, true);
                        console.error("[Account Delete] Deletion failed:", rpcError, fnError);
                        confirmDeleteBtn.disabled = false;
                        return;
                    }
                }

                if (deleteSuccess) {
                    await window.coucouSupabase.auth.signOut();
                    updateProfileAuthUi(null);
                    setProfileAuthState("Your account has been permanently deleted.");
                }
            } catch (err) {
                setProfileAuthState("Account deletion failed: " + (err.message || err), true);
                console.error("[Account Delete] Error:", err);
                confirmDeleteBtn.disabled = false;
            }
        });
    }

    window.coucouSupabase.auth.getSession()
        .then(({ data, error }) => {
            if (error) {
                setProfileAuthState(error.message, true);
                return;
            }
            updateProfileAuthUi(data.session && data.session.user);
        })
        .catch((error) => {
            setProfileAuthState("Unable to check authentication status.", true);
            console.error("[Auth] Session check failed:", error);
        });

    window.coucouSupabase.auth.onAuthStateChange((_event, session) => {
        updateProfileAuthUi(session && session.user);
    });
}

async function syncPostToSupabase(postData) {
    if (!window.coucouSupabase || !currentSessionUser) return null;

    try {
        const { data: insertedData, error } = await window.coucouSupabase
            .from("posts")
            .insert({
                author_id: currentSessionUser.id,
                text: postData.text
            })
            .select("id, author_id, text, created_at")
            .single();

        if (error) {
            throw error;
        }

        return insertedData;
    } catch (error) {
        console.error("[Posts] Supabase post sync failed:", error);
        return null;
    }
}

function isUserPostAuthor(postData, user) {
    if (!user) return false;
    if (postData.author_id && postData.author_id === user.id) return true;
    if (postData.author_email && postData.author_email === user.email) return true;
    return false;
}

async function handlePostDelete(postData, postElement) {
    if (!confirm("Are you sure you want to delete this post?")) return;

    if (!window.coucouSupabase || !currentSessionUser || postData.author_id !== currentSessionUser.id) return;

    const { error } = await window.coucouSupabase
        .from("posts")
        .delete()
        .eq("id", postData.id);

    if (error) {
        alert("Could not delete post from database: " + error.message);
        console.error("[Posts] Supabase post delete failed:", error);
        return;
    }

    void loadPostsFromSupabase();
}

async function syncCommentToSupabase(postData, commentObj) {
    if (!window.coucouSupabase || !currentSessionUser) return false;

    try {
        const { error } = await window.coucouSupabase
            .from("comments")
            .insert({
                post_id: postData.id,
                author_id: currentSessionUser.id,
                text: commentObj.text
            });

        if (error) {
            console.error("[Comments] Supabase comment insert failed:", error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("[Comments] Supabase comment insert failed:", err);
        return false;
    }
}

async function handleCommentDelete(postData, commentObj, commentElement) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    if (!window.coucouSupabase || !currentSessionUser || !commentObj.id) return;

    const { error } = await window.coucouSupabase
        .from("comments")
        .delete()
        .eq("id", commentObj.id);

    if (error) {
        alert("Could not delete comment from database: " + error.message);
        console.error("[Comments] Supabase comment delete failed:", error);
        return;
    }

    void loadPostsFromSupabase();
}

function renderCommentItem(commentList, postData, commentObj) {

    const commentItem = document.createElement("div");
    commentItem.className = "comment-item";
    if (commentObj.id) commentItem.dataset.commentId = commentObj.id;

    const textSpan = document.createElement("span");
    textSpan.className = "comment-text";
    textSpan.textContent = "Member: " + commentObj.text;
    commentItem.appendChild(textSpan);

    const isCommentOwner = currentSessionUser && commentObj.author_id && commentObj.author_id === currentSessionUser.id;
    const isPostOwner = currentSessionUser && (
        (postData.author_id && postData.author_id === currentSessionUser.id) ||
        isUserPostAuthor(postData, currentSessionUser)
    );

    if (isCommentOwner || isPostOwner) {
        const deleteCommentBtn = document.createElement("button");
        deleteCommentBtn.type = "button";
        deleteCommentBtn.className = "comment-delete-btn";
        deleteCommentBtn.title = "Delete comment";
        deleteCommentBtn.textContent = "✕";
        deleteCommentBtn.addEventListener("click", () => {
            handleCommentDelete(postData, commentObj, commentItem);
        });
        commentItem.appendChild(deleteCommentBtn);
    }

    commentList.appendChild(commentItem);
}

function createPostElement(postData) {
    const post = document.createElement("div");
    post.className = "post-card";
    post.dataset.id = postData.id;
    post.dataset.liked = String(Boolean(postData.liked));
    post.dataset.likes = String(Number(postData.likes) || 0);

    const header = document.createElement("div");
    header.className = "post-header";

    const name = document.createElement("strong");
    name.textContent = postData.author_name || "Your Name";

    const time = document.createElement("span");
    time.textContent = " • Just now";

    header.appendChild(name);
    header.appendChild(time);

    if (currentSessionUser && isUserPostAuthor(postData, currentSessionUser)) {
        const deletePostBtn = document.createElement("button");
        deletePostBtn.type = "button";
        deletePostBtn.className = "post-delete-btn";
        deletePostBtn.title = "Delete post";
        deletePostBtn.textContent = "🗑️ Delete";
        deletePostBtn.addEventListener("click", () => {
            handlePostDelete(postData, post);
        });
        header.appendChild(deletePostBtn);
    }

    const content = document.createElement("p");
    content.className = "post-content";
    content.textContent = postData.text;

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "like-button";
    likeButton.setAttribute("aria-pressed", String(Boolean(postData.liked)));

    if (postData.liked) {
        likeButton.classList.add("liked");
    }

    const teddy = document.createElement("span");
    teddy.className = "teddy-like";
    teddy.setAttribute("aria-hidden", "true");
    teddy.innerHTML = `
        <span class="teddy-ear teddy-ear-left"></span>
        <span class="teddy-ear teddy-ear-right"></span>
        <span class="teddy-face">
            <span class="teddy-eye teddy-eye-left"></span>
            <span class="teddy-eye teddy-eye-right"></span>
            <span class="teddy-heart teddy-heart-left"></span>
            <span class="teddy-heart teddy-heart-right"></span>
            <span class="teddy-nose"></span>
        </span>
    `;

    const likeCount = document.createElement("span");
    likeCount.className = "like-count";
    likeCount.textContent = String(postData.likes);

    likeButton.appendChild(teddy);
    likeButton.appendChild(likeCount);

    const commentButton = document.createElement("button");
    commentButton.type = "button";
    commentButton.className = "comment-button";

    const commentIcon = document.createElement("span");
    commentIcon.className = "comment-icon";
    commentIcon.setAttribute("aria-hidden", "true");

    const commentLabel = document.createElement("span");
    commentLabel.className = "comment-label";
    commentLabel.textContent = "Comment";

    commentButton.appendChild(commentIcon);
    commentButton.appendChild(commentLabel);

    const commentsWrap = document.createElement("div");
    commentsWrap.className = "comments-wrap";

    const commentForm = document.createElement("form");
    commentForm.className = "comment-form";
    commentForm.style.display = "none";

    const commentInput = document.createElement("input");
    commentInput.type = "text";
    commentInput.className = "comment-input";
    commentInput.placeholder = "Write a comment...";
    commentInput.setAttribute("aria-label", "Write a comment");

    const submitComment = document.createElement("button");
    submitComment.type = "submit";
    submitComment.textContent = "Submit";

    commentForm.appendChild(commentInput);
    commentForm.appendChild(submitComment);

    const commentList = document.createElement("div");
    commentList.className = "comment-list";

    if (Array.isArray(postData.comments)) {
        postData.comments.forEach((comment) => {
            renderCommentItem(commentList, postData, comment);
        });
    }

    likeButton.addEventListener("click", () => {
        const isLiked = post.dataset.liked === "true";
        const currentLikes = Number(post.dataset.likes || 0);

        if (isLiked) {
            post.dataset.liked = "false";
            post.dataset.likes = String(currentLikes - 1);
            likeButton.classList.remove("liked");
            likeButton.setAttribute("aria-pressed", "false");
        } else {
            post.dataset.liked = "true";
            post.dataset.likes = String(currentLikes + 1);
            likeButton.classList.add("liked");
            likeButton.setAttribute("aria-pressed", "true");
        }

        likeCount.textContent = post.dataset.likes;
    });

    commentButton.addEventListener("click", () => {
        const isHidden = commentForm.style.display === "none";
        commentForm.style.display = isHidden ? "flex" : "none";
        if (isHidden) {
            commentInput.focus();
        }
    });

    commentForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const commentText = commentInput.value.trim();

        if (commentText === "") {
            return;
        }

        if (!currentSessionUser) {
            setProfileAuthState("Sign in to comment.", true);
            return;
        }

        const commentCreated = await syncCommentToSupabase(postData, { text: commentText });
        if (!commentCreated) return;

        commentInput.value = "";
        commentForm.style.display = "none";
        void loadPostsFromSupabase();
    });

    actions.appendChild(likeButton);
    actions.appendChild(commentButton);
    commentsWrap.appendChild(commentForm);
    commentsWrap.appendChild(commentList);

    post.appendChild(header);
    post.appendChild(content);
    post.appendChild(actions);
    post.appendChild(commentsWrap);

    return post;
}

async function createPost() {
    const activeSection = document.querySelector(".content-section.active");
    let textBox = activeSection ? activeSection.querySelector("textarea") : null;
    if (!textBox) {
        textBox = document.getElementById("post-text") || document.getElementById("profile-post-text");
    }
    if (!textBox) return;

    const text = textBox.value.trim();

    if (text === "") {
        return;
    }

    if (!currentSessionUser) {
        setProfileAuthState("Sign in to create a post.", true);
        return;
    }

    const postData = {
        text
    };

    const insertedPost = await syncPostToSupabase(postData);
    if (!insertedPost) return;

    textBox.value = "";
    void loadPostsFromSupabase();
}

window.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initCollectionTabs();
    initDetailsDelegation();
    initMusicSearch();
    initArtSearch();
    initBookSearch();
    initProfileAuth();
    renderCreators();
    renderMovies();
    loadFeaturedBooks();
    renderSavedMovies();
    renderSavedMusic();
    renderSavedArt();
    renderSavedBooks();
    void loadPostsFromSupabase();
});
