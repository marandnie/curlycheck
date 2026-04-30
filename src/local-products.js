// Base local de productos curados.
//
// Dos índices:
//   - LOCAL_PRODUCTS         : por barcode (rápido O(1))
//   - LOCAL_PRODUCTS_BY_NAME : array de productos sin barcode (búsqueda por nombre)
//
// Flujo en la app:
//   1. Si la cámara lee un barcode → lookupLocal(barcode) → devuelve el producto si está.
//   2. Si la usuaria busca por nombre → searchLocalByName(query) → devuelve hits.
//   3. Para los productos que la usuaria escanee y descubra el barcode real, conviene
//      moverlos a LOCAL_PRODUCTS (por barcode) o sumarlos a OBF para que toda la
//      comunidad los aproveche.
//
// Las 17 INCIs sembradas vienen del golden set del Excel (productos que ya
// validamos manualmente y que tienen veredicto conocido).

// ---------------------------------------------------------------------------
// Productos con barcode confirmado
// ---------------------------------------------------------------------------
export const LOCAL_PRODUCTS = {
  // Kérastase — Gloss Absolu Masque Crème Hydra Glaze (200 ml, barcode confirmado por Marina)
  // INCI todavía no cargado — sacarle foto al envase y pegarla acá.
  "3474637303365": {
    name: "Gloss Absolu Masque Crème Hydra Glaze",
    brand: "Kérastase",
    inci: "",
  },
};

// ---------------------------------------------------------------------------
// Productos sin barcode — búsqueda por nombre
// ---------------------------------------------------------------------------
export const LOCAL_PRODUCTS_BY_NAME = [
  // === Kérastase Curl Manifesto ===
  {
    name: "Curl Manifesto Bain Hydratation Douceur",
    brand: "Kérastase",
    inci: "Aqua/Water, Sodium Cocoyl Isethionate, Disodium Laureth Sulfosuccinate, Sodium Lauryl Sulfoacetate, Sodium Lauroyl Sarcosinate, Glycol Distearate, Cocamidopropyl Betaine, Glycereth-26, Decyl Glucoside, Coconut Acid, Sodium Isethionate, Citric Acid, PPG-5-Ceteth-20, Sodium Hydroxide, Divinyldimethicone/Dimethicone Copolymer, Sodium Benzoate, PEG-55 Propylene Glycol Oleate, Propylene Glycol, Polyquaternium-7, Sodium Chloride, Amodimethicone, Coco-Betaine, Polyquaternium-10, Salicylic Acid, Carbomer, Benzyl Salicylate, C11-15 Pareth-7, Glycerin, Benzoic Acid, Linalool, Benzyl Alcohol, Laureth-9, Trideceth-12, C12-13 Pareth-23, C12-13 Pareth-3, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Parfum.",
  },
  {
    name: "Curl Manifesto Refresh Absolu",
    brand: "Kérastase",
    inci: "Aqua/Water, Cocos Nucifera Oil, Amodimethicone, Polyquaternium-37, Phenoxyethanol, Propylene Glycol Dicaprylate/Dicaprate, Sodium Hydroxide, Dimethicone PEG-7 Phosphate, PPG-1 Trideceth-6, Benzyl Salicylate, Trideceth-6, Linalool, Citronellol, Limonene, Parfum.",
  },
  {
    name: "Curl Manifesto Crème de Jour Fondamentale",
    brand: "Kérastase",
    inci: "Aqua/Water, Glycerin, Cetearyl Alcohol, Helianthus Annuus Seed Oil, Hydroxypropyl Guar, Stearamidopropyl Dimethylamine, Cetyl Esters, Caprylyl Glycol, Glyceryl Stearate, Salicylic Acid, Benzyl Salicylate, Linalool, Benzyl Alcohol, Tartaric Acid, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Citric Acid, Parfum.",
  },
  {
    name: "Curl Manifesto Gelée Curl Contour",
    brand: "Kérastase",
    inci: "Aqua/Water, Cetearyl Alcohol, Glycerin, Isopropyl Myristate, Hydroxypropyl Guar, Bis-Diglyceryl Polyacyladipate-2, Cetearyl Glucoside, Sodium Benzoate, Cocos Nucifera Oil, Caprylyl Glycol, Butyrospermum Parkii Butter, Sclerotium Gum, Benzyl Salicylate, Citric Acid, Linalool, Benzyl Alcohol, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Parfum.",
  },
  {
    name: "Curl Manifesto Masque Beurre Haute Nutrition",
    brand: "Kérastase",
    inci: "Aqua/Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Cetyl Esters, Potato Starch Modified, Parfum, Isopropyl Alcohol, Phenoxyethanol, Methylparaben, Benzyl Salicylate, Mica, Linalool, Trideceth-6, Benzyl Alcohol, Mel Extract, CI 77891, Titanium Dioxide, Chlorhexidine Dihydrochloride, Cetrimonium Chloride, 2-Oleamido-1,3-Octadecanediol.",
  },
  {
    name: "Curl Manifesto Fondant Hydratation Essentielle",
    brand: "Kérastase",
    inci: "Aqua/Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Cetyl Esters, Potato Starch Modified, Isopropyl Alcohol, Shorea Robusta Seed Butter, Phenoxyethanol, Benzyl Salicylate, Trideceth-6, Linalool, Benzyl Alcohol, Candelilla Cera, Chlorhexidine Digluconate, Cetrimonium Chloride, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Sodium Hydroxide, Pentaerythrityl Tetra-Di-T-Butyl Hydroxyhydrocinnamate, Citric Acid, Parfum.",
  },
  {
    name: "Curl Manifesto Huile Sublime Repair",
    brand: "Kérastase",
    inci: "Helianthus Annuus Seed Oil, Isopropyl Myristate, Olea Europaea Fruit Oil, Octyldodecanol, Simmondsia Chinensis Seed Oil, Cocos Nucifera Oil, Parfum, Benzyl Salicylate, Linalool, Benzyl Alcohol, Glycerin, Tocopherol, Aqua, Mel Extract, 2-Oleamido-1,3-Octadecanediol, Glycine Soja Oil, Citric Acid.",
  },
  // === Kérastase Gloss Absolu ===
  {
    name: "Gloss Absolu Bain Crème Hydra-Glaze",
    brand: "Kérastase",
    inci: "Aqua/Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Sodium Chloride, Dimethicone, Glycolic Acid, Sodium Hyaluronate, Rosa Canina Flower Extract, Glycol Distearate, Sodium Benzoate, Hexylene Glycol, Citric Acid, Sodium Hydroxide, Carbomer, Guar Hydroxypropyltrimonium Chloride, Salicylic Acid, Linalool, Limonene, Benzyl Alcohol, Benzyl Salicylate, Citronellol, Coumarin, Parfum.",
  },
  {
    name: "Gloss Absolu Insta-Glaze Conditioner",
    brand: "Kérastase",
    inci: "Aqua/Water, Cetearyl Alcohol, Cocamidopropyl Betaine, Behentrimonium Chloride, Amodimethicone, Propylene Glycol, Parfum, Isopropyl Alcohol, Sodium Chloride, Phenoxyethanol, Hydroxypropyl Guar, Ethanolamine, Polyquaternium-37, Limonene, Caprylyl Glycol, Propylene Glycol Dicaprylate/Dicaprate, Cocos Nucifera Oil, Trideceth-6, PPG-1 Trideceth-6, Linalool, Citronellol, Cetrimonium Chloride, Acrylates/Stearyl Methacrylate Copolymer, Sorbitan Oleate, Sodium Hyaluronate, Caprylic/Capric Triglyceride, Lactic Acid, Hexyl Cinnamal, Alpha-Isomethyl Ionone, Glycolic Acid, Citric Acid, Tetrasodium EDTA, Rosa Canina Flower Extract.",
  },
  {
    name: "Gloss Absolu Glaze Drops",
    brand: "Kérastase",
    inci: "Isododecane, Dimethicone, C11-13 Isoalkane, Caprylic/Capric Triglyceride, Dimethiconol, Amodimethicone, Parfum, Limonene, Hexyl Cinnamal, Linalool, Citronellol, Alpha-Isomethyl Ionone, Coumarin, Citral, Rosa Canina Flower Extract.",
  },
  {
    name: "Gloss Absolu Anti-Frizz Glaze Milk",
    brand: "Kérastase",
    inci: "Aqua/Water, Cocos Nucifera Oil, Amodimethicone, Polyquaternium-37, Phenoxyethanol, Propylene Glycol Dicaprylate/Dicaprate, Sodium Hydroxide, Limonene, Dimethicone PEG-7 Phosphate, PPG-1 Trideceth-6, Trideceth-6, Linalool, Citronellol, Hexyl Cinnamal, Parfum.",
  },
  // === L'Oréal Professionnel Absolut Repair Molecular ===
  {
    name: "Absolut Repair Molecular Pre-treatment",
    brand: "L'Oréal Professionnel",
    inci: "Aqua/Water, Aminopropyl Triethoxysilane, Citric Acid, PEG-40 Hydrogenated Castor Oil, Glycine, Polyquaternium-6, Phenoxyethanol, Glutamic Acid, Arginine, Serine, Chlorhexidine Digluconate, Tyrosine, Tetrasodium EDTA.",
  },
  {
    name: "Absolut Repair Molecular Shampoo 300ml",
    brand: "L'Oréal Professionnel",
    inci: "Aqua/Water, Sodium Cocoyl Isethionate, Disodium Laureth Sulfosuccinate, Glycol Distearate, Sodium Lauryl Sulfoacetate, Sodium Lauroyl Sarcosinate, Glycerin, Parfum, Decyl Glucoside, Cocamidopropyl Betaine, PPG-5-Ceteth-20, Coco-Betaine, Divinyldimethicone/Dimethicone Copolymer, Amodimethicone, Citric Acid, Sodium Hydroxide, Polyquaternium-7, Polyquaternium-10, Carbomer, Sodium Benzoate, Sodium Chloride, PEG-55 Propylene Glycol Oleate, Propylene Glycol, Arginine, Salicylic Acid, Benzoic Acid, Polysorbate 21, Trideceth-6, Linalool, C12-13 Alketh-23, C12-13 Alketh-3, Glycine, Serine, Tyrosine, Cetrimonium Chloride, Glutamic Acid, Phenoxyethanol.",
  },
  {
    name: "Absolut Repair Molecular Rinse-off Serum",
    brand: "L'Oréal Professionnel",
    inci: "Aqua/Water, Glycerin, Propylene Glycol, Glycine, Citric Acid, Parfum, PEG-40 Hydrogenated Castor Oil, Hydroxypropyltrimonium Hydrolyzed Wheat Protein, Cetrimonium Chloride, Polysorbate 20, Polysorbate 80, Phenoxyethanol, Sodium Hydroxide, Glutamic Acid, Quaternium-80, Arginine, Hydroxypropyl Guar, Hydroxypropyl Guar Hydroxypropyltrimonium Chloride, Serine, Linalool, Tyrosine.",
  },
  {
    name: "Absolut Repair Molecular Mask",
    brand: "L'Oréal Professionnel",
    inci: "Aqua/Water, Glycerin, Cetearyl Alcohol, Distarch Phosphate, Quaternium-87, Dimethicone, Behentrimonium Chloride, Propylene Glycol, Phenoxyethanol, PEG-150/Decyl Alcohol, SMDI Copolymer, Amodimethicone, Isopropyl Alcohol, Trideceth-10.",
  },
  {
    name: "Absolut Repair Molecular Leave-in Mask",
    brand: "L'Oréal Professionnel",
    inci: "Aqua/Water, Isopropyl Myristate, Dimethicone, Amodimethicone, Triethanolamine, Phenoxyethanol, Carbomer, Polyquaternium-4, Potato Starch Modified, Hydroxypropyl Guar, Behentrimonium Chloride, Arginine, Trideceth-6, Isopropyl Alcohol, Cetrimonium Chloride, Linalool, Glycine, Serine, Tyrosine, Citric Acid, Glutamic Acid, Coumarin, Benzyl Alcohol, Benzyl Benzoate, Alpha-Isomethyl Ionone, Parfum.",
  },
  {
    name: "Absolut Repair Molecular Oil",
    brand: "L'Oréal Professionnel",
    inci: "Dimethicone, C12-15 Alkyl Benzoate, Isopropyl Myristate, Hydrolyzed Wheat Protein, Parfum, Linalool, Citronellol, Hexyl Cinnamal, Benzyl Salicylate, Alpha-Isomethyl Ionone, Benzyl Benzoate.",
  },
  // === Framesi ===
  {
    name: "Morphosis Restructure Shampoo",
    brand: "Framesi",
    inci: "Aqua, Sodium C14-C16 Olefin Sulfonate, Glycerin, Disodium Laureth Sulfosuccinate, Coco-Betaine, Oryza Sativa Extract, Saccharomyces Ferment Lysate Filtrate, Sodium Hyaluronate, Tocopherol Acetate, Hydrolyzed Vegetable Protein, Bacillus/Soybean Ferment Extract, Palmitamidopropyltrimonium Chloride, Sodium Cocoamphoacetate, Parfum, Cocoamidopropyl Betaine, Guar Hydroxypropyltrimonium Chloride, Coco-Glucoside, Glyceryl Oleate, Propylene Glycol, Butylene Glycol, Pentylene Glycol, Citric Acid, Sodium Benzoate, Potassium Sorbate, Hexyl Cinnamal, Limonene, Benzyl Salicylate, Linalool, Citronellol, Geraniol.",
  },
];

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Buscar un producto en la base local por barcode.
 * Devuelve null si no existe o si no tiene INCI cargada.
 */
export function lookupLocal(barcode) {
  const entry = LOCAL_PRODUCTS[barcode];
  if (!entry) return null;
  return {
    found: true,
    barcode,
    name: entry.name || `Producto ${barcode}`,
    brand: entry.brand || "",
    inci: (entry.inci || "").trim(),
    hasInci: !!(entry.inci || "").trim(),
    source: "Base local",
  };
}

/**
 * Normaliza un texto para búsqueda fuzzy: lowercase, sin acentos, sin signos.
 */
function normalize(s) {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca productos por nombre o marca en la base local.
 * Devuelve array (puede estar vacío). Match parcial sobre tokens normalizados.
 */
export function searchLocalByName(query, limit = 10) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const queryTokens = q.split(" ").filter(Boolean);
  const hits = [];

  // Index combinado: barcode + sin barcode
  const all = [
    ...Object.entries(LOCAL_PRODUCTS).map(([barcode, p]) => ({ ...p, barcode })),
    ...LOCAL_PRODUCTS_BY_NAME.map((p) => ({ ...p, barcode: null })),
  ];

  for (const p of all) {
    const hay = normalize(`${p.name} ${p.brand || ""}`);
    // Score: cuántos tokens de la query están presentes en el haystack
    let score = 0;
    for (const t of queryTokens) {
      if (hay.includes(t)) score++;
    }
    if (score >= 1) {
      hits.push({
        score,
        product: {
          name: p.name,
          brand: p.brand || "",
          barcode: p.barcode,
          inci: (p.inci || "").trim(),
          hasInci: !!(p.inci || "").trim(),
          source: "Base local",
        },
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.product);
}
