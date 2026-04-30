// Cliente Open Beauty Facts: barcode lookup + búsqueda por nombre.

const BASE = "https://world.openbeautyfacts.org";
const UA_HEADER = { "User-Agent": "CurlyCheck-PWA/0.1" }; // OBF lo recomienda

/**
 * Buscar un producto por código de barras.
 * Retorna { found, product, hasInci } donde product es el objeto OBF si found.
 */
export async function fetchByBarcode(barcode) {
  const url = `${BASE}/api/v3/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,ingredients_text,image_front_url,image_ingredients_url,last_modified_t,states_tags`;
  const resp = await fetch(url, { headers: UA_HEADER });
  if (!resp.ok) throw new Error(`OBF HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status !== "success" || !data.product) {
    return { found: false };
  }
  const p = data.product;
  const inci = (p.ingredients_text || "").trim();
  return {
    found: true,
    barcode: p.code,
    name: p.product_name || "",
    brand: p.brands || "",
    inci,
    hasInci: inci.length > 0,
    imageFront: p.image_front_url || "",
    imageIngredients: p.image_ingredients_url || "",
    lastModified: p.last_modified_t || null,
  };
}

/**
 * Buscar productos por nombre. Retorna array de hits ordenados por OBF.
 */
export async function searchByName(query, pageSize = 5) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(pageSize),
    fields: "code,product_name,brands,ingredients_text,image_front_url",
  });
  const url = `${BASE}/cgi/search.pl?${params}`;
  const resp = await fetch(url, { headers: UA_HEADER });
  if (!resp.ok) throw new Error(`OBF search HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.products || []).map((p) => ({
    barcode: p.code,
    name: p.product_name || "",
    brand: p.brands || "",
    inci: (p.ingredients_text || "").trim(),
    hasInci: !!(p.ingredients_text || "").trim(),
    imageFront: p.image_front_url || "",
  }));
}
