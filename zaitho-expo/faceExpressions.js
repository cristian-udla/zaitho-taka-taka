// Catálogo enriquecido de expresiones para Zaitho (inspirado en las 72 expresiones de Super-LOOI)
export const FACE_COLORS = {
  cyan: '#00F2FF',
  emerald: '#00FFAA',
  amber: '#FFB800',
  magenta: '#FF2A85',
  flirty: '#FF47A3',
  danger: '#FF3D00',
  blue: '#38BDF8',
  lavender: '#A78BFA',
  warm: '#FFD166',
};

export const FACE_RECIPES = {
  neutral: {
    scaleXL: 1, scaleYL: 1, scaleXR: 1, scaleYR: 1,
    tiltL: 0, tiltR: 0, happy: 0.15, squint: 0, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'none', glyph: null,
  },
  happy: {
    scaleXL: 1.06, scaleYL: 0.88, scaleXR: 1.06, scaleYR: 0.88,
    tiltL: 0, tiltR: 0, happy: 0.72, squint: 0, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'smile', glyph: null,
  },
  happy_squint: {
    scaleXL: 1.14, scaleYL: 0.56, scaleXR: 1.14, scaleYR: 0.56,
    tiltL: -4, tiltR: 4, happy: 0.92, squint: 0.25, blush: 0.4,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'wide_smile', glyph: null,
  },
  laughing: {
    scaleXL: 1.18, scaleYL: 0.45, scaleXR: 1.18, scaleYR: 0.45,
    tiltL: -8, tiltR: 8, happy: 1, squint: 0.35, blush: 0.65,
    color: FACE_COLORS.warm, shapeL: 'chevron', shapeR: 'chevron', mouth: 'open_d', glyph: '✨',
  },
  wink: {
    scaleXL: 1.08, scaleYL: 0.96, scaleXR: 1.12, scaleYR: 0.22,
    tiltL: 0, tiltR: 8, happy: 0.6, squint: 0.1, blush: 0.45,
    color: FACE_COLORS.flirty, shapeL: 'orb', shapeR: 'line', mouth: 'smirk', glyph: '✨',
  },
  flirty: {
    scaleXL: 1.18, scaleYL: 0.48, scaleXR: 1.18, scaleYR: 0.48,
    tiltL: -6, tiltR: 6, happy: 0.95, squint: 0, blush: 1,
    color: FACE_COLORS.flirty, shapeL: 'orb', shapeR: 'orb', mouth: 'smile', glyph: '💖',
  },
  love: {
    scaleXL: 1.12, scaleYL: 1.08, scaleXR: 1.12, scaleYR: 1.08,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0, blush: 1,
    color: FACE_COLORS.flirty, shapeL: 'heart', shapeR: 'heart', mouth: 'smile', glyph: '💖',
  },
  shy_blush: {
    scaleXL: 0.95, scaleYL: 0.72, scaleXR: 0.95, scaleYR: 0.72,
    tiltL: -10, tiltR: 10, happy: 0.75, squint: 0.15, blush: 1,
    color: FACE_COLORS.flirty, shapeL: 'orb', shapeR: 'orb', mouth: 'wavy', glyph: '💕',
  },
  starry_eyed: {
    scaleXL: 1.16, scaleYL: 1.16, scaleXR: 1.16, scaleYR: 1.16,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0, blush: 0.5,
    color: FACE_COLORS.warm, shapeL: 'star', shapeR: 'star', mouth: 'open_d', glyph: '✨',
  },
  smug_proud: {
    scaleXL: 1.05, scaleYL: 0.62, scaleXR: 1.05, scaleYR: 0.62,
    tiltL: 10, tiltR: -10, happy: 0.4, squint: 0.3, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'smirk', glyph: null,
  },
  kitty_playful: {
    scaleXL: 1.08, scaleYL: 0.85, scaleXR: 1.08, scaleYR: 0.85,
    tiltL: -4, tiltR: 4, happy: 0.8, squint: 0, blush: 0.7,
    color: FACE_COLORS.flirty, shapeL: 'orb', shapeR: 'orb', mouth: 'cat_w', glyph: '🐾',
  },
  kissy: {
    scaleXL: 1.1, scaleYL: 0.4, scaleXR: 1.1, scaleYR: 0.4,
    tiltL: -5, tiltR: 5, happy: 0.9, squint: 0.2, blush: 0.9,
    color: FACE_COLORS.flirty, shapeL: 'crescent', shapeR: 'crescent', mouth: 'kiss_3', glyph: '💋',
  },
  excited: {
    scaleXL: 1.15, scaleYL: 1.06, scaleXR: 1.15, scaleYR: 1.06,
    tiltL: 0, tiltR: 0, happy: 0.88, squint: 0, blush: 0.55,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'wide_smile', glyph: '⚡',
  },
  celebrate_party: {
    scaleXL: 1.18, scaleYL: 1.12, scaleXR: 1.18, scaleYR: 1.12,
    tiltL: -5, tiltR: 5, happy: 0.92, squint: 0, blush: 0.7,
    color: FACE_COLORS.warm, shapeL: 'star', shapeR: 'star', mouth: 'open_d', glyph: '🎉',
  },
  music_vibe: {
    scaleXL: 1.12, scaleYL: 0.72, scaleXR: 1.12, scaleYR: 0.72,
    tiltL: -6, tiltR: 6, happy: 0.85, squint: 0.1, blush: 0.45,
    color: FACE_COLORS.emerald, shapeL: 'crescent', shapeR: 'crescent', mouth: 'smile', glyph: '🎵',
  },
  zen_content: {
    scaleXL: 1.05, scaleYL: 0.35, scaleXR: 1.05, scaleYR: 0.35,
    tiltL: -3, tiltR: 3, happy: 0.85, squint: 0, blush: 0.3,
    color: FACE_COLORS.emerald, shapeL: 'crescent', shapeR: 'crescent', mouth: 'smile', glyph: null,
    closedRest: true,
  },
  curious: {
    scaleXL: 1.04, scaleYL: 1.22, scaleXR: 1.02, scaleYR: 0.62,
    tiltL: -5, tiltR: 10, happy: 0, squint: 0.28, blush: 0,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'circle_o', glyph: '❓',
  },
  listening: {
    scaleXL: 1.08, scaleYL: 1.15, scaleXR: 1.08, scaleYR: 1.15,
    tiltL: -4, tiltR: 4, happy: 0.2, squint: 0, blush: 0,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'none', glyph: '🎙️',
  },
  thinking: {
    scaleXL: 1, scaleYL: 0.78, scaleXR: 1, scaleYR: 0.96,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0.3, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'flat', glyph: '💭',
    gaze: { x: -32, y: -26 },
  },
  speaking: {
    scaleXL: 1.06, scaleYL: 0.96, scaleXR: 1.06, scaleYR: 0.96,
    tiltL: 0, tiltR: 0, happy: 0.55, squint: 0, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'open_d', glyph: null,
  },
  surprised: {
    scaleXL: 1.16, scaleYL: 1.28, scaleXR: 1.16, scaleYR: 1.28,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0, blush: 0,
    color: FACE_COLORS.amber, shapeL: 'orb', shapeR: 'orb', mouth: 'circle_o', glyph: '❗',
  },
  shocked: {
    scaleXL: 1.24, scaleYL: 1.34, scaleXR: 1.24, scaleYR: 1.34,
    tiltL: -10, tiltR: 10, happy: 0, squint: 0, blush: 0,
    color: FACE_COLORS.amber, shapeL: 'orb', shapeR: 'orb', mouth: 'circle_o', glyph: '⚡',
  },
  confused: {
    scaleXL: 0.92, scaleYL: 1.12, scaleXR: 1.06, scaleYR: 0.65,
    tiltL: -12, tiltR: 15, happy: 0, squint: 0.25, blush: 0,
    color: FACE_COLORS.amber, shapeL: 'orb', shapeR: 'orb', mouth: 'wavy', glyph: '❓',
  },
  aha_eureka: {
    scaleXL: 1.16, scaleYL: 1.24, scaleXR: 1.16, scaleYR: 1.24,
    tiltL: -4, tiltR: 4, happy: 0.7, squint: 0, blush: 0.3,
    color: FACE_COLORS.warm, shapeL: 'orb', shapeR: 'orb', mouth: 'open_d', glyph: '💡',
  },
  wake_spark: {
    scaleXL: 1.2, scaleYL: 1.25, scaleXR: 1.2, scaleYR: 1.25,
    tiltL: 0, tiltR: 0, happy: 0.6, squint: 0, blush: 0.25,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'smile', glyph: '✨',
  },
  sad: {
    scaleXL: 0.96, scaleYL: 0.68, scaleXR: 0.96, scaleYR: 0.68,
    tiltL: -18, tiltR: 18, happy: 0, squint: 0.1, blush: 0,
    color: FACE_COLORS.blue, shapeL: 'orb', shapeR: 'orb', mouth: 'pout', glyph: '💧',
    gaze: { x: 0, y: 24 },
  },
  teary_cry: {
    scaleXL: 0.94, scaleYL: 0.56, scaleXR: 0.94, scaleYR: 0.56,
    tiltL: -22, tiltR: 22, happy: 0, squint: 0.25, blush: 0.3,
    color: FACE_COLORS.blue, shapeL: 'orb', shapeR: 'orb', mouth: 'wavy', glyph: '💧',
    gaze: { x: 0, y: 22 },
  },
  pouty: {
    scaleXL: 1.02, scaleYL: 0.72, scaleXR: 1.02, scaleYR: 0.72,
    tiltL: 12, tiltR: -12, happy: 0, squint: 0.28, blush: 0.6,
    color: FACE_COLORS.flirty, shapeL: 'orb', shapeR: 'orb', mouth: 'pout', glyph: null,
  },
  angry: {
    scaleXL: 1.02, scaleYL: 0.68, scaleXR: 1.02, scaleYR: 0.68,
    tiltL: 22, tiltR: -22, happy: 0, squint: 0.36, blush: 0,
    color: FACE_COLORS.danger, shapeL: 'orb', shapeR: 'orb', mouth: 'pout', glyph: '💢',
  },
  grumpy_puff: {
    scaleXL: 1.04, scaleYL: 0.62, scaleXR: 1.04, scaleYR: 0.62,
    tiltL: 18, tiltR: -18, happy: 0, squint: 0.38, blush: 0.4,
    color: FACE_COLORS.danger, shapeL: 'orb', shapeR: 'orb', mouth: 'pout', glyph: '😤',
  },
  side_eye: {
    scaleXL: 1, scaleYL: 0.78, scaleXR: 1, scaleYR: 0.78,
    tiltL: 8, tiltR: 8, happy: 0, squint: 0.22, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'flat', glyph: null,
    gaze: { x: 42, y: -4 },
  },
  dizzy_spiral: {
    scaleXL: 1.1, scaleYL: 1.1, scaleXR: 1.1, scaleYR: 1.1,
    tiltL: -10, tiltR: 10, happy: 0, squint: 0, blush: 0.25,
    color: FACE_COLORS.amber, shapeL: 'spiral', shapeR: 'spiral', mouth: 'wavy', glyph: '💫',
  },
  nervous_sweat: {
    scaleXL: 0.92, scaleYL: 0.82, scaleXR: 0.92, scaleYR: 0.82,
    tiltL: -12, tiltR: 12, happy: 0, squint: 0.18, blush: 0.35,
    color: FACE_COLORS.amber, shapeL: 'orb', shapeR: 'orb', mouth: 'wavy', glyph: '💦',
  },
  mischievous: {
    scaleXL: 1.08, scaleYL: 0.74, scaleXR: 1.08, scaleYR: 0.74,
    tiltL: 14, tiltR: -14, happy: 0.55, squint: 0.2, blush: 0.2,
    color: FACE_COLORS.lavender, shapeL: 'orb', shapeR: 'orb', mouth: 'smirk', glyph: '😈',
  },
  sleepy: {
    scaleXL: 1, scaleYL: 0.32, scaleXR: 1, scaleYR: 0.32,
    tiltL: -6, tiltR: 6, happy: 0, squint: 0.3, blush: 0,
    color: FACE_COLORS.blue, shapeL: 'orb', shapeR: 'orb', mouth: 'flat', glyph: null,
  },
  yawning: {
    scaleXL: 1.05, scaleYL: 0.24, scaleXR: 1.05, scaleYR: 0.24,
    tiltL: -10, tiltR: 10, happy: 0, squint: 0.2, blush: 0.2,
    color: FACE_COLORS.lavender, shapeL: 'line', shapeR: 'line', mouth: 'oval_yawn', glyph: '💤',
    closedRest: true,
  },
  sleeping: {
    scaleXL: 1.08, scaleYL: 0.2, scaleXR: 1.08, scaleYR: 0.2,
    tiltL: -4, tiltR: 4, happy: 0, squint: 0, blush: 0.25,
    color: FACE_COLORS.lavender, shapeL: 'line', shapeR: 'line', mouth: 'flat', glyph: '💤',
    closedRest: true,
  },
  searching_radar: {
    scaleXL: 1.08, scaleYL: 0.96, scaleXR: 1.08, scaleYR: 0.96,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0.15, blush: 0,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'flat', glyph: '📡',
    gaze: { x: 26, y: -10 },
  },
  memory_saved: {
    scaleXL: 1.1, scaleYL: 0.92, scaleXR: 1.1, scaleYR: 0.92,
    tiltL: -4, tiltR: 4, happy: 0.78, squint: 0, blush: 0.4,
    color: FACE_COLORS.emerald, shapeL: 'orb', shapeR: 'orb', mouth: 'smile', glyph: '💾',
  },
  charging_pulse: {
    scaleXL: 1.06, scaleYL: 0.45, scaleXR: 1.06, scaleYR: 0.45,
    tiltL: -4, tiltR: 4, happy: 0.85, squint: 0, blush: 0.35,
    color: FACE_COLORS.emerald, shapeL: 'crescent', shapeR: 'crescent', mouth: 'smile', glyph: '⚡',
    closedRest: true,
  },
  low_battery: {
    scaleXL: 0.92, scaleYL: 0.36, scaleXR: 0.92, scaleYR: 0.36,
    tiltL: -16, tiltR: 16, happy: 0, squint: 0.25, blush: 0,
    color: FACE_COLORS.danger, shapeL: 'orb', shapeR: 'orb', mouth: 'pout', glyph: '🪫',
  },
  scared: {
    scaleXL: 0.78, scaleYL: 0.68, scaleXR: 0.78, scaleYR: 0.68,
    tiltL: -14, tiltR: 14, happy: 0, squint: 0, blush: 0,
    color: FACE_COLORS.amber, shapeL: 'orb', shapeR: 'orb', mouth: 'circle_o', glyph: '😨',
  },
  'look-up': {
    scaleXL: 1, scaleYL: 0.9, scaleXR: 1, scaleYR: 0.9,
    tiltL: 0, tiltR: 0, happy: 0, squint: 0.32, blush: 0,
    color: FACE_COLORS.cyan, shapeL: 'orb', shapeR: 'orb', mouth: 'none', glyph: null,
  },
};

const EXPRESSION_ALIASES = {
  love_eyes: 'love',
  angry_glare: 'angry',
  sad_droop: 'sad',
  excited_bounce: 'excited',
  sleepy_drowsy: 'sleepy',
  deep_snore: 'sleeping',
  touched_warm: 'shy_blush',
  alarmed: 'shocked',
  speechless: 'side_eye',
  bored_sigh: 'sleepy',
  relieved_sigh: 'zen_content',
  task_verified: 'aha_eureka',
  memory_recall: 'thinking',
  drive_forward: 'excited',
  turn_peek: 'curious',
  dock_snap: 'wake_spark',
};

export function resolveFaceRecipe(expr) {
  const key = String(expr || 'neutral').toLowerCase().trim();
  const canonical = EXPRESSION_ALIASES[key] || key;
  return {
    key: FACE_RECIPES[canonical] ? canonical : 'neutral',
    recipe: FACE_RECIPES[canonical] || FACE_RECIPES.neutral,
  };
}

export const ALL_EXPRESSION_KEYS = Object.keys(FACE_RECIPES);
