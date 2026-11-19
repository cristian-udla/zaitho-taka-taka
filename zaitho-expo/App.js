import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Image,
  LogBox,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import * as Speech from 'expo-speech';
import {
  setAudioModeAsync,
  createAudioPlayer,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { NativeModules } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildVisionWebViewHtml } from './visionWebViewHtml';

class MockBleManager {
  startDeviceScan() {}
  stopDeviceScan() {}
  destroy() {}
}

let RealBleManager = null;
try {
  if (NativeModules?.BleClientManager || NativeModules?.BlePlx) {
    RealBleManager = require('react-native-ble-plx').BleManager;
  }
} catch (e) {}

function createSafeBleManager() {
  if (RealBleManager) {
    try {
      return new RealBleManager();
    } catch (e) {}
  }
  return new MockBleManager();
}

let ExpoSpeechRecognitionModule = {
  requestPermissionsAsync: async () => ({ granted: false }),
  start: () => {},
  stop: () => {},
};
let useSpeechRecognitionEvent = () => {};
try {
  if (NativeModules?.ExpoSpeechRecognition) {
    const sr = require('expo-speech-recognition');
    ExpoSpeechRecognitionModule = sr.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = sr.useSpeechRecognitionEvent;
  }
} catch (e) {}
import { resolveFaceRecipe, ALL_EXPRESSION_KEYS } from './faceExpressions';
import {
  runZaithoAgent,
  evaluateSafeMath,
  computeStats,
  searchMemoriesByRelevance,
  fetchWeatherDirect,
  shouldAllowInternetFallback,
} from './agentEngine';
import { io as socketIO } from 'socket.io-client';
import {
  CURIOSITY_STATES,
  CuriosityNoveltyCache,
  runLocalCuriosityAnalysis,
} from './curiosityEngine';
import {
  MultimodalEventBus,
  CircularMediaBuffer,
  classifyAudioBlock1s,
  MotorCalibrationTracker,
  ClassicalConditioningMemory,
  TopologicalMemoryMap,
} from './multimodalBus';
import {
  analyzeFrameLocalYolo,
  extractLocalFeature,
} from './localVisionYolo';

LogBox.ignoreLogs(['Response.blob()', 'new NativeEventEmitter']);

// ============================================================================
// CONFIGURACIÓN DE SERVIDORES Y COLORES ANKI VECTOR
// ============================================================================
const API_KEY = 'freellmapi-7e50639250fccc3a4143f4188e9451da8e45230857cbc599';
const DEFAULT_SERVER = 'http://100.92.200.34:3002';
const BRAIN_SERVER_CANDIDATES = ['http://100.92.200.34:3002', 'http://10.112.71.38:3002'];
const FREELLM_TAILSCALE_IP_URL = 'http://100.124.77.5:3001/v1';
const TAILSCALE_LLM_URL = 'https://server.tail4311d4.ts.net/v1';
const GEMINI_LLM_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const PROXY_LLM_URL = `${DEFAULT_SERVER}/v1`;
const CONFIG_PATH = `${FileSystem.documentDirectory}zaitho_config.json`;
const VISION_DB_PATH = `${FileSystem.documentDirectory}zaitho_vision_db.json`;

// BLE UART Nordic del chasis ESP32-S3 (ZAITHO_ROBOT)
const BLE_TARGET_NAME = 'ZAITHO_ROBOT';
const BLE_TARGET_MAC = '98:3D:AE:EE:F2:8D';
const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const MEMORY_PATH = `${FileSystem.documentDirectory}zaitho_memory.json`;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_CHARS[(triple >> 18) & 63];
    out += B64_CHARS[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? B64_CHARS[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[triple & 63] : '=';
  }
  return out;
}

function asciiToBase64(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytesToBase64(bytes);
}

function base64ToAscii(b64) {
  if (!b64) return '';
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = B64_CHARS.indexOf(clean[i]);
    const c2 = B64_CHARS.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? -1 : B64_CHARS.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? -1 : B64_CHARS.indexOf(clean[i + 3]);
    out += String.fromCharCode((c1 << 2) | (c2 >> 4));
    if (c3 !== -1) out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
    if (c4 !== -1) out += String.fromCharCode(((c3 & 3) << 6) | c4);
  }
  return out;
}

function buildEmotionWavBase64(emotionName) {
  const sr = 16000;
  const presets = {
    angry: [[420, 0.11], [290, 0.14], [210, 0.18]],
    flirty: [[580, 0.09], [860, 0.11], [1140, 0.14]],
    sad: [[460, 0.14], [340, 0.16], [240, 0.22]],
    surprised: [[520, 0.06], [1180, 0.14]],
    curious: [[540, 0.08], [760, 0.11]],
    excited: [[660, 0.07], [880, 0.07], [1180, 0.11]],
    dance: [[523, 0.1], [659, 0.1], [784, 0.1], [1046, 0.14]],
  };
  const notes = presets[emotionName] || presets.curious;
  let totalSamples = 0;
  for (const [, d] of notes) totalSamples += Math.floor(sr * d);
  const dataBytes = totalSamples * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const dv = new DataView(buf.buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataBytes, true);
  let pos = 0;
  for (const [freq, dur] of notes) {
    const count = Math.floor(sr * dur);
    for (let i = 0; i < count; i++) {
      const env = Math.min(1, i / 120) * Math.min(1, (count - i) / 180);
      const sample = Math.sin((2 * Math.PI * freq * i) / sr) * 0.42 * env;
      dv.setInt16(44 + pos * 2, Math.floor(sample * 32767), true);
      pos++;
    }
  }
  return bytesToBase64(buf);
}

const COLORS = {
  cyan: '#00F2FF',
  emerald: '#00FFAA',
  amber: '#FFB800',
  magenta: '#FF2A85',
  flirty: '#FF47A3',
  danger: '#FF3D00',
  blue: '#0096FF',
};

function getCardinal(deg) {
  const dirs = ['NORTE', 'NORESTE', 'ESTE', 'SURESTE', 'SUR', 'SUROESTE', 'OESTE', 'NOROESTE'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export default function App() {
  const [screen, setScreen] = useState(Dimensions.get('window'));
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [expression, setExpression] = useState('happy');
  const [eyeColor, setEyeColor] = useState(COLORS.cyan);

  // Efectos visuales especiales: Mejillas rosadas, Corazones (Caricia) y Corcheas (Baile)
  const [showBlushCheeks, setShowBlushCheeks] = useState(false);
  const [particles, setParticles] = useState([]); // Corazones 💖 o Corcheas ♪ ♫

  // Íconos flotantes de notificaciones activas (WhatsApp, Correo, etc.)
  const [activeNotifBadges, setActiveNotifBadges] = useState([]);

  // Widget flotante arriba de los ojos
  const [floatingData, setFloatingData] = useState({
    visible: false,
    label: 'DATO',
    value: '--',
    subtitle: '',
  });

  // Panel flotante derecho para datos de Internet (ojos se mueven a la izquierda más pequeños)
  const [internetCard, setInternetCard] = useState(null);
  const eyesSplitAnim = useRef(new Animated.Value(0)).current;
  const internetTimerRef = useRef(null);

  // Cámara discreta para reconocimiento de rostros, plantas y objetos (YOLO + OpenCV)
  const cameraRef = useRef(null);
  const [cameraFacing, setCameraFacing] = useState('front');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Paneles y Estado de Escucha
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [lastSpeechBubble, setLastSpeechBubble] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [alwaysListening, setAlwaysListening] = useState(true);
  const [voiceActiveNow, setVoiceActiveNow] = useState(false);
  const [wakeWordOnly, setWakeWordOnly] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);

  // Configuración IA (freellmapi Tailscale o Google Gemini) persistida en el teléfono
  const [aiProvider, setAiProvider] = useState('freellmapi');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('auto');
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Capa visual enriquecida (forma de ojos, boca, glifo)
  const [faceVisual, setFaceVisual] = useState({
    shapeL: 'orb',
    shapeR: 'orb',
    mouth: 'none',
    glyph: null,
    closedRest: false,
  });

  // Estado del Chasis ESP32-S3 (Exclusivo BLE 98:3D:AE:EE:F2:8D)
  const [bleConnected, setBleConnected] = useState(false);
  const [hwLinkName, setHwLinkName] = useState('BLE (98:3D:AE:EE:F2:8D)');
  const [distanceCm, setDistanceCm] = useState(84.0);
  const [speedPct, setSpeedPct] = useState(65);
  const [explorerMode, setExplorerMode] = useState(false);
  const [faceFollowMode, setFaceFollowMode] = useState(false);
  const [showVisionBoxes, setShowVisionBoxes] = useState(true);
  const [visionOverlay, setVisionOverlay] = useState({
    faceBox: null,
    faceLabel: '',
    facePos: 'none',
    faceDist: 'ok',
    detections: [],
  });
  const [trainModalTarget, setTrainModalTarget] = useState(null);
  const [trainModalText, setTrainModalText] = useState('');
  const [smallestPictureSize, setSmallestPictureSize] = useState(null);
  const lastVisionFrameRef = useRef('');
  const webVisionRef = useRef(null);
  const webVisionHtmlRef = useRef(buildVisionWebViewHtml());
  const lastChassisNavAtRef = useRef(0);
  const isShakingRef = useRef(false);
  const lastShakeScreamAtRef = useRef(0);
  const shakeEndTimerRef = useRef(null);
  const [autoImuChassis, setAutoImuChassis] = useState(true);
  const [qBrain, setQBrain] = useState({
    evasiones: 4,
    recompensas: 6,
    pesoIzq: 1.15,
    pesoDer: 1.05,
    umbralCm: 28,
    velOptima: 32,
    preferredSide: 'IZQUIERDA',
  });

  // Orientación IMU 6 Ejes del Celular
  const [imuData, setImuData] = useState({
    pitch: 0,
    roll: 0,
    heading: 0,
    cardinal: 'NORTE',
    gForce: 1.0,
    stance: 'EN CHASIS ESTABLE',
  });

  const [userName, setUserName] = useState('Carlos');
  const [memories, setMemories] = useState([]);

  // Animaciones 100% GPU Native Driver (solo transform y opacity)
  const gazeX = useRef(new Animated.Value(0)).current;
  const gazeY = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const openL = useRef(new Animated.Value(1)).current;
  const openR = useRef(new Animated.Value(1)).current;
  const scaleXL = useRef(new Animated.Value(1)).current;
  const scaleYL = useRef(new Animated.Value(1)).current;
  const scaleXR = useRef(new Animated.Value(1)).current;
  const scaleYR = useRef(new Animated.Value(1)).current;
  const tiltL = useRef(new Animated.Value(0)).current;
  const tiltR = useRef(new Animated.Value(0)).current;
  const happyArch = useRef(new Animated.Value(0.65)).current;
  const squintBot = useRef(new Animated.Value(0)).current;
  const widgetAnim = useRef(new Animated.Value(0)).current;
  const blushOpacity = useRef(new Animated.Value(0)).current;
  const particleAnim = useRef(new Animated.Value(0)).current;

  // Modo base actual
  const currentBaseModeRef = useRef('happy');
  const expressionRevertTimer = useRef(null);
  const widgetTimeout = useRef(null);
  const readingActive = useRef(false);
  const emotionLockUntil = useRef(0);
  const lastTiltAlertTime = useRef(0);
  const hitCountRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const sfxPlayerRef = useRef(null);
  const speechBubbleTimer = useRef(null);

  // Acelerómetro y Giroscopio con Auto-Tara de Chasis y Eventos Únicos
  const accelRef = useRef({
    x: 0,
    y: 0,
    z: 1,
    g: 1,
    deltaG: 0,
    pitch: 0,
    roll: 0,
    relPitch: 0,
    relRoll: 0,
    neutralPitch: null,
    neutralRoll: null,
    anchorPitch: null,
    anchorRoll: null,
    lastStance: 'EN CHASIS ESTABLE',
  });
  const gyroRef = useRef({ x: 0, y: 0, z: 0, heading: 0, lastTs: Date.now(), targetHeading: null });

  // Gestos táctiles
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    totalDist: 0,
    lastX: 0,
    lastY: 0,
    petTriggered: false,
  });

  // ============================================================================
  // 1. RECONOCIMIENTO DE VOZ NATIVO + WAKE WORD + CICLO DE SUEÑO
  // ============================================================================
  const isSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const alwaysListeningRef = useRef(true);
  const drawerOpenRef = useRef(false);
  const micPermGrantedRef = useRef(false);
  const isRecBusyRef = useRef(false);
  const lastTranscriptAtRef = useRef(0);
  const sfxCacheRef = useRef({});
  const lastActivityAtRef = useRef(Date.now());
  const convoWindowUntilRef = useRef(0);
  const isSleepingRef = useRef(false);
  const wakeWordOnlyRef = useRef(false);
  const aiProviderRef = useRef('freellmapi');
  const geminiApiKeyRef = useRef('');
  const aiModelRef = useRef('auto');

  useEffect(() => { wakeWordOnlyRef.current = wakeWordOnly; }, [wakeWordOnly]);
  useEffect(() => { isSleepingRef.current = isSleeping; }, [isSleeping]);
  useEffect(() => { aiProviderRef.current = aiProvider; }, [aiProvider]);
  useEffect(() => { geminiApiKeyRef.current = geminiApiKey; }, [geminiApiKey]);
  useEffect(() => { aiModelRef.current = aiModel; }, [aiModel]);

  const saveAiConfig = async (patch = {}) => {
    try {
      const cfg = {
        aiProvider: patch.aiProvider ?? aiProviderRef.current,
        geminiApiKey: patch.geminiApiKey ?? geminiApiKeyRef.current,
        aiModel: patch.aiModel ?? aiModelRef.current,
        wakeWordOnly: patch.wakeWordOnly ?? wakeWordOnlyRef.current,
      };
      await FileSystem.writeAsStringAsync(CONFIG_PATH, JSON.stringify(cfg));
    } catch (e) {}
  };

  const loadAiConfig = async () => {
    try {
      const info = await FileSystem.getInfoAsync(CONFIG_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(CONFIG_PATH);
        const cfg = JSON.parse(raw);
        if (cfg.aiProvider) setAiProvider(cfg.aiProvider);
        if (typeof cfg.geminiApiKey === 'string') setGeminiApiKey(cfg.geminiApiKey);
        if (cfg.aiModel) setAiModel(cfg.aiModel);
        if (typeof cfg.wakeWordOnly === 'boolean') setWakeWordOnly(cfg.wakeWordOnly);
      }
    } catch (e) {}
  };

  const touchActivity = () => {
    lastActivityAtRef.current = Date.now();
  };

  const wakeUpZaitho = (withSpark = true) => {
    touchActivity();
    if (isSleepingRef.current) {
      isSleepingRef.current = false;
      setIsSleeping(false);
      if (withSpark) {
        triggerExpression('wake_spark', true, 2200);
      } else {
        applyEyeGeometry(currentBaseModeRef.current);
      }
    }
  };

  useEffect(() => {
    alwaysListeningRef.current = alwaysListening;
    if (!alwaysListening) {
      releaseMicrophoneHardware();
    }
  }, [alwaysListening]);

  useEffect(() => {
    currentBaseModeRef.current = explorerMode ? 'curious' : 'happy';
    if (!isSleepingRef.current) {
      applyEyeGeometry(currentBaseModeRef.current);
    }
  }, [explorerMode]);

  const sendClientLog = (tag, msg) => {
    try { console.log(`[ZAITHO:${tag}]`, msg); } catch (e) {}
  };

  // Si se abre el panel/teclado, liberar de inmediato el micrófono para permitir dictado de Google
  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
    if (drawerOpen) {
      wakeUpZaitho(false);
      releaseMicrophoneHardware();
    }
  }, [drawerOpen]);

  const releaseMicrophoneHardware = async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {}
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch (e) {}
    isRecBusyRef.current = false;
    setVoiceActiveNow(false);
  };

  const startNextListenWindow = async () => {
    if (
      !alwaysListeningRef.current ||
      !micPermGrantedRef.current ||
      drawerOpenRef.current ||
      isSpeakingRef.current ||
      isThinkingRef.current ||
      isRecBusyRef.current
    ) {
      return;
    }
    try {
      isRecBusyRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'es-CL',
        interimResults: true,
        continuous: false,
      });
    } catch (e) {
      isRecBusyRef.current = false;
      sendClientLog('STT-START-ERR', e?.message || e);
    }
  };

  useSpeechRecognitionEvent('speechstart', () => {
    audioVadActiveRef.current = true;
    if (drawerOpenRef.current || isSpeakingRef.current || isThinkingRef.current) return;
    if (isSleepingRef.current) return;
    setVoiceActiveNow(true);
    applyEyeGeometry('listening');
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const rawVal = Number(event?.value ?? -2);
    // Android SpeechRecognizer reporta RMS aprox -2..10 -> mapear a dB -60..-2
    const approxDb = Math.max(-60, Math.min(-2, -48 + rawVal * 4.5));
    audioDbSamplesRef.current.push(approxDb);
    if (audioDbSamplesRef.current.length > 32) audioDbSamplesRef.current.shift();
    if (rawVal >= 9.3 && !isSpeakingRef.current) {
      multimodalBusRef.current.emit('audio:bang', { db: approxDb, ts: Date.now() });
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (drawerOpenRef.current || isSpeakingRef.current || isThinkingRef.current) return;
    const transcript = event?.results?.[0]?.transcript?.trim() || '';
    if (!transcript) return;

    const wakeMatch = /\b(?:oye\s+)?(?:zaitho|zaito|saito|zaico|saico|sayto)\b/i;
    const hasWake = wakeMatch.test(transcript);

    if (!isSleepingRef.current || hasWake) {
      setVoiceActiveNow(true);
      applyEyeGeometry('curious');
    }

    if (event.isFinal && transcript.length >= 2) {
      const now = Date.now();
      if (now - lastTranscriptAtRef.current < 900) return;
      lastTranscriptAtRef.current = now;
      isRecBusyRef.current = false;
      setVoiceActiveNow(false);

      const inWindow = now < convoWindowUntilRef.current;
      if ((wakeWordOnlyRef.current || isSleepingRef.current) && !hasWake && !inWindow) {
        if (isSleepingRef.current) applyEyeGeometry('sleeping');
        return;
      }

      wakeUpZaitho(isSleepingRef.current);
      convoWindowUntilRef.current = now + 25000;
      const cleaned = transcript.replace(wakeMatch, '').replace(/^[,.\s]+/, '').trim();
      if (!cleaned) {
        triggerExpression('wake_spark', true, 2400);
        speakZaitho('¿Sí? Aquí estoy, te escucho.');
        return;
      }
      askZaitho(cleaned);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    isRecBusyRef.current = false;
    setVoiceActiveNow(false);
    if (!isThinkingRef.current && !isSpeakingRef.current) {
      applyEyeGeometry(isSleepingRef.current ? 'sleeping' : currentBaseModeRef.current);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    isRecBusyRef.current = false;
    setVoiceActiveNow(false);
    if (!isThinkingRef.current && !isSpeakingRef.current) {
      applyEyeGeometry(isSleepingRef.current ? 'sleeping' : currentBaseModeRef.current);
    }
    sendClientLog('STT-ERR', event?.error || event?.message || 'error');
  });

  useEffect(() => {
    loadAiConfig();
    requestCameraPermission().catch(() => {});
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        }
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perm.granted) {
          micPermGrantedRef.current = true;
          startNextListenWindow();
        } else if (!NativeModules?.ExpoSpeechRecognition) {
          sendClientLog('EXPO-GO', 'Modo preview: BLE y micrófono continuo se activan en la APK compilada');
        } else {
          sendClientLog('MIC-PERM', 'Permiso de micrófono denegado');
        }
      } catch (e) {
        sendClientLog('MIC-PERM-ERR', e?.message || e);
      }
    })();

    const sleepCheck = setInterval(() => {
      if (
        isSleepingRef.current ||
        isSpeakingRef.current ||
        isThinkingRef.current ||
        drawerOpenRef.current
      ) {
        return;
      }
      if (Date.now() - lastActivityAtRef.current > 180000) {
        applyEyeGeometry('yawning');
        setTimeout(() => {
          if (!isThinkingRef.current && !isSpeakingRef.current && !drawerOpenRef.current) {
            isSleepingRef.current = true;
            setIsSleeping(true);
            applyEyeGeometry('sleeping');
          }
        }, 2400);
      }
    }, 10000);

    const watchdog = setInterval(() => {
      if (
        !alwaysListeningRef.current ||
        !micPermGrantedRef.current ||
        drawerOpenRef.current ||
        isSpeakingRef.current ||
        isThinkingRef.current
      ) {
        return;
      }
      if (!isRecBusyRef.current) {
        startNextListenWindow();
      }
    }, 650);

    return () => {
      clearInterval(sleepCheck);
      clearInterval(watchdog);
    };
  }, []);

  // ============================================================================
  // 2. SONIDOS ROBÓTICOS EMOCIONALES LOCALES (Sin depender de PC)
  // ============================================================================
  const playEmotionSound = async (emotionName) => {
    try {
      if (sfxPlayerRef.current) {
        try {
          sfxPlayerRef.current.release();
        } catch (e) {}
      }
      let fileUri = sfxCacheRef.current[emotionName];
      if (!fileUri) {
        fileUri = `${FileSystem.cacheDirectory}zaitho_sfx_${emotionName}.wav`;
        const info = await FileSystem.getInfoAsync(fileUri);
        if (!info.exists) {
          await FileSystem.writeAsStringAsync(fileUri, buildEmotionWavBase64(emotionName), {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        sfxCacheRef.current[emotionName] = fileUri;
      }
      const player = createAudioPlayer(fileUri);
      sfxPlayerRef.current = player;
      player.play();
    } catch (e) {}
  };

  const spawnFloatingParticles = (type = 'hearts', side = 'center') => {
    const symbols = type === 'hearts' ? ['💖', '💗', '💕', '❤️', '💖'] : ['♪', '♫', '♬', '♩', '🎵', '🎶'];
    const baseLeft =
      side === 'left' ? screen.width * 0.24 : side === 'right' ? screen.width * 0.68 : screen.width * 0.46;
    const list = symbols.map((sym, i) => ({
      id: `${Date.now()}_${i}`,
      sym,
      left: baseLeft + (i - 2) * 34,
      top: screen.height * 0.42 + (i % 2) * 18,
      color: type === 'hearts' ? '#FF47A3' : i % 2 === 0 ? '#00FFAA' : '#00F2FF',
    }));
    setParticles(list);
    particleAnim.setValue(0);
    Animated.timing(particleAnim, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: true,
    }).start(() => {
      setParticles([]);
    });
  };

  // Tiritar los ojos en la pantalla durante un berrinche
  const triggerEyeTantrumShake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -18, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 18, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -16, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 16, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  };

  // Ejecutar coreografía completa de BAILE (Corcheas + Melodía + Ruedas)
  const triggerRobotDance = () => {
    triggerExpression('excited', false, 4200);
    playEmotionSound('dance');
    spawnFloatingParticles('notes', 'center');
    sendChassisCommand('DANCE');
    Animated.sequence([
      Animated.timing(gazeX, { toValue: -30, duration: 250, useNativeDriver: true }),
      Animated.timing(gazeX, { toValue: 30, duration: 250, useNativeDriver: true }),
      Animated.timing(gazeY, { toValue: -25, duration: 220, useNativeDriver: true }),
      Animated.timing(gazeY, { toValue: 15, duration: 220, useNativeDriver: true }),
      Animated.timing(gazeX, { toValue: -28, duration: 250, useNativeDriver: true }),
      Animated.timing(gazeX, { toValue: 28, duration: 250, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(gazeX, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(gazeY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
  };

  // ============================================================================
  // 3. VOZ HABLADA (SOLO cuando le pedimos algo o cuando de curioso quiere hablar)
  // ============================================================================
  const speakZaitho = async (text, pitch = 1.35, rate = 1.08) => {
    if (!text) return;
    isSpeakingRef.current = true;
    await releaseMicrophoneHardware();

    setLastSpeechBubble(text);
    if (speechBubbleTimer.current) clearTimeout(speechBubbleTimer.current);
    speechBubbleTimer.current = setTimeout(() => {
      setLastSpeechBubble('');
    }, 6500);

    try {
      Speech.stop();
      Speech.speak(text, {
        language: 'es-CL',
        pitch,
        rate,
        onDone: () => {
          isSpeakingRef.current = false;
        },
        onStopped: () => {
          isSpeakingRef.current = false;
        },
        onError: () => {
          isSpeakingRef.current = false;
        },
      });
    } catch (e) {
      isSpeakingRef.current = false;
    }
  };

  // ============================================================================
  // 4. MICRO-VIDA AUTÓNOMA ("Explorar un poquito y dar la impresión de estar vivo")
  // ============================================================================
  useEffect(() => {
    const aliveInterval = setInterval(() => {
      if (isSpeakingRef.current || isThinkingRef.current || drawerOpen) return;
      const roll = Math.random();
      if (roll < 0.65) {
        // Se mueve un poquito con las ruedas mirando con curiosidad alrededor (sin hablar)
        triggerExpression('curious', true, 3200);
        sendChassisCommand('ALIVE');
      } else {
        // De curioso nos hace un comentario corto espontáneo
        triggerExpression('curious', true, 3800);
        const curiousThoughts = [
          `Oye ${userName}, tengo ${distanceCm.toFixed(0)} centímetros libres al frente.`,
          `Hmm... todo tranquilo por acá mirando hacia el ${imuData.cardinal}.`,
        ];
        speakZaitho(curiousThoughts[Math.floor(Math.random() * curiousThoughts.length)], 1.38, 1.06);
      }
    }, 48000);

    return () => clearInterval(aliveInterval);
  }, [userName, distanceCm, imuData.cardinal, drawerOpen]);

  // ============================================================================
  // 5. HILO PROPIOCEPTIVO (50 Hz / 20ms) + COMPÁS MAGNÉTICO + BERRINCHE
  // ============================================================================
  useEffect(() => {
    Accelerometer.setUpdateInterval(50);
    Gyroscope.setUpdateInterval(50);
    Magnetometer.setUpdateInterval(200);

    const accSub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      const deltaG = Math.abs(g - accelRef.current.g);

      const pitchDeg = Math.round(Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI));
      const rollDeg = Math.round(Math.atan2(-x, Math.sqrt(y * y + z * z)) * (180 / Math.PI));

      if (accelRef.current.neutralPitch === null || accelRef.current.neutralRoll === null) {
        accelRef.current.neutralPitch = pitchDeg;
        accelRef.current.neutralRoll = rollDeg;
        accelRef.current.anchorPitch = pitchDeg;
        accelRef.current.anchorRoll = rollDeg;
      }

      const relPitch = pitchDeg - accelRef.current.neutralPitch;
      const relRoll = rollDeg - accelRef.current.neutralRoll;

      const changeFromAnchorPitch = Math.abs(pitchDeg - accelRef.current.anchorPitch);
      const changeFromAnchorRoll = Math.abs(rollDeg - accelRef.current.anchorRoll);

      accelRef.current = {
        ...accelRef.current,
        x,
        y,
        z,
        g,
        deltaG,
        pitch: pitchDeg,
        roll: rollDeg,
        relPitch,
        relRoll,
      };

      const now = Date.now();

      circularBufferRef.current.pushProprioSample({
        pitchDeg: relPitch,
        rollDeg: relRoll,
        vibration: deltaG,
        headingDeg: gyroRef.current.heading,
        ts: now,
      });

      if (deltaG > 0.72 && now - lastTiltAlertTime.current > 2800) {
        multimodalBusRef.current.emit('proprio:lifted', { deltaG, pitchDeg: relPitch, rollDeg: relRoll, ts: now });
      }

      // A) ZAMARREO FUERTE -> Grita "¡Aaaaaaaaaaaahhh!" mientras lo zamarreas; al soltarlo SE ENOJA
      const isShakingNow = deltaG > 0.78;
      if (isShakingNow) {
        isShakingRef.current = true;
        accelRef.current.anchorPitch = pitchDeg;
        accelRef.current.anchorRoll = rollDeg;

        applyEyeGeometry('dizzy');
        triggerEyeTantrumShake();

        if (!isSpeakingRef.current && now - lastShakeScreamAtRef.current > 1400) {
          lastShakeScreamAtRef.current = now;
          speakZaitho('¡Aaaaaaaaaaaahhh!', 1.28, 0.92);
        }

        if (shakeEndTimerRef.current) clearTimeout(shakeEndTimerRef.current);
        shakeEndTimerRef.current = setTimeout(() => {
          if (!isShakingRef.current) return;
          isShakingRef.current = false;
          lastTiltAlertTime.current = Date.now();
          const tantrumSide = relRoll >= 0 ? 'R' : 'L';
          triggerExpression('angry', true, 3800);
          triggerEyeTantrumShake();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          sendChassisCommand(`TANTRUM:${tantrumSide}`);
        }, 620);
        return;
      }

      if (changeFromAnchorRoll < 8 && changeFromAnchorPitch < 8) {
        accelRef.current.anchorPitch = pitchDeg;
        accelRef.current.anchorRoll = rollDeg;
      }

      // B) POSTURA DEL CHASIS
      let stance = 'EN CHASIS ESTABLE';
      if (Math.abs(relRoll) > 25) {
        stance = relRoll > 0 ? 'INCLINADO DERECHA ⚠️' : 'INCLINADO IZQUIERDA ⚠️';
      } else if (relPitch > 24) {
        stance = 'SUBIENDO RAMPA 📐';
      } else if (relPitch < -24) {
        stance = 'BAJANDO PENDIENTE 📉';
      }

      if (stance !== accelRef.current.lastStance) {
        accelRef.current.lastStance = stance;
        if (autoImuChassis && explorerMode) {
          if (stance === 'SUBIENDO RAMPA 📐') {
            sendChassisCommand('V:88');
          } else if (stance === 'BAJANDO PENDIENTE 📉') {
            sendChassisCommand('V:25');
          } else if (stance === 'EN CHASIS ESTABLE') {
            sendChassisCommand(`V:${speedPct}`);
          }
        }
      }

      setImuData((prev) => ({
        ...prev,
        pitch: relPitch,
        roll: relRoll,
        gForce: +g.toFixed(2),
        stance,
      }));
    });

    const gyroSub = Gyroscope.addListener(({ x, y, z }) => {
      const now = Date.now();
      const dt = Math.min((now - gyroRef.current.lastTs) / 1000, 0.25);
      gyroRef.current.lastTs = now;

      const yawRateRad = Math.abs(z) > Math.abs(y) ? z : y;
      motorCalibrationRef.current.accumulateGyro(yawRateRad, dt);
      const deltaDeg = -yawRateRad * (180 / Math.PI) * dt;

      let nextHeading = gyroRef.current.heading;
      if (Math.abs(yawRateRad) > 0.04) {
        nextHeading = (((nextHeading + deltaDeg) % 360) + 360) % 360;
        gyroRef.current.heading = nextHeading;
      }

      if (gyroRef.current.targetHeading !== null) {
        const diff = Math.abs((((nextHeading - gyroRef.current.targetHeading) + 540) % 360) - 180);
        if (diff <= 7) {
          gyroRef.current.targetHeading = null;
          sendChassisCommand('S');
          triggerExpression('excited', true, 3000);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }

      setImuData((prev) => ({
        ...prev,
        heading: Math.round(nextHeading),
        cardinal: getCardinal(nextHeading),
      }));
    });

    const magSub = Magnetometer.addListener(({ x, y }) => {
      const magDeg = ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
      topologyMapRef.current.updateHeading(magDeg);
    });

    return () => {
      accSub && accSub.remove();
      gyroSub && gyroSub.remove();
      magSub && magSub.remove();
    };
  }, [autoImuChassis, explorerMode, speedPct]);

  const turnChassisByDegrees = (deltaDegrees) => {
    const startH = gyroRef.current.heading;
    const targetH = (((startH + deltaDegrees) % 360) + 360) % 360;
    gyroRef.current.targetHeading = targetH;
    const durMs = Math.min(1100, Math.max(250, Math.round(Math.abs(deltaDegrees) * 6)));
    const dirCmd = deltaDegrees >= 0 ? `R:${durMs}:55` : `L:${durMs}:55`;
    triggerExpression('curious', true, 3500);
    sendChassisCommand(dirCmd);
  };

  // ============================================================================
  // 6. CARICIAS EN OJO IZQ/DER (Corazones + Mejillas Rosadas + Ojos Chinitos + Giro L/R)
  // ============================================================================
  const handleTouchStart = (e) => {
    wakeUpZaitho(true);
    const { pageX, pageY } = e.nativeEvent;
    touchRef.current.startX = pageX;
    touchRef.current.startY = pageY;
    touchRef.current.lastX = pageX;
    touchRef.current.lastY = pageY;
    touchRef.current.startTime = Date.now();
    touchRef.current.totalDist = 0;
    touchRef.current.petTriggered = false;
  };

  const handleTouchMove = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    const dx = pageX - touchRef.current.lastX;
    const dy = pageY - touchRef.current.lastY;
    const step = Math.sqrt(dx * dx + dy * dy);
    touchRef.current.totalDist += step;
    touchRef.current.lastX = pageX;
    touchRef.current.lastY = pageY;

    const lookX = ((pageX / screen.width) - 0.5) * 55;
    const lookY = ((pageY / screen.height) - 0.5) * 35;
    gazeX.setValue(lookX);
    gazeY.setValue(lookY);

    const elapsed = Date.now() - touchRef.current.startTime;
    if (touchRef.current.totalDist > 70 && elapsed > 160 && !touchRef.current.petTriggered) {
      touchRef.current.petTriggered = true;
      const isLeftEyeSide = pageX < screen.width * 0.5;
      const sideTag = isLeftEyeSide ? 'left' : 'right';

      // Ojos chinitos coquetos + mejillas rosadas + corazones flotantes
      triggerExpression('flirty', true, 3600);
      spawnFloatingParticles('hearts', sideTag);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Girar un poquito el chasis hacia el lado del ojo acariciado (PET:L o PET:R)
      sendChassisCommand(isLeftEyeSide ? 'PET:L' : 'PET:R');
    }
  };

  const handleTouchEnd = () => {
    const now = Date.now();
    const elapsed = now - touchRef.current.startTime;

    if (touchRef.current.petTriggered) {
      return;
    }

    if (elapsed > 650 && touchRef.current.totalDist < 30) {
      setDrawerOpen(true);
      return;
    }

    const impactG = accelRef.current.deltaG;
    const timeSinceLastTap = now - lastHitTimeRef.current;
    lastHitTimeRef.current = now;

    if (timeSinceLastTap < 420) {
      hitCountRef.current += 1;
    } else {
      hitCountRef.current = 1;
    }

    if (hitCountRef.current >= 3 && impactG < 0.14) {
      hitCountRef.current = 0;
      setDrawerOpen(true);
      return;
    }

    // GOLPE EN LA PANTALLA -> Triste o Berrinche Enojado (SIN HABLAR)
    if (impactG > 0.16 || hitCountRef.current >= 2) {
      if (impactG > 0.34 || hitCountRef.current >= 3) {
        const tantrumSide = touchRef.current.startX < screen.width * 0.5 ? 'R' : 'L';
        triggerExpression('angry', true, 3400);
        triggerEyeTantrumShake();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        sendChassisCommand(`TANTRUM:${tantrumSide}`);
      } else {
        triggerExpression('sad', true, 3200);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  };

  // ============================================================================
  // 7. MOTOR DE EXPRESIONES ENRIQUECIDO (Estilo Super-LOOI + Anki Vector)
  // ============================================================================
  const closedRestRef = useRef(false);

  const applyEyeGeometry = (expr) => {
    const { key, recipe } = resolveFaceRecipe(expr);
    setExpression(key);
    closedRestRef.current = !!recipe.closedRest;
    setFaceVisual({
      shapeL: recipe.shapeL || 'orb',
      shapeR: recipe.shapeR || 'orb',
      mouth: recipe.mouth || 'none',
      glyph: recipe.glyph || null,
      closedRest: !!recipe.closedRest,
    });

    if (recipe.gaze) {
      Animated.parallel([
        Animated.spring(gazeX, { toValue: recipe.gaze.x, useNativeDriver: true }),
        Animated.spring(gazeY, { toValue: recipe.gaze.y, useNativeDriver: true }),
      ]).start();
    }

    setShowBlushCheeks((recipe.blush || 0) > 0);
    setEyeColor(recipe.color || COLORS.cyan);
    Animated.parallel([
      Animated.spring(scaleXL, { toValue: recipe.scaleXL ?? 1, friction: 6, useNativeDriver: true }),
      Animated.spring(scaleYL, { toValue: recipe.scaleYL ?? 1, friction: 6, useNativeDriver: true }),
      Animated.spring(scaleXR, { toValue: recipe.scaleXR ?? 1, friction: 6, useNativeDriver: true }),
      Animated.spring(scaleYR, { toValue: recipe.scaleYR ?? 1, friction: 6, useNativeDriver: true }),
      Animated.spring(tiltL, { toValue: recipe.tiltL ?? 0, friction: 6, useNativeDriver: true }),
      Animated.spring(tiltR, { toValue: recipe.tiltR ?? 0, friction: 6, useNativeDriver: true }),
      Animated.timing(happyArch, { toValue: recipe.happy ?? 0, duration: 220, useNativeDriver: true }),
      Animated.timing(squintBot, { toValue: recipe.squint ?? 0, duration: 220, useNativeDriver: true }),
      Animated.timing(blushOpacity, { toValue: recipe.blush ?? 0, duration: 260, useNativeDriver: true }),
    ]).start();
  };

  const triggerExpression = (expr, withSound = true, durationMs = 3200) => {
    if (expressionRevertTimer.current) {
      clearTimeout(expressionRevertTimer.current);
      expressionRevertTimer.current = null;
    }
    emotionLockUntil.current = Date.now() + durationMs;
    applyEyeGeometry(expr);

    if (withSound && expr !== 'thinking' && expr !== 'look-up') {
      playEmotionSound(expr);
    }

    if (durationMs > 0) {
      expressionRevertTimer.current = setTimeout(() => {
        applyEyeGeometry(currentBaseModeRef.current);
        Animated.parallel([
          Animated.spring(gazeX, { toValue: 0, friction: 6, useNativeDriver: true }),
          Animated.spring(gazeY, { toValue: 0, friction: 6, useNativeDriver: true }),
        ]).start();
      }, durationMs);
    }
  };

  const showDataAboveEyes = (label, value, subtitle = '', durationMs = 6500) => {
    if (widgetTimeout.current) clearTimeout(widgetTimeout.current);
    setFloatingData({ visible: true, label, value, subtitle });
    readingActive.current = true;
    applyEyeGeometry('look-up');

    Animated.spring(widgetAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(gazeY, { toValue: -52, duration: 250, useNativeDriver: true }),
        Animated.timing(gazeX, { toValue: -26, duration: 250, useNativeDriver: true }),
      ]),
      Animated.timing(gazeX, { toValue: 26, duration: 480, useNativeDriver: true }),
      Animated.timing(gazeX, { toValue: -14, duration: 450, useNativeDriver: true }),
      Animated.timing(gazeX, { toValue: 14, duration: 450, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(gazeX, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(gazeY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => {
      readingActive.current = false;
      applyEyeGeometry(currentBaseModeRef.current);
    });

    widgetTimeout.current = setTimeout(() => {
      Animated.timing(widgetAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setFloatingData((prev) => ({ ...prev, visible: false }));
      });
    }, durationMs);
  };

  // ============================================================================
  // 8. NOTIFICACIONES FLOTANTES ACTIVAS (WhatsApp 💬, Correo ✉️, etc.) Y BLE
  // ============================================================================
  const openNotificationBadge = async (notif) => {
    if (!notif) return;
    triggerExpression('surprised', true, 3600);
    showDataAboveEyes(`${notif.icon || '💬'} ${notif.appName.toUpperCase()}`, notif.sender, notif.message, 7500);
    speakZaitho(`Mensaje de ${notif.appName} de ${notif.sender}: ${notif.message}`);
    try {
      const r = await fetch(`${serverUrl}/api/notifications/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notif.id }),
      });
      const d = await r.json();
      if (d.activeBadges) setActiveNotifBadges(d.activeBadges);
    } catch (e) {}
  };

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreen(window));
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    let blinkTimer;
    const scheduleBlink = () => {
      const delay = 2200 + Math.random() * 3400;
      blinkTimer = setTimeout(() => {
        if (!closedRestRef.current && !isSleepingRef.current) {
          Animated.sequence([
            Animated.parallel([
              Animated.timing(openL, { toValue: 0.05, duration: 75, useNativeDriver: true }),
              Animated.timing(openR, { toValue: 0.05, duration: 75, useNativeDriver: true }),
            ]),
            Animated.parallel([
              Animated.timing(openL, { toValue: 1, duration: 110, useNativeDriver: true }),
              Animated.timing(openR, { toValue: 1, duration: 110, useNativeDriver: true }),
            ]),
          ]).start();
        }
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();

    const saccadeInterval = setInterval(() => {
      if (readingActive.current || Date.now() < emotionLockUntil.current) return;
      const nx = (Math.random() - 0.5) * 42;
      const ny = (Math.random() - 0.5) * 24;
      Animated.parallel([
        Animated.spring(gazeX, { toValue: nx, friction: 6, useNativeDriver: true }),
        Animated.spring(gazeY, { toValue: ny, friction: 6, useNativeDriver: true }),
      ]).start();
    }, 2600);

    return () => {
      clearTimeout(blinkTimer);
      clearInterval(saccadeInterval);
    };
  }, []);

  const bleManagerRef = useRef(null);
  const bleDeviceRef = useRef(null);
  const bleConnectingRef = useRef(false);
  const bleMonitorSubRef = useRef(null);
  const bleDisconnectSubRef = useRef(null);

  const requestBlePermissions = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return res === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (e) {
      return false;
    }
  };

  const loadMemoryLocal = async () => {
    try {
      const info = await FileSystem.getInfoAsync(MEMORY_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(MEMORY_PATH);
        const data = JSON.parse(raw);
        if (data?.userProfile?.name) setUserName(data.userProfile.name);
        if (Array.isArray(data?.memories)) setMemories(data.memories);
      }
    } catch (e) {}
  };

  const persistMemoryLocal = async (nextMemories, nextName) => {
    try {
      await FileSystem.writeAsStringAsync(
        MEMORY_PATH,
        JSON.stringify({ userProfile: { name: nextName }, memories: nextMemories })
      );
    } catch (e) {}
  };

  useEffect(() => {
    loadMemoryLocal();
    if (!bleManagerRef.current) {
      bleManagerRef.current = createSafeBleManager();
    }
    connectChassis(true);

    const bleWatchdog = setInterval(() => {
      if (!bleDeviceRef.current && !bleConnectingRef.current) {
        connectChassis(true);
      }
    }, 6500);

    return () => {
      clearInterval(bleWatchdog);
      try { bleMonitorSubRef.current?.remove(); } catch (e) {}
      try { bleDisconnectSubRef.current?.remove(); } catch (e) {}
      try { bleManagerRef.current?.stopDeviceScan(); } catch (e) {}
    };
  }, []);

  const writeRawBle = async (textCmd) => {
    const dev = bleDeviceRef.current;
    if (!dev) return false;
    try {
      const payload = asciiToBase64(`${textCmd}\n`);
      await dev.writeCharacteristicWithoutResponseForService(BLE_SERVICE_UUID, BLE_RX_UUID, payload).catch(async () => {
        await dev.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_RX_UUID, payload);
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const bleAutoStopTimerRef = useRef(null);

  const runBleSequence = async (steps) => {
    for (const [cmd, delayMs] of steps) {
      if (!bleDeviceRef.current) break;
      await writeRawBle(cmd);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    if (bleDeviceRef.current) {
      await writeRawBle('S');
    }
  };

  const sendChassisCommand = async (cmd) => {
    if (!bleDeviceRef.current) return;
    if (bleAutoStopTimerRef.current) {
      clearTimeout(bleAutoStopTimerRef.current);
      bleAutoStopTimerRef.current = null;
    }
    try {
      if (cmd === 'DANCE') {
        runBleSequence([
          ['L:240:55', 260],
          ['R:240:55', 260],
          ['L:240:55', 260],
          ['R:240:55', 260],
          ['F:200:50', 220],
          ['B:200:50', 220],
          ['S', 0],
        ]);
      } else if (cmd === 'TANTRUM:L') {
        runBleSequence([
          ['L:180:65', 200],
          ['R:180:65', 200],
          ['L:180:65', 200],
          ['R:180:65', 200],
          ['S', 0],
        ]);
      } else if (cmd === 'TANTRUM:R') {
        runBleSequence([
          ['R:180:65', 200],
          ['L:180:65', 200],
          ['R:180:65', 200],
          ['L:180:65', 200],
          ['S', 0],
        ]);
      } else if (cmd === 'PET:L') {
        runBleSequence([['L:150:45', 170], ['R:150:45', 170], ['S', 0]]);
      } else if (cmd === 'PET:R') {
        runBleSequence([['R:150:45', 170], ['L:150:45', 170], ['S', 0]]);
      } else if (cmd === 'ALIVE') {
        const dir = Math.random() < 0.5 ? 'L:200:45' : 'R:200:45';
        runBleSequence([[dir, 220], ['S', 0]]);
      } else if (/^[FBLR]$/.test(cmd)) {
        const baseDur = 450;
        const compDur = (cmd === 'L' || cmd === 'R')
          ? motorCalibrationRef.current.getCompensatedDuration(cmd, baseDur)
          : baseDur;
        if (cmd === 'L' || cmd === 'R') {
          motorCalibrationRef.current.startTurn({ dir: cmd, requestedMs: compDur });
        }
        topologyMapRef.current.applyOdometry(cmd, compDur);
        await writeRawBle(`${cmd}:${compDur}:55`);
        bleAutoStopTimerRef.current = setTimeout(() => {
          writeRawBle('S');
          const cal = motorCalibrationRef.current.finishTurn();
          if (cal && socketRef.current?.connected) {
            socketRef.current.emit('motor_calibration', cal);
          }
        }, compDur + 60);
      } else if (/^([FBLR]):(\d+)(?::(\d+))?$/.test(cmd)) {
        const m = /^([FBLR]):(\d+)(?::(\d+))?$/.exec(cmd);
        const rawDur = Math.min(2000, Math.max(150, parseInt(m[2], 10)));
        const dur = (m[1] === 'L' || m[1] === 'R')
          ? motorCalibrationRef.current.getCompensatedDuration(m[1], rawDur)
          : rawDur;
        const vel = m[3] ? Math.min(100, Math.max(20, parseInt(m[3], 10))) : 55;
        if (m[1] === 'L' || m[1] === 'R') {
          motorCalibrationRef.current.startTurn({ dir: m[1], requestedMs: dur });
        }
        topologyMapRef.current.applyOdometry(m[1], dur);
        await writeRawBle(`${m[1]}:${dur}:${vel}`);
        bleAutoStopTimerRef.current = setTimeout(() => {
          writeRawBle('S');
          const cal = motorCalibrationRef.current.finishTurn();
          if (cal && socketRef.current?.connected) {
            socketRef.current.emit('motor_calibration', cal);
          }
        }, dur + 60);
      } else {
        if (cmd === 'DANCE') conditioningRef.current.onDanceExecuted();
        await writeRawBle(cmd);
      }
    } catch (e) {}
  };

  const connectChassis = async (silent = false) => {
    if (bleConnectingRef.current) return;
    const manager = bleManagerRef.current || createSafeBleManager();
    bleManagerRef.current = manager;

    const okPerm = await requestBlePermissions();
    if (!okPerm) {
      if (!silent) showDataAboveEyes('⚠️ PERMISO BLE', 'Sin permiso Bluetooth', 'Activa Bluetooth y Ubicación en Android');
      return;
    }

    bleConnectingRef.current = true;
    if (!silent) {
      showDataAboveEyes('🔵 BUSCANDO CHASIS', BLE_TARGET_NAME, 'Escaneando BLE directo desde el celular...');
    }

    try {
      try { manager.stopDeviceScan(); } catch (e) {}

      const foundDevice = await new Promise((resolve) => {
        let settled = false;
        const finish = (dev) => {
          if (settled) return;
          settled = true;
          try { manager.stopDeviceScan(); } catch (e) {}
          clearTimeout(timer);
          resolve(dev);
        };
        const timer = setTimeout(() => finish(null), 9000);

        manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
          if (error) {
            finish(null);
            return;
          }
          if (!device) return;
          const name = (device.name || device.localName || '').toUpperCase();
          const id = (device.id || '').toUpperCase();
          if (name.includes(BLE_TARGET_NAME) || id === BLE_TARGET_MAC) {
            finish(device);
          }
        });
      });

      if (!foundDevice) {
        bleConnectingRef.current = false;
        setBleConnected(false);
        if (!silent) {
          showDataAboveEyes('❌ CHASIS NO HALLADO', BLE_TARGET_NAME, 'Verifica que el chasis esté encendido y cerca');
        }
        return;
      }

      const connected = await foundDevice.connect({ timeout: 8000 });
      await connected.discoverAllServicesAndCharacteristics();
      bleDeviceRef.current = connected;
      setBleConnected(true);
      setHwLinkName(`BLE:${connected.name || BLE_TARGET_NAME}`);

      try { bleDisconnectSubRef.current?.remove(); } catch (e) {}
      bleDisconnectSubRef.current = manager.onDeviceDisconnected(connected.id, () => {
        bleDeviceRef.current = null;
        setBleConnected(false);
        setHwLinkName('DESCONECTADO');
      });

      try { bleMonitorSubRef.current?.remove(); } catch (e) {}
      bleMonitorSubRef.current = connected.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_TX_UUID,
        (err, char) => {
          if (err || !char?.value) return;
          const txt = base64ToAscii(char.value).trim();
          const mDist = /DIST[:=]\s*([\d.]+)/i.exec(txt) || /(\d+(?:\.\d+)?)\s*cm/i.exec(txt);
          if (mDist) {
            const val = parseFloat(mDist[1]);
            if (!Number.isNaN(val)) setDistanceCm(val);
          }
        }
      );

      if (!silent) {
        triggerExpression('excited', true, 3000);
        showDataAboveEyes('✅ CHASIS BLE DIRECTO', connected.name || BLE_TARGET_NAME, `Conectado directo · Rumbo ${imuData.heading}°`);
      }
    } catch (e) {
      bleDeviceRef.current = null;
      setBleConnected(false);
      if (!silent) {
        showDataAboveEyes('⚠️ ERROR BLE', 'No se pudo enlazar', e?.message || 'Reintentando...');
      }
    } finally {
      bleConnectingRef.current = false;
    }
  };

  // ============================================================================
  // 9. IA MULTI-PROVEEDOR (freellmapi Tailscale + Google Gemini) + INTERNET + MEMORIA
  // ============================================================================
  const getFreeLlmBaseUrls = () => {
    const cleanServer = (serverUrl || '').replace(/\/+$/, '');
    const list = [TAILSCALE_LLM_URL, FREELLM_TAILSCALE_IP_URL];
    if (cleanServer && !cleanServer.includes('localhost')) {
      list.push(`${cleanServer}/v1`);
    }
    return Array.from(new Set(list));
  };

  const fetchFreeLlmJson = async (path, options = {}, timeoutMs = 11000) => {
    const bases = getFreeLlmBaseUrls();
    const attempt = async (baseUrl) => {
      const res = await fetchWithTimeout(`${baseUrl}${path}`, options, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || typeof json !== 'object') throw new Error('JSON inválido');
      return json;
    };
    try {
      return await Promise.any(bases.map((b) => attempt(b)));
    } catch (aggErr) {
      throw new Error('Sin conexión con freellmapi');
    }
  };

  const loadAvailableModels = async (providerOverride) => {
    const prov = providerOverride || aiProviderRef.current;
    setLoadingModels(true);
    try {
      if (prov === 'gemini') {
        const defaults = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
        setAvailableModels(defaults);
        if (!defaults.includes(aiModelRef.current)) {
          setAiModel('gemini-2.5-flash');
          saveAiConfig({ aiModel: 'gemini-2.5-flash' });
        }
        return defaults;
      }
      const data = await fetchFreeLlmJson(
        '/models',
        { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } },
        7000
      );
      const rawList = (data?.data || data?.models || [])
        .map((m) => m.id || m.slug)
        .filter(Boolean);
      const list = ['auto', ...rawList.filter((m) => m !== 'auto')];
      setAvailableModels(list);
      return list;
    } catch (e) {} finally {
      setLoadingModels(false);
    }
    return [];
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const callLLMCompletion = async (payload) => {
    const prov = aiProviderRef.current;
    const chosenModel = aiModelRef.current || (prov === 'gemini' ? 'gemini-2.5-flash' : 'auto');

    if (prov === 'gemini') {
      const gKey = (geminiApiKeyRef.current || '').trim();
      if (!gKey) throw new Error('Falta tu API Key de Google Gemini (AIza...) en Ajustes');
      const geminiModel = chosenModel.startsWith('gemini') ? chosenModel : 'gemini-2.5-flash';
      const bodyWithTools = { ...payload, model: geminiModel };
      let res = await fetchWithTimeout(`${GEMINI_LLM_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gKey}`,
        },
        body: JSON.stringify(bodyWithTools),
      }, 15000);
      if (!res.ok && (res.status === 400 || res.status === 422) && payload.tools) {
        const { tools, tool_choice, ...rest } = payload;
        res = await fetchWithTimeout(`${GEMINI_LLM_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gKey}`,
          },
          body: JSON.stringify({ ...rest, model: geminiModel }),
        }, 15000);
      }
      if (res.ok) return await res.json();
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Gemini error ${res.status}: ${errTxt.slice(0, 80)}`);
    }

    try {
      return await fetchFreeLlmJson(
        '/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({ ...payload, model: chosenModel }),
        },
        13000
      );
    } catch (e) {
      if (payload.tools) {
        const { tools, tool_choice, ...rest } = payload;
        return await fetchFreeLlmJson(
          '/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({ ...rest, model: chosenModel }),
          },
          13000
        );
      }
      throw e;
    }
  };

  const closeInternetPanel = () => {
    if (internetTimerRef.current) clearTimeout(internetTimerRef.current);
    Animated.timing(eyesSplitAnim, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setInternetCard(null));
  };

  const showInternetPanel = (title, summary, source = 'Internet', imageUri = null) => {
    if (internetTimerRef.current) clearTimeout(internetTimerRef.current);
    setInternetCard({ title, summary, source, imageUri });
    Animated.spring(eyesSplitAnim, {
      toValue: 1,
      tension: 120,
      friction: 11,
      useNativeDriver: true,
    }).start();
    internetTimerRef.current = setTimeout(closeInternetPanel, 16000);
  };

  const saveImportantFact = async (fact, category = 'learned') => {
    try {
      setMemories((prev) => {
        if (prev.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return prev;
        const next = [{ id: 'm_' + Date.now(), fact, category }, ...prev].slice(0, 40);
        persistMemoryLocal(next, userName);
        return next;
      });
    } catch (e) {}
  };

  const fetchInternetDirect = async (query) => {
    const webHeaders = { 'User-Agent': 'ZaithoRobot/1.2 (Android)', Accept: 'application/json' };
    try {
      // 1. Indicadores económicos en vivo de Chile (UF, dólar, euro, UTM, ipc)
      if (/\b(uf|d[oó]lar|euro|utm|bitcoin|ipc|cobre|imacec)\b/i.test(query)) {
        const r = await fetchWithTimeout('https://mindicador.cl/api', { headers: webHeaders }, 6000);
        if (r.ok) {
          const data = await r.json();
          const lines = [];
          if (/uf/i.test(query) && data.uf) lines.push(`UF hoy: $${Number(data.uf.valor).toLocaleString('es-CL')} CLP`);
          if (/d[oó]lar/i.test(query) && data.dolar) lines.push(`Dólar observado: $${Number(data.dolar.valor).toLocaleString('es-CL')} CLP`);
          if (/euro/i.test(query) && data.euro) lines.push(`Euro: $${Number(data.euro.valor).toLocaleString('es-CL')} CLP`);
          if (/utm/i.test(query) && data.utm) lines.push(`UTM: $${Number(data.utm.valor).toLocaleString('es-CL')} CLP`);
          if (/bitcoin/i.test(query) && data.bitcoin) lines.push(`Bitcoin: US$${Number(data.bitcoin.valor).toLocaleString('es-CL')}`);
          if (lines.length > 0) {
            return {
              title: 'Indicadores en Vivo',
              summary: lines.join(' · '),
              source: 'mindicador.cl',
              contextText: lines.join('\n'),
            };
          }
        }
      }

      // 2. Búsqueda enciclopédica en Wikipedia en Español
      const cleanTerm = query
        .replace(/^(qu[eé]\s+es|qui[eé]n\s+es|qui[eé]n\s+fue|cu[aá]nto\s+mide|d[oó]nde\s+queda|busca\s+en\s+internet|investiga|averigua|dime\s+sobre)\s+/i, '')
        .replace(/[¿?¡!]/g, '')
        .trim();

      if (cleanTerm.length >= 2) {
        const wikiSearch = await fetchWithTimeout(
          `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTerm)}&format=json&origin=*&srlimit=1`,
          { headers: webHeaders },
          6000
        );
        if (wikiSearch.ok) {
          const ws = await wikiSearch.json();
          const top = ws?.query?.search?.[0];
          if (top?.title) {
            const sumRes = await fetchWithTimeout(
              `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title)}`,
              { headers: webHeaders },
              6000
            );
            if (sumRes.ok) {
              const sumData = await sumRes.json();
              if (sumData?.extract) {
                return {
                  title: sumData.title || top.title,
                  summary: sumData.extract.slice(0, 420),
                  source: 'Wikipedia ES',
                  contextText: `${sumData.title}: ${sumData.extract.slice(0, 600)}`,
                };
              }
            }
          }
        }
      }

      // 3. Fallback DuckDuckGo Instant Answer
      const ddg = await fetchWithTimeout(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanTerm || query)}&format=json&no_html=1&skip_disambig=1`,
        { headers: webHeaders },
        6000
      );
      if (ddg.ok) {
        const dData = await ddg.json();
        const txt = dData.AbstractText || dData.Answer || '';
        if (txt) {
          return {
            title: dData.Heading || 'Resultado Web',
            summary: txt.slice(0, 420),
            source: dData.AbstractSource || 'DuckDuckGo',
            contextText: txt.slice(0, 600),
          };
        }
      }
    } catch (e) {}
    return null;
  };

  const visionDbRef = useRef([]);
  const faceFollowModeRef = useRef(false);
  const explorerModeRef = useRef(false);
  const lastGreetedPersonRef = useRef({ name: '', at: 0 });

  useEffect(() => { faceFollowModeRef.current = faceFollowMode; }, [faceFollowMode]);
  useEffect(() => { explorerModeRef.current = explorerMode; }, [explorerMode]);

  const loadVisionDbLocal = async () => {
    try {
      const info = await FileSystem.getInfoAsync(VISION_DB_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(VISION_DB_PATH);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) visionDbRef.current = parsed;
      }
    } catch (e) {}
  };

  const persistVisionDbLocal = async (items) => {
    visionDbRef.current = items;
    try {
      await FileSystem.writeAsStringAsync(VISION_DB_PATH, JSON.stringify(items));
    } catch (e) {}
  };

  useEffect(() => {
    loadVisionDbLocal();
  }, []);

  const callVisionLLM = async (base64Img, promptText) => {
    const prov = aiProviderRef.current;
    const chosenModel = aiModelRef.current || (prov === 'gemini' ? 'gemini-2.5-flash' : 'auto');
    const auth = prov === 'gemini' ? (geminiApiKeyRef.current || '').trim() : API_KEY;
    if (prov === 'gemini' && !auth) {
      throw new Error('Falta tu API Key de Google Gemini en Ajustes para visión');
    }

    const reqBody = {
      model: prov === 'gemini' ? (chosenModel.startsWith('gemini') ? chosenModel : 'gemini-2.5-flash') : chosenModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Img}` } },
          ],
        },
      ],
      max_tokens: 280,
    };

    if (prov === 'gemini') {
      const res = await fetchWithTimeout(
        `${GEMINI_LLM_URL}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify(reqBody),
        },
        16000
      );
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        throw new Error(`Modelo ${prov} HTTP ${res.status} (sin soporte de imagen o cuota): ${errTxt.slice(0, 60)}`);
      }
      const json = await res.json();
      return json?.choices?.[0]?.message?.content || '';
    }

    const json = await fetchFreeLlmJson(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(reqBody),
      },
      16000
    );
    return json?.choices?.[0]?.message?.content || '';
  };

  const runOnDeviceVision = async ({ base64, mode = 'identify', category = 'auto', label = '', box = null }) => {
    // 1) Procesamiento 100% local en el celular (sin servidor externo)
    if (mode === 'remember' && label) {
      const vec = extractLocalFeature(base64, box);
      const nextDb = [
        {
          id: `vis_${Date.now()}`,
          category: category === 'auto' ? 'object' : category,
          label,
          features: `Entrenado en celular (${category})`,
          vec,
          createdAt: Date.now(),
        },
        ...visionDbRef.current.filter((x) => (x.label || '').toLowerCase() !== label.toLowerCase()),
      ].slice(0, 60);
      await persistVisionDbLocal(nextDb);
      if (socketRef.current?.connected) {
        fetchWithTimeout(
          `${serverUrl}/api/vision/analyze`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mode, label, category, box }),
          },
          1800
        ).catch(() => {});
      }
      return { ok: true, saved: true, label, category };
    }

    // Si el servidor YOLO remoto está conectado vía Socket.IO, podemos usarlo como boost opcional;
    // de lo contrario (modo solo celular), corre 100% offline con analyzeFrameLocalYolo en ~15ms.
    if (socketRef.current?.connected) {
      try {
        const rSrv = await fetchWithTimeout(
          `${serverUrl}/api/vision/analyze`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mode, label, category, box }),
          },
          900
        );
        if (rSrv.ok) {
          const dSrv = await rSrv.json();
          if (dSrv?.ok) return dSrv;
        }
      } catch (e) {}
    }

    return analyzeFrameLocalYolo({
      base64,
      visionDb: visionDbRef.current,
      category,
      mode,
    });
  };

  const captureAndAnalyzeVision = async (mode, category, label, targetFacing = 'front', onPhotoCaptured = null, useAiVision = false) => {
    try {
      if (!cameraPermission?.granted) {
        const p = await requestCameraPermission();
        if (!p.granted) return { ok: false, error: 'Sin permiso de cámara en Android' };
      }
      if (cameraFacing !== targetFacing) {
        setCameraFacing(targetFacing);
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cameraRef.current) return { ok: false, error: 'Cámara inicializando, intenta en 1 segundo' };
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.42,
        skipProcessing: true,
        shutterSound: false,
      });
      if (!photo?.base64) return { ok: false, error: 'Captura vacía de cámara' };
      if (typeof onPhotoCaptured === 'function') {
        try { onPhotoCaptured(photo.base64); } catch (e) {}
      }

      // PRIORIDAD #1: Visión local 100% en el celular (sin enviar imagen a la IA salvo que se pida detalle)
      const yoloData = await runOnDeviceVision({
        base64: photo.base64,
        mode,
        category,
        label,
      });

      const knownList = visionDbRef.current.slice(0, 20);
      const knownText = knownList.length
        ? knownList.map((k) => `- [${k.category}] ${k.label}: ${k.features || 'sin rasgos'}`).join('\n')
        : '(ninguno aún)';

      if (mode === 'remember') {
        let features = yoloData?.saved ? `${category} aprendido en YOLO` : `${category} registrado por cámara`;
        if (useAiVision) {
          try {
            const desc = await callVisionLLM(
              photo.base64,
              `Describe brevemente en español (máx 18 palabras) los rasgos visuales principales de ${label || 'esta persona/objeto'} para reconocerlo después.`
            );
            if (desc) features = desc.replace(/[*#`\n]/g, ' ').trim();
          } catch (e) {}
        }

        const nextDb = [
          { id: `vis_${Date.now()}`, category, label: label || 'Persona', features, createdAt: Date.now() },
          ...visionDbRef.current.filter((x) => (x.label || '').toLowerCase() !== (label || '').toLowerCase()),
        ].slice(0, 35);
        await persistVisionDbLocal(nextDb);
        if (label) {
          saveImportantFact(`Aspecto visual de ${label} (${category}): ${features}`, 'vision');
        }
        return { ok: true, category, label, features, photoBase64: photo.base64 };
      }

      // Si no pidieron análisis detallado por IA y YOLO respondió con éxito -> usar solo YOLO
      if (!useAiVision && yoloData?.ok && (yoloData.recognized || (yoloData.detections?.length || 0) > 0 || (yoloData.facesFound || 0) > 0)) {
        if (yoloData.facePosition === 'left') Animated.spring(gazeX, { toValue: -45, useNativeDriver: true }).start();
        else if (yoloData.facePosition === 'right') Animated.spring(gazeX, { toValue: 45, useNativeDriver: true }).start();
        else if (yoloData.facePosition === 'center') Animated.spring(gazeX, { toValue: 0, useNativeDriver: true }).start();
        return { ...yoloData, photoBase64: photo.base64 };
      }

      // Solo usar IA Vision cuando pidieron datos precisos o YOLO no devolvió datos
      if (!useAiVision && yoloData?.ok) {
        return { ...yoloData, photoBase64: photo.base64 };
      }

      // mode === 'identify' con IA Vision (petición de detalle)
      const rawVision = await callVisionLLM(
        photo.base64,
        `Analiza esta foto. Registros conocidos:\n${knownText}\nResponde SOLO un JSON válido sin markdown con esta estructura: {"recognized": boolean, "matchedLabel": "nombre o null", "matchedCategory": "face|plant|object", "facePosition": "left|center|right|none", "description": "descripción breve en español (máx 20 palabras)"}`
      );

      let parsed = null;
      const jsonMatch = /\{[\s\S]*\}/.exec(rawVision);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {}
      }

      if (parsed?.facePosition === 'left') {
        Animated.spring(gazeX, { toValue: -45, useNativeDriver: true }).start();
      } else if (parsed?.facePosition === 'right') {
        Animated.spring(gazeX, { toValue: 45, useNativeDriver: true }).start();
      } else if (parsed?.facePosition === 'center') {
        Animated.spring(gazeX, { toValue: 0, useNativeDriver: true }).start();
      }

      return {
        ok: true,
        recognized: !!parsed?.recognized,
        matchedLabel: parsed?.matchedLabel || null,
        matchedCategory: parsed?.matchedCategory || category,
        facePosition: parsed?.facePosition || 'none',
        description: parsed?.description || rawVision.slice(0, 140),
        similarity: parsed?.recognized ? 0.92 : 0,
        facesFound: parsed?.facePosition && parsed.facePosition !== 'none' ? 1 : 0,
        detections: parsed?.description ? [{ labelEs: parsed.description }] : [],
        photoBase64: photo.base64,
      };
    } catch (e) {
      return { ok: false, error: e?.message || 'Error procesando visión' };
    }
  };

  const socketRef = useRef(null);
  const curiosityStateRef = useRef(CURIOSITY_STATES.IDLE);
  const noveltyCacheRef = useRef(new CuriosityNoveltyCache(3000, 15000));
  const pendingCuriosityRef = useRef(null);
  const curiosityBusyRef = useRef(false);
  const lastFaceDirRef = useRef('center');
  const faceLostCountRef = useRef(0);

  // Bus de Eventos Multimodal + Buffer Circular (3s en RAM) + 3 Mecanismos de Aprendizaje
  const multimodalBusRef = useRef(new MultimodalEventBus());
  const circularBufferRef = useRef(new CircularMediaBuffer(3000));
  const motorCalibrationRef = useRef(new MotorCalibrationTracker());
  const conditioningRef = useRef(new ClassicalConditioningMemory());
  const topologyMapRef = useRef(new TopologicalMemoryMap());
  const audioDbSamplesRef = useRef([]);
  const audioVadActiveRef = useRef(false);

  // Conexión WebSocket (Socket.IO) + autodescubrimiento rápido del servidor YOLO/OpenCV
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const winner = await Promise.any(
          BRAIN_SERVER_CANDIDATES.map(async (u) => {
            const r = await fetchWithTimeout(`${u}/api/health`, {}, 2500);
            if (!r.ok) throw new Error('not ok');
            return u;
          })
        );
        if (!cancelled && winner && winner !== serverUrl) {
          setServerUrl(winner);
        }
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const sock = socketIO(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 4000,
        timeout: 4000,
      });
      socketRef.current = sock;

      sock.on('learning_sync', (data) => {
        if (data?.motorCalibration) {
          motorCalibrationRef.current.leftGain = Number(data.motorCalibration.leftGain || 1.0);
          motorCalibrationRef.current.rightGain = Number(data.motorCalibration.rightGain || 1.0);
        }
        if (data?.conditioningWeights) {
          Object.assign(conditioningRef.current.weights, data.conditioningWeights);
        }
        if (Array.isArray(data?.topologyMap)) {
          topologyMapRef.current.anchors = data.topologyMap;
        }
      });

      sock.on('biological_trigger_result', (res) => {
        if (res?.speech && !isSpeakingRef.current) {
          speakZaitho(res.speech);
        }
      });

      return () => {
        try { sock.disconnect(); } catch (e) {}
      };
    } catch (e) {}
  }, [serverUrl]);

  // HILO DE CLASIFICACIÓN DE AUDIO (YAMNet + VAD en bloques de 1 segundo)
  useEffect(() => {
    const audioTimer = setInterval(() => {
      if (isSpeakingRef.current || isSleepingRef.current) {
        audioDbSamplesRef.current = [];
        return;
      }
      const samples = audioDbSamplesRef.current.splice(0);
      const res = classifyAudioBlock1s({
        dbSamples: samples,
        vadActive: audioVadActiveRef.current,
      });
      audioVadActiveRef.current = false;

      circularBufferRef.current.pushAudioBlock({
        category: res.category,
        db: res.db,
        peakDb: res.peakDb,
        ts: Date.now(),
      });

      if (res.sleepMode) return; // Ahorro de batería en silencio

      multimodalBusRef.current.emit('audio:frame', res);
      if (res.category === 'loud_bang') {
        multimodalBusRef.current.emit('audio:bang', res);
      } else if (res.category === 'music') {
        multimodalBusRef.current.emit('audio:music', res);
      } else if (res.category === 'speech') {
        multimodalBusRef.current.emit('audio:voice_peak', res);
      }
    }, 1000);

    return () => clearInterval(audioTimer);
  }, []);

  // HILO DE EXPRESIÓN (60 FPS por interrupciones) + BUFFER CIRCULAR FREEZE
  useEffect(() => {
    const bus = multimodalBusRef.current;

    const freezeAndEmit = (triggerType, detail) => {
      const frozen = circularBufferRef.current.freeze(triggerType, detail);
      if (frozen && socketRef.current?.connected) {
        socketRef.current.emit('biological_trigger_freeze', {
          ...frozen,
          geminiApiKey: geminiApiKeyRef.current,
        });
      }
    };

    const offBang = bus.on('audio:bang', (detail) => {
      // Interrupción inmediata a 60 FPS sin consultar al servidor
      triggerExpression('scared', true, 2200);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      freezeAndEmit('audio:bang', detail);
    });

    const offLifted = bus.on('proprio:lifted', (detail) => {
      triggerExpression('surprised', true, 2200);
      freezeAndEmit('proprio:lifted', detail);
    });

    const offMusic = bus.on('audio:music', (detail) => {
      conditioningRef.current.onMusicHeard();
      if (socketRef.current?.connected) {
        socketRef.current.emit('acoustic_event', { category: 'music', db: detail.db });
      }
      if (conditioningRef.current.shouldAutoDanceOnMusic() && bleDeviceRef.current) {
        triggerExpression('excited', true, 3200);
        sendChassisCommand('DANCE');
      }
    });

    const offVoice = bus.on('audio:voice_peak', () => {
      const anchor = topologyMapRef.current.findAnchor('usuario_voz');
      if (anchor && bleDeviceRef.current && explorerModeRef.current) {
        const turn = topologyMapRef.current.shortestTurnTo(anchor.headingDeg);
        if (turn.deg > 18) {
          sendChassisCommand(`${turn.dir}:${turn.durationMs}:48`);
        }
      }
    });

    return () => {
      offBang();
      offLifted();
      offMusic();
      offVoice();
    };
  }, []);

  const runDirectVisionToolCall = async ({ systemPrompt, userPrompt, base64Image, tools }) => {
    const prov = aiProviderRef.current;
    const chosenModel = aiModelRef.current || (prov === 'gemini' ? 'gemini-2.5-flash' : 'auto');
    const url =
      prov === 'gemini'
        ? `${GEMINI_LLM_URL}/chat/completions`
        : `${FREELLM_TAILSCALE_IP_URL}/chat/completions`;
    const auth = prov === 'gemini' ? (geminiApiKeyRef.current || '').trim() : API_KEY;
    if (prov === 'gemini' && !auth) throw new Error('Sin Gemini API Key');

    const body = {
      model: prov === 'gemini' ? (chosenModel.startsWith('gemini') ? chosenModel : 'gemini-2.5-flash') : chosenModel,
      tools,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      max_tokens: 260,
    };

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify(body),
      },
      15000
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  };

  // Sincroniza modo del motor neuronal WebGL (follow vs explore) cuando cambia el estado
  useEffect(() => {
    const m = explorerMode ? 'explore' : faceFollowMode ? 'follow' : 'idle';
    try {
      webVisionRef.current?.injectJavaScript(`window.setZaithoVisionMode && window.setZaithoVisionMode('${m}'); true;`);
    } catch (e) {}
  }, [explorerMode, faceFollowMode]);

  const handleWebVisionMessage = (event) => {
    try {
      const msg = JSON.parse(event?.nativeEvent?.data || '{}');
      if (msg.type !== 'vision') return;
      const now = Date.now();

      if (faceFollowModeRef.current) {
        const { facePos = 'none', faceDist = 'ok', faceCx = 0.5, faceCy = 0.5 } = msg;
        if (facePos !== 'none') {
          faceLostCountRef.current = 0;
          const targetGazeX = Math.max(-56, Math.min(56, (0.5 - faceCx) * 130));
          const targetGazeY = Math.max(-28, Math.min(28, (faceCy - 0.5) * 65));
          Animated.parallel([
            Animated.timing(gazeX, { toValue: targetGazeX, duration: 85, useNativeDriver: true }),
            Animated.timing(gazeY, { toValue: targetGazeY, duration: 85, useNativeDriver: true }),
          ]).start();

          if (faceCx < 0.42) lastFaceDirRef.current = 'left';
          else if (faceCx > 0.58) lastFaceDirRef.current = 'right';

          if (bleDeviceRef.current && now - lastChassisNavAtRef.current > 260) {
            if (faceCx < 0.22) {
              lastChassisNavAtRef.current = now;
              sendChassisCommand('L:220:48');
            } else if (faceCx > 0.78) {
              lastChassisNavAtRef.current = now;
              sendChassisCommand('R:220:48');
            } else if (faceDist === 'far') {
              lastChassisNavAtRef.current = now;
              sendChassisCommand('F:280:46');
            } else if (faceDist === 'close') {
              lastChassisNavAtRef.current = now;
              sendChassisCommand('B:220:42');
            }
          }
        } else {
          faceLostCountRef.current += 1;
          if (faceLostCountRef.current <= 5 && bleDeviceRef.current && now - lastChassisNavAtRef.current > 320) {
            lastChassisNavAtRef.current = now;
            const searchDir = lastFaceDirRef.current === 'left' ? 'L:220:46' : 'R:220:46';
            Animated.timing(gazeX, {
              toValue: lastFaceDirRef.current === 'left' ? -45 : 45,
              duration: 120,
              useNativeDriver: true,
            }).start();
            sendChassisCommand(searchDir);
          }
        }
        return;
      }

      if (explorerModeRef.current) {
        const dets = Array.isArray(msg.detections) ? msg.detections : [];
        const top = dets[0];
        if (top) {
          const lbl = top.labelEs || top.label || '';
          if (lbl && noveltyCacheRef.current.evaluate(lbl, top.confidence || 0.7)) {
            const anchor = topologyMapRef.current.recordAnchor(lbl, { kind: 'object' });
            if (anchor && socketRef.current?.connected) {
              socketRef.current.emit('topology_update', anchor);
            }
            const exists = visionDbRef.current.some((x) => (x.label || '').toLowerCase() === lbl.toLowerCase());
            if (!exists) {
              const nextDb = [
                { id: `yolo_${Date.now()}`, category: 'object', label: lbl, features: 'Aprendido con YOLO en vivo', createdAt: now },
                ...visionDbRef.current,
              ].slice(0, 40);
              persistVisionDbLocal(nextDb);
              saveImportantFact(`Aprendí con YOLO: ${lbl}`, 'vision');
              speakZaitho(`Vi ${lbl}.`);
            }
          }
          if (bleDeviceRef.current && (top.close || top.position === 'center') && now - lastChassisNavAtRef.current > 650) {
            lastChassisNavAtRef.current = now;
            const avoidTurn = top.position === 'left' ? 'R:460:48' : 'L:460:48';
            runBleSequence(top.close ? [['B:220:42', 240], [avoidTurn, 480], ['S', 0]] : [[avoidTurn, 480], ['S', 0]]);
            return;
          }
        }
        if (bleDeviceRef.current && now - lastChassisNavAtRef.current > 380) {
          lastChassisNavAtRef.current = now;
          sendChassisCommand('F:390:42');
        }
      }
    } catch (e) {}
  };

  // Bucle anterior desactivado cuando WebView WebGL está activo en streaming
  useEffect(() => {
    if (true) return;
    let patrolStep = 0;
    let lastFaceScanAt = 0;

    const loop = setInterval(async () => {
      if (
        (!faceFollowModeRef.current && !explorerModeRef.current) ||
        curiosityBusyRef.current ||
        isSpeakingRef.current ||
        isThinkingRef.current ||
        drawerOpenRef.current ||
        isSleepingRef.current ||
        !cameraPermission?.granted ||
        !cameraRef.current
      ) {
        return;
      }

      // 1) MODO EXPLORE: Patrullaje Local fluido con cámara frontal (2.5 FPS -> 400ms)
      if (explorerModeRef.current) {
        curiosityBusyRef.current = true;
        try {
          curiosityStateRef.current = CURIOSITY_STATES.EXPLORE_PATROL;
          if (cameraFacing !== 'front') {
            setCameraFacing('front');
            await new Promise((r) => setTimeout(r, 350));
          }

          patrolStep++;
          if (bleDeviceRef.current) {
            // Avance continuo fluido mientras explora (pulsos renovados cada 400ms con auto-freno de seguridad)
            await sendChassisCommand('F:390:42');
          }

          // Frame ligero de patrullaje (3 FPS) -> alimenta Buffer Circular de 3s en RAM
          const quickFrame = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.22,
            skipProcessing: true,
            shutterSound: false,
          });
          if (!quickFrame?.base64) return;
          lastVisionFrameRef.current = quickFrame.base64;
          circularBufferRef.current.pushVideoFrame({
            base64: quickFrame.base64,
            ts: Date.now(),
          });

          // PRIORIDAD ABSOLUTA A VISIÓN LOCAL EN EL CELULAR (cero servidor, cero internet)
          let detectedLabel = '';
          let detectedConf = 0;
          let detectedPos = 'center';
          let detectedClose = false;
          try {
            const dFast = await runOnDeviceVision({
              base64: quickFrame.base64,
              mode: 'identify',
              category: 'auto',
            });
            if (dFast?.ok) {
              setVisionOverlay({
                faceBox: dFast?.faceBox || null,
                faceLabel: dFast?.matchedLabel || '',
                facePos: dFast?.facePosition || 'none',
                faceDist: dFast?.faceDistance || 'ok',
                detections: Array.isArray(dFast?.detections) ? dFast.detections : [],
              });
              const top = dFast?.detections?.[0];
              if (top) {
                detectedLabel = top.customLabel || top.labelEs || top.label || '';
                detectedConf = Number(top.confidence || 0.72);
                if (top.position) detectedPos = top.position;
                if (typeof top.close === 'boolean') detectedClose = top.close;
                else if (top.areaRatio && top.areaRatio > 0.22) detectedClose = true;
              }
            }
          } catch (e) {}

          const avoidObstacle = async (pos = 'center', isClose = false) => {
            if (!bleDeviceRef.current) return;
            const avoidTurn = pos === 'left' ? 'R:480:48' : pos === 'right' ? 'L:480:48' : (patrolStep % 2 === 0 ? 'R:480:48' : 'L:480:48');
            if (isClose) {
              await runBleSequence([['B:240:42', 270], [avoidTurn, 510], ['S', 0]]);
            } else {
              await runBleSequence([[avoidTurn, 510], ['S', 0]]);
            }
          };

          // Si hubo un tope físico detectado por acelerómetro, retroceder y girar
          if (accelRef.current.deltaG > 0.36 && bleDeviceRef.current) {
            await avoidObstacle('center', true);
          }

          // 2) Aprendizaje autónomo y fluido solo con YOLO (sin consultar LLM con imágenes)
          if (detectedLabel && noveltyCacheRef.current.evaluate(detectedLabel, detectedConf)) {
            curiosityStateRef.current = CURIOSITY_STATES.BRAKE_AND_FRAME;
            triggerExpression('curious', true, 2200);
            writeRawBle('S');

            const anchor = topologyMapRef.current.recordAnchor(detectedLabel, { kind: 'object' });
            if (anchor && socketRef.current?.connected) {
              socketRef.current.emit('topology_update', anchor);
            }

            const exists = visionDbRef.current.some(
              (x) => (x.label || '').toLowerCase() === detectedLabel.toLowerCase()
            );
            if (!exists) {
              const nextDb = [
                {
                  id: `yolo_${Date.now()}`,
                  category: 'object',
                  label: detectedLabel,
                  features: `Aprendido por YOLO en rumbo ${Math.round(topologyMapRef.current.headingDeg)}°`,
                  createdAt: Date.now(),
                },
                ...visionDbRef.current,
              ].slice(0, 40);
              persistVisionDbLocal(nextDb);
              saveImportantFact(
                `Aprendí con YOLO: vi ${detectedLabel} en rumbo ${Math.round(topologyMapRef.current.headingDeg)}°`,
                'vision'
              );
              speakZaitho(`Aprendí que esto es ${detectedLabel}.`);
            }

            await avoidObstacle(detectedPos, detectedClose);
          } else if (detectedLabel && detectedConf >= 0.55 && (detectedClose || detectedPos === 'center')) {
            await avoidObstacle(detectedPos, detectedClose);
          }
        } catch (e) {
        } finally {
          curiosityStateRef.current = explorerModeRef.current
            ? CURIOSITY_STATES.EXPLORE_PATROL
            : CURIOSITY_STATES.IDLE;
          curiosityBusyRef.current = false;
        }
        return;
      }

      // 2) MODO SEGUIMIENTO DE ROSTRO / OJOS FLUIDO (~140ms, 100% local en el celular)
      const nowTs = Date.now();
      if (faceFollowModeRef.current && nowTs - lastFaceScanAt > 120) {
        lastFaceScanAt = nowTs;
        curiosityBusyRef.current = true;
        try {
          if (cameraFacing !== 'front') {
            setCameraFacing('front');
            await new Promise((r) => setTimeout(r, 200));
          }
          const faceSnap = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.18,
            skipProcessing: true,
            shutterSound: false,
          });
          if (!faceSnap?.base64) return;
          lastVisionFrameRef.current = faceSnap.base64;

          let facePos = 'none';
          let faceDist = 'ok';
          let faceCx = 0.5;
          let faceCy = 0.5;
          let recognizedName = null;

          try {
            const dFace = await runOnDeviceVision({
              base64: faceSnap.base64,
              mode: 'follow',
              category: 'face',
            });
            if (dFace?.ok) {
              facePos = dFace?.facePosition || (dFace?.facesFound > 0 ? 'center' : 'none');
              faceDist = dFace?.faceDistance || 'ok';
              if (typeof dFace?.faceCx === 'number') faceCx = dFace.faceCx;
              if (typeof dFace?.faceCy === 'number') faceCy = dFace.faceCy;
              if (dFace?.recognized && dFace?.matchedLabel) recognizedName = dFace.matchedLabel;
              setVisionOverlay({
                faceBox: dFace?.faceBox || null,
                faceLabel: dFace?.matchedLabel || '',
                facePos,
                faceDist,
                detections: Array.isArray(dFace?.detections) ? dFace.detections : [],
              });
            }
          } catch (e) {}

          if (recognizedName) {
            conditioningRef.current.onPositiveFaceReward();
            topologyMapRef.current.recordAnchor(recognizedName, { kind: 'face' });
            if (
              lastGreetedPersonRef.current.name !== recognizedName ||
              Date.now() - lastGreetedPersonRef.current.at > 45000
            ) {
              lastGreetedPersonRef.current = { name: recognizedName, at: Date.now() };
              triggerExpression('love', true, 2600);
              speakZaitho(`¡Hola ${recognizedName}!`);
            }
          }

          if (facePos !== 'none') {
            faceLostCountRef.current = 0;
            // Ojos siguen el rostro de forma fluida dentro del cuadro (espejo frontal)
            const targetGazeX = Math.max(-54, Math.min(54, (0.5 - faceCx) * 125));
            const targetGazeY = Math.max(-28, Math.min(28, (faceCy - 0.5) * 65));
            Animated.parallel([
              Animated.timing(gazeX, { toValue: targetGazeX, duration: 110, useNativeDriver: true }),
              Animated.timing(gazeY, { toValue: targetGazeY, duration: 110, useNativeDriver: true }),
            ]).start();

            if (faceCx < 0.42) lastFaceDirRef.current = 'left';
            else if (faceCx > 0.58) lastFaceDirRef.current = 'right';

            // Solo mover ruedas si te estás saliendo por los bordes o estás lejos/muy cerca
            if (bleDeviceRef.current) {
              if (faceCx < 0.24) {
                await sendChassisCommand('L:230:48');
              } else if (faceCx > 0.76) {
                await sendChassisCommand('R:230:48');
              } else if (faceDist === 'far') {
                await sendChassisCommand('F:300:46');
              } else if (faceDist === 'close') {
                await sendChassisCommand('B:220:42');
              } else {
                sendChassisCommand('S');
              }
            }
          } else {
            // Saliste de la cámara -> mover ruedas hacia el lado al que te moviste
            faceLostCountRef.current += 1;
            if (faceLostCountRef.current <= 4 && bleDeviceRef.current) {
              const searchDir = lastFaceDirRef.current === 'left' ? 'L:230:48' : 'R:230:48';
              Animated.spring(gazeX, {
                toValue: lastFaceDirRef.current === 'left' ? -45 : 45,
                useNativeDriver: true,
              }).start();
              await sendChassisCommand(searchDir);
            }
          }
        } catch (e) {
        } finally {
          curiosityBusyRef.current = false;
        }
      }
    }, 140);

    return () => clearInterval(loop);
  }, [cameraPermission?.granted, cameraFacing, serverUrl]);

  const askZaitho = async (rawQuestion) => {
    const q = (rawQuestion || inputText || '').trim();
    if (!q || isThinkingRef.current) return;
    setInputText('');
    isThinkingRef.current = true;
    setIsThinking(true);
    applyEyeGeometry('thinking');

    const lower = q.toLowerCase();

    try {
      // Si Zaitho preguntó por un objeto desconocido en el Bucle de Curiosidad, aprender la respuesta
      if (pendingCuriosityRef.current && !/^(?:para|detente|stop|explora|baila)/i.test(lower)) {
        const pending = pendingCuriosityRef.current;
        pendingCuriosityRef.current = null;
        const cleanLabel = q.replace(/^(?:es\s+un[ao]?|eso\s+es\s+un[ao]?|se\s+llama)\s+/i, '').trim();
        const nextDb = [
          {
            id: `vis_${Date.now()}`,
            category: 'object',
            label: cleanLabel,
            features: `Detectado por YOLO como ${pending.yolo_label}; el usuario indicó: ${cleanLabel}`,
            createdAt: Date.now(),
          },
          ...visionDbRef.current,
        ].slice(0, 35);
        await persistVisionDbLocal(nextDb);
        saveImportantFact(`Objeto aprendido (${pending.yolo_label}): ${cleanLabel}`, 'object');
        triggerExpression('memory_saved', true, 3200);
        showDataAboveEyes('💾 OBJETO APRENDIDO', cleanLabel, `YOLO: ${pending.yolo_label}`);
        speakZaitho(`¡Anotado! Recordaré que eso es ${cleanLabel}.`);
        return;
      }

      // Saludo / verificación rápida de micrófono (sin ir a internet)
      if (/^(?:me\s+escuchas|est[aá]s\s+ah[ií]|hola(?:\s+zaitho)?|al[oó])$/i.test(lower.trim())) {
        triggerExpression('wake_spark', true, 2600);
        speakZaitho(`¡Sí ${userName}, te escucho fuerte y claro!`);
        return;
      }

      // Orden de BAILAR -> Corcheas en pantalla + Melodía + Secuencia de baile en las ruedas
      if (/baila|baile|bailar|m[uú]sica|fiesta/i.test(lower)) {
        triggerRobotDance();
        return;
      }

      // Seguimiento de ojos / rostro en 4 direcciones
      if (/s[ií]gueme|sigue\s+mi\s+(?:rostro|cara|ojos|mirada)|m[ií]rame\s+siempre/i.test(lower)) {
        setExplorerMode(false);
        setFaceFollowMode(true);
        triggerExpression('curious', true, 3000);
        speakZaitho('Seguimiento de rostro activado. Me moveré contigo.');
        return;
      }
      if (/deja\s+de\s+seguir|no\s+me\s+sigas/i.test(lower)) {
        setFaceFollowMode(false);
        sendChassisCommand('S');
        triggerExpression('happy', true, 2500);
        speakZaitho('Seguimiento de rostro desactivado.');
        return;
      }

      // Orden de LEER NOTIFICACIONES (WhatsApp / Correos activos)
      if (/notificaci|whatsapp|correo|mensaje|arriv[oó]|lleg[oó]/i.test(lower)) {
        if (activeNotifBadges.length > 0) {
          await openNotificationBadge(activeNotifBadges[0]);
        } else {
          showDataAboveEyes('📭 BANDEJA AL DÍA', 'Sin pendientes', 'WhatsApp y Correo revisados');
          speakZaitho('No tienes notificaciones nuevas pendientes.');
        }
        return;
      }

      if (/d[oó]nde est[aá]s parado|[aá]ngulo|giro|rumbo|inclinaci[oó]n|orientaci[oó]n/i.test(lower)) {
        showDataAboveEyes(
          `🧭 RUMBO ${imuData.heading}° (${imuData.cardinal})`,
          imuData.stance,
          `Pitch: ${imuData.pitch}° · Roll: ${imuData.roll}° · ${imuData.gForce}G`
        );
        speakZaitho(
          `Estoy mirando a ${imuData.heading} grados rumbo ${imuData.cardinal}, en posición ${imuData.stance}.`
        );
        return;
      }

      // Movimientos físicos directos por voz (con auto-freno 'S', sin ir a internet)
      if (/(?:gira|dobla|mu[eé]vete|ve).*izquierda/i.test(lower)) {
        turnChassisByDegrees(-90);
        speakZaitho('Moviéndome a la izquierda.');
        return;
      }
      if (/(?:gira|dobla|mu[eé]vete|ve).*derecha/i.test(lower)) {
        turnChassisByDegrees(90);
        speakZaitho('Moviéndome a la derecha.');
        return;
      }
      if (/(?:avanza|mu[eé]vete\s+adelante|camina|ven\s+ac[aá]|para\s+adelante)/i.test(lower)) {
        sendChassisCommand('F:650:55');
        triggerExpression('excited', true, 2200);
        speakZaitho('Avanzando hacia adelante.');
        return;
      }
      if (/(?:retrocede|mu[eé]vete\s+atr[aá]s|para\s+atr[aá]s)/i.test(lower)) {
        sendChassisCommand('B:650:55');
        triggerExpression('curious', true, 2200);
        speakZaitho('Retrocediendo un poco.');
        return;
      }
      if (/media vuelta|180/i.test(lower)) {
        turnChassisByDegrees(180);
        speakZaitho('Dando media vuelta de 180 grados.');
        return;
      }

      if (/hora|fecha/i.test(lower)) {
        const now = new Date();
        const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const fecha = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
        showDataAboveEyes('🕒 HORA ACTUAL', hora, fecha);
        speakZaitho(`Son las ${hora}.`);
        return;
      }

      if (/distancia|sensor|hc-sr04|ultras[oó]nico/i.test(lower)) {
        sendChassisCommand('D');
        const txt = distanceCm >= 400 ? 'Libre (>4m)' : `${distanceCm.toFixed(1)} cm`;
        showDataAboveEyes('📏 SENSOR HC-SR04', txt, `Rumbo ${imuData.heading}° ${imuData.cardinal}`);
        speakZaitho(`Mi sensor ultrasónico mide ${txt}.`);
        return;
      }

      if (/deja\s+de\s+explorar/i.test(lower)) {
        setExplorerMode(false);
        sendChassisCommand('S');
        triggerExpression('happy', true, 2500);
        speakZaitho('Exploración detenida.');
        return;
      }

      if (/explora/i.test(lower)) {
        setExplorerMode(true);
        showDataAboveEyes('🧭 MODO EXPLORADOR', 'Reconociendo objetos', `Rumbo ${imuData.heading}°`);
        speakZaitho('Modo explorador con reconocimiento de objetos activado.');
        return;
      }

      // Herramienta de VISIÓN (Rostros, Plantas y Objetos con Cámara directa)
      const isRememberFace = /(?:yo\s+soy|me\s+llamo)\s+([a-záéíóúñ]+)|recuerda\s+(?:mi\s+cara|qui[eé]n\s+soy)|aprende\s+qui[eé]n\s+soy/i.exec(lower);
      const isIdentifyFace = /qui[eé]n\s+soy|me\s+reconoces|sabes\s+qui[eé]n\s+soy/i.test(lower);
      const isRememberPlant = /(?:esta\s+planta\s+se\s+llama|recuerda\s+esta\s+planta\s+como|recuerda\s+este\s+objeto\s+como)\s+([a-záéíóúñ\s]{2,30})/i.exec(lower);
      const isIdentifyPlantOrObj = /qu[eé]\s+planta\s+es|reconoce\s+(?:esta|la)\s+planta|qu[eé]\s+(?:est[aá]s\s+viendo|objeto\s+es|ves|es\s+esto)|m[ií]rame/i.test(lower);

      if (isRememberFace || isIdentifyFace || isRememberPlant || isIdentifyPlantOrObj) {
        triggerExpression('curious', false, 5000);
        const targetFacing = 'front';
        const mode = (isRememberFace || isRememberPlant) ? 'remember' : 'identify';
        const category = (isRememberFace || isIdentifyFace) ? 'face' : (isRememberPlant || /planta/i.test(lower) ? 'plant' : 'object');
        const label = isRememberFace ? (isRememberFace[1] || userName || 'Carlos') : (isRememberPlant ? isRememberPlant[1].trim() : '');

        const wantsAiDetail = /detalle|exact|marca|lee|dice|analiza\s+bien|describe\s+bien|con\s+ia/i.test(lower);
        showInternetPanel('📸 Tomando foto...', 'Capturando imagen con cámara frontal para analizarla...', 'Cámara Zaitho');
        const vis = await captureAndAnalyzeVision(mode, category, label, targetFacing, (b64) => {
          showInternetPanel(
            '📸 Foto tomada · Analizando...',
            wantsAiDetail ? 'Analizando con IA de precisión...' : 'Procesando con YOLO...',
            'Cámara Frontal',
            `data:image/jpeg;base64,${b64}`
          );
        }, wantsAiDetail);
        const capturedUri = vis?.photoBase64 ? `data:image/jpeg;base64,${vis.photoBase64}` : null;
        if (!vis || !vis.ok) {
          closeInternetPanel();
          showDataAboveEyes('⚠️ VISIÓN', 'Error al analizar', vis?.error || 'Revisa cámara o modelo');
          triggerExpression('nervous_sweat', true, 3000);
          speakZaitho(vis?.error || 'No pude analizar la foto con el modelo actual.');
          return;
        }
        if (mode === 'remember') {
          if (category === 'face' && label) setUserName(label);
          showInternetPanel(
            '📸 Memoria Visual Guardada',
            `Guardé "${label || 'esta imagen'}" (${vis.category || category}): ${vis.features || 'registrado'}`,
            'Cámara Frontal',
            capturedUri
          );
          triggerExpression('love', true, 3200);
          speakZaitho(`Listo, ya capturé y guardé en mi memoria a ${label || 'esta imagen'}.`);
          return;
        }
        if (vis.recognized && vis.matchedLabel) {
          showInternetPanel(
            vis.matchedCategory === 'face' ? `👤 Rostro Reconocido` : `🌿 Reconocimiento Visual`,
            `¡Hola ${vis.matchedLabel}! Coincidencia visual ${(vis.similarity * 100).toFixed(0)}%.`,
            'Zaitho YOLO + OpenCV',
            capturedUri
          );
          triggerExpression('love', true, 3500);
          speakZaitho(
            vis.matchedCategory === 'face'
              ? `¡Eres ${vis.matchedLabel}! Qué gusto verte.`
              : `Reconozco esto: es ${vis.matchedLabel}.`
          );
          return;
        }
        const objs = (vis.detections || []).map((d) => d.labelEs).filter(Boolean);
        const resumen = objs.length > 0 ? objs.join(', ') : (vis.facesFound > 0 ? 'un rostro aún no registrado' : 'nada claro todavía');
        showInternetPanel('👁️ Cámara Zaitho (Frontal)', `Detecto: ${resumen}.`, 'Visión Local', capturedUri);
        speakZaitho(
          vis.facesFound > 0 && isIdentifyFace
            ? 'Veo tu rostro, pero aún no me has dicho quién eres para guardarlo. Dime "soy" y tu nombre.'
            : `En la cámara veo: ${resumen}.`
        );
        return;
      }

      // Paro de emergencia inmediato por voz
      if (/^(?:para|detente|frena|stop|alto)$/i.test(lower.trim())) {
        sendChassisCommand('S');
        setExplorerMode(false);
        triggerExpression('surprised', true, 2200);
        speakZaitho('Frenado de inmediato.');
        return;
      }

      // Aprendizaje automático directo si el usuario da un dato importante
      const memDirect = /(?:recuerda\s+que|aprende\s+que|no\s+olvides\s+que|mi\s+.+\s+favorit[oa]\s+es|vivo\s+en)\s+(.+)/i.exec(q);
      if (memDirect) {
        saveImportantFact(q.trim(), 'user_fact');
      }

      let internetWidgetShown = false;
      let learnedNow = false;

      const executeTool = async (fnName, args = {}) => {
        if (fnName === 'buscar_internet') {
          const targetQ = args.consulta || q;
          if (!shouldAllowInternetFallback(targetQ)) {
            return { ok: false, error: 'Esta consulta es conversacional o de control local; no requiere buscar en internet.' };
          }
          applyEyeGeometry('searching_radar');
          const inet = await fetchInternetDirect(args.consulta || q);
          if (inet && inet.contextText) {
            showInternetPanel(
              inet.title || 'Consulta en Internet',
              inet.summary || inet.contextText,
              inet.source || 'Internet en vivo'
            );
            internetWidgetShown = true;
            return { ok: true, ...inet };
          }
          return { ok: false, error: 'Sin resultados web directos' };
        }

        if (fnName === 'consultar_clima') {
          applyEyeGeometry('searching_radar');
          const wx = await fetchWeatherDirect(args.ciudad || 'Santiago');
          if (wx.ok) {
            showInternetPanel(`🌤️ Clima en ${wx.ciudad}`, wx.resumen, 'Open-Meteo en vivo');
            internetWidgetShown = true;
          }
          return wx;
        }

        if (fnName === 'procesar_datos_y_calculos') {
          const calcRes = args.expresion ? evaluateSafeMath(args.expresion) : null;
          const statsRes = Array.isArray(args.numeros) && args.numeros.length > 0 ? computeStats(args.numeros) : null;
          if (calcRes !== null || statsRes) {
            applyEyeGeometry('aha_eureka');
            return { ok: true, calculo: calcRes, estadistica: statsRes };
          }
          return { ok: false, error: 'Expresión o datos inválidos' };
        }

        if (fnName === 'memoria_semantica') {
          const act = args.accion || 'buscar';
          if (act === 'guardar' && args.texto) {
            saveImportantFact(args.texto, args.categoria || 'learned');
            learnedNow = true;
            applyEyeGeometry('memory_saved');
            return { ok: true, guardado: args.texto };
          }
          if (act === 'listar') {
            return { ok: true, recuerdos: memories.slice(0, 12) };
          }
          const found = searchMemoriesByRelevance(memories, args.texto || q, 6);
          return { ok: true, coincidencias: found };
        }

        if (fnName === 'controlar_chasis') {
          const dur = Math.min(1500, Math.max(200, Number(args.duracion_ms) || 450));
          const mapAcc = {
            adelante: `F:${dur}:55`,
            atras: `B:${dur}:55`,
            izquierda: `L:${dur}:55`,
            derecha: `R:${dur}:55`,
            detener: 'S',
            bailar: 'DANCE',
            curioso: 'N',
            emocionado: 'E',
          };
          const bleCmd = mapAcc[args.accion] || 'S';
          if (bleCmd === 'DANCE') {
            triggerRobotDance();
          } else {
            await sendChassisCommand(bleCmd);
          }
          return { ok: true, comando: bleCmd, bleConectado: bleConnected };
        }

        if (fnName === 'leer_telemetria') {
          const now = new Date();
          return {
            ok: true,
            distancia_cm: Number(distanceCm.toFixed(1)),
            rumbo_grados: imuData.heading,
            cardinal: imuData.cardinal,
            pitch: imuData.pitch,
            roll: imuData.roll,
            postura: imuData.stance,
            ble_conectado: bleConnected,
            fecha_hora: now.toLocaleString('es-CL'),
          };
        }

        if (fnName === 'programar_recordatorio') {
          const secs = Math.max(3, Number(args.segundos) || 10);
          const msg = args.mensaje || '¡Recordatorio!';
          setTimeout(() => {
            wakeUpZaitho(true);
            triggerExpression('aha_eureka', true, 4500);
            showDataAboveEyes('⏰ RECORDATORIO', msg, `Programado hace ${secs}s`);
            speakZaitho(`Recordatorio: ${msg}`);
          }, secs * 1000);
          return { ok: true, programado_en_segundos: secs, mensaje: msg };
        }

        return { ok: false, error: `Herramienta desconocida: ${fnName}` };
      };

      const now = new Date();
      const reply = await runZaithoAgent({
        query: q,
        userName,
        memories,
        telemetry: {
          heading: imuData.heading,
          cardinal: imuData.cardinal,
          stance: imuData.stance,
          distanceCm: distanceCm.toFixed(1),
          bleConnected,
          nowStr: now.toLocaleString('es-CL'),
        },
        callLLM: callLLMCompletion,
        executeTool,
        onStageChange: (fnName) => {
          if (fnName === 'buscar_internet' || fnName === 'consultar_clima') {
            applyEyeGeometry('searching_radar');
          } else if (fnName === 'procesar_datos_y_calculos') {
            applyEyeGeometry('thinking');
          }
        },
      });

      const learnMatch = /\[LEARN:([^\]]+)\]/gi;
      let lm;
      while ((lm = learnMatch.exec(reply)) !== null) {
        if (lm[1] && lm[1].trim().length >= 3) {
          saveImportantFact(lm[1].trim(), 'learned');
          learnedNow = true;
        }
      }

      const dataMatch = /\[DATA:([^|\]]+)(?:\|([^|\]]*))?(?:\|([^|\]]*))?\]/i.exec(reply);
      if (dataMatch && !internetWidgetShown) {
        showDataAboveEyes((dataMatch[2] || 'DATO').trim(), dataMatch[1].trim(), (dataMatch[3] || '').trim());
      }

      const exprMatch = /\[EXPR:([\w-]+)\]/i.exec(reply);
      if (exprMatch && !readingActive.current) {
        triggerExpression(exprMatch[1].toLowerCase(), false, 3600);
      } else if (learnedNow && !readingActive.current) {
        triggerExpression('memory_saved', false, 3200);
      } else if (!readingActive.current) {
        triggerExpression(currentBaseModeRef.current, false, 0);
      }

      const clean = reply
        .replace(/\[LEARN:[^\]]+\]/gi, '')
        .replace(/\[DATA:[^\]]+\]/gi, '')
        .replace(/\[EXPR:[\w-]+\]/gi, '')
        .replace(/\[TOOL:[\s\S]*?\]/gi, '')
        .replace(/[*#`]/g, '')
        .trim();

      speakZaitho(clean);
    } catch (err) {
      // Fallback autónomo directo si el servidor LLM (ej. freellmapi 502) falla o tarda
      try {
        if (/\b(clima|temperatura|tiempo|lluvia|fr[ií]o|calor)\b/i.test(lower)) {
          const cityMatch = /\ben\s+([a-záéíóúñ\s]{2,25})/i.exec(lower);
          const wx = await fetchWeatherDirect(cityMatch ? cityMatch[1].trim() : 'Santiago');
          if (wx.ok) {
            showInternetPanel(`🌤️ Clima en ${wx.ciudad}`, wx.resumen, 'Open-Meteo directo');
            triggerExpression('happy', false, 3500);
            speakZaitho(wx.resumen);
            return;
          }
        }
        const inetFallback = shouldAllowInternetFallback(q) ? await fetchInternetDirect(q) : null;
        if (inetFallback && inetFallback.summary) {
          showInternetPanel(
            inetFallback.title || 'Consulta en Internet',
            inetFallback.summary,
            inetFallback.source || 'Internet directo'
          );
          triggerExpression('aha_eureka', false, 3500);
          speakZaitho(inetFallback.summary.slice(0, 220));
          return;
        }
      } catch (e2) {}

      const errMsg = err?.message || 'Error de conexión con la IA';
      showDataAboveEyes('⚠️ ERROR IA', aiProviderRef.current.toUpperCase(), errMsg);
      triggerExpression('nervous_sweat', true, 3200);
      speakZaitho(`${errMsg}. Puedes cambiar a Google Gemini en Ajustes.`);
    } finally {
      isThinkingRef.current = false;
      setIsThinking(false);
    }
  };

  // ============================================================================
  // 10. RENDERIZADO DE LOS OJOS + MEJILLAS ROSADAS + CORAZONES/CORCHEAS + ÍCONOS NOTIF
  // ============================================================================
  const minDim = Math.min(screen.width, screen.height);
  const eyeW = Math.min(screen.width * 0.27, minDim * 0.38, 175);
  const eyeH = eyeW * 1.24;
  const eyeGap = Math.min(screen.width * 0.16, 110);
  const scanlines = Array.from({ length: 22 });

  const renderVectorEye = (isRight) => {
    const sX = isRight ? scaleXR : scaleXL;
    const sY = Animated.multiply(isRight ? scaleYR : scaleYL, isRight ? openR : openL);
    const tiltDeg = (isRight ? tiltR : tiltL).interpolate({
      inputRange: [-30, 30],
      outputRange: ['-30deg', '30deg'],
    });
    const happyTranslateY = happyArch.interpolate({
      inputRange: [0, 1],
      outputRange: [eyeH, eyeH * 0.28],
    });
    const squintTranslateY = squintBot.interpolate({
      inputRange: [0, 1],
      outputRange: [eyeH * 0.55, eyeH * 0.08],
    });
    const shape = isRight ? faceVisual.shapeR : faceVisual.shapeL;

    if (shape && shape !== 'orb') {
      const symbolMap = {
        heart: '❤',
        star: '✦',
        spiral: '🌀',
        line: '—',
        chevron: isRight ? '‹' : '›',
        crescent: '◡',
      };
      return (
        <Animated.View
          style={[
            styles.specialEyeBox,
            {
              width: eyeW,
              height: eyeH,
              transform: [
                { translateX: Animated.add(gazeX, shakeX) },
                { translateY: gazeY },
                { scaleX: sX },
                { scaleY: sY },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.specialEyeGlyph,
              {
                color: eyeColor,
                fontSize: Math.min(eyeW, eyeH) * (shape === 'line' ? 0.95 : 0.88),
                textShadowColor: eyeColor,
              },
            ]}
          >
            {symbolMap[shape] || '●'}
          </Text>
        </Animated.View>
      );
    }

    return (
      <Animated.View
        style={[
          styles.eyeBox,
          {
            width: eyeW,
            height: eyeH,
            borderRadius: eyeW * 0.34,
            backgroundColor: eyeColor,
            shadowColor: eyeColor,
            transform: [
              { translateX: Animated.add(gazeX, shakeX) },
              { translateY: gazeY },
              { scaleX: sX },
              { scaleY: sY },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.upperLidCut,
            {
              width: eyeW * 1.5,
              height: eyeH * 0.45,
              top: -eyeH * 0.28,
              left: -eyeW * 0.25,
              transform: [{ rotate: tiltDeg }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.happyLowerArc,
            {
              width: eyeW * 1.35,
              height: eyeH * 0.9,
              borderRadius: eyeW * 0.7,
              left: -eyeW * 0.175,
              transform: [{ translateY: happyTranslateY }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.squintBottomBar,
            {
              width: eyeW * 1.2,
              height: eyeH * 0.5,
              transform: [{ translateY: squintTranslateY }],
            },
          ]}
        />

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {scanlines.map((_, idx) => (
            <View key={idx} style={styles.scanline} />
          ))}
        </View>
      </Animated.View>
    );
  };

  const renderFaceMouth = () => {
    const m = faceVisual.mouth;
    if (!m || m === 'none') return null;
    const mouthGlyphs = {
      smile: '◡',
      wide_smile: 'ᗜ',
      open_d: 'ᗡ',
      cat_w: 'ω',
      pout: '︵',
      circle_o: '○',
      oval_yawn: '◯',
      kiss_3: 'з',
      wavy: '〰',
      flat: '—',
      smirk: '︶',
    };
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.mouthContainer,
          {
            transform: [
              { translateX: gazeX },
              { translateY: gazeY },
              { rotate: m === 'open_d' ? '90deg' : '0deg' },
            ],
          },
        ]}
      >
        <Text style={[styles.mouthText, { color: eyeColor, textShadowColor: eyeColor }]}>
          {mouthGlyphs[m] || '◡'}
        </Text>
      </Animated.View>
    );
  };

  return (
    <View
      style={styles.stage}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <StatusBar hidden />

      {/* ÍCONOS FLOTANTES DE NOTIFICACIONES ACTIVAS (WhatsApp, Correo, etc.) */}
      {activeNotifBadges.length > 0 && (
        <View style={styles.notifBadgesBar}>
          {activeNotifBadges.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              style={[
                styles.notifPill,
                notif.appName.toLowerCase().includes('whatsapp') && styles.notifPillWa,
                notif.appName.toLowerCase().includes('correo') && styles.notifPillMail,
              ]}
              onPress={() => openNotificationBadge(notif)}
            >
              <Text style={styles.notifPillIcon}>{notif.icon || '💬'}</Text>
              <Text style={styles.notifPillText} numberOfLines={1}>
                {notif.sender}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* PUNTO SUTIL CUANDO EL VAD DETECTA TU VOZ HUMANA */}
      {voiceActiveNow && <View style={styles.vadDot} pointerEvents="none" />}

      {/* WIDGET FLOTANTE ARRIBA DE LOS OJOS */}
      {floatingData.visible && (
        <Animated.View
          style={[
            styles.floatingWidget,
            {
              borderColor: eyeColor,
              shadowColor: eyeColor,
              opacity: widgetAnim,
              transform: [
                {
                  translateY: widgetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-25, 0],
                  }),
                },
                {
                  scale: widgetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.fdLabel, { color: eyeColor }]}>{floatingData.label}</Text>
          <Text style={styles.fdValue}>{floatingData.value}</Text>
          {!!floatingData.subtitle && <Text style={styles.fdSubtitle}>{floatingData.subtitle}</Text>}
        </Animated.View>
      )}

      {/* PARTÍCULAS FLOTANTES: CORAZONES (Al acariciar) o CORCHEAS MUSICALES (Al bailar) */}
      {particles.map((p, idx) => (
        <Animated.Text
          key={p.id}
          pointerEvents="none"
          style={[
            styles.floatingParticle,
            {
              left: p.left,
              top: p.top,
              color: p.color,
              opacity: particleAnim.interpolate({
                inputRange: [0, 0.2, 0.85, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: particleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, -135 - (idx % 3) * 28],
                  }),
                },
                {
                  translateX: particleAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, idx % 2 === 0 ? -18 : 18, idx % 2 === 0 ? 12 : -12],
                  }),
                },
                {
                  scale: particleAnim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0.5, 1.25, 0.9],
                  }),
                },
              ],
            },
          ]}
        >
          {p.sym}
        </Animated.Text>
      ))}

      {/* MODAL RÁPIDO PARA ENTRENAR UN OBJETO TOCANDO SU CAJA YOLO */}
      <Modal
        visible={!!trainModalTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setTrainModalTarget(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '88%', maxWidth: 360, backgroundColor: '#0A1622', borderRadius: 16, borderWidth: 1.5, borderColor: '#00F2FF', padding: 16 }}>
            <Text style={{ color: '#00F2FF', fontSize: 15, fontWeight: '800', marginBottom: 6 }}>
              🏷️ Entrenar Objeto en YOLO
            </Text>
            <Text style={{ color: '#9EB3C2', fontSize: 12, marginBottom: 10 }}>
              Detectado ahora: {trainModalTarget?.currentLabel || 'desconocido'}. Escribe cómo debe recordarlo Zaitho:
            </Text>
            <TextInput
              style={{ backgroundColor: '#040C14', color: '#fff', borderWidth: 1, borderColor: '#1E3A52', borderRadius: 10, padding: 10, marginBottom: 12 }}
              placeholder="Ej: Mi taza azul, Planta de albahaca..."
              placeholderTextColor="#5C768D"
              value={trainModalText}
              onChangeText={setTrainModalText}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setTrainModalTarget(null)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1B2B3A' }}
              >
                <Text style={{ color: '#CBD5E1', fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const lbl = trainModalText.trim();
                  const tgt = trainModalTarget;
                  setTrainModalTarget(null);
                  if (!lbl || !tgt?.frameBase64) return;
                  try {
                    await runOnDeviceVision({
                      base64: tgt.frameBase64,
                      mode: 'remember',
                      label: lbl,
                      category: 'object',
                      box: tgt.normBox,
                    });
                    saveImportantFact(`Entrené a Zaitho: ${lbl}`, 'vision');
                    triggerExpression('love', true, 2400);
                    speakZaitho(`¡Anotado! Ahora recordaré que eso es ${lbl}.`);
                  } catch (e) {}
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#00F2FF' }}
              >
                <Text style={{ color: '#000', fontWeight: '800' }}>Guardar en YOLO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* VISIÓN EN VIVO A 20-30 FPS: WebView WebGL (BlazeFace + COCO-SSD) cuando sigue rostro o explora; CameraView para fotos bajo demanda */}
      {cameraPermission?.granted && (faceFollowMode || explorerMode) ? (
        <View
          pointerEvents={showVisionBoxes ? 'box-none' : 'none'}
          style={
            showVisionBoxes
              ? {
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: 192,
                  height: 144,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1.5,
                  borderColor: '#00F2FF',
                  backgroundColor: '#000',
                  zIndex: 35,
                }
              : styles.hiddenCamera
          }
        >
          <WebView
            ref={webVisionRef}
            source={{ html: webVisionHtmlRef.current, baseUrl: 'https://localhost' }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            onMessage={handleWebVisionMessage}
            onLoadEnd={() => {
              const m = explorerModeRef.current ? 'explore' : 'follow';
              webVisionRef.current?.injectJavaScript(`window.setZaithoVisionMode && window.setZaithoVisionMode('${m}'); true;`);
            }}
            style={{ width: showVisionBoxes ? 192 : 2, height: showVisionBoxes ? 144 : 2, backgroundColor: '#000' }}
          />
          {showVisionBoxes && (
            <TouchableOpacity
              onPress={() => setShowVisionBoxes(false)}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                backgroundColor: 'rgba(0,0,0,0.65)',
                borderRadius: 10,
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : cameraPermission?.granted ? (
        <View pointerEvents="none" style={styles.hiddenCamera}>
          <CameraView
            ref={cameraRef}
            facing={cameraFacing}
            flash="off"
            animateShutter={false}
            pictureSize={smallestPictureSize || undefined}
            onCameraReady={async () => {
              try {
                if (cameraRef.current?.getAvailablePictureSizesAsync) {
                  const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
                  if (Array.isArray(sizes) && sizes.length > 0) {
                    const sorted = [...sizes].sort((a, b) => {
                      const [aw, ah] = a.split('x').map(Number);
                      const [bw, bh] = b.split('x').map(Number);
                      return (aw * ah || 9999999) - (bw * bh || 9999999);
                    });
                    const picked = sorted.find((s) => Number(s.split('x')[0]) >= 240) || sorted[0];
                    if (picked) setSmallestPictureSize(picked);
                  }
                }
              } catch (e) {}
            }}
            style={{ width: 2, height: 2 }}
          />
        </View>
      ) : null}

      {/* OJOS DE ANKI VECTOR (Se deslizan a la izquierda un poco más pequeños al mostrar datos de Internet) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.eyesRow,
          {
            gap: eyeGap,
            transform: [
              {
                translateX: eyesSplitAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -screen.width * 0.21],
                }),
              },
              {
                scale: eyesSplitAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.72],
                }),
              },
            ],
          },
        ]}
      >
        {renderVectorEye(false)}
        {renderVectorEye(true)}
        {!!faceVisual.glyph && (
          <View style={styles.faceGlyphBadge} pointerEvents="none">
            <Text style={styles.faceGlyphText}>{faceVisual.glyph}</Text>
          </View>
        )}
      </Animated.View>

      {renderFaceMouth()}

      {/* RECUADRO FLOTANTE DERECHO PARA DATOS DE INTERNET / VISIÓN */}
      {internetCard && (
        <Animated.View
          style={[
            styles.internetRightCard,
            {
              width: Math.min(screen.width * 0.44, 340),
              borderColor: eyeColor,
              opacity: eyesSplitAnim,
              transform: [
                {
                  translateX: eyesSplitAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.internetCardHeader}>
            <Text style={[styles.internetCardTitle, { color: eyeColor }]} numberOfLines={1}>
              🌐 {internetCard.title}
            </Text>
            <TouchableOpacity onPress={closeInternetPanel} style={styles.internetCloseBtn}>
              <Text style={styles.internetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.internetCardScroll}>
            {!!internetCard.imageUri && (
              <Image
                source={{ uri: internetCard.imageUri }}
                style={{ width: '100%', height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: '#000' }}
                resizeMode="cover"
              />
            )}
            <Text style={styles.internetCardBody}>{internetCard.summary}</Text>
          </ScrollView>
          {!!internetCard.source && (
            <Text style={styles.internetCardSource}>Fuente: {internetCard.source}</Text>
          )}
        </Animated.View>
      )}

      {/* MEJILLAS ROSADAS TIERNAS CUANDO LO ACARICIAS */}
      {showBlushCheeks && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.blushRow,
            {
              width: eyeW * 2 + eyeGap + 70,
              opacity: blushOpacity,
              transform: [{ translateX: gazeX }, { translateY: gazeY }],
            },
          ]}
        >
          <View style={styles.blushCheek} />
          <View style={styles.blushCheek} />
        </Animated.View>
      )}

      {/* Subtítulo discreto solo cuando Zaitho nos habla */}
      {!!lastSpeechBubble && (
        <View style={styles.speechSubtitleBox} pointerEvents="none">
          <Text style={styles.speechSubtitleText}>{lastSpeechBubble}</Text>
        </View>
      )}

      {/* PANEL OCULTO DE CONTROL (Al abrirse libera el micrófono para dictado de teclado) */}
      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>⚙️ ZAITHO — VOZ HUMANA VAD + BLE + GESTOS</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDrawerOpen(false)}>
              <Text style={styles.closeBtnText}>Volver a Ojos</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.drawerScroll}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                🎙️ Micrófono con Filtro de Voz Humana (Liberado para Teclado aquí)
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Usa el micrófono del teclado o escribe aquí..."
                  placeholderTextColor="#666"
                  onSubmitEditing={() => {
                    const txt = inputText;
                    setDrawerOpen(false);
                    askZaitho(txt);
                  }}
                />
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={() => {
                    const txt = inputText;
                    setDrawerOpen(false);
                    askZaitho(txt);
                  }}
                >
                  <Text style={styles.sendBtnText}>Decir</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.quickChipsRow}>
                {[
                  { lbl: '🎵 ¡Baila Zaitho!', q: 'Baila para mí' },
                  { lbl: '📬 Leer Notificaciones', q: '¿Qué notificaciones o mensajes tengo?' },
                  { lbl: '🧭 ¿Dónde estás parado?', q: '¿Dónde estás parado y cuál es tu ángulo?' },
                  { lbl: '🕒 Hora', q: '¿Qué hora es?' },
                  { lbl: '💰 UF Hoy', q: '¿A cuánto está la UF hoy?' },
                  { lbl: '🌡️ Clima', q: '¿Cuál es la temperatura actual?' },
                  { lbl: '📏 HC-SR04', q: '¿Qué distancia mide el sensor ultrasónico?' },
                  { lbl: '🧭 Explorar Lento', q: 'Explora el lugar despacio' },
                ].map((chip, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.chipBtn}
                    onPress={() => {
                      setDrawerOpen(false);
                      askZaitho(chip.q);
                    }}
                  >
                    <Text style={styles.chipText}>{chip.lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🦿 Chasis Exclusivo BLE ({hwLinkName})</Text>
              <Text style={styles.cardSub}>
                BLE: {bleConnected ? '🟢 CONECTADO (98:3D:AE:EE:F2:8D)' : '🔴 Buscando BLE...'} · HC-SR04: {distanceCm.toFixed(1)} cm
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => {
                    setDrawerOpen(false);
                    triggerRobotDance();
                  }}
                >
                  <Text style={styles.zBtnText}>🎵 Bailar con Corcheas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => {
                    setDrawerOpen(false);
                    triggerExpression('angry', true, 3400);
                    triggerEyeTantrumShake();
                    sendChassisCommand('TANTRUM:R');
                  }}
                >
                  <Text style={styles.zBtnText}>😠 Probar Berrinche</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => {
                    setDrawerOpen(false);
                    connectChassis(false);
                  }}
                >
                  <Text style={styles.zBtnText}>🔗 Reconectar BLE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.zBtn, { borderColor: '#FF3D00' }]}
                  onPress={() => {
                    setExplorerMode(false);
                    setFaceFollowMode(false);
                    sendChassisCommand('S');
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>🛑 Frenar Ruedas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.zBtn, faceFollowMode && styles.zBtnActive]}
                  onPress={() => {
                    const next = !faceFollowMode;
                    setFaceFollowMode(next);
                    if (next) setExplorerMode(false);
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>{faceFollowMode ? '👁️ Siguiendo Rostro' : '👁️ Seguir Rostro'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.zBtn, explorerMode && styles.zBtnActive]}
                  onPress={() => {
                    const next = !explorerMode;
                    setExplorerMode(next);
                    if (next) setFaceFollowMode(false);
                    else sendChassisCommand('S');
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>{explorerMode ? '🧭 Explorando Objetos' : '🧭 Explorar Objetos'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.zBtn, showVisionBoxes && styles.zBtnActive]}
                  onPress={() => setShowVisionBoxes((prev) => !prev)}
                >
                  <Text style={styles.zBtnText}>{showVisionBoxes ? '📦 Cajas Visión ON' : '📦 Cajas Visión OFF'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🧠 Proveedor de Inteligencia Artificial (En Español)</Text>
              <Text style={styles.cardSub}>
                Activo: {aiProvider === 'gemini' ? 'Google Gemini' : 'freellmapi (Tailscale)'} · Modelo: {aiModel}
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.zBtn, aiProvider === 'freellmapi' && styles.zBtnActive]}
                  onPress={() => {
                    setAiProvider('freellmapi');
                    setAiModel('auto');
                    saveAiConfig({ aiProvider: 'freellmapi', aiModel: 'auto' });
                    loadAvailableModels('freellmapi');
                  }}
                >
                  <Text style={styles.zBtnText}>🚀 freellmapi (Tailscale)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.zBtn, aiProvider === 'gemini' && styles.zBtnActive]}
                  onPress={() => {
                    setAiProvider('gemini');
                    setAiModel('gemini-2.5-flash');
                    saveAiConfig({ aiProvider: 'gemini', aiModel: 'gemini-2.5-flash' });
                    loadAvailableModels('gemini');
                  }}
                >
                  <Text style={styles.zBtnText}>✨ Google Gemini</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => loadAvailableModels()}
                >
                  <Text style={styles.zBtnText}>{loadingModels ? '⏳ Cargando...' : '🔄 Cargar Modelos'}</Text>
                </TouchableOpacity>
              </View>

              {aiProvider === 'gemini' && (
                <View style={[styles.inputRow, { marginTop: 10 }]}>
                  <TextInput
                    style={styles.textInput}
                    value={geminiApiKey}
                    onChangeText={(txt) => {
                      setGeminiApiKey(txt);
                      saveAiConfig({ geminiApiKey: txt });
                    }}
                    placeholder="Pega tu API Key de Google Gemini (AIza...)"
                    placeholderTextColor="#666"
                    secureTextEntry
                  />
                </View>
              )}

              {availableModels.length > 0 && (
                <View style={[styles.quickChipsRow, { marginTop: 10 }]}>
                  {availableModels.slice(0, 8).map((mId) => (
                    <TouchableOpacity
                      key={mId}
                      style={[styles.chipBtn, aiModel === mId && styles.zBtnActive]}
                      onPress={() => {
                        setAiModel(mId);
                        saveAiConfig({ aiModel: mId });
                      }}
                    >
                      <Text style={styles.chipText}>{mId}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>😴 Sueño, Wake Word ("Zaitho") y Expresiones ({ALL_EXPRESSION_KEYS.length})</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.zBtn, wakeWordOnly && styles.zBtnActive]}
                  onPress={() => {
                    const next = !wakeWordOnly;
                    setWakeWordOnly(next);
                    saveAiConfig({ wakeWordOnly: next });
                  }}
                >
                  <Text style={styles.zBtnText}>
                    {wakeWordOnly ? '🔒 Solo al decir "Zaitho"' : '🎙️ Escucha Libre Continua'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => {
                    setDrawerOpen(false);
                    if (isSleeping) {
                      wakeUpZaitho(true);
                    } else {
                      isSleepingRef.current = true;
                      setIsSleeping(true);
                      applyEyeGeometry('sleeping');
                    }
                  }}
                >
                  <Text style={styles.zBtnText}>{isSleeping ? '☀️ Despertar' : '💤 Dormir Ahora'}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.quickChipsRow, { marginTop: 10 }]}>
                {[
                  'starry_eyed',
                  'love',
                  'kitty_playful',
                  'shy_blush',
                  'laughing',
                  'wink',
                  'dizzy_spiral',
                  'searching_radar',
                  'memory_saved',
                  'celebrate_party',
                  'pouty',
                  'mischievous',
                ].map((exprKey) => (
                  <TouchableOpacity
                    key={exprKey}
                    style={styles.chipBtn}
                    onPress={() => {
                      setDrawerOpen(false);
                      triggerExpression(exprKey, true, 4000);
                    }}
                  >
                    <Text style={styles.chipText}>{exprKey}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>💬 Simular Notificaciones del Teléfono (Íconos Flotantes)</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={async () => {
                    await fetch(`${serverUrl}/api/notifications`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        appName: 'WhatsApp',
                        sender: 'Carlos',
                        message: '¡Mira cómo baila Zaitho con sus ruedas!',
                        icon: '💬',
                      }),
                    });
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>💬 Nuevo WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={async () => {
                    await fetch(`${serverUrl}/api/notifications`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        appName: 'Correo',
                        sender: 'GitHub',
                        message: 'Build completado exitosamente en el repositorio',
                        icon: '✉️',
                      }),
                    });
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>✉️ Nuevo Correo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🧭 Giroscopio e Inclinación en Vivo (IMU 6 Ejes)</Text>
              <Text style={styles.cardSub}>
                Rumbo: {imuData.heading}° ({imuData.cardinal}) · Postura: {imuData.stance}{'\n'}
                Pitch Rel: {imuData.pitch}° · Roll Rel: {imuData.roll}° · Fuerza: {imuData.gForce}G
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.zBtn}
                  onPress={() => {
                    gyroRef.current.heading = 0;
                    accelRef.current.neutralPitch = accelRef.current.pitch;
                    accelRef.current.neutralRoll = accelRef.current.roll;
                    accelRef.current.anchorPitch = accelRef.current.pitch;
                    accelRef.current.anchorRoll = accelRef.current.roll;
                    showDataAboveEyes('🧭 IMU CALIBRADA', 'Rumbo 0° · Roll/Pitch 0°', 'Posición en chasis fijada como centro');
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={styles.zBtnText}>🎯 Calibrar Posición en Chasis (0°)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgesBar: {
    position: 'absolute',
    top: 14,
    right: 18,
    flexDirection: 'row',
    gap: 8,
    zIndex: 40,
  },
  notifPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 20, 32, 0.92)',
    borderWidth: 1.2,
    borderColor: '#00F2FF',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    gap: 5,
  },
  notifPillWa: {
    borderColor: '#25D366',
  },
  notifPillMail: {
    borderColor: '#FFB800',
  },
  notifPillIcon: {
    fontSize: 13,
  },
  notifPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 85,
  },
  vadDot: {
    position: 'absolute',
    top: 18,
    left: 20,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00FFAA',
  },
  eyesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  eyeBox: {
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 28,
    elevation: 18,
  },
  upperLidCut: {
    position: 'absolute',
    backgroundColor: '#000000',
  },
  happyLowerArc: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: '#000000',
  },
  squintBottomBar: {
    position: 'absolute',
    bottom: -2,
    left: -10,
    backgroundColor: '#000000',
  },
  scanline: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.26)',
    marginBottom: 4,
  },
  blushRow: {
    position: 'absolute',
    top: '63%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  blushCheek: {
    width: 48,
    height: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 71, 163, 0.45)',
    shadowColor: '#FF47A3',
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 10,
  },
  floatingParticle: {
    position: 'absolute',
    fontSize: 30,
    fontWeight: '800',
    zIndex: 35,
  },
  floatingWidget: {
    position: 'absolute',
    top: '7%',
    minWidth: 250,
    maxWidth: '88%',
    backgroundColor: 'rgba(8, 14, 22, 0.95)',
    borderWidth: 1.5,
    borderColor: '#00F2FF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    zIndex: 30,
    shadowColor: '#00F2FF',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  fdLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00F2FF',
    letterSpacing: 2,
    marginBottom: 3,
  },
  fdValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  fdSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
    textAlign: 'center',
  },
  speechSubtitleBox: {
    position: 'absolute',
    bottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    maxWidth: '88%',
  },
  speechSubtitleText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#05080f',
    borderWidth: 1,
    borderColor: '#26354d',
    borderRadius: 10,
    color: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  sendBtn: {
    backgroundColor: '#00F2FF',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#000',
    fontWeight: '800',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chipBtn: {
    backgroundColor: 'rgba(0, 242, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 255, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#FFF',
    fontSize: 12,
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 242, 255, 0.25)',
    paddingBottom: 10,
    marginBottom: 12,
  },
  drawerTitle: {
    color: '#00F2FF',
    fontSize: 14,
    fontWeight: '800',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  drawerScroll: {
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 255, 0.2)',
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: {
    color: '#00F2FF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zBtn: {
    backgroundColor: 'rgba(0, 242, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 255, 0.35)',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  zBtnActive: {
    backgroundColor: '#00F2FF',
  },
  zBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  zBtnTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  hiddenCamera: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0.01,
    left: 0,
    top: 0,
  },
  internetRightCard: {
    position: 'absolute',
    right: 20,
    top: '18%',
    maxHeight: '64%',
    backgroundColor: 'rgba(6, 16, 26, 0.92)',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    zIndex: 25,
    shadowColor: '#00F2FF',
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  internetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 242, 255, 0.25)',
    paddingBottom: 6,
  },
  internetCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  internetCloseBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  internetCloseText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  internetCardScroll: {
    maxHeight: 160,
  },
  internetCardBody: {
    color: '#EBF8FF',
    fontSize: 13,
    lineHeight: 19,
  },
  internetCardSource: {
    marginTop: 8,
    color: 'rgba(0, 242, 255, 0.72)',
    fontSize: 10,
    fontWeight: '700',
  },
  specialEyeBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialEyeGlyph: {
    fontWeight: '900',
    textShadowRadius: 22,
  },
  mouthContainer: {
    position: 'absolute',
    bottom: '16%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mouthText: {
    fontSize: 34,
    fontWeight: '900',
    textShadowRadius: 16,
  },
  faceGlyphBadge: {
    position: 'absolute',
    top: -30,
    right: -28,
  },
  faceGlyphText: {
    fontSize: 28,
  },
  zBtnActive: {
    borderColor: '#00FFAA',
    backgroundColor: 'rgba(0, 255, 170, 0.18)',
  },
});
