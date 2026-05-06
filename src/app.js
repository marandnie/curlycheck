// App principal: routing simple entre vistas, lifecycle de cámara,
// detector de barcode, integración OBF, render de resultado, estantería.

import { classify, categorySummary, VERDICT } from "./classifier.js";
import { shareResult } from "./share.js";
import * as telemetry from "./telemetry.js";
import { fetchByBarcode, contributeUrl } from "./obf.js";
import { lookupLocal } from "./local-products.js";
import { recognize, cleanInciText } from "./ocr.js";
import { Cropper } from "./cropper.js";
import { correctInciText } from "./fuzzy.js";
import { searchByName } from "./search.js";
import * as shelf from "./shelf.js";
import {
  initAuth, signInWithGoogle, signOut, onAuthChanged, getCurrentUser,
} from "./auth.js";
import { FIREBASE_ENABLED } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  view: "scan",
  current: null,         // resultado actual (objeto a guardar)
  ruleset: "standard",
  videoStream: null,
  detectorLoop: null,
  scanned: new Set(),    // dedupe por barcode
  ocrContext: null,      // {name, brand, barcode} cuando entramos al view OCR
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function showView(name) {
  state.view = name;
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("is-active", v.id === `view-${name}`);
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.view === name);
  });
  if (name !== "scan") stopCamera();
  if (name === "shelf") renderShelf();
}

document.querySelectorAll(".nav-btn").forEach((b) => {
  b.addEventListener("click", () => showView(b.dataset.view));
});

// Click en el logo "Curly Check" → volver al view-scan sin recargar
const brandLink = document.getElementById("brand-link");
if (brandLink) {
  brandLink.addEventListener("click", (e) => {
    e.preventDefault();
    state.scanned.clear();
    showView("scan");
  });
}

// ---------------------------------------------------------------------------
// Cámara + barcode detector (Chrome Android nativo)
// ---------------------------------------------------------------------------
const cam = document.getElementById("cam");
const btnStart = document.getElementById("btn-start-cam");
const btnStop = document.getElementById("btn-stop-cam");
const scanStatus = document.getElementById("scan-status");

async function startCamera() {
  if (state.videoStream) return;

  // Pre-flight: necesitamos contexto seguro (https o localhost) y el API
  if (!window.isSecureContext) {
    const msg = "Tu navegador requiere HTTPS para usar la cámara. Probá en Chrome con esta URL en https://, o usá ingreso manual.";
    scanStatus.textContent = msg;
    alert(msg);
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = "Tu navegador no soporta acceso a cámara. Usá ingreso manual.";
    scanStatus.textContent = msg;
    alert(msg);
    return;
  }

  try {
    // Pedimos la cámara SIEMPRE — independientemente de BarcodeDetector.
    state.videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    cam.srcObject = state.videoStream;
    btnStart.hidden = true;
    btnStop.hidden = false;

    // Si el navegador soporta BarcodeDetector nativo → activamos el loop.
    // Si no (Firefox, Safari, Chrome incógnito a veces), mostramos la cámara
    // igual y le pedimos a la usuaria que use el ingreso manual del barcode.
    if ("BarcodeDetector" in window) {
      scanStatus.textContent = "Apuntá al código de barras…";
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      state.detectorLoop = setInterval(async () => {
        try {
          const codes = await detector.detect(cam);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            if (state.scanned.has(code)) return;
            state.scanned.add(code);
            scanStatus.textContent = `Código detectado: ${code}`;
            await handleBarcode(code);
          }
        } catch (e) {
          // silent — el detector falla a veces sobre frames intermedios
        }
      }, 700);
    } else {
      scanStatus.textContent = "Tu navegador no detecta barcodes automáticamente. Tipeá el código a mano abajo.";
    }
  } catch (e) {
    let msg;
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      msg = "Bloqueaste el permiso de cámara. Habilitalo desde el ícono del candado en la barra de direcciones y reintentá.";
    } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
      msg = "No encontramos una cámara en este dispositivo.";
    } else if (e.name === "NotReadableError" || e.name === "TrackStartError") {
      msg = "La cámara está siendo usada por otra app. Cerrala y reintentá.";
    } else if (e.name === "OverconstrainedError") {
      // Reintentar sin facingMode si la trasera no estuviera disponible
      try {
        state.videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cam.srcObject = state.videoStream;
        btnStart.hidden = true;
        btnStop.hidden = false;
        scanStatus.textContent = "Cámara activa (sin selección de cámara trasera).";
        return;
      } catch (e2) {
        msg = "No se pudo acceder a la cámara: " + e2.message;
      }
    } else {
      msg = "No pudimos acceder a la cámara: " + (e.message || e.name || "error desconocido");
    }
    scanStatus.textContent = msg;
    alert(msg);
    btnStart.hidden = false;
    btnStop.hidden = true;
  }
}

function stopCamera() {
  if (state.detectorLoop) {
    clearInterval(state.detectorLoop);
    state.detectorLoop = null;
  }
  if (state.videoStream) {
    state.videoStream.getTracks().forEach((t) => t.stop());
    state.videoStream = null;
    cam.srcObject = null;
  }
  btnStart.hidden = false;
  btnStop.hidden = true;
  scanStatus.textContent = "Listo para escanear";
}

btnStart.addEventListener("click", startCamera);
btnStop.addEventListener("click", stopCamera);

// ---------------------------------------------------------------------------
// Manejo de barcode
// ---------------------------------------------------------------------------
async function handleBarcode(code) {
  stopCamera();

  // 1) Base local primero — productos curados que no están en OBF
  const local = lookupLocal(code);
  if (local && local.hasInci) {
    const result = classify(local.inci, state.ruleset);
    showResultFromObf(local, result); // misma forma de objeto, sirve igual
    return;
  }

  scanStatus.textContent = "Consultando Open Beauty Facts…";
  try {
    const obf = await fetchByBarcode(code);
    if (!obf.found) {
      // Si está en local pero sin INCI, mostramos el nombre y ofrecemos OCR
      if (local) {
        showResultStub({
          name: local.name,
          brand: local.brand,
          barcode: code,
          inci: "",
          verdict: VERDICT.VERIFICAR,
          notes: "Producto reconocido pero sin INCI cargada. Sacale foto a los ingredientes para clasificarlo.",
          source: "Base local (sin INCI)",
          allowOcr: true,
        });
        return;
      }
      showResultStub({
        name: `Producto ${code}`,
        brand: "",
        barcode: code,
        inci: "",
        verdict: VERDICT.VERIFICAR,
        notes: "Este producto no está en nuestra base. Sacale foto a los ingredientes o pegalos a mano.",
        source: "OBF (no encontrado)",
        allowOcr: true,
      });
      return;
    }
    if (!obf.hasInci) {
      showResultStub({
        name: obf.name || `Producto ${code}`,
        brand: obf.brand,
        barcode: code,
        inci: "",
        verdict: VERDICT.VERIFICAR,
        notes: "El producto está en OBF pero sin INCI. Sacale foto a los ingredientes o pegalos a mano.",
        source: "OBF (sin INCI)",
        allowOcr: true,
      });
      return;
    }
    // Tenemos INCI: clasificar
    const result = classify(obf.inci, state.ruleset);
    showResultFromObf(obf, result);
  } catch (e) {
    showResultStub({
      name: `Producto ${code}`,
      brand: "",
      barcode: code,
      inci: "",
      verdict: VERDICT.VERIFICAR,
      notes: `Error consultando OBF: ${e.message}`,
      source: "Error",
      allowOcr: true,
    });
  }
}

document.getElementById("btn-barcode-go").addEventListener("click", async () => {
  const code = document.getElementById("barcode-input").value.trim();
  if (!code) return;
  await handleBarcode(code);
});

// ---------------------------------------------------------------------------
// Búsqueda por nombre (local + OBF)
// ---------------------------------------------------------------------------
const searchInput = document.getElementById("search-input");
const btnSearch = document.getElementById("btn-search");
const searchResults = document.getElementById("search-results");

async function runSearch() {
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResults.innerHTML = `<li class="search-empty">Escribí al menos 2 letras.</li>`;
    return;
  }
  searchResults.innerHTML = `<li class="search-empty">Buscando…</li>`;
  const hits = await searchByName(q);
  if (hits.length === 0) {
    searchResults.innerHTML = `<li class="search-empty">Sin resultados. Probá pegar la INCI manualmente.</li>`;
    return;
  }
  searchResults.innerHTML = "";
  for (const h of hits) {
    const li = document.createElement("li");
    li.className = "search-hit";
    const sourceTag = h.source === "Base local" ? "local" : "obf";
    li.innerHTML = `
      <div class="search-hit-info">
        <strong>${escape(h.name || "(sin nombre)")}</strong>
        <small>${escape(h.brand || "")} ${h.hasInci ? "" : "· sin INCI"}</small>
      </div>
      <span class="search-hit-source src-${sourceTag}">${sourceTag}</span>
    `;
    li.addEventListener("click", () => {
      if (h.hasInci) {
        const result = classify(h.inci, state.ruleset);
        state.current = {
          name: h.name,
          brand: h.brand || "",
          barcode: h.barcode || null,
          inci: h.inci,
          verdict: result.verdict,
          ruleset: result.ruleset,
          offenders: result.offenders,
          unknown: result.unknown,
          notes: result.notes,
          source: h.source === "Base local" ? "Base local" : `Open Beauty Facts · ${h.barcode || ""}`,
        };
        renderResult(state.current);
      } else {
        // Sin INCI → ofrecer OCR
        showResultStub({
          name: h.name,
          brand: h.brand || "",
          barcode: h.barcode || null,
          inci: "",
          verdict: VERDICT.VERIFICAR,
          notes: "Producto encontrado pero sin INCI. Sacale foto a los ingredientes.",
          source: h.source,
          allowOcr: true,
        });
      }
    });
    searchResults.appendChild(li);
  }
}

btnSearch.addEventListener("click", runSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

document.getElementById("btn-classify-inci").addEventListener("click", () => {
  const inci = document.getElementById("inci-input").value.trim();
  const name = document.getElementById("product-name-input").value.trim() || "Sin nombre";
  if (!inci) {
    alert("Pegá la lista de ingredientes para clasificarla.");
    return;
  }
  const result = classify(inci, state.ruleset);
  showResultFromManual({ name, inci, result });
});

document.getElementById("ruleset-select").addEventListener("change", (e) => {
  state.ruleset = e.target.value;
});

// ---------------------------------------------------------------------------
// Render del resultado
// ---------------------------------------------------------------------------
function showResultFromObf(obf, result) {
  state.current = {
    name: obf.name || `Producto ${obf.barcode}`,
    brand: obf.brand,
    barcode: obf.barcode,
    inci: obf.inci,
    verdict: result.verdict,
    ruleset: result.ruleset,
    offenders: result.offenders,
    unknown: result.unknown,
    notes: result.notes,
    source: `Open Beauty Facts · barcode ${obf.barcode}`,
  };
  renderResult(state.current);
}

function showResultFromManual({ name, inci, result }) {
  state.current = {
    name,
    brand: "",
    barcode: null,
    inci,
    verdict: result.verdict,
    ruleset: result.ruleset,
    offenders: result.offenders,
    unknown: result.unknown,
    notes: result.notes,
    source: "Ingreso manual",
  };
  renderResult(state.current);
}

function showResultStub(stub) {
  state.current = {
    ...stub,
    offenders: [],
    unknown: [],
    ruleset: "—",
  };
  renderResult(state.current);
}

// Pasamos al view OCR usando el contexto del producto actual
function goToOcrFromCurrent() {
  const c = state.current;
  state.ocrContext = c
    ? { name: c.name, brand: c.brand, barcode: c.barcode }
    : { name: "", brand: "", barcode: null };
  resetOcrView();
  showView("ocr");
}

function renderResult(r) {
  document.getElementById("result-product-name").textContent = r.name;
  document.getElementById("result-product-brand").textContent = r.brand || "";
  document.getElementById("result-inci").textContent = r.inci || "(sin INCI)";

  const block = document.getElementById("verdict-block");
  block.classList.remove("is-apto", "is-noapto", "is-verif");
  const label = document.getElementById("verdict-label");
  const sub = document.getElementById("verdict-sub");
  label.textContent = r.verdict;
  sub.textContent = r.ruleset !== "—" ? `Ruleset: ${r.ruleset}` : "";

  if (r.verdict === VERDICT.APTO) block.classList.add("is-apto");
  else if (r.verdict === VERDICT.NO_APTO) block.classList.add("is-noapto");
  else block.classList.add("is-verif");

  // Offenders
  const off = document.getElementById("offenders");
  off.innerHTML = "";
  for (const h of r.offenders || []) {
    const item = document.createElement("div");
    item.className = "offender";
    item.innerHTML = `<strong>${escape(h.matched.name)}</strong>
      <small>${escape(h.reason)}</small>`;
    off.appendChild(item);
  }

  // Unknown
  const ub = document.getElementById("unknown-block");
  const ul = document.getElementById("unknown-list");
  ul.innerHTML = "";
  if (r.unknown && r.unknown.length) {
    ub.hidden = false;
    for (const u of r.unknown) {
      const li = document.createElement("li");
      li.textContent = u;
      ul.appendChild(li);
    }
  } else {
    ub.hidden = true;
  }

  document.getElementById("source-note").textContent =
    `${r.source} · ${r.notes || ""}`.trim();

  // Mostrar/ocultar el bloque OCR-fallback
  const fallback = document.getElementById("ocr-fallback");
  if (r.allowOcr) {
    fallback.hidden = false;
  } else {
    fallback.hidden = true;
  }

  // Mostrar/ocultar el bloque "Contribuir a OBF".
  // Aparece sólo cuando tenemos barcode + INCI y el dato NO viene ya de OBF.
  // (Si OBF ya tenía la INCI, no hay nada para contribuir.)
  const obfBlock = document.getElementById("obf-contribute");
  const sourceIsObf = (r.source || "").startsWith("Open Beauty Facts");
  const canContribute = !!r.barcode && !!r.inci && !sourceIsObf;
  obfBlock.hidden = !canContribute;

  // Botón "Editar": sólo si el item ya está guardado en la estantería (tiene id)
  const editBtn = document.getElementById("btn-edit-current");
  editBtn.hidden = !r.id;

  // Sub-veredictos por categoría
  renderCategoryChips(r);

  // Telemetría anónima (opt-out, fire-and-forget)
  telemetry.recordScan(r);

  showView("result");
}

const CAT_LABELS = {
  sulfates: "Sulfatos",
  silicones: "Siliconas",
  alcohols: "Alcohol secante",
  minerals: "Aceite mineral",
};

function renderCategoryChips(r) {
  const block = document.getElementById("category-chips");
  if (!r.inci) {
    block.hidden = true;
    block.innerHTML = "";
    return;
  }
  // Reusar el ruleset que el clasificador usó (con un fallback al estándar)
  const rsKey = state.ruleset || "standard";
  const summary = categorySummary(r.inci, rsKey);
  // Guardar en state.current para que el share lo pueda usar
  state.currentCategorySummary = summary;

  block.innerHTML = "";
  for (const key of ["sulfates", "silicones", "alcohols", "minerals"]) {
    const s = summary[key];
    if (!s || s.state === "na") continue;
    const chip = document.createElement("div");
    chip.className = `cat-chip cat-${s.state}`;
    const icon = s.state === "clean" ? "✓" : s.state === "present" ? "✗" : "—";
    const prefix = s.state === "clean" ? "Sin" : "Con";
    chip.innerHTML = `
      <span class="cat-chip-icon">${icon}</span>
      <span class="cat-chip-label">${prefix} ${escape(CAT_LABELS[key])}</span>
    `;
    if (s.state === "present" && s.matches.length) {
      chip.title = s.matches.join(", ");
    }
    block.appendChild(chip);
  }
  block.hidden = block.childElementCount === 0;
}

document.getElementById("btn-back-from-result").addEventListener("click", () => showView("scan"));
document.getElementById("btn-scan-again").addEventListener("click", () => {
  state.scanned.clear();
  showView("scan");
});
document.getElementById("btn-save-shelf").addEventListener("click", async () => {
  if (!state.current) return;
  const c = state.current;
  const payload = {
    name: c.name,
    brand: c.brand,
    barcode: c.barcode,
    inci: c.inci,
    verdict: c.verdict,
    ruleset: c.ruleset,
    source: c.source,
  };
  try {
    // Detectar duplicado por barcode con INCI distinta → preguntar
    if (c.barcode) {
      const existing = await shelf.findByBarcode(c.barcode);
      if (existing && existing.inci && c.inci && existing.inci !== c.inci) {
        const fechaTxt = formatRelativeDate(existing.savedAt);
        const replace = confirm(
          `Ya tenés "${existing.name || "este producto"}" guardado` +
          (fechaTxt ? ` (${fechaTxt})` : "") +
          ` con una INCI distinta.\n\n` +
          `¿Reemplazarlo con la nueva versión?\n\n` +
          `OK = Reemplazar (perdés la INCI vieja)\n` +
          `Cancelar = Te pregunto si guardarlo aparte`
        );
        if (replace) {
          await shelf.add(payload); // dedupe por barcode → sobreescribe
          alert("Actualizado ✓");
        } else {
          const apart = confirm("¿Guardar como otro item (queda el viejo y el nuevo)?");
          if (!apart) return;
          await shelf.add(payload, { forceNew: true });
          alert("Guardado como nuevo ítem ✓");
        }
        renderShelf();
        return;
      }
    }
    await shelf.add(payload);
    alert("Guardado en tu estantería ✓");
  } catch (e) {
    alert("No se pudo guardar: " + e.message);
  }
});

function formatRelativeDate(ts) {
  if (!ts) return "";
  const days = Math.round((Date.now() - ts) / (24 * 3600 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

// Edición de un item de la estantería
// ---------------------------------------------------------------------------
const editName = document.getElementById("edit-name");
const editBrand = document.getElementById("edit-brand");
const editBarcode = document.getElementById("edit-barcode");
const editInci = document.getElementById("edit-inci");

function openEdit(item) {
  state.editTarget = { ...item };
  editName.value = item.name || "";
  editBrand.value = item.brand || "";
  editBarcode.value = item.barcode || "";
  editInci.value = item.inci || "";
  showView("edit");
}

document.getElementById("btn-edit-current").addEventListener("click", () => {
  if (state.current) openEdit(state.current);
});
document.getElementById("btn-back-from-edit").addEventListener("click", () => {
  state.editTarget = null;
  showView(state.current && state.current.id ? "shelf" : "scan");
});
document.getElementById("btn-cancel-edit").addEventListener("click", () => {
  state.editTarget = null;
  showView("shelf");
});
document.getElementById("btn-save-edit").addEventListener("click", async () => {
  if (!state.editTarget) return;
  const target = state.editTarget;
  const newInci = (editInci.value || "").trim();
  const result = classify(newInci, state.ruleset);
  const merged = {
    ...target,
    name: editName.value.trim() || target.name || "",
    brand: editBrand.value.trim(),
    barcode: editBarcode.value.trim() || null,
    inci: newInci,
    verdict: result.verdict,
    ruleset: result.ruleset,
    source: target.source ? `${target.source} (editado)` : "Editado a mano",
  };
  try {
    const saved = await shelf.add(merged); // mantiene id si target.id existe
    state.current = {
      ...merged,
      id: saved.id,
      offenders: result.offenders,
      unknown: result.unknown,
      notes: result.notes,
    };
    state.editTarget = null;
    alert("Cambios guardados ✓");
    renderResult(state.current);
  } catch (e) {
    alert("No se pudo guardar: " + e.message);
  }
});

document.getElementById("btn-share").addEventListener("click", async () => {
  if (!state.current) return;
  try {
    const r = await shareResult(state.current, state.currentCategorySummary);
    if (r.method === "clipboard") {
      alert("Copiado al portapapeles ✓");
    } else if (r.method === "manual") {
      // Fallback: textarea para copiar a mano
      prompt("Copiá el texto:", r.text);
    }
    // 'share' y 'abort' no requieren feedback adicional
  } catch (e) {
    alert("No se pudo compartir: " + e.message);
  }
});

// ---------------------------------------------------------------------------
// Estantería
// ---------------------------------------------------------------------------
async function renderShelf() {
  const list = document.getElementById("shelf-list");
  const empty = document.getElementById("shelf-empty");
  list.innerHTML = `<li class="shelf-loading muted">Cargando…</li>`;
  let items = [];
  try {
    items = await shelf.getAll();
  } catch (e) {
    list.innerHTML = `<li class="shelf-error">Error: ${escape(e.message)}</li>`;
    return;
  }
  list.innerHTML = "";
  empty.hidden = items.length > 0;
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "shelf-item";
    const tagClass =
      it.verdict === VERDICT.APTO ? "is-apto"
      : it.verdict === VERDICT.NO_APTO ? "is-noapto"
      : "is-verif";
    li.innerHTML = `
      <span class="shelf-tag ${tagClass}">${escape(it.verdict)}</span>
      <div>
        <div class="shelf-name">${escape(it.name)}</div>
        <div class="shelf-brand">${escape(it.brand || "")}</div>
      </div>
      <button class="shelf-del" title="Eliminar">×</button>
    `;
    li.querySelector(".shelf-del").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await shelf.remove(it.id);
      renderShelf();
    });
    li.addEventListener("click", () => {
      state.current = {
        name: it.name,
        brand: it.brand,
        barcode: it.barcode,
        inci: it.inci,
        verdict: it.verdict,
        ruleset: it.ruleset,
        source: it.source || "Estantería",
        offenders: classify(it.inci, "standard").offenders,
        unknown: classify(it.inci, "standard").unknown,
        notes: "",
      };
      renderResult(state.current);
    });
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

// ---------------------------------------------------------------------------
// OCR view
// ---------------------------------------------------------------------------
// Tenemos dos inputs separados: cámara (con `capture`) y galería. Los manejamos
// como un array para evitar duplicar la lógica de change/reset.
const ocrFileInputs = [
  document.getElementById("ocr-file-camera"),
  document.getElementById("ocr-file-gallery"),
].filter(Boolean);
const ocrCropWrap = document.getElementById("ocr-crop-wrap");
const ocrCanvas = document.getElementById("ocr-canvas");
const ocrCropRect = document.getElementById("ocr-crop-rect");
const ocrProgress = document.getElementById("ocr-progress");
const ocrProgressFill = document.getElementById("ocr-progress-fill");
const ocrProgressText = document.getElementById("ocr-progress-text");
const ocrTextLabel = document.getElementById("ocr-text-label");
const ocrText = document.getElementById("ocr-text");
const btnOcrClassify = document.getElementById("btn-ocr-classify");
const ocrContextEl = document.getElementById("ocr-product-context");
const btnFullScan = document.getElementById("btn-ocr-fullscan");
const btnCropScan = document.getElementById("btn-ocr-cropscan");

let cropper = null;

document.getElementById("btn-go-ocr").addEventListener("click", goToOcrFromCurrent);
document.getElementById("btn-back-from-ocr").addEventListener("click", () => showView("scan"));

// "Contribuir a OBF": copia INCI al portapapeles + abre OBF en otra pestaña.
// El form de OBF queda con el barcode prellenado; la usuaria pega la INCI ahí.
document.getElementById("btn-contribute-obf").addEventListener("click", async () => {
  const c = state.current;
  if (!c || !c.barcode || !c.inci) return;
  const url = contributeUrl(c.barcode);
  if (!url) return;

  // Copiar INCI al portapapeles (best-effort; no bloquea el flujo si falla).
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(c.inci);
      copied = true;
    }
  } catch (_) {
    // Clipboard puede fallar en contextos sin permiso; seguimos igual.
  }

  // Abrir OBF en otra pestaña.
  window.open(url, "_blank", "noopener,noreferrer");

  // Mensaje guía (alert por simplicidad; se puede migrar a toast luego).
  const tip = copied
    ? "Te abrimos Open Beauty Facts en otra pestaña. La INCI ya está copiada en el portapapeles — pegala en el campo \"Lista de ingredientes\"."
    : "Te abrimos Open Beauty Facts en otra pestaña. Copiá manualmente la INCI desde la pantalla y pegala en el campo \"Lista de ingredientes\".";
  alert(tip);
});

function resetOcrView() {
  ocrFileInputs.forEach((el) => { el.value = ""; });
  if (ocrCropWrap) ocrCropWrap.hidden = true;
  ocrProgress.hidden = true;
  ocrProgressFill.style.width = "0%";
  ocrProgressText.textContent = "Cargando OCR…";
  ocrTextLabel.hidden = true;
  ocrText.value = "";
  btnOcrClassify.hidden = true;
  const note = document.getElementById("ocr-corrections-note");
  if (note) { note.hidden = true; note.textContent = ""; }
  const ctx = state.ocrContext;
  if (ctx && (ctx.name || ctx.barcode)) {
    ocrContextEl.hidden = false;
    ocrContextEl.textContent =
      (ctx.name || "") +
      (ctx.brand ? " · " + ctx.brand : "") +
      (ctx.barcode ? " · " + ctx.barcode : "");
  } else {
    ocrContextEl.hidden = true;
  }
}

async function onOcrFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!cropper) cropper = new Cropper(ocrCanvas, ocrCropRect);
  try {
    // Mostrar el wrap ANTES de loadFile: así el cropper puede medir el ancho
    // disponible y dimensionar el canvas correctamente. Si lo hacemos al revés,
    // stage.clientWidth = 0 y el canvas queda con buffer interno desalineado
    // del tamaño en pantalla → el rect no corresponde con lo que se cropea.
    ocrCropWrap.hidden = false;
    await cropper.loadFile(file);
    ocrProgress.hidden = true;
    ocrTextLabel.hidden = true;
    btnOcrClassify.hidden = true;
    const note = document.getElementById("ocr-corrections-note");
    if (note) { note.hidden = true; note.textContent = ""; }
  } catch (err) {
    alert("No se pudo cargar la imagen: " + err.message);
  }
}
ocrFileInputs.forEach((el) => el.addEventListener("change", onOcrFileChange));

async function runOcrOnCanvas(srcCanvas) {
  ocrCropWrap.hidden = true;
  ocrProgress.hidden = false;
  ocrProgressFill.style.width = "0%";
  ocrProgressText.textContent = "Preparando OCR (la primera vez baja ~3 MB)…";
  try {
    const { text } = await recognize(srcCanvas, (m) => {
      if (typeof m.progress === "number") {
        ocrProgressFill.style.width = Math.round(m.progress * 100) + "%";
      }
      if (m.status) ocrProgressText.textContent = humanizeStatus(m.status);
    });
    ocrProgress.hidden = true;
    const cleaned = cleanInciText(text);
    const { text: corrected, changes } = correctInciText(cleaned);
    ocrText.value = corrected;
    ocrTextLabel.hidden = false;
    btnOcrClassify.hidden = false;
    if (changes.length > 0) {
      const note = document.getElementById("ocr-corrections-note");
      if (note) {
        note.hidden = false;
        note.textContent = "✨ Auto-corregimos " + changes.length +
          " ingrediente" + (changes.length === 1 ? "" : "s") + " (revisalos por las dudas).";
      }
    }
    ocrText.focus();
  } catch (err) {
    ocrProgressText.textContent = "Error de OCR: " + err.message;
  }
}

btnCropScan.addEventListener("click", async () => {
  if (!cropper) return;
  const c = cropper.extractCrop();
  if (!c) { alert("Cargá una imagen primero."); return; }
  await runOcrOnCanvas(c);
});

btnFullScan.addEventListener("click", async () => {
  if (!cropper) return;
  const c = cropper.getOriginal();
  if (!c) { alert("Cargá una imagen primero."); return; }
  await runOcrOnCanvas(c);
});

btnOcrClassify.addEventListener("click", () => {
  const inci = (ocrText.value || "").trim();
  if (!inci) {
    alert("Pegá o corregí la lista de ingredientes antes de clasificar.");
    return;
  }
  const ctx = state.ocrContext || {};
  const result = classify(inci, state.ruleset);
  state.current = {
    name: ctx.name || "Producto escaneado",
    brand: ctx.brand || "",
    barcode: ctx.barcode || null,
    inci,
    verdict: result.verdict,
    ruleset: result.ruleset,
    offenders: result.offenders,
    unknown: result.unknown,
    notes: result.notes,
    source: ctx.barcode ? `OCR · barcode ${ctx.barcode}` : "OCR (foto)",
    allowOcr: false,
  };
  renderResult(state.current);
});

function humanizeStatus(s) {
  // Status comunes de Tesseract.js
  const map = {
    "loading tesseract core": "Descargando motor OCR…",
    "initializing tesseract": "Inicializando OCR…",
    "loading language traineddata": "Descargando idiomas (spa+eng)…",
    "initializing api": "Preparando OCR…",
    "recognizing text": "Leyendo ingredientes…",
  };
  return map[s] || s;
}

function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/[\s.@]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Auth UI (botón login + avatar en topbar)
// ---------------------------------------------------------------------------
const authBtn = document.getElementById("btn-auth");
const authStatus = document.getElementById("auth-status");

function renderAuthUI(user) {
  if (!FIREBASE_ENABLED) {
    if (authBtn) authBtn.hidden = true;
    if (authStatus) authStatus.hidden = true;
    return;
  }
  if (user) {
    authBtn.textContent = "Salir";
    authBtn.dataset.action = "signout";
    authBtn.hidden = false;
    authStatus.hidden = false;
    authStatus.innerHTML = `
      ${user.photoURL
        ? `<img class="avatar" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar avatar-fallback',textContent:'${escape(initials(user.displayName || user.email || ''))}'}))">`
        : `<span class="avatar avatar-fallback">${escape(initials(user.displayName || user.email || ""))}</span>`}
      <span class="auth-email">${escape(user.displayName || user.email || "Conectada")}</span>
    `;
  } else {
    authBtn.textContent = "Ingresar con Google";
    authBtn.dataset.action = "signin";
    authBtn.hidden = false;
    authStatus.hidden = true;
    authStatus.innerHTML = "";
  }
}

if (authBtn) {
  authBtn.addEventListener("click", async () => {
    try {
      if (authBtn.dataset.action === "signout") {
        await signOut();
      } else {
        await signInWithGoogle();
      }
    } catch (e) {
      alert("Error de auth: " + e.message);
    }
  });
}

async function maybeOfferMigration() {
  const localCount = shelf.localCount();
  if (!localCount) return;
  const ok = confirm(
    `Tenés ${localCount} producto${localCount === 1 ? "" : "s"} guardado${localCount === 1 ? "" : "s"} en este dispositivo. ¿Querés sincronizarlos con tu cuenta para verlos en cualquier dispositivo?`,
  );
  if (!ok) return;
  try {
    const { migrated } = await shelf.migrateLocalToCloud({ clearAfter: true });
    alert(`Listo, sincronizamos ${migrated} producto${migrated === 1 ? "" : "s"} a tu cuenta.`);
    if (state.view === "shelf") renderShelf();
  } catch (e) {
    alert("No se pudo sincronizar: " + e.message);
  }
}

// Init auth + listener
if (FIREBASE_ENABLED) {
  initAuth().catch((e) => console.warn("initAuth error:", e));
  let prevUser = null;
  onAuthChanged((user) => {
    const wasNotLogged = !prevUser;
    prevUser = user;
    renderAuthUI(user);
    if (state.view === "shelf") renderShelf();
    if (user && wasNotLogged) maybeOfferMigration();
  });
} else {
  renderAuthUI(null);
}

// ---------------------------------------------------------------------------
// Toggle de telemetría en el footer
// ---------------------------------------------------------------------------
const telemetryLink = document.getElementById("telemetry-toggle");
const telemetryState = document.getElementById("telemetry-state");

function updateTelemetryUI() {
  if (!telemetryState) return;
  telemetryState.textContent = telemetry.isEnabled() ? "on" : "off";
}
updateTelemetryUI();

if (telemetryLink) {
  telemetryLink.addEventListener("click", (e) => {
    e.preventDefault();
    const next = !telemetry.isEnabled();
    telemetry.setEnabled(next);
    updateTelemetryUI();
    alert(next
      ? "Telemetría anónima ACTIVADA. Compartís barcode + ingredientes no reconocidos para mejorar la app. Sin uid ni datos personales."
      : "Telemetría anónima DESACTIVADA. No se enviará nada al servidor."
    );
  });
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((e) => {
      console.warn("SW register failed", e);
    });
  });
}