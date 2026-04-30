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

// extraForbidden: Methylparaben en strict
test("Strict: Methylparaben (extraForbidden) marca alguna categoría como present", () => {
  const r = categorySummary("Aqua, Glycerin, Methylparaben, Parfum", "strict");
  // Methylparaben no está en CATEGORY_GROUPS — debería caer en sulfates por defecto
  // Lo único que importa: que ALGUNA categoría haya quedado present
  const anyPresent = ["sulfates", "silicones", "alcohols", "minerals"]
    .some((k) => r[k].state === "present");
  if (!anyPresent) throw new Error("Methylparaben en strict no marcó nada como present");
});

// Lenient: alcoholes secantes NO están en forbiddenCategories → "na"
test("Lenient: alcohols categoría → na (no es forbidden en lenient)", () => {
  const r = categorySummary("Aqua, Glycerin, Cetearyl Alcohol", "lenient");
  assertEq(r.alcohols.state, "na");
});

// INCI vacía
test("INCI vacía → todo na", () => {
  const r = categorySummary("", "standard");
  assertEq(r.sulfates.state, "na");
  assertEq(r.silicones.state, "na");
});

console.log(`\nCategories: ${passed} pasaron, ${failed} fallaron.`);
if (failed > 0) {
  console.log("Fallas:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
}
process.exit(0);
