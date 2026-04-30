// Tests del corrector fuzzy contra el catálogo INCI.
// Simula errores típicos de OCR y verifica que se corrijan al canónico.

import { levenshtein, correctIngredient, correctInciText } from "../src/fuzzy.js";

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

// Levenshtein básicos
test("lev: igual = 0", () => assertEq(levenshtein("hola", "hola"), 0));
test("lev: una sustitución = 1", () => assertEq(levenshtein("hola", "hila"), 1));
test("lev: dos sustituciones = 2", () => assertEq(levenshtein("hola", "hela"), 1));
test("lev: vacío vs algo", () => assertEq(levenshtein("", "abc"), 3));

// Casos típicos de OCR
test("corrige 'Sodum Lawreth Sulfate' → 'Sodium Laureth Sulfate'", () => {
  const r = correctIngredient("Sodum Lawreth Sulfate");
  assertEq(r?.match, "Sodium Laureth Sulfate");
});

test("corrige 'Dimethlcone' → 'Dimethicone' (1 sub)", () => {
  const r = correctIngredient("Dimethlcone");
  assertEq(r?.match, "Dimethicone");
});

test("corrige 'Cetearyl Alchol' → 'Cetearyl Alcohol' (1 borrado)", () => {
  const r = correctIngredient("Cetearyl Alchol");
  assertEq(r?.match, "Cetearyl Alcohol");
});

test("preserva token exacto: 'Glycerin'", () => {
  const r = correctIngredient("Glycerin");
  assertEq(r?.match, "Glycerin");
  assertEq(r?.distance, 0);
});

test("no corrige string corto sin match (3 letras)", () => {
  const r = correctIngredient("xyz");
  assertEq(r, null);
});

test("no corrige string totalmente desconocido largo", () => {
  const r = correctIngredient("LoremIpsumDolorSitAmet");
  assertEq(r, null);
});

// Texto completo
test("correctInciText corrige varios y preserva los buenos", () => {
  const inci = "Aqua, Sodum Lawreth Sulfate, Dimethlcone, Glycerin, Parfum";
  const { text, changes } = correctInciText(inci);
  if (!text.includes("Sodium Laureth Sulfate")) throw new Error("no corrigió SLS: " + text);
  if (!text.includes("Dimethicone")) throw new Error("no corrigió Dimethicone: " + text);
  if (!text.includes("Glycerin")) throw new Error("rompió Glycerin: " + text);
  assertEq(changes.length >= 2, true, "debería reportar 2+ cambios");
});

console.log(`\nFuzzy: ${passed} pasaron, ${failed} fallaron.`);
if (failed > 0) {
  console.log("Fallas:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
}
process.exit(0);
