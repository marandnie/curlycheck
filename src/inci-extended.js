// Catálogo INCI extendido (CosIng + OBF) con carga lazy.
//
// Por qué existe:
//   `src/ingredients.js` contiene la lista curada de ingredientes relevantes
//   para el Método Curly (sulfatos, siliconas no solubles, aceites buenos…).
//   Tiene ~150 entradas y dice qué es "malo", "permitido", etc.
//
//   Este módulo carga ADEMÁS un catálogo de ~28.700 INCI oficiales generado
//   por scripts/build-inci-catalog.py. No emite juicio curly: sólo permite
//   reconocer que "Polyquaternium-37", "Sodium Hyaluronate" o "Allantoin" son
//   ingredientes reales y no ruido del OCR. Eso mejora la "cobertura" del
//   parser y reduce los falsos VERIFICAR cuando un producto trae muchos
//   ingredientes correctos pero exóticos para Curly.
//
// Diseño:
//   - Carga lazy: el JSON pesa ~930 KB. No bloqueamos el primer paint.
//     Se descarga después de `load`, idealmente cuando la red está libre.
//   - API sincrónica para el clasificador: `isKnownInci(token)` devuelve
//     `false` si todavía no warmeó. Así `classifier.js` no se vuelve async
//     y los tests existentes (que importan classifier directo en Node)
//     siguen funcionando sin tocar.
//   - Failsafe en red: si el fetch falla (offline, 404), marcamos el catálogo
//     como "intentado y vacío" y el clasificador sigue funcionando con la
//     lista curada únicamente.
//   - Es el ÚNICO módulo que descarga el catálogo. `fuzzy.js` lo usa también
//     (vía getFuzzyIndex) para corregir errores de OCR contra los ~28.700
//     nombres, en vez de sólo contra la lista curada.

import { normalizeToken } from "./classifier.js";

const CATALOG_URL = "./src/data/inci-names.json";

// `null` = todavía no se intentó | `Set` = listo (puede estar vacío si falló).
let _names = null;
let _loading = null;
// Forma original de cada nombre (norm → "SODIUM LAURETH SULFATE"), para que
// fuzzy.js pueda escribir la corrección. Y el índice por largo, que se arma
// recién la primera vez que se usa el OCR.
let _display = null;
let _fuzzyIndex = null;

function setCatalog(arr) {
  _names = new Set();
  _display = new Map();
  _fuzzyIndex = null;
  for (const name of arr) {
    if (typeof name !== "string") continue;
    const n = normalizeToken(name);
    if (!n || _names.has(n)) continue;
    _names.add(n);
    _display.set(n, name);
  }
  return _names;
}

/**
 * Descarga y parsea `inci-names.json`. Idempotente: llamadas concurrentes
 * comparten el mismo `fetch`. Llamadas posteriores retornan el Set cacheado.
 *
 * @returns {Promise<Set<string>>} set de nombres INCI canónicos normalizados
 */
export function warmExtendedCatalog() {
  if (_names) return Promise.resolve(_names);
  if (_loading) return _loading;
  _loading = fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((arr) => {
      if (!Array.isArray(arr)) throw new Error("formato inválido");
      return setCatalog(arr);
    })
    .catch((err) => {
      console.warn("[CurlyCheck] catálogo extendido no disponible:", err.message);
      return setCatalog([]);
    });
  return _loading;
}

/**
 * `true` si el token está en el catálogo CosIng/OBF.
 * Devuelve `false` mientras el catálogo no haya warmeado — no bloquea.
 *
 * @param {string} token nombre INCI sin normalizar
 * @returns {boolean}
 */
export function isKnownInci(token) {
  if (!_names || !token) return false;
  return _names.has(normalizeToken(token));
}

/**
 * Indica si `warmExtendedCatalog()` ya terminó (con éxito o falla).
 * Útil para tests y para decidir si re-evaluar un resultado cacheado.
 */
export function isCatalogReady() {
  return _names !== null;
}

/**
 * Índice para fuzzy.js: { exact: Set<norm>, byLen: Map<largo, {norm, name}[]> }.
 * Devuelve null si el catálogo no está cargado (o quedó vacío por un fallo),
 * y en ese caso el fuzzy trabaja sólo con la lista curada.
 */
export function getFuzzyIndex() {
  if (!_names || _names.size === 0) return null;
  if (!_fuzzyIndex) {
    const byLen = new Map();
    for (const [n, name] of _display) {
      if (!byLen.has(n.length)) byLen.set(n.length, []);
      byLen.get(n.length).push({ norm: n, name });
    }
    _fuzzyIndex = { exact: _names, byLen };
  }
  return _fuzzyIndex;
}

/**
 * Inyector para tests: reemplaza el set interno sin pasar por `fetch`.
 * Solo para uso en Node / vitest. En producción nadie debería llamarlo.
 *
 * @param {string[] | null} names array de nombres INCI, o null para resetear
 */
export function __setCatalogForTests(names) {
  if (names === null) {
    _names = null;
    _display = null;
    _fuzzyIndex = null;
    _loading = null;
    return;
  }
  setCatalog(names);
  _loading = null;
}
