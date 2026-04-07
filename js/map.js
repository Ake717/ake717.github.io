/**
 * 地図状態管理モジュール
 * @module MapState
 */

const INITIAL_VIEW = { center: [36.2, 138.3], zoom: 5 };

/**
 * アプリケーションのグローバル状態
 * @typedef {Object} ApplicationState
 * @property {L.Map|null} map - Leaflet地図インスタンス
 * @property {Map<string, L.LayerGroup>} layers - データソースIDとレイヤーグループのマッピング
 * @property {Array<Object>} dataSources - データソース配列
 * @property {Map<string, FeatureData>} featureData - フィーチャデータのマッピング
 * @property {Set<L.Layer>} selectedLayers - 選択されたレイヤーのセット
 * @property {L.Marker|null} marker - 現在のマーカー
 * @property {Map<string, L.Marker>} addressLabels - 住所ラベルのマッピング
 * @property {Map<string, L.Marker>} hiddenAddressLabels - 非表示住所ラベルのマッピング
 * @property {L.Marker|null} currentHoverLabel - 現在ホバー中のラベル
 * @property {boolean} isCtrlPressed - Ctrlキーが押されているか
 * @property {L.Layer|null} currentHoverLayer - 現在ホバー中のレイヤー
 * @property {Set<string>} persistedSelectedFeatures - 永続化された選択フィーチャID
 * @property {string} sessionId - セッションID
 * @property {boolean} hideUnselected - 非選択フィーチャを非表示にするか
 */

/**
 * @type {ApplicationState}
 */
const state = {
  map: null,
  layers: new Map(), // source.id -> layerGroup
  dataSources: [],
  featureData: new Map(),
  selectedLayers: new Set(),
  marker: null,
  addressLabels: new Map(),
  hiddenAddressLabels: new Map(),
  labelRegistry: new Map(),
  currentHoverLabel: null,
  isCtrlPressed: false,
  currentHoverLayer: null,
  persistedSelectedFeatures: new Set(),
  sessionId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  hideUnselected: false
};
/**
 * アプリケーション状態を保存します
 * @returns {void}
 */
function saveState() {
  try {
    // DOM要素が存在するかチェック
    const kmlModeCheckbox = document.getElementById('kmlMode');
    const showAddressCheckbox = document.getElementById('showAddress');
    const autoMoveCheckbox = document.getElementById('autoMove');
    const hatchUnselectedCheckbox = document.getElementById('hatchUnselected');
    const titleInput = document.getElementById('title');

    if (!kmlModeCheckbox || !showAddressCheckbox || !autoMoveCheckbox || !titleInput) {
      console.warn('DOM elements not ready, skipping saveState');
      return;
    }

    const stateData = {
      // fileContentはサイズが大きすぎるためlocalStorageには保存しない
      sources: getDataSources().map(s =>
        s.type === 'file' ? { type: s.type, id: s.id, name: s.name, color: s.color } : s
      ),
      selectedFeatures: Array.from(state.persistedSelectedFeatures),
      mapView: {
        center: state.map.getCenter(),
        zoom: state.map.getZoom()
      },
      settings: {
        kmlMode: kmlModeCheckbox.checked,
        showAddress: showAddressCheckbox.checked,
        autoMove: autoMoveCheckbox.checked,
        hatchUnselected: hatchUnselectedCheckbox?.checked || false,
        alwaysShowFeatures: document.getElementById('alwaysShowFeatures')?.checked || false,
        title: titleInput.value
      },
      sessionId: state.sessionId,
      timestamp: Date.now()
    };

    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(stateData));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

/**
 * アプリケーション状態を復元します
 * @returns {boolean} 復元が成功したかどうか
 */
function loadState() {
  try {
    // クリアフラグが設定されている場合はデータを読み込まない
    const clearFlag = localStorage.getItem('clearAllFlag');
    if (clearFlag === 'true') {
      localStorage.removeItem('clearAllFlag');
      console.log('Clear flag detected, skipping state load');
      return false;
    }

    const stateData = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    if (!stateData) return false;

    if (stateData.sources && stateData.sources.length > 0) {
      stateData.sources.forEach(s => addDataSourceRow(s));
    }

    state.persistedSelectedFeatures = new Set(stateData.selectedFeatures || []);

    if (stateData.mapView) {
      const lat = parseFloat(stateData.mapView.center?.lat);
      const lng = parseFloat(stateData.mapView.center?.lng);
      const zoom = parseInt(stateData.mapView.zoom);
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom) &&
          lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
          zoom >= 0 && zoom <= 22) {
        state.map.setView([lat, lng], zoom);
      }
    }

    // DOM要素が存在するかチェック
    const kmlModeCheckbox = document.getElementById('kmlMode');
    const showAddressCheckbox = document.getElementById('showAddress');
    const autoMoveCheckbox = document.getElementById('autoMove');
    const hatchUnselectedCheckbox = document.getElementById('hatchUnselected');
    const titleInput = document.getElementById('title');

    if (stateData.settings && kmlModeCheckbox && showAddressCheckbox && autoMoveCheckbox && titleInput) {
      kmlModeCheckbox.checked = stateData.settings.kmlMode || false;
      showAddressCheckbox.checked = stateData.settings.showAddress || false;
      autoMoveCheckbox.checked = stateData.settings.autoMove !== undefined ? stateData.settings.autoMove : CONFIG.AUTO_MOVE_TO_NEW_FEATURES;
      if (hatchUnselectedCheckbox) hatchUnselectedCheckbox.checked = stateData.settings.hatchUnselected || false;
      const alwaysShowCheckbox = document.getElementById('alwaysShowFeatures');
      if (alwaysShowCheckbox) alwaysShowCheckbox.checked = stateData.settings.alwaysShowFeatures || false;
      titleInput.value = stateData.settings.title || '';
      if (stateData.settings.title) {
        document.title = stateData.settings.title;
      }
    }

    console.log('State loaded from localStorage:', stateData);
    return true;
  } catch (e) {
    console.error('Failed to load state:', e);
    return false;
  }
}

/**
 * 地図を初期化します
 * @returns {void}
 */
function initMap() {
  try {
    // 地図オプションの設定
    const mapOptions = {
      zoomControl: true,
      zoomSnap: 0.1,
      zoomDelta: 0.25,
      preferCanvas: true,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom
    };

    // 地図インスタンスの作成
    state.map = L.map('map', mapOptions);

    if (!state.map) {
      throw new Error('Failed to create map instance');
    }

    // ズームコントロールの位置設定
    state.map.zoomControl.setPosition('bottomright');

    // タイルレイヤーの追加
    const tileLayer = L.tileLayer(CONFIG.TILE_LAYER_URL, {
      attribution: CONFIG.TILE_LAYER_ATTRIBUTION
    });

    tileLayer.addTo(state.map);


    console.log('Map initialized successfully');
  } catch (error) {
    console.error('Error initializing map:', error);
    showMessage('地図の初期化に失敗しました', true);
  }
}


// 地図を再生成
function recreateMap() {
  if (state.map) {
    // 現在のビューを保存
    const currentCenter = state.map.getCenter();
    const currentZoom = state.map.getZoom();

    // 地図を破棄
    state.map.remove();
    state.map = null;

    // 新しい地図を初期化
    initMap();

    // 保存したビューを復元
    state.map.setView(currentCenter, currentZoom);
  }
}

// レイヤーの色を更新
function updateLayerColor(sourceId, newColor) {
  const layerGroup = state.layers.get(sourceId);
  if (layerGroup) {
    layerGroup.setStyle({ color: newColor });
  }
  const useHatch = document.getElementById('hatchUnselected')?.checked;
  // featureDataの色を更新し、非選択レイヤーのfillColorも即時反映
  state.featureData.forEach(data => {
    if (data.sourceId === sourceId) {
      data.color = newColor;
      if (!state.selectedLayers.has(data.layer)) {
        data.layer.setStyle({
          fillColor: useHatch ? '#888888' : newColor
        });
      }
    }
  });
}

// レイヤーを削除
function removeLayer(sourceId) {
  const layerGroup = state.layers.get(sourceId);
  if (layerGroup) {
    state.map.removeLayer(layerGroup);
    state.layers.delete(sourceId);
  }
  // 関連するfeatureDataも削除
  const idsToDelete = [];
  state.featureData.forEach((data, id) => {
    if (data.sourceId === sourceId) {
      idsToDelete.push(id);
    }
  });
  idsToDelete.forEach(id => state.featureData.delete(id));
}

// データソースIDを更新
function updateDataSourceId(oldId, newId) {
  // state.layers のキーを更新
  if (state.layers.has(oldId)) {
    state.layers.set(newId, state.layers.get(oldId));
    state.layers.delete(oldId);
  }
  // state.dataSources のIDを更新
  const dataSource = state.dataSources.find(ds => ds.id === oldId);
  if (dataSource) {
    dataSource.id = newId;
    if (dataSource.type === 'url') {
      dataSource.url = newId;
    }
  }
  // featureData の sourceId を更新
  state.featureData.forEach(data => {
    if (data.sourceId === oldId) {
      data.sourceId = newId;
    }
  });
}


// 選択されたフィーチャを復元
function restoreSelectedFeatures() {
  if (state.persistedSelectedFeatures.size === 0) return;

  state.featureData.forEach((data) => {
    if (state.persistedSelectedFeatures.has(data.featureId)) {
      toggleSelect(data.layer, false, true); // 可視性更新はスキップ（バッチ処理）
    }
  });

  // 全フィーチャ復元後に一括で可視性を更新
  updateLayerVisibility();

  console.log(`Restored ${state.selectedLayers.size} selected features`);
}

// フィーチャイベントを設定
function setupFeatureEvents(feature, layer, source) {
  const layerId = L.Util.stamp(layer);
  const name = getName(feature);
  const featureId = getFeatureId(feature, source.id);

  state.featureData.set(layerId, {
    feature,
    layer,
    color: source.color,
    name,
    featureId,
    isKml: source.isKml,
    sourceId: source.id
  });

  layer.on('click', e => {
    // DOM要素が存在するかチェック
    const kmlModeCheckbox = document.getElementById('kmlMode');
    if (kmlModeCheckbox && kmlModeCheckbox.checked && (e.originalEvent.ctrlKey || e.originalEvent.metaKey)) {
      L.DomEvent.stopPropagation(e);
      toggleSelect(layer);
    }
  });

  layer.on('mouseover', throttle((e) => {
    state.currentHoverLayer = layer;
    if (!state.isCtrlPressed) {
      showHoverAddressLabel(layer);
    }
    if (!state.selectedLayers.has(layer)) {
      const layerData = state.featureData.get(layerId);
      layer.setStyle({ fillColor: layerData?.color || '#3388ff', fillOpacity: 0.4 });
    }
  }, 80));

  layer.on('mouseout', throttle(() => {
    hideHoverAddressLabel();
    state.currentHoverLayer = null;
    if (!state.selectedLayers.has(layer)) {
      const layerData = state.featureData.get(layerId);
      const useHatch = document.getElementById('hatchUnselected')?.checked;
      layer.setStyle({
        fillColor: useHatch ? '#888888' : (layerData?.color || '#3388ff'),
        fillOpacity: useHatch ? 0.05 : 0.15
      });
    }
  }, 80));
}

// フィーチャの選択を切り替え
function toggleSelect(layer, shouldSave = true, skipVisibilityUpdate = false) {
  const layerId = L.Util.stamp(layer);
  const data = state.featureData.get(layerId);
  
  // DOM要素が存在するかチェック
  const kmlModeCheckbox = document.getElementById('kmlMode');
  const showAddressCheckbox = document.getElementById('showAddress');
  
  if (!kmlModeCheckbox || !showAddressCheckbox) {
    console.warn('DOM elements not ready, skipping toggleSelect');
    return;
  }
  
  const kmlMode = kmlModeCheckbox.checked;
  const showAddress = showAddressCheckbox.checked;

  const useHatch = document.getElementById('hatchUnselected')?.checked;

  if (state.selectedLayers.has(layer)) {
    // 選択解除
    state.selectedLayers.delete(layer);
    layer.setStyle({
      weight: data.isKml ? 2 : 1,
      opacity: 0.7,
      fillColor: useHatch ? '#888888' : data.color,
      fillOpacity: useHatch ? 0.05 : 0.15
    });
    if (kmlMode && showAddress) {
      hideAddressLabel(layer);
    }
    if (data) {
      state.persistedSelectedFeatures.delete(data.featureId);
    }
  } else {
    // 選択
    state.selectedLayers.add(layer);
    layer.setStyle({
      weight: 3,
      opacity: 1.0,
      fillColor: data.color,
      fillOpacity: 0
    });
    if (showAddress && kmlMode) {
      showAddressLabel(layer);
    }
    if (data) {
      state.persistedSelectedFeatures.add(data.featureId);
    }
  }

  // 選択状態が変更されたらレイヤーの可視性を更新（バッチ処理中はスキップ）
  if (!skipVisibilityUpdate && kmlMode && document.getElementById('hideUnselected').checked) {
    updateLayerVisibility();
  }

  if (shouldSave) {
    saveState();
  }
}

// レイヤーの可視性を管理（Hide Unselected機能）
function updateLayerVisibility() {
  const hideUnselectedCheckbox = document.getElementById('hideUnselected');
  const kmlModeCheckbox = document.getElementById('kmlMode');

  if (!hideUnselectedCheckbox || !kmlModeCheckbox) {
    console.warn('DOM elements not ready, skipping updateLayerVisibility');
    return;
  }

  const hideUnselected = hideUnselectedCheckbox.checked;
  const kmlMode = kmlModeCheckbox.checked;
  const useHatch = document.getElementById('hatchUnselected')?.checked;

  state.layers.forEach((layerGroup) => {
    layerGroup.eachLayer(layer => {
      const isSelected = state.selectedLayers.has(layer);
      const data = state.featureData.get(L.Util.stamp(layer));

      if (!kmlMode || !hideUnselected || isSelected) {
        // 表示: 隠れているレイヤーのみスタイル復元
        if (layer._isHidden) {
          if (isSelected) {
            layer.setStyle({ weight: 3, opacity: 1.0, fillColor: data?.color, fillOpacity: 0 });
          } else {
            layer.setStyle({
              weight: data?.isKml ? 2 : 1,
              opacity: 0.7,
              fillColor: useHatch ? '#888888' : data?.color,
              fillOpacity: useHatch ? 0.05 : 0.15
            });
          }
          layer.options.interactive = true;
          layer._isHidden = false;
        }
      } else {
        // 非表示: まだ表示中のレイヤーのみ隠す
        if (!layer._isHidden) {
          layer.setStyle({ opacity: 0, fillOpacity: 0, weight: 0 });
          layer.options.interactive = false;
          layer._isHidden = true;
        }
      }
    });
  });
}

// ハッチングスタイルをすべての未選択レイヤーに適用/解除する（ビューポート内のみ優先更新）
function updateHatchStyles() {
  const useHatch = document.getElementById('hatchUnselected')?.checked;
  const bounds = state.map?.getBounds().pad(0.5);
  requestAnimationFrame(() => {
    state.featureData.forEach((data) => {
      if (!state.selectedLayers.has(data.layer)) {
        // ビューポート外のレイヤーはスキップ（getBounds未対応のレイヤーは常に更新）
        try {
          if (bounds && data.layer.getBounds && !bounds.intersects(data.layer.getBounds())) return;
        } catch (_) { /* getBoundsが使えない場合は更新を続行 */ }
        data.layer.setStyle({
          fillColor: useHatch ? '#888888' : data.color,
          fillOpacity: useHatch ? 0.05 : 0.15
        });
      }
    });
  });
  saveState();
}

// ブラウザストレージのクリア
async function clearBrowserStorage() {
  try {
    // localStorageの特定のデータをクリア
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem('kmlCache');
    console.log('localStorage cleared specific keys');

    // sessionStorageのクリア
    sessionStorage.clear();
    console.log('sessionStorage cleared');

    // Cookieのクリア
    clearCookies();
    console.log('Cookies cleared');

    // Service Workerの登録解除とキャッシュのクリア
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('Service Worker unregistered:', registration.scope);
      }
      // キャッシュAPIのクリア
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log('Cache deleted:', cacheName);
      }
    }

  } catch (e) {
    console.error('Error clearing browser storage:', e);
  }
}

// アプリケーション状態のリセット
function resetApplicationState() {
  console.log('Resetting application state...');

  // ページのリロードで完全なリセット
  setTimeout(() => {
    location.reload();
  }, 100);
}
