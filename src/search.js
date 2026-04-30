// Búsqueda unificada por nombre: combina base local + Open Beauty Facts.
// La base local prioriza siempre (es curada y tiene INCI verificada).
// Después aparecen los hits de OBF.

import { searchLocalByName } from "./local-products.js";
import { searchByName as searchObf } from "./obf.js";

/**
 * Busca productos por nombre. Devuelve un array con:
 * { name, brand, barcode, inci, hasInci, source, imageFront? }
 *
 * Errores de OBF (offline, etc.) se silencian: los hits locales siempre se devuelven.
 */
export async function searchByName(query, opts = {}) {
  const { localLimit = 5, obfLimit = 5 } = opts;
  const localHits = searchLocalByName(query, localLimit);

  let obfHits = [];
  try {
    obfHits = await searchObf(query, obfLimit);
  } catch (e) {
    // Silencioso: igual devolvemos lo que tengamos en local
    console.warn("OBF search error:", e);
  }

  // Dedupe: si OBF devuelve algo cuyo nombre sea muy parecido a un hit local,
  // lo descartamos para no duplicar.
  const localNames = new Set(localHits.map((h) => norm(h.name)));
  const obfFiltered = obfHits.filter((h) => !localNames.has(norm(h.name)));

  return [...localHits, ...obfFiltered];
}

function norm(s) {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
