// URLデータソースを作成
function createUrlSource(url, color) {
  return {
    type: 'url',
    id: url,
    url,
    color,
    isKml: false,
    get name() { return this.url; },
    async load() {
      try {
        const res = await fetch(this.url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const topo = await res.json();
        const key = Object.keys(topo.objects)[0];
        return topojson.feature(topo, topo.objects[key]);
      } catch (e) {
        console.error(e);
        showMessage('Load error: ' + this.url, true);
        throw e;
      }
    }
  };
}

// ジオメトリを簡略化
function simplifyGeo(geo, tolerance) {
  const simpRing = ring => simplify(ring.map(([x, y]) => ({ x, y })), tolerance, true).map(p => [p.x, p.y]);
  const simpPoly = poly => poly.map(simpRing);
  const simpGeom = g => {
    if (g.type === 'Polygon') return { ...g, coordinates: simpPoly(g.coordinates) };
    if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map(simpPoly) };
    return g;
  };
  return { ...geo, features: geo.features.map(f => ({ ...f, geometry: simpGeom(f.geometry) })) };
}

// ポリゴン内の点をチェック
function pointInPolygon(point, coordinates) {
  const [px, py] = point;
  let inside = false;
  const ring = coordinates[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  for (let h = 1; h < coordinates.length; h++) {
    const hole = coordinates[h];
    let inHole = false;
    for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
      const [xi, yi] = hole[i];
      const [xj, yj] = hole[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inHole = !inHole;
      }
    }
    if (inHole) inside = false;
  }
  return inside;
}

// 点とポリゴンの距離を計算
function pointToPolygonDistance(point, coordinates) {
  const [px, py] = point;
  let minDistSq = Infinity;
  for (const ring of coordinates) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      let dx = x2 - x1, dy = y2 - y1;
      let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      let closestX = x1 + t * dx;
      let closestY = y1 + t * dy;
      minDistSq = Math.min(minDistSq, (px - closestX) ** 2 + (py - closestY) ** 2);
    }
  }
  return Math.sqrt(minDistSq);
}

// ポリゴンのラベル位置を取得
function getPolygonLabelPosition(coordinates) {
  if (!coordinates?.[0] || coordinates[0].length < 3) return null;
  const ring = coordinates[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const cellSize = Math.min(maxX - minX, maxY - minY) / 20;
  if (cellSize === 0) return null;
  let bestDist = 0, bestPoint = null;
  for (let x = minX; x <= maxX; x += cellSize) {
    for (let y = minY; y <= maxY; y += cellSize) {
      if (pointInPolygon([x, y], coordinates)) {
        const dist = pointToPolygonDistance([x, y], coordinates);
        if (dist > bestDist) { bestDist = dist; bestPoint = [x, y]; }
      }
    }
  }
  if (!bestPoint) return null;
  const fineSize = cellSize / 4;
  for (let x = bestPoint[0] - cellSize; x <= bestPoint[0] + cellSize; x += fineSize) {
    for (let y = bestPoint[1] - cellSize; y <= bestPoint[1] + cellSize; y += fineSize) {
      if (pointInPolygon([x, y], coordinates)) {
        const dist = pointToPolygonDistance([x, y], coordinates);
        if (dist > bestDist) { bestDist = dist; bestPoint = [x, y]; }
      }
    }
  }
  return [bestPoint[1], bestPoint[0]];
}

// フィーチャのラベル位置を取得
function getFeatureLabelPosition(feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') return getPolygonLabelPosition(geom.coordinates);
  if (geom.type === 'MultiPolygon') {
    let maxArea = 0, bestPosition = null;
    for (const polygon of geom.coordinates) {
      const position = getPolygonLabelPosition(polygon);
      if (position) {
        const ring = polygon[0];
        let area = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
        }
        if ((area /= 2) > maxArea) { maxArea = area; bestPosition = position; }
      }
    }
    return bestPosition;
  }
  return null;
}

// ファイルからKMLを読み込み、データソースとして返す
async function loadKmlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const kmlText = e.target.result;
        const geoJson = parseKmlToGeoJson(kmlText);
        const id = `kml_${file.name}_${file.lastModified}`;
        const color = randomColor();
        const name = file.name;

        // KMLデータをキャッシュに保存
        const kmlCache = JSON.parse(localStorage.getItem('kmlCache')) || {};
        kmlCache[id] = { geoJson, color, name };
        localStorage.setItem('kmlCache', JSON.stringify(kmlCache));

        resolve(createKmlSource(id, name, color));
      } catch (error) {
        console.error('KML parse error:', error);
        showMessage('KMLファイルの読み込みに失敗しました: ' + error.message, true);
        reject(error);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// KMLデータソースを作成
function createKmlSource(id, name, color) {
  return {
    type: 'kml',
    id,
    name,
    color,
    isKml: true,
    async load() {
      const kmlCache = JSON.parse(localStorage.getItem('kmlCache')) || {};
      const cachedData = kmlCache[this.id];
      if (cachedData) {
        this.color = cachedData.color; // キャッシュの色を反映
        return cachedData.geoJson;
      }
      throw new Error(`KML data with id "${this.id}" not found in cache.`);
    },
  };
}

// KMLをGeoJSONに変換
function parseKmlToGeoJson(kmlText) {
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const features = [];
  const placemarks = kmlDoc.querySelectorAll('Placemark');

  placemarks.forEach((placemark, index) => {
    const name = placemark.querySelector('name')?.textContent || `Feature ${index + 1}`;

    // Point
    const point = placemark.querySelector('Point coordinates');
    if (point) {
      const coords = parseKmlCoordinates(point.textContent.trim());
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords[0]
          },
          properties: {
            name: name,
            id: `kml_point_${index}`
          }
        });
      }
    }

    // LineString
    const lineString = placemark.querySelector('LineString coordinates');
    if (lineString) {
      const coords = parseKmlCoordinates(lineString.textContent.trim());
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords
          },
          properties: {
            name: name,
            id: `kml_linestring_${index}`
          }
        });
      }
    }

    // Polygon
    const polygon = placemark.querySelector('Polygon');
    if (polygon) {
      const outerBoundary = polygon.querySelector('outerBoundaryIs LinearRing coordinates');
      const innerBoundaries = polygon.querySelectorAll('innerBoundaryIs LinearRing coordinates');

      if (outerBoundary) {
        const outerCoords = parseKmlCoordinates(outerBoundary.textContent.trim());
        const coordinates = [outerCoords];

        innerBoundaries.forEach(inner => {
          const innerCoords = parseKmlCoordinates(inner.textContent.trim());
          if (innerCoords.length > 0) {
            coordinates.push(innerCoords);
          }
        });

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: coordinates
          },
          properties: {
            name: name,
            id: `kml_polygon_${index}`
          }
        });
      }
    }

    // MultiGeometry
    const multiGeometry = placemark.querySelector('MultiGeometry');
    if (multiGeometry) {
      const multiFeatures = parseMultiGeometry(multiGeometry, name, index);
      features.push(...multiFeatures);
    }
  });

  return {
    type: 'FeatureCollection',
    features: features
  };
}

// KML座標文字列をパース
function parseKmlCoordinates(coordString) {
  return coordString.split(/\s+/)
    .filter(coord => coord.trim())
    .map(coord => {
      const [lng, lat, alt] = coord.split(',').map(parseFloat);
      return [lng, lat]; // GeoJSONは[経度, 緯度]の順
    });
}

// MultiGeometryをパース
function parseMultiGeometry(multiGeometry, baseName, baseIndex) {
  const features = [];
  let subIndex = 0;

  // Points
  const points = multiGeometry.querySelectorAll('Point');
  points.forEach(point => {
    const coordsEl = point.querySelector('coordinates');
    if (coordsEl) {
      const coords = parseKmlCoordinates(coordsEl.textContent.trim());
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords[0]
          },
          properties: {
            name: `${baseName} (Point ${subIndex + 1})`,
            id: `kml_multi_point_${baseIndex}_${subIndex}`
          }
        });
        subIndex++;
      }
    }
  });

  // LineStrings
  const lineStrings = multiGeometry.querySelectorAll('LineString');
  lineStrings.forEach(lineString => {
    const coordsEl = lineString.querySelector('coordinates');
    if (coordsEl) {
      const coords = parseKmlCoordinates(coordsEl.textContent.trim());
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords
          },
          properties: {
            name: `${baseName} (Line ${subIndex + 1})`,
            id: `kml_multi_linestring_${baseIndex}_${subIndex}`
          }
        });
        subIndex++;
      }
    }
  });

  // Polygons
  const polygons = multiGeometry.querySelectorAll('Polygon');
  polygons.forEach(polygon => {
    const outerBoundary = polygon.querySelector('outerBoundaryIs LinearRing coordinates');
    if (outerBoundary) {
      const outerCoords = parseKmlCoordinates(outerBoundary.textContent.trim());
      const coordinates = [outerCoords];

      const innerBoundaries = polygon.querySelectorAll('innerBoundaryIs LinearRing coordinates');
      innerBoundaries.forEach(inner => {
        const innerCoords = parseKmlCoordinates(inner.textContent.trim());
        if (innerCoords.length > 0) {
          coordinates.push(innerCoords);
        }
      });

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: coordinates
        },
        properties: {
          name: `${baseName} (Polygon ${subIndex + 1})`,
          id: `kml_multi_polygon_${baseIndex}_${subIndex}`
        }
      });
      subIndex++;
    }
  });

  return features;
}


// KMLエクスポート
function exportKml() {
  try {
    console.log('Export KML started');
    console.log('Selected layers count:', state.selectedLayers.size);

    if (!state.selectedLayers.size) {
      showMessage('エクスポートするフィーチャが選択されていません', true);
      return;
    }

    const simplify = document.getElementById('simplify').checked;
    const tolerance = parseFloat(document.getElementById('tolerance').value) || 0;

    const coords2kml = coords => coords.map(c => `${c[0]},${c[1]},0`).join(' ');
    const makePoly = (exterior, holes = []) => {
      let p = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords2kml(exterior)}</coordinates></LinearRing></outerBoundaryIs>`;
      holes.forEach(h => p += `<innerBoundaryIs><LinearRing><coordinates>${coords2kml(h)}</coordinates></LinearRing></innerBoundaryIs>`);
      return p + '</Polygon>';
    };

    let kmlContent = '';
    let processedCount = 0;

    state.selectedLayers.forEach(layer => {
      const layerId = L.Util.stamp(layer);
      const data = state.featureData.get(layerId);

      console.log('Processing layer:', layerId, 'Data found:', !!data);

      if (!data) {
        console.warn('No data found for layer:', layerId);
        return;
      }

      let { feature, name } = data;

      if (simplify && tolerance > 0) {
        const simplifiedGeo = simplifyGeo({ type: 'FeatureCollection', features: [feature] }, tolerance);
        feature = simplifiedGeo.features[0];
      }

      const geom = feature.geometry;

      console.log('Feature geometry type:', geom.type, 'Name:', name);

      let placemark = `<Placemark><name>${escapeXml(name)}</name>`;

      if (geom.type === 'Polygon') {
        placemark += makePoly(geom.coordinates[0], geom.coordinates.slice(1));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => placemark += makePoly(poly[0], poly.slice(1)));
      } else {
        console.warn('Unsupported geometry type:', geom.type);
        return;
      }

      placemark += '</Placemark>';
      kmlContent += placemark;
      processedCount++;
    });

    console.log('Processed features count:', processedCount);

    if (!kmlContent) {
      showMessage('有効なフィーチャが見つかりませんでした', true);
      return;
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${kmlContent}</Document></kml>`;

    console.log('Generated KML length:', kml.length);

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('title').value || 'features') + '.kml';

    console.log('Download filename:', a.download);

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    showMessage(`${processedCount}個のフィーチャをエクスポートしました`);
    console.log('Export KML completed successfully');

  } catch (error) {
    console.error('Export KML error:', error);
    showMessage('KMLエクスポート中にエラーが発生しました: ' + error.message, true);
  }
}
