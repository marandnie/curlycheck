// Firebase config — TEMPLATE
// Copiá este archivo como `firebase-config.js` y reemplazá los valores con
// los de tu proyecto Firebase (Console > Project settings > General > Your apps).
//
// La apiKey de Firebase para web NO ES SECRETA — es un identificador público.
// La seguridad real la dan las Firestore Security Rules y los Authorized
// Domains de Firebase Auth. Por eso es seguro commitear este archivo si
// querés (aunque por convención lo dejamos en .gitignore).
//
// Si NO configurás Firebase, la app sigue funcionando 100% offline con la
// estantería en localStorage. El login simplemente no aparece.

export const FIREBASE_CONFIG = {
  apiKey: "REEMPLAZAR",
  authDomain: "REEMPLAZAR.firebaseapp.com",
  projectId: "REEMPLAZAR",
  storageBucket: "REEMPLAZAR.appspot.com",
  messagingSenderId: "REEMPLAZAR",
  appId: "REEMPLAZAR",
};

// Si dejás el apiKey como "REEMPLAZAR", el módulo de auth detecta que no
// está configurado y la app corre sin login (modo 100% local).
export const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "REEMPLAZAR";
