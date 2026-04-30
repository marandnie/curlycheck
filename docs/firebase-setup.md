# Setup Firebase para Curly Check (sync de estantería con login Google)

Esta guía te lleva paso a paso desde "no tengo nada" hasta "el login con Google funciona y la estantería se sincroniza". Tiempo estimado: 20–30 minutos.

> **Nota**: si dejás `firebase-config.js` con sus valores `"REEMPLAZAR"` por defecto, la app sigue funcionando 100% offline con la estantería en localStorage. El botón de login simplemente no aparece. Esto es opcional.

---

## 1. Crear el proyecto Firebase

1. Andá a [console.firebase.google.com](https://console.firebase.google.com).
2. Click en **"Add project"** (o "Agregar proyecto").
3. Nombre: `curlycheck` (o lo que prefieras).
4. Google Analytics: **opcional** — recomiendo desactivarlo para no agregar otra dependencia. Lo podés activar después.
5. Esperá a que termine de crearlo (~30 s).

---

## 2. Registrar la app web

1. En el dashboard del proyecto, click en el ícono **`</>`** ("Add app" → Web).
2. Nickname: `curlycheck-web`.
3. **NO actives Firebase Hosting** (deployás vos misma).
4. Click "Register app".
5. Te muestra un objeto de config. Algo así:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "curlycheck-xxxxx.firebaseapp.com",
  projectId: "curlycheck-xxxxx",
  storageBucket: "curlycheck-xxxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

**Copialo.** Lo vamos a pegar en `src/firebase-config.js`.

---

## 3. Activar Auth con Google

1. En la consola de Firebase: **Build → Authentication → Get started**.
2. Pestaña **Sign-in method** → click en **Google**.
3. Toggle **Enable**.
4. **Project support email**: tu email (`mandieto@gmail.com`).
5. **Save**.

### 3.1 Authorized domains

En la misma página de Authentication → **Settings** → **Authorized domains**. Por defecto trae `localhost` y `<projectId>.firebaseapp.com`. Hay que sumar los dominios donde vas a servir la app:

- `marandnie.github.io` (si usás GitHub Pages)
- `www.mandieto.com.ar`
- `mandieto.com.ar`

**Si no agregás el dominio acá, el login va a fallar con `auth/unauthorized-domain`.**

---

## 4. Activar Firestore

1. **Build → Firestore Database → Create database**.
2. Modo: **Production mode** (Test mode también funciona pero expira en 30 días).
3. Región: **eur3 (europe-west)** o **southamerica-east1** (São Paulo). São Paulo da menos latencia desde Argentina.
4. Click **Enable**.

### 4.1 Reglas de seguridad

1. Pestaña **Rules**.
2. Borrá lo que está y pegá el contenido de `firestore.rules` (está en la raíz de este repo).
3. Click **Publish**.

Esas reglas garantizan que cada usuaria solo accede a su propia subcolección `users/{uid}/shelf/`.

---

## 5. Pegar el config en el repo

1. Abrí `src/firebase-config.js`.
2. Reemplazá los valores `"REEMPLAZAR"` con los de tu config (paso 2.5).
3. Verificá que `FIREBASE_ENABLED` quede en `true` (lo hace automático cuando `apiKey` deja de ser `"REEMPLAZAR"`).
4. Commit + push.

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "curlycheck-xxxxx.firebaseapp.com",
  projectId: "curlycheck-xxxxx",
  storageBucket: "curlycheck-xxxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef...",
};
```

> **Sobre la "API key" expuesta**: esa key NO es secreta. Cualquiera puede ver la config en el inspector del navegador. La seguridad real la dan las **Firestore Rules** + los **Authorized Domains** de Auth. Por eso es OK commitearla. Esto es por diseño en Firebase web.

---

## 6. Probarlo

1. Servir local con HTTPS o `localhost` (la auth requiere uno de los dos):

   ```bash
   cd curlycheck
   python3 -m http.server 8080
   # → http://localhost:8080/  (NO uses la IP de la red local)
   ```

2. Abrí en Chrome → click "Ingresar con Google" → debería redirigir, autenticar y volver a la app con tu nombre/avatar arriba.
3. Si tenés productos en la estantería local, te va a preguntar "¿querés sincronizarlos a tu cuenta?". Decí que sí.
4. Verificá en Firebase Console → Firestore que aparezca `users/{tu-uid}/shelf/` con los items.

---

## 7. Para Play Store (TWA)

Cuando empaquetes con Bubblewrap y subas a Play Console, hay que registrar el SHA-256 del keystore en Firebase Auth para que el sign-in funcione dentro de la app Android:

1. Sacá el SHA-256 del keystore (Bubblewrap te lo muestra al hacer build, o con `keytool -list -v -keystore ./android.keystore`).
2. **Importante**: si activaste Play App Signing (default en cuentas nuevas), Google reemplaza tu keystore con el suyo. Tomá el SHA-256 desde Play Console > Setup > App signing > "App signing key certificate".
3. Firebase Console → **Project settings** → pestaña **General** → tu app web → tampoco — esto es para apps **Android** nativas. Para TWA / PWA, **el SHA-256 NO se registra en Firebase Auth**. La auth en TWA usa el dominio web normal (que ya está en Authorized domains).

**Lo que sí necesitás para TWA:**
- `assetlinks.json` correcto (cubierto en el README principal).
- El dominio del manifest está en Authorized domains de Auth (ya lo hicimos en paso 3.1).

---

## Solución de problemas

**`auth/unauthorized-domain`** → El dominio no está en Authorized domains (paso 3.1).

**`auth/popup-blocked` o el redirect loopea** → Estamos usando `signInWithRedirect` que es más confiable. Si seguís viendo problemas, verificá que tu service worker no esté interceptando la URL `/__/auth/handler` de Firebase. El SW actual filtra solo `openbeautyfacts.org` y `cdn.jsdelivr.net`, así que debería estar OK.

**El botón "Ingresar" no aparece** → `FIREBASE_ENABLED` está en `false`. Mirá `src/firebase-config.js` — la `apiKey` debe ser distinta a `"REEMPLAZAR"`.

**Login funciona pero la estantería sigue local** → Mirá la consola del browser. Si aparece "missing or insufficient permissions", revisa las Firestore Rules (paso 4.1).

**Cambié de cuenta y veo la estantería de la otra** → Service worker cacheado. Forzá refresh con Ctrl+Shift+R, o desregistrá el SW desde DevTools → Application → Service Workers → Unregister.

---

## Costos

Free tier de Firebase es muy generoso para esta app:
- **Auth**: 50K MAU gratis.
- **Firestore**: 1 GB storage, 50K lecturas/día, 20K escrituras/día.

Asumiendo 1000 usuarias activas guardando ~30 productos cada una, eso es ~30K documentos = mucho menos del free tier. No deberías pagar nada.
