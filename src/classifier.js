// Motor de clasificación: parser INCI + lookup + veredicto.

import { CATEGORIES, INGREDIENTS, RULESETS } from "./ingredients.js";

export const VERDICT = {
  APTO: "APTO",
  NO_APTO: "NO APTO",
  VERIFICAR: "VERIFICAR",
};

export function normalizeToken(s) {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\/·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = (() => {
  const m = new Map();
  for (const ing of INGREDIENTS) {
    const keys = [ing.name, ...(ing.aliases || [])];
    for (const k of keys) m.set(normalizeToken(k), ing);
  }
  return m;
})();

// Códigos de lote / referencias internas que algunas marcas imprimen al final
// de la INCI (FIL C158646-3, LOT 12345, etc). No son ingredientes.
const LOT_CODE_PATTERN = /^(FIL|LOT|BATCH|REF|N°|N\.|NRO|LOTE)\s*[\w\-\.]+$/i;

// Placeholder para proteger comas dentro de locantes numéricos
// (ej. "2-Oleamido-1,3-Octadecanediol")
const COMMA_PLACEHOLDER = "<<COMMA>>";

/**
 * Splittea un texto INCI en tokens preservando las comas internas de los
 * locantes numéricos (1,2-Hexanediol, 2-Oleamido-1,3-Octadecanediol, etc.).
 * También normaliza separadores (`;`, `·`, saltos de línea → `,`) y descarta
 * un prefijo tipo "Ingredients:" si aparece. NO filtra códigos de lote ni
 * resuelve slashes — es el "split crudo" que `parseInci` y `correctInciText`
 * comparten para no divergir en el manejo de comas.
 *
 * @param {string} text
 * @returns {string[]} tokens trimmeados (puede contener strings vacías filtradas)
 */
export function splitInciTokens(text) {
  if (!text) return [];
  text = text.replace(/^\s*(ingredients?|ingredientes|inci)\s*[:.\-]?\s*/i, "");
  text = text.replace(/\n/g, ",").replace(/;/g, ",").replace(/·/g, ",");
  text = text.replace(/(\d),(\d)/g, "$1" + COMMA_PLACEHOLDER + "$2");
  const tokens = text.split(",").map(function(t) {
    return t.split(COMMA_PLACEHOLDER).join(",")
            .replace(/[ ."\t]+$/, "")
            .replace(/^[ "\t]+/, "");
  });
  return tokens.filter(function(t) { return t.length > 0; });
}

export function parseInci(text) {
  const tokens = splitInciTokens(text);
  const cleaned = [];
  for (let t of tokens) {
    if (LOT_CODE_PATTERN.test(t.trim())) continue;
    if (t.includes("/")) {
      const parts = t.split("/").map(function(p) { return p.trim(); }).filter(Boolean);
      if (parts.length) t = parts[0];
    }
    cleaned.push(t);
  }
  return cleaned;
}

// Quita texto entre paréntesis: "Argania Spinosa (Argan) Kernel Oil" → "Argania Spinosa Kernel Oil"
function stripParens(s) {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// Helper interno: substring fallback con dos sub-estrategias para reducir
// falsos positivos del fallback genérico anterior (`norm.includes(key)`):
//
//   1) Multi-word keys (≥1 espacio): containment estándar. Es seguro porque
//      las claves con varias palabras son específicas (p.ej. "argania spinosa
//      kernel oil" no aparece dentro de otro ingrediente que no sea ese).
//      Útil para "Argania Spinosa Kernel Oil Bio" → Argania Spinosa Kernel Oil.
//
//   2) Single-word keys: sólo matchean si son la PRIMERA o ÚLTIMA palabra del
//      token. Esto evita el bug histórico donde "Cetearyl Alcohol Stearate"
//      → "Alcohol" (DRYING_ALCOHOL) por contener "alcohol" en el medio,
//      mientras que sigue capturando variantes razonables como
//      "Dimethicone Crosspolymer" → Dimethicone (silicona).
function substringMatch(norm) {
  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : null;
  for (const [key, ing] of INDEX.entries()) {
    if (key.length < 6) continue;
    if (key.includes(" ")) {
      if (norm.includes(key)) return ing;
    } else {
      if (key === first || key === last) return ing;
    }
  }
  return null;
}

export function lookupIngredient(token) {
  const norm = normalizeToken(token);
  if (!norm) return null;
  if (INDEX.has(norm)) return INDEX.get(norm);
  const withoutParens = normalizeToken(stripParens(token));
  if (withoutParens && withoutParens !== norm && INDEX.has(withoutParens)) {
    return INDEX.get(withoutParens);
  }
  const found = substringMatch(norm);
  if (found) return found;
  if (withoutParens && withoutParens !== norm) {
    const found2 = substringMatch(withoutParens);
    if (found2) return found2;
  }
  return null;
}

export function classify(inciText, rulesetName) {
  if (!rulesetName) rulesetName = "standard";
  const rs = RULESETS[rulesetName];
  if (!rs) throw new Error("Ruleset desconocido: " + rulesetName);
  const tokens = parseInci(inciText);
  if (!tokens.length) {
    return {
      verdict: VERDICT.VERIFICAR, ruleset: rs.name, offenders: [], unknown: [],
      coverage: 0, totalParsed: 0, notes: "INCI vacía o no parseable.",
    };
  }
  const offenders = [];
  const unknown = [];
  let matched = 0;
  for (const raw of tokens) {
    const ing = lookupIngredient(raw);
    if (!ing) { unknown.push(raw); continue; }
    matched++;
    let isForbidden = rs.forbiddenCategories.has(ing.category) || rs.extraForbidden.has(ing.name);
    if (rs.extraAllowed.has(ing.name)) isForbidden = false;
    if (isForbidden) {
      offenders.push({ raw, matched: ing, reason: ing.explanation || ing.category });
    }
  }
  const coverage = tokens.length ? matched / tokens.length : 0;
  const unknownRatio = tokens.length ? unknown.length / tokens.length : 0;
  let verdict, notes = "";
  if (offenders.length > 0) verdict = VERDICT.NO_APTO;
  else if (unknownRatio > rs.unknownThreshold) {
    verdict = VERDICT.VERIFICAR;
    notes = unknown.length + " de " + tokens.length + " ingredientes no reconocidos (" +
      Math.round(unknownRatio * 100) + "%).";
  } else verdict = VERDICT.APTO;
  return {
    verdict, ruleset: rs.name, offenders, unknown, coverage,
    totalParsed: tokens.length, notes,
  };
}

const CATEGORY_GROUPS = {
  sulfates: [CATEGORIES.SULFATE],
  silicones: [CATEGORIES.SILICONE_INSOLUBLE],
  alcohols: [CATEGORIES.DRYING_ALCOHOL],
  minerals: [CATEGORIES.MINERAL_OIL, CATEGORIES.WAX],
};

export function categorySummary(inciText, rulesetName) {
  if (!rulesetName) rulesetName = "standard";
  const rs = RULESETS[rulesetName];
  if (!rs) throw new Error("Ruleset desconocido: " + rulesetName);
  const tokens = parseInci(inciText);
  // `others` es el bucket catch-all para ingredientes en `extraForbidden`
  // cuya categoría no encaja en ningún CATEGORY_GROUP (sulfates / silicones
  // / alcohols / minerals). Ej: Methylparaben (PRESERVATIVE) en strict.
  // Antes caían en "sulfates" como fallback, lo cual era UX confusa.
  const empty = {
    sulfates: { state: "na", matches: [] },
    silicones: { state: "na", matches: [] },
    alcohols: { state: "na", matches: [] },
    minerals: { state: "na", matches: [] },
    others: { state: "na", matches: [] },
  };
  if (!tokens.length) return empty;
  const byCat = {};
  const flagged = [];
  for (const raw of tokens) {
    const ing = lookupIngredient(raw);
    if (!ing) continue;
    if (!byCat[ing.category]) byCat[ing.category] = [];
    byCat[ing.category].push(ing);
    if (rs.extraForbidden.has(ing.name)) flagged.push(ing);
  }
  const summary = {};
  for (const key of Object.keys(CATEGORY_GROUPS)) {
    const cats = CATEGORY_GROUPS[key];
    const matches = [];
    for (const c of cats) if (byCat[c]) matches.push.apply(matches, byCat[c]);
    const isRelevant = cats.some(function(c) { return rs.forbiddenCategories.has(c); });
    if (!isRelevant) {
      summary[key] = { state: matches.length > 0 ? "clean" : "na", matches: [] };
      continue;
    }
    const filtered = matches.filter(function(m) { return !rs.extraAllowed.has(m.name); });
    summary[key] = {
      state: filtered.length > 0 ? "present" : "clean",
      matches: filtered.map(function(m) { return m.name; }),
    };
  }
  // Inicializar el bucket "others" antes de distribuir extraForbidden.
  // Estado por defecto "na": sólo se renderiza si efectivamente hubo
  // extraForbidden que no encajaron en otra categoría. No mostramos
  // "Sin Otros prohibidos" para no agregar ruido visual.
  summary.others = { state: "na", matches: [] };
  for (const ing of flagged) {
    let target = null;
    for (const key of Object.keys(CATEGORY_GROUPS)) {
      if (CATEGORY_GROUPS[key].includes(ing.category)) { target = key; break; }
    }
    if (target === null) target = "others";
    if (summary[target].state !== "present") {
      summary[target] = { state: "present", matches: [ing.name] };
    } else if (!summary[target].matches.includes(ing.name)) {
      summary[target].matches.push(ing.name);
    }
  }
  return summary;
}
