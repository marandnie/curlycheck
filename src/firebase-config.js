// Copia inicial de firebase-config.example.js — REEMPLAZAR con tus credenciales.
// Mientras no se configure, la app corre 100% local (sin login).
// Ver docs/firebase-setup.md para los pasos.

export const FIREBASE_CONFIG = {
  apiKey: "REEMPLAZAR",
  authDomain: "REEMPLAZAR.firebaseapp.com",
  projectId: "REEMPLAZAR",
  storageBucket: "REEMPLAZAR.appspot.com",
  messagingSenderId: "REEMPLAZAR",
  appId: "REEMPLAZAR",
};

export const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "REEMPLAZAR";
