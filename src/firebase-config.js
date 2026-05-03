// Copia inicial de firebase-config.example.js — REEMPLAZAR con tus credenciales.
// Mientras no se configure, la app corre 100% local (sin login).
// Ver docs/firebase-setup.md para los pasos.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBNWHtpw2wX67MOt5V5vEFVQZw49PWtSho",
  authDomain: "curly-check.firebaseapp.com",
  projectId: "curly-check",
  storageBucket: "curly-check.firebasestorage.app",
  messagingSenderId: "604770209644",
  appId: "1:604770209644:web:72a89403e6f252dd936d49",
  measurementId: "G-837X8V3X3T"
};

export const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "REEMPLAZAR";