// Tests del clasificador JS contra el mismo golden set que la versión Python.
// Corré con: node tests/test_classifier.mjs
//
// Si todos los tests pasan acá Y en pytest, tenés paridad de comportamiento.

import { classify, parseInci, lookupIngredient } from "../src/classifier.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ""} — esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
  }
}

const GOLDEN = [
  ["Curl Manifesto - Bain Hydratation Douceur",
    "Aqua/Water, Sodium Cocoyl Isethionate, Disodium Laureth Sulfosuccinate, Sodium Lauryl Sulfoacetate, Sodium Lauroyl Sarcosinate, Glycol Distearate, Cocamidopropyl Betaine, Glycereth-26, Decyl Glucoside, Coconut Acid, Sodium Isethionate, Citric Acid, PPG-5-Ceteth-20, Sodium Hydroxide, Divinyldimethicone/Dimethicone Copolymer, Sodium Benzoate, PEG-55 Propylene Glycol Oleate, Propylene Glycol, Polyquaternium-7, Sodium Chloride, Amodimethicone, Coco-Betaine, Polyquaternium-10, Salicylic Acid, Carbomer, Benzyl Salicylate, C11-15 Pareth-7, Glycerin, Benzoic Acid, Linalool, Benzyl Alcohol, Laureth-9, Trideceth-12, C12-13 Pareth-23, C12-13 Pareth-3, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Parfum.",
    "NO APTO"],
  ["Curl Manifesto - Refresh Absolu",
    "Aqua/Water, Cocos Nucifera Oil, Amodimethicone, Polyquaternium-37, Phenoxyethanol, Propylene Glycol Dicaprylate/Dicaprate, Sodium Hydroxide, Dimethicone PEG-7 Phosphate, PPG-1 Trideceth-6, Benzyl Salicylate, Trideceth-6, Linalool, Citronellol, Limonene, Parfum.",
    "NO APTO"],
  ["Curl Manifesto - Crème de Jour Fondamentale",
    "Aqua/Water, Glycerin, Cetearyl Alcohol, Helianthus Annuus Seed Oil, Hydroxypropyl Guar, Stearamidopropyl Dimethylamine, Cetyl Esters, Caprylyl Glycol, Glyceryl Stearate, Salicylic Acid, Benzyl Salicylate, Linalool, Benzyl Alcohol, Tartaric Acid, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Citric Acid, Parfum.",
    "APTO"],
  ["Curl Manifesto - Gelée Curl Contour",
    "Aqua/Water, Cetearyl Alcohol, Glycerin, Isopropyl Myristate, Hydroxypropyl Guar, Bis-Diglyceryl Polyacyladipate-2, Cetearyl Glucoside, Sodium Benzoate, Cocos Nucifera Oil, Caprylyl Glycol, Butyrospermum Parkii Butter, Sclerotium Gum, Benzyl Salicylate, Citric Acid, Linalool, Benzyl Alcohol, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Parfum.",
    "APTO"],
  ["Curl Manifesto - Masque Beurre Haute Nutrition",
    "Aqua/Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Cetyl Esters, Potato Starch Modified, Parfum, Isopropyl Alcohol, Phenoxyethanol, Methylparaben, Benzyl Salicylate, Mica, Linalool, Trideceth-6, Benzyl Alcohol, Mel Extract, CI 77891, Titanium Dioxide, Chlorhexidine Dihydrochloride, Cetrimonium Chloride, 2-Oleamido-1,3-Octadecanediol.",
    "NO APTO"],
  ["Curl Manifesto - Fondant Hydratation Essentielle",
    "Aqua/Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Cetyl Esters, Potato Starch Modified, Isopropyl Alcohol, Shorea Robusta Seed Butter, Phenoxyethanol, Benzyl Salicylate, Trideceth-6, Linalool, Benzyl Alcohol, Candelilla Cera, Chlorhexidine Digluconate, Cetrimonium Chloride, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Sodium Hydroxide, Pentaerythrityl Tetra-Di-T-Butyl Hydroxyhydrocinnamate, Citric Acid, Parfum.",
    "NO APTO"],
  ["Curl Manifesto - Huile Sublime Repair",
    "Helianthus Annuus Seed Oil, Isopropyl Myristate, Olea Europaea Fruit Oil, Octyldodecanol, Simmondsia Chinensis Seed Oil, Cocos Nucifera Oil, Parfum, Benzyl Salicylate, Linalool, Benzyl Alcohol, Glycerin, Tocopherol, Aqua, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Glycine Soja Oil, Citric Acid.",
    "APTO"],
  ["Gloss Absolu - Bain Crème Hydra-Glaze",
    "Aqua/Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Sodium Chloride, Dimethicone, Glycolic Acid, Sodium Hyaluronate, Rosa Canina Flower Extract, Glycol Distearate, Sodium Benzoate, Hexylene Glycol, Citric Acid, Sodium Hydroxide, Carbomer, Guar Hydroxypropyltrimonium Chloride, Salicylic Acid, Linalool, Limonene, Benzyl Alcohol, Benzyl Salicylate, Citronellol, Coumarin, Parfum.",
    "NO APTO"],
  ["Gloss Absolu - Insta-Glaze Conditioner",
    "Aqua/Water, Cetearyl Alcohol, Cocamidopropyl Betaine, Behentrimonium Chloride, Amodimethicone, Propylene Glycol, Parfum, Isopropyl Alcohol, Sodium Chloride, Phenoxyethanol, Hydroxypropyl Guar, Ethanolamine, Polyquaternium-37, Limonene, Caprylyl Glycol, Propylene Glycol Dicaprylate/Dicaprate, Cocos Nucifera Oil, Trideceth-6, PPG-1 Trideceth-6, Linalool, Citronellol, Cetrimonium Chloride, Acrylates/Stearyl Methacrylate Copolymer, Sorbitan Oleate, Sodium Hyaluronate, Caprylic/Capric Triglyceride, Lactic Acid, Hexyl Cinnamal, Alpha-Isomethyl Ionone, Glycolic Acid, Citric Acid, Tetrasodium EDTA, Rosa Canina Flower Extract.",
    "NO APTO"],
  ["Gloss Absolu - Glaze Drops",
    "Isododecane, Dimethicone, C11-13 Isoalkane, Caprylic/Capric Triglyceride, Dimethiconol, Amodimethicone, Parfum, Limonene, Hexyl Cinnamal, Linalool, Citronellol, Alpha-Isomethyl Ionone, Coumarin, Citral, Rosa Canina Flower Extract.",
    "NO APTO"],
  ["Gloss Absolu - Glaze Milk",
    "Aqua/Water, Cocos Nucifera Oil, Amodimethicone, Polyquaternium-37, Phenoxyethanol, Propylene Glycol Dicaprylate/Dicaprate, Sodium Hydroxide, Limonene, Dimethicone PEG-7 Phosphate, PPG-1 Trideceth-6, Trideceth-6, Linalool, Citronellol, Hexyl Cinnamal, Parfum.",
    "NO APTO"],
  ["L'Oréal AR Molecular - Pre-treatment",
    "Aqua/Water, Aminopropyl Triethoxysilane, Citric Acid, PEG-40 Hydrogenated Castor Oil, Glycine, Polyquaternium-6, Phenoxyethanol, Glutamic Acid, Arginine, Serine, Chlorhexidine Digluconate, Tyrosine, Tetrasodium EDTA.",
    "APTO"],
  ["L'Oréal AR Molecular - Shampoo 300ml",
    "Aqua/Water, Sodium Cocoyl Isethionate, Disodium Laureth Sulfosuccinate, Glycol Distearate, Sodium Lauryl Sulfoacetate, Sodium Lauroyl Sarcosinate, Glycerin, Parfum, Decyl Glucoside, Cocamidopropyl Betaine, PPG-5-Ceteth-20, Coco-Betaine, Divinyldimethicone/Dimethicone Copolymer, Amodimethicone, Citric Acid, Sodium Hydroxide, Polyquaternium-7, Polyquaternium-10, Carbomer, Sodium Benzoate, Sodium Chloride, PEG-55 Propylene Glycol Oleate, Propylene Glycol, Arginine, Salicylic Acid, Benzoic Acid, Polysorbate 21, Trideceth-6, Linalool, C12-13 Alketh-23, C12-13 Alketh-3, Glycine, Serine, Tyrosine, Cetrimonium Chloride, Glutamic Acid, Phenoxyethanol.",
    "NO APTO"],
  ["L'Oréal AR Molecular - Rinse-off Serum",
    "Aqua/Water, Glycerin, Propylene Glycol, Glycine, Citric Acid, Parfum, PEG-40 Hydrogenated Castor Oil, Hydroxypropyltrimonium Hydrolyzed Wheat Protein, Cetrimonium Chloride, Polysorbate 20, Polysorbate 80, Phenoxyethanol, Sodium Hydroxide, Glutamic Acid, Quaternium-80, Arginine, Hydroxypropyl Guar, Hydroxypropyl Guar Hydroxypropyltrimonium Chloride, Serine, Linalool, Tyrosine.",
    "APTO"],
  ["L'Oréal AR Molecular - Mask",
    "Aqua/Water, Glycerin, Cetearyl Alcohol, Distarch Phosphate, Quaternium-87, Dimethicone, Behentrimonium Chloride, Propylene Glycol, Phenoxyethanol, PEG-150/Decyl Alcohol, SMDI Copolymer, Amodimethicone, Isopropyl Alcohol, Trideceth-10.",
    "NO APTO"],
  ["L'Oréal AR Molecular - Leave-in Mask",
    "Aqua/Water, Isopropyl Myristate, Dimethicone, Amodimethicone, Triethanolamine, Phenoxyethanol, Carbomer, Polyquaternium-4, Potato Starch Modified, Hydroxypropyl Guar, Behentrimonium Chloride, Arginine, Trideceth-6, Isopropyl Alcohol, Cetrimonium Chloride, Linalool, Glycine, Serine, Tyrosine, Citric Acid, Glutamic Acid, Coumarin, Benzyl Alcohol, Benzyl Benzoate, Alpha-Isomethyl Ionone, Parfum.",
    "NO APTO"],
  ["L'Oréal AR Molecular - Oil",
    "Dimethicone, C12-15 Alkyl Benzoate, Isopropyl Myristate, Hydrolyzed Wheat Protein, Parfum, Linalool, Citronellol, Hexyl Cinnamal, Benzyl Salicylate, Alpha-Isomethyl Ionone, Benzyl Benzoate.",
    "NO APTO"],
  ["Framesi Morphosis Restructure Shampoo",
    "Aqua, Sodium C14-C16 Olefin Sulfonate, Glycerin, Disodium Laureth Sulfosuccinate, Coco-Betaine, Oryza Sativa Extract, Saccharomyces Ferment Lysate Filtrate, Sodium Hyaluronate, Tocopherol Acetate, Hydrolyzed Vegetable Protein, Bacillus/Soybean Ferment Extract, Palmitamidopropyltrimonium Chloride, Sodium Cocoamphoacetate, Parfum, Cocoamidopropyl Betaine, Guar Hydroxypropyltrimonium Chloride, Coco-Glucoside, Glyceryl Oleate, Propylene Glycol, Butylene Glycol, Pentylene Glycol, Citric Acid, Sodium Benzoate, Potassium Sorbate, Hexyl Cinnamal, Limonene, Benzyl Salicylate, Linalool, Citronellol, Geraniol.",
    "APTO"],
];

// Golden set bajo el ruleset estándar
for (const [name, inci, expected] of GOLDEN) {
  test(`golden:${name}`, () => {
    const r = classify(inci, "standard");
    assertEq(r.verdict, expected, `${name}`);
  });
}

test("strict rejects Olefin Sulfonate", () => {
  const inci = "Aqua, Sodium C14-C16 Olefin Sulfonate, Glycerin";
  const r = classify(inci, "strict");
  assertEq(r.verdict, "NO APTO");
});

test("lenient accepts Dimethicone", () => {
  const r = classify("Aqua, Dimethicone, Cetearyl Alcohol, Glycerin, Phenoxyethanol, Parfum", "lenient");
  assertEq(r.verdict, "APTO");
});

test("empty input → VERIFICAR", () => {
  const r = classify("");
  assertEq(r.verdict, "VERIFICAR");
});

test("garbage input → VERIFICAR", () => {
  const r = classify("xyz123, foobar, lorem ipsum dolor sit amet, consectetur adipiscing");
  assertEq(r.verdict, "VERIFICAR");
});


// ---------------------------------------------------------------------------
// Tests específicos de parser y aliases (bugs reportados por usuarias)
// ---------------------------------------------------------------------------

test("parser: 2-Oleamido-1,3-Octadecanediol queda como UN solo token", () => {
  const tokens = parseInci("Aqua, 2-Oleamido-1,3-Octadecanediol, Parfum");
  if (tokens.length !== 3) {
    throw new Error("esperaba 3 tokens, obtuve " + tokens.length + ": " + JSON.stringify(tokens));
  }
  assertEq(tokens[1], "2-Oleamido-1,3-Octadecanediol");
});

test("parser: locantes numéricos no se separan (Acrylates/C10-30)", () => {
  const tokens = parseInci("Aqua, Glycerin, 1,2-Hexanediol, Parfum");
  assertEq(tokens.length, 4);
  assertEq(tokens[2], "1,2-Hexanediol");
});

test("alias: Olive Fruit Oil → Olea Europaea Fruit Oil", () => {
  const ing = lookupIngredient("Olive Fruit Oil");
  if (!ing) throw new Error("no se reconoció Olive Fruit Oil");
  assertEq(ing.name, "Olea Europaea Fruit Oil");
});

test("alias: Jojoba Seed Oil → Simmondsia Chinensis Seed Oil", () => {
  const ing = lookupIngredient("Jojoba Seed Oil");
  if (!ing) throw new Error("no se reconoció Jojoba Seed Oil");
  assertEq(ing.name, "Simmondsia Chinensis Seed Oil");
});

// Regresión: el flujo OCR aplica `correctInciText` antes de `classify`.
// Antes, el split naïve por coma de fuzzy partía "2-Oleamido-1,3-Octadecanediol"
// en dos tokens desconocidos y el ratio de unknowns podía cruzar el umbral
// y forzar VERIFICAR aún cuando el producto es APTO.
test("flujo OCR + fuzzy: locantes numéricos no se rompen tras corrección", async () => {
  const { correctInciText } = await import("../src/fuzzy.js");
  const orig = "Aqua/Water, Cetearyl Alcohol, Helianthus Annuus Seed Oil, Glycerin, " +
               "Hydroxypropyl Guar, Stearamidopropyl Dimethylamine, Cetyl Esters, " +
               "Caprylyl Glycol, Glyceryl Stearate, Salicylic Acid, Benzyl Salicylate, " +
               "Linalool, Benzyl Alcohol, Tartaric Acid, Mel Extract, " +
               "2-Oleamido-1,3-Octadecanediol, Citric Acid, Parfum";
  const corrected = correctInciText(orig).text;
  const r = classify(corrected, "standard");
  assertEq(r.verdict, "APTO", "post-fuzzy debe seguir APTO");
  if (r.unknown.length > 0) {
    throw new Error("post-fuzzy hay tokens unknown: " + JSON.stringify(r.unknown));
  }
});

test("clasificar INCI con 2-Oleamido-1,3-Octadecanediol no rompe", () => {
  // Este string es similar al que reportó Marina con Huile Sublime Repair
  const inci = "Helianthus Annuus Seed Oil, Olive Fruit Oil, Jojoba Seed Oil, " +
               "Glycerin, 2-Oleamido-1,3-Octadecanediol, Parfum";
  const r = classify(inci, "standard");
  assertEq(r.verdict, "APTO");
  // Y los 6 ingredientes deben estar reconocidos (0 unknown)
  if (r.unknown.length > 0) {
    throw new Error("ingredientes no reconocidos: " + JSON.stringify(r.unknown));
  }
});

// ---------------------------------------------------------------------------
// Tests del substring fallback de lookupIngredient (bug 2026-05-06)
// ---------------------------------------------------------------------------
// Antes: el fallback `key.length >= 6 && norm.includes(key)` matcheaba
// cualquier key del catálogo como sub-string, lo cual permitía que
// "Methyl Alcohol Foobar" se clasificara como DRYING_ALCOHOL ("alcohol"
// como substring central). Después: keys multi-palabra usan substring
// estándar; keys de UNA sola palabra sólo machean si son la primera o
// última palabra del token.

test("substring: 'Methyl Alcohol Foobar' NO matchea como Alcohol/DRYING (bug)", () => {
  const ing = lookupIngredient("Methyl Alcohol Foobar");
  if (ing && ing.name === "Alcohol") {
    throw new Error("falso positivo: 'Methyl Alcohol Foobar' → Alcohol/DRYING_ALCOHOL");
  }
});

test("substring: 'Foobar Petrolatum Bazlandia' NO matchea (key en medio)", () => {
  const ing = lookupIngredient("Foobar Petrolatum Bazlandia");
  if (ing && ing.name === "Petrolatum") {
    throw new Error("falso positivo: petrolatum como substring central no debe matchear");
  }
});

test("substring: 'Argania Spinosa Kernel Oil Bio' SÍ matchea (multi-palabra)", () => {
  const ing = lookupIngredient("Argania Spinosa Kernel Oil Bio");
  if (!ing) throw new Error("debería matchear Argania Spinosa Kernel Oil");
  assertEq(ing.name, "Argania Spinosa Kernel Oil");
});

test("substring: 'Dimethicone Crosspolymer' SÍ matchea (single-word al inicio)", () => {
  const ing = lookupIngredient("Dimethicone Crosspolymer");
  if (!ing) throw new Error("debería matchear Dimethicone como primera palabra");
  assertEq(ing.name, "Dimethicone");
});

test("substring: 'Pure Petrolatum' SÍ matchea (single-word al final)", () => {
  const ing = lookupIngredient("Pure Petrolatum");
  if (!ing) throw new Error("debería matchear Petrolatum como última palabra");
  assertEq(ing.name, "Petrolatum");
});

test("classify regresión: INCI con 'Cetearyl Alcohol Stearate' no se marca NO APTO por substring espurio", () => {
  // Antes del fix: 'Alcohol' (DRYING) matcheaba como substring → NO APTO
  // Después: 'Cetearyl Alcohol' (multi-word, FATTY_ALCOHOL) sigue matcheando → APTO
  const r = classify("Aqua, Glycerin, Cetearyl Alcohol Stearate, Parfum", "standard");
  assertEq(r.verdict, "APTO", "no debe ser NO APTO por substring espurio");
});


// ---------------------------------------------------------------------------
// Tests para stripping de marcadores de anotación (bug 2026-05-08)
// ---------------------------------------------------------------------------
// Las INCI naturales/orgánicas suelen llevar asteriscos, dagas, superíndices,
// porcentajes o corchetes pegados al nombre del ingrediente. Si no se
// limpian, el lookup falla y `unknownRatio` puede cruzar el umbral (15% en
// estándar) forzando VERIFICAR aún cuando el producto debería ser APTO.

test("anotación: 'Aqua*' → 'Aqua' (asterisco orgánico)", () => {
  const tokens = parseInci("Aqua*, Glycerin*, Parfum*");
  assertEq(tokens.length, 3);
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
  assertEq(tokens[2], "Parfum");
});

test("anotación: dobles asteriscos 'Glycerin**'", () => {
  const tokens = parseInci("Aqua, Glycerin**, Parfum");
  assertEq(tokens[1], "Glycerin");
});

test("anotación: dagas † y ‡ se strippean", () => {
  const tokens = parseInci("Aqua†, Glycerin‡, Parfum");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
});

test("anotación: superíndices ¹ ² ³ se strippean", () => {
  const tokens = parseInci("Aqua¹, Glycerin², Parfum³");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
  assertEq(tokens[2], "Parfum");
});

test("anotación: grado ° y caret ^ se strippean", () => {
  const tokens = parseInci("Aqua°, Glycerin^, Parfum");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
});

test("anotación: corchetes envolventes [Aqua] → Aqua", () => {
  const tokens = parseInci("[Aqua], [Glycerin*], Parfum");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
});

test("anotación: viñetas/dashes iniciales se strippean", () => {
  const tokens = parseInci("• Aqua, – Glycerin, — Parfum");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
  assertEq(tokens[2], "Parfum");
});

test("anotación: porcentajes finales 'Aqua 70%'", () => {
  const tokens = parseInci("Aqua 70%, Glycerin 5%, Parfum 0.1%");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
  assertEq(tokens[2], "Parfum");
});

test("anotación: porcentaje con coma decimal 'Aqua 0,1%'", () => {
  const tokens = parseInci("Aqua 0,1%, Glycerin");
  assertEq(tokens[0], "Aqua");
  assertEq(tokens[1], "Glycerin");
});

test("anotación combinada: 'Aqua* 70%' → 'Aqua'", () => {
  const tokens = parseInci("Aqua* 70%, Glycerin");
  assertEq(tokens[0], "Aqua");
});

test("anotación NO rompe locantes numéricos", () => {
  // El stripping no debe tocar las comas internas protegidas
  const tokens = parseInci("Aqua, 2-Oleamido-1,3-Octadecanediol, 1,2-Hexanediol");
  assertEq(tokens.length, 3);
  assertEq(tokens[1], "2-Oleamido-1,3-Octadecanediol");
  assertEq(tokens[2], "1,2-Hexanediol");
});

test("anotación NO rompe nombres químicos con guiones (PEG-7, C12-15)", () => {
  // Los guiones internos / al final del prefijo no deben confundirse con
  // bullets de lista. PEG-7 debe seguir siendo PEG-7.
  const tokens = parseInci("PEG-7, Dimethicone PEG-7 Phosphate, C12-15 Alkyl Benzoate");
  assertEq(tokens[0], "PEG-7");
  assertEq(tokens[1], "Dimethicone PEG-7 Phosphate");
  assertEq(tokens[2], "C12-15 Alkyl Benzoate");
});

// Regresión integral: una INCI 100% orgánica (todos los ingredientes con `*`)
// antes producía 4/4 unknowns → VERIFICAR. Ahora debe matchear todos los
// ingredientes y dar veredicto correcto según el ruleset.
test("regresión: INCI orgánica 100% asteriscos → APTO con 0 unknowns", () => {
  const inci = "Aqua*, Sodium Cocoyl Isethionate*, Glycerin*, Cetearyl Alcohol*, Parfum*";
  const r = classify(inci, "standard");
  assertEq(r.verdict, "APTO", "INCI orgánica con asteriscos debe ser APTO");
  if (r.unknown.length > 0) {
    throw new Error("aún hay unknowns post-strip: " + JSON.stringify(r.unknown));
  }
});

test("regresión: INCI orgánica con sulfato sigue NO APTO", () => {
  // El stripping no debe ocultar ofensores reales: si un ingrediente
  // prohibido lleva asterisco, sigue siendo prohibido.
  const inci = "Aqua*, Sodium Lauryl Sulfate*, Glycerin*";
  const r = classify(inci, "standard");
  assertEq(r.verdict, "NO APTO", "sulfato con asterisco sigue siendo sulfato");
});

test("idempotencia: parseInci(parseInci(x)) ≡ parseInci(x)", () => {
  // Si el stripping no es idempotente puede haber loops o residuos.
  const original = "Aqua* 70%, Glycerin **, [Parfum]";
  const once = parseInci(original);
  const twice = parseInci(once.join(", "));
  if (JSON.stringify(once) !== JSON.stringify(twice)) {
    throw new Error("no idempotente: once=" + JSON.stringify(once) + " twice=" + JSON.stringify(twice));
  }
});
console.log("\nTotal: " + passed + " pasaron, " + failed + " fallaron.");
if (failed > 0) {
  console.log("Fallas:");
  failures.forEach((f) => console.log("  ✗ " + f.name + ": " + f.error));
  process.exit(1);
}
process.exit(0);
