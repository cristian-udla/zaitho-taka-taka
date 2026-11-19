// Bus de Eventos Multimodal + Buffer Circular en RAM (3s) + 3 Mecanismos de Aprendizaje de Zaitho

export class MultimodalEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (e) {}
    }
  }
}

/**
 * Buffer Circular en RAM (ventana deslizante de 3 segundos).
 * Sobrescribe continuamente los últimos 3s de video (3 FPS -> ~9 frames),
 * audio (bloques de 1s -> 3 bloques) y sensores propioceptivos (50 Hz -> 150 muestras).
 * Solo congela el snapshot cuando ocurre un Trigger biológico.
 */
export class CircularMediaBuffer {
  constructor(windowMs = 3000) {
    this.windowMs = windowMs;
    this.videoFrames = [];
    this.audioChunks = [];
    this.proprioSamples = [];
    this.lastFreezeAt = 0;
  }

  _prune(arr, now) {
    const cutoff = now - this.windowMs;
    while (arr.length > 0 && arr[0].ts < cutoff) {
      arr.shift();
    }
  }

  pushVideoFrame({ base64, labels = [], faces = 0, hasSmile = false, ts = Date.now() }) {
    if (!base64) return;
    this.videoFrames.push({ base64, labels, faces, hasSmile, ts });
    this._prune(this.videoFrames, ts);
    if (this.videoFrames.length > 10) this.videoFrames.shift();
  }

  pushAudioBlock({ category = 'silence', db = -60, peakDb = -60, zcrVariance = 0, base64 = null, ts = Date.now() }) {
    this.audioChunks.push({ category, db, peakDb, zcrVariance, base64, ts });
    this._prune(this.audioChunks, ts);
    if (this.audioChunks.length > 4) this.audioChunks.shift();
  }

  pushProprioSample(sample) {
    const ts = sample?.ts || Date.now();
    this.proprioSamples.push({ ...sample, ts });
    this._prune(this.proprioSamples, ts);
    if (this.proprioSamples.length > 160) this.proprioSamples.shift();
  }

  /**
   * Congela el buffer circular de los últimos 3 segundos ante un trigger biológico.
   * Incluye cooldown mínimo de 4s para evitar tormentas de envíos al servidor.
   */
  freeze(triggerType, detail = {}, force = false) {
    const now = Date.now();
    if (!force && now - this.lastFreezeAt < 4000) return null;
    this.lastFreezeAt = now;

    this._prune(this.videoFrames, now);
    this._prune(this.audioChunks, now);
    this._prune(this.proprioSamples, now);

    const latestFrame = this.videoFrames[this.videoFrames.length - 1] || null;
    const latestAudioWithData = [...this.audioChunks].reverse().find((a) => !!a.base64) || null;
    const latestProprio = this.proprioSamples[this.proprioSamples.length - 1] || null;

    // Resumen estadístico de propiocepción en los últimos 3s
    let maxVibration = 0;
    let maxPitch = 0;
    for (const s of this.proprioSamples) {
      if ((s.vibration || 0) > maxVibration) maxVibration = s.vibration;
      if (Math.abs(s.pitchDeg || 0) > maxPitch) maxPitch = Math.abs(s.pitchDeg || 0);
    }

    return {
      frozenAt: now,
      windowMs: this.windowMs,
      triggerType,
      detail,
      latestFrameBase64: latestFrame?.base64 || null,
      videoFrameCount: this.videoFrames.length,
      recentLabels: Array.from(new Set(this.videoFrames.flatMap((f) => f.labels || []))).slice(0, 12),
      audioSummary: this.audioChunks.map((a) => ({
        category: a.category,
        db: Math.round(a.db),
        peakDb: Math.round(a.peakDb),
        ts: a.ts,
      })),
      audioClipBase64: latestAudioWithData?.base64 || null,
      proprioSummary: {
        samples: this.proprioSamples.length,
        maxVibration: Number(maxVibration.toFixed(3)),
        maxPitchDeg: Number(maxPitch.toFixed(1)),
        latest: latestProprio,
      },
    };
  }
}

/**
 * Clasificador acústico ligero estilo YAMNet + VAD en bloques de 1 segundo.
 * Si hay silencio sostenido, marca `sleepMode: true` para ahorrar batería.
 */
export function classifyAudioBlock1s({ dbSamples = [], vadActive = false }) {
  if (!dbSamples.length && !vadActive) {
    return { category: 'silence', confidence: 0.95, db: -60, peakDb: -60, sleepMode: true };
  }
  const avgDb = dbSamples.length
    ? dbSamples.reduce((acc, v) => acc + v, 0) / dbSamples.length
    : vadActive ? -22 : -55;
  const peakDb = dbSamples.length ? Math.max(...dbSamples) : avgDb;
  const minDb = dbSamples.length ? Math.min(...dbSamples) : avgDb;
  const dynamicRange = peakDb - minDb;

  // Variación temporal (ritmo vs voz vs estruendo)
  let diffSum = 0;
  for (let i = 1; i < dbSamples.length; i++) {
    diffSum += Math.abs(dbSamples[i] - dbSamples[i - 1]);
  }
  const avgDelta = dbSamples.length > 1 ? diffSum / (dbSamples.length - 1) : 0;

  if (peakDb > -8 && dynamicRange > 18) {
    return { category: 'loud_bang', confidence: 0.88, db: avgDb, peakDb, dynamicRange, sleepMode: false };
  }
  if (avgDb < -44 && !vadActive) {
    return { category: 'silence', confidence: 0.92, db: avgDb, peakDb, dynamicRange, sleepMode: true };
  }
  if (vadActive || (dynamicRange > 8 && avgDelta >= 2.2)) {
    return { category: 'speech', confidence: 0.78, db: avgDb, peakDb, dynamicRange, sleepMode: false };
  }
  if (avgDb >= -32 && dynamicRange >= 3 && dynamicRange <= 14 && avgDelta < 2.5) {
    return { category: 'music', confidence: 0.72, db: avgDb, peakDb, dynamicRange, sleepMode: false };
  }
  return { category: 'ambient', confidence: 0.65, db: avgDb, peakDb, dynamicRange, sleepMode: false };
}

/**
 * Mecanismo A: Calibración Motora Autónoma (Giroscopio vs Duración de Motor).
 */
export class MotorCalibrationTracker {
  constructor(initial = {}) {
    this.leftGain = Number(initial.leftGain || 1.0);
    this.rightGain = Number(initial.rightGain || 1.0);
    this.activeTurn = null;
  }

  getCompensatedDuration(dir, baseMs) {
    const gain = dir === 'L' ? this.leftGain : dir === 'R' ? this.rightGain : 1.0;
    return Math.round(Math.min(2200, Math.max(150, baseMs * gain)));
  }

  startTurn({ dir, requestedMs, targetDeg = null }) {
    if (dir !== 'L' && dir !== 'R') return;
    // Estimación nominal ~135°/s si no se especificó ángulo objetivo
    const estimatedTarget = targetDeg || Math.round((requestedMs / 1000) * 135);
    this.activeTurn = {
      dir,
      requestedMs,
      targetDeg: estimatedTarget,
      accumulatedDeg: 0,
      startedAt: Date.now(),
    };
  }

  accumulateGyro(gyroZRadPerSec, dtSec) {
    if (!this.activeTurn || !Number.isFinite(gyroZRadPerSec) || !Number.isFinite(dtSec)) return;
    const degDelta = Math.abs((gyroZRadPerSec * 180) / Math.PI) * dtSec;
    this.activeTurn.accumulatedDeg += degDelta;
  }

  finishTurn() {
    if (!this.activeTurn) return null;
    const turn = this.activeTurn;
    this.activeTurn = null;
    const actualDeg = Number(turn.accumulatedDeg.toFixed(1));
    if (actualDeg < 5 || turn.targetDeg < 10) return null;

    const ratio = turn.targetDeg / Math.max(actualDeg, 8);
    const clampedRatio = Math.min(1.45, Math.max(0.65, ratio));
    const alpha = 0.25;

    if (turn.dir === 'L') {
      this.leftGain = Number(Math.min(1.7, Math.max(0.6, this.leftGain * (1 - alpha) + this.leftGain * clampedRatio * alpha)).toFixed(3));
    } else {
      this.rightGain = Number(Math.min(1.7, Math.max(0.6, this.rightGain * (1 - alpha) + this.rightGain * clampedRatio * alpha)).toFixed(3));
    }

    return {
      dir: turn.dir,
      requestedMs: turn.requestedMs,
      targetDeg: turn.targetDeg,
      actualDeg,
      leftGain: this.leftGain,
      rightGain: this.rightGain,
      ts: Date.now(),
    };
  }
}

/**
 * Mecanismo B: Asociación de Rutinas Acústicas (Condicionamiento Clásico).
 */
export class ClassicalConditioningMemory {
  constructor(initial = {}) {
    this.weights = {
      music_dance: Number(initial.music_dance ?? 0.35),
      clap_attention: Number(initial.clap_attention ?? 0.4),
    };
    this.lastMusicAt = 0;
    this.lastDanceAt = 0;
  }

  onMusicHeard() {
    this.lastMusicAt = Date.now();
  }

  onDanceExecuted() {
    this.lastDanceAt = Date.now();
  }

  /**
   * Si el usuario sonríe poco después de música o baile, refuerza la sinapsis conductual.
   */
  onPositiveFaceReward() {
    const now = Date.now();
    if (now - this.lastMusicAt < 15000 || now - this.lastDanceAt < 15000) {
      this.weights.music_dance = Number(Math.min(1.0, this.weights.music_dance + 0.2).toFixed(3));
      return { reinforced: 'music_dance', weight: this.weights.music_dance };
    }
    return null;
  }

  shouldAutoDanceOnMusic() {
    return this.weights.music_dance >= 0.65;
  }
}

/**
 * Mecanismo C: Mapas Topológicos (Compás Magnético + Odometría).
 */
export class TopologicalMemoryMap {
  constructor(initialAnchors = []) {
    this.x = 0;
    this.y = 0;
    this.headingDeg = 0;
    this.anchors = Array.isArray(initialAnchors) ? initialAnchors : [];
  }

  updateHeading(headingDeg) {
    if (Number.isFinite(headingDeg)) {
      this.headingDeg = ((headingDeg % 360) + 360) % 360;
    }
  }

  applyOdometry(cmd, durationMs = 400) {
    const distUnits = (durationMs / 1000) * 0.25; // ~25 cm/s estimados
    const rad = (this.headingDeg * Math.PI) / 180;
    if (cmd === 'F') {
      this.x = Number((this.x + Math.cos(rad) * distUnits).toFixed(2));
      this.y = Number((this.y + Math.sin(rad) * distUnits).toFixed(2));
    } else if (cmd === 'B') {
      this.x = Number((this.x - Math.cos(rad) * distUnits).toFixed(2));
      this.y = Number((this.y - Math.sin(rad) * distUnits).toFixed(2));
    }
  }

  recordAnchor(label, { acousticDb = null, kind = 'object' } = {}) {
    if (!label) return null;
    const norm = label.trim().toLowerCase();
    const anchor = {
      label: label.trim(),
      kind,
      headingDeg: Math.round(this.headingDeg),
      x: this.x,
      y: this.y,
      acousticDb,
      updatedAt: Date.now(),
    };
    this.anchors = [
      anchor,
      ...this.anchors.filter((a) => (a.label || '').toLowerCase() !== norm),
    ].slice(0, 30);
    return anchor;
  }

  findAnchor(label) {
    const norm = (label || '').trim().toLowerCase();
    return this.anchors.find((a) => (a.label || '').toLowerCase().includes(norm)) || null;
  }

  shortestTurnTo(targetHeadingDeg) {
    let diff = ((targetHeadingDeg - this.headingDeg + 540) % 360) - 180;
    const dir = diff >= 0 ? 'R' : 'L';
    const deg = Math.abs(Math.round(diff));
    return { dir, deg, durationMs: Math.min(1800, Math.max(180, Math.round((deg / 135) * 1000))) };
  }
}
