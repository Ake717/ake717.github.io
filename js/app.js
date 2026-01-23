// すべてのデータソースを読み込む
async function loadAllDataSources() {
  const sourceData = getDataSources();

  // 既存のデータソースを識別用マップで管理（URL またはID で識別）
  const existingSourceMap = new Map();
  for (const ds of state.dataSources) {
    const key = ds.url || ds.id; // URLまたはIDをキーとする
    existingSourceMap.set(key, ds);
  }

  // 新しいデータソースのみを追加（既存レイヤーは再読み込みしない）
  const newDataSources = [];
  for (const data of sourceData) {
    const key = data.url || data.id;
    
    if (!existingSourceMap.has(key)) {
      // 新規データソース
      let newSource = null;
      if (data.type === 'url' && data.url) {
        newSource = createUrlSource(data.url, data.color);
      } else if (data.type === 'file' && data.id && data.fileContent) {
        newSource = createFileSourceFromContent(data.fileContent, data.name, data.color, data.id);
      } else if (data.type === 'kml' && data.id) {
        newSource = createKmlSource(data.id, data.name, data.color);
      }
      
      if (newSource) {
        state.dataSources.push(newSource);
        newDataSources.push(newSource);
      }
    }
  }

  const simplify = document.getElementById('simplify').checked;
  const tolerance = parseFloat(document.getElementById('tolerance').value) || 0;

  // 新しく追加されたレイヤーの境界を追跡
  const newLayerBounds = [];

  // 新規データソースのみを読み込んでマップに追加
  for (const source of newDataSources) {
    try {
      let geoJson = await source.load();
      if (simplify && tolerance > 0) {
        geoJson = simplifyGeo(geoJson, tolerance);
      }
      const layerGroup = L.geoJSON(geoJson, {
        style: { color: source.color, weight: source.isKml ? 2 : 1, opacity: 0.7, fillOpacity: 0.15 },
        onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, source)
      }).addTo(state.map);
      state.layers.set(source.id, layerGroup);

      // 新しいレイヤーの境界を収集
      if (layerGroup.getBounds().isValid()) {
        newLayerBounds.push(layerGroup.getBounds());
      }
    } catch (e) {
      console.error(`Failed to load data source: ${source.name}`, e);
    }
  }

  // 新しいフィーチャーが追加された場合、自動でその場所に移動
  const autoMoveEnabled = document.getElementById('autoMove')?.checked ?? CONFIG.AUTO_MOVE_TO_NEW_FEATURES;
  if (autoMoveEnabled && newLayerBounds.length > 0) {
    try {
      // すべての新しいレイヤーの境界をまとめてfitBounds
      const combinedBounds = newLayerBounds.reduce((acc, bounds) => acc.extend(bounds), L.latLngBounds(newLayerBounds[0]));
      state.map.fitBounds(combinedBounds, { padding: [20, 20] });
    } catch (e) {
      console.error('Failed to move to new features:', e);
    }
  }
}

// すべてのデータソースをクリア
function confirmClear() {
  if (confirm('すべてのデータをクリアしますか？')) {
    clearAllDataSources();
  }
}

function clearAllDataSources() {
  // マップレイヤーのクリア
  state.layers.forEach(layer => state.map.removeLayer(layer));
  state.layers.clear();

  // データソースのクリア
  state.dataSources = [];
  state.featureData.clear();

  // 住所ラベルのクリア
  state.addressLabels.forEach(marker => state.map.removeLayer(marker));
  state.addressLabels.clear();
  state.hiddenAddressLabels.clear();

  // 選択レイヤーのクリア
  state.selectedLayers.clear();

  // マーカーのクリア
  if (state.marker) state.map.removeLayer(state.marker);
  state.marker = null;

  // ホバーラベルのクリア
  if (state.currentHoverLabel) {
    state.map.removeLayer(state.currentHoverLabel);
    state.currentHoverLabel = null;
  }

  // UI要素のクリア
  const dataSourcesContainer = document.getElementById('data-sources');
  if (dataSourcesContainer) {
    dataSourcesContainer.innerHTML = '';
    // クリア後に空のデータソース行を1つ追加
    addDataSourceRow({ type: 'url', url: '', color: randomColor() });
  }

  // メモキャッシュのクリア
  clearMemoCache();

  // コントロールの状態をリセット
  const controlsToReset = [
    { id: 'search', value: '' },
    { id: 'title', value: '' },
    { id: 'tolerance', value: '0.0001' },
    { id: 'showAddress', checked: false },
    { id: 'autoMove', checked: true },
    { id: 'kmlMode', checked: false },
    { id: 'simplify', checked: false }
  ];

  controlsToReset.forEach(({ id, value, checked }) => {
    const element = document.getElementById(id);
    if (element) {
      if (value !== undefined) element.value = value;
      if (checked !== undefined) element.checked = checked;
    }
  });

  // ストレージのクリア
  clearAllStorage();

  // クリアフラグを設定
  localStorage.setItem('clearAllFlag', 'true');

  // 状態を保存
  saveState();
}

// KMLファイルをインポート
function handleImportKml() {
  const fileInput = document.getElementById('kmlFileInput');
  fileInput.click();

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const newSource = await loadKmlFromFile(file);
      state.dataSources.push(newSource);
      addDataSourceRow(newSource);
      await loadAllDataSources();
      showMessage(`KML file "${file.name}" loaded successfully`);
    } catch (error) {
      // エラーメッセージはloadKmlFromFile内で表示される
    } finally {
      fileInput.value = '';
    }
  };
}

// TXTまたはJSONファイルをインポート
function handleImportTxt() {
  const fileInput = document.getElementById('txtFileInput');
  fileInput.click();

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const content = await file.text();
      
      // loadAllDataSourcesで地図にフィーチャーが読み込まれるのを待つ
      // （ファイル処理前にフィーチャーが必要）
      await loadAllDataSources();

      // ファイルの内容を解析してフィーチャーを自動選択
      processAndSelectFeaturesFromFile(content, file.name);
      
      showMessage(`File "${file.name}" processed`);
    } catch (error) {
      console.error('Error importing file:', error);
      showMessage('Failed to load file', true);
    } finally {
      fileInput.value = '';
    }
  };
}

// アプリケーションを初期化
function init() {
  console.log('Initializing TopoJSON Viewer...');
  initMap();

  const debouncedLoad = debounce(loadAllDataSources, 300);

  const elements = [
    { id: 'loadBtn', event: 'click', handler: loadAllDataSources },
    { id: 'clearBtn', event: 'click', handler: confirmClear },
    { id: 'shareBtn', event: 'click', handler: shareUrl },
    { id: 'searchBtn', event: 'click', handler: searchAddress },
    { id: 'search', event: 'keypress', handler: e => e.key === 'Enter' && searchAddress() },
    { id: 'exportKmlBtn', event: 'click', handler: exportKml },
    { id: 'importKmlBtn', event: 'click', handler: handleImportKml },
    { id: 'exportTxtBtn', event: 'click', handler: exportTxt },
    { id: 'importTxtBtn', event: 'click', handler: handleImportTxt },
    { id: 'showAddress', event: 'change', handler: toggleAddressDisplay },
    { id: 'autoMove', event: 'change', handler: saveState },
    { id: 'kmlMode', event: 'change', handler: saveState },
    { id: 'simplify', event: 'change', handler: () => { saveState(); loadAllDataSources(); } },
    { id: 'tolerance', event: 'input', handler: () => { saveState(); debouncedLoad(); } },
    { id: 'title', event: 'input', handler: () => {
      document.title = document.getElementById('title').value || 'TopoJSON Viewer';
      saveState();
    }}
  ];

  elements.forEach(({ id, event, handler }) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener(event, handler);
    else console.warn(`Element with id '${id}' not found`);
  });

  setupMapEvents();
  setupKeyEvents();
  setupPrint();

  const stateLoaded = loadState();
  const clearFlag = localStorage.getItem('clearAllFlag');

  // クリアフラグが設定されている場合は削除
  if (clearFlag) {
    localStorage.removeItem('clearAllFlag');
  }

  // クリアフラグが設定されていない、かつデータソースがある場合にのみ読み込み
  if (stateLoaded && getDataSources().length > 0 && !clearFlag) {
    setTimeout(loadAllDataSources, 100);
  }

  const dataSourcesContainer = document.getElementById('data-sources');
  // クリアフラグが設定されていない、かつデータソースがUIにない場合にのみ空の行を追加
  if (!clearFlag && dataSourcesContainer && dataSourcesContainer.children.length === 0) {
    addDataSourceRow({ type: 'url', url: '', color: randomColor() });
  }

  window.addEventListener('beforeunload', saveState);
  setInterval(saveState, 1000);

  console.log('TopoJSON Viewer initialization completed');
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', init);
