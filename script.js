function initNavigation() {
    const navLinks = document.querySelectorAll(".nav-link");

    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetSection = link.getAttribute("data-section");
            activateContentSection(targetSection);
        });
    });
}

function activateContentSection(targetSection) {
    const target = document.getElementById(targetSection);
    if (!target) return;

    if (targetSection !== "profile") closeNotificationsPanel();
    if (targetSection === "my-posts") setMySpaceView("posts");
    document.querySelectorAll(".content-section").forEach((section) => {
        section.classList.toggle("active", section === target);
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.section === targetSection);
    });
    window.scrollTo(0, 0);
}

function setMySpaceView(view) {
    const layout = document.querySelector(".my-space-layout");
    const tabs = document.querySelectorAll(".my-space-tab");
    if (!layout || (view !== "posts" && view !== "collections")) return;

    layout.dataset.activeView = view;
    tabs.forEach((tab) => {
        const isActive = tab.dataset.mySpaceView === view;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-pressed", String(isActive));
    });
}

function initMySpaceTabs() {
    document.querySelectorAll(".my-space-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            setMySpaceView(tab.dataset.mySpaceView);
        });
    });
    setMySpaceView("posts");
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

const MOVIE_STORAGE_KEY = "coucouSavedMovieItems";
const MUSIC_STORAGE_KEY = "coucouSavedMusic";
const ART_STORAGE_KEY = "coucouSavedArt";
const BOOKS_STORAGE_KEY = "coucouSavedBooks";
const SAVED_COLLECTION_TYPE_LIST = ["movies", "music", "art", "books"];
const SAVED_COLLECTION_TYPES = new Set(SAVED_COLLECTION_TYPE_LIST);
const SAVED_COLLECTION_STORAGE_KEYS = {
    movies: MOVIE_STORAGE_KEY,
    music: MUSIC_STORAGE_KEY,
    art: ART_STORAGE_KEY,
    books: BOOKS_STORAGE_KEY
};
const guestSavedCollections = { movies: null, music: null, art: null, books: null };
let remoteSavedCollections = { movies: [], books: [], music: [], art: [] };
let remoteSavedCollectionsUserId = null;
let savedCollectionsLoadPromise = null;
let savedCollectionsLoadUserId = null;
let savedCollectionsLoadGeneration = 0;
const pendingSavedCollectionKeys = new Set();

// Lookup maps from card id -> full data object, kept in sync whenever a card
// is created. Event delegation reads an id from the clicked button and looks
// the full item up here, instead of relying on a closure over stale data.
const musicCardData = new Map();
const artCardData = new Map();
const bookCardData = new Map();

// Single source of truth for wiring up "Details" buttons: every dynamic
// card (music, art, books) renders a button with class "details-btn"
// and a matching data-id, and clicks are handled via delegation on the
// section container so newly loaded/paginated cards work with no extra wiring.
function initDetailsDelegation() {
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

function getCollectionItemId(collectionType, item) {
    if (!item) return "";
    const itemId = collectionType === "music" ? item.mbid : item.id;
    return itemId === undefined || itemId === null ? "" : String(itemId);
}

function getLocalSavedCollectionItems(collectionType) {
    if (collectionType === "movies") return getSavedMovieItems();
    if (collectionType === "books") return getSavedBookItems();
    if (collectionType === "music") return getSavedMusicItems();
    return getSavedArtItems();
}

function saveLocalCollectionItems(collectionType, items) {
    if (collectionType === "movies") saveMovieItems(items);
    else if (collectionType === "books") saveBookItems(items);
    else if (collectionType === "music") saveMusicItems(items);
    else saveArtItems(items);
}

function getSavedCollectionItems(collectionType) {
    const localItems = getLocalSavedCollectionItems(collectionType);
    const remoteItems = remoteSavedCollections[collectionType] || [];
    const itemsById = new Map();

    localItems.forEach((item) => {
        const itemId = getCollectionItemId(collectionType, item);
        if (itemId) itemsById.set(itemId, item);
    });
    remoteItems.forEach((item) => {
        const itemId = getCollectionItemId(collectionType, item);
        if (itemId) itemsById.set(itemId, item);
    });
    return Array.from(itemsById.values());
}

function isCollectionItemSaved(collectionType, itemId) {
    const sourceItems = currentSessionUser
        ? remoteSavedCollections[collectionType] || []
        : getLocalSavedCollectionItems(collectionType);
    return sourceItems.some((item) => getCollectionItemId(collectionType, item) === String(itemId));
}

function renderSavedCollection(collectionType) {
    if (collectionType === "movies" || collectionType === "art") renderSavedMoviesAndArt();
    else if (collectionType === "books") renderSavedBooks();
    else if (collectionType === "music") renderSavedMusic();
}

function getGuestCollectionItems(collectionType, isValidItem) {
    if (guestSavedCollections[collectionType] === null) {
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem(SAVED_COLLECTION_STORAGE_KEYS[collectionType]) || "[]");
        } catch (error) {
            console.warn("[Collections] Legacy browser collection data could not be read:", error);
        }
        guestSavedCollections[collectionType] = Array.isArray(saved) ? saved.filter(isValidItem) : [];
    }
    return guestSavedCollections[collectionType];
}

function setGuestCollectionItems(collectionType, items) {
    guestSavedCollections[collectionType] = items;
}

async function migrateGuestCollectionsToSupabase(user) {
    if (!currentSessionUser || currentSessionUser.id !== user.id) {
        throw new Error("Your account changed before guest collections could be synced.");
    }
    const pendingRows = [];
    SAVED_COLLECTION_TYPE_LIST.forEach((collectionType) => {
        getLocalSavedCollectionItems(collectionType).forEach((item) => {
            const itemId = getCollectionItemId(collectionType, item);
            if (itemId) {
                pendingRows.push({
                    user_id: user.id,
                    collection_type: collectionType,
                    item_id: itemId,
                    item_data: item
                });
            }
        });
    });
    if (!pendingRows.length) return;

    for (const row of pendingRows) {
        if (!currentSessionUser || currentSessionUser.id !== user.id) {
            throw new Error("Your account changed before guest collections could be synced.");
        }
        const { error } = await window.coucouSupabase
            .from("saved_collections")
            .insert(row);
        if (error && error.code !== "23505") throw error;
    }

    if (!currentSessionUser || currentSessionUser.id !== user.id) {
        throw new Error("Your account changed before guest collections could be synced.");
    }
    SAVED_COLLECTION_TYPE_LIST.forEach((collectionType) => {
        setGuestCollectionItems(collectionType, []);
        try {
            localStorage.removeItem(SAVED_COLLECTION_STORAGE_KEYS[collectionType]);
        } catch (error) {
            console.warn("[Collections] Synced legacy collection data could not be cleared from this browser:", error);
        }
    });
}

function updateSavedCollectionState(message, isError, collectionType) {
    const stateIds = collectionType
        ? [`${collectionType}-collection-state`, "saved-collections-state"]
        : ["movies-collection-state", "books-collection-state", "music-collection-state", "art-collection-state", "saved-collections-state"];
    stateIds.forEach((stateId) => {
        const state = document.getElementById(stateId);
        if (!state) return;
        state.textContent = message || "";
        state.classList.toggle("profile-auth-error", Boolean(isError));
    });
}

function refreshCollectionSaveButtons(collectionType) {
    document.querySelectorAll("[data-saved-collection-type]").forEach((button) => {
        if (button.dataset.savedCollectionType === collectionType) {
            setCollectionSaveButtonState(button, collectionType, button.dataset.savedCollectionId);
            const isLoadingForCurrentUser = currentSessionUser &&
                savedCollectionsLoadPromise &&
                savedCollectionsLoadUserId === currentSessionUser.id;
            button.disabled = Boolean(isLoadingForCurrentUser);
            if (isLoadingForCurrentUser) button.textContent = "Loading...";
        }
    });
}

async function loadSavedCollectionsForUser(user) {
    if (!user) {
        savedCollectionsLoadGeneration += 1;
        remoteSavedCollections = { movies: [], books: [], music: [], art: [] };
        remoteSavedCollectionsUserId = null;
        savedCollectionsLoadPromise = null;
        savedCollectionsLoadUserId = null;
        updateSavedCollectionState("");
        SAVED_COLLECTION_TYPE_LIST.forEach((type) => {
            renderSavedCollection(type);
            refreshCollectionSaveButtons(type);
        });
        return true;
    }

    if (!window.coucouSupabase) {
        updateSavedCollectionState("Saved collections are unavailable because Supabase is not connected.", true);
        return false;
    }

    if (remoteSavedCollectionsUserId === user.id) return true;
    if (savedCollectionsLoadPromise && savedCollectionsLoadUserId === user.id) {
        return savedCollectionsLoadPromise;
    }

    const generation = ++savedCollectionsLoadGeneration;
    remoteSavedCollections = { movies: [], books: [], music: [], art: [] };
    remoteSavedCollectionsUserId = null;
    SAVED_COLLECTION_TYPE_LIST.forEach((type) => {
        renderSavedCollection(type);
        refreshCollectionSaveButtons(type);
    });
    savedCollectionsLoadUserId = user.id;
    updateSavedCollectionState("Loading your saved collections...");
    const loadPromise = (async () => {
        try {
            await migrateGuestCollectionsToSupabase(user);
            const { data, error } = await window.coucouSupabase
                .from("saved_collections")
                .select("collection_type, item_id, item_data")
                .eq("user_id", user.id);
            if (error) throw error;
            if (generation !== savedCollectionsLoadGeneration) return false;

            const collections = { movies: [], books: [], music: [], art: [] };
            (data || []).forEach((row) => {
                if (
                    SAVED_COLLECTION_TYPES.has(row.collection_type) &&
                    row.item_data &&
                    getCollectionItemId(row.collection_type, row.item_data) === row.item_id
                ) {
                    collections[row.collection_type].push(row.item_data);
                }
            });
            remoteSavedCollections = collections;
            remoteSavedCollectionsUserId = user.id;
            updateSavedCollectionState("");
            SAVED_COLLECTION_TYPE_LIST.forEach((type) => {
                renderSavedCollection(type);
                refreshCollectionSaveButtons(type);
            });
            return true;
        } catch (error) {
            if (generation === savedCollectionsLoadGeneration) {
                remoteSavedCollections = { movies: [], books: [], music: [], art: [] };
                remoteSavedCollectionsUserId = null;
                updateSavedCollectionState(`Could not load saved collections: ${error.message || "Please try again."}`, true);
                SAVED_COLLECTION_TYPE_LIST.forEach((type) => {
                    renderSavedCollection(type);
                    refreshCollectionSaveButtons(type);
                });
            }
            console.error("[Collections] Saved collection load failed:", error);
            return false;
        } finally {
            if (generation === savedCollectionsLoadGeneration) {
                savedCollectionsLoadPromise = null;
                savedCollectionsLoadUserId = null;
                SAVED_COLLECTION_TYPE_LIST.forEach(refreshCollectionSaveButtons);
            }
        }
    })();
    savedCollectionsLoadPromise = loadPromise;
    SAVED_COLLECTION_TYPE_LIST.forEach(refreshCollectionSaveButtons);
    return loadPromise;
}

async function toggleSavedCollectionItem(collectionType, itemId, snapshot, shouldSave) {
    if (!SAVED_COLLECTION_TYPES.has(collectionType)) {
        throw new Error("This collection type is not supported.");
    }
    const normalizedId = String(itemId);
    const signedInUserId = currentSessionUser && currentSessionUser.id;
    if (!normalizedId || !snapshot || getCollectionItemId(collectionType, snapshot) !== normalizedId) {
        throw new Error("The saved item is missing its collection ID or data.");
    }
    if (!signedInUserId) {
        if (window.coucouSupabase && !authSessionResolved) {
            throw new Error("Checking your account session. Please try saving again in a moment.");
        }
        const localItems = getLocalSavedCollectionItems(collectionType);
        const existingIndex = localItems.findIndex((item) => getCollectionItemId(collectionType, item) === normalizedId);
        if (shouldSave && existingIndex < 0) localItems.push(snapshot);
        else if (!shouldSave && existingIndex >= 0) localItems.splice(existingIndex, 1);
        saveLocalCollectionItems(collectionType, localItems);
        renderSavedCollection(collectionType);
        return;
    }

    if (!window.coucouSupabase) {
        throw new Error("Saved collections are unavailable because Supabase is not connected.");
    }
    if (remoteSavedCollectionsUserId !== signedInUserId) {
        const loaded = await loadSavedCollectionsForUser({ id: signedInUserId });
        if (!loaded) throw new Error("Your saved collections could not be loaded. Please try again.");
    }
    if (!currentSessionUser || currentSessionUser.id !== signedInUserId) {
        throw new Error("Your account changed while saving. Please try again.");
    }

    const remoteItems = remoteSavedCollections[collectionType];
    const remoteIndex = remoteItems.findIndex((item) => getCollectionItemId(collectionType, item) === normalizedId);
    if (shouldSave && remoteIndex >= 0) return;
    if (!shouldSave && remoteIndex < 0) return;

    if (!shouldSave) {
        const { error } = await window.coucouSupabase
            .from("saved_collections")
            .delete()
            .eq("user_id", signedInUserId)
            .eq("collection_type", collectionType)
            .eq("item_id", normalizedId);
        if (error) throw error;
        remoteItems.splice(remoteIndex, 1);
    } else {
        const { error } = await window.coucouSupabase
            .from("saved_collections")
            .insert({
                user_id: signedInUserId,
                collection_type: collectionType,
                item_id: normalizedId,
                item_data: snapshot
            });
        if (error && error.code !== "23505") throw error;
        if (error) {
            if (!remoteItems.some((item) => getCollectionItemId(collectionType, item) === normalizedId)) {
                remoteItems.push(snapshot);
            }
        } else {
            remoteItems.push(snapshot);
        }
    }
    renderSavedCollection(collectionType);
}

function setCollectionSaveButtonState(button, collectionType, itemId) {
    const isSaved = isCollectionItemSaved(collectionType, itemId);
    button.classList.toggle("saved", isSaved);
    button.textContent = isSaved ? "Saved" : "Save";
    button.setAttribute("aria-pressed", String(isSaved));
}

async function handleSavedCollectionToggle(collectionType, itemId, snapshot, button) {
    const ownerId = currentSessionUser ? currentSessionUser.id : "browser";
    const key = `${ownerId}:${collectionType}:${String(itemId)}`;
    if (pendingSavedCollectionKeys.has(key)) return;
    pendingSavedCollectionKeys.add(key);
    document.querySelectorAll("[data-saved-collection-type]").forEach((saveButton) => {
        if (
            saveButton.dataset.savedCollectionType === collectionType &&
            saveButton.dataset.savedCollectionId === String(itemId)
        ) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }
    });
    try {
        if (currentSessionUser && remoteSavedCollectionsUserId !== currentSessionUser.id) {
            const loaded = await loadSavedCollectionsForUser(currentSessionUser);
            if (!loaded) throw new Error("Your saved collection could not be loaded. Check your connection and try again.");
        }
        const shouldSave = !isCollectionItemSaved(collectionType, itemId);
        await toggleSavedCollectionItem(collectionType, itemId, snapshot, shouldSave);
        updateSavedCollectionState(
            currentSessionUser
                ? shouldSave ? "Saved to your account." : "Removed from your account."
                : shouldSave ? "Saved for this session." : "Removed from this session.",
            false,
            collectionType
        );
    } catch (error) {
        updateSavedCollectionState(`Could not update this collection: ${error.message || "Please try again."}`, true, collectionType);
        console.error("[Collections] Saved collection update failed:", error);
    } finally {
        pendingSavedCollectionKeys.delete(key);
        document.querySelectorAll("[data-saved-collection-type]").forEach((saveButton) => {
            if (
                saveButton.dataset.savedCollectionType === collectionType &&
                saveButton.dataset.savedCollectionId === String(itemId)
            ) {
                setCollectionSaveButtonState(saveButton, collectionType, itemId);
                saveButton.disabled = false;
            }
        });
    }
}

function configureCollectionSaveButton(button, collectionType, itemId) {
    button.dataset.savedCollectionType = collectionType;
    button.dataset.savedCollectionId = String(itemId);
    setCollectionSaveButtonState(button, collectionType, itemId);
}

function createSavedItemRemoveButton(collectionType, item) {
    const itemId = getCollectionItemId(collectionType, item);
    const title = item.title || item.name || "item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-item-remove";
    button.textContent = "Remove";
    button.setAttribute("aria-label", `Remove ${title} from saved ${collectionType}`);
    button.addEventListener("click", () => {
        void handleSavedCollectionRemove(collectionType, itemId, item, button);
    });
    return button;
}

async function handleSavedCollectionRemove(collectionType, itemId, item, button) {
    const normalizedId = String(itemId);
    const ownerId = currentSessionUser ? currentSessionUser.id : "browser";
    const key = `${ownerId}:${collectionType}:${normalizedId}`;
    if (!normalizedId || pendingSavedCollectionKeys.has(key)) return;

    pendingSavedCollectionKeys.add(key);
    button.disabled = true;
    button.textContent = "Removing...";
    try {
        if (currentSessionUser && remoteSavedCollectionsUserId !== currentSessionUser.id) {
            const loaded = await loadSavedCollectionsForUser(currentSessionUser);
            if (!loaded) throw new Error("Your saved collection could not be loaded. Please try again.");
        }

        await toggleSavedCollectionItem(collectionType, normalizedId, item, false);

        if (currentSessionUser) {
            const localItems = getLocalSavedCollectionItems(collectionType);
            const localIndex = localItems.findIndex(
                (localItem) => getCollectionItemId(collectionType, localItem) === normalizedId
            );
            if (localIndex >= 0) {
                localItems.splice(localIndex, 1);
                saveLocalCollectionItems(collectionType, localItems);
                renderSavedCollection(collectionType);
            }
        }

        updateSavedCollectionState(
            currentSessionUser
                ? "Removed from your account."
                : "Removed from this session.",
            false,
            collectionType
        );
    } catch (error) {
        updateSavedCollectionState(`Could not remove this item: ${error.message || "Please try again."}`, true, collectionType);
        console.error("[Collections] Saved item removal failed:", error);
    } finally {
        pendingSavedCollectionKeys.delete(key);
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = "Remove";
        }
        refreshCollectionSaveButtons(collectionType);
    }
}

function getSavedMovieItems() {
    return getGuestCollectionItems(
        "movies",
        (item) => item && typeof item === "object" && typeof item.id === "string"
    );
}

function saveMovieItems(items) {
    setGuestCollectionItems("movies", items);
}

// Art is sourced live from Wikipedia (string page-title ids), so saved art
// is stored as full artist snapshots.
function getSavedArtItems() {
    return getGuestCollectionItems("art", (item) => item && typeof item === "object");
}

function saveArtItems(items) {
    setGuestCollectionItems("art", items);
}

function isArtSaved(artId) {
    return isCollectionItemSaved("art", artId);
}

function toggleArtSave(artId, snapshot) {
    return toggleSavedCollectionItem("art", artId, snapshot, !isCollectionItemSaved("art", artId));
}

// Books are sourced live from Open Library (string work keys), so saved
// books are stored as full snapshots rather than the old numeric ids.
function getSavedBookItems() {
    return getGuestCollectionItems("books", (item) => item && typeof item === "object");
}

function saveBookItems(items) {
    setGuestCollectionItems("books", items);
}

function isBookSaved(bookId) {
    return isCollectionItemSaved("books", bookId);
}

function toggleBookSave(bookId, snapshot) {
    return toggleSavedCollectionItem("books", bookId, snapshot, !isCollectionItemSaved("books", bookId));
}

// Music is sourced live from the MusicBrainz API (string MBIDs), so saved
// music is stored as full artist snapshots rather than numeric ids like the
// other sections.
function getSavedMusicItems() {
    return getGuestCollectionItems("music", (item) => item && typeof item === "object");
}

function saveMusicItems(items) {
    setGuestCollectionItems("music", items);
}

function isMusicSaved(mbid) {
    return isCollectionItemSaved("music", mbid);
}

function toggleMusicSave(mbid, snapshot) {
    return toggleSavedCollectionItem("music", mbid, snapshot, !isCollectionItemSaved("music", mbid));
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
    thumb.appendChild(createSavedItemRemoveButton("music", safeItem));

    return thumb;
}

function renderSavedMusic() {
    const list = document.getElementById("saved-music-list");
    if (!list) return;

    const savedMusic = getSavedCollectionItems("music");
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
    try {
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
    } catch (error) {
        console.warn("[MusicBrainz] Featured music fetch failed:", error.message);
        setMusicState("error", `Couldn't load featured artists from MusicBrainz. Please try again in a moment.`);
    }
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
    configureCollectionSaveButton(saveButton, "music", snapshot.mbid);
    saveButton.addEventListener("click", () => {
        void handleSavedCollectionToggle("music", snapshot.mbid, snapshot, saveButton);
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
        configureCollectionSaveButton(saveButton, "music", snapshot.mbid);
        saveButton.addEventListener("click", () => {
            void handleSavedCollectionToggle("music", snapshot.mbid, snapshot, saveButton);
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
    thumb.appendChild(createSavedItemRemoveButton("art", safeItem));

    return thumb;
}

function renderSavedArt() {
    renderSavedMoviesAndArt();
}

function renderSavedMoviesAndArt() {
    const list = document.getElementById("saved-movies-art-list");
    if (!list) return;

    const savedMovies = getSavedCollectionItems("movies");
    const savedArt = getSavedCollectionItems("art");
    list.innerHTML = "";

    if (savedMovies.length === 0 && savedArt.length === 0) {
        list.innerHTML = '<p id="empty-movies-art-message">Your saved movies and art will appear here.</p>';
        return;
    }

    savedMovies.forEach((movie) => {
        list.appendChild(createSavedMovieItem(movie));
    });
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
    const movieDescription = /^\d{4}\b.*\bfilm\b/i.test(snapshot.description);
    const movieTitle = /\(\d{4}\s+film\)$/i.test(snapshot.name);
    const collectionType = movieDescription || movieTitle ? "movies" : "art";
    const descriptionYear = snapshot.description.match(/^\d{4}/);
    const titleYear = snapshot.name.match(/\((\d{4})\s+film\)$/i);
    const savedSnapshot = collectionType === "movies"
        ? {
            ...snapshot,
            title: snapshot.name,
            year: (descriptionYear && descriptionYear[0]) || (titleYear && titleYear[1]) || "",
            posterUrl: snapshot.photoUrl || ""
        }
        : snapshot;
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
    configureCollectionSaveButton(saveButton, collectionType, snapshot.id);
    saveButton.addEventListener("click", () => {
        void handleSavedCollectionToggle(collectionType, snapshot.id, savedSnapshot, saveButton);
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
    configureCollectionSaveButton(saveButton, "art", snapshot.id);
    saveButton.addEventListener("click", () => {
        void handleSavedCollectionToggle("art", snapshot.id, snapshot, saveButton);
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
    thumb.appendChild(createSavedItemRemoveButton("books", safeItem));

    return thumb;
}

function renderSavedBooks() {
    const list = document.getElementById("saved-books-list");
    if (!list) return;

    const savedBooks = getSavedCollectionItems("books");
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
    configureCollectionSaveButton(saveButton, "books", bookItem.id);
    saveButton.addEventListener("click", () => {
        void handleSavedCollectionToggle("books", bookItem.id, bookItem, saveButton);
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
    configureCollectionSaveButton(saveButton, "books", bookItem.id);
    saveButton.addEventListener("click", () => {
        void handleSavedCollectionToggle("books", bookItem.id, bookItem, saveButton);
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
let discoverProfiles = [];

async function createCreatorCard(profile) {
    const card = document.createElement("article");
    card.className = "creator-card public-user-card";

    if (profile.avatar_path) {
        const avatar = document.createElement("img");
        avatar.className = "public-user-avatar";
        avatar.alt = "";
        if (profile.avatar_url) {
            avatar.src = profile.avatar_url;
            card.appendChild(avatar);
        }
    }

    const heading = document.createElement("h4");
    heading.textContent = profile.username ? `@${profile.username}` : "Coucou member";
    card.appendChild(heading);

    const bio = document.createElement("p");
    bio.className = "public-user-bio";
    bio.textContent = profile.bio || "";
    if (profile.bio) card.appendChild(bio);

    const state = publicSocialState.get(profile.public_id);
    const counts = document.createElement("p");
    counts.className = "public-user-counts";
    counts.textContent = `${state ? state.followers_count : 0} followers · ${state ? state.following_count : 0} following`;
    card.appendChild(counts);

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.dataset.userAction = "view";
    viewButton.dataset.publicId = profile.public_id;
    viewButton.textContent = "View Profile";
    card.appendChild(viewButton);

    if (currentSessionUser && profile.public_id !== (currentProfile && currentProfile.public_id)) {
        const followButton = document.createElement("button");
        followButton.type = "button";
        followButton.dataset.userAction = "follow";
        followButton.dataset.publicId = profile.public_id;
        followButton.setAttribute("aria-pressed", String(Boolean(state && state.is_following)));
        followButton.textContent = getFollowButtonLabel(state);
        card.appendChild(followButton);
    }
    return card;
}

async function renderCreators() {
    const grid = document.getElementById("creators-grid");
    if (!grid) return;
    grid.replaceChildren();

    if (!currentSessionUser || !window.coucouSupabase) {
        grid.textContent = "Sign in to discover Coucou members.";
        return;
    }
    if (!discoverProfiles.length) {
        grid.textContent = "No public Coucou members to show yet.";
        return;
    }

    for (const profile of discoverProfiles) {
        grid.appendChild(await createCreatorCard(profile));
    }
}

async function loadDiscoverUsers() {
    const grid = document.getElementById("creators-grid");
    if (!grid) return;
    if (!currentSessionUser || !window.coucouSupabase) {
        discoverProfiles = [];
        await renderCreators();
        return;
    }

    grid.textContent = "Loading Coucou members...";
    try {
        const { data, error } = await window.coucouSupabase.rpc("list_coucou_profiles");
        if (error) throw error;
        discoverProfiles = data || [];
        try {
            const avatarUrls = await getSignedMediaUrls(discoverProfiles.map((profile) => profile.avatar_path));
            discoverProfiles.forEach((profile) => {
                profile.avatar_url = avatarUrls.get(profile.avatar_path) || "";
            });
        } catch (error) {
            console.error("[Discover] Profile pictures could not be loaded:", error);
        }
        discoverProfiles.forEach((profile) => publicProfilesById.set(profile.public_id, profile));
        const discoverState = await loadPublicSocialState(discoverProfiles.map((profile) => profile.public_id));
        discoverState.forEach((state, publicId) => publicSocialState.set(publicId, state));
        await renderCreators();
    } catch (error) {
        grid.textContent = "Discover needs the latest Supabase migration. Apply the profile and social migration, then reload.";
        console.error("[Discover] Could not load registered profiles:", error);
    }
}

// Existing saved movies remain in the Movies collection.
function createSavedMovieItem(movie) {
    const card = document.createElement("article");
    card.className = "saved-item-thumb saved-movie-item";

    const poster = document.createElement("div");
    poster.className = "saved-item-poster saved-movie-poster";
    const posterUrl = movie.photoUrl || movie.posterUrl;
    if (posterUrl) {
        const image = document.createElement("img");
        image.src = posterUrl;
        image.alt = `${movie.title || movie.name || "Movie"} poster`;
        image.loading = "lazy";
        image.addEventListener("error", () => {
            image.remove();
            poster.textContent = "No image";
        }, { once: true });
        poster.appendChild(image);
    } else {
        poster.textContent = "No image";
    }

    const info = document.createElement("div");
    info.className = "saved-item-info";

    const title = document.createElement("h4");
    title.textContent = movie.title || movie.name || "Untitled";

    const description = document.createElement("p");
    const yearMatch = String(movie.description || "").match(/^\d{4}/);
    description.textContent = movie.year || (yearMatch && yearMatch[0]) || "Saved movie";

    info.appendChild(title);
    info.appendChild(description);
    card.appendChild(poster);
    card.appendChild(info);
    card.appendChild(createSavedItemRemoveButton("movies", movie));
    return card;
}

function renderSavedMovies() {
    renderSavedMoviesAndArt();
}
let currentSessionUser = null;
let authSessionResolved = !window.coucouSupabase;
let currentAuthMode = "sign-in";
let currentProfile = null;
let passwordRecoveryActive = false;
let passwordRecoveryInvalid = false;
let passwordRecoveryComplete = false;
let userSearchTimer = null;
let userSearchRequestId = 0;
let userSearchResults = [];
let publicProfilesById = new Map();
let publicSocialState = new Map();
let viewedPublicProfileId = null;
let profileAvatarLoadGeneration = 0;
let notificationsChannel = null;
let notificationsUserId = null;
let notificationsLoadGeneration = 0;

const notificationMessages = {
    new_follower: (notification) => `@${notification.actor_username || "someone"} started following you.`,
    follow_request: (notification) => `@${notification.actor_username || "someone"} requested to follow you.`,
    follow_request_accepted: (notification) => `@${notification.actor_username || "someone"} accepted your follow request.`,
    post_like: (notification) => `@${notification.actor_username || "someone"} liked one of your posts.`,
    post_comment: (notification) => `@${notification.actor_username || "someone"} commented on one of your posts.`
};

function setNotificationState(message, isError) {
    const state = document.getElementById("notifications-state");
    if (!state) return;
    state.textContent = message || "";
    state.classList.toggle("profile-auth-error", Boolean(isError));
}

function updateNotificationCount(count) {
    const button = document.getElementById("profile-notifications-button");
    const badge = document.getElementById("notification-count-badge");
    const unreadCount = Math.max(0, Number(count) || 0);
    if (badge) {
        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.hidden = unreadCount === 0;
    }
    if (button) {
        button.setAttribute(
            "aria-label",
            unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
        );
    }
}

function renderNotifications(notifications, unreadTotal) {
    const list = document.getElementById("notifications-list");
    const markAllButton = document.getElementById("notification-mark-all-button");
    if (!list) return;

    list.replaceChildren();
    const unreadCount = Number.isFinite(unreadTotal)
        ? unreadTotal
        : notifications.filter((notification) => !notification.read_at).length;
    if (markAllButton) markAllButton.hidden = unreadCount === 0;

    if (!notifications.length) {
        const empty = document.createElement("p");
        empty.className = "notification-state";
        empty.textContent = "You're all caught up.";
        list.appendChild(empty);
        return;
    }

    notifications.forEach((notification) => {
        const item = document.createElement("article");
        item.className = `notification-item${notification.read_at ? "" : " unread"}`;

        const copy = document.createElement("div");
        const message = document.createElement("p");
        const getMessage = notificationMessages[notification.notification_type];
        message.textContent = getMessage ? getMessage(notification) : "You have a new notification.";
        copy.appendChild(message);

        const createdAt = new Date(notification.created_at);
        if (!Number.isNaN(createdAt.getTime())) {
            const time = document.createElement("time");
            time.dateTime = createdAt.toISOString();
            time.textContent = createdAt.toLocaleString();
            copy.appendChild(time);
        }
        item.appendChild(copy);

        if (!notification.read_at) {
            const markRead = document.createElement("button");
            markRead.type = "button";
            markRead.dataset.notificationRead = notification.id;
            markRead.textContent = "Mark read";
            markRead.setAttribute("aria-label", "Mark notification as read");
            item.appendChild(markRead);
        } else {
            const readLabel = document.createElement("span");
            readLabel.className = "notification-read-label";
            readLabel.textContent = "Read";
            item.appendChild(readLabel);
        }

        list.appendChild(item);
    });
}

async function loadNotifications() {
    const userId = currentSessionUser && currentSessionUser.id;
    if (!window.coucouSupabase || !userId) return;

    const requestId = ++notificationsLoadGeneration;
    const [listResult, countResult] = await Promise.all([
        window.coucouSupabase
            .from("notifications")
            .select("id, actor_username, actor_public_id, notification_type, post_id, created_at, read_at")
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(50),
        window.coucouSupabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient_id", userId)
            .is("read_at", null)
    ]);

    if (requestId !== notificationsLoadGeneration ||
        !currentSessionUser ||
        currentSessionUser.id !== userId) return;

    if (listResult.error || countResult.error) {
        const error = listResult.error || countResult.error;
        setNotificationState(
            "Notifications are unavailable. Review and apply supabase-notifications-migration.sql, then reload.",
            true
        );
        console.error("[Notifications] Could not load notifications:", error);
        return;
    }

    updateNotificationCount(countResult.count || 0);
    renderNotifications(listResult.data || [], countResult.count || 0);
    setNotificationState("");
}

async function loadNotificationPreferences() {
    const state = document.getElementById("notification-preferences-state");
    if (!currentSessionUser || !window.coucouSupabase) return;

    const { data, error } = await window.coucouSupabase
        .from("notification_preferences")
        .select("new_followers_enabled, follow_requests_enabled, post_likes_enabled, post_comments_enabled")
        .eq("user_id", currentSessionUser.id)
        .maybeSingle();

    if (error) {
        if (state) {
            state.textContent = "Apply supabase-notifications-migration.sql to manage preferences.";
            state.classList.add("profile-auth-error");
        }
        console.error("[Notifications] Could not load preferences:", error);
        return;
    }

    const preferences = data || {};
    const controls = [
        ["notification-pref-followers", preferences.new_followers_enabled],
        ["notification-pref-follow-requests", preferences.follow_requests_enabled],
        ["notification-pref-post-likes", preferences.post_likes_enabled],
        ["notification-pref-post-comments", preferences.post_comments_enabled]
    ];
    controls.forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.checked = value === undefined ? true : Boolean(value);
    });
    if (state) {
        state.textContent = "";
        state.classList.remove("profile-auth-error");
    }
}

async function saveNotificationPreferences(event) {
    event.preventDefault();
    if (!currentSessionUser || !window.coucouSupabase) return;

    const state = document.getElementById("notification-preferences-state");
    const readChecked = (id) => Boolean(document.getElementById(id)?.checked);
    const { error } = await window.coucouSupabase
        .from("notification_preferences")
        .upsert({
            user_id: currentSessionUser.id,
            new_followers_enabled: readChecked("notification-pref-followers"),
            follow_requests_enabled: readChecked("notification-pref-follow-requests"),
            post_likes_enabled: readChecked("notification-pref-post-likes"),
            post_comments_enabled: readChecked("notification-pref-post-comments"),
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

    if (error) {
        if (state) {
            state.textContent = `Preferences could not be saved: ${error.message || "Please try again."}`;
            state.classList.add("profile-auth-error");
        }
        console.error("[Notifications] Could not save preferences:", error);
        return;
    }

    if (state) {
        state.textContent = "Notification preferences saved.";
        state.classList.remove("profile-auth-error");
    }
}

async function setNotificationsUser(user) {
    const button = document.getElementById("profile-notifications-button");
    const badge = document.getElementById("notification-count-badge");
    const panel = document.getElementById("notifications-panel");
    const profileCard = document.querySelector(".profile-card");
    const settings = document.getElementById("profile-account-settings");
    const userId = user && user.id;

    if (!userId || !window.coucouSupabase) {
        if (notificationsChannel) {
            void window.coucouSupabase?.removeChannel(notificationsChannel);
            notificationsChannel = null;
        }
        notificationsUserId = null;
        notificationsLoadGeneration += 1;
        if (button) button.hidden = true;
        if (badge) badge.hidden = true;
        if (panel) panel.hidden = true;
        if (profileCard) profileCard.hidden = false;
        if (settings) settings.hidden = true;
        renderNotifications([]);
        return;
    }

    if (notificationsUserId === userId && notificationsChannel) return;
    if (notificationsChannel) {
        void window.coucouSupabase.removeChannel(notificationsChannel);
        notificationsChannel = null;
    }
    notificationsUserId = userId;
    if (button) button.hidden = false;

    void loadNotifications();
    void loadNotificationPreferences();

    notificationsChannel = window.coucouSupabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`
        }, () => {
            void loadNotifications();
        })
        .subscribe((status) => {
            if (status === "SUBSCRIBED") {
                void loadNotifications();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.error("[Notifications] Realtime subscription failed:", status);
            }
        });
}

function openNotificationsPanel() {
    const profileCard = document.querySelector(".profile-card");
    const settings = document.getElementById("profile-account-settings");
    const settingsMenu = document.getElementById("profile-settings-menu");
    const panel = document.getElementById("notifications-panel");
    if (!currentSessionUser || !panel) return;

    if (settingsMenu) settingsMenu.hidden = true;
    if (settings) settings.hidden = true;
    if (profileCard) profileCard.hidden = true;
    panel.hidden = false;
    void loadNotifications();
}

function closeNotificationsPanel() {
    const profileCard = document.querySelector(".profile-card");
    const panel = document.getElementById("notifications-panel");
    if (panel) panel.hidden = true;
    if (profileCard) profileCard.hidden = false;
}

async function markNotificationRead(notificationId) {
    if (!currentSessionUser || !window.coucouSupabase || !notificationId) return;
    const { error } = await window.coucouSupabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("recipient_id", currentSessionUser.id)
        .is("read_at", null);

    if (error) {
        setNotificationState(`Could not mark notification as read: ${error.message || "Please try again."}`, true);
        console.error("[Notifications] Could not mark notification as read:", error);
        return;
    }
    void loadNotifications();
}

async function markAllNotificationsRead() {
    if (!currentSessionUser || !window.coucouSupabase) return;
    const { error } = await window.coucouSupabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", currentSessionUser.id)
        .is("read_at", null);

    if (error) {
        setNotificationState(`Could not mark notifications as read: ${error.message || "Please try again."}`, true);
        console.error("[Notifications] Could not mark all as read:", error);
        return;
    }
    void loadNotifications();
}

function initNotificationUi() {
    const bell = document.getElementById("profile-notifications-button");
    const backButton = document.getElementById("notifications-back-button");
    const markAllButton = document.getElementById("notification-mark-all-button");
    const list = document.getElementById("notifications-list");
    const preferencesForm = document.getElementById("notification-preferences-form");

    if (bell) bell.addEventListener("click", openNotificationsPanel);
    if (backButton) backButton.addEventListener("click", closeNotificationsPanel);
    if (markAllButton) markAllButton.addEventListener("click", () => void markAllNotificationsRead());
    if (preferencesForm) {
        preferencesForm.addEventListener("submit", (event) => {
            void saveNotificationPreferences(event);
        });
    }
    if (list) {
        list.addEventListener("click", (event) => {
            const button = event.target.closest("[data-notification-read]");
            if (button) void markNotificationRead(button.dataset.notificationRead);
        });
    }
}

async function getSignedMediaUrl(path) {
    if (!path || !window.coucouSupabase) return "";
    const { data, error } = await window.coucouSupabase
        .storage
        .from("coucou-media")
        .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
}

async function getSignedMediaUrls(paths) {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    if (!uniquePaths.length || !window.coucouSupabase) return new Map();
    const { data, error } = await window.coucouSupabase
        .storage.from("coucou-media")
        .createSignedUrls(uniquePaths, 3600);
    if (error) throw error;
    return new Map((data || []).map((image) => [image.path, image.signedUrl]));
}

function renderProfileAvatar(profile) {
    const image = document.getElementById("profile-picture-image");
    const placeholder = document.getElementById("profile-picture-placeholder");
    const generation = ++profileAvatarLoadGeneration;
    if (!image || !placeholder) return;
    image.hidden = true;
    image.removeAttribute("src");
    placeholder.hidden = false;
    if (!profile || !profile.avatar_path) return;

    void getSignedMediaUrl(profile.avatar_path).then((url) => {
        if (generation !== profileAvatarLoadGeneration || !url) return;
        image.src = url;
        image.hidden = false;
        placeholder.hidden = true;
    }).catch((error) => {
        console.error("[Profile] Could not load profile picture:", error);
    });
}

function getFollowButtonLabel(state) {
    if (state && state.is_following) return "Following";
    if (state && state.has_pending_request) return "Request sent";
    return "Follow";
}

function setProfileAuthState(message, isError) {
    const state = document.getElementById("profile-auth-state");
    if (!state) return;

    state.textContent = message || "";
    state.classList.toggle("profile-auth-error", Boolean(isError));
}

function getNormalizedUsername(username) {
    return (username || "").trim().replace(/^@+/, "");
}

function getPublicUsername(profile, user) {
    const username = profile && profile.username ? profile.username : null;
    if (username) return getNormalizedUsername(username);
    const metadata = user && user.user_metadata ? user.user_metadata : {};
    return getNormalizedUsername(metadata.username || "user");
}

function setUserSearchState(message, isError) {
    const state = document.getElementById("user-search-state");
    if (!state) return;
    state.textContent = message || "";
    state.classList.toggle("profile-auth-error", Boolean(isError));
}

function createPublicUserCard(profile, socialState, includeViewAction) {
    const card = document.createElement("article");
    card.className = "public-user-card";

    const heading = document.createElement("h4");
    heading.textContent = profile.username ? `@${profile.username}` : "Coucou member";
    card.appendChild(heading);

    const publicId = document.createElement("p");
    publicId.className = "public-user-id";
    publicId.textContent = `Coucou ID: ${profile.public_id}`;
    card.appendChild(publicId);

    if (profile.is_private) {
        const privacy = document.createElement("p");
        privacy.className = "private-profile-notice";
        privacy.textContent = "Private account";
        card.appendChild(privacy);
    }

    if (profile.bio) {
        const bio = document.createElement("p");
        bio.className = "public-user-bio";
        bio.textContent = profile.bio;
        card.appendChild(bio);
    }

    const counts = document.createElement("p");
    counts.className = "public-user-counts";
    counts.textContent = `${socialState ? socialState.followers_count : 0} followers · ${socialState ? socialState.following_count : 0} following`;
    card.appendChild(counts);

    if (includeViewAction) {
        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "public-user-view-button";
        viewButton.dataset.userAction = "view";
        viewButton.dataset.publicId = profile.public_id;
        viewButton.textContent = "View Profile";
        card.appendChild(viewButton);
    }

    if (currentSessionUser && profile.public_id !== (currentProfile && currentProfile.public_id)) {
        const followButton = document.createElement("button");
        followButton.type = "button";
        followButton.className = "public-user-follow-button";
        followButton.dataset.userAction = "follow";
        followButton.dataset.publicId = profile.public_id;
        followButton.setAttribute("aria-pressed", String(Boolean(socialState && socialState.is_following)));
        followButton.textContent = getFollowButtonLabel(socialState);
        card.appendChild(followButton);
    }

    return card;
}

function renderUserSearchResults() {
    const resultsContainer = document.getElementById("user-search-results");
    if (!resultsContainer) return;
    resultsContainer.replaceChildren();

    userSearchResults.forEach((profile) => {
        const state = publicSocialState.get(profile.public_id);
        resultsContainer.appendChild(createPublicUserCard(profile, state, true));
    });
}

function renderPublicProfileView(profile, socialState) {
    const profileView = document.getElementById("public-profile-view");
    if (!profileView) return;
    profileView.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = profile.username ? `@${profile.username}` : "Coucou member";
    profileView.appendChild(heading);
    const publicId = document.createElement("p");
    publicId.textContent = `Coucou ID: ${profile.public_id}`;
    profileView.appendChild(publicId);
    const canView = !profile.is_private || profile.can_view;
    if (profile.is_private && !canView) {
        const notice = document.createElement("p");
        notice.className = "private-profile-notice";
        notice.textContent = "This account is private. Send a follow request to see the profile and posts.";
        profileView.appendChild(notice);
    }
    if (profile.avatar_path && canView) {
        const avatar = document.createElement("img");
        avatar.className = "public-user-avatar";
        avatar.alt = "Profile picture";
        profileView.appendChild(avatar);
        void getSignedMediaUrl(profile.avatar_path).then((url) => {
            if (url && avatar.isConnected) avatar.src = url;
        }).catch((error) => console.error("[Profile] Could not load profile picture:", error));
    }
    if (profile.bio && canView) {
        const bio = document.createElement("p");
        bio.className = "public-profile-bio";
        bio.textContent = profile.bio;
        profileView.appendChild(bio);
    }

    const counts = document.createElement("p");
    counts.className = "public-user-counts";
    counts.textContent = `${socialState ? socialState.followers_count : 0} followers · ${socialState ? socialState.following_count : 0} following`;
    profileView.appendChild(counts);

    if (currentSessionUser && profile.public_id !== (currentProfile && currentProfile.public_id)) {
        const followButton = document.createElement("button");
        followButton.type = "button";
        followButton.className = "public-user-follow-button";
        followButton.dataset.userAction = "follow";
        followButton.dataset.publicId = profile.public_id;
        followButton.setAttribute("aria-pressed", String(Boolean(socialState && socialState.is_following)));
        followButton.textContent = getFollowButtonLabel(socialState);
        profileView.appendChild(followButton);
    }

    viewedPublicProfileId = profile.public_id;
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary-auth-button";
    backButton.textContent = "Back to results";
    backButton.addEventListener("click", () => {
        profileView.hidden = true;
        viewedPublicProfileId = null;
        document.getElementById("user-search-input")?.focus();
    }, { once: true });
    profileView.appendChild(backButton);
    profileView.hidden = false;
}

async function loadPublicSocialState(publicIds) {
    if (!window.coucouSupabase || !currentSessionUser || !publicIds.length) return new Map();
    const { data, error } = await window.coucouSupabase.rpc("get_coucou_social_state", {
        p_public_ids: publicIds
    });
    if (error) throw error;
    return new Map((data || []).map((row) => [row.public_id, row]));
}

async function searchPublicUsers() {
    const input = document.getElementById("user-search-input");
    const resultsContainer = document.getElementById("user-search-results");
    const profileView = document.getElementById("public-profile-view");
    if (!input || !resultsContainer) return;

    const requestId = ++userSearchRequestId;
    const query = getNormalizedUsername(input.value).trim();
    profileView.hidden = true;
    resultsContainer.replaceChildren();
    userSearchResults = [];
    publicProfilesById = new Map(discoverProfiles.map((profile) => [profile.public_id, profile]));

    if (!currentSessionUser) {
        setUserSearchState("Sign in to search for and follow people.", true);
        return;
    }
    if (query.length < 2 && !/^u_[a-f0-9]{16}$/i.test(query)) {
        setUserSearchState(query ? "Enter at least 2 characters to search usernames." : "");
        return;
    }

    setUserSearchState("Searching...");
    try {
        const { data, error } = await window.coucouSupabase.rpc("search_coucou_profiles", {
            p_query: query
        });
        if (requestId !== userSearchRequestId) return;
        if (error) throw error;

        const profilesByPublicId = new Map();
        (data || []).forEach((profile) => {
            if (
                profile.public_id &&
                profile.public_id !== (currentProfile && currentProfile.public_id)
            ) {
                profilesByPublicId.set(profile.public_id, profile);
            }
        });
        userSearchResults = Array.from(profilesByPublicId.values()).slice(0, 12);
        publicProfilesById = new Map(discoverProfiles.map((profile) => [profile.public_id, profile]));
        userSearchResults.forEach((profile) => publicProfilesById.set(profile.public_id, profile));
        const searchState = await loadPublicSocialState(userSearchResults.map((profile) => profile.public_id));
        searchState.forEach((state, publicId) => publicSocialState.set(publicId, state));
        if (requestId !== userSearchRequestId) return;
        renderUserSearchResults();
        setUserSearchState(userSearchResults.length ? `${userSearchResults.length} people found.` : "No matching people found.");
    } catch (error) {
        if (requestId !== userSearchRequestId) return;
        setUserSearchState(`Could not search users: ${error.message || "Please try again."}`, true);
    }
}

async function refreshPublicSocialState() {
    const publicIds = userSearchResults.map((profile) => profile.public_id);
    let ownPublicId = currentProfile && currentProfile.public_id;
    if (ownPublicId) publicIds.push(ownPublicId);
    if (!publicIds.length) {
        const profileState = document.getElementById("profile-social-state");
        if (currentSessionUser && profileState) {
            profileState.textContent = "Apply the Coucou profile and social migration to enable follower counts.";
        }
        return;
    }
    const latestState = await loadPublicSocialState(Array.from(new Set(publicIds)));
    latestState.forEach((state, publicId) => publicSocialState.set(publicId, state));
    renderUserSearchResults();
    await renderCreators();

    if (viewedPublicProfileId) await loadViewedPublicProfile(viewedPublicProfileId);
    const ownState = currentProfile && publicSocialState.get(currentProfile.public_id);
    const followers = document.getElementById("profile-follower-count");
    const following = document.getElementById("profile-following-count");
    const profileState = document.getElementById("profile-social-state");
    if (ownState && followers && following) {
        followers.textContent = String(ownState.followers_count);
        following.textContent = String(ownState.following_count);
        if (profileState) profileState.textContent = "";
    } else if (currentSessionUser && profileState) {
        profileState.textContent = "Follower counts are unavailable until the Coucou profile and social migration is applied.";
    }
}

async function loadViewedPublicProfile(publicId) {
    const profileView = document.getElementById("public-profile-view");
    try {
        const { data, error } = await window.coucouSupabase.rpc("get_coucou_profile", {
            p_public_id: publicId
        });
        if (error) throw error;
        const profile = data && data[0];
        if (!profile) {
            setUserSearchState("This profile is no longer available.", true);
            return;
        }
        publicProfilesById.set(publicId, profile);
        publicSocialState.set(publicId, {
            followers_count: profile.followers_count,
            following_count: profile.following_count,
            is_following: profile.is_following,
            has_pending_request: profile.has_pending_request
        });
        renderPublicProfileView(profile, publicSocialState.get(publicId));
        if (profileView) profileView.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        if (profileView) {
            profileView.hidden = false;
            profileView.textContent = `Could not load this profile: ${error.message || "Please try again."}`;
        }
    }
}

async function handlePublicUserAction(button) {
    const publicId = button.dataset.publicId;
    const profile = publicProfilesById.get(publicId);
    if (!profile) return;

    if (button.dataset.userAction === "view") {
        await loadViewedPublicProfile(publicId);
        return;
    }
    if (button.dataset.userAction !== "follow" || !currentSessionUser) return;

    const state = publicSocialState.get(publicId);
    const shouldFollow = !(state && state.is_following);
    button.disabled = true;
    button.textContent = shouldFollow ? "Sending request..." : "Unfollowing...";
    try {
        const action = state && state.has_pending_request
            ? "cancel_follow_request"
            : shouldFollow
                ? "request_follow_by_public_id"
                : "unfollow_user_by_public_id";
        const { error } = await window.coucouSupabase.rpc(action, { p_public_id: publicId });
        if (error) throw error;
        await refreshPublicSocialState();
        await loadDiscoverUsers();
        const updated = publicSocialState.get(publicId);
        const displayName = profile.username ? `@${profile.username}` : profile.public_id;
        setUserSearchState(
            updated && updated.is_following
                ? `Following ${displayName}.`
                : updated && updated.has_pending_request
                    ? `Follow request sent to ${displayName}.`
                    : `Follow status updated for ${displayName}.`
        );
    } catch (error) {
        button.disabled = false;
        button.textContent = getFollowButtonLabel(state);
        setUserSearchState(`Could not update follow status: ${error.message || "Please try again."}`, true);
    }
}

let followRequestsInitialized = false;

async function loadFollowRequests() {
    const list = document.getElementById("follow-requests-list");
    const state = document.getElementById("follow-requests-state");
    if (!list || !state) return;
    if (!currentSessionUser || !window.coucouSupabase || !currentProfile || !currentProfile.public_id) {
        list.replaceChildren();
        state.textContent = currentSessionUser
            ? "Apply the Coucou profile and social migration to manage follow requests."
            : "";
        return;
    }

    try {
        const { data, error } = await window.coucouSupabase.rpc("get_follow_requests");
        if (error) throw error;
        list.replaceChildren();
        (data || []).forEach((request) => {
            const item = document.createElement("div");
            item.className = "follow-request-item";
            item.dataset.publicId = request.public_id;
            const name = document.createElement("span");
            name.textContent = request.username ? `@${request.username}` : "Coucou member";
            item.appendChild(name);
            const actions = document.createElement("div");
            actions.className = "follow-request-actions";
            [["accept", "Accept"], ["decline", "Decline"]].forEach(([action, label]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.followRequestAction = action;
                button.textContent = label;
                actions.appendChild(button);
            });
            item.appendChild(actions);
            list.appendChild(item);
        });
        state.textContent = data && data.length ? `${data.length} pending follow request${data.length === 1 ? "" : "s"}.` : "No pending follow requests.";
    } catch (error) {
        state.textContent = `Follow requests could not be loaded: ${error.message || "Please try again."}`;
        console.error("[Follows] Could not load follow requests:", error);
    }
}

function initFollowRequests() {
    if (followRequestsInitialized) return;
    const list = document.getElementById("follow-requests-list");
    if (!list) return;
    followRequestsInitialized = true;
    list.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-follow-request-action]");
        const item = button && button.closest(".follow-request-item");
        if (!button || !item || !currentSessionUser) return;
        button.disabled = true;
        try {
            const { error } = await window.coucouSupabase.rpc("respond_follow_request", {
                p_public_id: item.dataset.publicId,
                p_accept: button.dataset.followRequestAction === "accept"
            });
            if (error) throw error;
            await Promise.all([loadFollowRequests(), refreshPublicSocialState()]);
        } catch (error) {
            button.disabled = false;
            const state = document.getElementById("follow-requests-state");
            if (state) state.textContent = `Could not update follow request: ${error.message || "Please try again."}`;
            console.error("[Follows] Could not update follow request:", error);
        }
    });
}

function initUserSearch() {
    const form = document.getElementById("user-search-form");
    const input = document.getElementById("user-search-input");
    const discoverSection = document.getElementById("discover");
    if (!form || !input || !discoverSection) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        window.clearTimeout(userSearchTimer);
        void searchPublicUsers();
    });
    input.addEventListener("input", () => {
        window.clearTimeout(userSearchTimer);
        userSearchRequestId += 1;
        userSearchTimer = window.setTimeout(() => void searchPublicUsers(), 350);
    });
    discoverSection.addEventListener("click", (event) => {
        const button = event.target.closest("[data-user-action]");
        if (!button || !discoverSection.contains(button)) return;
        void handlePublicUserAction(button);
    });
    void loadDiscoverUsers();
}

function renderPosts(posts) {
    const myPostsFeed = document.querySelector(".my-posts-feed");
    if (myPostsFeed) myPostsFeed.innerHTML = '<p id="empty-my-posts-message">Your posts will appear here.</p>';

    if (!posts || posts.length === 0) return;

    if (myPostsFeed) myPostsFeed.innerHTML = "";
    posts.forEach((post) => {
        if (myPostsFeed) myPostsFeed.appendChild(createPostElement(post));
    });
}

async function loadPostsFromSupabase() {
    if (!window.coucouSupabase) {
        renderPosts([]);
        return;
    }

    const mediaSchemaAvailable = Boolean(currentSessionUser && currentProfile && currentProfile.public_id);
    const basePostSelection = `
            id,
            author_id,
            text,
            created_at,
            author:profiles!posts_author_id_fkey(username),
            comments(id, post_id, author_id, text, created_at, commenter:profiles!comments_author_id_fkey(username))
        `;
    const mediaPostSelection = `
            id,
            author_id,
            text,
            image_paths,
            created_at,
            author:profiles!posts_author_id_fkey(username, avatar_path, public_id),
            comments(id, post_id, author_id, text, created_at, commenter:profiles!comments_author_id_fkey(username))
        `;
    let query = await window.coucouSupabase
        .from("posts")
        .select(mediaSchemaAvailable ? mediaPostSelection : basePostSelection)
        .order("created_at", { ascending: false });

    if (query.error && mediaSchemaAvailable) {
        query = await window.coucouSupabase
            .from("posts")
            .select(basePostSelection)
            .order("created_at", { ascending: false });
    }
    if (query.error) {
        query = await window.coucouSupabase
            .from("posts")
            .select("id, author_id, text, created_at, comments(id, post_id, author_id, text, created_at)")
            .order("created_at", { ascending: false });
    }
    if (query.error) {
        query = await window.coucouSupabase
            .from("posts")
            .select("id, author_id, text, created_at")
            .order("created_at", { ascending: false });
    }

    if (query.error) {
        console.error("[Posts] Supabase post load failed:", query.error.message);
        renderPosts([]);
        return;
    }

    const posts = query.data || [];
    if (posts.length) {
        const { data: likes, error: likesError } = await window.coucouSupabase
            .from("post_likes")
            .select("post_id, user_id")
            .in("post_id", posts.map((post) => post.id));

        if (likesError) {
            console.warn("[Posts] Persistent like data is unavailable:", likesError.message);
            posts.forEach((post) => {
                post.likes = 0;
                post.liked = false;
            });
        } else {
            const likeCounts = new Map();
            const likedPostIds = new Set();
            (likes || []).forEach((like) => {
                likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1);
                if (currentSessionUser && like.user_id === currentSessionUser.id) {
                    likedPostIds.add(like.post_id);
                }
            });
            posts.forEach((post) => {
                post.likes = likeCounts.get(post.id) || 0;
                post.liked = likedPostIds.has(post.id);
            });
        }
    }

    const mediaPaths = mediaSchemaAvailable
        ? Array.from(new Set(posts.flatMap((post) => post.image_paths || [])))
        : [];
    if (mediaPaths.length) {
        try {
            const { data: signedImages, error: signedImageError } = await window.coucouSupabase
                .storage.from("coucou-media")
                .createSignedUrls(mediaPaths, 3600);
            if (signedImageError) throw signedImageError;
            const urlsByPath = new Map((signedImages || []).map((image) => [image.path, image.signedUrl]));
            posts.forEach((post) => {
                post.image_urls = (post.image_paths || []).map((path) => urlsByPath.get(path)).filter(Boolean);
            });
        } catch (error) {
            console.error("[Posts] Post images could not be loaded:", error);
        }
    }
    renderPosts(posts);
    const postCount = document.getElementById("profile-post-count");
    if (postCount && currentSessionUser) {
        postCount.textContent = String(posts.filter((post) => post.author_id === currentSessionUser.id).length);
    } else if (postCount) {
        postCount.textContent = "0";
    }
}

async function loadUserProfile(user) {
    if (!user || !window.coucouSupabase) return null;

    const { data, error } = await window.coucouSupabase
        .from("profiles")
        .select("id, username, bio, age_confirmed, guidelines_accepted, privacy_accepted")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.warn("[Profile] Profile load failed:", error.message);
        return null;
    }

    const { data: extendedData, error: extendedError } = await window.coucouSupabase
        .from("profiles")
        .select("public_id, is_private, avatar_path")
        .eq("id", user.id)
        .maybeSingle();
    if (extendedError) {
        console.warn("[Profile] Privacy and media fields are not available yet:", extendedError.message);
        return { ...data, public_id: null, is_private: false, avatar_path: null };
    }

    return { ...data, ...extendedData };
}

// Auto-creates the profile row from signup metadata on first real session, so
// the user never has to type their username a second time after confirming email.
async function ensureProfileForUser(user) {
    if (!user || !window.coucouSupabase) return null;

    const profile = await loadUserProfile(user);
    if (profile && profile.username) return profile;

    const metadataUsername = getNormalizedUsername(user.user_metadata && user.user_metadata.username);
    if (!metadataUsername || !/^[A-Za-z0-9_]{3,30}$/.test(metadataUsername)) {
        return profile;
    }

    const { error } = await window.coucouSupabase
        .from("profiles")
        .upsert({
            id: user.id,
            username: metadataUsername,
            age_confirmed: true,
            guidelines_accepted: true,
            privacy_accepted: true,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.warn("[Profile] Auto-provision from signup metadata failed:", error.message);
        return profile;
    }

    return await loadUserProfile(user);
}

function updateProfileAuthUi(user, profile) {
    currentSessionUser = user || null;
    authSessionResolved = true;
    currentProfile = profile || null;
    void setNotificationsUser(user || null);

    const name = document.getElementById("profile-display-name");
    const handle = document.getElementById("profile-display-handle");
    const bio = document.getElementById("profile-bio");
    const signedOutView = document.getElementById("auth-signed-out-view");
    const usernameSetup = document.getElementById("profile-username-setup");
    const settingsToggle = document.getElementById("profile-settings-toggle");
    const settingsMenu = document.getElementById("profile-settings-menu");
    const accountSettings = document.getElementById("profile-account-settings");
    const accountEmailDisplay = document.getElementById("account-email-display");
    const settingsUsername = document.getElementById("settings-username");
    const settingsBio = document.getElementById("settings-bio");
    const settingsPrivateAccount = document.getElementById("settings-private-account");
    const profilePictureUploadButton = document.getElementById("profile-picture-upload-button");
    const confirmEmailTarget = document.getElementById("confirm-email-target");
    const confirmEmailInput = document.getElementById("delete-confirm-email-input");
    const confirmBtn = document.getElementById("confirm-delete-account-btn");
    const confirmBox = document.getElementById("delete-account-confirm-box");
    const followerCount = document.getElementById("profile-follower-count");
    const followingCount = document.getElementById("profile-following-count");
    const profileSocialState = document.getElementById("profile-social-state");

    if (settingsMenu) settingsMenu.hidden = true;
    if (accountSettings) accountSettings.hidden = true;
    if (confirmBox) confirmBox.hidden = true;
    if (confirmEmailInput) confirmEmailInput.value = "";
    if (confirmEmailTarget) confirmEmailTarget.textContent = user?.email || "";
    if (confirmBtn) confirmBtn.disabled = true;

    if (!user) {
        if (name) name.textContent = "Your Name";
        if (handle) handle.textContent = "@username";
        if (bio) bio.textContent = "Your bio will go here.";
        if (accountEmailDisplay) accountEmailDisplay.textContent = "";
        if (settingsUsername) settingsUsername.value = "";
        if (settingsBio) settingsBio.value = "";
        if (settingsPrivateAccount) settingsPrivateAccount.checked = false;
        if (profilePictureUploadButton) profilePictureUploadButton.hidden = true;
        renderProfileAvatar(null);
        if (signedOutView) signedOutView.hidden = false;
        if (usernameSetup) usernameSetup.hidden = true;
        if (settingsToggle) settingsToggle.hidden = true;
        if (followerCount) followerCount.textContent = "0";
        if (followingCount) followingCount.textContent = "0";
        if (profileSocialState) profileSocialState.textContent = "";
        void loadDiscoverUsers();
        void loadFollowRequests();
        if (!passwordRecoveryActive) {
            setUserSearchState("");
            userSearchResults = [];
            publicProfilesById = new Map();
            publicSocialState = new Map();
            const results = document.getElementById("user-search-results");
            if (results) results.replaceChildren();
        }
        if (passwordRecoveryActive) {
            passwordRecoveryActive = false;
            passwordRecoveryInvalid = true;
            const recoveryForm = document.getElementById("password-recovery-form");
            if (recoveryForm) recoveryForm.hidden = true;
            setProfileAuthState("This reset session is invalid or expired. Request a new password reset link.", true);
        } else if (passwordRecoveryInvalid) {
            setProfileAuthState("This password reset link is invalid or has expired. Request a new reset link.", true);
        } else {
            passwordRecoveryComplete = false;
            setProfileAuthState("");
        }
        void loadSavedCollectionsForUser(null);
        void loadPostsFromSupabase();
        return;
    }

    const metadata = user.user_metadata || {};
    const username = getPublicUsername(profile, user);
    const displayName = username || metadata.full_name || metadata.name || "User";

    if (name) name.textContent = displayName;
    if (handle) handle.textContent = "@" + username;
    if (bio) bio.textContent = profile && profile.bio ? profile.bio : "Your bio will go here.";
    if (accountEmailDisplay) accountEmailDisplay.textContent = user.email || "";
    if (settingsUsername) settingsUsername.value = username || "";
    if (settingsBio) settingsBio.value = profile && profile.bio ? profile.bio : "";
    if (settingsPrivateAccount) settingsPrivateAccount.checked = Boolean(profile && profile.is_private);
    if (profilePictureUploadButton) profilePictureUploadButton.hidden = false;
    renderProfileAvatar(profile);
    if (confirmEmailTarget) confirmEmailTarget.textContent = user?.email || "";
    if (signedOutView) signedOutView.hidden = true;
    if (settingsToggle) settingsToggle.hidden = false;
    if (usernameSetup) usernameSetup.hidden = Boolean(profile && profile.username);

    setProfileAuthState(
        passwordRecoveryActive
            ? "Enter and confirm your new password below."
            : passwordRecoveryComplete
            ? "Password updated successfully. You are signed in and can continue to your profile."
            : passwordRecoveryInvalid
                ? "This password reset link is invalid or has expired. Request a new reset link."
                : profile && profile.username
                ? "Signed in."
                : "Choose a username to finish your profile."
    );
    if (user) {
        void loadSavedCollectionsForUser(user);
        void loadDiscoverUsers();
        void refreshPublicSocialState().catch((error) => {
            if (profileSocialState) {
                profileSocialState.textContent = `Follower counts could not be loaded: ${error.message || "Please try again."}`;
            }
        });
        void loadFollowRequests();
    }
    void loadPostsFromSupabase();
}

async function saveUserProfile(username, bio, isPrivate) {
    if (!currentSessionUser || !window.coucouSupabase) return null;

    const normalizedUsername = getNormalizedUsername(username);
    if (!normalizedUsername) {
        setProfileAuthState("Username is required.", true);
        return null;
    }

    if (!/^[A-Za-z0-9_]{3,30}$/.test(normalizedUsername)) {
        setProfileAuthState("Username must be 3–30 letters, numbers, or underscores.", true);
        return null;
    }

    const profileUpdate = {
        id: currentSessionUser.id,
        username: normalizedUsername,
        bio: bio || null,
        age_confirmed: true,
        guidelines_accepted: true,
        privacy_accepted: true,
        updated_at: new Date().toISOString()
    };
    if (currentProfile && currentProfile.public_id) {
        profileUpdate.is_private = Boolean(isPrivate);
    } else if (isPrivate) {
        setProfileAuthState("Apply the Coucou profile and social migration before making your account private.", true);
        return null;
    }

    const { error } = await window.coucouSupabase
        .from("profiles")
        .upsert(profileUpdate);

    if (error) {
        setProfileAuthState(error.code === "23505" ? "That username is already taken." : error.message, true);
        return null;
    }

    const profile = await loadUserProfile(currentSessionUser);
    updateProfileAuthUi(currentSessionUser, profile);
    return profile;
}

async function uploadProfilePicture(file) {
    if (!currentSessionUser || !window.coucouSupabase) {
        setProfileAuthState("Sign in to upload a profile picture.", true);
        return;
    }
    if (!currentProfile || !currentProfile.public_id) {
        setProfileAuthState("Apply the Coucou profile and social migration before uploading a profile picture.", true);
        return;
    }
    if (!file || !SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
        setProfileAuthState("Choose a supported image smaller than 10 MB.", true);
        return;
    }

    const image = document.getElementById("profile-picture-image");
    const placeholder = document.getElementById("profile-picture-placeholder");
    const previewUrl = URL.createObjectURL(file);
    if (image && placeholder) {
        image.src = previewUrl;
        image.hidden = false;
        placeholder.hidden = true;
    }

    const oldPath = currentProfile.avatar_path;
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${currentSessionUser.id}/avatars/${crypto.randomUUID()}.${extension}`;
    setProfileAuthState("Uploading profile picture...");
    try {
        const { error: uploadError } = await window.coucouSupabase
            .storage.from("coucou-media")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        const { error: profileError } = await window.coucouSupabase
            .from("profiles")
            .update({ avatar_path: path })
            .eq("id", currentSessionUser.id);
        if (profileError) {
            await window.coucouSupabase.storage.from("coucou-media").remove([path]);
            throw profileError;
        }

        currentProfile = await loadUserProfile(currentSessionUser);
        updateProfileAuthUi(currentSessionUser, currentProfile);
        setProfileAuthState("Profile picture updated.");
        if (oldPath && oldPath !== path) {
            const { error: removeError } = await window.coucouSupabase
                .storage.from("coucou-media")
                .remove([oldPath]);
            if (removeError) console.warn("[Profile] Old profile picture cleanup failed:", removeError.message);
        }
    } catch (error) {
        renderProfileAvatar(currentProfile);
        setProfileAuthState(`Profile picture could not be uploaded: ${error.message || "Please try again."}`, true);
    } finally {
        URL.revokeObjectURL(previewUrl);
    }
}

function initProfileMedia() {
    const uploadButton = document.getElementById("profile-picture-upload-button");
    const fileInput = document.getElementById("profile-picture-input");
    if (!uploadButton || !fileInput) return;
    uploadButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) void uploadProfilePicture(file);
    });
}

async function submitProfileAuth(action) {
    const emailInput = document.getElementById("profile-auth-email");
    const passwordInput = document.getElementById("profile-auth-password");
    const usernameInput = document.getElementById("profile-auth-username");
    const ageCheck = document.getElementById("auth-age-check");
    const communityCheck = document.getElementById("auth-community-check");
    const privacyCheck = document.getElementById("auth-privacy-check");
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
    let username = "";

    if (signUp) {
        username = getNormalizedUsername(usernameInput && usernameInput.value);
        if (!username || !/^[A-Za-z0-9_]{3,30}$/.test(username)) {
            setProfileAuthState("Choose a public username with 3–30 letters, numbers, or underscores.", true);
            return;
        }
        if (!ageCheck.checked || !communityCheck.checked || !privacyCheck.checked) {
            setProfileAuthState("Please confirm your age and accept the guidelines and privacy policy.", true);
            return;
        }
    }

    setProfileAuthState(signUp ? "Creating account..." : "Signing in...");

    try {
        const result = signUp
            ? await window.coucouSupabase.auth.signUp({
                  email,
                  password,
                  options: {
                      emailRedirectTo: window.COUCOU_AUTH_REDIRECT_URL || "https://balpreet192.github.io/Coucou/",
                      data: {
                          username,
                          age_confirmed: true,
                          guidelines_accepted: true,
                          privacy_accepted: true
                      }
                  }
              })
            : await window.coucouSupabase.auth.signInWithPassword({ email, password });

        if (result.error) {
            setProfileAuthState(result.error.message, true);
            return;
        }

        passwordInput.value = "";
        if (signUp) {
            setProfileAuthState(
                result.data.session
                    ? "Account created! Setting up your profile..."
                    : "Account created. Check your email to confirm, then sign in."
            );
        }
    } catch (error) {
        setProfileAuthState("Unable to complete authentication. Please try again.", true);
        console.error("[Auth] Authentication request failed:", error);
    }
}

function readRecoveryUrlError() {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return searchParams.get("error") || hashParams.get("error") ||
        searchParams.get("error_code") || hashParams.get("error_code") ||
        searchParams.get("error_description") || hashParams.get("error_description");
}

function showPasswordRecoveryForm(message, isError) {
    passwordRecoveryActive = true;
    passwordRecoveryInvalid = false;
    passwordRecoveryComplete = false;
    activateContentSection("profile");
    const recoveryForm = document.getElementById("password-recovery-form");
    const forgotForm = document.getElementById("forgot-password-form");
    if (recoveryForm) recoveryForm.hidden = false;
    if (forgotForm) forgotForm.hidden = true;
    document.getElementById("recovery-new-password")?.focus();
    if (isError) passwordRecoveryInvalid = true;
    setProfileAuthState(message || "Enter a new password for your account.", isError);
}

function initPasswordRecoveryForms() {
    const signInForm = document.getElementById("profile-auth-form");
    const forgotLink = document.getElementById("forgot-password-link");
    const forgotForm = document.getElementById("forgot-password-form");
    const emailInput = document.getElementById("recovery-email");
    const cancelRequest = document.getElementById("cancel-recovery-request");
    const sendButton = document.getElementById("send-recovery-email-button");
    const recoveryForm = document.getElementById("password-recovery-form");
    const finishButton = document.getElementById("finish-password-recovery");

    if (forgotLink && forgotForm && signInForm) {
        forgotLink.addEventListener("click", () => {
            const signInEmail = document.getElementById("profile-auth-email");
            if (emailInput && signInEmail) emailInput.value = signInEmail.value.trim();
            signInForm.hidden = true;
            forgotLink.hidden = true;
            forgotForm.hidden = false;
            emailInput?.focus();
            setProfileAuthState("");
        });
    }

    if (cancelRequest && forgotForm && signInForm && forgotLink) {
        cancelRequest.addEventListener("click", () => {
            forgotForm.hidden = true;
            signInForm.hidden = false;
            forgotLink.hidden = false;
            setProfileAuthState("");
            document.getElementById("profile-auth-email")?.focus();
        });
    }

    if (forgotForm && emailInput && sendButton) {
        forgotForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!emailInput.validity.valid) {
                emailInput.reportValidity();
                return;
            }
            if (!window.coucouSupabase) {
                setProfileAuthState("Password recovery is unavailable right now. Please try again later.", true);
                return;
            }

            sendButton.disabled = true;
            setProfileAuthState("Sending reset request...");
            try {
                const { error } = await window.coucouSupabase.auth.resetPasswordForEmail(
                    emailInput.value.trim(),
                    { redirectTo: window.COUCOU_AUTH_REDIRECT_URL || "https://balpreet192.github.io/Coucou/" }
                );
                if (error) {
                    setProfileAuthState("We could not submit the reset request right now. Please try again later.", true);
                    console.error("[Auth] Password recovery request failed:", error.message);
                    return;
                }
                setProfileAuthState("If an account exists for that email, a password reset link will be sent.");
                forgotForm.hidden = true;
                signInForm.hidden = false;
                forgotLink.hidden = false;
                emailInput.value = "";
            } catch (error) {
                setProfileAuthState("We could not submit the reset request because of a network error. Please try again.", true);
                console.error("[Auth] Password recovery request failed:", error);
            } finally {
                sendButton.disabled = false;
            }
        });
    }

    if (recoveryForm) {
        recoveryForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const newPasswordInput = document.getElementById("recovery-new-password");
            const confirmPasswordInput = document.getElementById("recovery-confirm-password");
            const submitButton = document.getElementById("update-recovery-password-button");
            const newPassword = newPasswordInput ? newPasswordInput.value : "";
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";
            if (!newPasswordInput || !confirmPasswordInput || !submitButton) return;
            if (newPassword.length < 6) {
                setProfileAuthState("Password must be at least 6 characters.", true);
                newPasswordInput.focus();
                return;
            }
            if (newPassword !== confirmPassword) {
                setProfileAuthState("The passwords do not match. Please try again.", true);
                confirmPasswordInput.focus();
                return;
            }
            if (!passwordRecoveryActive || !currentSessionUser || !window.coucouSupabase) {
                setProfileAuthState("This reset session is invalid or expired. Request a new password reset link.", true);
                return;
            }

            submitButton.disabled = true;
            setProfileAuthState("Updating your password...");
            try {
                const { error } = await window.coucouSupabase.auth.updateUser({ password: newPassword });
                if (error) {
                    setProfileAuthState(`Your password was not updated: ${error.message}`, true);
                    return;
                }
                newPasswordInput.value = "";
                confirmPasswordInput.value = "";
                recoveryForm.hidden = true;
                passwordRecoveryActive = false;
                passwordRecoveryComplete = true;
                setProfileAuthState("Password updated successfully. You are signed in and can continue to your profile.");
            } catch (error) {
                setProfileAuthState(`Your password could not be updated: ${error.message || "Please check your connection and try again."}`, true);
                console.error("[Auth] Password update failed:", error);
            } finally {
                submitButton.disabled = false;
            }
        });
    }

    if (finishButton && recoveryForm) {
        finishButton.addEventListener("click", () => {
            recoveryForm.hidden = true;
            passwordRecoveryActive = false;
            setProfileAuthState("You can update your password later in account settings.");
        });
    }

    const recoveryError = readRecoveryUrlError();
    if (recoveryError) {
        passwordRecoveryInvalid = true;
        activateContentSection("profile");
        setProfileAuthState("This password reset link is invalid or has expired. Request a new reset link.", true);
    }
}

function initProfileAuth() {
    const form = document.getElementById("profile-auth-form");
    const signOutButton = document.getElementById("profile-sign-out");
    const togglePassBtn = document.getElementById("toggle-password-btn");
    const tabSignIn = document.getElementById("auth-tab-sign-in");
    const tabSignUp = document.getElementById("auth-tab-sign-up");
    const submitBtn = document.getElementById("auth-submit-btn");
    const signupFields = document.getElementById("auth-sign-up-fields");
    const settingsToggle = document.getElementById("profile-settings-toggle");
    const settingsMenu = document.getElementById("profile-settings-menu");
    const openSettingsButton = document.getElementById("open-account-settings-btn");
    const accountSettings = document.getElementById("profile-account-settings");
    const usernameSetupButton = document.getElementById("save-username-btn");
    const profileForm = document.getElementById("account-profile-form");
    const passwordForm = document.getElementById("account-password-form");
    const deleteAccountBtn = document.getElementById("profile-delete-account-btn");
    const cancelDeleteBtn = document.getElementById("cancel-delete-account-btn");
    const confirmDeleteBtn = document.getElementById("confirm-delete-account-btn");
    const confirmEmailInput = document.getElementById("delete-confirm-email-input");
    const deleteConfirmBox = document.getElementById("delete-account-confirm-box");
    initPasswordRecoveryForms();
    initFollowRequests();
    initNotificationUi();
    initProfileMedia();

    if (!form || !signOutButton) return;

    const setAuthMode = (mode) => {
        currentAuthMode = mode;
        const signUpMode = mode === "sign-up";
        const forgotLink = document.getElementById("forgot-password-link");
        const forgotForm = document.getElementById("forgot-password-form");
        if (signupFields) signupFields.hidden = !signUpMode;
        if (tabSignIn) tabSignIn.classList.toggle("active", !signUpMode);
        if (tabSignUp) tabSignUp.classList.toggle("active", signUpMode);
        if (submitBtn) submitBtn.textContent = signUpMode ? "Create account" : "Sign in";
        if (signUpMode) {
            if (forgotForm) forgotForm.hidden = true;
            form.hidden = false;
            if (forgotLink) forgotLink.hidden = true;
        } else {
            if (forgotLink) forgotLink.hidden = false;
        }
    };

    if (tabSignIn) tabSignIn.addEventListener("click", () => setAuthMode("sign-in"));
    if (tabSignUp) tabSignUp.addEventListener("click", () => setAuthMode("sign-up"));
    setAuthMode(currentAuthMode);

    if (togglePassBtn) {
        togglePassBtn.addEventListener("click", () => {
            const passInput = document.getElementById("profile-auth-password");
            if (!passInput) return;
            const isPassword = passInput.type === "password";
            passInput.type = isPassword ? "text" : "password";
            togglePassBtn.textContent = isPassword ? "🙈" : "👁️";
        });
    }

    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.passwordToggle);
            if (!input) return;
            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            button.textContent = isPassword ? "🙈" : "👁️";
        });
    });

    if (settingsToggle && settingsMenu) {
        settingsToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            settingsMenu.hidden = !settingsMenu.hidden;
        });
        document.addEventListener("click", (event) => {
            if (!settingsMenu.hidden && !settingsMenu.contains(event.target) && event.target !== settingsToggle) {
                settingsMenu.hidden = true;
            }
        });
    }

    if (openSettingsButton && accountSettings && settingsMenu) {
        openSettingsButton.addEventListener("click", () => {
            settingsMenu.hidden = true;
            accountSettings.hidden = false;
            accountSettings.scrollIntoView({ behavior: "smooth", block: "start" });
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

    if (usernameSetupButton) {
        usernameSetupButton.addEventListener("click", async () => {
            const usernameInput = document.getElementById("profile-username-input");
            await saveUserProfile(usernameInput ? usernameInput.value : "", "");
        });
    }

    if (profileForm) {
        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const usernameInput = document.getElementById("settings-username");
            const bioInput = document.getElementById("settings-bio");
            const privateInput = document.getElementById("settings-private-account");
            const profile = await saveUserProfile(
                usernameInput ? usernameInput.value : "",
                bioInput ? bioInput.value : "",
                privateInput && privateInput.checked
            );
            if (profile) setProfileAuthState("Profile saved.");
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const passwordInput = document.getElementById("settings-password");
            const newPassword = passwordInput ? passwordInput.value : "";
            if (newPassword.length < 6) {
                setProfileAuthState("Password must be at least 6 characters.", true);
                return;
            }
            const { error } = await window.coucouSupabase.auth.updateUser({ password: newPassword });
            if (error) {
                setProfileAuthState(error.message, true);
                return;
            }
            if (passwordInput) passwordInput.value = "";
            setProfileAuthState("Password updated.");
        });
    }

    if (deleteAccountBtn && deleteConfirmBox) {
        deleteAccountBtn.addEventListener("click",() => {
            deleteConfirmBox.hidden = false;
            if (confirmEmailInput) {
                confirmEmailInput.value = "";
                confirmEmailInput.focus();
            } 
            if (confirmDeleteBtn) {
                confirmDeleteBtn.disabled = true;
            }
        });
    }
     if (cancelDeleteBtn && deleteConfirmBox) {
        cancelDeleteBtn.addEventListener("click", () => {
            deleteConfirmBox.hidden = true;
            if (confirmEmailInput) {
                confirmEmailInput.value = "";
            }
            if (confirmDeleteBtn) {
                confirmDeleteBtn.disabled = true;
            }
        });
     }
     if (confirmEmailInput && confirmDeleteBtn) {
        confirmEmailInput.addEventListener("input", () => {
            const enteredEmail = confirmEmailInput.value.trim().toLowerCase();
            const expectedEmail = (currentSessionUser?.email || "").trim().toLowerCase();
            confirmDeleteBtn.disabled = !(expectedEmail && enteredEmail === expectedEmail);
        });
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async () => {
            confirmDeleteBtn.disabled = true;
            const { 
                data: { user }
            } = await 
            window.coucouSupabase?.auth?.getUser() || { data: { user: null } };
            const enteredEmail = confirmEmailInput?.value.trim().toLowerCase() || "";
            const expectedEmail = user?.email?.trim().toLowerCase() || "";
            if (!user || !expectedEmail || enteredEmail !== expectedEmail) {
                setProfileAuthState("Please enter your account email correctly.", true);
                confirmDeleteBtn.disabled = false;
                return;
            }
            let deleteSuccess = false;
            const { error: fnError } = await window.coucousupabase.functions.invoke("delete-account");
            if (!fnError) {
                deleteSuccess = true;
            } else {
                setProfileAuthState("Account deletion failed: " + fnError.message, true);
                console.error("[Account delete] Deletion failed:", fnError);
                confirmDeleteBtn.disabled = false;
                return;
            }
            if (deleteSuccess) { await window.coucousupabase.auth.signOut();
                deleteConfirmBox.hidden = true;
                updateProfileAuthState("Your account has been permanently deleted.");
            } 
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
                    const { error: fnError } = await window.coucousupabase.functions.invoke("delete-account");
                    if (!fnError) {
                        deleteSuccess = true;
                    } else {
                        setProfileAuthState("Account deletion failed: " + fnError.message, true);
                        console.error("[Account delete] Deletion failed:", fnError);
                        confirmDeleteBtn.disabled = false;
                        return;
                    }

                    if (deleteSuccess) {
                        await window.coucousupabase.auth.signOut();
                        updateProfileAuthState("Your account has been permanently deleted.");
                    }
                }
            } catch (err) {
                setProfileAuthState("Account deletion failed: " + (err.message || err), true);
                console.error("[Account Delete] Error:", err);
                confirmDeleteBtn.disabled = false;
            }
        });
    }

    window.coucouSupabase.auth.getSession()
        .then(async ({ data, error }) => {
            authSessionResolved = true;
            if (error) {
                setProfileAuthState(error.message, true);
                return;
            }
            const user = data.session && data.session.user;
            const profile = user ? await ensureProfileForUser(user) : null;
            updateProfileAuthUi(user, profile);
        })
        .catch((error) => {
            authSessionResolved = true;
            setProfileAuthState("Unable to check authentication status.", true);
            console.error("[Auth] Session check failed:", error);
        });

    window.coucouSupabase.auth.onAuthStateChange((event, session) => {
        authSessionResolved = true;
        currentSessionUser = session && session.user ? session.user : null;
        const nativePasswordRecovery = window.COUCOU_PASSWORD_RECOVERY_PENDING && event === "SIGNED_IN";
        if ((event === "PASSWORD_RECOVERY" || nativePasswordRecovery) && session && session.user) {
            currentSessionUser = session.user;
            window.COUCOU_PASSWORD_RECOVERY_PENDING = false;
            showPasswordRecoveryForm("Enter a new password for your account.");
        } else if (event === "PASSWORD_RECOVERY") {
            passwordRecoveryInvalid = true;
            passwordRecoveryActive = false;
            const recoveryForm = document.getElementById("password-recovery-form");
            if (recoveryForm) recoveryForm.hidden = true;
            activateContentSection("profile");
            setProfileAuthState("This reset session is invalid or expired. Request a new password reset link.", true);
        }
        void (async () => {
            try {
                const user = session && session.user;
                const profile = user ? await ensureProfileForUser(user) : null;
                updateProfileAuthUi(user, profile);
            } catch (error) {
                setProfileAuthState("Unable to load your account profile. Please try again.", true);
                console.error("[Auth] Authentication state update failed:", error);
            }
        })();
    });
}

async function syncPostToSupabase(postData) {
    if (!window.coucouSupabase || !currentSessionUser) return null;

    const newPost = {
        id: postData.id,
        author_id: currentSessionUser.id,
        text: postData.text,
        image_paths: postData.image_paths || []
    };
    let result = await window.coucouSupabase
        .from("posts")
        .insert(newPost)
        .select("id, author_id, text, image_paths, created_at")
        .single();

    if (result.error && !newPost.image_paths.length && /image_paths|column/i.test(result.error.message || "")) {
        result = await window.coucouSupabase
            .from("posts")
            .insert({ id: postData.id, author_id: currentSessionUser.id, text: postData.text })
            .select("id, author_id, text, created_at")
            .single();
    }
    if (result.error) {
        console.error("[Posts] Supabase post sync failed:", result.error);
        throw result.error;
    }
    return result.data;
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

    if (postData.image_paths && postData.image_paths.length) {
        const { error: mediaError } = await window.coucouSupabase
            .storage.from("coucou-media")
            .remove(postData.image_paths);
        if (mediaError) console.error("[Posts] Deleted post media cleanup failed:", mediaError.message);
    }
    void loadPostsFromSupabase();
}

async function handlePostEdit(postData, contentElement) {
    if (!window.coucouSupabase || !currentSessionUser || postData.author_id !== currentSessionUser.id) return;
    const nextText = window.prompt("Edit your caption", postData.text || "");
    if (nextText === null || nextText === postData.text) return;
    if (!nextText.trim() && !(postData.image_paths && postData.image_paths.length)) {
        setProfileAuthState("A post needs text or at least one photo.", true);
        return;
    }

    const { error } = await window.coucouSupabase
        .from("posts")
        .update({ text: nextText })
        .eq("id", postData.id);
    if (error) {
        setProfileAuthState(`Post could not be updated: ${error.message}`, true);
        console.error("[Posts] Supabase post update failed:", error);
        return;
    }
    postData.text = nextText;
    if (contentElement) contentElement.textContent = nextText;
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
    const commenterUsername = commentObj.commenter && commentObj.commenter.username
        ? getNormalizedUsername(commentObj.commenter.username)
        : "user";
    textSpan.textContent = "@" + commenterUsername + ": " + commentObj.text;
    commentItem.appendChild(textSpan);

    const isCommentOwner = currentSessionUser && commentObj.author_id && commentObj.author_id === currentSessionUser.id;
    const isPostOwner = currentSessionUser && postData.author_id && postData.author_id === currentSessionUser.id;

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

async function togglePostLike(postData, postElement, likeButton, likeCount) {
    if (!currentSessionUser || !window.coucouSupabase) {
        setProfileAuthState("Sign in to like posts.", true);
        return;
    }

    likeButton.disabled = true;
    const wasLiked = postElement.dataset.liked === "true";
    try {
        let result;
        if (wasLiked) {
            result = await window.coucouSupabase
                .from("post_likes")
                .delete()
                .eq("post_id", postData.id)
                .eq("user_id", currentSessionUser.id);
        } else {
            result = await window.coucouSupabase
                .from("post_likes")
                .insert({ post_id: postData.id, user_id: currentSessionUser.id });
        }

        if (result.error) throw result.error;
    } catch (error) {
        const errorMessage = error && error.message ? error.message : "Please try again.";
        setProfileAuthState(
            /post_likes|relation|table/i.test(errorMessage)
                ? "Post likes require supabase-notifications-migration.sql. Review and apply it in Supabase SQL Editor."
                : `Your like could not be saved: ${errorMessage}`,
            true
        );
        console.error("[Posts] Post like could not be saved:", error);
        return;
    } finally {
        likeButton.disabled = false;
    }

    const nextLiked = !wasLiked;
    const nextCount = Math.max(0, Number(postElement.dataset.likes || 0) + (nextLiked ? 1 : -1));
    postElement.dataset.liked = String(nextLiked);
    postElement.dataset.likes = String(nextCount);
    postData.liked = nextLiked;
    postData.likes = nextCount;
    likeButton.classList.toggle("liked", nextLiked);
    likeButton.setAttribute("aria-pressed", String(nextLiked));
    likeCount.textContent = String(nextCount);
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
    const postUsername = postData.author && postData.author.username
        ? getNormalizedUsername(postData.author.username)
        : "user";
    name.textContent = "@" + postUsername;

    const time = document.createElement("span");
    time.textContent = " • Just now";

    header.appendChild(name);
    header.appendChild(time);

    if (currentSessionUser && isUserPostAuthor(postData, currentSessionUser)) {
        const editPostBtn = document.createElement("button");
        editPostBtn.type = "button";
        editPostBtn.className = "post-edit-btn";
        editPostBtn.textContent = "Edit";
        editPostBtn.addEventListener("click", () => {
            void handlePostEdit(postData, content);
        });
        header.appendChild(editPostBtn);

        const deletePostBtn = document.createElement("button");
        deletePostBtn.type = "button";
        deletePostBtn.className = "post-delete-btn";
        deletePostBtn.title = "Delete post";
        deletePostBtn.textContent = "Delete";
        deletePostBtn.addEventListener("click", () => {
            void handlePostDelete(postData, post);
        });
        header.appendChild(deletePostBtn);
    }

    const imageUrls = Array.isArray(postData.image_urls) ? postData.image_urls : [];
    if (imageUrls.length) {
        const gallery = document.createElement("div");
        gallery.className = "post-image-gallery";
        imageUrls.forEach((url, index) => {
            const image = document.createElement("img");
            image.src = url;
            image.alt = `Post photo ${index + 1}`;
            image.loading = "lazy";
            gallery.appendChild(image);
        });
        post.appendChild(gallery);
    }

    const content = document.createElement("p");
    content.className = "post-content";
    content.textContent = postData.text || "";
    if (!postData.text) content.hidden = true;

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
        void togglePostLike(postData, post, likeButton, likeCount);
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
    if (postData.text) post.appendChild(content);
    post.appendChild(actions);
    post.appendChild(commentsWrap);

    return post;
}

const MAX_POST_PHOTOS = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/gif"
]);
let selectedPostPhotos = [];

function setPostMediaState(message, isError) {
    const state = document.getElementById("post-media-state");
    if (!state) return;
    state.textContent = message || "";
    state.classList.toggle("error", Boolean(isError));
}

function renderPostImagePreview() {
    const preview = document.getElementById("post-image-preview");
    if (!preview) return;
    preview.replaceChildren();

    selectedPostPhotos.forEach((photo, index) => {
        const item = document.createElement("div");
        item.className = "post-image-preview-item";
        const image = document.createElement("img");
        image.src = photo.previewUrl;
        image.alt = `Selected photo ${index + 1}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
        remove.addEventListener("click", () => {
            URL.revokeObjectURL(photo.previewUrl);
            selectedPostPhotos = selectedPostPhotos.filter((selected) => selected !== photo);
            renderPostImagePreview();
            setPostMediaState("");
        });
        item.appendChild(image);
        item.appendChild(remove);
        preview.appendChild(item);
    });
}

function addPostPhotos(files) {
    const chosenFiles = Array.from(files || []);
    if (selectedPostPhotos.length + chosenFiles.length > MAX_POST_PHOTOS) {
        setPostMediaState(`Choose up to ${MAX_POST_PHOTOS} photos per post.`, true);
        return;
    }
    if (chosenFiles.some((file) => !SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
        setPostMediaState("Choose supported image files smaller than 10 MB each.", true);
        return;
    }
    chosenFiles.forEach((file) => {
        selectedPostPhotos.push({ file, previewUrl: URL.createObjectURL(file) });
    });
    renderPostImagePreview();
    setPostMediaState(selectedPostPhotos.length ? `${selectedPostPhotos.length} photo${selectedPostPhotos.length === 1 ? "" : "s"} selected.` : "");
}

async function uploadPostPhotos(postId) {
    const uploadedPaths = [];
    try {
        for (const photo of selectedPostPhotos) {
            const subtype = photo.file.type.split("/")[1] || "jpg";
            const extension = subtype.replace("jpeg", "jpg");
            const path = `${currentSessionUser.id}/posts/${postId}/${crypto.randomUUID()}.${extension}`;
            const { error } = await window.coucouSupabase
                .storage.from("coucou-media")
                .upload(path, photo.file, { contentType: photo.file.type, upsert: false });
            if (error) throw error;
            uploadedPaths.push(path);
        }
        return uploadedPaths;
    } catch (error) {
        if (uploadedPaths.length) {
            const { error: cleanupError } = await window.coucouSupabase
                .storage.from("coucou-media")
                .remove(uploadedPaths);
            if (cleanupError) console.error("[Posts] Failed upload cleanup:", cleanupError.message);
        }
        throw error;
    }
}

function clearPostPhotos() {
    selectedPostPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    selectedPostPhotos = [];
    renderPostImagePreview();
    setPostMediaState("");
}

function initPostMedia() {
    const galleryButton = document.getElementById("post-gallery-button");
    const cameraButton = document.getElementById("post-camera-button");
    const imageInput = document.getElementById("post-image-input");
    const cameraInput = document.getElementById("post-camera-input");
    if (galleryButton && imageInput) {
        galleryButton.addEventListener("click", async () => {
            if (!window.coucouCamera || typeof window.coucouCamera.pickImages !== "function") {
                imageInput.click();
                return;
            }
            galleryButton.disabled = true;
            setPostMediaState("Opening photo library...");
            try {
                const photos = await window.coucouCamera.pickImages();
                addPostPhotos(photos);
            } catch (error) {
                if (!/cancel/i.test(error.message || "")) {
                    setPostMediaState(`Photo library unavailable: ${error.message || "Please try again."}`, true);
                }
            } finally {
                galleryButton.disabled = false;
            }
        });
        imageInput.addEventListener("change", () => {
            addPostPhotos(imageInput.files);
            imageInput.value = "";
        });
    }
    if (cameraButton && cameraInput) {
        cameraButton.addEventListener("click", async () => {
            if (!window.coucouCamera || typeof window.coucouCamera.capturePhoto !== "function") {
                cameraInput.click();
                return;
            }
            cameraButton.disabled = true;
            setPostMediaState("Opening camera...");
            try {
                const photo = await window.coucouCamera.capturePhoto();
                addPostPhotos([photo]);
            } catch (error) {
                setPostMediaState(`Camera unavailable: ${error.message || "Check camera permissions and try again."}`, true);
            } finally {
                cameraButton.disabled = false;
            }
        });
        cameraInput.addEventListener("change", () => {
            addPostPhotos(cameraInput.files);
            cameraInput.value = "";
        });
    }
    window.addEventListener("coucou-camera-restored", (event) => {
        addPostPhotos([event.detail]);
    });
    window.addEventListener("coucou-camera-restored-error", (event) => {
        const error = event.detail || {};
        setPostMediaState(`Camera unavailable: ${error.message || "Check camera permissions and try again."}`, true);
    });
}

async function createPost() {
    const activeSection = document.querySelector(".content-section.active");
    let textBox = activeSection ? activeSection.querySelector("textarea") : null;
    if (!textBox) {
        textBox = document.getElementById("post-text") || document.getElementById("profile-post-text");
    }
    if (!textBox) return;

    const text = textBox.value.trim();
    if (!text && selectedPostPhotos.length === 0) {
        setPostMediaState("Add a caption or choose at least one photo.", true);
        return;
    }

    if (!currentSessionUser) {
        setProfileAuthState("Sign in to create a post.", true);
        return;
    }

    if (selectedPostPhotos.length && (!currentProfile || !currentProfile.public_id)) {
        setPostMediaState("Apply the Coucou profile and social migration before creating photo posts.", true);
        return;
    }

    const postId = crypto.randomUUID();
    let imagePaths = [];
    const submitButton = document.querySelector(".create-post-card > button:last-child");
    if (submitButton) submitButton.disabled = true;
    try {
        if (selectedPostPhotos.length) {
            setPostMediaState("Uploading photos...");
            imagePaths = await uploadPostPhotos(postId);
        }
        await syncPostToSupabase({ id: postId, text, image_paths: imagePaths });
        textBox.value = "";
        clearPostPhotos();
        void loadPostsFromSupabase();
    } catch (error) {
        if (imagePaths.length) {
            const { error: cleanupError } = await window.coucouSupabase
                .storage.from("coucou-media")
                .remove(imagePaths);
            if (cleanupError) console.error("[Posts] Failed post upload cleanup:", cleanupError.message);
        }
        setPostMediaState(
            error.message && /image_paths|text|media/i.test(error.message)
                ? "This photo post requires the Coucou privacy and media migration. Review and apply the SQL migration, then try again."
                : `Post could not be saved: ${error.message || "Please try again."}`,
            true
        );
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

window.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initMySpaceTabs();
    initCollectionTabs();
    initDetailsDelegation();
    initMusicSearch();
    initArtSearch();
    initBookSearch();
    initProfileAuth();
    initUserSearch();
    initPostMedia();
    void renderCreators();
    loadFeaturedBooks();
    renderSavedMoviesAndArt();
    renderSavedMusic();
    renderSavedBooks();
    void loadPostsFromSupabase();
});
