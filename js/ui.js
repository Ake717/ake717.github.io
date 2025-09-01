const memoCache = new Map();

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
    ? `<input type="text" value="${source.url}" placeholder="TopoJSON URL" style="flex: 1;">`
    : `<span class="kml-name">${source.name}</span>`;

  row.innerHTML = `
    <button class="add">+</button>
    ${inputHtml}
    <input type="color" value="${source.color || randomColor()}">
    <button class="remove">-</button>
  `;

  row.querySelector('.add').addEventListener('click', () => addDataSourceRow({ type: 'url', url: '', color: randomColor() }));
  row.querySelector('.remove').addEventListener('click', () => {
    const rows = document.querySelectorAll('.data-source-row');
    if (rows.length > 1) {
      // レイヤーを削除してからUIを更新
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
      // IDを更新し、新しいURLで状態を保存
      row.dataset.id = newUrl;
      updateDataSourceId(oldId, newUrl);
      saveState();
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

// UIの表示/非表示を切り替え
function toggleUI() {
  const mainCtrl = document.getElementById('main');
  const kmlCtrl = document.getElementById('kml');
  const toggleUIBtn = document.getElementById('toggleUI');

  const isHidden = mainCtrl.style.display === 'none';
  const display = isHidden ? 'block' : 'none';
  mainCtrl.style.display = display;
  kmlCtrl.style.display = display;
  toggleUIBtn.textContent = isHidden ? 'Hide UI' : 'Show UI';
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

  let center = getFeatureLabelPosition(data.feature) || layer.getBounds().getCenter();
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

  // 既存のラベルをすべてクリア
  state.addressLabels.forEach(marker => state.map.removeLayer(marker));
  state.addressLabels.clear();

  if (showAddress) {
    const layersToShow = new Set();

    if (kmlMode) {
      // KMLモードの場合、選択されたKMLレイヤーのみ表示
      state.selectedLayers.forEach(layer => {
        const data = state.featureData.get(L.Util.stamp(layer));
        if (data) {
          layersToShow.add(layer);
        }
      });
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
      const offset = dynamicVerticalOffset + (labelHeight / 15);

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
