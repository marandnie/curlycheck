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
      await authMod.getRedirectResult(_auth);
    } catch (e) {
      console.warn("Redirect result error:", e);
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

/** Inicia sign-in con Google usando redirect. */
export async function signInWithGoogle() {
  if (!FIREBASE_ENABLED) {
    throw new Error("Firebase no configurado. Mirá docs/firebase-setup.md.");
  }
  const ctx = await initAuth();
  const { GoogleAuthProvider, signInWithRedirect } = ctx.authMod;
  const provider = new GoogleAuthProvider();
  // Pedimos el email solamente (suficiente para identidad y sync)
  provider.addScope("email");
  await signInWithRedirect(ctx.auth, provider);
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
