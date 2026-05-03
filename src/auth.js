// Auth wrapper sobre Firebase Auth.
// - Carga lazy los SDKs de Firebase desde el CDN modular (sin bundler).
// - Expone signInWithGoogle / signOut / onAuthChanged / getCurrentUser.
// - Si Firebase no está configurado (FIREBASE_ENABLED = false), todas las
//   funciones son no-ops y onAuthChanged emite un único {user: null}.
// - Usa signInWithRedirect (más confiable que popup en móviles y en TWA).

import { FIREBASE_CONFIG, FIREBASE_ENABLED } from "./firebase-config.js";

const FB_VERSION = "10.13.0";
const APP_URL = `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-auth.js`;
const FS_URL = `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-firestore.js`;

let initPromise = null;
let _app = null;
let _auth = null;
let _db = null;
const _listeners = new Set();
let _currentUser = null;

/**
 * Inicialización lazy. La primera vez que se llama, carga los SDKs y
 * Firebase. En llamadas siguientes devuelve la promesa cacheada.
 * Si FIREBASE_ENABLED es false, devuelve null sin tocar la red.
 */
export async function initAuth() {
  if (!FIREBASE_ENABLED) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import(/* @vite-ignore */ APP_URL),
      import(/* @vite-ignore */ AUTH_URL),
      import(/* @vite-ignore */ FS_URL),
    ]);

    _app = initializeApp(FIREBASE_CONFIG);
    _auth = authMod.getAuth(_app);
    _db = fsMod.getFirestore(_app);

    // Procesar redirect result si venimos de un signInWithRedirect
    try {
      const result = await authMod.getRedirectResult(_auth);
      if (result && result.user) {
        console.info("[auth] redirect login OK:", result.user.email);
      } else {
        console.info("[auth] no pending redirect result.");
      }
    } catch (e) {
      console.error("[auth] getRedirectResult error:", e.code, e.message, e);
      // Mostramos un alert sólo si el error es específico de auth (no ruido genérico)
      if (e.code && e.code.startsWith("auth/")) {
        // No alert acá — auth.js no debería tocar UI directamente. La UI lo descubre
        // por onAuthChanged (que recibirá null) o miramos console para diagnosticar.
      }
    }

    // Suscribirse a cambios de auth
    authMod.onAuthStateChanged(_auth, (user) => {
      _currentUser = user;
      for (const cb of _listeners) {
        try { cb(user); } catch (e) { console.warn(e); }
      }
    });

    return { app: _app, auth: _auth, db: _db, authMod, fsMod };
  })();

  return initPromise;
}

/**
 * Sign-in con Google. Estrategia:
 *   1. signInWithPopup primero (más confiable en GitHub Pages + Chrome moderno
 *      que ya bloquea third-party cookies necesarias para el redirect).
 *   2. Si el popup está bloqueado o el navegador no lo soporta → fallback a
 *      signInWithRedirect.
 */
export async function signInWithGoogle() {
  if (!FIREBASE_ENABLED) {
    throw new Error("Firebase no configurado. Mirá docs/firebase-setup.md.");
  }
  const ctx = await initAuth();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = ctx.authMod;
  const provider = new GoogleAuthProvider();
  provider.addScope("email");

  try {
    await signInWithPopup(ctx.auth, provider);
    return;
  } catch (e) {
    console.warn("[auth] popup failed:", e.code, e.message);
    // Errores que indican que el usuario simplemente canceló: no caer a redirect
    if (
      e.code === "auth/popup-closed-by-user" ||
      e.code === "auth/cancelled-popup-request" ||
      e.code === "auth/user-cancelled"
    ) {
      throw e;
    }
    // Si el popup está bloqueado o el entorno no lo soporta, intentamos redirect
    if (
      e.code === "auth/popup-blocked" ||
      e.code === "auth/operation-not-supported-in-this-environment" ||
      e.code === "auth/internal-error"
    ) {
      console.warn("[auth] cayendo a signInWithRedirect…");
      await signInWithRedirect(ctx.auth, provider);
      return;
    }
    // Cualquier otro error: re-lanzar para que la UI lo muestre
    throw e;
  }
}

/** Cierra sesión. */
export async function signOut() {
  if (!FIREBASE_ENABLED) return;
  const ctx = await initAuth();
  await ctx.authMod.signOut(ctx.auth);
}

/** Suscribe un callback a cambios de estado de auth. Devuelve unsubscribe. */
export function onAuthChanged(cb) {
  _listeners.add(cb);
  // Disparar con el estado actual al suscribirse
  try { cb(_currentUser); } catch (e) { console.warn(e); }
  return () => _listeners.delete(cb);
}

/** User actual (null si no logeado o si Firebase no está configurado). */
export function getCurrentUser() {
  return _currentUser;
}

/** Acceso interno al objeto Firestore (lo usa cloud-shelf.js). */
export async function getDb() {
  if (!FIREBASE_ENABLED) return null;
  const ctx = await initAuth();
  return { db: ctx.db, fsMod: ctx.fsMod };
}
