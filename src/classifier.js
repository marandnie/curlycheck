// Motor de clasificación: parser INCI + lookup + veredicto.
// Port de Python (curly_classifier/classifier.py) a JS.

import { INGREDIENTS, RULESETS } from "./ingredients.js";

export const VERDICT = {
  APTO: "APTO",
  NO_APTO: "NO APTO",
  VERIFICAR: "VERIFICAR",
};

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------
export function normalizeToken(s) {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quitar diacríticos
    .toLowerCase()
    .replace(/[/·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Index global: aliasNormalizado -> ingrediente
// ---------------------------------------------------------------------------
const INDEX = (() => {
  const m = new Map();
  for (const ing of INGREDIENTS) {
    const keys = [ing.name, ...(ing.aliases || [])];
    for (const k of keys) {
      m.set(normalizeToken(k), ing);
    }
  }
  return m;
})();

// ---------------------------------------------------------------------------
// Parser INCI
// ---------------------------------------------------------------------------
export function parseInci(text) {
  if (!text) return [];
  // quitar prefijos comunes
  text = text.replace(/^\s*(ingredients?|ingredientes|inci)\s*[:.\-]?\s*/i, "");
  // unificar separadores
  text = text.replace(/\n/g, ",").replace(/;/g, ",").replace(/·/g, ",");
  const tokens = text.split(",").map((t) => t.replace(/[ ."\t]+$/, "").replace(/^[ "\t]+/, ""));
  const cleaned = [];
  for (let t of tokens) {
    if (!t) continue;
    if (t.includes("/")) {
      const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
      if (parts.length) t = parts[0];
    }
    cleaned.push(t);
  }
  return cleaned;
}

export function lookupIngredient(token) {
  const norm = normalizeToken(token);
  if (!norm) return null;
  if (INDEX.has(norm)) return INDEX.get(norm);
  // match parcial
  for (const [key, ing] of INDEX.entries()) {
    if (key.length >= 6 && norm.includes(key)) return ing;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Clasificador
// ---------------------------------------------------------------------------
export function classify(inciText, rulesetName = "standard") {
  const rs = RULESETS[rulesetName];
  if (!rs) throw new Error(`Ruleset desconocido: ${rulesetName}`);

  const tokens = parseInci(inciText);
  if (!tokens.length) {
    return {
      verdict: VERDICT.VERIFICAR,
      ruleset: rs.name,
      offenders: [],
      unknown: [],
      coverage: 0,
      totalParsed: 0,
      notes: "INCI vacía o no parseable.",
    };
  }

  const offenders = [];
  const unknown = [];
  let matched = 0;

  for (const raw of tokens) {
    const ing = lookupIngredient(raw);
    if (!ing) {
      unknown.push(raw);
      continue;
    }
    matched++;
    let isForbidden =
      rs.forbiddenCategories.has(ing.category) || rs.extraForbidden.has(ing.name);
    if (rs.extraAllowed.has(ing.name)) isForbidden = false;
    if (isForbidden) {
      offenders.push({
        raw,
        matched: ing,
        reason: ing.explanation || ing.category,
      });
    }
  }

  const coverage = tokens.length ? matched / tokens.length : 0;
  const unknownRatio = tokens.length ? unknown.length / tokens.length : 0;
  let verdict;
  let notes = "";

  if (offenders.length > 0) {
    verdict = VERDICT.NO_APTO;
  } else if (unknownRatio > rs.unknownThreshold) {
    verdict = VERDICT.VERIFICAR;
    notes = `${unknown.length} de ${tokens.length} ingredientes no reconocidos (${(unknownRatio * 100).toFixed(0)}%).`;
  } else {
    verdict = VERDICT.APTO;
  }

  return {
    verdict,
    ruleset: rs.name,
    offenders,
    unknown,
    coverage,
    totalParsed: tokens.length,
    notes,
  };
}
