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
  state.map = L.map('map', { zoomControl: false }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  L.tileLayer(CONFIG.TILE_LAYER_URL, { attribution: CONFIG.TILE_LAYER_ATTRIBUTION }).addTo(state.map);
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
function clearAll() {
  if (confirm('すべてのデータをクリアしますか？\n（保存された設定、Cookie、地図データが削除されます）')) {
    console.log('Starting comprehensive data clear...');
    try {
      clearAllDataSources();
      document.getElementById('data-sources').innerHTML = '';
      addDataSourceRow({ type: 'url', url: '', color: randomColor() });
      state.persistedSelectedFeatures.clear();
      localStorage.removeItem('kmlCache');
      clearBrowserStorage();
      resetApplicationState();
    } catch (e) {
      console.error('Error during clear operation:', e);
      showMessage('クリア中にエラーが発生しました', true);
    }
  }
}

// ブラウザストレージのクリア
function clearBrowserStorage() {
  try {
    // localStorageのクリア
    localStorage.removeItem('topojsonViewerState');
    console.log('localStorage cleared');

    // sessionStorageのクリア（念のため）
    sessionStorage.clear();
    console.log('sessionStorage cleared');

    // Cookieのクリア
    clearCookies();
    console.log('Cookies cleared');

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
