# Curly Check — PWA

App web progresiva (PWA) para verificar si un producto capilar cumple el **Método Curly**. Funciona escaneando el código de barras, leyendo la INCI con OCR, o buscando el producto por nombre. Después se puede envolver con Bubblewrap para publicar en Google Play.

**URLs:**
- Demo: `https://marandnie.github.io/curlycheck/`
- Producción: `https://www.mandieto.com.ar/curlycheck/`

---

## ¿Qué hace?

1. **Escaneás un producto** por una de tres vías:
   - Cámara apuntada al código de barras (lectura automática con `BarcodeDetector` nativo).
   - Foto de la etiqueta de ingredientes (OCR on-device con Tesseract.js + recorte manual de la zona INCI).
   - Búsqueda por nombre en la base local + Open Beauty Facts.
2. **La app clasifica la INCI** contra un ruleset configurable (estándar, estricto o laxo) y devuelve:
   - Veredicto **APTO / NO APTO / VERIFICAR**.
   - Sub-veredictos por categoría: Sulfatos, Siliconas, Alcoholes secantes, Aceites minerales.
   - Lista de ingredientes ofensores con la razón.
3. **Guardás el producto en tu estantería**. Funciona offline en localStorage; si iniciás sesión con Google se sincroniza con Firestore para que veas tus productos en cualquier dispositivo.

---

## Features

### Identificación del producto
- **Lectura de barcode automática** con `BarcodeDetector` nativo (Chrome Android). Fallback a entrada manual cuando no está disponible.
- **OCR de etiquetas** con Tesseract.js (offline después de la primera carga; ~3 MB cacheados en IndexedDB).
- **Cropper en canvas**: tras subir una foto, podés arrastrar un rectángulo sobre la zona INCI para que el OCR sólo lea esa parte. Mejora notablemente la precisión.
- **Galería + cámara**: el input de archivo deja elegir entre tomar una foto y elegir una existente.
- **Auto-corrección de OCR**: aplica fuzzy match (Levenshtein) contra el catálogo INCI para corregir errores típicos del OCR antes de clasificar (ej. *Sodum Lawreth Sulfate → Sodium Laureth Sulfate*).
- **Búsqueda por nombre** unificada que combina la base local curada y Open Beauty Facts. Cada hit muestra de qué fuente viene.

### Clasificación
- **Catálogo de ~140 ingredientes** con aliases multilingües (español, inglés).
- **Tres rulesets**: Estándar (Oh My Rula), Estricto (CGM purista), Laxa (low-poo).
- **Sub-veredictos por categoría** con chips visuales.
- **Parser INCI robusto**: maneja correctamente locantes numéricos como `2-Oleamido-1,3-Octadecanediol`, separadores múltiples, vernáculos como `Aqua/Water/Eau`.

### Estantería
- **Backend pluggable**: localStorage cuando no hay login, Firestore cuando sí.
- **Detección de duplicados con prompt**: si guardás un producto que ya está, te pregunta si reemplazar la versión vieja, guardar como otro item, o cancelar.
- **Edición de items**: corregís nombre, marca, INCI; al guardar se reclasifica.
- **Eliminación con confirmación**.
- **Migración local → cloud** automática al iniciar sesión por primera vez con datos locales.

### Auth (opcional)
- **Google Sign-In con Firebase Auth**. Popup-first con fallback a redirect.
- **Avatar de Google** o iniciales como fallback.
- **Reglas de Firestore** que aíslan la data por uid (cada usuaria sólo ve la suya).
- Si Firebase no está configurado, la app sigue funcionando 100% local sin login.

### Compartir
- **Web Share API** + fallback a clipboard + fallback final a prompt.
- Texto formateado: veredicto, chips de categoría, ingredientes a evitar, link a la app. Sin URL duplicada en WhatsApp.

### PWA
- **Instalable** desde Chrome Android (Add to Home Screen).
- **Offline** después de la primera visita (service worker cachea el shell).
- **Logo clickeable** que vuelve a la home sin recargar.
- **Páginas de soporte**: `privacy.html` (política de privacidad para Play Console) y `glossary.html` (glosario de 19 términos).

---

## Estructura del proyecto

```
curlycheck/
├── index.html                  # Shell + las 5 vistas (scan, result, edit, ocr, shelf)
├── privacy.html                # Política de privacidad
├── glossary.html               # Glosario de términos
├── styles.css                  # Estilos (paleta menta + crema)
├── manifest.webmanifest        # Manifiesto PWA
├── service-worker.js           # SW: cache shell + fresh OBF + bypass auth
├── firestore.rules             # Reglas de seguridad por uid
├── icons/                      # 4 PNG (192, 512, maskable, favicon)
├── .well-known/
│   └── assetlinks.json         # Para verificación de TWA en Play Store
├── docs/
│   └── firebase-setup.md       # Guía paso a paso de setup Firebase
├── src/
│   ├── app.js                  # Lógica principal: routing + handlers
│   ├── classifier.js           # Motor de clasificación + categorySummary
│   ├── ingredients.js          # Catálogo + 3 rulesets
│   ├── obf.js                  # Cliente Open Beauty Facts
│   ├── local-products.js       # Base local curada + búsqueda por nombre
│   ├── search.js               # Unificación local + OBF
│   ├── ocr.js                  # Tesseract.js + preprocesamiento
│   ├── cropper.js              # Recorte de imagen en canvas
│   ├── fuzzy.js                # Levenshtein + auto-corrección INCI
│   ├── shelf.js                # Orquestador local/cloud
│   ├── cloud-shelf.js          # Adapter Firestore
│   ├── auth.js                 # Wrapper Firebase Auth
│   ├── firebase-config.js      # Config (público — ver más abajo)
│   ├── firebase-config.example.js  # Template
│   └── share.js                # Web Share API
└── tests/
    ├── test_classifier.mjs     # 27 tests (golden set + parser)
    ├── test_fuzzy.mjs          # 11 tests
    └── test_categories.mjs     # 8 tests
```

Para una vista detallada de qué hace cada módulo y cómo se relacionan, ver **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Correr en local

Cualquier servidor estático sirve. Con Python:

```bash
# El path que importa es /curlycheck/ (matchea el scope del SW)
mkdir -p /tmp/serve/curlycheck && cp -r . /tmp/serve/curlycheck/
cd /tmp/serve && python3 -m http.server 8080
# → http://localhost:8080/curlycheck/
```

Para que funcionen cámara, OCR y Firebase Auth necesitás HTTPS o `localhost` directo.

---

## Correr los tests

```bash
node tests/test_classifier.mjs    # 27 tests
node tests/test_fuzzy.mjs         # 11 tests
node tests/test_categories.mjs    # 8 tests
```

Total esperado: **46 passed**.

---

## Setup Firebase (login y sync de estantería)

Sin Firebase configurado, la app funciona 100% local con la estantería en localStorage. Para activar el login con Google y la sincronización en la nube:

1. Seguí la guía paso a paso en [`docs/firebase-setup.md`](./docs/firebase-setup.md). Toma ~25 minutos.
2. Pegá tus credenciales en `src/firebase-config.js` (la `apiKey` de Firebase Web es **pública por diseño** — la seguridad real la dan las Firestore Rules + Authorized Domains, no es necesario ocultarla).
3. Asegurate de que tu dominio (`marandnie.github.io`, `www.mandieto.com.ar`, etc.) esté en **Authorized domains** de Firebase Auth.

---

## Deploy a tu dominio

1. Subí la carpeta al repo. La app vive bajo `/curlycheck/` (manifest scope).
2. Subí `assetlinks.json` a `https://<dominio>/.well-known/assetlinks.json` — **raíz del dominio, no del subpath**. Necesario para TWA.
3. Headers recomendados:
   - `*.html`, `*.js`, `*.css`, `*.webmanifest`: cache normal.
   - `service-worker.js`: **`Cache-Control: no-cache`** (sino las usuarias quedan en versiones viejas para siempre).

Después del primer deploy, verificá:
```bash
curl -I https://<tu-dominio>/curlycheck/
curl -I https://<tu-dominio>/curlycheck/manifest.webmanifest
curl -I https://<tu-dominio>/curlycheck/service-worker.js
curl -I https://<tu-dominio>/.well-known/assetlinks.json
```
Las 4 deben devolver 200.

---

## Subir a Google Play (TWA con Bubblewrap)

Resumen — para el detalle ver el flujo completo en `docs/firebase-setup.md` (sección Play Store).

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://<dominio>/curlycheck/manifest.webmanifest
# Respondé las preguntas. La primera vez genera un keystore — guardalo.

# Sacar el SHA-256 y pegarlo en assetlinks.json
keytool -list -v -keystore ./android.keystore -alias android | grep "SHA256"
# Re-deployá assetlinks.json al dominio.

# Si Play activó Play App Signing (default), tomar también el SHA-256 de
# Play Console → Setup → App signing y agregarlo al array de assetlinks.

bubblewrap build
# → genera app-release-bundle.aab → subir a Play Console
```

**Importante:** la primera publicación suele requerir 12+ testers internos antes de habilitar producción.

---

## Roadmap

### Pendientes con valor alto
- **Flujo "contribuir a OBF"** post-OCR: cada producto que la usuaria procese por OCR podría aportar a Open Beauty Facts para cubrir la brecha de productos profesionales (~70% sin INCI hoy).
- **Filtros y orden en la estantería** (por marca, veredicto, fecha).
- **Sub-veredictos clickeables** que linkeen al término correspondiente del glosario.
- **Indicador "sincronizando…"** durante operaciones de Firestore.

### Pendientes con valor medio
- Modo oscuro.
- **Tier 3 con Claude vision** como fallback cuando OCR falla. Requiere backend (Cloudflare Worker o similar).
- **Compartir estantería con otras usuarias** (collaborative shelves).
- **i18n inglés** para Play Store global.
- **Auto-rotación de imagen** si el envase se subió de costado.

### Infraestructura para Play Store
- Bubblewrap setup + AAB firmado + SHA-256 en `assetlinks.json`.
- Capturas de pantalla, descripción para Play Console.

---

## Atribución

Datos de productos: [Open Beauty Facts](https://world.openbeautyfacts.org) (CC-BY-SA 4.0). La atribución está visible en el footer de la app.
