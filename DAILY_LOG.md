# Daily Log — CurlyCheck

Registro de cambios incrementales hechos por el agente diario.
Las entradas más recientes van arriba.

---

## 2026-05-05 — Fix: fuzzy correction rompía locantes numéricos en INCI

### Problema
El flujo OCR aplica `correctInciText` (fuzzy) sobre el texto reconocido
**antes** de pasarlo a `classify`. La función hacía un split naïve por coma
y partía ingredientes con locantes numéricos (ej.
`2-Oleamido-1,3-Octadecanediol` → `2-Oleamido-1` + `3-Octadecanediol`).

Impacto en la clasificación:
- Genera dos tokens "unknown" donde antes había uno reconocido.
- Sube `unknownRatio`, que puede cruzar el umbral del ruleset (15% en
  estándar) y forzar VERIFICAR cuando el producto debería ser APTO.
- Confirmado experimentalmente: la INCI de Crème de Jour Fondamentale
  produjo `unknown: ['2-Oleamido-1', '3-Octadecanediol']` tras `correctInciText`,
  cuando antes de fuzzy estaba `unknown: []`.

### Comportamiento esperado
`correctInciText` debe respetar la misma protección de comas que
`parseInci` (placeholder para `(\d),(\d)`), así los locantes
químicos sobreviven la corrección fuzzy.

### Implementación
1. Extraje `splitInciTokens(text)` como función exportada en
   `src/classifier.js`. Hace el split crudo: descarta prefijo
   "Ingredients:", normaliza separadores (`;`, `·`, `\n` → `,`) y
   protege locantes numéricos antes del split.
2. `parseInci` ahora usa `splitInciTokens` y sólo agrega encima el
   filtro de códigos de lote y el manejo de `/`. Comportamiento
   externo igual.
3. `src/fuzzy.js` `correctInciText` importa y usa `splitInciTokens`
   en vez de `text.split(",")`. Beneficio extra: ahora también
   normaliza `;` y `·` antes de corregir (consistente con el parser).

### Componentes afectados
Frontend (motor de clasificación). No se tocó UI ni backend.

### Archivos modificados
- `src/classifier.js` — nueva export `splitInciTokens`; `parseInci`
  refactorizado para reusarla.
- `src/fuzzy.js` — importa `splitInciTokens`; `correctInciText` lo usa.
- `tests/test_classifier.mjs` — 1 test nuevo (`flujo OCR + fuzzy:
  locantes numéricos no se rompen tras corrección`).
- `tests/test_fuzzy.mjs` — 3 tests nuevos (locante 2-Oleamido,
  locante 1,2-Hexanediol, normalización de `;` y `·`).

### Tests
- `tests/test_classifier.mjs`: **28/28** pasaron (era 27).
- `tests/test_fuzzy.mjs`: **14/14** pasaron (era 11).
- `tests/test_categories.mjs`: **8/8** pasaron (sin cambios).
- Total: **50/50** pasan, golden set de 18 productos intacto.

### Riesgo / regresiones consideradas
- El comportamiento externo de `parseInci` queda igual (mismos golden
  tests). Sólo cambia su composición interna.
- `correctInciText` ahora también normaliza `;` y `·`, pero esto es
  un superset compatible: si la entrada ya usaba `,` como separador
  no cambia nada; si usaba `;` se mejora la corrección.
- No hay cambios en la red, en el catálogo INCI ni en los rulesets.

### Follow-ups / deuda técnica observada
- `src/classifier.js` tiene un fallback de substring matching en
  `lookupIngredient` (`if (key.length >= 6 && norm.includes(key))`)
  que podría producir falsos positivos para tokens no estándar
  (ej. cualquier `*alcohol*` → DRYING_ALCOHOL). Hoy está mitigado
  por los matches exactos del catálogo, pero conviene auditarlo.
- `categorySummary` todavía usa `"sulfates"` como fallback bucket
  para ingredientes en `extraForbidden` que no caen en ningún
  CATEGORY_GROUP (ver test "Strict: Methylparaben…" en
  `test_categories.mjs`). Mostrar Methylparaben bajo el chip de
  sulfatos es UX confusa — convendría agregar un chip "Otros
  prohibidos" o mapearlos a su categoría natural.
- No hay `correctInciText.test` para el caso de tokens con `/`
  (ej. `Aqua/Water` quedó como un solo token tras el cambio,
  cubierto indirectamente por el test del flujo OCR + fuzzy).
