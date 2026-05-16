import { api, getTsToken, qs, renderTurnstile, waitForTurnstile } from "./app.js?v=20260505-4";

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  settings: { tshirts: [{ image: null, zone: null }, { image: null, zone: null }] },
  photos: [],        // [{ id, dataUrl }]
  layers: [[], []],  // per-canvas: [{ id, photoId, leftPct, topPct, widthPct, heightPct }]
  activeCanvas: 0,
};

let _photoId = 0;
let _layerId = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────
const photoUploadInput = qs("#photoUploadInput");
const photoStrip = qs("#photoStrip");
const tshirtWrap = [qs("#tshirtWrap0"), qs("#tshirtWrap1")];
const tshirtCanvas = [qs("#tshirtCanvas0"), qs("#tshirtCanvas1")];
const submitBtn = qs("#submitDesignBtn");
const customerPhone = qs("#customerPhone");
const customerDetails = qs("#customerDetails");
const submitError = qs("#submitError");
const submitSuccess = qs("#submitSuccess");
const phoneField = qs("#phoneField");
const detailsField = qs("#detailsField");

// ── Boot ───────────────────────────────────────────────────────────────────
(async function init() {
  try {
    const data = await api("/api/custom-design-settings");
    if (data?.ok && data.settings) state.settings = data.settings;
  } catch { /* fallback to empty */ }

  setupCanvases();

  qs("#canvasTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".canvas-tab");
    if (!tab) return;
    const idx = Number(tab.dataset.idx);
    if (isNaN(idx)) return;
    state.activeCanvas = idx;
    document.querySelectorAll(".canvas-tab").forEach((t, i) => t.classList.toggle("active", i === idx));
    tshirtWrap.forEach((w, i) => w.classList.toggle("hidden", i !== idx));
  });

  photoUploadInput.addEventListener("change", onPhotoFilesSelected);
  submitBtn.addEventListener("click", handleSubmit);
  waitForTurnstile(() => renderTurnstile("cf-design-ts"));
  renderPhotoStrip();
})();

// ── Canvas Setup ───────────────────────────────────────────────────────────
function setupCanvases() {
  for (let i = 0; i < 2; i++) {
    const tshirt = state.settings.tshirts?.[i];
    const canvas = tshirtCanvas[i];
    canvas.innerHTML = "";

    if (tshirt?.image) {
      const bg = document.createElement("img");
      bg.className = "tshirt-bg";
      bg.src = tshirt.image;
      bg.alt = "";
      bg.draggable = false;
      canvas.appendChild(bg);

      if (tshirt.zone) {
        const zoneEl = document.createElement("div");
        zoneEl.className = "design-zone";
        applyZoneStyle(zoneEl, tshirt.zone);
        canvas.appendChild(zoneEl);
      }
    } else {
      canvas.innerHTML = `
        <div class="tshirt-empty">
          <div style="font-size:50px;opacity:.25">👕</div>
          <div style="font-size:13px">لم يتم تحديد صورة التيشرت بعد</div>
        </div>
      `;
    }
  }
}

function applyZoneStyle(el, zone) {
  el.style.left   = zone.leftPct + "%";
  el.style.top    = zone.topPct + "%";
  el.style.width  = zone.widthPct + "%";
  el.style.height = zone.heightPct + "%";
}

// ── Photo Upload ───────────────────────────────────────────────────────────
async function onPhotoFilesSelected(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const dataUrl = await optimizeImage(file, 1200);
      const id = `p${++_photoId}`;
      state.photos.push({ id, dataUrl });
    } catch { /* skip */ }
  }
  renderPhotoStrip();
}

function renderPhotoStrip() {
  if (state.photos.length === 0) {
    photoStrip.innerHTML = `<div class="photo-strip-empty">ارفع صورة لتظهر هنا، ثم انقر عليها لإضافتها للتيشرت.</div>`;
    return;
  }
  photoStrip.innerHTML = "";
  state.photos.forEach((photo) => {
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";

    const img = document.createElement("img");
    img.src = photo.dataUrl;
    img.alt = "";

    const del = document.createElement("button");
    del.className = "photo-thumb-delete";
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("pointerdown", (e) => e.stopPropagation());
    del.addEventListener("click", (e) => { e.stopPropagation(); removePhoto(photo.id); });

    thumb.appendChild(img);
    thumb.appendChild(del);
    thumb.addEventListener("click", () => addLayerToActiveCanvas(photo.id));
    photoStrip.appendChild(thumb);
  });
}

function removePhoto(photoId) {
  state.photos = state.photos.filter(p => p.id !== photoId);
  for (let i = 0; i < 2; i++) {
    state.layers[i] = state.layers[i].filter(l => l.photoId !== photoId);
    rerenderCanvasLayers(i);
  }
  renderPhotoStrip();
}

// ── Layer Management ───────────────────────────────────────────────────────
function addLayerToActiveCanvas(photoId) {
  const idx = state.activeCanvas;
  const zone = state.settings.tshirts?.[idx]?.zone;
  let leftPct, topPct, widthPct, heightPct;

  if (zone && zone.widthPct > 0 && zone.heightPct > 0) {
    widthPct  = Math.min(zone.widthPct * 0.7, 50);
    heightPct = widthPct;
    leftPct   = zone.leftPct + (zone.widthPct - widthPct) / 2;
    topPct    = zone.topPct  + (zone.heightPct - heightPct) / 2;
  } else {
    leftPct = 20; topPct = 20; widthPct = 40; heightPct = 40;
  }

  const layer = {
    id: `l${++_layerId}`,
    photoId,
    leftPct,
    topPct,
    widthPct,
    heightPct,
  };
  state.layers[idx].push(layer);

  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;
  addLayerEl(idx, layer, photo.dataUrl);
}

function addLayerEl(canvasIdx, layer, dataUrl) {
  const canvas = tshirtCanvas[canvasIdx];
  const el = document.createElement("div");
  el.className = "photo-layer";
  el.dataset.layerId = layer.id;
  positionLayerEl(el, layer);

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "";

  const delBtn = document.createElement("button");
  delBtn.className = "layer-delete";
  delBtn.type = "button";
  delBtn.textContent = "✕";
  delBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteLayer(canvasIdx, layer.id, el);
  });

  const handles = ["tl", "tr", "bl", "br"].map((dir) => {
    const h = document.createElement("div");
    h.className = `resize-handle ${dir}`;
    h.dataset.dir = dir;
    return h;
  });

  el.appendChild(img);
  el.appendChild(delBtn);
  handles.forEach(h => el.appendChild(h));
  canvas.appendChild(el);

  setupDragResize(el, canvas, canvasIdx, layer.id);
}

function positionLayerEl(el, layer) {
  el.style.left   = layer.leftPct + "%";
  el.style.top    = layer.topPct + "%";
  el.style.width  = layer.widthPct + "%";
  el.style.height = layer.heightPct + "%";
}

function rerenderCanvasLayers(idx) {
  tshirtCanvas[idx].querySelectorAll(".photo-layer").forEach(el => el.remove());
  state.layers[idx].forEach((layer) => {
    const photo = state.photos.find(p => p.id === layer.photoId);
    if (photo) addLayerEl(idx, layer, photo.dataUrl);
  });
}

function deleteLayer(canvasIdx, layerId, el) {
  state.layers[canvasIdx] = state.layers[canvasIdx].filter(l => l.id !== layerId);
  el.remove();
}

// ── Drag & Resize ──────────────────────────────────────────────────────────
function setupDragResize(layerEl, canvasEl, canvasIdx, layerId) {
  function getLayer() {
    return state.layers[canvasIdx].find(l => l.id === layerId);
  }
  function readStyle() {
    return {
      left:   parseFloat(layerEl.style.left)   || 0,
      top:    parseFloat(layerEl.style.top)     || 0,
      width:  parseFloat(layerEl.style.width)   || 30,
      height: parseFloat(layerEl.style.height)  || 30,
    };
  }
  function applyStyle(left, top, width, height) {
    const l = Math.max(0, Math.min(100 - width,  left));
    const t = Math.max(0, Math.min(100 - height, top));
    const w = Math.max(5, Math.min(100, width));
    const h = Math.max(5, Math.min(100, height));
    layerEl.style.left   = l + "%";
    layerEl.style.top    = t + "%";
    layerEl.style.width  = w + "%";
    layerEl.style.height = h + "%";
    const layer = getLayer();
    if (layer) { layer.leftPct = l; layer.topPct = t; layer.widthPct = w; layer.heightPct = h; }
  }

  // Drag
  layerEl.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("resize-handle")) return;
    if (e.target.classList.contains("layer-delete")) return;
    e.preventDefault();
    e.stopPropagation();
    layerEl.setPointerCapture(e.pointerId);
    layerEl.classList.add("active");

    const sx = e.clientX, sy = e.clientY;
    const s = readStyle();

    function onMove(ev) {
      const cW = canvasEl.offsetWidth, cH = canvasEl.offsetHeight;
      const dx = (ev.clientX - sx) / cW * 100;
      const dy = (ev.clientY - sy) / cH * 100;
      applyStyle(s.left + dx, s.top + dy, s.width, s.height);
    }
    function onUp() {
      layerEl.classList.remove("active");
      layerEl.removeEventListener("pointermove", onMove);
      layerEl.removeEventListener("pointerup", onUp);
    }
    layerEl.addEventListener("pointermove", onMove);
    layerEl.addEventListener("pointerup", onUp);
  });

  // Resize handles
  layerEl.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      layerEl.classList.add("active");

      const dir = handle.dataset.dir;
      const sx = e.clientX, sy = e.clientY;
      const s = readStyle();

      function onMove(ev) {
        const cW = canvasEl.offsetWidth, cH = canvasEl.offsetHeight;
        const dx = (ev.clientX - sx) / cW * 100;
        const dy = (ev.clientY - sy) / cH * 100;
        let { left, top, width, height } = s;

        // tl = top-left physically (right side visually in RTL)
        if (dir === "tl") {
          left   = s.left + dx;
          top    = s.top  + dy;
          width  = s.width  - dx;
          height = s.height - dy;
        } else if (dir === "tr") {
          top    = s.top  + dy;
          width  = s.width  + dx;
          height = s.height - dy;
        } else if (dir === "bl") {
          left   = s.left + dx;
          width  = s.width  - dx;
          height = s.height + dy;
        } else { // br
          width  = s.width  + dx;
          height = s.height + dy;
        }
        applyStyle(left, top, width, height);
      }
      function onUp() {
        layerEl.classList.remove("active");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  });
}

// ── Canvas Composition ─────────────────────────────────────────────────────
// Use fixed size so hidden canvases (display:none) still render correctly
const RENDER_W = 600;
const RENDER_H = 800;

async function renderCanvas(idx) {
  const offscreen = document.createElement("canvas");
  offscreen.width  = RENDER_W * 2;
  offscreen.height = RENDER_H * 2;
  const ctx = offscreen.getContext("2d");
  ctx.scale(2, 2);

  // Background
  const tshirt = state.settings.tshirts?.[idx];
  if (tshirt?.image) {
    try {
      const img = await loadImage(tshirt.image);
      const { x, y, w, h } = containRect(img.naturalWidth, img.naturalHeight, RENDER_W, RENDER_H);
      ctx.drawImage(img, x, y, w, h);
    } catch { /* skip if image fails */ }
  } else {
    ctx.fillStyle = "#0a1628";
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  }

  // Photo layers — positions stored as % so they map correctly to any size
  for (const layer of state.layers[idx]) {
    const photo = state.photos.find(p => p.id === layer.photoId);
    if (!photo) continue;
    try {
      const img = await loadImage(photo.dataUrl);
      const x = (layer.leftPct   / 100) * RENDER_W;
      const y = (layer.topPct    / 100) * RENDER_H;
      const w = (layer.widthPct  / 100) * RENDER_W;
      const h = (layer.heightPct / 100) * RENDER_H;
      const { x: ix, y: iy, w: iw, h: ih } = containRect(img.naturalWidth, img.naturalHeight, w, h);
      ctx.drawImage(img, x + ix, y + iy, iw, ih);
    } catch { /* skip */ }
  }

  return offscreen.toDataURL("image/jpeg", 0.92);
}

function containRect(imgW, imgH, cW, cH) {
  const scale = Math.min(cW / imgW, cH / imgH);
  const w = imgW * scale, h = imgH * scale;
  return { x: (cW - w) / 2, y: (cH - h) / 2, w, h };
}

// ── Form & Submit ──────────────────────────────────────────────────────────
async function handleSubmit() {
  const phone   = String(customerPhone.value  || "").trim();
  const details = String(customerDetails.value || "").trim();

  clearMessages();
  markField(phoneField,   /^01[0125]\d{8}$/.test(phone.replace(/\D/g, "")));
  markField(detailsField, details.length >= 6);

  if (state.photos.length === 0) {
    showError("ارفع صورة واحدة على الأقل قبل الإرسال");
    return;
  }
  if (phoneField.classList.contains("bad") || detailsField.classList.contains("bad")) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "جاري تجهيز الطلب...";

  try {
    const [composed0, composed1] = await Promise.all([renderCanvas(0), renderCanvas(1)]);

    const data = await api("/api/custom-designs", {
      method: "POST",
      body: JSON.stringify({
        phone,
        contactDetails: details,
        cfToken: getTsToken(),
        uploadedImages: state.photos.map(p => p.dataUrl),
        composedImages: [composed0, composed1].filter(Boolean),
      }),
    });

    submitSuccess.textContent = `تم إرسال الطلب بنجاح. رقم الطلب: ${data.designId}`;
    submitSuccess.style.display = "block";
    customerPhone.value = "";
    customerDetails.value = "";
    phoneField.classList.remove("bad");
    detailsField.classList.remove("bad");
    state.photos = [];
    state.layers = [[], []];
    renderPhotoStrip();
    rerenderCanvasLayers(0);
    rerenderCanvasLayers(1);
  } catch (err) {
    showError(err.message || "تعذر إرسال الطلب");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال الطلب";
  }
}

function clearMessages() {
  submitError.style.display = "none";
  submitError.textContent = "";
  submitSuccess.style.display = "none";
  submitSuccess.textContent = "";
}
function showError(msg) {
  submitError.textContent = msg;
  submitError.style.display = "block";
}
function markField(field, isValid) {
  field.classList.toggle("bad", !isValid);
}

// ── Image Utils ────────────────────────────────────────────────────────────
async function optimizeImage(file, maxSide) {
  const raw = await readFileAsDataUrl(file);
  const img = await loadImage(raw);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width  = Math.max(1, Math.round(img.naturalWidth  * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر تحميل الصورة"));
    img.src = src;
  });
}
