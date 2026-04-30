// Estantería: persistencia de productos escaneados en localStorage.

const KEY = "curlycheck.shelf.v1";

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getAll() {
  return read().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/** item: { id, name, brand, barcode?, inci, verdict, ruleset, savedAt, source } */
export function add(item) {
  const items = read();
  const id = item.id || crypto.randomUUID();
  const next = { ...item, id, savedAt: item.savedAt || Date.now() };
  // upsert por id o por barcode
  const idx = items.findIndex(
    (it) => it.id === id || (item.barcode && it.barcode === item.barcode),
  );
  if (idx >= 0) items[idx] = { ...items[idx], ...next };
  else items.unshift(next);
  write(items);
  return next;
}

export function remove(id) {
  const items = read().filter((it) => it.id !== id);
  write(items);
}

export function clear() {
  localStorage.removeItem(KEY);
}
