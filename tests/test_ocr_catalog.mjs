// Test del matching OCR + catálogo INCI + fallback por familia.
// Uso (desde curlycheck/):  node tests/test_ocr_catalog.mjs
// Requiere src/data/inci-names.json (python3 scripts/build-inci-catalog.py).
import { readFileSync } from "fs";
import { correctIngredient, correctInciText } from "../src/fuzzy.js";
import { __setCatalogForTests } from "../src/inci-extended.js";
import { classify, lookupIngredient } from "../src/classifier.js";

const names = JSON.parse(readFileSync(new URL("../src/data/inci-names.json", import.meta.url), "utf8"));
let t0 = performance.now();
__setCatalogForTests(names);
console.log(`Catálogo: ${names.length} nombres, indexado en ${(performance.now() - t0).toFixed(0)} ms`);

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("  ✗", msg); } };

// 1. Ningún INCI válido del catálogo se reescribe.
let rewritten = names.filter((n) => { const r = correctIngredient(n); return r && r.distance > 0; });
console.log(`\n1. INCI válidos reescritos: ${rewritten.length}`);
ok(rewritten.length === 0, "hay INCI válidos reescritos: " + rewritten.slice(0, 5).join(" | "));

// 2. Errores típicos de OCR → corrección esperada (comparación sin mayúsculas).
const OCR_CASES = [
  ["Sodum Lawreth Sulfate", "Sodium Laureth Sulfate"],
  ["Glycerln", "Glycerin"],
  ["Panthenoi", "Panthenol"],
  ["5odium Chloride", "Sodium Chloride"],
  ["Cetearyl Alcohoi", "Cetearyl Alcohol"],
  ["Phenyl Methic0ne", "Phenyl Methicone"],
  ["Magnesiurn Laureth Sulfate", "Magnesium Laureth Sulfate"],
  ["Guar Hydroxypropyltrimonium Chioride", "Guar Hydroxypropyltrimonium Chloride"],
  ["Butyrospermum Parkii Butler", "Butyrospermum Parkii Butter"],
  ["Hydroxyethylcellulos", "Hydroxyethylcellulose"],
];
console.log(`\n2. Correcciones OCR (${OCR_CASES.length} casos)`);
for (const [ocr, want] of OCR_CASES) {
  const r = correctIngredient(ocr);
  const got = r ? r.match : ocr;
  ok(got.toLowerCase() === want.toLowerCase(), `"${ocr}" → "${got}" (esperado "${want}")`);
}

// 3. INCI reales que antes se reescribían mal: ahora quedan intactos.
const KEEP = ["Butyl Salicylate", "Phenyl Methicone", "Isononyl Alcohol", "Benzilic Acid", "Sodium Coceth Sulfate"];
console.log(`\n3. INCI reales que no deben tocarse (${KEEP.length})`);
for (const k of KEEP) { const r = correctIngredient(k); ok(!r || r.distance === 0, `"${k}" → "${r && r.match}"`); }

// 4. Sin regresión de detección: familias prohibidas que antes se "acertaban"
//    por el fuzzy ahora las detecta el clasificador directamente.
const MUST_FLAG = {
  sulfate: ["Ammonium Laureth-12 Sulfate", "Sodium Coceth Sulfate", "Sodium Laneth Sulfate", "TEA-Lauryl Sulfate",
            "TIPA-Laureth Sulfate", "Magnesium Laureth Sulfate", "Sodium C12-13 Pareth Sulfate", "Sodium Coco-Sulfate"],
  silicone_insoluble: ["Cyclotetrasiloxane", "Phenyl Methicone", "Stearyl Methicone", "Propyl Trimethicone",
            "Bis-Aminopropyl Dimethicone", "Trimethylsiloxysilicate", "Divinyldimethicone/Dimethicone Crosspolymer"],
  silicone_soluble: ["PEG-10 Dimethicone", "Bis-PEG/PPG-20/20 Dimethicone"],
  wax: ["Cera Microcristallina"],
};
const MUST_NOT_FLAG = ["Disodium Laureth Sulfosuccinate", "Sodium Lauryl Sulfoacetate", "Behentrimonium Methosulfate",
  "Magnesium Sulfate", "Sodium C14-16 Olefin Sulfonate", "Aminopropyl Triethoxysilane", "Glucopyranosiloxy Propoxy",
  "Polysilicone-29", "Silica", "Acefylline Methylsilanol Mannuronate"];
console.log(`\n4. Detección por familia`);
for (const [catg, list] of Object.entries(MUST_FLAG)) for (const n of list) {
  const ing = lookupIngredient(n); ok(ing && ing.category === catg, `"${n}" → ${ing ? ing.category : "desconocido"} (esperado ${catg})`);
}
for (const n of MUST_NOT_FLAG) {
  const ing = lookupIngredient(n);
  ok(!ing || !["sulfate", "silicone_insoluble"].includes(ing.category),
     `"${n}" no debería ser sulfato/silicona insoluble (dio ${ing && ing.category})`);
}

// 5. Pipeline completo sobre una INCI con ruido de OCR + rendimiento.
const LABEL = "Aqua, Cetearyl Alcohoi, Behentrimonium Chioride, Glycerln, Butyrospermum Parkii Butler, " +
  "Phenyl Methic0ne, Panthenoi, Hydroxyethylcellulos, Guar Hydroxypropyltrimonium Chioride, Parfum, " +
  "Citric Acid, Sodium Benzoate, Potassium Sorbate, Linalool, Butyl Salicylate, Tocopherol, " +
  "Argania Spinosa Kernel Oil, Cocos Nucifera Oil, Hydrolyzed Keratin, Sodium Gluconate, Limonene";
t0 = performance.now();
const { text, changes } = correctInciText(LABEL);
const ms = performance.now() - t0;
const res = classify(text, "standard");
console.log(`\n5. Etiqueta de ${LABEL.split(",").length} ingredientes: ${changes.length} correcciones en ${ms.toFixed(0)} ms → ${res.verdict}`);
for (const c of changes) console.log(`   ${c.from} → ${c.to} (d=${c.distance}, ${c.source})`);
ok(res.verdict === "NO APTO" && res.offenders.some((o) => /methicone/i.test(o.raw)), "debería dar NO APTO por Phenyl Methicone");
ok(ms < 1500, `tardó ${ms.toFixed(0)} ms`);

// 6. Con el catálogo cargado, un prohibido no curado NO puede contar como
//    "INCI conocido neutro" (isKnownInci) y dar APTO falso.
console.log(`\n6. Sin APTO falso por el catálogo extendido`);
for (const inci of [
  "Aqua, Sodium Coceth Sulfate, Cocamidopropyl Betaine, Glycerin, Parfum",
  "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Phenyl Methicone, Glycerin, Parfum",
  "Aqua, Magnesium Laureth Sulfate, Coco-Glucoside, Glycerin",
]) {
  const r = classify(inci, "standard");
  ok(r.verdict === "NO APTO", `"${inci.split(",")[1].trim()}" dio ${r.verdict}`);
}
// Y un neutro exótico del catálogo sigue sumando cobertura sin juicio.
const neutral = classify("Aqua, Ectoin, Glycerin, Bakuchiol", "standard");
ok(neutral.verdict === "APTO" && neutral.unknown.length === 0, `neutros del catálogo: ${neutral.verdict}, unknown=${neutral.unknown}`);

__setCatalogForTests(null);
console.log(fails ? `\n✗ ${fails} fallas` : "\n✓ Todo OK");
process.exit(fails ? 1 : 0);
