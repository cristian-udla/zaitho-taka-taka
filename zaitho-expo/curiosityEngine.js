// Máquina de Estados del "Bucle de Curiosidad y Descubrimiento" para Zaitho

export const CURIOSITY_STATES = {
  IDLE: 'IDLE',
  EXPLORE_PATROL: 'EXPLORE_PATROL',
  BRAKE_AND_FRAME: 'BRAKE_AND_FRAME',
  HIGHRES_CAPTURE: 'HIGHRES_CAPTURE',
  DEEP_ANALYSIS: 'DEEP_ANALYSIS',
  ASK_USER_FALLBACK: 'ASK_USER_FALLBACK',
};

export const CURIOSITY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_usuario_y_preguntar',
      description:
        'Invoca esta herramienta si la imagen es confusa, no sabes de quién es el objeto, o es algo totalmente desconocido para preguntarle al usuario.',
      parameters: {
        type: 'object',
        properties: {
          descripcion_objeto: {
            type: 'string',
            description: 'Descripción breve de lo observado o la duda sobre el objeto',
          },
        },
        required: ['descripcion_objeto'],
      },
    },
  },
];

export class CuriosityNoveltyCache {
  constructor(windowMs = 3000, cooldownSameLabelMs = 15000) {
    this.windowMs = windowMs;
    this.cooldownSameLabelMs = cooldownSameLabelMs;
    this.recentDetections = []; // { label, confidence, ts }
    this.analyzedAt = new Map(); // label -> ts
  }

  prune(now = Date.now()) {
    this.recentDetections = this.recentDetections.filter((d) => now - d.ts <= this.windowMs);
  }

  /**
   * Registra una detección YOLO/coco-ssd y decide si dispara novedad:
   * - Confianza > 0.60
   * - No se haya analizado recientemente ese mismo label
   */
  evaluate(label, confidence, now = Date.now()) {
    this.prune(now);
    const cleanLabel = String(label || '').trim().toLowerCase();
    if (!cleanLabel || confidence <= 0.6) return false;

    const alreadySeenIn3s = this.recentDetections.some((d) => d.label === cleanLabel);
    this.recentDetections.push({ label: cleanLabel, confidence, ts: now });

    const lastAnalyzed = this.analyzedAt.get(cleanLabel) || 0;
    if (now - lastAnalyzed < this.cooldownSameLabelMs) {
      return false;
    }

    // Si es un objeto nuevo (no visto en la ventana previa o listo tras cooldown)
    if (!alreadySeenIn3s || now - lastAnalyzed >= this.cooldownSameLabelMs) {
      this.analyzedAt.set(cleanLabel, now);
      return true;
    }
    return false;
  }

  reset() {
    this.recentDetections = [];
    this.analyzedAt.clear();
  }
}

/**
 * Análisis profundo directo en el teléfono (fallback autónomo si no hay proxy WebSocket conectado)
 */
export async function runLocalCuriosityAnalysis({ yolo_label, base64Image, callVisionDirect }) {
  const sysPrompt = `Eres Zaitho. Tu sistema de visión rápida YOLO detectó un ${yolo_label}. Analiza esta imagen en detalle. Si reconoces qué es específicamente o tienes datos útiles, haz un comentario corto e inteligente. Si la imagen es confusa, no sabes de quién es el objeto, o es algo totalmente desconocido, debes invocar la herramienta buscar_usuario_y_preguntar(descripcion_objeto).`;

  try {
    const resp = await callVisionDirect({
      systemPrompt: sysPrompt,
      userPrompt: `YOLO detectó: ${yolo_label}. Analiza esta captura de alta resolución.`,
      base64Image,
      tools: CURIOSITY_TOOLS,
    });

    const msg = resp?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    const askCall = toolCalls.find((tc) => tc?.function?.name === 'buscar_usuario_y_preguntar');

    if (askCall) {
      let args = {};
      try { args = JSON.parse(askCall.function.arguments || '{}'); } catch (e) {}
      return {
        action: 'ask_user',
        yolo_label,
        descripcion_objeto: args.descripcion_objeto || yolo_label,
        speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
      };
    }

    const content = (msg.content || '').trim();
    if (!content || /buscar_usuario_y_preguntar|no estoy seguro|desconocid|confus/i.test(content)) {
      return {
        action: 'ask_user',
        yolo_label,
        descripcion_objeto: content || yolo_label,
        speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
      };
    }

    return {
      action: 'comment',
      yolo_label,
      message: content,
    };
  } catch (e) {
    return {
      action: 'ask_user',
      yolo_label,
      descripcion_objeto: e?.message || yolo_label,
      speech: `Oye, encontré esto que parece un ${yolo_label}, pero no estoy seguro. ¿Qué es?`,
    };
  }
}
