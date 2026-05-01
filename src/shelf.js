// Estantería con backend pluggable:
// - Si hay usuaria autenticada (Firebase) → usa Firestore (cloud).
// - Si no → usa localStorage (modo offline).
//
// La API pública es asíncrona en ambos casos para que el caller no se entere
// de cuál backend está activo.

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
    return this.read().sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  },
  findById(id) {
    if (!id) return null;
    return this.read().find(function(it) { return it.id === id; }) || null;
  },
  findByBarcode(barcode) {
    if (!barcode) return null;
    return this.read().find(function(it) { return it.barcode === barcode; }) || null;
  },
  add(item, opts) {
    opts = opts || {};
    const items = this.read();
    let id = item.id;
    if (!id) {
      // Sólo deduplicar por barcode si NO se pidió forceNew
      if (!opts.forceNew && item.barcode) {
        const existing = items.find(function(it) { return it.barcode === item.barcode; });
        if (existing) id = existing.id;
      }
      if (!id) id = crypto.randomUUID();
    }
    const next = Object.assign({}, item, { id, savedAt: item.savedAt || Date.now() });
    const idx = items.findIndex(function(it) { return it.id === id; });
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], next);
    else items.unshift(next);
    this.write(items);
    return next;
  },
  remove(id) {
    const items = this.read().filter(function(it) { return it.id !== id; });
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

export async function findById(id) {
  return isLogged() ? cloud.findById(id) : local.findById(id);
}

export async function findByBarcode(barcode) {
  return isLogged() ? cloud.findByBarcode(barcode) : local.findByBarcode(barcode);
}

export async function add(item, opts) {
  return isLogged() ? cloud.add(item, opts) : local.add(item, opts);
}

export async function remove(id) {
  return isLogged() ? cloud.remove(id) : local.remove(id);
}

export async function clearShelf() {
  return isLogged() ? cloud.clearAll() : local.clear();
}

// ---------------------------------------------------------------------------
// Migración local → cloud
// ---------------------------------------------------------------------------
export function localCount() { return local.count(); }
export function localItems() { return local.getAll(); }
export function clearLocal() { local.clear(); }

export async function migrateLocalToCloud(opts) {
  opts = opts || { clearAfter: true };
  if (!isLogged()) throw new Error("Hace falta estar logueada para migrar");
  const items = local.getAll();
  if (items.length === 0) return { migrated: 0 };
  await cloud.importMany(items);
  if (opts.clearAfter) local.clear();
  return { migrated: items.length };
}
