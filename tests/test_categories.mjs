// Tests de categorySummary: chequeamos los chips por categoría sobre el golden set.

import { categorySummary } from "../src/classifier.js";

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push({ name, error: e.message }); }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ""} — esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
  }
}

// Crème de Jour Fondamentale: APTO completo, todos los chips clean
test("Crème de Jour Fondamentale: clean en todas las categorías", () => {
  const r = categorySummary(
    "Aqua/Water, Glycerin, Cetearyl Alcohol, Helianthus Annuus Seed Oil, Hydroxypropyl Guar, Stearamidopropyl Dimethylamine, Cetyl Esters, Caprylyl Glycol, Glyceryl Stearate, Salicylic Acid, Benzyl Salicylate, Linalool, Benzyl Alcohol, Tartaric Acid, Mel Extract, Citric Acid, Parfum.",
    "standard",
  );
  assertEq(r.sulfates.state, "clean");
  assertEq(r.silicones.state, "clean");
  assertEq(r.alcohols.state, "clean");
  assertEq(r.minerals.state, "clean");
});

// Bain Hydra-Glaze: tiene SLES y Dimethicone
test("Gloss Absolu Bain Hydra-Glaze: sulfatos + siliconas presentes", () => {
  const r = categorySummary(
    "Aqua/Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Sodium Chloride, Dimethicone, Glycolic Acid, Sodium Hyaluronate, Glycol Distearate, Sodium Benzoate, Citric Acid, Linalool, Limonene, Benzyl Alcohol, Parfum.",
    "standard",
  );
  assertEq(r.sulfates.state, "present");
  if (!r.sulfates.matches.includes("Sodium Laureth Sulfate")) {
    throw new Error("falta SLES en sulfates.matches: " + JSON.stringify(r.sulfates.matches));
  }
  assertEq(r.silicones.state, "present");
  if (!r.silicones.matches.includes("Dimethicone")) {
    throw new Error("falta Dimethicone en silicones.matches");
  }
  assertEq(r.alcohols.state, "clean");
  assertEq(r.minerals.state, "clean");
});

// Masque Beurre Haute Nutrition: silicona + alcohol secante
test("Masque Beurre: silicones + alcohols presentes", () => {
  const r = categorySummary(
    "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Cetyl Esters, Potato Starch Modified, Parfum, Isopropyl Alcohol, Phenoxyethanol, Methylparaben, Linalool, Trideceth-6, Benzyl Alcohol.",
    "standard",
  );
  assertEq(r.sulfates.state, "clean");
  assertEq(r.silicones.state, "present");
  assertEq(r.alcohols.state, "present");
  if (!r.alcohols.matches.includes("Isopropyl Alcohol")) {
    throw new Error("falta Isopropyl Alcohol en alcohols.matches");
  }
});

// Ruleset lenient: Dimethicone NO debe aparecer como present (extraAllowed)
test("Lenient: Dimethicone allowed → silicones clean", () => {
  const r = categorySummary("Aqua, Dimethicone, Cetearyl Alcohol, Glycerin, Parfum", "lenient");
  assertEq(r.silicones.state, "clean", "Dimethicone debería estar permitido en lenient");
  assertEq(r.sulfates.state, "clean");
});

// Ruleset strict: WAX prohibido — Candelilla debería disparar minerals
test("Strict: Candelilla wax → minerals present (waxes prohibidas en strict)", () => {
  const r = categorySummary("Aqua, Glycerin, Candelilla Cera, Cetearyl Alcohol", "strict");
  assertEq(r.minerals.state, "present");
});

// extraForbidden: Methylparaben en strict — debe ir al bucket "others",
// NO a sulfates (que era el fallback bug histórico). Methylparaben es
// PRESERVATIVE y no encaja en ningún CATEGORY_GROUP.
test("Strict: Methylparaben (extraForbidden) → bucket 'others', no contamina sulfates", () => {
  const r = categorySummary("Aqua, Glycerin, Methylparaben, Parfum", "strict");
  assertEq(r.others.state, "present", "Methylparaben debería marcar 'others' como present");
  if (!r.others.matches.includes("Methylparaben")) {
    throw new Error("falta Methylparaben en others.matches: " + JSON.stringify(r.others.matches));
  }
  // Crítico: NO debe contaminar sulfates (el bug original)
  assertEq(r.sulfates.state, "clean", "sulfates no debería marcarse present por un parabeno");
});

// Regresión: cuando un extraForbidden SÍ encaja en un CATEGORY_GROUP,
// debe ir ahí (no a 'others').
test("Standard: Mineral Oil va a 'minerals', others queda na", () => {
  const r = categorySummary("Aqua, Mineral Oil, Glycerin", "standard");
  assertEq(r.minerals.state, "present");
  if (!r.minerals.matches.includes("Mineral Oil")) {
    throw new Error("falta Mineral Oil en minerals.matches");
  }
  assertEq(r.others.state, "na", "others debería quedar na cuando todo encaja en categorías propias");
});

// Crème de Jour Fondamentale: validar 'others' na (no hay extraForbidden ajenos)
test("Crème de Jour Fondamentale: 'others' también queda na (sin extraForbidden ajenos)", () => {
  const r = categorySummary(
    "Aqua/Water, Glycerin, Cetearyl Alcohol, Helianthus Annuus Seed Oil, Hydroxypropyl Guar, Stearamidopropyl Dimethylamine, Cetyl Esters, Caprylyl Glycol, Glyceryl Stearate, Salicylic Acid, Benzyl Salicylate, Linalool, Benzyl Alcohol, Tartaric Acid, Mel Extract, Citric Acid, Parfum.",
    "standard",
  );
  assertEq(r.others.state, "na");
});

// Lenient: alcoholes secantes NO están en forbiddenCategories → "na"
test("Lenient: alcohols categoría → na (no es forbidden en lenient)", () => {
  const r = categorySummary("Aqua, Glycerin, Cetearyl Alcohol", "lenient");
  assertEq(r.alcohols.state, "na");
});

// INCI vacía
test("INCI vacía → todo na (incluyendo 'others')", () => {
  const r = categorySummary("", "standard");
  assertEq(r.sulfates.state, "na");
  assertEq(r.silicones.state, "na");
  assertEq(r.others.state, "na");
});

console.log(`\nCategories: ${passed} pasaron, ${failed} fallaron.`);
if (failed > 0) {
  console.log("Fallas:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
}
process.exit(0);
