// storage.js
// ブラウザストレージ操作ユーティリティ（グローバルスクリプトとして読み込む）

// ファイル内容をDOMではなくメモリ上に保持するストア
const fileContentStore = new Map();

function clearAllStorage() {
  try {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem('kmlCache');
    sessionStorage.clear();
    _storageClearCookies();
    fileContentStore.clear();
    console.log('All browser storage cleared.');
  } catch (e) {
    console.error('Error clearing browser storage:', e);
  }
}

function _storageClearCookies() {
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
