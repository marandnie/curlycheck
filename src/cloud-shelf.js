// Cloud shelf — adapter de Firestore para la estantería.
// Estructura: users/{uid}/shelf/{itemId}

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
  return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
}

export async function findById(id) {
  const user = getCurrentUser();
  if (!user || !id) return null;
  const ctx = await getDb();
  if (!ctx) return null;
  const { db, fsMod } = ctx;
  const ref = fsMod.doc(db, "users", user.uid, "shelf", id);
  const snap = await fsMod.getDoc(ref);
  if (!snap.exists()) return null;
  return Object.assign({ id: snap.id }, snap.data());
}

export async function findByBarcode(barcode) {
  const user = getCurrentUser();
  if (!user || !barcode) return null;
  const ctx = await getDb();
  if (!ctx) return null;
  const { db, fsMod } = ctx;
  const q = fsMod.query(
    shelfCol(fsMod, db, user.uid),
    fsMod.where("barcode", "==", barcode),
    fsMod.limit(1),
  );
  const snap = await fsMod.getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return Object.assign({ id: d.id }, d.data());
}

export async function add(item, opts) {
  opts = opts || {};
  const user = getCurrentUser();
  if (!user) throw new Error("No hay usuario autenticado");
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;
  let id = item.id;
  if (!id && !opts.forceNew && item.barcode) {
    const existing = await findByBarcode(item.barcode);
    if (existing) id = existing.id;
  }
  if (!id) id = crypto.randomUUID();
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
  return Object.assign({ id }, next);
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
  await Promise.all(items.map(function(it) { return remove(it.id); }));
}

export async function importMany(items) {
  for (const it of items) await add(it);
}
