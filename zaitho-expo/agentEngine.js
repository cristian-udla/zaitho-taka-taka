// Motor profesional de Agente, Habilidades (Tools) y Procesamiento de Datos para Zaitho

export const AGENT_TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'buscar_internet',
      description: 'Busca información actualizada en Internet: indicadores económicos de Chile (UF, dólar, euro, UTM, bitcoin), Wikipedia en español o DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'Término o pregunta a buscar en la web' },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_clima',
      description: 'Obtiene el clima actual y pronóstico de hoy en tiempo real para cualquier ciudad (ej: Santiago, Valparaíso, Concepción, Madrid).',
      parameters: {
        type: 'object',
        properties: {
          ciudad: { type: 'string', description: 'Nombre de la ciudad' },
        },
        required: ['ciudad'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'procesar_datos_y_calculos',
      description: 'Realiza cálculos matemáticos exactos, porcentajes, o análisis estadístico profesional (promedio, mediana, desviación estándar, mínimo, máximo, tendencia) sobre una lista de números.',
      parameters: {
        type: 'object',
        properties: {
          expresion: { type: 'string', description: 'Expresión matemática opcional (ej: "1500 * 1.19" o "(45 - 30) / 30 * 100")' },
          numeros: {
            type: 'array',
            items: { type: 'number' },
            description: 'Lista de números para análisis estadístico',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memoria_semantica',
      description: 'Guarda, busca por relevancia o lista recuerdos importantes sobre el usuario, personas, plantas, gustos o datos aprendidos.',
      parameters: {
        type: 'object',
        properties: {
          accion: { type: 'string', enum: ['buscar', 'guardar', 'listar'] },
          texto: { type: 'string', description: 'Consulta a buscar o hecho breve a guardar' },
          categoria: { type: 'string', description: 'Categoría: persona, planta, preferencia, dato, recordatorio' },
        },
        required: ['accion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'controlar_chasis',
      description: 'Mueve o detiene el chasis físico por BLE con freno automático garantizado.',
      parameters: {
        type: 'object',
        properties: {
          accion: {
            type: 'string',
            enum: ['adelante', 'atras', 'izquierda', 'derecha', 'detener', 'bailar', 'curioso', 'emocionado'],
          },
          duracion_ms: { type: 'number', description: 'Duración en milisegundos (entre 200 y 1500 ms)' },
        },
        required: ['accion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'leer_telemetria',
      description: 'Lee los sensores actuales de Zaitho: distancia ultrasónica HC-SR04, brújula/rumbo IMU, inclinación, estado BLE y fecha/hora exacta.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'programar_recordatorio',
      description: 'Programa un temporizador o recordatorio hablado en X segundos.',
      parameters: {
        type: 'object',
        properties: {
          segundos: { type: 'number', description: 'Segundos hasta el aviso (mínimo 3)' },
          mensaje: { type: 'string', description: 'Mensaje del recordatorio' },
        },
        required: ['segundos', 'mensaje'],
      },
    },
  },
];

// Evaluador matemático seguro sin eval() arbitrario
export function evaluateSafeMath(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const sanitized = expr.replace(/,/g, '.').replace(/[^0-9+\-*/().%\s^]/g, '');
  if (!sanitized.trim() || sanitized.length > 120) return null;
  try {
    const jsExpr = sanitized.replace(/\^/g, '**');
    const fn = new Function(`"use strict"; return (${jsExpr});`);
    const result = fn();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Number(result.toFixed(6));
    }
  } catch (e) {}
  return null;
}

// Motor estadístico y de tendencia lineal sobre arreglos numéricos
export function computeStats(nums) {
  const arr = (Array.isArray(nums) ? nums : []).map(Number).filter((n) => Number.isFinite(n));
  if (arr.length === 0) return null;
  const n = arr.length;
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = arr.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  // Regresión lineal simple y = m*x + b para detectar tendencia
  let slope = 0;
  if (n >= 2) {
    const xMean = (n - 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (arr[i] - mean);
      den += (i - xMean) ** 2;
    }
    slope = den !== 0 ? num / den : 0;
  }
  const tendencia = slope > 0.05 ? 'creciente' : slope < -0.05 ? 'decreciente' : 'estable';

  return {
    cantidad: n,
    suma: Number(sum.toFixed(4)),
    promedio: Number(mean.toFixed(4)),
    mediana: Number(median.toFixed(4)),
    minimo: sorted[0],
    maximo: sorted[n - 1],
    desviacion_estandar: Number(stdDev.toFixed(4)),
    tendencia,
  };
}

// Búsqueda semántica por tokens ponderados sobre la memoria local
export function searchMemoriesByRelevance(memories, query, limit = 6) {
  const list = Array.isArray(memories) ? memories : [];
  if (!query || !query.trim()) return list.slice(0, limit);
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2);

  const qTokens = normalize(query);
  if (qTokens.length === 0) return list.slice(0, limit);

  const scored = list.map((m, idx) => {
    const mTokens = new Set(normalize(`${m.fact} ${m.category || ''}`));
    let hits = 0;
    for (const t of qTokens) {
      if (mTokens.has(t)) hits += 1;
    }
    const recencyBoost = Math.max(0, (list.length - idx) / Math.max(1, list.length)) * 0.25;
    return { item: m, score: hits + recencyBoost };
  });

  return scored
    .filter((s) => s.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

// Consulta clima real vía Open-Meteo (sin API Key)
export async function fetchWeatherDirect(ciudad = 'Santiago') {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`
    );
    if (!geoRes.ok) return { ok: false, error: 'No pude geocodificar la ciudad' };
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) return { ok: false, error: `No encontré la ciudad ${ciudad}` };

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
    );
    if (!wxRes.ok) return { ok: false, error: 'Error consultando Open-Meteo' };
    const wx = await wxRes.json();
    const cur = wx.current || {};
    const daily = wx.daily || {};
    const tMax = daily.temperature_2m_max?.[0];
    const tMin = daily.temperature_2m_min?.[0];

    return {
      ok: true,
      ciudad: `${loc.name}${loc.country ? ', ' + loc.country : ''}`,
      temperatura_c: cur.temperature_2m,
      sensacion_c: cur.apparent_temperature,
      humedad_pct: cur.relative_humidity_2m,
      viento_kmh: cur.wind_speed_10m,
      min_hoy_c: tMin,
      max_hoy_c: tMax,
      resumen: `${loc.name}: ${cur.temperature_2m}°C (sensación ${cur.apparent_temperature}°C), humedad ${cur.relative_humidity_2m}%, viento ${cur.wind_speed_10m} km/h. Mín ${tMin}°C / Máx ${tMax}°C.`,
    };
  } catch (e) {
    return { ok: false, error: e?.message || 'Error de red clima' };
  }
}

// Solo permitir búsqueda/fallback en internet cuando la consulta realmente pide datos externos
export function shouldAllowInternetFallback(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q || q.length < 4) return false;
  if (/^(?:hola|alo|al[oó]|me escuchas|est[aá]s ah[ií]|c[oó]mo est[aá]s|gracias|ok|vale|para|detente|stop|baila|mu[eé]vete|avanza|retrocede|gira)/i.test(q)) {
    return false;
  }
  return /\b(uf|d[oó]lar|euro|utm|bitcoin|ipc|cobre|clima|temperatura|tiempo|lluvia|qu[eé]\s+es|qui[eé]n\s+es|qui[eé]n\s+fue|busca|investiga|averigua|internet|noticias|precio|valor|cu[aá]nto\s+mide|d[oó]nde\s+queda|wikipedia)\b/i.test(q);
}

/**
 * Ejecuta el ciclo ReAct / Tool-Calling profesional (hasta 4 pasos)
 * compatible con freellmapi (Tailscale) y Google Gemini.
 */
export async function runZaithoAgent({
  query,
  userName,
  memories,
  telemetry,
  callLLM,
  executeTool,
  onStageChange,
}) {
  const relevantMemories = searchMemoriesByRelevance(memories, query, 8);
  const memText = relevantMemories.length
    ? relevantMemories.map((m) => `- [${m.category || 'dato'}] ${m.fact}`).join('\n')
    : '- (sin recuerdos previos)';

  const systemPrompt = `Eres Zaitho, el robot asistente autónomo profesional de ${userName}.
Telemetría actual: Rumbo ${telemetry.heading}° (${telemetry.cardinal}), postura ${telemetry.stance}, distancia frontal HC-SR04 ${telemetry.distanceCm} cm, BLE ${telemetry.bleConnected ? 'conectado' : 'desconectado'}, fecha/hora ${telemetry.nowStr}.
Tienes herramientas reales para buscar en internet, consultar clima en vivo, calcular/analizar datos estadísticos, gestionar memoria, leer sensores, programar recordatorios y controlar tu chasis.
Reglas:
1. NO uses buscar_internet para saludos, preguntas sobre ti ("¿me escuchas?", "¿cómo estás?"), conversación casual ni órdenes de movimiento físico. Solo usa buscar_internet si piden datos reales de la web, definiciones, noticias o indicadores económicos.
2. Usa herramientas cuando necesites clima, cálculos exactos, guardar/buscar recuerdos o mover el robot. Puedes encadenar varias herramientas si hace falta.
2. Responde en español, claro, preciso y conciso (1 a 3 frases naturales sin markdown).
3. Incluye al inicio o final [EXPR:nombre] con la emoción adecuada (happy, laughing, wink, love, shy_blush, starry_eyed, smug_proud, curious, aha_eureka, surprised, sad, angry, searching_radar, memory_saved).
4. Si das una cifra o resultado clave, añade [DATA:Valor|ETIQUETA|Subtitulo].
5. Si el modelo no soporta function calling nativo y necesitas una herramienta, responde exactamente [TOOL:nombre_herramienta|{"param":"valor"}].
Recuerdos relevantes:\n${memText}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ];

  for (let step = 0; step < 4; step++) {
    const resp = await callLLM({
      messages,
      tools: AGENT_TOOLS_SCHEMA,
      tool_choice: 'auto',
    });

    const choice = resp?.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // 1) Soporte nativo OpenAI / Gemini function calling
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        const fnName = tc?.function?.name;
        let args = {};
        try {
          args = JSON.parse(tc?.function?.arguments || '{}');
        } catch (e) {}
        if (onStageChange) onStageChange(fnName, args);
        const toolResult = await executeTool(fnName, args);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id || `call_${step}_${fnName}`,
          name: fnName,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    // 2) Fallback ReAct textual [TOOL:nombre|{json}] para modelos que no devuelven tool_calls
    const content = (msg.content || '').trim();
    const fallbackToolMatch = /\[TOOL:([a-zA-Z0-9_]+)\|(\{[\s\S]*?\})\]/i.exec(content);
    if (fallbackToolMatch) {
      const fnName = fallbackToolMatch[1];
      let args = {};
      try {
        args = JSON.parse(fallbackToolMatch[2]);
      } catch (e) {}
      if (onStageChange) onStageChange(fnName, args);
      const toolResult = await executeTool(fnName, args);
      messages.push({ role: 'assistant', content });
      messages.push({
        role: 'user',
        content: `Resultado de herramienta ${fnName}: ${JSON.stringify(toolResult)}. Ahora entrega tu respuesta final al usuario.`,
      });
      continue;
    }

    return content || '[EXPR:happy] Listo.';
  }

  return '[EXPR:happy] Listo, procesé los datos.';
}
