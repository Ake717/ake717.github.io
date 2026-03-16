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

  // 新しく追加されたレイヤーの境界を追跡
  const newLayerBounds = [];

  // 新規データソースのみを読み込んでマップに追加
  for (const source of newDataSources) {
    try {
      const geoJson = await source.load();
      const layerGroup = L.geoJSON(geoJson, {
        style: { color: source.color, weight: source.isKml ? 2 : 1, opacity: 0.7, fillOpacity: 0.15 },
        onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, source),
        renderer: L.svg({ padding: document.getElementById('alwaysShowFeatures')?.checked ? 1.0 : 0.1 })
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

  // ハッチングスタイルを適用
  updateHatchStyles();

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
    { id: 'showAddress', checked: false },
    { id: 'autoMove', checked: true },
    { id: 'kmlMode', checked: false },
    { id: 'hatchUnselected', checked: false },
    { id: 'alwaysShowFeatures', checked: false }
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

// KMLデータソースを直接ロードしてマップに表示
async function loadKmlSourceDirectly(source) {
  try {
    // KMLデータをロード
    const geoJson = await source.load();

    // GeoJSONをマップに追加
    const layerGroup = L.geoJSON(geoJson, {
      style: { color: source.color, weight: source.isKml ? 2 : 1, opacity: 0.7, fillOpacity: 0.15 },
      onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, source),
      renderer: L.svg({ padding: document.getElementById('alwaysShowFeatures')?.checked ? 1.0 : 0.1 })
    }).addTo(state.map);

    // レイヤーを状態に保存
    state.layers.set(source.id, layerGroup);

    // 自動移動が有効な場合は新しいフィーチャーの位置に移動
    const autoMoveEnabled = document.getElementById('autoMove')?.checked ?? CONFIG.AUTO_MOVE_TO_NEW_FEATURES;
    if (autoMoveEnabled && layerGroup.getBounds().isValid()) {
      try {
        state.map.fitBounds(layerGroup.getBounds(), { padding: [20, 20] });
      } catch (e) {
        console.error('Failed to move to new KML features:', e);
      }
    }

    // ハッチングスタイルを適用
    updateHatchStyles();

    console.log(`KML source "${source.name}" loaded directly to map`);
  } catch (error) {
    console.error('Error loading KML source directly:', error);
    throw error;
  }
}

// KMLファイルをインポート
function handleImportKml() {
  const fileInput = document.getElementById('kmlFileInput');
  fileInput.click();

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // KMLファイルを読み込み、データソースを作成
      const newSource = await loadKmlFromFile(file);
      
      // 新しいKMLデータソースを状態に追加
      state.dataSources.push(newSource);
      
      // UIにデータソース行を追加
      addDataSourceRow(newSource);
      
      // KMLデータを直接ロードしてマップに表示
      await loadKmlSourceDirectly(newSource);
      
      showMessage(`KML file "${file.name}" loaded successfully`);
    } catch (error) {
      console.error('KML import error:', error);
      showMessage('KMLファイルのインポートに失敗しました', true);
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
    { id: 'searchBtn', event: 'click', handler: searchAddress },
    { id: 'search', event: 'keypress', handler: e => e.key === 'Enter' && searchAddress() },
    { id: 'exportKmlBtn', event: 'click', handler: exportKml },
    { id: 'importKmlBtn', event: 'click', handler: handleImportKml },
    { id: 'exportTxtBtn', event: 'click', handler: exportTxt },
    { id: 'importTxtBtn', event: 'click', handler: handleImportTxt },
    { id: 'showAddress', event: 'change', handler: toggleAddressDisplay },
    { id: 'autoMove', event: 'change', handler: saveState },
    { id: 'kmlMode', event: 'change', handler: () => {
      if (document.getElementById('showAddress')?.checked) {
        toggleAddressDisplay(); // 内部で saveState() も呼ぶ
      } else {
        saveState();
      }
    }},
    { id: 'hideUnselected', event: 'change', handler: () => {
      updateLayerVisibility();
      saveState();
    }},
    { id: 'hatchUnselected', event: 'change', handler: updateHatchStyles },
    { id: 'alwaysShowFeatures', event: 'change', handler: saveState },
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

// SVGハッチパターン定義を一度だけドキュメントに注入する
function injectHatchPatternDefs() {
  if (document.getElementById('kmlHatchPatternSvg')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'kmlHatchPatternSvg';
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  svg.innerHTML = `<defs>
    <pattern id="kmlHatchPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45 0 0)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#333" stroke-width="1.5" stroke-opacity="0.45"/>
    </pattern>
  </defs>`;
  document.body.insertBefore(svg, document.body.firstChild);
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
  injectHatchPatternDefs();
  init();
});
