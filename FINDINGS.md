# Curly Check — Findings y pendientes (revisión 2026-06-12)

Revisión de código completa con vistas a publicar en Google Play (TWA via Bubblewrap).
**No se tocó código** — este documento solo lista hallazgos, con archivo:línea para ubicarlos.

Método: lectura de todos los módulos de `src/`, service worker, manifest, rules de Firestore,
docs y git status. Los bugs del clasificador fueron **verificados ejecutando el código real**
(no son hipótesis). Los 4 suites de tests existentes pasan (83/83).

---

## 🔴 P0 — Bloqueantes (resolver antes de cualquier deploy)

### 1. ~~`src/app.js` está roto en el working tree (SyntaxError)~~ ✅ RESUELTO (2026-06-12)
Se eliminó el bloque duplicado y el fragmento huérfano. Verificado: `node --check` OK,
tests 83/83 pasan. El diff vs HEAD quedó limpio (solo import + un bloque pre-warm).
Detalle original:
Las líneas ~1038–1041 tienen un fragmento huérfano (`});` sueltos) y el bloque
"Pre-warm del catálogo INCI" quedó **duplicado** (líneas 1026–1055). Parece un paste/merge fallido
al agregar la feature del catálogo extendido.

```
}  console.warn("SW register failed", e);   ← línea 1038
    });
  });
}
```

Verificado con `node --check`: `SyntaxError: Unexpected token '}'` en línea 1039.
Al ser un ES module, **la app entera no carga** si se deploya así. El commit anterior está sano;
el daño es solo en los cambios sin commitear.

**Fix:** dejar un solo bloque pre-warm y borrar el fragmento huérfano (líneas 1038–1055 sobran).

### 2. Trabajo de un mes sin commitear ni pushear
`git status`: modificados `service-worker.js`, `app.js`, `classifier.js`; sin trackear
`scripts/`, `src/data/` (8.3 MB), `src/inci-extended.js`, `tests/test_inci_extended.mjs`.
Último commit: **2026-05-08** (hace más de un mes). Toda la feature del catálogo extendido
vive solo en este disco. Riesgo de pérdida total + el deploy remoto está desactualizado.

**Fix:** arreglar el punto 1, decidir qué hacer con `inci-catalog.json` (ver P2-20) y commitear.

### 3. `assetlinks.json` con placeholder y en ubicación incorrecta
- `.well-known/assetlinks.json:8` dice `"REEMPLAZAR_CON_FINGERPRINT_DEL_KEYSTORE_DE_RELEASE"`.
  Sin el SHA-256 real, el TWA muestra la barra de URL de Chrome (no parece app nativa).
- **Ubicación:** Digital Asset Links se busca en la **raíz del origen**:
  `https://www.mandieto.com.ar/.well-known/assetlinks.json`. Hoy el archivo está dentro del
  proyecto y se serviría en `/curlycheck/.well-known/` — ahí Android **no lo encuentra**.
- Si se usa GitHub Pages: falta `.nojekyll` — Jekyll omite directorios que empiezan con punto,
  así que `.well-known/` probablemente ni se publica.
- Ojo con **Play App Signing**: el fingerprint que va en assetlinks es el del certificado
  que firma Play (Play Console → Setup → App signing), no solo el del keystore local.

### 4. Borrado de cuenta — requisito de Google Play (User Data policy)
La app permite crear cuenta (Google Sign-In) → Play exige **(a)** un flujo de borrado de cuenta
y datos *dentro de la app* y **(b)** una *URL web* para solicitar el borrado sin reinstalar.
Hoy `privacy.html:109` solo ofrece un mailto. Esto se declara en Play Console → App content →
Data safety y **puede bloquear la publicación**.

**Fix:** botón "Eliminar mi cuenta" (borrar `users/{uid}/**` + `deleteUser()` de Firebase Auth)
y una página/URL pública de solicitud de borrado.

---

## 🟠 P1 — Importantes (afectan el veredicto, datos o el panel admin)

### 5. Falsos positivos del clasificador por substring matching ⚠ verificado
`src/classifier.js:106-120` (`substringMatch`): para keys de una palabra ≥6 chars matchea si es
la primera o última palabra del token. Resultado (ejecutado contra el código real):

| Token real | Match incorrecto | Veredicto |
|---|---|---|
| Oleyl Alcohol (alcohol graso, OK curly) | `Alcohol` → drying_alcohol | **NO APTO falso** |
| Arachidyl Alcohol (graso) | `Alcohol` → drying_alcohol | **NO APTO falso** |
| Lanolin Alcohol | `Alcohol` → drying_alcohol | **NO APTO falso** |
| Amyl Cinnamyl Alcohol (fragancia) | `Alcohol` → drying_alcohol | **NO APTO falso** |
| PEG-8 Dimethicone (silicona **soluble**) | `Dimethicone` → insoluble | **NO APTO falso** |

Ya estaba anotado como deuda en `DAILY_LOG.md` ("conviene auditarlo") — confirmado: es bug real
y pega en productos curly comunes (los alcoholes grasos aparecen en todas partes).

**Ideas de fix:** antes del substring fallback, consultar `isKnownInci()` (si es un INCI oficial
desconocido para la lista curada, no adivinar); o exceptuar patrones `* Alcohol` / `PEG-* Dimethicone`
del fallback; o sumar los alcoholes grasos faltantes (Oleyl, Arachidyl, Isostearyl, Lanolin…) como
entradas exactas FATTY_ALCOHOL.

### 6. Chips de categoría mienten en rulesets permisivos ⚠ verificado
`src/classifier.js:224-227`: si la categoría no está prohibida por el ruleset, el estado queda
`"clean"` aunque haya matches. Con ruleset **lenient**, un producto con Dimethicone muestra el chip
**"✓ Sin Siliconas"** (verificado: `{"state":"clean","matches":[]}`). Es información factualmente
incorrecta — debería decir algo como "Siliconas (permitidas en este ruleset)".

### 7. Admin: listeners duplicados en cada render
`src/admin-ui.js:314` — `renderList()` llama `bindListEvents(container)` en **cada** render
(cambio de filtro, cross-check, reapertura del tab), y esos listeners (`change`, `blur`, `click`)
se acumulan sobre el mismo `#admin-list`. Tras N renders, borrar un item pide confirmación N veces
y `setStatus`/`setNote` se ejecutan N veces.

**Fix:** bindear una sola vez en `mountAdmin()` (como `bindTabs`) con delegación.

### 8. Estantería: reclasifica con ruleset hardcodeado y doble
`src/app.js:698-699` — al abrir un item de la estantería, `classify(it.inci, "standard")` se llama
**dos veces** (una para offenders, otra para unknown) e ignora `it.ruleset` y `state.ruleset`.
Si guardaste con "estricto", al reabrir ves offenders del "estándar" pero el tag del veredicto viejo.

### 9. Telemetría: cuenta "scans" que no son scans
`src/app.js:471` — `telemetry.recordScan(r)` se dispara en **cada** `renderResult()`: también al
abrir un item guardado de la estantería o al volver de una edición. Infla los números del panel
de stats. Filtrar por origen (solo barcode/OCR/búsqueda/manual nuevos).

### 10. Posible índice compuesto faltante en Firestore
`src/admin.js:111-115` — `getAdminScans({status})` combina `where("status","==",…)` +
`orderBy("lastSeenAt","desc")`: Firestore exige un **índice compuesto** para eso. Si nunca se creó,
el filtro por estado del tab "Mis scans" tira error. Verificar en Firebase Console (el error en
consola incluye link para crearlo).

### 11. `recordContribution()` nunca se llama
`src/telemetry.js:103` existe, las rules de `telemetry/contributions` existen
(`firestore.rules:37-41`), pero el botón "Contribuir a OBF" (`app.js:746`) no la invoca.
La métrica de contribuciones siempre va a estar en cero. Conectarla o eliminar ambas puntas.

### 12. Re-escaneo bloqueado tras "← Volver"
`state.scanned` solo se limpia con el botón "Otro" o el logo (`app.js:69, 519`). Si volvés del
resultado con "← Volver" (`app.js:517`) y apuntás al **mismo** producto, el detector lo ignora
en silencio (`app.js:122`). UX confusa: parece que el scanner murió.

---

## 🟡 P2 — Menores / deuda técnica

13. **`User-Agent` en fetch no funciona** — `src/obf.js:4`: los navegadores prohíben setear ese
    header; se ignora silenciosamente. Si querés identificarte ante OBF, no hay opción simple
    desde browser (es solo para que sepas que ese header hoy no hace nada).
14. **El preprocesado OCR no se usa en el flujo real** — `src/ocr.js:116-117`: si la fuente es un
    canvas (que es lo que entrega siempre el cropper), se saltea `preprocessImage()`
    (grayscale + contraste). Todo ese código corre solo para File/Image directos, camino que la UI
    ya no usa. Probable mejora de OCR gratis si se aplica al canvas también.
15. **Avatar con `onerror` inline frágil** — `app.js:927`: interpola `initials()` dentro de un
    string JS en un atributo HTML. Riesgo bajo (dato propio de Google), pero un displayName con
    comilla rompe el handler. Mejor un listener `error` desde JS.
16. **`escape()` no escapa comilla simple** — `app.js:711-715`. Hoy zafa porque los atributos van
    con comillas dobles, pero es una trampa a futuro. `admin-ui.js:593` tiene la versión completa —
    unificar.
17. **Manifest sin `id`** — `manifest.webmanifest`: recomendado para identidad estable de la PWA
    (y Bubblewrap lo aprovecha). `screenshots`/`shortcuts` opcionales pero suman para el listing.
18. **`cache.addAll` es atómico** — `service-worker.js:40`: si UN asset del SHELL devuelve 404 en
    el deploy, la instalación del SW nuevo falla en silencio y los usuarios quedan en la versión
    vieja. Chequear post-deploy (DevTools → Application → SW) o cachear con tolerancia.
19. **Versiones desincronizadas** — `telemetry.js:18` `APP_VERSION = "v9"` vs
    `service-worker.js:4` `CACHE_VERSION = "curlycheck-v17"`. La dimensión appVersion de la
    telemetría quedó congelada en v9.
20. **`src/data/inci-catalog.json` (7.4 MB) es peso muerto en runtime** — la app solo carga
    `inci-names.json` (932 KB) (`inci-extended.js:28`). El catálogo grande es artefacto intermedio
    del script Python. Si se commitea, infla repo y GitHub Pages. Sugerencia: `.gitignore` o
    moverlo fuera de `src/` (p. ej. `scripts/output/`).
21. **`.gitignore` mínimo** — solo tiene `.claude`. Sumar `.DS_Store`, `Thumbs.db`, etc.
22. **Telemetría sin protección anti-spam** — `firestore.rules:32-41` permite `create` sin auth
    (con schema validado, bien), pero nada impide spamear documentos. Antes de Play conviene
    **Firebase App Check** (Play Integrity) + restricciones de la API key en GCP (HTTP referrers
    a tus dominios). La key committeada es pública por diseño de Firebase — eso está OK — pero
    restringirla cuesta 5 minutos.
23. **`alert()`/`confirm()`/`prompt()` por todos lados** — dentro de un TWA se ven como diálogos
    pelados de Chrome. Ya está anotado en el código ("migrar a toast luego"); para la versión
    Play Store gana bastante con toasts/modales propios.
24. **Migración local→cloud borra lo local** (`shelf.js:108-116`, `clearAfter: true`): si después
    cerrás sesión, la estantería local quedó vacía. Decisión válida, pero documentarla/avisarla.

---

## ✅ Checklist Google Play (TWA con Bubblewrap)

Lo que ya está bien:

- [x] PWA instalable: manifest válido + service worker + HTTPS
- [x] Iconos 192 / 512 / maskable 512 (verificados, tamaños correctos)
- [x] `display: standalone`, `orientation: portrait`, `lang: es`
- [x] Política de privacidad en español (`privacy.html`) — falta solo confirmar URL pública final
- [x] Offline básico (shell precacheado) y OCR on-device
- [x] Package name elegido: `ar.com.mandieto.curlycheck`

Lo que falta:

- [ ] **Elegir origen canónico del TWA** (¿`www.mandieto.com.ar/curlycheck/` o GitHub Pages?).
      El share ya apunta a mandieto.com.ar (`share.js:6`). Todo lo de assetlinks depende de esto.
- [ ] **assetlinks.json en la raíz del dominio + fingerprint real** (ver P0-3)
- [ ] **Bubblewrap actualizado**: hoy Play exige target **API 35** (Android 15) para apps nuevas;
      desde el **31-08-2026** será API 36. Conviene regenerar el proyecto TWA con la última
      versión de Bubblewrap y no postergar el alta.
- [ ] **Borrado de cuenta in-app + URL web** (ver P0-4)
- [ ] **Data Safety form**: declarar estantería en Firestore (datos asociados a cuenta: email,
      nombre, foto del perfil Google + productos guardados) y la telemetría (default ON).
      Revisar si conviene pasarla a opt-in para simplificar la declaración.
- [ ] **Probar Google Sign-In dentro del TWA**: punto débil conocido (popup/redirect + cookies
      third-party con authDomain `curly-check.firebaseapp.com` distinto del dominio de la app).
      El fallback popup→redirect ya está (`auth.js:80-115`), pero hay que probarlo en el TWA real
      antes de publicar.
- [ ] **App Check + restricción de API key** (ver P2-22)
- [ ] **Assets del listing**: feature graphic 1024×500, mínimo 2 screenshots de teléfono,
      descripción corta/larga.
- [ ] **`.nojekyll`** si se publica por GitHub Pages.
- [ ] **Cuenta de developer** (USD 25 una vez). Ojo: para cuentas personales nuevas Play exige un
      período de **closed testing con ~12 testers durante 14 días** antes de poder pasar a
      producción — planificarlo (verificar el requisito vigente al crear la cuenta).
- [ ] Verificar que el deploy actual en ambas URLs esté al día (no pude confirmar online durante
      esta revisión).

Referencias: [target API levels](https://support.google.com/googleplay/android-developer/answer/11926878) ·
[requisito de borrado de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111) ·
[target SDK developer guide](https://developer.android.com/google/play/requirements/target-sdk)

---

## 📋 Pendientes de producto (ya anotados en el propio código/docs)

- `local-products.js:22` — Kérastase **Gloss Absolu Masque** (barcode 3474637303365) sigue sin
  INCI cargada ("sacarle foto al envase y pegarla acá").
- Los **17 productos del golden set** viven en `LOCAL_PRODUCTS_BY_NAME` sin barcode. El plan
  declarado (y preferido) es contribuirlos a **Open Beauty Facts** en lugar de mantenerlos
  hardcodeados — sigue pendiente.
- El flujo "Contribuir a OBF" es semi-manual (copia INCI + abre pestaña). OK como MVP; la
  telemetría de contribuciones nunca se conectó (ver P1-11).
- `DAILY_LOG.md` ya pedía auditar el substring matching → confirmado como bug real (P1-5).

---

## Sugerencia de orden de ataque

1. Arreglar `app.js` (P0-1) → commit + push de todo (P0-2). *~1 hora.*
2. Falsos positivos del clasificador (P1-5) + chips (P1-6), con tests nuevos. *Es lo que más
   afecta la confianza en el veredicto.*
3. Borrado de cuenta (P0-4) + Data Safety + App Check. *Requisitos Play.*
4. assetlinks + Bubblewrap + prueba de login en TWA (P0-3). *El empaquetado en sí.*
5. El resto de P1/P2 según ganas.
