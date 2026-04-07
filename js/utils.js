/**
 * HTML特殊文字をエスケープします（XSS防止）
 * @param {string} s - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, c => map[c]);
}

/**
 * 漢数字をアラビア数字に変換します
 * @param {string} s - 変換対象の文字列
 * @returns {string} 変換後の文字列
 */
function convertKanji(s) {
  if (!s || typeof s !== 'string') {
    return s;
  }

  return s.replace(/[〇零一壱二弐三参四五六七八九十百千万]+/g, m => {
    let v = 0, n = 0;
    for (const c of m) {
      if (CONFIG.KANJI_MAP[c] >= 10) {
        v += (n || 1) * CONFIG.KANJI_MAP[c];
        n = 0;
      } else {
        n = CONFIG.KANJI_MAP[c];
      }
    }
    return v + n;
  });
}

/**
 * ランダムな色を生成します
 * @returns {string} 16進数カラーコード
 */
function randomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

/**
 * ズームレベルに応じたフォントサイズを計算します
 * @param {number} zoom - ズームレベル
 * @returns {number} フォントサイズ
 */
function getFontSizeForZoom(zoom) {
  if (typeof zoom !== 'number' || zoom < 0) {
    return 2;
  }

  return Math.max(2, Math.min(18, 3 + 14 * Math.pow(Math.max(0, Math.min(1, (zoom - 2) / 16)), 2)));
}

/**
 * XML特殊文字をエスケープします
 * @param {string} str - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeXml(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  const xmlChars = {
    '<': '<',
    '>': '>',
    '&': '&',
    "'": "'",
    '"': '"'
  };
  return str.replace(/[<>&'"]/g, c => xmlChars[c]);
}

/**
 * メッセージを表示します
 * @param {string} text - 表示するテキスト
 * @param {boolean} [isError=false] - エラーメッセージかどうか
 * @param {number} [duration=5000] - 表示期間（ミリ秒）
 * @returns {void}
 */
function showMessage(text, isError = false, duration = 5000) {
  if (!text || typeof text !== 'string') {
    return;
  }

  const msgEl = document.getElementById('msg');
  if (!msgEl) {
    console.warn('Message element not found');
    return;
  }

  msgEl.textContent = text;
  msgEl.className = `msg${isError ? ' error' : ''}`;

  // クリア期間の設定（エラーメッセージは10秒、通常メッセージは指定された期間）
  const clearDuration = isError ? 10000 : duration;

  // 既存のタイムアウトをクリア
  if (msgEl.messageTimeout) {
    clearTimeout(msgEl.messageTimeout);
  }

  // 自動クリアの設定
  msgEl.messageTimeout = setTimeout(() => {
    // 他のメッセージで上書きされていない場合のみクリア
    if (msgEl.textContent === text) {
      msgEl.textContent = '';
      msgEl.className = 'msg';
    }
  }, clearDuration);
}

/**
 * フィーチャIDを生成します
 * @param {Object} feature - GeoJSONフィーチャオブジェクト
 * @param {number} [layerIndex=0] - レイヤーインデックス
 * @returns {string} フィーチャID
 */
function getFeatureId(feature, layerIndex = 0) {
  if (!feature || !feature.properties) {
    return `feature_${layerIndex}_${Date.now()}_${Math.random()}`;
  }

  const props = feature.properties;
  const locationKey = `${props.PREF_NAME || ''}_${props.CITY_NAME || ''}_${props.S_NAME || ''}`;
  // 安定したジオメトリキー（先頭100文字）でランダムIDを回避
  const geomKey = feature.geometry?.coordinates
    ? JSON.stringify(feature.geometry.coordinates).slice(0, 100)
    : null;

  const candidates = [
    props.id,
    props.ID,
    props.name,
    props.S_NAME,
    props.N03_004,
    locationKey !== '__' ? locationKey : null,
    geomKey
  ].filter(Boolean);

  return candidates[0] || `feature_${layerIndex}_${Date.now()}_${Math.random()}`;
}

/**
 * フィーチャ名を取得します
 * @param {Object} feature - GeoJSONフィーチャオブジェクト
 * @returns {string} フィーチャ名
 */
function getName(feature) {
  if (!feature || !feature.properties) {
    return 'Feature';
  }

  const name = feature.properties.name ||
               feature.properties.S_NAME ||
               feature.properties.N03_004 ||
               'Feature';

  return convertKanji(name);
}

/**
 * 最初のURL入力欄の色を取得します
 * @returns {string|null} カラーコードまたはnull
 */
function getFirstUrlColor() {
  const firstRow = document.querySelector('.url-row');
  if (!firstRow) {
    return null;
  }

  const colorInput = firstRow.querySelector('input[type="color"]');
  return colorInput ? colorInput.value : null;
}

/**
 * 新しい色を生成します
 * @param {string} [excludeColor=null] - 除外する色
 * @returns {string} 新しいカラーコード
 */
function generateNewColor(excludeColor = null) {
  let newColor;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    newColor = randomColor();
    attempts++;
  } while (excludeColor && newColor === excludeColor && attempts < maxAttempts);

  return newColor;
}

/**
 * スロットル関数を生成します（trailing callあり）
 * @param {Function} func - スロットルする関数
 * @param {number} limit - 最小間隔（ミリ秒）
 * @returns {Function} スロットルされた関数
 */
function throttle(func, limit) {
  let lastCall = 0;
  let trailingTimeout = null;
  return function(...args) {
    const now = Date.now();
    const remaining = limit - (now - lastCall);
    if (remaining <= 0) {
      if (trailingTimeout) { clearTimeout(trailingTimeout); trailingTimeout = null; }
      lastCall = now;
      return func.apply(this, args);
    } else {
      if (trailingTimeout) clearTimeout(trailingTimeout);
      trailingTimeout = setTimeout(() => {
        lastCall = Date.now();
        trailingTimeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * デバウンス関数を生成します
 * @param {Function} func - デバウンスする関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @returns {Function} デバウンスされた関数
 */
function debounce(func, wait) {
  if (typeof func !== 'function') {
    throw new Error('First argument must be a function');
  }

  if (typeof wait !== 'number' || wait < 0) {
    throw new Error('Wait time must be a non-negative number');
  }

  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}
