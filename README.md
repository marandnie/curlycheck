# Curly Check — PWA

App web progresiva (PWA) que escanea productos capilares por código de barras, consulta Open Beauty Facts y devuelve un veredicto Método Curly. Después se envuelve con Bubblewrap (TWA) para subir a Google Play.

**URL de producción:** `https://www.mandieto.com.ar/curlycheck/`

---

## Estructura del proyecto

```
curlycheck/
├── index.html                      # Shell HTML
├── styles.css                      # Estilos (paleta menta + crema)
├── manifest.webmanifest            # Manifiesto PWA
├── service-worker.js               # SW: cache offline + estrategia OBF
├── icons/
│   ├── icon-192.png                # Placeholder — reemplazar por arte final
│   ├── icon-512.png                # idem
│   ├── icon-maskable-512.png       # idem (versión adaptive icon Android)
│   └── favicon.png
├── src/
│   ├── app.js                      # Lógica principal + routing + cámara
│   ├── classifier.js               # Motor de clasificación (port de Python)
│   ├── ingredients.js              # Catálogo + rulesets
│   ├── obf.js                      # Cliente Open Beauty Facts
│   └── shelf.js                    # Estantería local (localStorage)
├── tests/
│   └── test_classifier.mjs         # 22 tests con golden set
├── .well-known/
│   └── assetlinks.json             # Para verificar TWA en Play Store (poner en raíz del dominio)
└── README.md
```

---

## Correr en local

Cualquier servidor estático sirve. Con Python:

```bash
cd curlycheck
python3 -m http.server 8080
```

Y abrir `http://localhost:8080/`. Ojo: en local el `start_url` del manifest apunta a `/curlycheck/`, así que para que funcione el SW vas a querer servirlo bajo ese path:

```bash
# Crear un dir wrapper que matchee la URL de prod
mkdir -p /tmp/serve/curlycheck && cp -r . /tmp/serve/curlycheck/
cd /tmp/serve && python3 -m http.server 8080
# → http://localhost:8080/curlycheck/
```

Para probar la cámara y la lectura de barcode necesitás HTTPS (o `localhost` directo) — Chrome no expone `getUserMedia` en HTTP regular.

---

## Correr los tests

```bash
node tests/test_classifier.mjs
```

Esperado: **22 passed**. Los mismos 18 productos del Excel + 4 tests de comportamiento que ya pasan en Python — paridad total entre ambas implementaciones.

---

## Deploy a tu dominio (CI/CD GitHub → mandieto.com.ar)

Asumiendo que tu pipeline ya copia archivos estáticos a `mandieto.com.ar`:

1. **Subí esta carpeta al repo** bajo `curlycheck/` (path relativo a la raíz del sitio).
2. **Subí `assetlinks.json` a `https://www.mandieto.com.ar/.well-known/assetlinks.json`** — debe estar en la raíz del dominio, no en `/curlycheck/.well-known/`. Si tu setup actual no permite servir `.well-known` desde la raíz, configurá el host para que esa ruta exista.
3. **Verificá los headers** una vez deployado:
   - `manifest.webmanifest` debe servirse con `Content-Type: application/manifest+json` (algunos hosts lo sirven bien automáticamente; si no, agregá una regla MIME).
   - `service-worker.js` con `Content-Type: application/javascript` y SIN cache header agresivo (idealmente `Cache-Control: no-cache` para que actualice en cada visita).
4. **Probá la PWA**: entrá desde un Android, tocá el menú de Chrome → "Agregar a pantalla de inicio". Tendría que aparecer el ícono Curly Check en el launcher.

---

## Subir a Google Play (TWA con Bubblewrap)

Bubblewrap es la tool oficial de Google para envolver una PWA en un Android App Bundle (AAB). El proceso, en orden:

### 1. Instalar Bubblewrap

```bash
npm i -g @bubblewrap/cli
```

Necesitás también JDK 17 y Android SDK (Bubblewrap los descarga la primera vez si no los tenés).

### 2. Inicializar el proyecto TWA

Desde una carpeta separada (no dentro de `curlycheck/`):

```bash
bubblewrap init --manifest=https://www.mandieto.com.ar/curlycheck/manifest.webmanifest
```

Te va a preguntar:
- **Domain:** `www.mandieto.com.ar`
- **App name:** Curly Check
- **Package ID:** `ar.com.mandieto.curlycheck` (este valor también está en `assetlinks.json` — mantenelos en sync).
- **Display mode:** standalone
- **Status bar color:** `#4FD1A8`
- Generar signing key: SÍ (la primera vez). **Guardá el `.keystore` y el password en un lugar seguro** — lo vas a necesitar para cada update.

### 3. Sacar el SHA-256 del keystore y completar `assetlinks.json`

```bash
keytool -list -v -keystore ./android.keystore -alias android | grep "SHA256"
```

Copiá el fingerprint con `:` cada dos hex chars (ej. `12:AB:34:...`) y pegalo en `assetlinks.json`, reemplazando `REEMPLAZAR_CON_FINGERPRINT_DEL_KEYSTORE_DE_RELEASE`. Re-deployá `assetlinks.json` al dominio.

**Importante:** Si Play Console activa "Play App Signing" (recomendado y por default en cuentas nuevas), Google reemplaza tu keystore con el suyo. Vas a tener que tomar el SHA-256 desde Play Console > Setup > App signing > "App signing key certificate" y agregar TAMBIÉN ese fingerprint a `assetlinks.json` (es un array — podés tener múltiples).

### 4. Build del AAB

```bash
bubblewrap build
```

Produce `app-release-bundle.aab` en la carpeta del proyecto. Ese es el archivo que se sube a Play Console.

### 5. Subir a Play Console

1. En Play Console > tu app > **Producción** (o **Pruebas internas** primero, recomendado): "Crear nueva versión".
2. Subir `app-release-bundle.aab`.
3. Completar los metadatos (descripción, capturas de pantalla, ícono de 512x512, política de privacidad — la app necesita una página de privacidad pública, podés alojarla en `mandieto.com.ar/curlycheck/privacy`).
4. Para una primera publicación, Google te puede pedir 12+ testers internos antes de habilitar producción (regla nueva 2025+). Si es tu caso, empezá con la pista de **pruebas internas**.

### 6. Probar antes de publicar

- Subí el AAB a Pruebas Internas → invitate a vos misma con el link de tester → instalá desde Play Store en un Android real.
- La barra de estado y la URL no deberían aparecer (señal de que `assetlinks.json` matchea bien). Si aparece la barra de URL, la verificación falló — re-chequeá fingerprint y la URL pública del archivo.

---

## Limitaciones de v1 (aceptables para el MVP)

- **Sin OCR:** si el barcode no funciona, la usuaria pega la INCI manualmente. Tesseract.js queda como mejora futura.
- **Sin Tier 3 LLM-vision:** sin backend.
- **Cobertura OBF baja para productos profesionales** (~20-30% para Kérastase / L'Oréal Pro). Para el resto, ingreso manual.
- **Sin auth ni multi-device sync:** la estantería vive en `localStorage` del navegador. Si la usuaria desinstala la PWA pierde los datos.

---

## Roadmap próximas iteraciones

1. **Tesseract.js** para OCR on-device cuando OBF no resuelve y el usuario quiera fotografiar la INCI.
2. **Flujo "contribuir a OBF"** post-resultado, para popular los productos que faltan.
3. **Backup en la nube** (Firebase Firestore o un Supabase free tier) para sync entre dispositivos.
4. **Tier 3 con Claude vision** (Cloudflare Worker mínimo que llame a la API).
5. **Cuentas y compartir** — permitir compartir la lista de productos APTOS con otra usuaria.

---

## Atribución

Datos de productos: [Open Beauty Facts](https://world.openbeautyfacts.org) (CC-BY-SA 4.0). Mostrar siempre la atribución en la UI (ya está en el footer).
