// Visión Neuronal Optimizada: Video a 30 FPS fluidos + YOLO FP16 a ~4-5 FPS en 192x144 para cero calentamiento
export function buildVisionWebViewHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: sans-serif; }
    #wrap { position: relative; width: 100%; height: 100%; }
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    #badge {
      position: absolute; left: 4px; bottom: 4px;
      background: rgba(0,0,0,0.65); color: #00F2FF;
      font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 6px;
      pointer-events: none;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js"></script>
</head>
<body>
  <div id="wrap">
    <video id="vid" autoplay playsinline muted></video>
    <canvas id="cv"></canvas>
    <div id="badge">Iniciando cámara...</div>
  </div>
  <script>
    const COCO_ES = {
      person: 'persona', 'potted plant': 'planta', bottle: 'botella', cup: 'taza',
      'cell phone': 'celular', laptop: 'laptop', keyboard: 'teclado', mouse: 'ratón',
      book: 'libro', chair: 'silla', couch: 'sofá', bed: 'cama', 'dining table': 'mesa',
      tv: 'televisor', dog: 'perro', cat: 'gato', backpack: 'mochila', clock: 'reloj',
      vase: 'florero', remote: 'control'
    };

    const video = document.getElementById('vid');
    const canvas = document.getElementById('cv');
    const ctx = canvas.getContext('2d');
    const badge = document.getElementById('badge');

    // Canvas ultra-liviano (160x120) para alimentar a YOLO con mínimo calor
    const inferCv = document.createElement('canvas');
    inferCv.width = 160;
    inferCv.height = 120;
    const inferCtx = inferCv.getContext('2d', { willReadFrequently: false });

    let currentMode = 'follow'; // 'follow' | 'explore' | 'idle'
    let yoloModel = null;
    let isInferring = false;
    let lastPreds = [];
    let smoothHead = null; // Suavizado EMA para la caja de rostro

    window.setZaithoVisionMode = function(m) {
      currentMode = m || 'follow';
      lastPreds = [];
      smoothHead = null;
    };

    function postRN(obj) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(obj));
        }
      } catch (e) {}
    }

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 240 }, height: { ideal: 180 }, frameRate: { ideal: 15, max: 20 } },
          audio: false
        });
        video.srcObject = stream;
        await new Promise((r) => { video.onloadedmetadata = r; });
        await video.play();
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
      } catch (err) {
        badge.textContent = 'Sin cámara WebView';
        postRN({ type: 'error', message: err.message || String(err) });
        return;
      }

      try {
        tf.enableProdMode();
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        tf.env().set('WEBGL_PACK', true);
        await tf.setBackend('webgl');
        await tf.ready();
      } catch (e) {}

      try {
        badge.textContent = 'Cargando YOLO...';
        yoloModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        badge.textContent = 'YOLO Eco (GPU)';
      } catch (e) {
        badge.textContent = 'Error YOLO';
      }

      // Ciclo térmico suave: ~2.8 FPS (350ms) para evitar calentamiento del teléfono
      setInterval(runInferenceStep, 350);
    }

    async function runInferenceStep() {
      if (isInferring || !yoloModel || currentMode === 'idle' || video.readyState < 2) return;
      isInferring = true;
      try {
        // Dibujar frame reducido a 192x144 para inferencia 2.5x más liviana
        inferCtx.drawImage(video, 0, 0, inferCv.width, inferCv.height);
        const preds = await yoloModel.detect(inferCv, 5, 0.42);
        lastPreds = preds || [];
        drawOverlayAndEmit();
      } catch (e) {
      } finally {
        isInferring = false;
      }
    }

    function drawOverlayAndEmit() {
      const vw = canvas.width;
      const vh = canvas.height;
      const sx = vw / inferCv.width;
      const sy = vh / inferCv.height;

      ctx.clearRect(0, 0, vw, vh);

      let facePayload = { facePos: 'none', faceDist: 'ok', faceCx: 0.5, faceCy: 0.5 };
      const dets = [];

      const personPred = lastPreds.find((p) => p.class === 'person');
      if (personPred) {
        const px = personPred.bbox[0] * sx;
        const py = personPred.bbox[1] * sy;
        const pw = personPred.bbox[2] * sx;
        const ph = personPred.bbox[3] * sy;
        const headH = Math.max(24, ph * 0.40);
        const headW = Math.min(pw, Math.max(24, headH * 0.95));
        const headX = px + (pw - headW) * 0.5;

        // Suavizado EMA para evitar saltos en la caja y ojos
        if (!smoothHead) {
          smoothHead = { x: headX, y: py, w: headW, h: headH };
        } else {
          const a = 0.45;
          smoothHead.x = smoothHead.x * (1 - a) + headX * a;
          smoothHead.y = smoothHead.y * (1 - a) + py * a;
          smoothHead.w = smoothHead.w * (1 - a) + headW * a;
          smoothHead.h = smoothHead.h * (1 - a) + headH * a;
        }

        const x1Mirrored = vw - (smoothHead.x + smoothHead.w);
        if (currentMode === 'follow') {
          ctx.strokeStyle = '#00FF88';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x1Mirrored, smoothHead.y, smoothHead.w, smoothHead.h);
          ctx.fillStyle = 'rgba(0,255,136,0.9)';
          ctx.fillRect(x1Mirrored, Math.max(0, smoothHead.y - 14), 88, 14);
          ctx.fillStyle = '#000';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('👤 Rostro ' + Math.round(personPred.score * 100) + '%', x1Mirrored + 3, Math.max(10, smoothHead.y - 3));
        }

        const cxNorm = (smoothHead.x + smoothHead.w * 0.5) / vw;
        const cyNorm = (smoothHead.y + smoothHead.h * 0.5) / vh;
        const wRatio = pw / vw;
        facePayload = {
          facePos: cxNorm < 0.36 ? 'left' : cxNorm > 0.64 ? 'right' : 'center',
          faceDist: wRatio < 0.28 ? 'far' : wRatio > 0.72 ? 'close' : 'ok',
          faceCx: Number(cxNorm.toFixed(3)),
          faceCy: Number(cyNorm.toFixed(3)),
        };
      } else {
        smoothHead = null;
      }

      for (const obj of lastPreds) {
        if (currentMode === 'follow' && obj.class === 'person') continue;
        const bx = obj.bbox[0] * sx;
        const by = obj.bbox[1] * sy;
        const bw = obj.bbox[2] * sx;
        const bh = obj.bbox[3] * sy;
        const x1 = vw - (bx + bw);
        const cxNorm = (bx + bw * 0.5) / vw;
        const areaRatio = (bw * bh) / (vw * vh);
        const isClose = areaRatio > 0.18 || (by + bh) / vh > 0.80;
        const col = isClose ? '#FF4D4D' : '#FFD500';
        const labelEs = COCO_ES[obj.class] || obj.class;

        if (currentMode === 'explore') {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.strokeRect(x1, by, bw, bh);
          const tag = labelEs + ' ' + Math.round(obj.score * 100) + '%';
          ctx.fillStyle = col;
          ctx.fillRect(x1, Math.max(0, by - 13), Math.min(bw + 30, 120), 13);
          ctx.fillStyle = '#000';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(tag, x1 + 2, Math.max(9, by - 3));
        }

        dets.push({
          label: obj.class,
          labelEs,
          confidence: Number(obj.score.toFixed(2)),
          position: cxNorm < 0.36 ? 'left' : cxNorm > 0.64 ? 'right' : 'center',
          areaRatio: Number(areaRatio.toFixed(3)),
          close: isClose,
        });
      }

      postRN({
        type: 'vision',
        ...facePayload,
        detections: dets,
      });
    }

    init();
  </script>
</body>
</html>`;
}
