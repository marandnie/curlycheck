# Daily Log — CurlyCheck

Registro de cambios incrementales hechos por el agente diario.
Las entradas más recientes van arriba.

---

## 2026-05-07 — UX: chip "Otros prohibidos" para extraForbidden ajenos a CATEGORY_GROUPS

### Problema
`categorySummary` (en `src/classifier.js`) distribuye los ingredientes
`extraForbidden` del ruleset entre los 4 chips visibles
(sulfates / silicones / alcohols / minerals). Cuando un `extraForbidden`
no encajaba en ningún `CATEGORY_GROUP` — caso típico: Methylparaben
(category PRESERVATIVE) en strict — el código caía a `target = "sulfates"`
como fallback. Resultado: el chip "Con Sulfatos" se encendía aunque la
INCI no tuviera ningún sulfato real, sólo un parabeno. UX confusa y
factualmente incorrecta. Issue documentado como follow-up técnico en
las entradas del 2026-05-05 y 2026-05-06.

### Comportamiento esperado
- `extraForbidden` cuya categoría sí está en `CATEGORY_GROUPS` (ej.
  Mineral Oil → `minerals`) sigue yendo a su chip natural.
- `extraForbidden` cuya categoría NO encaja en ningún grupo (parabenos,
  fragrance flags, etc.) cae en un chip dedicado "Otros prohibidos" que
  sólo se renderiza cuando hay matches reales — su default es `na`
  (invisible) para no agregar ruido visual.
- El chip "Con Sulfatos" deja de prenderse falsamente por parabenos.

### Implementación
1. **`src/classifier.js` `categorySummary`:**
   - Agregué `others: { state: "na", matches: [] }` al objeto `empty`
     que se devuelve para INCI vacía.
   - Inicialicé `summary.others` antes de distribuir flagged.
   - Cambié el fallback en el loop de `flagged`: en vez de
     `let target = "sulfates"`, ahora `let target = null` y si después
     del lookup en `CATEGORY_GROUPS` sigue siendo `null` lo asigno a
     `"others"`.
   - Comentarios in-source documentan la heurística y referencian este
     fix.

2. **`src/app.js` `renderCategoryChips`:**
   - Agregué `others: "Otros prohibidos"` a `CAT_LABELS`.
   - El loop de chips ahora itera 5 keys: sulfates / silicones /
     alcohols / minerals / **others**. El short-circuit
     `s.state === "na" → continue` ya estaba presente, así que el chip
     "others" sólo aparece cuando hay matches.

3. **`src/share.js` `buildShareText`:**
   - Agregué `others: "Otros prohibidos"` al diccionario `categoryLabel`.
   - El loop ahora también itera "others", con un guard explícito
     `if (key === "others" && s !== "present") continue` para mantener
     el comportamiento "sólo renderiza si está prendido" alineado con
     el chip visual.

No se tocaron CSS (la regla `.cat-present` existente cubre el nuevo
chip), ni el catálogo de ingredientes, ni ninguno de los rulesets.

### Componentes afectados
Frontend: motor de clasificación + UI (chips + share text). Backend
y telemetría intactos. El shape interno de `state.currentCategorySummary`
gana una key (`others`); como sólo se consume vía
`renderCategoryChips` y `buildShareText`, ambos actualizados, no hay
otros call-sites afectados.

### Archivos modificados
- `src/classifier.js` — `categorySummary`: nuevo bucket `others`,
  fallback `"sulfates"` reemplazado por `"others"`. Comentarios
  documentan la decisión.
- `src/app.js` — `CAT_LABELS` + lista de iteración del loop de chips.
- `src/share.js` — `categoryLabel` + iteración en `buildShareText`,
  con guard "render-only-if-present" para `others`.
- `tests/test_categories.mjs` — 3 tests nuevos / actualizados:
  - **Updated:** "Strict: Methylparaben" ahora afirma explícitamente
    `r.others.state === "present"`, `Methylparaben` en `others.matches`,
    y crítico: `r.sulfates.state === "clean"` (regresión del bug).
  - **New:** "Standard: Mineral Oil va a 'minerals', others queda na"
    como regresión inversa: extraForbidden que SÍ encaja en un grupo
    sigue yendo a su grupo natural.
  - **New:** "Crème de Jour Fondamentale: 'others' también queda na"
    para confirmar que productos APTO no encienden el nuevo chip.
  - "INCI vacía" extendido para chequear `r.others.state === "na"`.

### Tests
- `tests/test_categories.mjs`: **10/10** pasaron (era 8).
- `tests/test_classifier.mjs`: **34/34** pasaron (sin cambios).
- `tests/test_fuzzy.mjs`: **14/14** pasaron (sin cambios).
- Total: **58/58** pasan, golden set intacto.

### Riesgo / regresiones consideradas
- El shape externo de `categorySummary` sólo agrega una key; consumidores
  que itineren con `Object.keys` y no esperen "others" recibirán un
  chip extra que es "na" por default — no rompe nada. Los dos consumidores
  reales (`renderCategoryChips`, `buildShareText`) están actualizados.
- Para `state === "present"`, `s.matches` ahora puede estar vacío en
  los chips originales (sulfates etc.) en casos en los que antes
  contenían un Methylparaben "ajeno". Es un comportamiento más correcto:
  el tooltip de "Con Sulfatos" ya no muestra parabenos.
- CSS: `.cat-present` ya estiliza el nuevo chip rojo igual que los otros,
  no hace falta nuevo estilo.
- Telemetría: `recordScan(r)` no consume `categorySummary`, no se ve
  afectada.
- Service worker / cache: ningún hash inmutable; no requiere bump del
  cache version. Los archivos cambiados se servirán con el mismo
  filename y el revalidate normal.

### Follow-ups / deuda técnica observada
- Quedan dos archivos vacíos `tests/_probe.mjs` y `tests/_probe2.mjs`
  arrastrados desde el run anterior (sync issues entre Edit tool y
  bash workspace). Siguen sin ser referenciados por ningún runner.
  Borrarlos cuando el sandbox lo permita (low priority).
- Sería útil mostrar tooltip / detalle del chip "Otros prohibidos"
  con la lista de ingredientes, igual que los otros chips ya hacen
  (`chip.title = s.matches.join(", ")` ya cubre este caso por la
  estructura compartida — confirmado que `others.matches` se popula
  con los nombres). No requiere cambios adicionales.
- Posible mejora futura: extender `CATEGORY_GROUPS` para incluir
  `PRESERVATIVE` y `FRAGRANCE` como buckets de primera clase si la
  base de usuarios usa más rulesets que listen parabenos /
  fragancias específicas. Por ahora "Otros prohibidos" es el catch-all
  pragmático y cubre el universo conocido.
- El `substringMatch` con regex de word-boundary (mencionado en el
  follow-up del 2026-05-06) sigue pendiente; baja prioridad,
  caso teórico sin reportes en datos reales.

---


## 2026-05-06 — Fix: substring fallback en lookupIngredient producía falsos positivos

### Problema
`src/classifier.js` `lookupIngredient` tenía un fallback de substring matching:

```js
for (const [key, ing] of INDEX.entries()) {
  if (key.length >= 6 && norm.includes(key)) return ing;
}
```

Como las claves se iteran en orden de inserción y "Alcohol" (DRYING_ALCOHOL,
length 7) está cerca del principio del catálogo, **cualquier token con la
substring "alcohol" en el medio matcheaba como alcohol secante**, no como
alcohol graso ni `null`. Lo mismo para `petrolatum`, `tocopherol`, etc.

Casos confirmados experimentalmente con la versión previa:
- `Cetearyl Alcohol Stearate` → `Alcohol` (DRYING_ALCOHOL) → INCI marcada NO APTO.
- `Methyl Alcohol Foobar` → `Alcohol` (DRYING_ALCOHOL).
- `Foobar Petrolatum Bazlandia` → `Petrolatum` (MINERAL_OIL).

El bug estaba mitigado por los matches exactos del catálogo (la mayoría
de ingredientes "X Alcohol" — Cetyl, Cetearyl, Lauryl, etc. — están listados),
pero se manifestaba ante variantes/derivados no catalogados o errores de OCR
que dejaban tokens "compuestos" no reconocidos exactamente. El follow-up
quedó documentado en la entrada del 2026-05-05.

### Comportamiento esperado
El fallback debe seguir capturando casos legítimos como
`Argania Spinosa Kernel Oil Bio` → `Argania Spinosa Kernel Oil`, sin marcar
falsos positivos cuando una key de **una sola palabra** aparece en medio
de un token compuesto.

### Implementación
Refactor del fallback en dos sub-estrategias:

1. **Multi-word keys (≥1 espacio):** containment estándar (`norm.includes(key)`).
   Es seguro: las claves de varias palabras son específicas y no se solapan
   con otros ingredientes. Cubre el caso `Argania Spinosa Kernel Oil Bio`
   y similares.

2. **Single-word keys:** sólo machean si la key es **igual a la primera
   o última palabra** del token (no en el medio). Esto permite seguir
   capturando variantes como `Dimethicone Crosspolymer` → `Dimethicone`,
   `Pure Petrolatum` → `Petrolatum`, pero rechaza `Methyl Alcohol Foobar`
   y `Cetearyl Alcohol Stearate`.

Extraje la lógica a un helper interno `substringMatch(norm)` que se aplica
también al token con paréntesis stripeados, idéntico al comportamiento
previo (sólo cambia el algoritmo interno, no la composición exterior).

### Componentes afectados
Frontend (motor de clasificación). No se tocó UI, OCR, ni backend.

### Archivos modificados
- `src/classifier.js` — nuevo helper `substringMatch`; `lookupIngredient`
  refactorizado para usarlo. Comentarios in-source explican la heurística
  y referencian este fix.
- `tests/test_classifier.mjs` — 6 tests nuevos:
  - falso positivo `Methyl Alcohol Foobar` → no Alcohol.
  - falso positivo `Foobar Petrolatum Bazlandia` → no Petrolatum.
  - match legítimo multi-palabra `Argania Spinosa Kernel Oil Bio`.
  - match legítimo single-word al inicio `Dimethicone Crosspolymer`.
  - match legítimo single-word al final `Pure Petrolatum`.
  - regresión `classify("Cetearyl Alcohol Stearate")` ya no es NO APTO.

### Tests
- `tests/test_classifier.mjs`: **34/34** pasaron (era 28).
- `tests/test_fuzzy.mjs`: **14/14** pasaron (sin cambios).
- `tests/test_categories.mjs`: **8/8** pasaron (sin cambios).
- Total: **56/56** pasan, golden set de 18 productos intacto.

### Riesgo / regresiones consideradas
- El golden set sigue verde — ninguno de los 18 productos canónicos
  dependía del comportamiento buggeado.
- Los matches single-word legítimos (Dimethicone Crosspolymer, etc.)
  siguen funcionando por la regla "primera o última palabra".
- Posible regresión teórica: tokens con la key esperada en medio
  (ej. `Foobar Dimethicone Bazlandia`) ya no machean. En la práctica
  esto sólo aparece en strings sintéticos / OCR muy sucio; el ratio
  de unknowns subiría y eventualmente forzaría VERIFICAR, lo cual
  es un fallback más seguro que el flag NO APTO espurio.
- No hay cambios en la red, en el catálogo INCI ni en los rulesets.

### Follow-ups / deuda técnica observada
- Quedaron dos archivos vacíos `tests/_probe.mjs` y `tests/_probe2.mjs`
  como artefactos de exploración (truncated por sync issues entre Edit
  tool y bash workspace). No están referenciados por ningún runner pero
  conviene removerlos cuando el sandbox lo permita.
- `categorySummary` sigue usando `"sulfates"` como fallback bucket para
  `extraForbidden` que no caen en CATEGORY_GROUP (queda como follow-up
  desde 2026-05-05). Convendría agregar un chip "Otros prohibidos" o
  mapear cada `extraForbidden` a su categoría natural (PRESERVATIVE
  para Methylparaben, etc.).
- El `substringMatch` ahora podría refinarse con regex de word-boundary
  para multi-word keys también (ej. evitar que "alcohol denat" matchee
  dentro de "alcohol denatured X"). Caso teórico no observado en datos
  reales, baja prioridad.

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
