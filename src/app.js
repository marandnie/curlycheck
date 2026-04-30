// App principal: routing simple entre vistas, lifecycle de cámara,
// detector de barcode, integración OBF, render de resultado, estantería.

import { classify, VERDICT } from "./classifier.js";
import { fetchByBarcode } from "./obf.js";
import * as shelf from "./shelf.js";

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

// ---------------------------------------------------------------------------
// Cámara + barcode detector (Chrome Android nativo)
// ---------------------------------------------------------------------------
const cam = document.getElementById("cam");
const btnStart = document.getElementById("btn-start-cam");
const btnStop = document.getElementById("btn-stop-cam");
const scanStatus = document.getElementById("scan-status");

async function startCamera() {
  if (state.videoStream) return;
  try {
    if (!("BarcodeDetector" in window)) {
      scanStatus.textContent = "Tu navegador no soporta lectura automática. Usá ingreso manual.";
      return;
    }
    state.videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    cam.srcObject = state.videoStream;
    btnStart.hidden = true;
    btnStop.hidden = false;
    scanStatus.textContent = "Apuntá al código de barras…";

    // BarcodeDetector
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
        // silent
      }
    }, 700);
  } catch (e) {
    scanStatus.textContent = `No pudimos acceder a la cámara: ${e.message}`;
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
  scanStatus.textContent = "Consultando Open Beauty Facts…";
  try {
    const obf = await fetchByBarcode(code);
    if (!obf.found) {
      showResultStub({
        name: `Producto ${code}`,
        brand: "",
        barcode: code,
        inci: "",
        verdict: VERDICT.VERIFICAR,
        notes: "Este producto no está en Open Beauty Facts. Pegá la INCI manualmente o sumalo a OBF.",
        source: `OBF (no encontrado)`,
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
        notes: "El producto está en Open Beauty Facts pero no tiene la INCI cargada. Pegala manualmente para clasificarlo.",
        source: `OBF (sin INCI)`,
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
    });
  }
}

document.getElementById("btn-barcode-go").addEventListener("click", async () => {
  const code = document.getElementById("barcode-input").value.trim();
  if (!code) return;
  await handleBarcode(code);
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

  showView("result");
}

document.getElementById("btn-back-from-result").addEventListener("click", () => showView("scan"));
document.getElementById("btn-scan-again").addEventListener("click", () => {
  state.scanned.clear();
  showView("scan");
});
document.getElementById("btn-save-shelf").addEventListener("click", () => {
  if (!state.current) return;
  shelf.add({
    name: state.current.name,
    brand: state.current.brand,
    barcode: state.current.barcode,
    inci: state.current.inci,
    verdict: state.current.verdict,
    ruleset: state.current.ruleset,
    source: state.current.source,
  });
  alert("Guardado en tu estantería ✓");
});

// ---------------------------------------------------------------------------
// Estantería
// ---------------------------------------------------------------------------
function renderShelf() {
  const list = document.getElementById("shelf-list");
  const empty = document.getElementById("shelf-empty");
  const items = shelf.getAll();
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
    li.querySelector(".shelf-del").addEventListener("click", (ev) => {
      ev.stopPropagation();
      shelf.remove(it.id);
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
// Service worker
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((e) => {
      console.warn("SW register failed", e);
    });
  });
}
