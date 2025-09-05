const INITIAL_VIEW = { center: [36.2, 138.3], zoom: 5 };

const state = {
  map: null,
  layers: new Map(), // source.id -> layerGroup
  dataSources: [],
  featureData: new Map(),
  selectedLayers: new Set(),
  marker: null,
  addressLabels: new Map(),
  hiddenAddressLabels: new Map(),
  currentHoverLabel: null,
  isCtrlPressed: false,
  currentHoverLayer: null,
  persistedSelectedFeatures: new Set(),
  sessionId: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
};
function saveState() {
  try {
    const stateData = {
      sources: getDataSources(),
      selectedFeatures: Array.from(state.persistedSelectedFeatures),
      mapView: {
        center: state.map.getCenter(),
        zoom: state.map.getZoom()
      },
      settings: {
        kmlMode: document.getElementById('kmlMode').checked,
        showAddress: document.getElementById('showAddress').checked,
        renderOffscreen: document.getElementById('renderOffscreen').checked,
        autoMove: document.getElementById('autoMove').checked,
        simplify: document.getElementById('simplify').checked,
        tolerance: document.getElementById('tolerance').value,
        title: document.getElementById('title').value
      },
      sessionId: state.sessionId,
      timestamp: Date.now()
    };

    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(stateData));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

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
      state.map.setView([stateData.mapView.center.lat, stateData.mapView.center.lng], stateData.mapView.zoom);
    }

    if (stateData.settings) {
      document.getElementById('kmlMode').checked = stateData.settings.kmlMode || false;
      document.getElementById('showAddress').checked = stateData.settings.showAddress || false;
      document.getElementById('renderOffscreen').checked = stateData.settings.renderOffscreen !== undefined ? stateData.settings.renderOffscreen : true;
      document.getElementById('autoMove').checked = stateData.settings.autoMove !== undefined ? stateData.settings.autoMove : CONFIG.AUTO_MOVE_TO_NEW_FEATURES;
      document.getElementById('simplify').checked = stateData.settings.simplify || false;
      document.getElementById('tolerance').value = stateData.settings.tolerance || '0.0001';
      document.getElementById('title').value = stateData.settings.title || '';
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

// 地図を初期化
function initMap() {
  const renderOffscreen = document.getElementById('renderOffscreen').checked;
  const renderer = renderOffscreen ? L.canvas({ padding: 1 }) : null;

  state.map = L.map('map', {
    zoomControl: true, // ズームコントロールを有効にする
    zoomSnap: 0.1,
    zoomDelta: 0.25,
    renderer: renderer
  }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);

  // ズームコントロールパネルを左下に配置
  state.map.zoomControl.setPosition('bottomright');

  L.tileLayer(CONFIG.TILE_LAYER_URL, { attribution: CONFIG.TILE_LAYER_ATTRIBUTION }).addTo(state.map);
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
  // featureDataの色も更新
  state.featureData.forEach(data => {
    if (data.sourceId === sourceId) {
      data.color = newColor;
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
      toggleSelect(data.layer, false);
    }
  });

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
    if (document.getElementById('kmlMode').checked && (e.originalEvent.ctrlKey || e.originalEvent.metaKey)) {
      L.DomEvent.stopPropagation(e);
      toggleSelect(layer);
    }
  });

  layer.on('mouseover', (e) => {
    state.currentHoverLayer = layer;
    if (!state.isCtrlPressed) {
      showHoverAddressLabel(layer);
    }
    if (!state.selectedLayers.has(layer)) {
      layer.setStyle({ fillOpacity: 0.4 });
    }
  });

  layer.on('mouseout', () => {
    hideHoverAddressLabel();
    state.currentHoverLayer = null;
    if (!state.selectedLayers.has(layer)) {
      layer.setStyle({ fillOpacity: 0.15 });
    }
  });
}

// フィーチャの選択を切り替え
function toggleSelect(layer, shouldSave = true) {
  const layerId = L.Util.stamp(layer);
  const data = state.featureData.get(layerId);
  const kmlMode = document.getElementById('kmlMode').checked;
  const showAddress = document.getElementById('showAddress').checked;

  if (state.selectedLayers.has(layer)) {
    // 選択解除
    state.selectedLayers.delete(layer);
    layer.setStyle({
      weight: data.isKml ? 2 : 1,
      opacity: 0.7,
      fillOpacity: 0.15
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
      fillOpacity: 0
    });
    if (showAddress) {
      showAddressLabel(layer);
    }
    if (data) {
      state.persistedSelectedFeatures.add(data.featureId);
    }
  }

  if (shouldSave) {
    saveState();
  }
}

// すべてをクリア
async function clearAll() {
  if (confirm('すべてのデータをクリアしますか？\n（保存された設定、Cookie、地図データが削除されます）')) {
    console.log('Starting comprehensive data clear...');
    try {
      // まずクリアフラグを設定
      localStorage.setItem('clearAllFlag', 'true');

      // すべてのストレージをクリア (Service Workerの登録解除とキャッシュクリアを含む)
      await clearBrowserStorage();

      // 内部状態をリセット
      clearAllDataSources();
      state.persistedSelectedFeatures.clear();

      // UIのデータソース行を完全にクリアし、新しい空の行を1つだけ追加
      const dataSourcesContainer = document.getElementById('data-sources');
      dataSourcesContainer.innerHTML = '';
      setTimeout(() => {
        addDataSourceRow({ type: 'url', url: '', color: randomColor() });
      }, 10);

      // ページリロードでアプリケーションを完全に初期状態に戻す
      resetApplicationState();
    } catch (e) {
      console.error('Error during clear operation:', e);
      showMessage('クリア中にエラーが発生しました', true);
    }
  }
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

// Cookieのクリア
function clearCookies() {
  try {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [name] = cookie.trim().split('=');
      if (name) {
        // 現在のドメインのCookieを削除
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.hostname};`;
      }
    });
  } catch (e) {
    console.error('Error clearing cookies:', e);
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
