// Compartir un resultado de clasificación.
// Usa Web Share API (Android Chrome, iOS Safari ≥ 12.2). Fallback: copia al
// portapapeles. Si tampoco hay clipboard, devuelve el texto para que la UI
// decida (ej: prompt).

const APP_URL = "https://www.mandieto.com.ar/curlycheck/";

function emojiForVerdict(v) {
  if (v === "APTO") return "✅";
  if (v === "NO APTO") return "❌";
  return "⚠️";
}

function emojiForCategoryState(s) {
  return s === "clean" ? "✓" : s === "present" ? "✗" : "—";
}

function categoryLabel(key) {
  return ({
    sulfates: "Sulfatos",
    silicones: "Siliconas no solubles",
    alcohols: "Alcoholes secantes",
    minerals: "Aceites minerales",
  })[key] || key;
}

/**
 * Construye el texto a compartir. Recibe el objeto state.current de la app y
 * el sub-resultado de categorías (opcional).
 */
export function buildShareText(item, categorySummary) {
  const lines = [];
  const v = item.verdict || "—";
  const head = `${emojiForVerdict(v)} ${item.name || "Producto"}${item.brand ? " · " + item.brand : ""}`;
  lines.push(head);
  lines.push(`Veredicto Curly: ${v}${item.ruleset && item.ruleset !== "—" ? " (" + item.ruleset + ")" : ""}`);

  if (categorySummary) {
    lines.push("");
    for (const key of ["sulfates", "silicones", "alcohols", "minerals"]) {
      const s = categorySummary[key]?.state;
      if (!s) continue;
      lines.push(`${emojiForCategoryState(s)} ${categoryLabel(key)}`);
    }
  }

  if (item.offenders && item.offenders.length > 0) {
    lines.push("");
    lines.push("Ingredientes a evitar:");
    for (const o of item.offenders.slice(0, 5)) {
      const name = o.matched?.name || o.raw;
      lines.push(`· ${name}`);
    }
    if (item.offenders.length > 5) {
      lines.push(`· y ${item.offenders.length - 5} más`);
    }
  }

  lines.push("");
  lines.push(`Probá Curly Check: ${APP_URL}`);
  return lines.join("\n");
}

/**
 * Intenta compartir usando la mejor API disponible.
 * Devuelve un objeto con { method: 'share' | 'clipboard' | 'manual', text }.
 */
export async function shareResult(item, categorySummary) {
  const text = buildShareText(item, categorySummary);
  const title = `Curly Check · ${item.name || "Producto"}`;

  // 1) Web Share API
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: APP_URL });
      return { method: "share", text };
    } catch (e) {
      // El usuario canceló o falló — caemos al clipboard
      if (e.name === "AbortError") return { method: "abort", text };
    }
  }

  // 2) Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: "clipboard", text };
    } catch (e) {
      // continuar al fallback
    }
  }

  // 3) Manual: el caller muestra un prompt o textarea con el texto
  return { method: "manual", text };
}
