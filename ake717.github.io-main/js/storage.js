// storage.js
// ブラウザストレージ操作をカプセル化するモジュール

const STORAGE_KEY = 'topojsonViewerState';
const KML_CACHE_KEY = 'kmlCache';

export function saveState(stateData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateData));
    console.log('State saved to localStorage.');
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

export function loadState() {
  try {
    const stateData = localStorage.getItem(STORAGE_KEY);
    return stateData ? JSON.parse(stateData) : null;
  } catch (e) {
    console.error('Failed to load state:', e);
    return null;
  }
}

export function saveKmlCache(fileName, geoJson, color) {
  try {
    const kmlCache = loadKmlCache();
    kmlCache[fileName] = { geoJson, color };
    localStorage.setItem(KML_CACHE_KEY, JSON.stringify(kmlCache));
    console.log(`KML data for "${fileName}" cached with color ${color}.`);
  } catch (e) {
    console.error('Failed to cache KML data:', e);
  }
}

export function loadKmlCache() {
  try {
    const kmlCache = localStorage.getItem(KML_CACHE_KEY);
    return kmlCache ? JSON.parse(kmlCache) : {};
  } catch (e) {
    console.error('Failed to load KML cache:', e);
    return {};
  }
}

export function updateKmlCacheColor(fileName, newColor) {
  try {
    const kmlCache = loadKmlCache();
    if (kmlCache[fileName]) {
      kmlCache[fileName].color = newColor;
      localStorage.setItem(KML_CACHE_KEY, JSON.stringify(kmlCache));
      console.log(`KML color for "${fileName}" updated to ${newColor}.`);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to update KML cache color:', e);
    return false;
  }
}

export function removeKmlCache(fileName) {
  try {
    const kmlCache = loadKmlCache();
    if (kmlCache[fileName]) {
      delete kmlCache[fileName];
      localStorage.setItem(KML_CACHE_KEY, JSON.stringify(kmlCache));
      console.log(`KML data for "${fileName}" removed from cache.`);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to remove KML from cache:', e);
    return false;
  }
}

export function clearAllStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(KML_CACHE_KEY);
    sessionStorage.clear();
    clearCookies();
    console.log('All browser storage cleared.');
  } catch (e) {
    console.error('Error clearing browser storage:', e);
  }
}

function clearCookies() {
  try {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [name] = cookie.trim().split('=');
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.hostname};`;
      }
    });
  } catch (e) {
    console.error('Error clearing cookies:', e);
  }
}
