// Catálogo de ingredientes y rulesets — port de Python a JS.
// Manténgase en sync con clasificador/curly_classifier/ruleset.py.

export const CATEGORIES = {
  SULFATE: "sulfate",
  SILICONE_INSOLUBLE: "silicone_insoluble",
  SILICONE_SOLUBLE: "silicone_soluble",
  DRYING_ALCOHOL: "drying_alcohol",
  FATTY_ALCOHOL: "fatty_alcohol",
  MINERAL_OIL: "mineral_oil",
  WAX: "wax",
  NATURAL_OIL: "natural_oil",
  PROTEIN: "protein",
  HUMECTANT: "humectant",
  SURFACTANT_MILD: "surfactant_mild",
  PRESERVATIVE: "preservative",
  QUAT: "quat",
  FRAGRANCE: "fragrance",
  OTHER: "other",
};

const C = CATEGORIES;

/** @typedef {{ name: string, category: string, aliases?: string[], explanation?: string, severity?: string }} Ingredient */

/** @type {Ingredient[]} */
export const INGREDIENTS = [
  // --- Sulfatos prohibidos ---
  { name: "Sodium Lauryl Sulfate", category: C.SULFATE, aliases: ["SLS", "Lauril Sulfato Sódico"], explanation: "Sulfato fuerte que decapa la fibra capilar.", severity: "high" },
  { name: "Sodium Laureth Sulfate", category: C.SULFATE, aliases: ["SLES"], explanation: "Sulfato común; menos agresivo que SLS pero igualmente prohibido.", severity: "high" },
  { name: "Ammonium Lauryl Sulfate", category: C.SULFATE, aliases: ["ALS"], severity: "high" },
  { name: "Ammonium Laureth Sulfate", category: C.SULFATE, aliases: ["ALES"], severity: "high" },
  { name: "TEA Lauryl Sulfate", category: C.SULFATE, severity: "high" },
  { name: "TEA Laureth Sulfate", category: C.SULFATE, severity: "high" },
  { name: "Sodium Myreth Sulfate", category: C.SULFATE, severity: "high" },

  // --- Siliconas no solubles (prohibidas) ---
  { name: "Dimethicone", category: C.SILICONE_INSOLUBLE, explanation: "Silicona no soluble; genera acumulación que sólo se quita con sulfatos.", severity: "high" },
  { name: "Dimethiconol", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Cyclomethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Cyclopentasiloxane", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Cyclohexasiloxane", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Amodimethicone", category: C.SILICONE_INSOLUBLE, explanation: "Silicona modificada con afinidad por la fibra; forma película persistente.", severity: "high" },
  { name: "Trimethylsilylamodimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Stearoxy Dimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Behenoxy Dimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Cetyl Dimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Cetearyl Methicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Stearyl Dimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Phenyl Trimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },
  { name: "Divinyldimethicone/Dimethicone Copolymer", category: C.SILICONE_INSOLUBLE, aliases: ["Divinyldimethicone Dimethicone Copolymer"], severity: "medium" },

  // --- Siliconas solubles (PERMITIDAS) ---
  { name: "Dimethicone PEG-7 Phosphate", category: C.SILICONE_SOLUBLE, severity: "allowed" },
  { name: "PEG-12 Dimethicone", category: C.SILICONE_SOLUBLE, severity: "allowed" },
  { name: "Dimethicone Copolyol", category: C.SILICONE_SOLUBLE, severity: "allowed" },
  { name: "Lauryl Methicone Copolyol", category: C.SILICONE_SOLUBLE, severity: "allowed" },
  { name: "PEG/PPG-18/18 Dimethicone", category: C.SILICONE_SOLUBLE, severity: "allowed" },

  // --- Alcoholes secantes ---
  { name: "Alcohol Denat", category: C.DRYING_ALCOHOL, aliases: ["Alcohol Denat.", "SD Alcohol", "Denatured Alcohol"], severity: "high" },
  { name: "Ethanol", category: C.DRYING_ALCOHOL, aliases: ["Etanol"], severity: "high" },
  { name: "Isopropyl Alcohol", category: C.DRYING_ALCOHOL, aliases: ["Isopropanol"], severity: "medium" },
  { name: "Propanol", category: C.DRYING_ALCOHOL, severity: "high" },
  { name: "Propyl Alcohol", category: C.DRYING_ALCOHOL, severity: "high" },
  { name: "Alcohol", category: C.DRYING_ALCOHOL, severity: "high" },

  // --- Alcoholes grasos (permitidos) ---
  { name: "Cetyl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Cetearyl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Stearyl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Behenyl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Lauryl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Myristyl Alcohol", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Benzyl Alcohol", category: C.PRESERVATIVE, severity: "allowed" },

  // --- Aceites minerales / petróleo ---
  { name: "Mineral Oil", category: C.MINERAL_OIL, aliases: ["Aceite Mineral"], severity: "high" },
  { name: "Paraffinum Liquidum", category: C.MINERAL_OIL, aliases: ["Liquid Paraffin"], severity: "high" },
  { name: "Petrolatum", category: C.MINERAL_OIL, aliases: ["Petroleum Jelly", "Vaselina"], severity: "high" },
  { name: "Paraffin", category: C.MINERAL_OIL, aliases: ["Paraffin Wax"], severity: "high" },
  { name: "Microcrystalline Wax", category: C.WAX, aliases: ["Cera Microcristalina"], severity: "high" },
  { name: "Ozokerite", category: C.WAX, severity: "high" },
  { name: "Ceresin", category: C.WAX, severity: "high" },

  // --- Sulfonatos / surfactantes suaves ---
  { name: "Sodium C14-C16 Olefin Sulfonate", category: C.SURFACTANT_MILD, aliases: ["Sodium C14-16 Olefin Sulfonate"], severity: "low" },
  { name: "Sodium Cocoyl Isethionate", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Disodium Laureth Sulfosuccinate", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Sodium Lauryl Sulfoacetate", category: C.SURFACTANT_MILD, aliases: ["SLSA"], severity: "allowed" },
  { name: "Sodium Lauroyl Sarcosinate", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Cocamidopropyl Betaine", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Coco-Betaine", category: C.SURFACTANT_MILD, aliases: ["Cocamidopropyl Hydroxysultaine"], severity: "allowed" },
  { name: "Decyl Glucoside", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Coco-Glucoside", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Cetearyl Glucoside", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Sodium Cocoamphoacetate", category: C.SURFACTANT_MILD, severity: "allowed" },
  { name: "Cocoamidopropyl Betaine", category: C.SURFACTANT_MILD, severity: "allowed" },

  // --- Aceites vegetales ---
  { name: "Cocos Nucifera Oil", category: C.NATURAL_OIL, aliases: ["Coconut Oil", "Aceite de Coco"], severity: "allowed" },
  { name: "Olea Europaea Fruit Oil", category: C.NATURAL_OIL, aliases: ["Olive Oil", "Olive Fruit Oil", "Aceite de Oliva"], severity: "allowed" },
  { name: "Helianthus Annuus Seed Oil", category: C.NATURAL_OIL, aliases: ["Sunflower Seed Oil", "Sunflower Oil", "Aceite de Girasol"], severity: "allowed" },
  { name: "Simmondsia Chinensis Seed Oil", category: C.NATURAL_OIL, aliases: ["Jojoba Oil", "Jojoba Seed Oil", "Aceite de Jojoba"], severity: "allowed" },
  { name: "Argania Spinosa Kernel Oil", category: C.NATURAL_OIL, aliases: ["Argan Oil"], severity: "allowed" },
  { name: "Glycine Soja Oil", category: C.NATURAL_OIL, aliases: ["Soybean Oil", "Soya Bean Oil", "Aceite de Soja"], severity: "allowed" },
  { name: "Butyrospermum Parkii Butter", category: C.NATURAL_OIL, aliases: ["Shea Butter", "Manteca de Karité"], severity: "allowed" },
  { name: "Shorea Robusta Seed Butter", category: C.NATURAL_OIL, severity: "allowed" },
  { name: "Caprylic/Capric Triglyceride", category: C.NATURAL_OIL, severity: "allowed" },
  { name: "Rosa Canina Flower Extract", category: C.NATURAL_OIL, aliases: ["Wild Rose"], severity: "allowed" },

  // --- Ceras vegetales ---
  { name: "Candelilla Cera", category: C.WAX, aliases: ["Candelilla Wax", "Cera Candelilla"], severity: "low" },
  { name: "Carnauba Wax", category: C.WAX, aliases: ["Cera Carnauba", "Copernicia Cerifera Wax"], severity: "low" },
  { name: "Cera Alba", category: C.WAX, aliases: ["Beeswax", "Cera de Abeja"], severity: "low" },

  // --- Quats ---
  { name: "Behentrimonium Chloride", category: C.QUAT, severity: "allowed" },
  { name: "Cetrimonium Chloride", category: C.QUAT, severity: "allowed" },
  { name: "Stearamidopropyl Dimethylamine", category: C.QUAT, severity: "allowed" },
  { name: "Polyquaternium-7", category: C.QUAT, aliases: ["PQ-7"], severity: "allowed" },
  { name: "Polyquaternium-10", category: C.QUAT, aliases: ["PQ-10"], severity: "allowed" },
  { name: "Polyquaternium-37", category: C.QUAT, aliases: ["PQ-37"], severity: "allowed" },
  { name: "Polyquaternium-4", category: C.QUAT, aliases: ["PQ-4"], severity: "allowed" },
  { name: "Polyquaternium-6", category: C.QUAT, aliases: ["PQ-6"], severity: "allowed" },
  { name: "Quaternium-87", category: C.QUAT, severity: "allowed" },
  { name: "Quaternium-80", category: C.QUAT, severity: "low" },
  { name: "Palmitamidopropyltrimonium Chloride", category: C.QUAT, severity: "allowed" },

  // --- Humectantes y otros permitidos ---
  { name: "Glycerin", category: C.HUMECTANT, aliases: ["Glicerina"], severity: "allowed" },
  { name: "Propylene Glycol", category: C.HUMECTANT, severity: "allowed" },
  { name: "Sodium Hyaluronate", category: C.HUMECTANT, aliases: ["Hyaluronic Acid"], severity: "allowed" },
  { name: "Hexylene Glycol", category: C.HUMECTANT, severity: "allowed" },
  { name: "Butylene Glycol", category: C.HUMECTANT, severity: "allowed" },
  { name: "Pentylene Glycol", category: C.HUMECTANT, severity: "allowed" },
  { name: "Glycereth-26", category: C.HUMECTANT, severity: "allowed" },
  { name: "Hydrolyzed Wheat Protein", category: C.PROTEIN, severity: "allowed" },
  { name: "Hydrolyzed Vegetable Protein", category: C.PROTEIN, severity: "allowed" },
  { name: "Hydroxypropyltrimonium Hydrolyzed Wheat Protein", category: C.PROTEIN, severity: "allowed" },
  { name: "Tocopherol", category: C.OTHER, aliases: ["Vitamin E"], severity: "allowed" },
  { name: "Tocopherol Acetate", category: C.OTHER, severity: "allowed" },
  { name: "Citric Acid", category: C.OTHER, severity: "allowed" },
  { name: "Sodium Hydroxide", category: C.OTHER, severity: "allowed" },
  { name: "Sodium Chloride", category: C.OTHER, severity: "allowed" },
  { name: "Sodium Benzoate", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Phenoxyethanol", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Caprylyl Glycol", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Aqua", category: C.OTHER, aliases: ["Water", "Eau", "Agua"], severity: "allowed" },
  { name: "Parfum", category: C.FRAGRANCE, aliases: ["Fragrance", "Fragancia"], severity: "allowed" },
  { name: "Linalool", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Limonene", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Citronellol", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Geraniol", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Coumarin", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Hexyl Cinnamal", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Benzyl Salicylate", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Alpha-Isomethyl Ionone", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Citral", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Benzyl Benzoate", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Aminopropyl Triethoxysilane", category: C.OTHER, severity: "allowed" },

  // --- Ingredientes adicionales del golden set ---
  { name: "Glycol Distearate", category: C.OTHER, severity: "allowed" },
  { name: "Coconut Acid", category: C.OTHER, severity: "allowed" },
  { name: "Sodium Isethionate", category: C.OTHER, severity: "allowed" },
  { name: "Salicylic Acid", category: C.OTHER, severity: "allowed" },
  { name: "Carbomer", category: C.OTHER, severity: "allowed" },
  { name: "PPG-5-Ceteth-20", category: C.OTHER, severity: "allowed" },
  { name: "PEG-55 Propylene Glycol Oleate", category: C.OTHER, severity: "allowed" },
  { name: "Laureth-9", category: C.OTHER, severity: "allowed" },
  { name: "Trideceth-12", category: C.OTHER, severity: "allowed" },
  { name: "Trideceth-6", category: C.OTHER, severity: "allowed" },
  { name: "PPG-1 Trideceth-6", category: C.OTHER, severity: "allowed" },
  { name: "C11-15 Pareth-7", category: C.OTHER, severity: "allowed" },
  { name: "C12-13 Pareth-3", category: C.OTHER, severity: "allowed" },
  { name: "C12-13 Pareth-23", category: C.OTHER, severity: "allowed" },
  { name: "C12-13 Alketh-3", category: C.OTHER, severity: "allowed" },
  { name: "C12-13 Alketh-23", category: C.OTHER, severity: "allowed" },
  { name: "Mel Extract", category: C.OTHER, aliases: ["Honey Extract", "Mel"], severity: "allowed" },
  { name: "2-Oleamido-1,3-Octadecanediol", category: C.OTHER, aliases: ["Ceramide R"], severity: "allowed" },
  { name: "Hydroxypropyl Guar", category: C.OTHER, severity: "allowed" },
  { name: "Cetyl Esters", category: C.FATTY_ALCOHOL, severity: "allowed" },
  { name: "Glyceryl Stearate", category: C.OTHER, severity: "allowed" },
  { name: "Tartaric Acid", category: C.OTHER, severity: "allowed" },
  { name: "Isopropyl Myristate", category: C.OTHER, severity: "allowed" },
  { name: "Bis-Diglyceryl Polyacyladipate-2", category: C.OTHER, severity: "allowed" },
  { name: "Sclerotium Gum", category: C.OTHER, severity: "allowed" },
  { name: "Octyldodecanol", category: C.OTHER, severity: "allowed" },
  { name: "Potato Starch Modified", category: C.OTHER, severity: "allowed" },
  { name: "Methylparaben", category: C.PRESERVATIVE, severity: "low" },
  { name: "Mica", category: C.OTHER, severity: "allowed" },
  { name: "CI 77891", category: C.OTHER, aliases: ["Titanium Dioxide"], severity: "allowed" },
  { name: "Titanium Dioxide", category: C.OTHER, severity: "allowed" },
  { name: "Chlorhexidine Dihydrochloride", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Chlorhexidine Digluconate", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Guar Hydroxypropyltrimonium Chloride", category: C.OTHER, severity: "allowed" },
  { name: "Pentaerythrityl Tetra-Di-T-Butyl Hydroxyhydrocinnamate", category: C.OTHER, severity: "allowed" },
  { name: "Glycine", category: C.OTHER, severity: "allowed" },
  { name: "Serine", category: C.OTHER, severity: "allowed" },
  { name: "Tyrosine", category: C.OTHER, severity: "allowed" },
  { name: "Glutamic Acid", category: C.OTHER, severity: "allowed" },
  { name: "Arginine", category: C.OTHER, severity: "allowed" },
  { name: "Benzoic Acid", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Polysorbate 21", category: C.OTHER, severity: "allowed" },
  { name: "Polysorbate 20", category: C.OTHER, severity: "allowed" },
  { name: "Polysorbate 80", category: C.OTHER, severity: "allowed" },
  { name: "Sorbitan Oleate", category: C.OTHER, severity: "allowed" },
  { name: "Hydroxypropyl Guar Hydroxypropyltrimonium Chloride", category: C.OTHER, severity: "allowed" },
  { name: "Triethanolamine", category: C.OTHER, aliases: ["TEA"], severity: "allowed" },
  { name: "Distarch Phosphate", category: C.OTHER, severity: "allowed" },
  { name: "PEG-150/Decyl Alcohol", category: C.OTHER, severity: "allowed" },
  { name: "SMDI Copolymer", category: C.OTHER, severity: "allowed" },
  { name: "Trideceth-10", category: C.OTHER, severity: "allowed" },
  { name: "PEG-40 Hydrogenated Castor Oil", category: C.OTHER, severity: "allowed" },
  { name: "Tetrasodium EDTA", category: C.OTHER, aliases: ["EDTA"], severity: "allowed" },
  { name: "Triethyl Citrate", category: C.OTHER, severity: "allowed" },
  { name: "Lactic Acid", category: C.OTHER, severity: "allowed" },
  { name: "Glycolic Acid", category: C.OTHER, severity: "allowed" },
  { name: "Isododecane", category: C.OTHER, severity: "low" },
  { name: "C11-13 Isoalkane", category: C.OTHER, severity: "low" },
  { name: "Propylene Glycol Dicaprylate/Dicaprate", category: C.OTHER, severity: "allowed" },
  { name: "Acrylates/Stearyl Methacrylate Copolymer", category: C.OTHER, severity: "allowed" },
  { name: "Ethanolamine", category: C.OTHER, severity: "allowed" },
  { name: "C12-15 Alkyl Benzoate", category: C.OTHER, severity: "allowed" },
  { name: "Saccharomyces Ferment Lysate Filtrate", category: C.OTHER, severity: "allowed" },
  { name: "Bacillus/Soybean Ferment Extract", category: C.OTHER, severity: "allowed" },
  { name: "Glyceryl Oleate", category: C.OTHER, severity: "allowed" },
  { name: "Potassium Sorbate", category: C.PRESERVATIVE, severity: "allowed" },
  { name: "Oryza Sativa Extract", category: C.OTHER, aliases: ["Rice Extract"], severity: "allowed" },

  // --- Nuevos: aminoácidos, conservantes y colorantes (sumados según productos escaneados) ---
  { name: "Sodium Phosphate", category: C.OTHER, severity: "allowed" },
  { name: "Lactose", category: C.HUMECTANT, aliases: ["Lactosa"], severity: "allowed" },
  { name: "Alanine", category: C.OTHER, aliases: ["L-Alanine"], severity: "allowed" },
  { name: "Glycoproteins", category: C.PROTEIN, aliases: ["Glicoproteínas"], severity: "allowed" },
  { name: "Glycosaminoglycans", category: C.HUMECTANT, aliases: ["GAGs"], severity: "allowed" },
  { name: "Imidazolidinyl Urea", category: C.PRESERVATIVE, severity: "low" },
  { name: "Diazolidinyl Urea", category: C.PRESERVATIVE, severity: "low" },
  { name: "Iodopropynyl Butylcarbamate", category: C.PRESERVATIVE, aliases: ["IPBC"], severity: "allowed" },
  { name: "CI 17200", category: C.OTHER, aliases: ["D&C Red 33", "DandC Red 33"], severity: "allowed" },
  { name: "Aminopropyl Phenyl Trimethicone", category: C.SILICONE_INSOLUBLE, severity: "high" },


  // --- Aceites vegetales adicionales ---
  { name: "Ricinus Communis Seed Oil", category: C.NATURAL_OIL, aliases: ["Castor Oil", "Aceite de Ricino", "Ricinus Communis (Castor) Seed Oil"], severity: "allowed" },
  { name: "Linum Usitatissimum Seed Oil", category: C.NATURAL_OIL, aliases: ["Flax Seed Oil", "Linseed Oil", "Aceite de Lino", "Linum Usitatissimum Flower Extract"], severity: "allowed" },

  // --- Extractos botánicos ---
  { name: "Chamomilla Recutita Extract", category: C.OTHER, aliases: ["Matricaria Flower Extract", "Manzanilla Extract", "Chamomilla Recutita Flower Extract", "Chamomile Extract"], severity: "allowed" },
  { name: "Nelumbium Speciosum Extract", category: C.OTHER, aliases: ["Nelumbium Speciosum Flower Extract", "Lotus Flower Extract", "Loto"], severity: "allowed" },
  { name: "Gardenia Tahitensis Flower Extract", category: C.OTHER, aliases: ["Gardena Tahitensis Flower Extract", "Tiare Flower Extract", "Tiare"], severity: "allowed" },

  // --- Activos / vitaminas ---
  { name: "Bisabolol", category: C.OTHER, aliases: ["Alpha-Bisabolol"], severity: "allowed" },
  { name: "Panthenol", category: C.HUMECTANT, aliases: ["Vitamin B5", "Provitamin B5", "DL-Panthenol"], severity: "allowed" },
  { name: "Tocopheryl Acetate", category: C.OTHER, aliases: ["Vitamin E Acetate"], severity: "allowed" },

  // --- Fragancias adicionales ---
  { name: "Cinnamal", category: C.FRAGRANCE, aliases: ["Cinnamaldehyde"], severity: "allowed" },
  { name: "Hexamethylindanopyran", category: C.FRAGRANCE, aliases: ["Galaxolide"], severity: "allowed" },
  { name: "Terpineol", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Tetramethyl Acetyloctahydronaphtalenes", category: C.FRAGRANCE, aliases: ["Iso E Super"], severity: "allowed" },
  { name: "Linalyl Acetate", category: C.FRAGRANCE, severity: "allowed" },
  { name: "Vanillin", category: C.FRAGRANCE, severity: "allowed" },

  // --- Colorantes adicionales ---
  { name: "CI 19140", category: C.OTHER, aliases: ["Cl 19140", "FD&C Yellow 5", "Tartrazine"], severity: "allowed" },

  // --- Aliases para el INCI canónico Caprylic/Capric Triglyceride
  // (cuando aparece como dos tokens partidos en la etiqueta) ---
  { name: "Caprylic Triglyceride", category: C.NATURAL_OIL, severity: "allowed" },
  { name: "Capric Triglyceride", category: C.NATURAL_OIL, severity: "allowed" },

];

export const RULESETS = {
  standard: {
    name: "Estándar Oh My Rula",
    forbiddenCategories: new Set([C.SULFATE, C.SILICONE_INSOLUBLE, C.DRYING_ALCOHOL, C.MINERAL_OIL]),
    extraForbidden: new Set(),
    extraAllowed: new Set(),
    unknownThreshold: 0.15,
  },
  strict: {
    name: "Estricto (CGM purista)",
    forbiddenCategories: new Set([C.SULFATE, C.SILICONE_INSOLUBLE, C.SILICONE_SOLUBLE, C.DRYING_ALCOHOL, C.MINERAL_OIL, C.WAX]),
    extraForbidden: new Set(["Methylparaben", "Sodium C14-C16 Olefin Sulfonate", "Isododecane", "C11-13 Isoalkane"]),
    extraAllowed: new Set(),
    unknownThreshold: 0.10,
  },
  lenient: {
    name: "Laxa (low-poo friendly)",
    forbiddenCategories: new Set([C.SULFATE, C.MINERAL_OIL]),
    extraForbidden: new Set(),
    extraAllowed: new Set(["Dimethicone", "Amodimethicone"]),
    unknownThreshold: 0.20,
  },
};
