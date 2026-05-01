// Cropper minimalista: muestra una imagen en un canvas escalado y permite
// arrastrar/redimensionar un rectángulo de selección encima.
//
// Uso:
//   const c = new Cropper(canvas, rectEl);
//   await c.loadFile(file);
//   const croppedCanvas = c.extractCrop();   // canvas a resolución original
//   const wholeCanvas   = c.getOriginal();   // sin recortar

export class Cropper {
  /**
   * @param {HTMLCanvasElement} canvas  el canvas visible (escalado a la pantalla)
   * @param {HTMLElement} rectEl        el div .ocr-crop-rect que pinta el rectángulo
   */
  constructor(canvas, rectEl) {
    this.canvas = canvas;
    this.rectEl = rectEl;
    this.image = null;        // HTMLImageElement original
    this.scale = 1;           // factor de escala canvas → imagen
    this.rect = null;         // {x,y,w,h} en coords del canvas visible
    this._drag = null;        // estado del drag actual
    this._bindEvents();
  }

  async loadFile(file) {
    const img = await fileToImage(file);
    this.image = img;
    this._render();
    return img;
  }

  _render() {
    const stage = this.canvas.parentElement;
    const maxW = Math.min(stage.clientWidth || 800, 800);
    const maxH = Math.min(window.innerHeight * 0.55, 600);
    const ratio = Math.min(maxW / this.image.naturalWidth, maxH / this.image.naturalHeight, 1);
    const w = Math.round(this.image.naturalWidth * ratio);
    const h = Math.round(this.image.naturalHeight * ratio);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.scale = 1 / ratio; // multiplicar coords del canvas para volver a originales
    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(this.image, 0, 0, w, h);
    // Rect inicial: 80% ancho, 35% alto, centrado
    const rw = Math.round(w * 0.80);
    const rh = Math.round(h * 0.35);
    this.rect = {
      x: Math.round((w - rw) / 2),
      y: Math.round((h - rh) / 2),
      w: rw,
      h: rh,
    };
    this._drawRect();
  }

  _drawRect() {
    const r = this.rect;
    const s = this.canvas.parentElement.getBoundingClientRect();
    const c = this.canvas.getBoundingClientRect();
    // El rect se posiciona relativo al stage, no al canvas. Calculamos offset.
    const offsetX = c.left - s.left;
    const offsetY = c.top - s.top;
    this.rectEl.style.left = (offsetX + r.x) + "px";
    this.rectEl.style.top = (offsetY + r.y) + "px";
    this.rectEl.style.width = r.w + "px";
    this.rectEl.style.height = r.h + "px";
  }

  _bindEvents() {
    const stage = this.rectEl.parentElement;
    // Reposicionar rect cuando cambie el viewport
    window.addEventListener("resize", () => {
      if (this.image) {
        const old = this.rect;
        this._render();
        // Mantener proporción del rect viejo si existía
        if (old && this.rect) {
          // (opcional) podríamos recomputar el rect; por ahora lo dejamos centrado
        }
      }
    });

    const onPointerDown = (e) => {
      if (!this.rect) return;
      const target = e.target.closest(".ocr-crop-handle, .ocr-crop-rect");
      if (!target) return;
      e.preventDefault();
      const handle = target.matches(".ocr-crop-handle") ? target.dataset.h : null;
      const startX = e.clientX;
      const startY = e.clientY;
      const startRect = { ...this.rect };
      this._drag = { handle, startX, startY, startRect };
      target.setPointerCapture && target.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!this._drag) return;
      e.preventDefault();
      const dx = e.clientX - this._drag.startX;
      const dy = e.clientY - this._drag.startY;
      const W = this.canvas.width, H = this.canvas.height;
      const minSize = 30;
      let { x, y, w, h } = this._drag.startRect;
      const handle = this._drag.handle;
      if (!handle) {
        // mover
        x = clamp(x + dx, 0, W - w);
        y = clamp(y + dy, 0, H - h);
      } else {
        // resize desde la esquina indicada
        if (handle.includes("w")) { const nx = clamp(x + dx, 0, x + w - minSize); w += x - nx; x = nx; }
        if (handle.includes("e")) { w = clamp(w + dx, minSize, W - x); }
        if (handle.includes("n")) { const ny = clamp(y + dy, 0, y + h - minSize); h += y - ny; y = ny; }
        if (handle.includes("s")) { h = clamp(h + dy, minSize, H - y); }
      }
      this.rect = { x, y, w, h };
      this._drawRect();
    };
    const onPointerUp = () => { this._drag = null; };

    this.rectEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  /** Devuelve un canvas con sólo la zona seleccionada, en resolución original. */
  extractCrop() {
    if (!this.image || !this.rect) return null;
    const r = this.rect;
    const s = this.scale;
    const sx = Math.round(r.x * s);
    const sy = Math.round(r.y * s);
    const sw = Math.round(r.w * s);
    const sh = Math.round(r.h * s);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d").drawImage(this.image, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }

  /** Devuelve un canvas con la imagen completa, sin recortar (resolución original). */
  getOriginal() {
    if (!this.image) return null;
    const out = document.createElement("canvas");
    out.width = this.image.naturalWidth;
    out.height = this.image.naturalHeight;
    out.getContext("2d").drawImage(this.image, 0, 0);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
