// Base local de productos curados.
// Se consulta ANTES de Open Beauty Facts en el flujo de barcode.
// Útil para productos populares en Argentina que no están en OBF
// (línea profesional, productos importados, exclusivos de farmacias, etc).
//
// Cómo agregar uno nuevo:
//   1. Mirá la etiqueta del producto.
//   2. Agregá una entrada con la barcode como clave.
//   3. Pegá la INCI textual (después de "Ingredients:" / "Ingredientes:").
//   4. Mantené el orden original de la INCI — el clasificador puede usarlo.

export const LOCAL_PRODUCTS = {
  // Kérastase — Gloss Absolu Masque Crème Hydra Glaze
  // 200ml — barcode 3474637303365
  // TODO: pegar INCI desde el envase. Marcado como "" hasta entonces.
  "3474637303365": {
    name: "Gloss Absolu Masque Crème Hydra Glaze",
    brand: "Kérastase",
    inci: "",
  },

  // 3474636968701 — Curl Manifesto Huile Incroyable Repair: ya está en OBF
  // (agregado por Marina, 2026-04). Removido de local porque OBF lo cubre.

};

/**
 * Buscar un producto en la base local por barcode.
 * Devuelve null si no existe o si no tiene INCI cargada todavía.
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
