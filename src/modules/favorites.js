/**
 * Favorites Module
 * Handles favorite comics storage and retrieval
 */

const STORAGE_KEY = 'favs';

// Cache for favorites
let _cachedFavs = null;

/**
 * Loads favorites from localStorage
 * @returns {Array<string>} Array of favorite comic dates (YYYY-MM-DD format)
 */
export function loadFavs() {
  if (Array.isArray(_cachedFavs)) return _cachedFavs;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return (_cachedFavs = []);
    const parsed = JSON.parse(raw);
    return (_cachedFavs = Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return (_cachedFavs = []);
  }
}

/**
 * Saves favorites to localStorage
 * @param {Array<string>} arr - Array of favorite comic dates
 */
export function saveFavs(arr) {
  if (!Array.isArray(arr)) return;
  const deduped = Array.from(new Set(arr)).sort();
  _cachedFavs = deduped;
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped)); 
  } catch (e) { 
    /* ignore */ 
  }
}

/**
 * Invalidates the favorites cache
 */
export function invalidateFavsCache() {
  _cachedFavs = null;
}

/**
 * Toggles a comic's favorite status
 * @param {string} formattedDate - The comic date in YYYY-MM-DD format
 * @returns {boolean} True if comic is now favorited, false otherwise
 */
export function toggleFavorite(formattedDate) {
  let favs = loadFavs();
  const isFavorited = favs.includes(formattedDate);
  
  if (!isFavorited) {
    favs.push(formattedDate);
    saveFavs(favs);
    return true;
  } else {
    favs = favs.filter(f => f !== formattedDate);
    saveFavs(favs);
    return false;
  }
}

/**
 * Checks if a comic is favorited
 * @param {string} formattedDate - The comic date in YYYY-MM-DD format
 * @returns {boolean} True if favorited
 */
export function isFavorite(formattedDate) {
  const favs = loadFavs();
  return favs.includes(formattedDate);
}

/**
 * Updates the favorite button UI
 * @param {string} formattedDate - The comic date in YYYY-MM-DD format
 */
export function updateFavoriteButton(formattedDate) {
  const heartButton = document.getElementById("favheart");
  const heartSvg = heartButton ? heartButton.querySelector('svg') : null;
  const isFav = isFavorite(formattedDate);
  
  if (heartSvg) {
    if (isFav) {
      heartSvg.style.fill = 'currentColor';
      heartSvg.style.stroke = 'currentColor';
    } else {
      heartSvg.style.fill = 'none';
      heartSvg.style.stroke = 'currentColor';
    }
  }
  
  // Update showfavs checkbox state
  const showFavsCheckbox = document.getElementById("showfavs");
  if (showFavsCheckbox) {
    const favs = loadFavs();
    showFavsCheckbox.disabled = favs.length === 0;
  }
}
