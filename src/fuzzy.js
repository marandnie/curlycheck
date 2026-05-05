// Auto-corrección de tokens INCI mediante distancia de Levenshtein.
// Útil sobre todo para corregir errores típicos de OCR ("Sodum Lawreth Sulfate"
// → "Sodium Laureth Sulfate") usando el catálogo INCI como diccionario.
//
// Estrategia:
//   1. Normalizar el token.
//   2. Si ya está en el catálogo (match exacto), devolver tal cual.
//   3. Si no, buscar el ingrediente con menor distancia Levenshtein.
//   4. Aceptar la corrección sólo si la distancia es ≤ umbral relativo
//      (max(1, length / 6) para tokens largos, 1 para cortos).

import { INGREDIENTS } from "./ingredients.js";
import { splitInciTokens } from "./classifier.js";

// ---------------------------------------------------------------------------
// Levenshtein iterativo con dos filas (O(n*m), memoria O(n))
// ---------------------------------------------------------------------------
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const n = a.length, m = b.length;
  // Early exit por diferencia de longitud
  if (Math.abs(n - m) > 4 && Math.max(n, m) > 8) return 99;

  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // inserción
        prev[j] + 1,            // borrado
        prev[j - 1] + cost,     // sustitución
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------
function norm(s) {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[/·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Index plano de candidatos (norm → nombre canónico)
// Se construye una sola vez al cargar el módulo.
// ---------------------------------------------------------------------------
const CANDIDATES = (() => {
  const arr = [];
  for (const ing of INGREDIENTS) {
    const names = [ing.name, ...(ing.aliases || [])];
    for (const n of names) {
      arr.push({ norm: norm(n), canonical: ing.name });
    }
  }
  return arr;
})();
const EXACT_SET = new Set(CANDIDATES.map((c) => c.norm));

// ---------------------------------------------------------------------------
// Umbral dinámico de aceptación
// Más tolerante con strings largos. 1 char de error en algo de 6 letras es OK,
// 2 chars en algo de 12, etc.
// ---------------------------------------------------------------------------
function maxDistanceFor(token) {
  const len = token.length;
  if (len <= 4) return 0;             // muy corto, no corregir
  if (len <= 7) return 1;
  if (len <= 14) return 2;
  return 3;
}

/**
 * Intenta corregir un token. Devuelve { match: nombreCanonical, distance } si
 * encuentra una corrección dentro del umbral. Devuelve null si no.
 */
export function correctIngredient(token) {
  const t = norm(token);
  if (!t) return null;
  // Match exacto: no hace falta corregir
  if (EXACT_SET.has(t)) return { match: getCanonical(t), distance: 0 };

  const maxD = maxDistanceFor(t);
  if (maxD === 0) return null;

  // Búsqueda lineal con corte temprano
  let best = null;
  for (const c of CANDIDATES) {
    // Heurística: si la diferencia de longitud ya supera maxD, descartar
    if (Math.abs(c.norm.length - t.length) > maxD) continue;
    // Heurística: primera letra debe coincidir o estar cerca
    if (c.norm.charCodeAt(0) !== t.charCodeAt(0) && t.length > 5) continue;
    const d = levenshtein(t, c.norm);
    if (d <= maxD && (best === null || d < best.distance)) {
      best = { match: c.canonical, distance: d };
      if (d === 0) break;
    }
  }
  return best;
}

function getCanonical(normalized) {
  const c = CANDIDATES.find((x) => x.norm === normalized);
  return c ? c.canonical : normalized;
}

/**
 * Aplica fuzzy correction a una INCI completa. Devuelve el texto corregido
 * + lista de cambios aplicados (para mostrarle al usuario qué se autocorrigió).
 *
 * Usa `splitInciTokens` del classifier para preservar comas internas de
 * locantes numéricos (ej. "2-Oleamido-1,3-Octadecanediol"); de lo contrario
 * un split naïve por coma rompería el ingrediente en dos tokens desconocidos.
 */
export function correctInciText(text) {
  if (!text) return { text: "", changes: [] };
  const tokens = splitInciTokens(text);
  const out = [];
  const changes = [];
  for (const raw of tokens) {
    if (!raw) continue;
    const r = correctIngredient(raw);
    if (r && r.distance > 0) {
      out.push(r.match);
      changes.push({ from: raw, to: r.match, distance: r.distance });
    } else {
      out.push(raw);
    }
  }
  return { text: out.join(", "), changes };
}
