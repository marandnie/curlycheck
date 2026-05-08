// Admin — capa de datos.
// Solo se usa cuando isAdmin(user) === true. La UI se monta condicionalmente
// desde app.js, pero la verdadera puerta de seguridad son las reglas de
// Firestore (ver docs/firestore-rules-admin.md): el cliente puede ocultar la
// vista, pero las rules son las que rechazan escrituras de cualquier otro user.
//
// Colecciones que toca:
//   admin/scans/items/{barcode}    — colección dedicada (solo Marina escribe)
//   telemetry/scans/events/*       — solo lectura, para uniques + stats globales
//   local-products.js              — referencia in-memory (cross-check de cobertura)

import { getDb, getCurrentUser } from "./auth.js";
import { LOCAL_PRODUCTS } from "./local-products.js";
import { fetchByBarcode } from "./obf.js";

// UID de la admin (Firebase Auth > Users). Usamos UID en lugar de email
// porque el repo es público en GitHub y el UID es opaco — no es PII, no sirve
// para spam ni phishing. La defensa real igual son las reglas de Firestore.
export const ADMIN_UID = "URXSAbooQiWPL2v8ck1uN1RFans1";

/** True si el user de Firebase Auth corresponde a la admin. */
export function isAdmin(user) {
  if (!user) return false;
  return user.uid === ADMIN_UID;
}

/** Asegura que el user actual sea admin antes de cualquier operación sensible. */
function assertAdmin() {
  const user = getCurrentUser();
  if (!isAdmin(user)) {
    throw new Error("Operación admin: usuario no autorizado.");
  }
  return user;
}

// ---------------------------------------------------------------------------
// admin/scans/items/{barcode}
// ---------------------------------------------------------------------------
// Estructura del doc:
//   { barcode, firstSeenAt, lastSeenAt, count, status, note, addedBy }
//
// status posibles:
//   "pendiente"    — recién escaneado, falta procesar
//   "contribuido"  — ya lo subí a OBF
//   "descartado"   — no lo voy a contribuir
// ---------------------------------------------------------------------------

const STATUS_VALUES = ["pendiente", "contribuido", "descartado"];

function adminCol(fsMod, db) {
  return fsMod.collection(db, "admin", "scans", "items");
}

/**
 * Registra un scan en admin/scans/items/{barcode}. Si el barcode ya existe,
 * incrementa count y actualiza lastSeenAt (NO sobreescribe status ni note).
 * Si es nuevo, lo crea con status "pendiente".
 *
 * @param {string} barcode
 * @param {string} [note]
 * @returns {Promise<{barcode:string, isNew:boolean, doc:Object}>}
 */
export async function recordAdminScan(barcode, note) {
  const user = assertAdmin();
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;

  const code = String(barcode || "").trim();
  if (!code) throw new Error("Barcode vacío");

  const ref = fsMod.doc(db, "admin", "scans", "items", code);
  const snap = await fsMod.getDoc(ref);
  const now = Date.now();

  if (snap.exists()) {
    const data = snap.data() || {};
    const next = {
      lastSeenAt: now,
      count: (data.count || 1) + 1,
    };
    if (note) next.note = note; // solo actualiza nota si se pasó una nueva
    await fsMod.setDoc(ref, next, { merge: true });
    return { barcode: code, isNew: false, doc: Object.assign({ barcode: code }, data, next) };
  }

  const doc = {
    barcode: code,
    firstSeenAt: now,
    lastSeenAt: now,
    count: 1,
    status: "pendiente",
    note: note || "",
    addedBy: user.email || "",
  };
  await fsMod.setDoc(ref, doc);
  return { barcode: code, isNew: true, doc };
}

/**
 * Trae todos los scans del admin, opcionalmente filtrando por status.
 * Ordenados por lastSeenAt desc.
 */
export async function getAdminScans(opts) {
  assertAdmin();
  opts = opts || {};
  const ctx = await getDb();
  if (!ctx) return [];
  const { db, fsMod } = ctx;

  const constraints = [fsMod.orderBy("lastSeenAt", "desc")];
  if (opts.status && STATUS_VALUES.indexOf(opts.status) !== -1) {
    constraints.unshift(fsMod.where("status", "==", opts.status));
  }
  const q = fsMod.query(adminCol(fsMod, db), ...constraints);
  const snap = await fsMod.getDocs(q);
  return snap.docs.map(function(d) { return Object.assign({ barcode: d.id }, d.data()); });
}

/** Cambia el status de un barcode del admin. */
export async function setStatus(barcode, status) {
  assertAdmin();
  if (STATUS_VALUES.indexOf(status) === -1) {
    throw new Error("Status inválido: " + status);
  }
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;
  const ref = fsMod.doc(db, "admin", "scans", "items", String(barcode));
  await fsMod.setDoc(ref, { status }, { merge: true });
}

/** Actualiza la nota de un barcode. */
export async function setNote(barcode, note) {
  assertAdmin();
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;
  const ref = fsMod.doc(db, "admin", "scans", "items", String(barcode));
  await fsMod.setDoc(ref, { note: String(note || "") }, { merge: true });
}

/** Borra un scan del admin. */
export async function removeAdminScan(barcode) {
  assertAdmin();
  const ctx = await getDb();
  if (!ctx) throw new Error("Firestore no disponible");
  const { db, fsMod } = ctx;
  const ref = fsMod.doc(db, "admin", "scans", "items", String(barcode));
  await fsMod.deleteDoc(ref);
}

// ---------------------------------------------------------------------------
// Telemetría — solo lectura
// ---------------------------------------------------------------------------

/**
 * Trae los últimos N events de telemetry/scans/events. Por defecto 2000,
 * suficiente para uniques y stats sin que la query se vuelva pesada.
 */
async function getTelemetryEvents(limit) {
  assertAdmin();
  limit = limit || 2000;
  const ctx = await getDb();
  if (!ctx) return [];
  const { db, fsMod } = ctx;
  // No hay timestamp preciso (la telemetría es anónima por día), así que
  // ordenamos por dayBucket desc y limitamos.
  const q = fsMod.query(
    fsMod.collection(db, "telemetry", "scans", "events"),
    fsMod.orderBy("dayBucket", "desc"),
    fsMod.limit(limit),
  );
  const snap = await fsMod.getDocs(q);
  return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
}

/**
 * Devuelve la lista de barcodes únicos vistos en telemetry/scans/events,
 * con count y último día visto. Ordenados por count desc.
 *
 * @returns {Promise<Array<{barcode, count, lastDay, name, brand}>>}
 */
export async function getUniqueTelemetryBarcodes(limit) {
  const events = await getTelemetryEvents(limit);
  const map = new Map();
  for (const ev of events) {
    const code = (ev.barcode || "").trim();
    if (!code) continue;
    const cur = map.get(code) || { barcode: code, count: 0, lastDay: "", name: "", brand: "" };
    cur.count += 1;
    if (ev.dayBucket && ev.dayBucket > cur.lastDay) cur.lastDay = ev.dayBucket;
    if (!cur.name && ev.name) cur.name = ev.name;
    if (!cur.brand && ev.brand) cur.brand = ev.brand;
    map.set(code, cur);
  }
  const list = Array.from(map.values());
  list.sort(function(a, b) { return b.count - a.count; });
  return list;
}

/**
 * Stats globales: scans/día (últimos 30 días), top productos por count,
 * top INCI desconocidos por frecuencia. Todo derivado de telemetry/scans/events.
 *
 * @returns {Promise<{
 *   totalEvents:number,
 *   scansPerDay: Array<{day:string, count:number}>,
 *   topProducts: Array<{name:string, brand:string, barcode:string, count:number}>,
 *   topUnknownIngredients: Array<{ingredient:string, count:number}>,
 *   verdictBreakdown: Array<{verdict:string, count:number}>,
 * }>}
 */
export async function getStats(limit) {
  const events = await getTelemetryEvents(limit);

  const scansByDay = new Map();
  const productCount = new Map();
  const unknownCount = new Map();
  const verdictCount = new Map();

  for (const ev of events) {
    const day = ev.dayBucket || "(sin fecha)";
    scansByDay.set(day, (scansByDay.get(day) || 0) + 1);

    const productKey = ev.barcode || (ev.name + "|" + ev.brand);
    const cur = productCount.get(productKey) || {
      name: ev.name || "",
      brand: ev.brand || "",
      barcode: ev.barcode || "",
      count: 0,
    };
    cur.count += 1;
    if (!cur.name && ev.name) cur.name = ev.name;
    if (!cur.brand && ev.brand) cur.brand = ev.brand;
    productCount.set(productKey, cur);

    const verdict = ev.verdict || "(sin veredicto)";
    verdictCount.set(verdict, (verdictCount.get(verdict) || 0) + 1);

    const unknowns = ev.unknownIngredients || [];
    for (const ing of unknowns) {
      const key = String(ing).toLowerCase().trim();
      if (!key) continue;
      unknownCount.set(key, (unknownCount.get(key) || 0) + 1);
    }
  }

  const scansPerDay = Array.from(scansByDay.entries())
    .map(function(e) { return { day: e[0], count: e[1] }; })
    .sort(function(a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });

  const topProducts = Array.from(productCount.values())
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 25);

  const topUnknownIngredients = Array.from(unknownCount.entries())
    .map(function(e) { return { ingredient: e[0], count: e[1] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 30);

  const verdictBreakdown = Array.from(verdictCount.entries())
    .map(function(e) { return { verdict: e[0], count: e[1] }; })
    .sort(function(a, b) { return b.count - a.count; });

  return {
    totalEvents: events.length,
    scansPerDay,
    topProducts,
    topUnknownIngredients,
    verdictBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Cross-reference local-products + OBF
// ---------------------------------------------------------------------------

/** True si el barcode ya está cubierto por la base local curada. */
export function isInLocalProducts(barcode) {
  if (!barcode) return false;
  return Object.prototype.hasOwnProperty.call(LOCAL_PRODUCTS, String(barcode));
}

/**
 * Consulta OBF por un barcode. Devuelve {found, name, brand, inci} sin
 * lanzar — los errores se mapean a found:false.
 */
export async function checkOBF(barcode) {
  if (!barcode) return { found: false };
  try {
    const r = await fetchByBarcode(String(barcode));
    if (r && r.found) {
      return { found: true, name: r.name || "", brand: r.brand || "", inci: r.inci || "" };
    }
    return { found: false };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Export CSV / JSON
// ---------------------------------------------------------------------------

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convierte un array de objetos a CSV con las columnas indicadas.
 * @param {Array<Object>} rows
 * @param {Array<string>} columns
 * @returns {string}
 */
export function toCSV(rows, columns) {
  const head = columns.map(csvEscape).join(",");
  const body = rows.map(function(r) {
    return columns.map(function(c) { return csvEscape(r[c]); }).join(",");
  }).join("\n");
  return head + "\n" + body;
}

export function toJSON(rows) {
  return JSON.stringify(rows, null, 2);
}

/** Dispara una descarga client-side. */
export function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
