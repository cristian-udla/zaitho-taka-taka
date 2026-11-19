// Motor de Visión Local 100% en el Celular (Rostro + Objetos/Obstáculos + Entrenamiento)
// Cero dependencia de servidor externo o internet.
import jpeg from 'jpeg-js';

const B64_LOOKUP = new Uint8Array(256);
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

function base64ToUint8Array(b64) {
  const clean = (b64 || '').replace(/^data:image\/\w+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  if (!len) return new Uint8Array(0);
  let pad = 0;
  if (clean[len - 1] === '=') pad++;
  if (clean[len - 2] === '=') pad++;
  const out = new Uint8Array((len * 3) / 4 - pad);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = B64_LOOKUP[clean.charCodeAt(i)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c4 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    out[p++] = (c1 << 2) | (c2 >> 4);
    if (p < out.length) out[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (p < out.length) out[p++] = ((c3 & 3) << 6) | c4;
  }
  return out;
}

function decodeSampledRgb(base64, targetW = 72) {
  const bytes = base64ToUint8Array(base64);
  if (!bytes.length) return null;
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  if (!decoded || !decoded.width || !decoded.height) return null;

  const srcW = decoded.width;
  const srcH = decoded.height;
  const data = decoded.data;
  const w = Math.min(targetW, srcW);
  const h = Math.max(24, Math.round((srcH * w) / srcW));
  const rgb = new Uint8Array(w * h * 3);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
      const si = (sy * srcW + sx) * 4;
      const di = (y * w + x) * 3;
      rgb[di] = data[si];
      rgb[di + 1] = data[si + 1];
      rgb[di + 2] = data[si + 2];
    }
  }
  return { w, h, rgb };
}

export function extractLocalFeature(base64, normBox = null) {
  const frame = decodeSampledRgb(base64, 64);
  if (!frame) return null;
  return extractFeatureFromRgb(frame.rgb, frame.w, frame.h, normBox);
}

function extractFeatureFromRgb(rgb, w, h, normBox = null) {
  const x1 = normBox ? Math.max(0, Math.floor(normBox[0] * w)) : Math.floor(w * 0.15);
  const y1 = normBox ? Math.max(0, Math.floor(normBox[1] * h)) : Math.floor(h * 0.15);
  const x2 = normBox ? Math.min(w, Math.ceil(normBox[2] * w)) : Math.ceil(w * 0.85);
  const y2 = normBox ? Math.min(h, Math.ceil(normBox[3] * h)) : Math.ceil(h * 0.85);
  const rw = Math.max(1, x2 - x1);
  const rh = Math.max(1, y2 - y1);

  // Grid 4x4 de luminancia normalizada (16 dims) + promedio RGB por cuadrante 2x2 (12 dims) = 28 dims
  const lumGrid = new Array(16).fill(0);
  const lumCnt = new Array(16).fill(0);
  const rgbQuad = new Array(12).fill(0);
  const rgbCnt = new Array(4).fill(0);

  for (let y = y1; y < y2; y++) {
    const gy = Math.min(3, Math.floor(((y - y1) * 4) / rh));
    const qy = Math.min(1, Math.floor(((y - y1) * 2) / rh));
    for (let x = x1; x < x2; x++) {
      const gx = Math.min(3, Math.floor(((x - x1) * 4) / rw));
      const qx = Math.min(1, Math.floor(((x - x1) * 2) / rw));
      const idx = (y * w + x) * 3;
      const r = rgb[idx];
      const g = rgb[idx + 1];
      const b = rgb[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const gIdx = gy * 4 + gx;
      lumGrid[gIdx] += luma;
      lumCnt[gIdx]++;

      const qIdx = qy * 2 + qx;
      rgbQuad[qIdx * 3] += r;
      rgbQuad[qIdx * 3 + 1] += g;
      rgbQuad[qIdx * 3 + 2] += b;
      rgbCnt[qIdx]++;
    }
  }

  for (let i = 0; i < 16; i++) lumGrid[i] = lumCnt[i] ? lumGrid[i] / lumCnt[i] : 0;
  const meanL = lumGrid.reduce((a, b) => a + b, 0) / 16;
  for (let i = 0; i < 16; i++) lumGrid[i] -= meanL;

  for (let q = 0; q < 4; q++) {
    const c = rgbCnt[q] || 1;
    rgbQuad[q * 3] /= c * 255;
    rgbQuad[q * 3 + 1] /= c * 255;
    rgbQuad[q * 3 + 2] /= c * 255;
  }

  const vec = [...lumGrid.map((v) => v / 128), ...rgbQuad];
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) + 1e-8;
  return vec.map((v) => Number((v / norm).toFixed(4)));
}

function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function matchFeatureInDb(vec, visionDb = [], category = 'auto') {
  if (!vec) return { entry: null, score: 0 };
  let best = null;
  let bestScore = 0;
  for (const item of visionDb) {
    if (!Array.isArray(item?.vec)) continue;
    if (category !== 'auto' && item.category !== category) continue;
    const sc = cosineSim(vec, item.vec);
    if (sc > bestScore) {
      bestScore = sc;
      best = item;
    }
  }
  return { entry: best, score: bestScore };
}

/**
 * Detector local rápido en el celular:
 * - Rostros (YCbCr skin-tone clustering)
 * - Plantas y objetos prominentes (bloques 8x6 de contraste/color)
 */
export function analyzeFrameLocalYolo({ base64, visionDb = [], category = 'auto', mode = 'identify' }) {
  const frame = decodeSampledRgb(base64, 72);
  if (!frame) return { ok: false, error: 'Frame inválido' };

  const { w, h, rgb } = frame;

  // 1) DETECTOR FACIAL POR COMPONENTES CONECTADOS (BFS 16x12 + filtro de contraste facial)
  // Evita encuadrar paredes o toda la pantalla y limpia rápido al salir de cámara.
  const gw = 16;
  const gh = 12;
  const cellSkin = new Uint16Array(gw * gh);
  const cellGreen = new Uint16Array(gw * gh);
  const cellSat = new Float32Array(gw * gh);
  const cellLumaSum = new Float32Array(gw * gh);
  const cellLumaSq = new Float32Array(gw * gh);
  const cellTotal = new Uint16Array(gw * gh);

  for (let y = 0; y < h; y++) {
    const cy = Math.min(gh - 1, Math.floor((y * gh) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(gw - 1, Math.floor((x * gw) / w));
      const i = (y * w + x) * 3;
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const cIdx = cy * gw + cx;
      cellTotal[cIdx]++;
      cellLumaSum[cIdx] += luma;
      cellLumaSq[cIdx] += luma * luma;

      // Rango estricto de piel humana bajo luz normal/interior
      if (cb >= 80 && cb <= 126 && cr >= 134 && cr <= 172 && r > g && r > b && luma > 45 && luma < 235) {
        cellSkin[cIdx]++;
      }
      if (g > r + 16 && g > b + 12 && g > 55) {
        cellGreen[cIdx]++;
      }
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      cellSat[cIdx] += mx > 0 ? (mx - mn) / mx : 0;
    }
  }

  const isSkinCell = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    const tot = cellTotal[i] || 1;
    if (cellSkin[i] / tot >= 0.48) {
      isSkinCell[i] = 1;
    }
  }

  // BFS para encontrar componentes conectados de piel y elegir solo el rostro real
  const visited = new Uint8Array(gw * gh);
  let bestFace = null;

  for (let sy = 0; sy < gh; sy++) {
    for (let sx = 0; sx < gw; sx++) {
      const start = sy * gw + sx;
      if (!isSkinCell[start] || visited[start]) continue;

      const queue = [start];
      visited[start] = 1;
      let minCx = sx, maxCx = sx, minCy = sy, maxCy = sy;
      let compCells = 0;
      let sumL = 0, sumL2 = 0, pixTot = 0;

      while (queue.length > 0) {
        const curr = queue.pop();
        const cx = curr % gw;
        const cy = Math.floor(curr / gw);
        compCells++;
        minCx = Math.min(minCx, cx);
        maxCx = Math.max(maxCx, cx);
        minCy = Math.min(minCy, cy);
        maxCy = Math.max(maxCy, cy);
        sumL += cellLumaSum[curr];
        sumL2 += cellLumaSq[curr];
        pixTot += cellTotal[curr];

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) {
            const ni = ny * gw + nx;
            if (isSkinCell[ni] && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }

      const wNorm = (maxCx - minCx + 1) / gw;
      const hNorm = (maxCy - minCy + 1) / gh;
      const aspect = wNorm / Math.max(hNorm, 0.01);
      const meanL = sumL / Math.max(pixTot, 1);
      const lumaVar = Math.max(0, sumL2 / Math.max(pixTot, 1) - meanL * meanL);
      const lumaStd = Math.sqrt(lumaVar);

      // Filtros de rostro real: no demasiado pequeño, no cubre toda la pantalla, aspecto facial y textura de ojos/boca
      if (
        compCells >= 2 &&
        wNorm >= 0.11 &&
        hNorm >= 0.15 &&
        !(wNorm > 0.72 && hNorm > 0.78) &&
        aspect >= 0.5 &&
        aspect <= 1.65 &&
        lumaStd >= 9.5
      ) {
        const fillRatio = compCells / ((maxCx - minCx + 1) * (maxCy - minCy + 1));
        const score = compCells * fillRatio;
        if (!bestFace || score > bestFace.score) {
          bestFace = {
            score,
            x1: minCx / gw,
            y1: minCy / gh,
            x2: (maxCx + 1) / gw,
            y2: (maxCy + 1) / gh,
          };
        }
      }
    }
  }

  let faceBox = null;
  let facePos = 'none';
  let faceDist = 'ok';
  let faceCx = 0.5;
  let faceCy = 0.5;
  let facesFound = 0;

  if (bestFace) {
    facesFound = 1;
    const x1 = Math.max(0, bestFace.x1);
    const y1 = Math.max(0, bestFace.y1);
    const x2 = Math.min(1, bestFace.x2);
    const y2 = Math.min(1, bestFace.y2);
    faceBox = [Number(x1.toFixed(3)), Number(y1.toFixed(3)), Number(x2.toFixed(3)), Number(y2.toFixed(3))];
    faceCx = Number(((x1 + x2) * 0.5).toFixed(3));
    faceCy = Number(((y1 + y2) * 0.5).toFixed(3));
    const wRatio = x2 - x1;
    facePos = faceCx < 0.36 ? 'left' : faceCx > 0.64 ? 'right' : 'center';
    faceDist = wRatio < 0.18 ? 'far' : wRatio > 0.48 ? 'close' : 'ok';
  }

  let matchedFace = { entry: null, score: 0 };
  if (faceBox) {
    const fVec = extractFeatureFromRgb(rgb, w, h, faceBox);
    matchedFace = matchFeatureInDb(fVec, visionDb, 'face');
  }
  const recognizedFace = !!(matchedFace.entry && matchedFace.score >= 0.85);

  if (mode === 'follow' && category === 'face') {
    return {
      ok: true,
      facesFound,
      facePosition: facePos,
      faceDistance: faceDist,
      faceBox,
      faceCx,
      faceCy,
      recognized: recognizedFace,
      matchedLabel: recognizedFace ? matchedFace.entry.label : null,
      similarity: Number(matchedFace.score.toFixed(3)),
      detections: [],
    };
  }

  // 2) DETECTOR DE OBJETOS / OBSTÁCULOS LOCALES (Plantas + Objetos prominentes)
  const detections = [];

  // A) Plantas verdes
  let gxMin = gw, gxMax = -1, gyMin = gh, gyMax = -1, greenCells = 0;
  // B) Objeto prominente saturado / cercano en el centro-frente
  let oxMin = gw, oxMax = -1, oyMin = gh, oyMax = -1, objCells = 0;

  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      const idx = cy * gw + cx;
      const tot = cellTotal[idx] || 1;
      const isGreen = cellGreen[idx] / tot > 0.38;
      const avgSat = cellSat[idx] / tot;
      const isSkin = cellSkin[idx] / tot >= 0.42;

      if (isGreen) {
        greenCells++;
        if (cx < gxMin) gxMin = cx;
        if (cx > gxMax) gxMax = cx;
        if (cy < gyMin) gyMin = cy;
        if (cy > gyMax) gyMax = cy;
      } else if (!isSkin && avgSat > 0.32) {
        objCells++;
        if (cx < oxMin) oxMin = cx;
        if (cx > oxMax) oxMax = cx;
        if (cy < oyMin) oyMin = cy;
        if (cy > oyMax) oyMax = cy;
      }
    }
  }

  const pushBoxDetection = (cMinX, cMinY, cMaxX, cMaxY, defaultLabel, defaultEs, baseConf) => {
    const x1 = Number((cMinX / gw).toFixed(3));
    const y1 = Number((cMinY / gh).toFixed(3));
    const x2 = Number(((cMaxX + 1) / gw).toFixed(3));
    const y2 = Number(((cMaxY + 1) / gh).toFixed(3));
    const normBox = [x1, y1, x2, y2];
    const areaRatio = Number(((x2 - x1) * (y2 - y1)).toFixed(3));
    const cx = (x1 + x2) * 0.5;
    const pos = cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'center';
    const isClose = areaRatio > 0.16 || y2 > 0.78;

    const vec = extractFeatureFromRgb(rgb, w, h, normBox);
    const m = matchFeatureInDb(vec, visionDb, 'auto');
    const known = !!(m.entry && m.score >= 0.85);

    detections.push({
      label: defaultLabel,
      labelEs: defaultEs,
      customLabel: known ? m.entry.label : null,
      known,
      confidence: baseConf,
      conf: baseConf,
      position: pos,
      areaRatio,
      close: isClose,
      normBox,
    });
  };

  if (greenCells >= 3) {
    pushBoxDetection(gxMin, gyMin, gxMax, gyMax, 'potted plant', 'planta', 0.76);
  }
  if (objCells >= 4) {
    pushBoxDetection(oxMin, oyMin, oxMax, oyMax, 'object', 'objeto', 0.68);
  }

  detections.sort((a, b) => b.areaRatio * b.confidence - a.areaRatio * a.confidence);

  return {
    ok: true,
    facesFound,
    facePosition: facePos,
    faceDistance: faceDist,
    faceBox,
    faceCx,
    faceCy,
    recognized: recognizedFace,
    matchedLabel: recognizedFace ? matchedFace.entry.label : null,
    matchedCategory: recognizedFace ? matchedFace.entry.category : category,
    similarity: Number(matchedFace.score.toFixed(3)),
    detections: detections.slice(0, 4),
  };
}
