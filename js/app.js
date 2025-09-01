// すべてのデータソースを読み込む
async function loadAllDataSources() {
  clearAllDataSources();
  state.dataSources = [];

  const sourceData = getDataSources();
  for (const data of sourceData) {
    if (data.type === 'url' && data.url) {
      state.dataSources.push(createUrlSource(data.url, data.color));
    } else if (data.type === 'kml' && data.id) {
      state.dataSources.push(createKmlSource(data.id, data.name, data.color));
    }
  }

  const simplify = document.getElementById('simplify').checked;
  const tolerance = parseFloat(document.getElementById('tolerance').value) || 0;

  for (const source of state.dataSources) {
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
    } catch (e) {
      console.error(`Failed to load data source: ${source.name}`, e);
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
  state.layers.forEach(layer => state.map.removeLayer(layer));
  state.layers.clear();
  state.featureData.clear();
  state.addressLabels.forEach(marker => state.map.removeLayer(marker));
  state.addressLabels.clear();
  state.selectedLayers.clear();
  if (state.marker) state.map.removeLayer(state.marker);
  state.marker = null;
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
      fileInput.value = ''; // 同じファイルを連続で選択できるようにする
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
    { id: 'toggleUI', event: 'click', handler: toggleUI },
    { id: 'showAddress', event: 'change', handler: toggleAddressDisplay },
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
  if (stateLoaded && getDataSources().length > 0) {
    setTimeout(loadAllDataSources, 100);
  }

  const dataSourcesContainer = document.getElementById('data-sources');
  if (dataSourcesContainer && dataSourcesContainer.children.length === 0) {
    addDataSourceRow({ type: 'url', url: '', color: randomColor() });
  }

  window.addEventListener('beforeunload', saveState);
  setInterval(saveState, 1000);

  console.log('TopoJSON Viewer initialization completed');
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', init);
