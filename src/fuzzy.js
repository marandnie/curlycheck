// Auto-corrección de tokens INCI mediante distancia de Levenshtein.
// Útil sobre todo para corregir errores típicos de OCR ("Sodum Lawreth Sulfate"
// → "Sodium Laureth Sulfate").
//
// Usa dos diccionarios:
//   1. El catálogo curado de ingredients.js (los que definen el veredicto).
//   2. El catálogo INCI completo (src/data/inci-names.json, CosIng + OBF),
//      que carga inci-extended.js (warmExtendedCatalog). Si todavía no cargó
//      o falló, todo funciona sólo con el curado, como antes.
//
// Reglas:
//   1. Si el token ya es un INCI válido (curado o catálogo), NO se toca.
//      Antes, con sólo ~220 candidatos, un INCI real a 1-3 letras de uno
//      curado se reescribía a ese otro ("Butyl Salicylate" → "Benzyl
//      Salicylate", "Phenyl Methicone" → "Phenyl Trimethicone").
//   2. Si hay que corregir, gana el candidato con menor distancia; en empate
//      gana el curado (es el que importa para el veredicto).
//   3. Si dos nombres distintos del catálogo empatan como mejor opción
//      ("Laureth-7" vs "Laureth-9"), no se corrige: es ambiguo y el usuario
//      lo revisa a mano.
//   4. Umbral de aceptación según largo del token (ver maxDistanceFor).

import { INGREDIENTS } from "./ingredients.js";
import { splitInciTokens } from "./classifier.js";
import { getFuzzyIndex } from "./inci-extended.js";

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
  return levenshteinWithin(a, b, Math.max(n, m));
}

/**
 * Levenshtein con corte: devuelve la distancia si es ≤ max, o max + 1 apenas
 * se sabe que la supera (todas las celdas de una fila > max). Con max chico
 * descarta candidatos lejanos en pocas filas, lo que permite recorrer miles
 * de nombres del catálogo por token sin trabar el celular.
 */
function levenshteinWithin(a, b, max) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  if (a === b) return 0;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(
        curr[j - 1] + 1,        // inserción
        prev[j] + 1,            // borrado
        prev[j - 1] + cost,     // sustitución
      );
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[m] <= max ? prev[m] : max + 1;
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
// Catálogo curado: index plano (norm → nombre canónico).
// Se construye una sola vez al cargar el módulo.
// ---------------------------------------------------------------------------
const CANDIDATES = (() => {
  const arr = [];
  for (const ing of INGREDIENTS) {
    const names = [ing.name, ...(ing.aliases || [])];
    for (const n of names) {
      arr.push({ norm: norm(n), name: ing.name });
    }
  }
  return arr;
})();
const CURATED_EXACT = new Map(CANDIDATES.map((c) => [c.norm, c.name]));

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

// Mejor candidato del curado. Sin catálogo se mantiene la heurística de
// primera letra (comportamiento previo). Con catálogo se descarta: los INCI
// válidos ya salen por match exacto, y así se corrige "5odium" → "Sodium".
function bestCurated(t, maxD, firstLetter) {
  let best = null;
  for (const c of CANDIDATES) {
    if (Math.abs(c.norm.length - t.length) > maxD) continue;
    if (firstLetter && c.norm.charCodeAt(0) !== t.charCodeAt(0) && t.length > 5) continue;
    const limit = best ? best.distance : maxD;
    const d = levenshteinWithin(t, c.norm, limit);
    if (d <= limit && (best === null || d < best.distance)) {
      best = { name: c.name, distance: d };
    }
  }
  return best;
}

// Mejor candidato del catálogo, marcando empate entre nombres distintos.
function bestInCatalog(catalog, t, maxD) {
  let best = null;
  let tied = false;
  for (let len = t.length - maxD; len <= t.length + maxD; len++) {
    const bucket = catalog.byLen.get(len);
    if (!bucket) continue;
    for (const c of bucket) {
      const limit = best ? best.distance : maxD;
      const d = levenshteinWithin(t, c.norm, limit);
      if (d > limit) continue;
      if (best === null || d < best.distance) {
        best = { name: c.name, norm: c.norm, distance: d };
        tied = false;
      } else if (d === best.distance && c.norm !== best.norm) {
        tied = true;
      }
    }
  }
  return best ? { ...best, tied } : null;
}

// Los nombres de CosIng/OBF vienen en MAYÚSCULAS. Si el usuario no escribió
// en mayúsculas, los pasamos a Title Case respetando siglas y números.
const KEEP_UPPER = new Set(["PEG", "PPG", "TEA", "DEA", "MEA", "MIPA", "TIPA", "PVP", "VP", "EDTA", "BHT", "BHA", "HCL", "CI", "II", "III", "IV", "PCA", "IPDI", "SD"]);
function matchCase(raw, target) {
  const hasLower = /[a-z]/.test(raw);
  if (!hasLower) return target.toUpperCase();
  if (/[a-z]/.test(target)) return target;
  return target
    .split(/([\s/\-(),]+)/)
    .map((w) => (KEEP_UPPER.has(w) || /\d/.test(w) || !/[A-Z]/.test(w)
      ? w
      : w.charAt(0) + w.slice(1).toLowerCase()))
    .join("");
}

/**
 * Intenta corregir un token. Devuelve { match, distance, source } si
 * encuentra una corrección dentro del umbral, o null si no.
 *   source: "curated" | "catalog"
 * Para tokens que ya son INCI válidos devuelve distance 0 y match = token.
 */
export function correctIngredient(token) {
  const t = norm(token);
  if (!t) return null;
  const catalog = getFuzzyIndex();

  // 1. Ya es válido: no tocar.
  if (CURATED_EXACT.has(t)) return { match: CURATED_EXACT.get(t), distance: 0, source: "curated" };
  if (catalog && catalog.exact.has(t)) return { match: token, distance: 0, source: "catalog" };

  const maxD = maxDistanceFor(t);
  if (maxD === 0) return null;

  // 2. Buscar en ambos diccionarios.
  const cur = bestCurated(t, maxD, !catalog);
  const cat = catalog ? bestInCatalog(catalog, t, maxD) : null;

  // 3. Elegir. En empate gana el curado.
  if (cur && (!cat || cur.distance <= cat.distance)) {
    return { match: cur.name, distance: cur.distance, source: "curated" };
  }
  if (cat) {
    // Si el mejor del catálogo es un curado, devolver la forma canónica.
    if (CURATED_EXACT.has(cat.norm)) {
      return { match: CURATED_EXACT.get(cat.norm), distance: cat.distance, source: "curated" };
    }
    if (cat.tied) return null; // ambiguo: que lo revise el usuario
    return { match: matchCase(token, cat.name), distance: cat.distance, source: "catalog" };
  }
  return null;
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
      changes.push({ from: raw, to: r.match, distance: r.distance, source: r.source });
    } else {
      out.push(raw);
    }
  }
  return { text: out.join(", "), changes };
}
