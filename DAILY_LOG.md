# Daily Log — CurlyCheck

Registro de cambios incrementales hechos por el agente diario.
Las entradas más recientes van arriba.

---

## 2026-10-08 — Fix: alcoholes "<algo> Alcohol" no secantes marcados como DRYING (NO APTO falso)

### Problema
FINDINGS P1-5 (verificado de nuevo hoy contra el código real): el substring
fallback de `lookupIngredient` matchea keys de una palabra si son la primera
o última palabra del token. Como `"Alcohol"` es una entrada DRYING_ALCOHOL,
cualquier `"<X> Alcohol"` no curado terminaba como alcohol secante:
Oleyl, Arachidyl, Isostearyl, Lanolin, Caprylyl, Decyl, Brassica (grasos),
Cinnamyl / Amyl Cinnamyl / Anise (fragancia), Phenethyl / Dichlorobenzyl
(conservantes), Polyvinyl (film former), Ethyl Alcohol. Resultado: NO APTO
falso en acondicionadores y cremas comunes. (El caso PEG-Dimethicone de P1-5
ya estaba resuelto por `fixPegSilicone`.)

### Implementación
- `src/ingredients.js` + `clasificador/curly_classifier/ruleset.py` (sync):
  13 entradas curadas nuevas con explicación (grasos → FATTY_ALCOHOL,
  fragancias → FRAGRANCE, conservantes → PRESERVATIVE, PVA → OTHER), aliases
  `Lanolin Alcohols`/`Wool Alcohol(s)`, `Phenylethyl Alcohol`, `Anisyl Alcohol`,
  `Octyl Alcohol`; `Cetostearyl Alcohol` → alias de Cetearyl; `Ethyl Alcohol`
  → alias de Ethanol (sigue siendo DRYING).
- `src/classifier.js` `substringMatch`: la key `"alcohol"` ya no matchea
  cuando es sólo la ÚLTIMA palabra del token. Un `"<desconocido> Alcohol"`
  cae al catálogo extendido / unknown (VERIFICAR) en vez de NO APTO falso.
  Como primera palabra (`Alcohol Denat`, `Alcohol 96°`) sigue matcheando.
- `service-worker.js`: CACHE_VERSION v17 → v18 para que los clientes
  reciban el catálogo nuevo.

### Archivos
- `src/ingredients.js`, `src/classifier.js`, `service-worker.js`
- `tests/test_classifier.mjs` (+15 tests)
- `../clasificador/curly_classifier/ruleset.py`

### Validación
- JS: classifier 64/64 (antes 49), categories 10/10, fuzzy 14/14,
  inci_extended 10/10, ocr_catalog OK. `node --check` OK.
- Python: pytest 22/22; probe manual Oleyl/Lanolin/Amyl Cinnamyl/Ethyl.
- Regresiones cubiertas: `Alcohol`, `Alcohol Denat.`, `SD Alcohol 40`,
  `Ethyl Alcohol`, `Isopropyl Alcohol` siguen DRYING; INCI con
  `Alcohol Denat.` + `Oleyl Alcohol` sigue NO APTO con 1 sólo ofensor.

### Follow-ups / deuda
- El Python `lookup_ingredient` usa containment puro (`key in norm`), más
  laxo que el JS; no tiene el guard de "alcohol" ni la regla first/last-word.
  Las entradas exactas cubren los casos conocidos, pero conviene portar
  `substringMatch` a Python para paridad real.
- Cambios sin commitear (no se hizo commit/deploy desde la tarea automática).
- `probe_tmp.mjs` (script de prueba) quedó en `Método Curly/_to_delete/`
  porque la sesión no tiene permiso de borrado — se puede borrar a mano.
- Pendientes de FINDINGS siguientes por prioridad: P1-6 (chips "Sin
  Siliconas" en ruleset lenient), P1-8 (estantería reclasifica con ruleset
  hardcodeado).

---

## 2026-05-08 — Parser: stripping de marcadores de anotación (asteriscos orgánicos, footnotes, %, corchetes)

### Problema
Las INCI naturales/orgánicas suelen llevar marcadores pegados al nombre
del ingrediente para indicar origen orgánico, certificación, footnote
o porcentaje en la formulación:

- `Aqua*`, `Glycerin**`, `Cetearyl Alcohol*` (asterisco orgánico)
- `Aqua†`, `Glycerin‡`, `Parfum°` (dagas / grado como footnote)
- `Aqua¹`, `Glycerin²`, `Parfum³` (superíndices Unicode)
- `[Aqua]`, `[Glycerin*]` (corchetes envolventes)
- `• Aqua`, `– Glycerin`, `— Parfum` (viñetas/dashes de lista)
- `Aqua 70%`, `Glycerin 0,1%` (porcentajes pegados)

`splitInciTokens` sólo trimmeaba `[ ."\t]+` en bordes, así que estos
markers quedaban pegados al token. Resultado: `Aqua*` no matcheaba la
INDEX (`aqua*` ≠ `aqua`), iba a `unknown`, y `unknownRatio` podía cruzar
el umbral del ruleset (15% en estándar) forzando VERIFICAR aún cuando
el producto debería ser APTO. Caso peor: una INCI 100% orgánica
(`Aqua*, Glycerin*, Parfum*`) producía 100% unknowns → VERIFICAR
inutilizable.

Confirmé experimentalmente con un probe:
- `parseInci("Aqua*, Glycerin**, Cetearyl Alcohol*, Parfum")` →
  `['Aqua*', 'Glycerin**', 'Cetearyl Alcohol*', 'Parfum']` (3 unknowns).
- `Cetearyl Alcohol*` accidentalmente matcheaba vía el fallback
  multi-palabra de `substringMatch` (la key `"cetearyl alcohol"` está
  contenida en `"cetearyl alcohol*"`), pero los single-word
  (`Aqua*`, `Glycerin**`, `Parfum*`) no tenían ningún safety net.
- `classify("Aqua*, Sodium Cocoyl Isethionate*, Glycerin*, Parfum*")`
  → VERIFICAR con 100% unknown.

El flujo OCR mitigaba *parcialmente* via `correctInciText` (Levenshtein),
pero (a) sólo en pasta directa del usuario no se aplica, (b) tokens cortos
con maxDistance=0 (≤4 chars) seguían fallando, (c) gastar Levenshtein
para algo que es claramente un marker presentacional es desperdicio.

### Comportamiento esperado
`parseInci` normaliza markers que no son parte del nombre INCI,
permitiendo que el lookup exacto matchee igual que con la INCI "limpia".
Compatible con el comportamiento previo: ingredientes sin markers
producen exactamente los mismos tokens que antes.

Casos a respetar (regresiones inversas):
- Locantes numéricos con coma (`2-Oleamido-1,3-Octadecanediol`) intactos.
- Guiones internos en nombres químicos (`PEG-7`, `C12-15 Alkyl Benzoate`)
  intactos — no confundirlos con bullets de lista.
- Ofensores reales con marker (`Sodium Lauryl Sulfate*`) siguen siendo
  ofensores — el strip no oculta nada.

### Implementación
1. **`src/classifier.js`** — extraje un helper interno
   `stripAnnotationMarkers(t)` que se aplica a cada token después del
   split por coma. Aplica:
   - Trim básico (`[ ."\t]+` en bordes) — comportamiento previo.
   - Bracket wrapper `^\[(...)\]$` → contenido (corchetes envolventes
     completos, no parciales).
   - Bullet/dash inicial `^[•▪\-–—]\s+` (sólo si seguido por whitespace,
     para no comerse el guión de `1-Octadecanediol`).
   - Loop iterativo de stripping de marcadores y porcentajes finales
     hasta estabilizar (idempotente). Maneja casos combinados como
     `Aqua* 70%` o `Glycerin **`.
   - Patrones constantes a nivel de módulo:
     - `TRAILING_FOOTNOTE_PATTERN = /\s*[*°^†‡²³¹⁰-⁹]+\s*$/`
     - `TRAILING_PERCENT_PATTERN = /\s+\d+(?:[.,]\d+)?\s*%\s*$/`
     - `LEADING_BULLET_PATTERN = /^[•▪\-–—]\s+/`
     - `WRAPPING_BRACKETS_PATTERN = /^\[([^\[\]]+)\]$/`
2. `splitInciTokens` ahora invoca `stripAnnotationMarkers(restored)` en
   vez del trim inline, manteniendo idéntica la fase de
   normalización de separadores y protección de comas en locantes.

`correctInciText` (en `src/fuzzy.js`) usa `splitInciTokens` y por lo
tanto hereda el stripping automáticamente — sin cambios necesarios en
fuzzy.js. Esto también elimina el desperdicio de Levenshtein sobre
tokens con markers presentacionales.

### Componentes afectados
Frontend: motor de clasificación / parser INCI. UI, OCR, telemetría y
backend intactos. La firma externa de `splitInciTokens` y `parseInci`
no cambia (mismas in/out shapes).

### Archivos modificados
- `src/classifier.js`
  - 4 patrones de regex constantes nuevos a nivel de módulo.
  - Helper interno `stripAnnotationMarkers(t)` (idempotente, loop
    estabilizador para combos).
  - `splitInciTokens` ahora usa el helper en vez del trim inline.
  - Comentarios in-source documentan el porqué (referencia a este fix).
- `tests/test_classifier.mjs` — 15 tests nuevos:
  - Asteriscos simples y dobles (`Aqua*`, `Glycerin**`).
  - Dagas † ‡, grado °, caret ^.
  - Superíndices Unicode (¹ ² ³).
  - Corchetes envolventes (`[Aqua]`, `[Glycerin*]`).
  - Viñetas/dashes iniciales (`•`, `–`, `—`).
  - Porcentajes finales (`70%`, `0.1%`, `0,1%`).
  - Combinado (`Aqua* 70%`).
  - Regresión inversa: locantes numéricos no se rompen.
  - Regresión inversa: PEG-7 / C12-15 (guiones internos) intactos.
  - Regresión integral: INCI 100% orgánica con `*` → APTO 0 unknowns.
  - Regresión seguridad: sulfato con asterisco sigue siendo NO APTO.
  - Idempotencia: `parseInci(parseInci(x))` estable.

### Tests
- `tests/test_classifier.mjs`: **49/49** pasaron (era 34, +15).
- `tests/test_fuzzy.mjs`: **14/14** pasaron (sin cambios, hereda strip
  vía `splitInciTokens`).
- `tests/test_categories.mjs`: **10/10** pasaron (sin cambios).
- Total: **73/73** pasan. Golden set de 18 productos intacto.

### Riesgo / regresiones consideradas
- Los 18 golden products no contienen markers, así que su comportamiento
  no cambia. Confirmado por el suite verde.
- El `LEADING_BULLET_PATTERN` exige whitespace después del bullet, así
  que `1-Octadecanediol`, `2-Oleamido…`, `C12-15 Alkyl Benzoate` y
  `PEG-7 Phosphate` no se ven afectados (sus guiones no llevan espacio
  posterior). Test explícito incluido.
- El loop de stripping itera hasta estabilizar — bound natural por
  reducción de longitud, sin riesgo de bucle infinito.
- `correctInciText` ya usa `splitInciTokens`, así que el flujo OCR
  también gana el strip sin cambios extra. Tests de fuzzy confirman
  que no rompe.
- Service worker / cache: ningún hash inmutable; no requiere bump del
  cache version.
- Telemetría: shape de `classify()` igual; los tokens en `unknown`
  ahora son los nombres reales (sin markers) — UX más limpia, sin
  cambios de schema.

### Follow-ups / deuda técnica observada
- Quedó un `_probe.mjs` vacío en la raíz de `curlycheck/` (artefacto
  de exploración; truncado por el sync issue entre Edit tool y bash
  sandbox documentado en entradas previas). No es referenciado por
  ningún runner; conviene removerlo en una run futura cuando el
  sandbox lo permita. Sigue la misma situación de los `_probe*` de
  2026-05-05/06.
- Caso no cubierto: markers en posición intermedia (ej. `Aqua* and
  Glycerin` dentro de un mismo token compuesto). En la práctica las
  INCI usan `*` sólo al final del nombre individual, así que la
  prioridad es baja.
- Caso no cubierto: símbolos de marcas registradas (`®`, `™`) pegados
  al nombre. Suelen aparecer en nombres comerciales más que INCI,
  pero si surge se puede sumar al `TRAILING_FOOTNOTE_PATTERN` —
  cambio trivial.
- Posible mejora futura: detectar y filtrar lineas tipo `+/-`,
  `May Contain:` (color additives variables) que algunas marcas
  añaden al final de la INCI. Hoy esos tokens caen como `unknown`;
  si el ratio sube mucho podrían forzar VERIFICAR espurio. Pendiente
  de evidencia con datos reales.

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
