# Curly Check — Architecture

Documento técnico de la arquitectura interna de la app. Para una guía de uso o de deploy, ver `README.md`.

---

## Stack

- **Sin bundler ni framework**. JavaScript vanilla con `<script type="module">` y módulos ES nativos.
- HTML + CSS + JS estáticos. El proyecto entero se sirve desde un host de archivos estáticos (GitHub Pages, Vercel, hosting tradicional).
- **Lazy load** de dependencias pesadas:
  - Firebase (Auth + Firestore) se carga sólo si `FIREBASE_ENABLED` es `true`.
  - Tesseract.js se carga sólo cuando la usuaria abre la vista OCR por primera vez.
- **PWA** con service worker propio (cache estratégico por origen).

Por qué no React/Vue/Svelte: la app es pequeña (~2300 líneas src), la usuaria principal no es desarrolladora full-time, y mantener cero deps simplifica el deploy en GitHub Pages sin pipeline. Si llegáramos a necesitar componentes complejos, migrar a Lit o Preact sería viable sin reescribir el motor.

---

## Árbol de archivos

```
curlycheck/
├── index.html                  # Shell HTML con las 5 vistas (scan, result, edit, ocr, shelf)
├── privacy.html, glossary.html # Páginas estáticas auxiliares
├── styles.css                  # Estilos globales (paleta menta + crema)
├── manifest.webmanifest        # Manifiesto PWA (scope: /curlycheck/)
├── service-worker.js           # SW: cache shell + bypass auth + cache OBF/jsdelivr
├── firestore.rules             # Reglas de seguridad de Firestore
├── icons/                      # PNG 192/512/maskable + favicon
├── .well-known/assetlinks.json # Verificación de TWA en Play Store
├── docs/firebase-setup.md      # Guía operativa
├── src/                        # Lógica JS (15 módulos, ~2300 líneas)
└── tests/                      # 3 suites Node.js (46 tests)
```

---

## Módulos JS y responsabilidades

| Módulo | Responsabilidad | Importa de |
| --- | --- | --- |
| `app.js` | Orquesta la UI, el routing entre vistas y conecta los demás módulos. **No tiene lógica de dominio** — sólo eventos y render. | todos los demás |
| `classifier.js` | Motor: parsea INCI, lookup contra el catálogo, calcula veredicto y sub-veredictos por categoría. **Sin side effects.** | `ingredients.js` |
| `ingredients.js` | Catálogo de ~140 ingredientes con aliases y categorías + 3 rulesets (estándar / strict / lenient). | — |
| `fuzzy.js` | Levenshtein + auto-corrección de tokens INCI contra el catálogo. | `ingredients.js` |
| `obf.js` | Cliente HTTP de Open Beauty Facts (lookup por barcode + búsqueda por nombre). | — |
| `local-products.js` | Base local curada de productos (por barcode + por nombre) y helpers de búsqueda. | — |
| `search.js` | Unifica `local-products` + `obf` para búsqueda por nombre. Prioriza local. | `local-products.js`, `obf.js` |
| `ocr.js` | Carga lazy de Tesseract.js, preprocesamiento de imagen (grayscale + contraste), `recognize` API y `cleanInciText`. | — |
| `cropper.js` | Widget de recorte sobre canvas: drag, handles, extracción a resolución original. | — |
| `shelf.js` | API pública de la estantería. Decide entre backend local (`localStorage`) y cloud (Firestore) según haya usuaria autenticada. | `auth.js`, `cloud-shelf.js` |
| `cloud-shelf.js` | Adapter Firestore (CRUD + dedupe por barcode + import bulk para migración). | `auth.js` |
| `auth.js` | Wrapper de Firebase Auth: load lazy del SDK, popup-first con fallback a redirect, `onAuthChanged`. | `firebase-config.js` |
| `firebase-config.js` | Credenciales públicas Firebase + flag `FIREBASE_ENABLED`. | — |
| `share.js` | Web Share API + clipboard fallback. Construye el texto a compartir. | — |

---

## Vistas y routing

La app es una **single-page** con 5 vistas (`<section class="view">` en `index.html`):

```
view-scan ─→ view-result ─→ view-edit
   ↑          ↓
   │       view-ocr (cuando no hay INCI)
   ↓
view-shelf
```

El "router" es la función `showView(name)` en `app.js` que:
1. Aplica `is-active` al `<section>` correspondiente.
2. Sincroniza el estado del header (botones de nav, logo).
3. Apaga la cámara si salimos de la vista de scan.
4. Re-renderiza la estantería si entramos a `view-shelf`.

No hay history API ni URLs por vista — es navegación interna. Si el día de mañana quisiéramos deep-linking (`?barcode=X`), se agregaría un `popstate` listener.

---

## Estado en memoria

Centralizado en `state` (objeto global de `app.js`):

```js
{
  view: "scan",                  // string del view actual
  current: { /* item */ },       // resultado actual visible
  currentCategorySummary: {...}, // sub-veredictos del current
  ruleset: "standard",           // ruleset activo
  videoStream: MediaStream,      // stream de cámara activo
  detectorLoop: intervalId,      // loop del BarcodeDetector
  scanned: Set<barcode>,         // dedupe de barcodes leídos
  ocrContext: {...},             // contexto al entrar a view-ocr
  editTarget: {...},             // item bajo edición en view-edit
}
```

---

## Modelo de datos

### Item de estantería
```ts
{
  id: string,           // UUID generado al guardar
  name: string,
  brand: string,
  barcode: string|null,
  inci: string,         // INCI tal como se guardó (puede tener correcciones manuales)
  verdict: "APTO" | "NO APTO" | "VERIFICAR",
  ruleset: string,      // ej. "Estándar Oh My Rula"
  source: string,       // "Open Beauty Facts · 1234", "Base local", "OCR (foto)", etc.
  savedAt: number,      // timestamp ms
}
```

### Firestore
- Colección por usuaria: `users/{uid}/shelf/{itemId}`.
- Reglas (`firestore.rules`): cada usuaria sólo puede leer/escribir bajo su propio `uid`.
- Dedupe por barcode: al guardar, si ya existe item con mismo barcode (sin `forceNew`), se reusa el id existente (upsert).

### Catálogo de ingredientes (en `ingredients.js`)
```ts
{
  name: string,           // INCI canónico
  category: Category,     // sulfate, silicone_insoluble, etc.
  aliases?: string[],     // sinónimos / vernáculos
  explanation?: string,   // texto que se muestra al ofender
  severity: "high" | "medium" | "low" | "allowed",
}
```

### Ruleset
```ts
{
  name: string,
  forbiddenCategories: Set<Category>,
  extraForbidden: Set<string>,    // ingredientes específicos prohibidos
  extraAllowed: Set<string>,      // ingredientes específicos permitidos
  unknownThreshold: number,       // si > X% de tokens no se reconocen → VERIFICAR
}
```

---

## Flujos principales

### 1. Lectura por barcode (camino feliz)

```
Cámara abierta
  └─→ BarcodeDetector detecta EAN-13
      └─→ handleBarcode(code)
          ├─→ lookupLocal(code)         ← base local primero
          │   └─→ classify() → mostrar
          └─→ fetchByBarcode(code)      ← OBF como segunda opción
              ├─→ con INCI → classify() → mostrar
              └─→ sin INCI → showResultStub(allowOcr=true)
                  └─→ usuaria toca "Escanear ingredientes"
                      └─→ flujo OCR
```

### 2. Flujo OCR

```
Usuaria selecciona archivo (cámara o galería)
  └─→ Cropper.loadFile(file)              ← canvas + rect inicial centrado
      └─→ Usuaria arrastra/redimensiona el rect
          └─→ click "Recortar y leer"
              └─→ Cropper.extractCrop()    ← canvas a resolución original
                  └─→ recognize(canvas)     ← Tesseract.js
                      └─→ cleanInciText()   ← normalización de texto
                          └─→ correctInciText()  ← fuzzy contra catálogo
                              └─→ textarea editable + classify()
```

### 3. Flujo de búsqueda por nombre

```
Usuaria tipea en search-input
  └─→ runSearch()
      └─→ searchByName(query)
          ├─→ searchLocalByName()     ← scoring por tokens en común
          └─→ obf.searchByName()      ← API search de OBF, top 5
      └─→ render hits con tag local/obf
          └─→ click → classify() o fallback OCR
```

### 4. Flujo de login + sync

```
Usuaria toca "Ingresar con Google"
  └─→ signInWithPopup() → ok → onAuthChanged(user)
      └─→ renderAuthUI(user)
      └─→ if (era anónima && tiene shelf local) maybeOfferMigration()
          └─→ confirm → migrateLocalToCloud() → clearLocal()
  Si popup falla:
  └─→ signInWithRedirect() → vuelve con state → getRedirectResult()
```

### 5. Flujo de guardado con detección de duplicado

```
btn-save-shelf click
  └─→ shelf.findByBarcode(current.barcode)
      ├─→ no existe → shelf.add(payload)
      ├─→ existe con misma INCI → shelf.add(payload)  ← upsert silencioso
      └─→ existe con INCI distinta → confirm("Reemplazar?")
          ├─→ ok → shelf.add(payload)                  ← sobreescribe
          ├─→ cancel → confirm("Guardar aparte?")
          │   ├─→ ok → shelf.add(payload, {forceNew: true})
          │   └─→ cancel → no hacer nada
```

---

## Service worker (estrategia de cache)

Cache versioning: cuando se cambia algo del shell, se bumpea `CACHE_VERSION` (ej. `curlycheck-v8`). El SW elimina los caches viejos en `activate`.

| Origen | Estrategia | Por qué |
| --- | --- | --- |
| Firebase Auth (`*.firebaseapp.com`, `*.googleapis.com`, `/__/auth/`) | **Bypass total** (no interceptar) | El handler de auth necesita llegar directo a la red, sin caché ni intermediación. |
| Open Beauty Facts | **Network-first** con fallback a cache | Los datos de OBF cambian con frecuencia (la comunidad agrega INCI). Queremos siempre lo más fresco. Si no hay red, cache. |
| Tesseract CDN (`cdn.jsdelivr.net`, `tessdata.projectnaptha.com`) | **Cache-first** | Son archivos grandes (~3 MB) y nunca cambian. Conviene servirlos del cache. |
| Shell (HTML, JS, CSS, manifest, íconos) | **Cache-first** | Cambian con cada deploy. La invalidación se maneja con `CACHE_VERSION`. |

---

## Testing

Tests Node.js sin frameworks externos. Cada suite se ejecuta como módulo ES standalone:

```
tests/
├── test_classifier.mjs   27 tests: golden set de 18 productos + parser
├── test_fuzzy.mjs        11 tests: Levenshtein + correcciones típicas de OCR
└── test_categories.mjs    8 tests: sub-veredictos por ruleset
```

**Golden set** (18 productos curados) ancla los veredictos esperados — cualquier cambio en el catálogo o el parser que rompa estos veredictos hace fallar el CI. Es el cinturón de seguridad principal.

---

## Decisiones de diseño que vale la pena documentar

### 1. ¿Por qué `apiKey` de Firebase commiteada al repo?
Es un identificador público por diseño de Firebase Web. La seguridad real la dan las **Firestore Rules** (cada usuaria sólo accede a `users/{uid}/...`) y los **Authorized Domains** de Auth. Esconderla en un secret no agrega seguridad y complica el deploy. Ver `docs/firebase-setup.md` para más detalle.

### 2. ¿Por qué OBF como fuente primaria con tan baja cobertura?
El spike inicial (en `clasificador/obf_spike.py`) midió ~20% de cobertura para Kérastase y ~0% para L'Oréal Pro Absolut Repair. La decisión fue mantener OBF de todos modos porque:
- La cobertura mejora con el tiempo (OBF es comunitaria).
- Para productos masivos no profesionales (Pantene, TRESemmé, Sedal) la cobertura es alta.
- El flujo de contribución a OBF (pendiente) cerrará la brecha cuando se implemente.

Mientras tanto, la base local curada cubre los productos profesionales conocidos.

### 3. ¿Por qué auto-corrección por fuzzy match en lugar de un modelo más sofisticado?
- Levenshtein con umbral dinámico (1 char en strings de 6 letras, 2 en 12, etc.) cubre los errores típicos de Tesseract con mínima complejidad.
- Cero dependencias adicionales.
- Es deterministico y rápido (< 5 ms para una INCI completa).
- Si en el futuro queremos algo mejor, un embedding del catálogo + cosine similarity sería el siguiente paso, pero el costo/beneficio no lo justifica hoy.

### 4. ¿Por qué localStorage + Firestore en lugar de IndexedDB local?
- `localStorage` es sincrónico y simple para las dimensiones del problema (estanterías típicas < 200 items).
- Si en el futuro guardamos imágenes o crece mucho, migrar el local a IndexedDB es un cambio acotado a `shelf.js`.

### 5. Parser de comas dentro de números químicos
El parser INCI splittea por coma, pero comas como `2-Oleamido-1,3-Octadecanediol` son parte del nombre IUPAC. Solución: antes del split, reemplazamos `(\d),(\d)` por un placeholder unicode, splitteamos, y al final restauramos. Cubre también `1,2-Hexanediol` y similares.

### 6. Popup-first con fallback a redirect en Auth
Chrome viene endureciendo el manejo de third-party cookies. `signInWithRedirect` depende de cookies del `authDomain` y a veces falla silenciosamente al volver. `signInWithPopup` evita el problema en desktop y mobile moderno; cuando el popup está bloqueado o no soportado, caemos a redirect.

---

## Cómo extender

### Sumar un ingrediente al catálogo
1. Editar `src/ingredients.js` y la versión Python en `clasificador/curly_classifier/ruleset.py` (mantener en sync).
2. Si tiene aliases comunes (multilingües, abreviaciones), incluirlos.
3. Correr `node tests/test_classifier.mjs` para verificar que no rompe el golden set.

### Sumar un producto a la base local
1. Editar `src/local-products.js`.
2. Si tenés el barcode, agregalo a `LOCAL_PRODUCTS` (mapa por barcode).
3. Si sólo tenés el nombre, agregá entrada a `LOCAL_PRODUCTS_BY_NAME`.

### Sumar un nuevo ruleset
1. Editar `src/ingredients.js`, agregar al `RULESETS` con `forbiddenCategories`, `extraForbidden`, `extraAllowed`, `unknownThreshold`.
2. Sumar la opción al `<select id="ruleset-select">` en `index.html`.
3. Agregar tests en `tests/test_categories.mjs` cubriendo el comportamiento esperado.

### Sumar una nueva vista
1. Crear `<section id="view-X" class="view">...</section>` en `index.html`.
2. La función `showView("X")` en `app.js` ya la maneja automáticamente.
3. Si la vista necesita prep al entrar, agregar lógica en `showView`.

---

## Glosario rápido

| Término | Significado |
| --- | --- |
| **INCI** | International Nomenclature of Cosmetic Ingredients. Lista estándar de ingredientes en etiquetas. |
| **OBF** | Open Beauty Facts. Base de datos colaborativa de cosméticos. |
| **Ruleset** | Conjunto de reglas que define qué ingredientes están prohibidos para clasificar APTO/NO APTO. |
| **TWA** | Trusted Web Activity. Mecanismo de Android para envolver una PWA en una app nativa. |
| **PWA** | Progressive Web App. Web app instalable con service worker. |
| **Bubblewrap** | CLI de Google que genera el AAB de un TWA. |

Para definiciones de ingredientes (sulfato, silicona, alcohol secante, etc.) ver `glossary.html`.
