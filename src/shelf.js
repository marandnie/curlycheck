// Estantería con backend pluggable:
// - Si hay usuaria autenticada (Firebase) → usa Firestore (cloud).
// - Si no → usa localStorage (modo offline).
//
// La API pública es asíncrona en ambos casos para que el caller no se entere
// de cuál backend está activo.
//
// El módulo también expone helpers de migración: cuando una usuaria sin login
// hace sign-in y tiene productos en localStorage, podemos ofrecerle subirlos
// a la nube.

import { getCurrentUser } from "./auth.js";
import * as cloud from "./cloud-shelf.js";

const KEY = "curlycheck.shelf.v1";

// ---------------------------------------------------------------------------
// Local backend (localStorage)
// ---------------------------------------------------------------------------
const local = {
  read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },
  write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  },
  getAll() {
    return this.read().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },
  add(item) {
    const items = this.read();
    const id = item.id || (item.barcode || crypto.randomUUID());
    const next = { ...item, id, savedAt: item.savedAt || Date.now() };
    const idx = items.findIndex(
      (it) => it.id === id || (item.barcode && it.barcode === item.barcode),
    );
    if (idx >= 0) items[idx] = { ...items[idx], ...next };
    else items.unshift(next);
    this.write(items);
    return next;
  },
  remove(id) {
    const items = this.read().filter((it) => it.id !== id);
    this.write(items);
  },
  clear() {
    localStorage.removeItem(KEY);
  },
  count() {
    return this.read().length;
  },
};

// ---------------------------------------------------------------------------
// API pública — orquesta entre cloud y local
// ---------------------------------------------------------------------------
function isLogged() {
  return !!getCurrentUser();
}

export async function getAll() {
  return isLogged() ? cloud.getAll() : local.getAll();
}

export async function add(item) {
  if (isLogged()) return cloud.add(item);
  return local.add(item);
}

export async function remove(id) {
  if (isLogged()) return cloud.remove(id);
  return local.remove(id);
}

export async function clearShelf() {
  if (isLogged()) return cloud.clearAll();
  return local.clear();
}

// ---------------------------------------------------------------------------
// Migración local → cloud
// ---------------------------------------------------------------------------
/** Cantidad de items en localStorage (independiente del estado de auth). */
export function localCount() {
  return local.count();
}

/** Devuelve los items en localStorage (sin tocar el cloud). */
export function localItems() {
  return local.getAll();
}

/** Limpia el localStorage. Usar después de migrar exitosamente. */
export function clearLocal() {
  local.clear();
}

/** Sube los items locales al cloud y opcionalmente limpia el local. */
export async function migrateLocalToCloud(opts = { clearAfter: true }) {
  if (!isLogged()) throw new Error("Hace falta estar logueada para migrar");
  const items = local.getAll();
  if (items.length === 0) return { migrated: 0 };
  await cloud.importMany(items);
  if (opts.clearAfter) local.clear();
  return { migrated: items.length };
}
