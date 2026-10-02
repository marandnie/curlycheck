// Tests del catálogo INCI extendido + integración con classifier.
// Inyectamos el catálogo en memoria con __setCatalogForTests (no toca fetch).

import { classify, VERDICT } from "../src/classifier.js";
import {
  isKnownInci,
  isCatalogReady,
  __setCatalogForTests,
} from "../src/inci-extended.js";

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

// ---------------------------------------------------------------------------
// Comportamiento sin warmear: API no rompe
// ---------------------------------------------------------------------------
__setCatalogForTests(null);

test("isCatalogReady=false antes de warmear", () => {
  assertEq(isCatalogReady(), false);
});

test("isKnownInci devuelve false antes de warmear (no excepción)", () => {
  assertEq(isKnownInci("Ectoin"), false);
});

test("classify funciona sin warmear (back-compat)", () => {
  const r = classify("Aqua, Sodium Lauryl Sulfate, Dimethicone", "standard");
  assertEq(r.verdict, VERDICT.NO_APTO);
  assertEq(r.unknown.length, 0);
});

// ---------------------------------------------------------------------------
// Con catálogo warm
// ---------------------------------------------------------------------------
// Importante: usamos nombres que NO están en `src/ingredients.js` (curado)
// para poder observar el efecto del catálogo extendido. Si usáramos algo como
// "Sodium Hyaluronate" o "Polyquaternium-37", el `substringMatch` del curado
// ya los matchearía y no podríamos distinguir cold vs warm.
__setCatalogForTests([
  "Ectoin",
  "Bakuchiol",
  "Madecassoside",
  "Niacinamide",
  "Allantoin",
  "Dimethicone",
]);

test("isCatalogReady=true tras inyección", () => {
  assertEq(isCatalogReady(), true);
});

test("isKnownInci hit case-insensitive", () => {
  assertEq(isKnownInci("ectoin"), true);
  assertEq(isKnownInci("ECTOIN"), true);
  assertEq(isKnownInci("Bakuchiol"), true);
});

test("isKnownInci miss para ruido OCR", () => {
  assertEq(isKnownInci("Xqzxx Glunk"), false);
  assertEq(isKnownInci(""), false);
});

// ---------------------------------------------------------------------------
// Integración con classify
// ---------------------------------------------------------------------------

test("ingrediente extendido se cuenta como matched, no como unknown", () => {
  const r = classify("Aqua, Ectoin, Bakuchiol, Glycerin", "standard");
  assertEq(r.unknown.length, 0, "ningún token debería quedar unknown");
  assertEq(r.verdict, VERDICT.APTO);
});

test("offenders del curado siguen ganando sobre catálogo extendido", () => {
  const r = classify("Aqua, Dimethicone, Ectoin", "standard");
  assertEq(r.verdict, VERDICT.NO_APTO);
  assertEq(r.offenders.length, 1);
  assertEq(r.offenders[0].matched.name, "Dimethicone");
});

test("ingredientes neutros del catálogo no rompen veredicto APTO", () => {
  const r = classify("Aqua, Ectoin, Madecassoside, Glycerin", "standard");
  assertEq(r.verdict, VERDICT.APTO);
  assertEq(r.unknown.length, 0);
});

test("coverage mejora con catálogo warm", () => {
  __setCatalogForTests(null);
  const cold = classify("Aqua, Ectoin, Bakuchiol", "standard");
  __setCatalogForTests(["Ectoin", "Bakuchiol"]);
  const warm = classify("Aqua, Ectoin, Bakuchiol", "standard");
  if (warm.coverage <= cold.coverage) {
    throw new Error(`coverage no mejoró: cold=${cold.coverage} warm=${warm.coverage}`);
  }
});

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------
console.log();
console.log(`INCI extended: ${passed} pasaron, ${failed} fallaron.`);
if (failures.length) {
  console.log("\nFallas:");
  for (const f of failures) console.log(`  X ${f.name}: ${f.error}`);
  process.exit(1);
}

__setCatalogForTests(null);
