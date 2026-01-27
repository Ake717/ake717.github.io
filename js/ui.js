/**
 * メモキャッシュ管理モジュール
 * @module MemoCache
 */

const memoCache = new Map();

/**
 * 関数の結果をキャッシュするメモ化関数
 * @param {Function} fn - メモ化する関数
 * @param {Function} [keyFn] - キー生成関数
 * @returns {Function} メモ化された関数
 */
function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  return (...args) => {
    const key = keyFn(...args);
    if (memoCache.has(key)) {
      return memoCache.get(key);
    }
    const result = fn(...args);
    memoCache.set(key, result);
    return result;
  };
}

/**
 * メモキャッシュをクリアします
 * @returns {void}
 */
function clearMemoCache() {
  memoCache.clear();
}

// データソース行を追加
function addDataSourceRow(source) {
  const row = document.createElement('div');
  row.className = 'data-source-row';
  row.dataset.id = source.id;
  row.dataset.type = source.type;

  const inputHtml = source.type === 'url'
    ? `<input type="text" value="${source.url || ''}" placeholder="TopoJSON URL" style="flex: 1;">`
    : source.type === 'file'
      ? `<span class="file-name" title="${source.name}">${source.name}</span><input type="file" class="file-upload" accept=".txt,.json,.geojson" style="display:none;">`
      : `<span class="kml-name">${source.name}</span>`;

  row.innerHTML = `
    <button class="add">+</button>
    ${inputHtml}
    <input type="color" value="${source.color || randomColor()}">
    <button class="remove">-</button>
  `;

  row.querySelector('.add').addEventListener('click', () => {
    const menu = document.createElement('div');
    menu.className = 'source-menu';
    menu.innerHTML = `
      <button class="menu-item" data-type="url">URL</button>
      <button class="menu-item" data-type="file">ファイル</button>
    `;
    menu.addEventListener('click', (e) => {
      if (e.target.dataset.type === 'url') {
        addDataSourceRow({ type: 'url', url: '', color: randomColor() });
      } else if (e.target.dataset.type === 'file') {
        addDataSourceRow({ type: 'file', id: '', color: randomColor() });
      }
      menu.remove();
    });
    row.parentElement.appendChild(menu);
    setTimeout(() => menu.remove(), 5000);
  });

  row.querySelector('.remove').addEventListener('click', () => {
    const rows = document.querySelectorAll('.data-source-row');
    if (rows.length > 1) {
      const sourceId = row.dataset.id;
      removeLayer(sourceId);
      row.remove();
      updateRemoveButtons();
      saveState();
    }
  });

  if (source.type === 'url') {
    const urlInput = row.querySelector('input[type="text"]');
    urlInput.addEventListener('change', (e) => {
      const newUrl = e.target.value;
      const oldId = row.dataset.id;
      row.dataset.id = newUrl;
      updateDataSourceId(oldId, newUrl);
      saveState();
    });
  } else if (source.type === 'file') {
    const fileUpload = row.querySelector('.file-upload');
    const fileName = row.querySelector('.file-name');

    fileUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const fileId = `${file.name}_${file.lastModified}`;
        row.dataset.id = fileId;
        fileName.textContent = file.name;
        fileName.title = file.name;

        // ファイルをメモリに保存
        row.dataset.file = JSON.stringify({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        });

        // ファイルの内容を保存
        file.text().then(content => {
          row.dataset.fileContent = content;
          // TXT形式の場合、テキスト解析と自動KML Mode処理
          if (file.name.endsWith('.txt')) {
            checkAndEnableKmlModeForTxt(content);
          }
          saveState();
        });
      }
    });

    fileName.addEventListener('click', () => {
      fileUpload.click();
    });
  }

  const colorInput = row.querySelector('input[type="color"]');
  const debouncedUpdate = debounce((id, color) => {
    if (id) {
      updateLayerColor(id, color);
    }
  }, 100);

  colorInput.addEventListener('input', (e) => {
    const newColor = e.target.value;
    const sourceId = row.dataset.id;
    debouncedUpdate(sourceId, newColor);
  });
  colorInput.addEventListener('change', saveState);

  document.getElementById('data-sources').appendChild(row);
  updateRemoveButtons();
  saveState();
}

// 削除ボタンの状態を更新
function updateRemoveButtons() {
  const rows = document.querySelectorAll('.data-source-row');
  rows.forEach(row => {
    const removeBtn = row.querySelector('.remove');
    if (rows.length <= 1) {
      removeBtn.disabled = true;
      removeBtn.style.opacity = '0.5';
      removeBtn.style.cursor = 'not-allowed';
    } else {
      removeBtn.disabled = false;
      removeBtn.style.opacity = '1';
      removeBtn.style.cursor = 'pointer';
    }
  });
}

// データソースを取得
function getDataSources() {
  return Array.from(document.getElementById('data-sources').querySelectorAll('.data-source-row')).map(row => {
    const type = row.dataset.type;
    const color = row.querySelector('input[type="color"]').value;
    if (type === 'url') {
      const url = row.querySelector('input[type="text"]').value.trim();
      return { type, id: url, url, color };
    } else if (type === 'file') {
      const id = row.dataset.id;
      const name = row.querySelector('.file-name').textContent;
      const fileContent = row.dataset.fileContent;
      return { type, id, name, fileContent, color };
    } else {
      const id = row.dataset.id;
      const name = row.querySelector('.kml-name').textContent;
      return { type, id, name, color };
    }
  }).filter(s => s.id);
}

// URLを共有
function shareUrl() {
  navigator.clipboard?.writeText(location.href.split('?')[0])
    .then(() => showMessage('URL copied'))
    .catch(() => showMessage('Copy failed', true));
}

// 住所検索
async function searchAddress() {
  const query = document.getElementById('search').value.trim();
  if (!query) return;

  try {
    const res = await fetch(`${CONFIG.SEARCH_API_URL}?format=json&q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (!data.length) return showMessage('Not found');

    const { lat, lon, display_name } = data[0];
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.marker([lat, lon]).addTo(state.map).bindPopup(display_name).openPopup();
    state.map.setView([lat, lon], 17);
    showMessage('Found');
    saveState();
  } catch (e) {
    showMessage('Search error', true);
  }
}

// ラベルアイコンを作成
function createLabelIcon(name, fontSize) {
  return L.divIcon({
    className: 'address-label',
    html: `<div style="font-size: ${fontSize}px;">${name}</div>`,
    iconSize: [null, null],
    iconAnchor: [0, 0]
  });
}

// 住所ラベルを表示
function showAddressLabel(layer) {
  const layerId = L.Util.stamp(layer);
  const data = state.featureData.get(layerId);
  if (!data) return;

  const center = getFeatureLabelPosition(data.feature) || layer.getBounds().getCenter();
  const fontSize = state.map.getZoom() / 1.3;
  const labelMarker = L.marker(center, { icon: createLabelIcon(data.name, fontSize) }).addTo(state.map);
  state.addressLabels.set(layerId, labelMarker);
  updateLabelRotations();
}

// 住所ラベルを非表示
function hideAddressLabel(layer) {
  const layerId = L.Util.stamp(layer);
  const labelMarker = state.addressLabels.get(layerId);
  if (labelMarker) {
    state.map.removeLayer(labelMarker);
    state.addressLabels.delete(layerId);
  }
}

// 住所表示を切り替え
function toggleAddressDisplay() {
  const showAddress = document.getElementById('showAddress').checked;
  const kmlMode = document.getElementById('kmlMode').checked;
  const hideUnselected = document.getElementById('hideUnselected').checked;

  // 既存のラベルをすべてクリア
  state.addressLabels.forEach(marker => state.map.removeLayer(marker));
  state.addressLabels.clear();

  if (showAddress) {
    const layersToShow = new Set();

    if (kmlMode) {
      // KMLモードの場合
      if (hideUnselected) {
        // Hide Unselectedが有効な場合は選択されたレイヤーのみ表示
        state.selectedLayers.forEach(layer => {
          const data = state.featureData.get(L.Util.stamp(layer));
          if (data) {
            layersToShow.add(layer);
          }
        });
      } else {
        // Hide Unselectedが無効な場合はすべてのレイヤーを表示
        state.featureData.forEach(data => {
          if (data.layer) {
            layersToShow.add(data.layer);
          }
        });
      }
    } else {
      // 通常モードの場合、すべてのフィーチャレイヤーを表示
      state.featureData.forEach(data => {
        if (data.layer) {
          layersToShow.add(data.layer);
        }
      });
    }

    const baseFontSize = state.map.getZoom() / 1.3;
    const labelsToAdd = [];

    layersToShow.forEach(layer => {
      const layerId = L.Util.stamp(layer);
      const data = state.featureData.get(layerId);
      if (!data) return;

      const center = getFeatureLabelPosition(data.feature) || layer.getBounds().getCenter();
      const labelMarker = L.marker(center, {
        icon: createLabelIcon(data.name, baseFontSize)
      });

      labelsToAdd.push({ layerId, labelMarker, feature: data.feature, originalCenter: center });
    });

    labelsToAdd.forEach(({ layerId, labelMarker }) => {
      state.map.addLayer(labelMarker);
      state.addressLabels.set(layerId, labelMarker);
    });
    updateLabelRotations();
  }

  saveState();
}

// ホバー時の住所ラベルを表示
function showHoverAddressLabel(layer) {
  hideHoverAddressLabel();
  const data = state.featureData.get(L.Util.stamp(layer));
  if (!data) return;

  const address = data.name;
  if (!address) return;

  const center = getFeatureLabelPosition(data.feature) || layer.getBounds().getCenter();
  const fontSize = state.map.getZoom() / 1.3;
  state.currentHoverLabel = L.marker(center, { icon: createLabelIcon(address, fontSize) }).addTo(state.map);
}

// ホバー時の住所ラベルを非表示
function hideHoverAddressLabel() {
  if (state.currentHoverLabel) {
    state.map.removeLayer(state.currentHoverLabel);
    state.currentHoverLabel = null;
  }
}

// ラベルの重なりを解決し、位置を調整する関数 (千鳥配置)
function updateLabelRotations() {
  const labels = [...state.addressLabels.values()];
  if (labels.length === 0) return;

  const baseFontSize = state.map.getZoom() / 1.3;
  const zoom = state.map.getZoom();

  // ズームレベルに応じてオフセットを動的に調整
  // ズームレベルが低いほどオフセットを小さくする
  const dynamicVerticalOffset = Math.max(5, 20 - (18 - zoom) * 2);

  labels.forEach((marker, index) => {
    const div = marker.getElement()?.querySelector('div');
    if (div) {
      const labelHeight = div.offsetHeight;
      const offset = dynamicVerticalOffset + (labelHeight / 20);

      // 偶数番目のラベルは上に、奇数番目のラベルは下にずらす
      const offsetY = (index % 2 === 0) ? -offset : offset;
      div.style.transform = `translate(0px, ${offsetY}px) translate(-50%, -50%)`;
      div.style.fontSize = `${baseFontSize}px`;
    }
  });
}


// キーボードイベントを設定
function setupKeyEvents() {
  let keyEventTimeout = null;

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      // デバウンス処理
      if (keyEventTimeout) clearTimeout(keyEventTimeout);

      keyEventTimeout = setTimeout(() => {
        if (!state.isCtrlPressed) {
          state.isCtrlPressed = true;
          hideHoverAddressLabel();

          // ラベルが多い場合はバッチ処理
          if (state.addressLabels.size > 10) {
            // 大量のラベルを効率的に処理
            const labelsToHide = Array.from(state.addressLabels.entries());
            labelsToHide.forEach(([layerId, labelMarker]) => {
              state.hiddenAddressLabels.set(layerId, labelMarker);
            });

            // 一括でマップから削除
            state.map.eachLayer((layer) => {
              if (layer instanceof L.Marker && layer.options.icon?.options.className === 'address-label') {
                state.map.removeLayer(layer);
              }
            });

            state.addressLabels.clear();
          } else {
            // 少量のラベルは個別に処理
            state.addressLabels.forEach((labelMarker, layerId) => {
              state.map.removeLayer(labelMarker);
              state.hiddenAddressLabels.set(layerId, labelMarker);
            });
            state.addressLabels.clear();
          }
        }
      }, 50); // 50msデバウンス
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.ctrlKey || e.metaKey) return;

    // デバウンス処理
    if (keyEventTimeout) clearTimeout(keyEventTimeout);

    keyEventTimeout = setTimeout(() => {
      if (state.isCtrlPressed) {
        state.isCtrlPressed = false;

        if (state.currentHoverLayer) {
          showHoverAddressLabel(state.currentHoverLayer);
        }

        if (document.getElementById('showAddress').checked && state.hiddenAddressLabels.size > 0) {
          // 表示するレイヤーを事前にフィルタリング
          const layersToShow = [];
          state.hiddenAddressLabels.forEach((labelMarker, layerId) => {
            const layer = state.featureData.get(layerId)?.layer;
            const data = state.featureData.get(layerId);

            if (layer && (document.getElementById('showAddress').checked || state.selectedLayers.has(layer))) {
              layersToShow.push({ layerId, labelMarker });
            }
          });

          // バッチ処理でラベルを再表示
          if (layersToShow.length > 0) {
            layersToShow.forEach(({ layerId, labelMarker }) => {
              state.map.addLayer(labelMarker);
              state.addressLabels.set(layerId, labelMarker);
            });
            updateLabelRotations();
          }
        }

        state.hiddenAddressLabels.clear();
      }
    }, 10); // 50msデバウンス
  });
}

// 地図イベントを設定
function setupMapEvents() {
  let zoomTimeout = null;
  let moveTimeout = null;

  // ズームイベント
  state.map.on('zoomend', () => {
    if (zoomTimeout) clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
      // ズーム変更時にキャッシュをクリア
      clearMemoCache();
      updateLabelRotations();
      saveState();
    }, 100); // 100msデバウンス
  });

  // 移動イベント
  state.map.on('moveend', () => {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      updateLabelRotations();
      saveState();
    }, 100); // 100msデバウンス
  });
}

// TXTまたはJSON形式のファイルを解析してフィーチャーを自動選択
function processAndSelectFeaturesFromFile(content, fileName) {
  if (!content || content.trim().length === 0) {
    showMessage('File is empty', true);
    return;
  }

  // ファイル形式を判定（JSON or TXT）
  let lines = [];
  const lowerFileName = fileName.toLowerCase();

  try {
    // JSON形式の判定
    if (lowerFileName.endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[')) {
      const jsonData = JSON.parse(content);

      // JSON形式：features配列を抽出
      if (Array.isArray(jsonData)) {
        lines = jsonData;
      } else if (jsonData.features && Array.isArray(jsonData.features)) {
        lines = jsonData.features;
      } else {
        showMessage('Invalid JSON format. Expected array or object with "features" property', true);
        return;
      }
    } else {
      // TXT形式：行単位で分割
      lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    }
  } catch (e) {
    // JSON解析失敗の場合はTXT形式として処理
    lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  }

  if (lines.length === 0) {
    showMessage('No valid lines found in file', true);
    return;
  }

  // 正規化関数：テキスト正規化と数字表記の統一
  function normalizeText(text) {
    // スペース・タブを削除
    let normalized = text.trim();
    // 全角スペースも削除
    normalized = normalized.replace(/　/g, '');
    // 漢字数字をアラビア数字に変換
    normalized = convertKanji(normalized);
    return normalized.toLowerCase();
  }

  let successCount = 0;
  let failureCount = 0;
  const failureLog = [];

  // ファイル内の各行をフィーチャーと照合
  for (const line of lines) {
    const normalizedLine = normalizeText(line);
    let matched = false;

    // state.featureDataを走査してフィーチャーをマッチング
    for (const [layerId, data] of state.featureData) {
      if (!data || !data.layer) continue;

      const normalizedFeatureName = normalizeText(data.name);

      // 完全一致をチェック
      if (normalizedFeatureName === normalizedLine) {
        // フィーチャーを選択
        if (!state.selectedLayers.has(data.layer)) {
          toggleSelect(data.layer, false);
        }
        successCount++;
        matched = true;
        break;
      }
    }

    if (!matched) {
      failureCount++;
      failureLog.push(`Not found: "${line}"`);
    }
  }

  // KML Modeを有効化（自動選択したため）
  const kmlModeCheckbox = document.getElementById('kmlMode');
  if (kmlModeCheckbox && !kmlModeCheckbox.checked) {
    kmlModeCheckbox.checked = true;
    kmlModeCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // アラートメッセージを作成
  let alertMessage = '=== Feature Selection Result ===\n\n';
  alertMessage += `Total lines: ${lines.length}\n`;
  alertMessage += `✓ Success: ${successCount}\n`;
  alertMessage += `✗ Failed: ${failureCount}\n`;

  if (failureLog.length > 0) {
    alertMessage += '\n--- Failure Log ---\n';
    failureLog.forEach(log => {
      alertMessage += `${log}\n`;
    });
  }

  alertMessage += '\n====================================';

  // アラートで結果を表示
  alert(alertMessage);

  // コンソールにも出力
  console.log(alertMessage);

  // 状態を保存
  saveState();
}

// 選択されたフィーチャーをJSON形式でエクスポート
function exportTxt() {
  if (state.selectedLayers.size === 0) {
    showMessage('No features selected', true);
    return;
  }

  // 選択されたフィーチャー情報を取得（名前とKEY_CODE）
  const selectedFeatures = [];
  state.selectedLayers.forEach(layer => {
    const layerId = L.Util.stamp(layer);
    const data = state.featureData.get(layerId);
    if (data && data.name) {
      // KEY_CODEを取得（feature.propertiesから）
      const keyCode = data.feature?.properties?.KEY_CODE;
      selectedFeatures.push({
        name: data.name,
        keyCode: keyCode || null
      });
    }
  });

  if (selectedFeatures.length === 0) {
    showMessage('No feature names found', true);
    return;
  }

  // KEY_CODEでソート（KEY_CODEがある場合はソート、ない場合は名前でソート）
  selectedFeatures.sort((a, b) => {
    // 両方ともKEY_CODEがある場合
    if (a.keyCode && b.keyCode) {
      return a.keyCode.localeCompare(b.keyCode, undefined, { numeric: true });
    }
    // 片方だけKEY_CODEがある場合
    if (a.keyCode && !b.keyCode) return -1;
    if (!a.keyCode && b.keyCode) return 1;
    // 両方ともKEY_CODEがない場合（名前でソート）
    return a.name.localeCompare(b.name);
  });

  // ソート済みの名前配列を作成
  const selectedNames = selectedFeatures.map(feature => feature.name);

  // JSON形式で作成
  const jsonData = {
    title: document.getElementById('title').value || 'features',
    timestamp: new Date().toISOString(),
    features: selectedNames
  };

  const jsonContent = JSON.stringify(jsonData, null, 2);

  // JSONファイルをダウンロード
  const fileName = `${jsonData.title}_${Date.now()}.json`;
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();

  showMessage(`JSON file "${fileName}" exported (${selectedNames.length} features)`);
}
