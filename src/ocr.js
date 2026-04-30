// OCR con Tesseract.js (WASM, corre 100% en el browser).
// Devuelve texto plano de una imagen — tal cual, sin filtrar.
// La idea es mostrarlo en una textarea editable para que el usuario corrija
// errores antes de pasarlo al clasificador INCI.
//
// Tesseract.js no soporta ES modules nativos, así que lo cargamos como UMD
// desde jsdelivr. La primera vez que se usa baja ~3MB de worker + traineddata
// (spa+eng). Todo queda cacheado en IndexedDB para usos futuros.

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const LANGS = "spa+eng"; // INCI suele estar en inglés pero los envases mezclan idiomas

let tesseractPromise = null;
let workerPromise = null;

// ---------------------------------------------------------------------------
// Carga perezosa de Tesseract.js
// ---------------------------------------------------------------------------
function loadTesseract() {
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const s = document.createElement("script");
    s.src = TESSERACT_CDN;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("No se pudo cargar Tesseract.js desde el CDN"));
    document.head.appendChild(s);
  });
  return tesseractPromise;
}

/**
 * Inicializa (o devuelve) el worker. La primera invocación dispara la
 * descarga de los language data (spa+eng). El callback onProgress recibe
 * objetos {status, progress} con el avance.
 */
async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  const Tesseract = await loadTesseract();
  workerPromise = (async () => {
    const worker = await Tesseract.createWorker(LANGS, 1, {
      logger: (m) => {
        if (onProgress) onProgress(m);
      },
    });
    return worker;
  })();
  return workerPromise;
}

// ---------------------------------------------------------------------------
// Pre-procesamiento de imagen
// Convierte a grayscale + aumenta contraste + binariza.
// Mejora bastante el OCR sobre etiquetas con texto chico y contrastes flojos.
// ---------------------------------------------------------------------------
export function preprocessImage(srcCanvasOrImage) {
  const w = srcCanvasOrImage.width || srcCanvasOrImage.naturalWidth;
  const h = srcCanvasOrImage.height || srcCanvasOrImage.naturalHeight;
  if (!w || !h) throw new Error("Imagen sin dimensiones");

  // Reescalar si es muy grande (Tesseract no necesita más de ~2000px de ancho)
  const MAX = 2000;
  const scale = w > MAX ? MAX / w : 1;
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(srcCanvasOrImage, 0, 0, W, H);

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  // Pasada 1: grayscale + estirado de contraste
  // Calculamos min/max para normalizar
  let min = 255, max = 0;
  const lums = new Uint8ClampedArray(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    // luminancia perceptual
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    lums[j] = lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = Math.max(1, max - min);

  // Pasada 2: aplicar normalización + suave gamma
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((lums[j] - min) * 255 / range) | 0;
    // gamma 0.9 para favorecer texto oscuro sobre fondo claro
    v = Math.min(255, Math.max(0, Math.round(255 * Math.pow(v / 255, 0.9))));
    d[i] = d[i + 1] = d[i + 2] = v;
    // alpha intacto
  }
  ctx.putImageData(img, 0, 0);

  return canvas;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Corre OCR sobre una imagen (HTMLImageElement, HTMLCanvasElement, o File/Blob).
 * Devuelve { text, confidence } donde text es el reconocido (sin limpiar).
 */
export async function recognize(source, onProgress) {
  // Convertir a canvas
  let canvas;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
  } else if (source instanceof HTMLImageElement) {
    canvas = preprocessImage(source);
  } else if (source instanceof Blob || source instanceof File) {
    const img = await blobToImage(source);
    canvas = preprocessImage(img);
  } else {
    throw new Error("Fuente OCR no soportada");
  }

  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return {
    text: (data.text || "").trim(),
    confidence: data.confidence || 0,
  };
}

/**
 * Limpieza heurística del texto OCR para que se parezca a una INCI.
 * - Une líneas partidas por guión final
 * - Reemplaza saltos de línea por comas (las INCI son CSV en realidad)
 * - Quita ruido típico de OCR (caracteres sueltos, etc)
 * - Normaliza espacios
 *
 * No es perfecto. El usuario debería revisar el resultado antes de clasificar.
 */
export function cleanInciText(raw) {
  if (!raw) return "";
  let t = raw;
  // Unir guiones a fin de línea
  t = t.replace(/-\s*\n\s*/g, "");
  // Saltos de línea → coma
  t = t.replace(/\n+/g, ", ");
  // Múltiples comas/espacios
  t = t.replace(/\s*,\s*,+/g, ", ");
  t = t.replace(/[ \t]+/g, " ");
  // Quitar líneas muy cortas que suelen ser ruido (1-2 chars sueltos)
  t = t
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .join(", ");
  return t.trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Termina el worker. Útil al cerrar la app o para liberar memoria.
 * No se llama en el flujo normal — el worker se reusa entre escaneos.
 */
export async function terminate() {
  if (!workerPromise) return;
  const w = await workerPromise;
  await w.terminate();
  workerPromise = null;
}
