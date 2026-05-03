// Telemetría anónima opt-out.
//
// Qué se envía: barcode (si hay), nombre del producto, veredicto, ingredientes
// no reconocidos, fuente del scan, día (sin timestamp exacto), versión de app.
// Qué NO se envía: uid, email, IP (Firestore no la guarda en el doc),
// timestamp preciso, user-agent, ubicación.
//
// La usuaria puede desactivar el toggle desde el footer de la app. La preferencia
// se guarda en localStorage. Default: ON.
//
// Si Firebase no está configurado o falla la escritura, la telemetría es un
// no-op silencioso — nunca debe afectar el flujo principal de la app.

import { getDb } from "./auth.js";
import { FIREBASE_ENABLED } from "./firebase-config.js";

const STORAGE_KEY = "curlycheck.telemetry.enabled";
const APP_VERSION = "v9"; // bumpear cuando cambie

// ---------------------------------------------------------------------------
// Toggle (localStorage, default ON)
// ---------------------------------------------------------------------------
export function isEnabled() {
  // Default true — solo false si la usuaria explícitamente lo desactivó
  const v = localStorage.getItem(STORAGE_KEY);
  return v !== "0";
}

export function setEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

// ---------------------------------------------------------------------------
// dayBucket: granularidad día, no timestamp preciso
// ---------------------------------------------------------------------------
function todayBucket() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Sanitización de payload
// ---------------------------------------------------------------------------
function clip(str, max) {
  if (!str) return "";
  return String(str).slice(0, max);
}

function buildScanPayload(item) {
  return {
    barcode: clip(item.barcode || "", 32),
    name: clip(item.name || "", 200),
    brand: clip(item.brand || "", 100),
    verdict: clip(item.verdict || "", 16),
    ruleset: clip(item.ruleset || "", 64),
    source: clip(item.source || "", 64),
    unknownIngredients: (item.unknown || [])
      .slice(0, 30)
      .map((u) => clip(u, 80)),
    dayBucket: todayBucket(),
    appVersion: APP_VERSION,
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Registra un scan en la telemetría. Fire-and-forget — los errores se silencian
 * para no afectar el flujo principal.
 *
 * @param {Object} item  state.current al momento del resultado
 * @returns {Promise<boolean>} true si se envió, false si no
 */
export async function recordScan(item) {
  if (!FIREBASE_ENABLED) return false;
  if (!isEnabled()) return false;
  if (!item) return false;
  // No registrar resultados con INCI vacía o de stubs (allowOcr=true sin inci)
  if (!item.inci || item.inci.length < 5) return false;

  try {
    const ctx = await getDb();
    if (!ctx) return false;
    const { db, fsMod } = ctx;
    const payload = buildScanPayload(item);
    const ref = fsMod.collection(db, "telemetry", "scans", "events");
    await fsMod.addDoc(ref, payload);
    return true;
  } catch (e) {
    console.warn("[telemetry] scan record failed:", e.message);
    return false;
  }
}

/**
 * Registra una contribución a Open Beauty Facts (cuando esa feature exista).
 */
export async function recordContribution(barcode, name) {
  if (!FIREBASE_ENABLED) return false;
  if (!isEnabled()) return false;
  try {
    const ctx = await getDb();
    if (!ctx) return false;
    const { db, fsMod } = ctx;
    const ref = fsMod.collection(db, "telemetry", "contributions", "events");
    await fsMod.addDoc(ref, {
      barcode: clip(barcode || "", 32),
      name: clip(name || "", 200),
      dayBucket: todayBucket(),
      appVersion: APP_VERSION,
    });
    return true;
  } catch (e) {
    console.warn("[telemetry] contribution record failed:", e.message);
    return false;
  }
}
