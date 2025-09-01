// 漢数字をアラビア数字に変換
function convertKanji(s) {
  return s.replace(/[〇零一壱二弐三参四五六七八九十]+/g, m => {
    let v = 0, n = 0;
    for (const c of m) {
      if (CONFIG.KANJI_MAP[c] >= 10) { v += (n || 1) * CONFIG.KANJI_MAP[c]; n = 0; }
      else { n = CONFIG.KANJI_MAP[c]; }
    }
    return v + n;
  });
}

// ランダムな色を生成
function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

// ズームレベルに応じたフォントサイズを計算
function getFontSizeForZoom(zoom) {
  return Math.max(2, Math.min(18, 3 + 14 * Math.pow(Math.max(0, Math.min(1, (zoom - 2) / 16)), 2)));
}

// XMLエスケープ
function escapeXml(str) {
  const xmlChars = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  };
  return str.replace(/[<>&'"]/g, c => xmlChars[c]);
}

// メッセージ表示
function showMessage(text, isError = false) {
  const msgEl = document.getElementById('msg');
  msgEl.textContent = text;
  msgEl.className = `msg${isError ? ' error' : ''}`;
}

// フィーチャIDを生成
function getFeatureId(feature, layerIndex = 0) {
  const props = feature.properties || {};
  const candidates = [
    props.id,
    props.ID,
    props.name,
    props.S_NAME,
    props.N03_004,
    props.PREF_NAME + '_' + props.CITY_NAME + '_' + props.S_NAME,
    JSON.stringify(feature.geometry.coordinates[0]?.[0])
  ].filter(Boolean);

  return candidates[0] || `feature_${layerIndex}_${Date.now()}_${Math.random()}`;
}

// フィーチャ名を取得
function getName(feature) {
  return convertKanji(feature.properties?.name || feature.properties?.S_NAME || feature.properties?.N03_004 || 'Feature');
}

// 最初のURL入力欄の色を取得
function getFirstUrlColor() {
  const firstRow = document.querySelector('.url-row');
  if (firstRow) {
    const colorInput = firstRow.querySelector('input[type="color"]');
    return colorInput ? colorInput.value : null;
  }
  return null;
}

// 新しい色を生成
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

// デバウンス関数
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}
