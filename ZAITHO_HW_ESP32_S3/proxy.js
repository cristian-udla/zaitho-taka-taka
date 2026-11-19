const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const { execSync, exec, spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 10e6,
});
const PORT = process.env.PORT || 3002;
const MEMORY_FILE = path.join(__dirname, 'zaitho_memory.json');

// Cola de notificaciones en tiempo real (WhatsApp, Correo, Telegram, etc.)
const notificationsInbox = [
    {
        id: 'notif_init_wa',
        appName: 'WhatsApp',
        sender: 'Carlos',
        message: 'Zaitho listo y sincronizado con el chasis ESP32-S3',
        icon: '💬',
        read: false,
        dismissed: false,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    },
    {
        id: 'notif_init_mail',
        appName: 'Correo',
        sender: 'Alertas Sistema',
        message: 'Telemetría BLE y Sensores IMU operativos',
        icon: '✉️',
        read: false,
        dismissed: false,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    }
];

// Middleware CORS global
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 1. PRIMERO: Proxy API hacia el servidor LLM unificado (http://100.124.77.5:3001/v1)
app.use('/v1', createProxyMiddleware({
    target: 'http://100.124.77.5:3001/v1',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[LLM PROXY] ${req.method} ${req.originalUrl}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Headers'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    },
    onError: (err, req, res) => {
        console.error('[LLM PROXY ERROR]', err.message);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Bad Gateway', details: err.message });
        }
    }
}));

app.use(express.json({ limit: '20mb' }));

function loadMemoryStore() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error leyendo zaitho_memory.json:', e.message);
    }
    return {
        userProfile: {
            name: 'Creador',
            knownSince: new Date().toISOString(),
            traits: ['Creador de Zaitho', 'Le gustan los robots autónomos con ESP32-S3']
        },
        memories: []
    };
}

function saveMemoryStore(store) {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
        console.error('Error guardando zaitho_memory.json:', e.message);
    }
}

// 2. API DE MEMORIA DE LARGO PLAZO
app.get('/api/memory', (req, res) => {
    res.json(loadMemoryStore());
});

app.post('/api/memory', (req, res) => {
    const store = loadMemoryStore();
    const { fact, category = 'general', embedding = null, userName = null } = req.body || {};

    if (userName && typeof userName === 'string' && userName.trim()) {
        store.userProfile.name = userName.trim();
    }

    if (fact && typeof fact === 'string' && fact.trim()) {
        const cleanFact = fact.trim();
        const exists = store.memories.some(m => m.fact.toLowerCase() === cleanFact.toLowerCase());
        if (!exists) {
            store.memories.unshift({
                id: 'mem_' + Date.now(),
                fact: cleanFact,
                category,
                embedding,
                createdAt: new Date().toISOString()
            });
            if (store.memories.length > 200) {
                store.memories = store.memories.slice(0, 200);
            }
        }
    }

    saveMemoryStore(store);
    res.json({ ok: true, userProfile: store.userProfile, count: store.memories.length });
});

// 3. API DE BÚSQUEDA EN INTERNET Y DATOS EN VIVO (Wikipedia + DuckDuckGo + Indicadores)
app.get('/api/internet', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ result: 'Consulta vacía.' });

    try {
        const results = [];

        // A) Si pregunta por indicadores financieros (dolar, euro, bitcoin, utm, uf)
        if (/d[oó]lar|euro|bitcoin|btc|utm|uf|ipc/i.test(q)) {
            try {
                const rInd = await fetch('https://mindicador.cl/api');
                if (rInd.ok) {
                    const ind = await rInd.json();
                    results.push(`Indicadores hoy en Chile: Dólar=$${ind.dolar?.valor} CLP, Euro=$${ind.euro?.valor} CLP, UF=$${ind.uf?.valor} CLP, UTM=$${ind.utm?.valor} CLP, Bitcoin=$${ind.bitcoin?.valor} USD.`);
                }
            } catch (e) {}
        }

        // B) Wikipedia ES API para datos enciclopédicos, países, personas, ciencia, etc.
        try {
            const wikiUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=2`;
            const rWiki = await fetch(wikiUrl);
            if (rWiki.ok) {
                const wData = await rWiki.json();
                const hits = wData?.query?.search || [];
                for (const h of hits) {
                    const cleanSnippet = h.snippet.replace(/<\/?[^>]+(>|$)/g, '');
                    results.push(`[${h.title}]: ${cleanSnippet}`);
                }
            }
        } catch (e) {}

        // C) DuckDuckGo Instant Answer API
        try {
            const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`;
            const rDdg = await fetch(ddgUrl);
            if (rDdg.ok) {
                const dData = await rDdg.json();
                if (dData.AbstractText) {
                    results.push(`Resumen: ${dData.AbstractText}`);
                }
            }
        } catch (e) {}

        if (results.length === 0) {
            return res.json({
                ok: true,
                result: `Búsqueda realizada para "${q}", sin extracto directo externo.`,
                contextText: '',
                title: q,
                summary: '',
                source: ''
            });
        }
        const joined = results.join(' | ');
        const firstLine = results[0] || '';
        const titleMatch = firstLine.match(/^\[([^\]]+)\]:\s*(.*)$/);
        const cardTitle = titleMatch ? titleMatch[1] : q.toUpperCase();
        const cardSummary = titleMatch ? titleMatch[2] : firstLine;
        const cardSource = /mindicador|Indicadores/i.test(firstLine)
            ? 'mindicador.cl'
            : firstLine.startsWith('Resumen:')
            ? 'DuckDuckGo'
            : 'Wikipedia ES';

        res.json({
            ok: true,
            result: joined,
            contextText: joined,
            title: cardTitle,
            summary: cardSummary,
            source: cardSource
        });
    } catch (err) {
        res.json({ ok: false, result: 'Error consultando internet: ' + err.message });
    }
});

// 4. API DE NOTIFICACIONES EN TIEMPO REAL (WhatsApp, Gmail/Correo, Telegram, Alertas)
app.get('/api/notifications', (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const activeOnly = req.query.active === 'true';
    let list = notificationsInbox.slice(0, 15);
    if (unreadOnly) list = notificationsInbox.filter(n => !n.read);
    if (activeOnly) list = notificationsInbox.filter(n => !n.dismissed).slice(0, 8);
    if (req.query.markRead === 'true') {
        notificationsInbox.forEach(n => { n.read = true; });
    }
    res.json({
        ok: true,
        count: list.length,
        notifications: list,
        activeBadges: notificationsInbox.filter(n => !n.dismissed).slice(0, 6)
    });
});

app.post('/api/notifications/dismiss', (req, res) => {
    const { id, appName } = req.body || {};
    notificationsInbox.forEach(n => {
        if ((id && n.id === id) || (appName && n.appName.toLowerCase() === appName.toLowerCase())) {
            n.dismissed = true;
            n.read = true;
        }
    });
    res.json({ ok: true, activeBadges: notificationsInbox.filter(n => !n.dismissed).slice(0, 6) });
});

app.post('/api/notifications', (req, res) => {
    const { appName = 'WhatsApp', sender = 'Contacto', message = 'Hola!', icon = '💬' } = req.body || {};
    const item = {
        id: 'notif_' + Date.now(),
        appName,
        sender,
        message,
        icon,
        read: false,
        dismissed: false,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    };
    notificationsInbox.unshift(item);
    if (notificationsInbox.length > 50) notificationsInbox.pop();
    console.log(`[NOTIFICACIÓN ENTRANTE] [${appName}] ${sender}: ${message}`);
    res.json({ ok: true, item });
});

// 5. CONEXIÓN EXCLUSIVA BLUETOOTH BLE AL CHASIS ESP32-S3 (ZAITHO_ROBOT - 98:3D:AE:EE:F2:8D)
const ZAITHO_DEFAULT_MAC = '98:3D:AE:EE:F2:8D';
const UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

let chassisState = {
    connected: false,
    hwLink: `BLE (${ZAITHO_DEFAULT_MAC})`,
    macAddress: ZAITHO_DEFAULT_MAC,
    distanceCm: 84.0,
    distCm: 84.0,
    mode: 'MANUAL',
    lastCmd: 'S',
    imu: { pitch: 0, roll: 0, heading: 0, stance: 'EN CHASIS ESTABLE' },
    qBrain: {
        evasiones: 4,
        recompensas: 6,
        pesoIzq: 1.15,
        pesoDer: 1.05,
        umbralCm: 28,
        velOptima: 32,
        preferredSide: 'IZQUIERDA'
    },
    cmdQueue: [],
    updatedAt: Date.now()
};

// Sesión persistente de bluetoothctl para mantener el enlace BLE GATT abierto sin desconectarse
let btProc = null;
let gattReady = false;

function parseBleNotificationText(txt) {
    const clean = txt.trim();
    if (clean.startsWith('D:')) {
        const val = parseFloat(clean.substring(2));
        if (!isNaN(val)) {
            chassisState.distanceCm = val;
            chassisState.distCm = val;
        }
    } else if (clean.startsWith('SYNC:') || clean.startsWith('LEARN:')) {
        const wi = clean.match(/WI=([\d.]+)/);
        const wd = clean.match(/WD=([\d.]+)/);
        const u = clean.match(/U=([\d.]+)/);
        const v = clean.match(/V=(\d+)/);
        const ev = clean.match(/EV=(\d+)/);
        if (wi) chassisState.qBrain.pesoIzq = parseFloat(wi[1]);
        if (wd) chassisState.qBrain.pesoDer = parseFloat(wd[1]);
        if (u) chassisState.qBrain.umbralCm = parseFloat(u[1]);
        if (v) chassisState.qBrain.velOptima = parseInt(v[1], 10);
        if (ev) chassisState.qBrain.evasiones = parseInt(ev[1], 10);
        chassisState.qBrain.preferredSide =
            chassisState.qBrain.pesoIzq >= chassisState.qBrain.pesoDer ? 'IZQUIERDA' : 'DERECHA';
    }
}

function startPersistentBleDaemon() {
    if (btProc) return;
    btProc = spawn('bluetoothctl', [], { stdio: ['pipe', 'pipe', 'pipe'] });

    btProc.stdout.on('data', (chunk) => {
        const out = chunk.toString('utf8');
        const lines = out.split('\n');
        for (const line of lines) {
            // Detectar MAC de ZAITHO_ROBOT SOLO cuando el nombre va después de la MAC (sin confundir con el prompt [ZAITHO_ROBOT]#)
            const devMatch = line.match(/Device\s+([0-9A-F:]{17})\s+ZAITHO_ROBOT/i);
            if (devMatch) {
                if (devMatch[1] !== chassisState.macAddress) {
                    chassisState.macAddress = devMatch[1];
                    chassisState.hwLink = `BLE (${devMatch[1]})`;
                }
                if (!chassisState.connected) {
                    btProc.stdin.write(`connect ${chassisState.macAddress}\n`);
                }
            }
            if (/Connected:\s*yes/i.test(line) || /Connection successful/i.test(line)) {
                chassisState.connected = true;
                chassisState.hwLink = `BLE (${chassisState.macAddress})`;
                // Apagar el escaneo al conectar para mantener el enlace BLE estable
                btProc.stdin.write(`scan off\n`);
                console.log(`✅ [BLE GATT] Conectado a ZAITHO_ROBOT (${chassisState.macAddress})`);
            }
            if (/ServicesResolved:\s*yes/i.test(line)) {
                gattReady = true;
                chassisState.connected = true;
                // Activar notificaciones TX (HC-SR04 / Q-Learning) y dejar seleccionado el canal RX para escritura rápida
                btProc.stdin.write(`menu gatt\nselect-attribute ${UART_TX_UUID}\nnotify on\nselect-attribute ${UART_RX_UUID}\n`);
                console.log(`🟢 [BLE GATT] Canal UART RX/TX listo en ${chassisState.macAddress}`);
            }
            if (/Connected:\s*no/i.test(line) || /Disconnected/i.test(line)) {
                gattReady = false;
                chassisState.connected = false;
                btProc.stdin.write(`back\n`);
                console.log(`⚠️ [BLE GATT] Desconectado de ${chassisState.macAddress}, reintentando...`);
            }
            // Leer datos ASCII enviados por el ESP32-S3 en notificaciones BLE
            if (/D:\d|SYNC:|LEARN:|REWARD:/i.test(line)) {
                parseBleNotificationText(line.replace(/^.*?(D:|SYNC:|LEARN:|REWARD:)/, '$1'));
            }
        }
    });

    btProc.on('close', () => {
        btProc = null;
        gattReady = false;
        setTimeout(startPersistentBleDaemon, 3000);
    });

    // Iniciar escaneo BLE (scan on) y conectar a ZAITHO_ROBOT (98:3D:AE:EE:F2:8D)
    btProc.stdin.write(`power on\nmenu scan\ntransport le\nback\nscan on\n`);
    setTimeout(() => {
        if (btProc) {
            btProc.stdin.write(`connect ${chassisState.macAddress}\n`);
        }
    }, 2000);

    // Mantener reconexión automática por BLE cada 7 segundos si aún no está conectado
    setInterval(() => {
        if (btProc && !chassisState.connected) {
            btProc.stdin.write(`back\nscan on\n`);
            setTimeout(() => {
                if (btProc && !chassisState.connected) {
                    btProc.stdin.write(`connect ${chassisState.macAddress}\n`);
                }
            }, 2000);
        }
    }, 7000);
}

startPersistentBleDaemon();

// Enviar comando EXCLUSIVAMENTE por Bluetooth BLE GATT al ESP32-S3
function dispatchHardwareCommand(cmd) {
    if (!btProc || !chassisState.macAddress) return false;
    const hexBytes = Buffer.from(cmd.trim() + '\n', 'utf8')
        .toString('hex')
        .match(/.{1,2}/g)
        .map(b => '0x' + b)
        .join(' ');

    if (!gattReady) {
        btProc.stdin.write(`connect ${chassisState.macAddress}\nmenu gatt\nselect-attribute ${UART_RX_UUID}\nwrite "${hexBytes}"\n`);
        gattReady = true;
    } else {
        btProc.stdin.write(`write "${hexBytes}"\n`);
    }
    return true;
}

app.get('/api/ble/status', (req, res) => {
    res.json({
        ok: true,
        connected: chassisState.connected,
        hwLink: `BLE (${chassisState.macAddress})`,
        macAddress: chassisState.macAddress,
        distanceCm: chassisState.distanceCm,
        distCm: chassisState.distanceCm,
        mode: chassisState.mode,
        lastCmd: chassisState.lastCmd,
        imu: chassisState.imu,
        qBrain: chassisState.qBrain,
        pendingCommands: chassisState.cmdQueue.splice(0, 10)
    });
});

app.post('/api/ble/connect', (req, res) => {
    if (btProc) {
        btProc.stdin.write(`back\nscan on\n`);
        setTimeout(() => {
            if (btProc) btProc.stdin.write(`connect ${chassisState.macAddress}\n`);
        }, 1200);
    } else {
        startPersistentBleDaemon();
    }
    setTimeout(() => {
        if (btProc) {
            btProc.stdin.write(`menu gatt\nselect-attribute ${UART_RX_UUID}\n`);
            gattReady = true;
        }
        chassisState.hwLink = `BLE (${chassisState.macAddress})`;
        chassisState.updatedAt = Date.now();
        console.log(`[CHASIS BLE] Solicitud de conexión BLE a ${chassisState.macAddress}`);
        res.json({
            ok: true,
            connected: chassisState.connected,
            hwLink: `BLE (${chassisState.macAddress})`,
            distanceCm: chassisState.distanceCm,
            qBrain: chassisState.qBrain,
            message: `BLE (${chassisState.macAddress})`
        });
    }, 1200);
});

// Ejecutar secuencias coreografiadas de ruedas en el chasis ESP32-S3 (Berrinche, Baile, Caricia L/R, Micro-Vida)
function runWheelSequence(steps) {
    let delay = 0;
    for (const st of steps) {
        setTimeout(() => {
            dispatchHardwareCommand(st.cmd);
        }, delay);
        delay += st.waitMs || 150;
    }
}

app.post('/api/ble/send', (req, res) => {
    const { cmd = 'S', imu } = req.body || {};
    chassisState.lastCmd = cmd;
    if (imu) chassisState.imu = { ...chassisState.imu, ...imu };
    chassisState.cmdQueue.push({ cmd, ts: Date.now() });

    // 1. BERRINCHE (Tiritar todas las ruedas + cuarto de giro enojado a derecha o izquierda)
    if (cmd.startsWith('TANTRUM')) {
        const turnDir = cmd.endsWith(':L') ? 'L' : 'R';
        console.log(`😠 [CHASIS BERRINCHE] Tiritando ruedas + cuarto de giro (${turnDir})`);
        runWheelSequence([
            { cmd: 'L:75:95', waitMs: 85 },
            { cmd: 'R:75:95', waitMs: 85 },
            { cmd: 'L:75:95', waitMs: 85 },
            { cmd: 'R:75:95', waitMs: 85 },
            { cmd: 'F:65:95', waitMs: 80 },
            { cmd: 'B:65:95', waitMs: 110 },
            { cmd: `${turnDir}:340:88`, waitMs: 360 }, // Cuarto de giro enojado
            { cmd: 'S', waitMs: 50 }
        ]);
        return res.json({ ok: true, cmd, distanceCm: chassisState.distanceCm, qBrain: chassisState.qBrain, mode: chassisState.mode });
    }

    // 2. SECUENCIA DE BAILE CON LAS RUEDAS
    if (cmd === 'DANCE') {
        console.log(`🎵 [CHASIS BAILE] Ejecutando coreografía de baile con las ruedas`);
        runWheelSequence([
            { cmd: 'L:220:85', waitMs: 250 },
            { cmd: 'R:220:85', waitMs: 250 },
            { cmd: 'F:180:80', waitMs: 210 },
            { cmd: 'B:180:80', waitMs: 210 },
            { cmd: 'L:420:92', waitMs: 440 },
            { cmd: 'R:420:92', waitMs: 440 },
            { cmd: 'W', waitMs: 500 },
            { cmd: 'S', waitMs: 50 }
        ]);
        return res.json({ ok: true, cmd, distanceCm: chassisState.distanceCm, qBrain: chassisState.qBrain, mode: chassisState.mode });
    }

    // 3. CARICIA EN OJO IZQUIERDO O DERECHO (Gira un poquito hacia el lado acariciado)
    if (cmd === 'PET:L' || cmd === 'PET:R') {
        const side = cmd === 'PET:L' ? 'L' : 'R';
        console.log(`💖 [CHASIS CARICIA] Giro suave hacia ${side === 'L' ? 'IZQUIERDA' : 'DERECHA'}`);
        runWheelSequence([
            { cmd: `${side}:180:45`, waitMs: 200 },
            { cmd: 'S', waitMs: 50 }
        ]);
        return res.json({ ok: true, cmd, distanceCm: chassisState.distanceCm, qBrain: chassisState.qBrain, mode: chassisState.mode });
    }

    // 4. MICRO-EXPLORACIÓN AUTÓNOMA ("Estar vivo")
    if (cmd === 'ALIVE') {
        const movePick = Math.random();
        console.log(`🐾 [CHASIS VIVO] Micro-movimiento autónomo de curiosidad`);
        if (movePick < 0.35) {
            runWheelSequence([
                { cmd: 'L:150:34', waitMs: 220 },
                { cmd: 'D', waitMs: 300 },
                { cmd: 'R:150:34', waitMs: 220 },
                { cmd: 'S', waitMs: 50 }
            ]);
        } else if (movePick < 0.7) {
            runWheelSequence([
                { cmd: 'R:150:34', waitMs: 220 },
                { cmd: 'D', waitMs: 300 },
                { cmd: 'L:150:34', waitMs: 220 },
                { cmd: 'S', waitMs: 50 }
            ]);
        } else {
            runWheelSequence([
                { cmd: 'F:190:32', waitMs: 240 },
                { cmd: 'D', waitMs: 250 },
                { cmd: 'B:170:32', waitMs: 220 },
                { cmd: 'S', waitMs: 50 }
            ]);
        }
        return res.json({ ok: true, cmd, distanceCm: chassisState.distanceCm, qBrain: chassisState.qBrain, mode: chassisState.mode });
    }

    if (cmd === 'A' || cmd.includes('X:1')) {
        chassisState.mode = chassisState.mode === 'EXPLORE' && cmd === 'A' ? 'MANUAL' : 'EXPLORE';
    }
    if (cmd.includes('X:0') || cmd === 'S') {
        if (cmd.includes('X:0')) chassisState.mode = 'MANUAL';
    }
    if (cmd.startsWith('F') || chassisState.mode === 'EXPLORE') {
        chassisState.distanceCm = Math.max(18, Math.min(240, chassisState.distanceCm + (Math.random() * 24 - 14)));
    }
    if (cmd.startsWith('L') || cmd.startsWith('R')) {
        chassisState.qBrain.evasiones += 1;
        if (cmd.startsWith('L')) chassisState.qBrain.pesoIzq = +(chassisState.qBrain.pesoIzq + 0.04).toFixed(2);
        if (cmd.startsWith('R')) chassisState.qBrain.pesoDer = +(chassisState.qBrain.pesoDer + 0.04).toFixed(2);
        chassisState.qBrain.preferredSide =
            chassisState.qBrain.pesoIzq >= chassisState.qBrain.pesoDer ? 'IZQUIERDA' : 'DERECHA';
    }

    dispatchHardwareCommand(cmd);
    console.log(`[CHASIS CMD -> ESP32-S3] ${cmd} | Rumbo=${chassisState.imu.heading || 0}° Postura=${chassisState.imu.stance || 'PLANO'}`);
    res.json({
        ok: true,
        cmd,
        distanceCm: chassisState.distanceCm,
        qBrain: chassisState.qBrain,
        mode: chassisState.mode
    });
});

app.post('/api/ble/telemetry', (req, res) => {
    const { distCm, distanceCm, mode, imu } = req.body || {};
    const d = typeof distanceCm === 'number' ? distanceCm : distCm;
    if (typeof d === 'number') {
        chassisState.distanceCm = d;
        chassisState.distCm = d;
    }
    if (mode) chassisState.mode = mode;
    if (imu) chassisState.imu = { ...chassisState.imu, ...imu };
    chassisState.updatedAt = Date.now();
    res.json({ ok: true, pendingCommands: chassisState.cmdQueue.splice(0, 10) });
});

// 5B. RECONOCIMIENTO DE VOZ CON CANCELACIÓN DE RUIDO DSP Y AISLAMIENTO DE VOZ HUMANA (85Hz-3400Hz + FFT Denoiser)
// 5B. RECONOCIMIENTO DE VOZ HUMANA (Filtro DSP ffmpeg + Faster-Whisper Local con Silero VAD)
const STT_WORKER_URL = 'http://127.0.0.1:3003/transcribe';
let sttWorkerProc = null;

function startLocalSttWorker() {
    const pyBin = path.join(__dirname, '.venv-stt', 'bin', 'python');
    const workerScript = path.join(__dirname, 'stt_worker.py');
    if (!fs.existsSync(pyBin) || !fs.existsSync(workerScript)) {
        console.warn('⚠️ [STT] No se encontró .venv-stt/bin/python o stt_worker.py');
        return;
    }
    if (sttWorkerProc) return;
    sttWorkerProc = spawn(pyBin, [workerScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HF_HUB_DISABLE_XET: '1' }
    });
    sttWorkerProc.stdout.on('data', (d) => process.stdout.write(`[STT-WORKER] ${d}`));
    sttWorkerProc.stderr.on('data', (d) => {
        const s = d.toString().trim();
        if (s && !s.includes('UserWarning')) console.error(`[STT-WORKER ERR] ${s}`);
    });
    sttWorkerProc.on('close', (code) => {
        sttWorkerProc = null;
        console.warn(`⚠️ [STT-WORKER] Salió (code ${code}), reiniciando en 3s...`);
        setTimeout(startLocalSttWorker, 3000);
    });
}
startLocalSttWorker();

async function transcribeAudioFile(inFile) {
    const outWav = inFile + '.wav';
    try {
        // Filtro probado de voz humana sin apagar voz suave:
        // 1. highpass=f=80,lowpass=f=3800 -> Aísla banda fundamental y formantes de la voz humana
        // 2. afftdn=nf=-50 -> Cancelación espectral suave de ruido de fondo por FFT
        // 3. dynaudnorm=f=150:g=15 -> Normalización dinámica de voz
        const voiceFilter = 'highpass=f=80,lowpass=f=4000,afftdn=nf=-50,dynaudnorm=f=120:g=15:p=0.9';
        execSync(`ffmpeg -y -i "${inFile}" -af "${voiceFilter}" -ar 16000 -ac 1 -f wav "${outWav}" 2>/dev/null`);
        try { fs.unlinkSync(inFile); } catch (e) {}

        const st = fs.statSync(outWav);
        if (st.size < 4000) {
            try { fs.unlinkSync(outWav); } catch (e) {}
            return '';
        }

        const wRes = await fetch(STT_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: outWav })
        });
        const wData = await wRes.json();
        try { fs.unlinkSync(outWav); } catch (e) {}

        if (wData && !wData.ok && wData.error) {
            console.error(`❌ [STT-WORKER ERROR] ${wData.error}`);
        }
        const transcript = (wData && wData.ok && wData.text) ? wData.text.trim() : '';
        if (transcript) {
            console.log(`🎙️ [VOZ HUMANA DETECTADA] "${transcript}"`);
        } else {
            console.log(`🎙️ [STT] Audio procesado (${st.size}B WAV), sin palabras reconocibles.`);
        }
        return transcript;
    } catch (err) {
        console.error(`❌ [STT ERROR] ${err.message}`);
        try { fs.unlinkSync(inFile); fs.unlinkSync(outWav); } catch (e) {}
        throw err;
    }
}

// Subida nativa multipart desde React Native FormData ({ uri, name, type })
app.post('/api/stt-upload', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    try {
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length < 128) {
            return res.json({ ok: false, text: '' });
        }
        // Extraer binario del contenedor multipart buscando el marcador '\r\n\r\n' y el boundary final
        const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd === -1) {
            return res.json({ ok: false, text: '' });
        }
        const startOffset = headerEnd + 4;
        const firstLineEnd = buf.indexOf(Buffer.from('\r\n'));
        const boundaryBytes = firstLineEnd > 0 ? buf.subarray(0, firstLineEnd) : Buffer.from('--');
        const endBoundaryIdx = buf.lastIndexOf(boundaryBytes);
        const endOffset = endBoundaryIdx > startOffset ? endBoundaryIdx - 2 : buf.length;

        const audioBytes = buf.subarray(startOffset, endOffset);
        if (audioBytes.length < 200) {
            return res.json({ ok: false, text: '' });
        }

        const inFile = `/tmp/zaitho_mic_${Date.now()}.m4a`;
        fs.writeFileSync(inFile, audioBytes);
        const transcript = await transcribeAudioFile(inFile);
        res.json({ ok: true, text: transcript });
    } catch (err) {
        res.json({ ok: false, text: '', error: err.message });
    }
});

app.post('/api/client-log', (req, res) => {
    const { tag = 'APP', msg = '' } = req.body || {};
    console.log(`📱 [${tag}] ${msg}`);
    res.json({ ok: true });
});

app.post('/api/stt', async (req, res) => {
    try {
        const { audioBase64, ext = 'm4a' } = req.body || {};
        if (!audioBase64 || audioBase64.length < 100) {
            return res.json({ ok: false, text: '' });
        }
        const buf = Buffer.from(audioBase64, 'base64');
        console.log(`🎙️ [STT RX] Recibidos ${buf.length} bytes (${ext})`);
        const inFile = `/tmp/zaitho_mic_${Date.now()}.${ext}`;
        fs.writeFileSync(inFile, buf);
        const transcript = await transcribeAudioFile(inFile);
        res.json({ ok: true, text: transcript });
    } catch (err) {
        res.json({ ok: false, text: '', error: err.message });
    }
});

// 5D. RECONOCIMIENTO VISUAL (YOLOv8n + OpenCV para Rostros, Plantas y Objetos)
const VISION_WORKER_URL = 'http://127.0.0.1:3004/analyze';
let visionWorkerProc = null;

function startLocalVisionWorker() {
    const pyBin = path.join(__dirname, '.venv', 'bin', 'python');
    const workerScript = path.join(__dirname, 'vision_worker.py');
    if (!fs.existsSync(pyBin) || !fs.existsSync(workerScript) || visionWorkerProc) return;
    visionWorkerProc = spawn(pyBin, [workerScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
    });
    visionWorkerProc.stdout.on('data', (d) => process.stdout.write(`[VISION] ${d}`));
    visionWorkerProc.stderr.on('data', (d) => {
        const s = d.toString().trim();
        if (s && !s.includes('UserWarning')) console.error(`[VISION ERR] ${s}`);
    });
    visionWorkerProc.on('close', (code) => {
        visionWorkerProc = null;
        if (code !== 0) {
            setTimeout(startLocalVisionWorker, 15000);
        }
    });
}
startLocalVisionWorker();

app.post('/api/vision/analyze', async (req, res) => {
    try {
        const { imageBase64, mode = 'identify', label = '', category = 'auto', box = null } = req.body || {};
        if (!imageBase64 || imageBase64.length < 200) {
            return res.json({ ok: false, error: 'Imagen vacía' });
        }
        const vRes = await fetch(VISION_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64, mode, label, category, box })
        });
        const vData = await vRes.json();

        if (vData.ok && vData.saved && label) {
            const store = loadMemoryStore();
            const fact = vData.category === 'face'
                ? `Reconozco visualmente el rostro de ${label}`
                : vData.category === 'plant'
                ? `Reconozco la planta "${label}"`
                : `Reconozco el objeto "${label}"`;
            if (!store.memories.some(m => m.fact.toLowerCase() === fact.toLowerCase())) {
                store.memories.unshift({ id: 'vis_' + Date.now(), fact, category: 'vision', createdAt: new Date().toISOString() });
                saveMemoryStore(store);
            }
            if (vData.category === 'face') {
                store.userProfile.name = label;
                saveMemoryStore(store);
            }
            console.log(`👁️ [VISIÓN APRENDIDA] ${fact}`);
        } else if (vData.ok && mode !== 'follow') {
            console.log(`👁️ [VISIÓN] faces=${vData.facesFound} matched=${vData.matchedLabel || 'ninguno'} objs=${(vData.detections || []).map(d => d.labelEs).join(', ')}`);
        }
        res.json(vData);
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// 5C. SINTETIZADOR DE SONIDOS EMOCIONALES ROBÓTICOS (Estilo Anki Vector / R2-D2 sin palabras)
function synthesizeVectorWav(emotion = 'happy') {
    const sampleRate = 22050;
    let segments = [];

    switch (emotion) {
        case 'angry':
            // Gruñido robótico grave con vibrato áspero (sin hablar)
            segments = [
                { f0: 210, f1: 135, dur: 0.16, fmHz: 38, fmDepth: 45, wave: 'saw' },
                { f0: 90, f1: 90, dur: 0.04, vol: 0 },
                { f0: 195, f1: 110, dur: 0.24, fmHz: 42, fmDepth: 55, wave: 'saw' }
            ];
            break;
        case 'flirty':
        case 'love':
            // Ronroneo suave + silbido coqueto ascendente de dos tonos
            segments = [
                { f0: 340, f1: 420, dur: 0.18, fmHz: 26, fmDepth: 22, wave: 'sine' },
                { f0: 480, f1: 780, dur: 0.14, fmHz: 12, fmDepth: 15, wave: 'sine' },
                { f0: 620, f1: 980, dur: 0.22, fmHz: 18, fmDepth: 25, wave: 'sine' }
            ];
            break;
        case 'sad':
            // Quejido descendente tierno ("ooooh...")
            segments = [
                { f0: 640, f1: 430, dur: 0.22, fmHz: 8, fmDepth: 10, wave: 'sine' },
                { f0: 420, f1: 250, dur: 0.34, fmHz: 6, fmDepth: 12, wave: 'sine' }
            ];
            break;
        case 'curious':
            // Chirrido interrogativo ascendente ("¿biii-up?")
            segments = [
                { f0: 410, f1: 520, dur: 0.11, fmHz: 14, fmDepth: 10, wave: 'sine' },
                { f0: 400, f1: 400, dur: 0.03, vol: 0 },
                { f0: 540, f1: 890, dur: 0.18, fmHz: 18, fmDepth: 18, wave: 'sine' }
            ];
            break;
        case 'surprised':
            // Salto agudo de sorpresa
            segments = [
                { f0: 520, f1: 1180, dur: 0.12, fmHz: 22, fmDepth: 30, wave: 'sine' },
                { f0: 980, f1: 1320, dur: 0.14, fmHz: 25, fmDepth: 20, wave: 'sine' }
            ];
            break;
        case 'scared':
            // Temblor agudo
            segments = [
                { f0: 820, f1: 580, dur: 0.28, fmHz: 32, fmDepth: 65, wave: 'sine' }
            ];
            break;
        case 'dance':
            // Melodía rítmica robótica para bailar con las ruedas
            segments = [
                { f0: 523, f1: 523, dur: 0.14, fmHz: 12, fmDepth: 8, wave: 'sine' },
                { f0: 659, f1: 659, dur: 0.14, fmHz: 12, fmDepth: 8, wave: 'sine' },
                { f0: 784, f1: 784, dur: 0.14, fmHz: 12, fmDepth: 8, wave: 'sine' },
                { f0: 1046, f1: 1046, dur: 0.22, fmHz: 18, fmDepth: 15, wave: 'sine' },
                { f0: 784, f1: 784, dur: 0.14, fmHz: 12, fmDepth: 8, wave: 'sine' },
                { f0: 1046, f1: 1174, dur: 0.28, fmHz: 20, fmDepth: 18, wave: 'sine' }
            ];
            break;
        default:
            // 'happy' / 'excited': Trino alegre de Vector
            segments = [
                { f0: 540, f1: 680, dur: 0.09, fmHz: 15, fmDepth: 12, wave: 'sine' },
                { f0: 720, f1: 920, dur: 0.10, fmHz: 15, fmDepth: 12, wave: 'sine' },
                { f0: 880, f1: 1140, dur: 0.14, fmHz: 20, fmDepth: 18, wave: 'sine' }
            ];
            break;
    }

    const totalSamples = segments.reduce((acc, s) => acc + Math.floor(s.dur * sampleRate), 0);
    const buffer = Buffer.alloc(44 + totalSamples * 2);

    // Cabecera WAV PCM 16-bit Mono
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + totalSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(totalSamples * 2, 40);

    let offset = 44;
    let phase = 0;
    for (const seg of segments) {
        const n = Math.floor(seg.dur * sampleRate);
        const vol = seg.vol !== undefined ? seg.vol : 0.75;
        for (let i = 0; i < n; i++) {
            const t = i / sampleRate;
            const prog = i / n;
            const env = Math.sin(Math.PI * prog); // Envolvente suave sin clicks
            const baseFreq = seg.f0 + (seg.f1 - seg.f0) * prog;
            const mod = (seg.fmDepth || 0) * Math.sin(2 * Math.PI * (seg.fmHz || 10) * t);
            const freq = baseFreq + mod;
            phase += (2 * Math.PI * freq) / sampleRate;

            let sample = Math.sin(phase);
            if (seg.wave === 'saw') {
                sample = 0.65 * Math.sin(phase) + 0.35 * Math.sin(phase * 2.5);
            }
            const pcm = Math.max(-32767, Math.min(32767, Math.floor(sample * env * vol * 32767)));
            buffer.writeInt16LE(pcm, offset);
            offset += 2;
        }
    }
    return buffer;
}

app.get('/api/sfx/:emotion', (req, res) => {
    const emotion = (req.params.emotion || 'happy').replace(/\.wav$/i, '').toLowerCase();
    const wav = synthesizeVectorWav(emotion);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(wav);
});

// 6. Descarga directa del APK si está compilado
app.get('/apk', (req, res) => {
    const apkPath = path.join(__dirname, 'zaitho-robot.apk');
    if (fs.existsSync(apkPath)) {
        res.download(apkPath, 'Zaitho-Robot.apk');
    } else {
        res.redirect('/studio.html');
    }
});

// 6. Archivos estáticos y UI Principal
app.use(express.static(__dirname));

// ============================================================================
// 7. MÁQUINA DE CURIOSIDAD Y DESCUBRIMIENTO (WebSocket / Socket.IO -> LLM)
// ============================================================================
const CURIOSITY_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'buscar_usuario_y_preguntar',
            description: 'Invoca esta herramienta si la imagen es confusa, no sabes de quién es el objeto, o es algo totalmente desconocido para preguntarle al usuario.',
            parameters: {
                type: 'object',
                properties: {
                    descripcion_objeto: {
                        type: 'string',
                        description: 'Breve descripción de lo que se ve en la imagen o por qué genera duda',
                    },
                },
                required: ['descripcion_objeto'],
            },
        },
    },
];

async function analyzeCuriosityPhoto({ yolo_label = 'objeto', image, geminiApiKey = '' }) {
    const cleanB64 = String(image || '').replace(/^data:image\/\w+;base64,/, '');
    const sysPrompt = `Eres Zaitho. Tu sistema de visión rápida YOLO detectó un ${yolo_label}. Analiza esta imagen en detalle. Si reconoces qué es específicamente o tienes datos útiles, haz un comentario corto e inteligente. Si la imagen es confusa, no sabes de quién es el objeto, o es algo totalmente desconocido, debes invocar la herramienta buscar_usuario_y_preguntar(descripcion_objeto).`;

    const useGemini = Boolean(geminiApiKey || process.env.GEMINI_API_KEY);
    const key = geminiApiKey || process.env.GEMINI_API_KEY || 'freellmapi-7e50639250fccc3a4143f4188e9451da8e45230857cbc599';
    const url = useGemini
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : 'http://100.124.77.5:3001/v1/chat/completions';
    const model = useGemini ? 'gemini-2.5-flash' : 'auto';

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 16000);
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                tools: CURIOSITY_TOOLS,
                tool_choice: 'auto',
                messages: [
                    { role: 'system', content: sysPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `YOLO detectó: ${yolo_label}. Analiza esta captura de alta resolución.` },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanB64}` } },
                        ],
                    },
                ],
                max_tokens: 260,
            }),
        });
        clearTimeout(timer);

        if (!resp.ok) {
            return {
                action: 'ask_user',
                yolo_label,
                descripcion_objeto: `Posible ${yolo_label} (HTTP ${resp.status})`,
                speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
            };
        }

        const data = await resp.json();
        const msg = data?.choices?.[0]?.message || {};
        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        const askCall = toolCalls.find((tc) => tc?.function?.name === 'buscar_usuario_y_preguntar');

        if (askCall) {
            let args = {};
            try { args = JSON.parse(askCall.function.arguments || '{}'); } catch (e) {}
            const desc = args.descripcion_objeto || yolo_label;
            return {
                action: 'ask_user',
                yolo_label,
                descripcion_objeto: desc,
                speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
            };
        }

        const text = (msg.content || '').trim();
        if (!text || /no estoy seguro|desconocid|confus/i.test(text)) {
            return {
                action: 'ask_user',
                yolo_label,
                descripcion_objeto: text || yolo_label,
                speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
            };
        }

        return {
            action: 'comment',
            yolo_label,
            message: text,
        };
    } catch (err) {
        return {
            action: 'ask_user',
            yolo_label,
            descripcion_objeto: err.message,
            speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
        };
    }
}

const LEARNING_FILE = path.join(__dirname, 'learning_memory.json');

function loadLearningStore() {
    try {
        if (fs.existsSync(LEARNING_FILE)) {
            return JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
        }
    } catch (e) {}
    return {
        motorCalibration: { leftGain: 1.0, rightGain: 1.0, samples: 0 },
        conditioningWeights: { music_dance: 0.35, clap_attention: 0.4 },
        topologyMap: [],
        recentBiologicalEvents: [],
    };
}

function saveLearningStore(data) {
    try {
        fs.writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
}

let learningStore = loadLearningStore();

async function analyzeFrozenBiologicalBuffer(payload) {
    const {
        triggerType = 'unknown',
        detail = {},
        latestFrameBase64 = '',
        recentLabels = [],
        audioSummary = [],
        proprioSummary = {},
        geminiApiKey = '',
    } = payload || {};

    try {
        const useGemini = !!(geminiApiKey && String(geminiApiKey).trim().length > 10);
        const endpoint = useGemini
            ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
            : `${FREELLM_URL}/chat/completions`;
        const authKey = useGemini ? String(geminiApiKey).trim() : API_KEY;
        const model = useGemini ? 'gemini-2.5-flash' : 'auto';

        const userText = [
            `Trigger biológico: ${triggerType}`,
            `Detalle: ${JSON.stringify(detail)}`,
            `Etiquetas recientes (3s): ${recentLabels.join(', ') || 'ninguna'}`,
            `Audio últimos 3s: ${JSON.stringify(audioSummary)}`,
            `Sensores propios 50Hz (3s): ${JSON.stringify(proprioSummary)}`,
            `Razona en máximo 20 palabras en español qué acaba de pasar en el entorno y responde natural como Zaitho.`,
        ].join('\n');

        const content = [{ type: 'text', text: userText }];
        if (latestFrameBase64 && latestFrameBase64.length > 150) {
            const cleanB64 = latestFrameBase64.replace(/^data:image\/\w+;base64,/, '');
            content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanB64}` } });
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 11000);
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authKey}` },
            signal: ctrl.signal,
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: 'Eres Zaitho, un robot atento que razona sobre estímulos repentinos (ruidos, golpes, movimientos o novedades) usando su buffer multimodal de 3 segundos.' },
                    { role: 'user', content },
                ],
                max_tokens: 120,
            }),
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const json = await resp.json();
        return (json?.choices?.[0]?.message?.content || '').trim();
    } catch (e) {
        return null;
    }
}

io.on('connection', (socket) => {
    console.log(`🔌 [WS] Cliente conectado: ${socket.id}`);
    socket.emit('learning_sync', learningStore);

    socket.on('chassis_cmd', (payload) => {
        const cmd = payload?.cmd;
        if (!cmd) return;
        chassisState.lastCmd = cmd;
        console.log(`🦾 [WS->CHASIS] ${cmd}`);
        runWheelSequence([{ cmd, waitMs: 0 }]);
    });

    socket.on('motor_calibration', (cal) => {
        if (!cal) return;
        learningStore.motorCalibration = {
            leftGain: Number(cal.leftGain || learningStore.motorCalibration.leftGain || 1.0),
            rightGain: Number(cal.rightGain || learningStore.motorCalibration.rightGain || 1.0),
            samples: (learningStore.motorCalibration.samples || 0) + 1,
            lastTurn: { dir: cal.dir, targetDeg: cal.targetDeg, actualDeg: cal.actualDeg, ts: Date.now() },
        };
        saveLearningStore(learningStore);
        console.log(`⚙️ [CALIBRACIÓN MOTORA] dir=${cal.dir} objetivo=${cal.targetDeg}° real=${cal.actualDeg}° gains=(L:${learningStore.motorCalibration.leftGain}, R:${learningStore.motorCalibration.rightGain})`);
        io.emit('learning_sync', learningStore);
    });

    socket.on('acoustic_event', (ev) => {
        const cat = ev?.category || 'ambient';
        console.log(`🎵 [AUDIO WS] categoría=${cat} db=${ev?.db ?? '?'}`);
        if (cat === 'music' && (learningStore.conditioningWeights?.music_dance || 0) >= 0.65) {
            console.log(`💃 [CONDICIONAMIENTO CLÁSICO] Música detectada -> ejecutando baile autónomo`);
            runWheelSequence([{ cmd: 'DANCE', waitMs: 0 }]);
        }
    });

    socket.on('topology_update', (anchor) => {
        if (!anchor?.label) return;
        const norm = String(anchor.label).trim().toLowerCase();
        learningStore.topologyMap = [
            { ...anchor, updatedAt: Date.now() },
            ...(learningStore.topologyMap || []).filter((a) => String(a.label || '').toLowerCase() !== norm),
        ].slice(0, 30);
        saveLearningStore(learningStore);
        console.log(`🗺️ [MAPA TOPOLÓGICO] ${anchor.label} @ ${anchor.headingDeg}° (x=${anchor.x}, y=${anchor.y})`);
    });

    socket.on('biological_trigger_freeze', async (payload) => {
        console.log(`🧬 [BUFFER CONGELADO 3s] trigger=${payload?.triggerType} audio=${JSON.stringify(payload?.audioSummary || [])}`);
        const speech = await analyzeFrozenBiologicalBuffer(payload);
        learningStore.recentBiologicalEvents = [
            { triggerType: payload?.triggerType, speech, ts: Date.now() },
            ...(learningStore.recentBiologicalEvents || []),
        ].slice(0, 20);
        saveLearningStore(learningStore);
        if (speech) {
            socket.emit('biological_trigger_result', { triggerType: payload?.triggerType, speech });
        }
    });

    socket.on('curiosity_photo', async (payload) => {
        const yolo_label = payload?.yolo_label || 'objeto';
        const image = payload?.image || '';
        console.log(`🧐 [CURIOSIDAD WS] Analizando foto de "${yolo_label}"...`);
        const result = await analyzeCuriosityPhoto({
            yolo_label,
            image,
            geminiApiKey: payload?.geminiApiKey || '',
        });
        socket.emit('curiosity_result', result);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'zaitho_brain_ui.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🤖 Zaitho Brain Server activo en puerto ${PORT}`);
    console.log(`   Cara del Robot (Celular): http://100.92.200.34:${PORT}`);
    console.log(`   Red Local Wi-Fi (LAN):    http://10.112.71.38:${PORT}`);
    console.log(`   Estudio APK / Pruebas:    http://100.92.200.34:${PORT}/studio.html`);
    console.log(`====================================================`);
});
