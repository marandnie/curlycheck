// Admin UI — montada solo cuando isAdmin(user) === true.
// El shell HTML vive en index.html (#view-admin); este módulo lo puebla y
// engancha eventos cada vez que se entra a la vista.

import * as admin from "./admin.js";
import { contributeUrl } from "./obf.js";

let mounted = false;
let currentTab = "scanner";

// Estado del scanner del admin
const scannerState = {
  videoStream: null,
  detectorLoop: null,
  recentlySaved: new Set(), // dedupe corto plazo (5s) para que la cámara no spamee
};

// Caches de datos por tab
let listCache = [];
let uniquesCache = [];
const crossRefCache = new Map(); // barcode -> {inLocal, inOBF}

/** Punto de entrada — se llama cada vez que se navega a view-admin. */
export async function mountAdmin() {
  const root = document.getElementById("admin-content");
  if (!root) return;

  if (!mounted) {
    root.innerHTML = renderShell();
    bindTabs();
    bindScanner();
    bindListToolbar();
    bindUniquesToolbar();
    mounted = true;
  }

  // Refrescar siempre que se abre la vista
  await renderTab(currentTab);
}

/** Limpieza al salir de la vista admin. */
export function unmountAdmin() {
  stopAdminCamera();
}

// ---------------------------------------------------------------------------
// Shell HTML
// ---------------------------------------------------------------------------

function renderShell() {
  return `
    <div class="admin-tabs" role="tablist">
      <button class="admin-tab is-active" data-tab="scanner">📷 Scanner</button>
      <button class="admin-tab" data-tab="lista">📋 Mis scans</button>
      <button class="admin-tab" data-tab="uniques">🌍 Uniques (telemetría)</button>
      <button class="admin-tab" data-tab="stats">📊 Stats</button>
    </div>

    <div class="admin-tabpanel" data-panel="scanner">
      <div class="admin-scanner">
        <p class="muted">Modo inventario: cada lectura se guarda automáticamente. Si el barcode ya existe, suma al contador.</p>
        <div class="admin-scanner-cam">
          <video id="admin-cam" autoplay muted playsinline></video>
          <div class="admin-scanner-overlay">
            <div class="admin-scanner-frame"></div>
          </div>
          <div class="admin-saved-toast" id="admin-saved-toast" hidden>✓ Guardado</div>
          <div class="admin-saved-toast admin-saved-toast--again" id="admin-again-toast" hidden>↻ Ya estaba — sumé al contador</div>
        </div>
        <div class="admin-scanner-status" id="admin-scan-status">Listo</div>
        <div class="admin-scanner-controls">
          <button id="admin-btn-start-cam" class="btn btn-primary">Activar cámara</button>
          <button id="admin-btn-stop-cam" class="btn btn-ghost" hidden>Apagar cámara</button>
        </div>
        <details class="admin-manual">
          <summary>Ingresar a mano</summary>
          <div class="input-group">
            <input type="text" id="admin-barcode-manual" inputmode="numeric" placeholder="ej. 3474636968640" />
            <button id="admin-btn-manual-save" class="btn">Guardar</button>
          </div>
          <label class="admin-note-label">
            Nota opcional (queda guardada con el barcode)
            <input type="text" id="admin-barcode-note" placeholder="ej. encontrado en Farmacity Cabildo" />
          </label>
        </details>
      </div>
    </div>

    <div class="admin-tabpanel" data-panel="lista" hidden>
      <div class="admin-toolbar">
        <select id="admin-filter-status">
          <option value="">Todos</option>
          <option value="pendiente">Pendientes</option>
          <option value="contribuido">Contribuidos</option>
          <option value="descartado">Descartados</option>
        </select>
        <button id="admin-btn-export-csv" class="btn">⬇ CSV</button>
        <button id="admin-btn-export-json" class="btn">⬇ JSON</button>
        <button id="admin-btn-cross-ref" class="btn btn-ghost">🔍 Cross-check OBF</button>
      </div>
      <div id="admin-list-stats" class="admin-list-stats muted"></div>
      <div id="admin-list" class="admin-list"></div>
    </div>

    <div class="admin-tabpanel" data-panel="uniques" hidden>
      <p class="muted">Barcodes únicos vistos en telemetry/scans/events (últimos 2000 events). Útil para priorizar qué productos sumar a OBF.</p>
      <div class="admin-toolbar">
        <button id="admin-btn-export-uniques" class="btn">⬇ CSV</button>
      </div>
      <div id="admin-uniques" class="admin-list"></div>
    </div>

    <div class="admin-tabpanel" data-panel="stats" hidden>
      <div id="admin-stats"></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function bindTabs() {
  const root = document.getElementById("admin-content");
  if (!root) return;
  root.addEventListener("click", function(ev) {
    const target = ev.target.closest(".admin-tab");
    if (!target) return;
    const tab = target.dataset.tab;
    if (!tab) return;
    showTab(tab);
  });
}

function showTab(name) {
  currentTab = name;
  const root = document.getElementById("admin-content");
  if (!root) return;
  root.querySelectorAll(".admin-tab").forEach(function(b) {
    b.classList.toggle("is-active", b.dataset.tab === name);
  });
  root.querySelectorAll(".admin-tabpanel").forEach(function(p) {
    p.hidden = p.dataset.panel !== name;
  });
  if (name !== "scanner") stopAdminCamera();
  renderTab(name);
}

async function renderTab(name) {
  if (name === "lista") return renderList();
  if (name === "uniques") return renderUniques();
  if (name === "stats") return renderStats();
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function bindScanner() {
  const start = document.getElementById("admin-btn-start-cam");
  const stop = document.getElementById("admin-btn-stop-cam");
  const manualBtn = document.getElementById("admin-btn-manual-save");
  const manualInput = document.getElementById("admin-barcode-manual");

  if (start) start.addEventListener("click", startAdminCamera);
  if (stop) stop.addEventListener("click", stopAdminCamera);
  if (manualBtn) manualBtn.addEventListener("click", saveManual);
  if (manualInput) {
    manualInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveManual();
      }
    });
  }
}

async function startAdminCamera() {
  if (scannerState.videoStream) return;
  const cam = document.getElementById("admin-cam");
  const status = document.getElementById("admin-scan-status");
  const startBtn = document.getElementById("admin-btn-start-cam");
  const stopBtn = document.getElementById("admin-btn-stop-cam");
  if (!cam || !status) return;

  if (!window.isSecureContext) {
    status.textContent = "Tu navegador requiere HTTPS para usar la cámara.";
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = "Tu navegador no soporta acceso a cámara.";
    return;
  }

  try {
    scannerState.videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    cam.srcObject = scannerState.videoStream;
    if (startBtn) startBtn.hidden = true;
    if (stopBtn) stopBtn.hidden = false;

    if ("BarcodeDetector" in window) {
      status.textContent = "Apuntá al código…";
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      scannerState.detectorLoop = setInterval(async function() {
        try {
          const codes = await detector.detect(cam);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            await handleScannedBarcode(code);
          }
        } catch (e) { /* silent */ }
      }, 700);
    } else {
      status.textContent = "Tu navegador no detecta barcodes. Usá ingreso manual.";
    }
  } catch (e) {
    status.textContent = "No pudimos acceder a la cámara: " + e.message;
  }
}

function stopAdminCamera() {
  if (scannerState.detectorLoop) {
    clearInterval(scannerState.detectorLoop);
    scannerState.detectorLoop = null;
  }
  if (scannerState.videoStream) {
    scannerState.videoStream.getTracks().forEach(function(t) { t.stop(); });
    scannerState.videoStream = null;
  }
  const cam = document.getElementById("admin-cam");
  if (cam) cam.srcObject = null;
  const startBtn = document.getElementById("admin-btn-start-cam");
  const stopBtn = document.getElementById("admin-btn-stop-cam");
  if (startBtn) startBtn.hidden = false;
  if (stopBtn) stopBtn.hidden = true;
}

async function handleScannedBarcode(code) {
  if (!code) return;
  // Dedupe local: si ya escaneamos ese code en los últimos 5s, ignorar.
  if (scannerState.recentlySaved.has(code)) return;
  scannerState.recentlySaved.add(code);
  setTimeout(function() { scannerState.recentlySaved.delete(code); }, 5000);

  const status = document.getElementById("admin-scan-status");
  if (status) status.textContent = "Detectado: " + code;

  try {
    const noteInput = document.getElementById("admin-barcode-note");
    const note = noteInput ? noteInput.value : "";
    const result = await admin.recordAdminScan(code, note);
    showSavedToast(result.isNew);
    if (status) {
      status.textContent = result.isNew
        ? "Guardado: " + code
        : "Ya estaba — count " + (result.doc.count || 1);
    }
  } catch (e) {
    if (status) status.textContent = "Error: " + e.message;
  }
}

async function saveManual() {
  const input = document.getElementById("admin-barcode-manual");
  if (!input) return;
  const code = (input.value || "").trim();
  if (!code) return;
  await handleScannedBarcode(code);
  input.value = "";
  input.focus();
}

function showSavedToast(isNew) {
  const ok = document.getElementById("admin-saved-toast");
  const again = document.getElementById("admin-again-toast");
  const toast = isNew ? ok : again;
  if (!toast) return;
  toast.hidden = false;
  toast.classList.remove("admin-saved-toast--in");
  // forzar reflow para reiniciar la animación
  void toast.offsetWidth;
  toast.classList.add("admin-saved-toast--in");
  setTimeout(function() {
    toast.classList.remove("admin-saved-toast--in");
    toast.hidden = true;
  }, 1400);
}

// ---------------------------------------------------------------------------
// Lista de mis scans
// ---------------------------------------------------------------------------

async function renderList() {
  const container = document.getElementById("admin-list");
  const statsEl = document.getElementById("admin-list-stats");
  const filter = document.getElementById("admin-filter-status");
  if (!container) return;
  container.innerHTML = '<p class="muted">Cargando…</p>';

  try {
    const status = filter ? filter.value : "";
    listCache = await admin.getAdminScans(status ? { status } : {});
    if (statsEl) statsEl.textContent = listCache.length + " scans";
    if (listCache.length === 0) {
      container.innerHTML = '<p class="muted">No hay scans todavía. Andá a la pestaña Scanner.</p>';
      return;
    }
    container.innerHTML = renderListTable(listCache);
    bindListEvents(container);
  } catch (e) {
    container.innerHTML = '<p class="muted">Error: ' + escapeHtml(e.message) + "</p>";
  }
}

function renderListTable(items) {
  const rows = items.map(function(it) {
    const date = it.lastSeenAt ? new Date(it.lastSeenAt).toLocaleString() : "—";
    const inLocal = admin.isInLocalProducts(it.barcode);
    const cross = crossRefCache.get(it.barcode);
    const obfBadge = cross
      ? (cross.inOBF
          ? '<span class="admin-badge admin-badge--ok">OBF ✓</span>'
          : '<span class="admin-badge admin-badge--warn">no OBF</span>')
      : '<span class="admin-badge admin-badge--neutral">OBF ?</span>';
    const localBadge = inLocal
      ? '<span class="admin-badge admin-badge--ok">local ✓</span>'
      : '<span class="admin-badge admin-badge--neutral">no local</span>';
    const obfUrl = contributeUrl(it.barcode);
    const contribLink = obfUrl
      ? '<a class="admin-link" href="' + obfUrl + '" target="_blank" rel="noopener">→ OBF</a>'
      : '';
    return `
      <tr data-barcode="${escapeAttr(it.barcode)}">
        <td><code>${escapeHtml(it.barcode)}</code></td>
        <td>${escapeHtml(date)}</td>
        <td>${it.count || 1}</td>
        <td>${localBadge} ${obfBadge}</td>
        <td>
          <select class="admin-status-select">
            <option value="pendiente" ${it.status === "pendiente" ? "selected" : ""}>Pendiente</option>
            <option value="contribuido" ${it.status === "contribuido" ? "selected" : ""}>Contribuido</option>
            <option value="descartado" ${it.status === "descartado" ? "selected" : ""}>Descartado</option>
          </select>
        </td>
        <td><input class="admin-note-input" value="${escapeAttr(it.note || "")}" placeholder="nota…" /></td>
        <td class="admin-actions">
          ${contribLink}
          <button class="admin-link admin-link--danger" data-action="delete">borrar</button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Barcode</th><th>Última vez</th><th>Count</th><th>Cobertura</th>
            <th>Estado</th><th>Nota</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindListEvents(container) {
  container.addEventListener("change", async function(ev) {
    const tr = ev.target.closest("tr[data-barcode]");
    if (!tr) return;
    const barcode = tr.dataset.barcode;
    if (ev.target.classList.contains("admin-status-select")) {
      try {
        await admin.setStatus(barcode, ev.target.value);
      } catch (e) {
        alert("Error: " + e.message);
      }
    }
  });
  container.addEventListener("blur", async function(ev) {
    if (!ev.target.classList.contains("admin-note-input")) return;
    const tr = ev.target.closest("tr[data-barcode]");
    if (!tr) return;
    try {
      await admin.setNote(tr.dataset.barcode, ev.target.value);
    } catch (e) {
      alert("Error: " + e.message);
    }
  }, true);
  container.addEventListener("click", async function(ev) {
    const btn = ev.target.closest('[data-action="delete"]');
    if (!btn) return;
    const tr = btn.closest("tr[data-barcode]");
    if (!tr) return;
    const barcode = tr.dataset.barcode;
    if (!confirm("Borrar " + barcode + "?")) return;
    try {
      await admin.removeAdminScan(barcode);
      tr.remove();
    } catch (e) {
      alert("Error: " + e.message);
    }
  });
}

function bindListToolbar() {
  const filter = document.getElementById("admin-filter-status");
  if (filter) filter.addEventListener("change", renderList);

  const csvBtn = document.getElementById("admin-btn-export-csv");
  if (csvBtn) csvBtn.addEventListener("click", function() {
    const cols = ["barcode", "firstSeenAt", "lastSeenAt", "count", "status", "note"];
    const rows = listCache.map(function(it) {
      return Object.assign({}, it, {
        firstSeenAt: it.firstSeenAt ? new Date(it.firstSeenAt).toISOString() : "",
        lastSeenAt: it.lastSeenAt ? new Date(it.lastSeenAt).toISOString() : "",
      });
    });
    admin.triggerDownload("admin-scans.csv", admin.toCSV(rows, cols), "text/csv;charset=utf-8");
  });

  const jsonBtn = document.getElementById("admin-btn-export-json");
  if (jsonBtn) jsonBtn.addEventListener("click", function() {
    admin.triggerDownload("admin-scans.json", admin.toJSON(listCache), "application/json");
  });

  const crossBtn = document.getElementById("admin-btn-cross-ref");
  if (crossBtn) crossBtn.addEventListener("click", crossCheckOBF);
}

async function crossCheckOBF() {
  const btn = document.getElementById("admin-btn-cross-ref");
  if (btn) btn.disabled = true;
  const stats = document.getElementById("admin-list-stats");
  let done = 0;
  for (const it of listCache) {
    if (crossRefCache.has(it.barcode)) { done++; continue; }
    if (stats) stats.textContent = "Consultando OBF… " + (done + 1) + " / " + listCache.length;
    const r = await admin.checkOBF(it.barcode);
    crossRefCache.set(it.barcode, {
      inLocal: admin.isInLocalProducts(it.barcode),
      inOBF: !!r.found,
    });
    done++;
  }
  if (btn) btn.disabled = false;
  await renderList();
}

// ---------------------------------------------------------------------------
// Uniques (telemetría)
// ---------------------------------------------------------------------------

async function renderUniques() {
  const container = document.getElementById("admin-uniques");
  if (!container) return;
  container.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    uniquesCache = await admin.getUniqueTelemetryBarcodes();
    if (uniquesCache.length === 0) {
      container.innerHTML = '<p class="muted">No hay barcodes en telemetría todavía.</p>';
      return;
    }
    const rows = uniquesCache.map(function(u) {
      const inLocal = admin.isInLocalProducts(u.barcode);
      const localBadge = inLocal
        ? '<span class="admin-badge admin-badge--ok">local ✓</span>'
        : '<span class="admin-badge admin-badge--neutral">no local</span>';
      return `
        <tr>
          <td><code>${escapeHtml(u.barcode)}</code></td>
          <td>${escapeHtml(u.name || "—")}</td>
          <td>${escapeHtml(u.brand || "—")}</td>
          <td>${u.count}</td>
          <td>${escapeHtml(u.lastDay || "—")}</td>
          <td>${localBadge}</td>
        </tr>
      `;
    }).join("");
    container.innerHTML = `
      <p class="muted">${uniquesCache.length} barcodes únicos.</p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Barcode</th><th>Nombre</th><th>Marca</th><th>Scans</th><th>Último día</th><th>Cobertura</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<p class="muted">Error: ' + escapeHtml(e.message) + "</p>";
  }
}

function bindUniquesToolbar() {
  const btn = document.getElementById("admin-btn-export-uniques");
  if (btn) btn.addEventListener("click", function() {
    const cols = ["barcode", "name", "brand", "count", "lastDay"];
    admin.triggerDownload("uniques-telemetry.csv", admin.toCSV(uniquesCache, cols), "text/csv;charset=utf-8");
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

async function renderStats() {
  const container = document.getElementById("admin-stats");
  if (!container) return;
  container.innerHTML = '<p class="muted">Calculando…</p>';
  try {
    const s = await admin.getStats();
    container.innerHTML = `
      <div class="admin-stat-row">
        <div class="admin-stat-card">
          <div class="admin-stat-num">${s.totalEvents}</div>
          <div class="muted">scans en muestra</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-num">${s.scansPerDay.length}</div>
          <div class="muted">días con actividad</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-num">${s.topProducts.length}</div>
          <div class="muted">productos distintos (top 25)</div>
        </div>
      </div>

      <h3 class="admin-h3">Scans por día</h3>
      ${renderBarChart(s.scansPerDay, "day", "count")}

      <h3 class="admin-h3">Veredictos</h3>
      ${renderBarChart(s.verdictBreakdown, "verdict", "count")}

      <h3 class="admin-h3">Top productos</h3>
      ${renderProductTable(s.topProducts)}

      <h3 class="admin-h3">Top INCI desconocidos</h3>
      <p class="muted">Ingredientes que aparecen mucho en escaneos pero el clasificador no reconoce — candidatos a sumar al diccionario.</p>
      ${renderBarChart(s.topUnknownIngredients, "ingredient", "count")}
    `;
  } catch (e) {
    container.innerHTML = '<p class="muted">Error: ' + escapeHtml(e.message) + "</p>";
  }
}

function renderBarChart(rows, labelKey, valueKey) {
  if (!rows || rows.length === 0) return '<p class="muted">Sin datos.</p>';
  const max = rows.reduce(function(m, r) { return Math.max(m, r[valueKey]); }, 0) || 1;
  const items = rows.map(function(r) {
    const pct = Math.round((r[valueKey] / max) * 100);
    return `
      <div class="admin-bar-row">
        <span class="admin-bar-label">${escapeHtml(String(r[labelKey] || "—"))}</span>
        <span class="admin-bar-track"><span class="admin-bar-fill" style="width:${pct}%"></span></span>
        <span class="admin-bar-value">${r[valueKey]}</span>
      </div>
    `;
  }).join("");
  return '<div class="admin-bar-chart">' + items + "</div>";
}

function renderProductTable(rows) {
  if (!rows || rows.length === 0) return '<p class="muted">Sin datos.</p>';
  const r = rows.map(function(p) {
    return `<tr>
      <td><code>${escapeHtml(p.barcode || "")}</code></td>
      <td>${escapeHtml(p.name || "—")}</td>
      <td>${escapeHtml(p.brand || "—")}</td>
      <td>${p.count}</td>
    </tr>`;
  }).join("");
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Barcode</th><th>Nombre</th><th>Marca</th><th>Scans</th></tr></thead>
        <tbody>${r}</tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) { return escapeHtml(s); }
