/**
 * Settings Module
 * Handles app settings storage and retrieval
 */

const STORAGE_KEYS = Object.freeze({
  SWIPE: 'stat',
  SHOW_FAVS: 'showfavs',
  LAST_DATE: 'lastdate',
  SETTINGS_VISIBLE: 'settings'
});

/**
 * Loads all settings from localStorage
 * @returns {Object} Settings object
 */
export function loadSettings() {
  return {
    swipe: localStorage.getItem(STORAGE_KEYS.SWIPE) === 'true',
    showFavs: localStorage.getItem(STORAGE_KEYS.SHOW_FAVS) === 'true',
    lastDate: localStorage.getItem(STORAGE_KEYS.LAST_DATE) === 'true',
    settingsVisible: localStorage.getItem(STORAGE_KEYS.SETTINGS_VISIBLE) === 'true'
  };
}

/**
 * Saves a setting to localStorage
 * @param {string} key - The setting key
 * @param {boolean|string} value - The setting value
 */
export function saveSetting(key, value) {
  const storageKey = STORAGE_KEYS[key.toUpperCase()];
  if (storageKey) {
    localStorage.setItem(storageKey, value.toString());
  }
}

/**
 * Initializes settings UI from localStorage
 */
export function initializeSettings() {
  const settings = loadSettings();
  
  const swipeCheckbox = document.getElementById("swipe");
  if (swipeCheckbox) {
    swipeCheckbox.checked = settings.swipe;
  }
  
  const showFavsCheckbox = document.getElementById("showfavs");
  if (showFavsCheckbox) {
    showFavsCheckbox.checked = settings.showFavs;
  }
  
  const lastDateCheckbox = document.getElementById("lastdate");
  if (lastDateCheckbox) {
    lastDateCheckbox.checked = settings.lastDate;
  }
  
  const settingsPanel = document.getElementById("settingsDIV");
  if (settingsPanel) {
    if (settings.settingsVisible) {
      settingsPanel.classList.add('visible');
    } else {
      settingsPanel.classList.remove('visible');
    }
  }
}

/**
 * Toggles the settings panel visibility
 */
export function toggleSettingsPanel() {
  const panel = document.getElementById("settingsDIV");
  if (!panel) return;
  
  const isVisible = panel.classList.toggle('visible');
  saveSetting('settingsVisible', isVisible);
}

/**
 * Initializes draggable settings panel
 */
export function initializeDraggableSettings() {
  const panel = document.getElementById("settingsDIV");
  const header = document.getElementById("settingsHeader");
  
  if (!panel || !header) return;
  
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;
  
  const dragStart = (e) => {
    if (e.target.closest('.settings-close')) return;
    if (!(e.target === header || header.contains(e.target))) return;
    
    isDragging = true;
    panel.style.transition = 'none';
    
    const rect = panel.getBoundingClientRect();
    panelStartX = rect.left + rect.width / 2;
    panelStartY = rect.top + rect.height / 2;
    
    if (e.type === "touchstart") {
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
    } else {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
    
    e.preventDefault();
  };
  
  const drag = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    let currentX, currentY;
    if (e.type === "touchmove") {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const deltaX = currentX - dragStartX;
    const deltaY = currentY - dragStartY;
    const newCenterX = panelStartX + deltaX;
    const newCenterY = panelStartY + deltaY;
    
    panel.style.left = `${newCenterX}px`;
    panel.style.top = `${newCenterY}px`;
    panel.style.transform = `translate(-50%, -50%)`;
  };
  
  const dragEnd = () => {
    if (isDragging) {
      isDragging = false;
      setTimeout(() => {
        panel.style.transition = '';
      }, 50);
    }
  };
  
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  header.addEventListener('touchstart', dragStart, { passive: false });
  document.addEventListener('touchmove', drag, { passive: false });
  document.addEventListener('touchend', dragEnd);
}
