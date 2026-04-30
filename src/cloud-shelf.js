// Cloud shelf — adapter de Firestore para la estantería.
// Estructura: users/{uid}/shelf/{itemId}
//
// Item shape: { id, name, brand, barcode, inci, verdict, ruleset, source, savedAt }

import { getDb, getCurrentUser } from "./auth.js";

function shelfCol(fsMod, db, uid) {
  return fsMod.collection(db, "users", uid, "shelf");
}

export async function getAll() {
  const user = getCurrentUser();
  if (!user) return [];
  const ctx = await getDb();
  if (!ctx) return [];
  const { db, fsMod } = ctx;
  const q = fsMod.query(
    shelfCol(fsMod, db, user.uid),
    fsMod.orderBy("savedAt", "desc"),
  );
  const snap = await fsMod.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function add(item) {
  const user = getCurrentUser();
  if (!user) throw new Error("No hay usuario autenticado");
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;
  const id = item.id || (item.barcode || crypto.randomUUID());
  const next = {
    name: item.name || "",
    brand: item.brand || "",
    barcode: item.barcode || null,
    inci: item.inci || "",
    verdict: item.verdict || "VERIFICAR",
    ruleset: item.ruleset || "",
    source: item.source || "",
    savedAt: item.savedAt || Date.now(),
  };
  const ref = fsMod.doc(db, "users", user.uid, "shelf", id);
  await fsMod.setDoc(ref, next, { merge: true });
  return { id, ...next };
}

export async function remove(id) {
  const user = getCurrentUser();
  if (!user) return;
  const ctx = await getDb();
  if (!ctx) return;
  const { db, fsMod } = ctx;
  const ref = fsMod.doc(db, "users", user.uid, "shelf", id);
  await fsMod.deleteDoc(ref);
}

export async function clearAll() {
  const items = await getAll();
  await Promise.all(items.map((it) => remove(it.id)));
}

/** Migrar una lista de items desde local a la nube (upsert). */
export async function importMany(items) {
  for (const it of items) {
    await add(it);
  }
}
