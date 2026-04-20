import {
  addToCart, api, cartCount, clampInt, fmtEGP,
  getCart, qs, qsa, show, updateQty,
} from "./app.js";

// ── Elements ──
const gridEl     = qs("#grid");
const emptyEl    = qs("#empty");

const backdrop   = qs("#backdrop");
const modal      = qs("#productModal");
const modalBody  = qs("#modalBody");
const modalClose = qs("#modalClose");

const drawerBackdrop = qs("#drawerBackdrop");
const drawer     = qs("#drawer");
const cartBtn    = qs("#cartBtn");
const cartBadge  = qs("#cartBadge");
const cartCountEl= qs("#cartCount");
const cartList   = qs("#cartList");
const cartEmpty  = qs("#cartEmpty");
const cartTotal  = qs("#cartTotal");
const drawerClose= qs("#drawerClose");
const checkoutBtn= qs("#checkoutBtn");
const continueBtn= qs("#continueBtn");

const trackBtn     = qs("#trackBtn");
const trackBackdrop= qs("#trackBackdrop");
const trackModal   = qs("#trackModal");
const trackClose   = qs("#trackClose");
const trackGo      = qs("#trackGo");
const trackId      = qs("#trackId");
const trackErr     = qs("#trackErr");
const trackResult  = qs("#trackResult");

const helpBtn      = qs("#helpBtn");
const helpBackdrop = qs("#helpBackdrop");
const helpModal    = qs("#helpModal");
const helpClose    = qs("#helpClose");

let products = [];
let activeProduct = null;

boot();

async function boot() {
  syncCartUI();
  bindCart();
  bindProductModal();
  bindTracking();
  bindHelp();

  try {
    const data = await api("/api/products");
    products = data.products || [];
  } catch {
    products = [];
  }
  renderGrid();
}

// ── Grid ──
function renderGrid() {
  gridEl.innerHTML = "";
  show(emptyEl, products.length === 0);
  products.forEach((p, i) => {
    const priceInfo = computePriceInfo(p);
    const previewImage = p.cardImage || p.detailImages?.[0] || "";
    const el = document.createElement("article");
    el.className = "card";
    el.style.animationDelay = `${i * 60}ms`;
    el.innerHTML = `
      ${priceInfo.hasDiscount ? `<div class="chip">تخفيض</div>` : ""}
      <div class="card-media">
        ${previewImage
          ? `<img alt="${escapeAttr(p.name)}" src="${escapeAttr(previewImage)}" loading="lazy" />`
          : `<div class="mini">لا توجد صورة</div>`}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(p.name)}</div>
        <div class="price-row">
          ${priceInfo.hasDiscount ? `<div class="price was">${fmtEGP(priceInfo.was)}</div>` : ""}
          <div class="price ${priceInfo.hasDiscount ? "sale" : ""}">${fmtEGP(priceInfo.now)}</div>
        </div>
        <button class="btn" type="button">تسوق الآن</button>
      </div>
    `;
    el.addEventListener("click", () => openProduct(p.id));
    gridEl.appendChild(el);
  });
}

function computePriceInfo(product) {
  const was = Number(product.basePrice) || 0;
  const now = Number(product.salePrice) || was;
  const hasDiscount =
    product.salePrice !== null &&
    product.salePrice !== undefined &&
    now > 0 &&
    was > 0 &&
    now < was;
  return { was, now, hasDiscount };
}

// ── Product Modal ──
function openProduct(productId) {
  const p = products.find((x) => x.id === productId);
  if (!p) return;
  activeProduct = p;

  const images = [p.cardImage, ...(p.detailImages || [])].filter(Boolean);
  const img1 = images[0] || "";
  const img2 = images[1] || images[0] || "";
  const priceInfo = computePriceInfo(p);

  modalBody.innerHTML = `
    <div class="product-layout">
      <div class="gallery">
        <div class="gallery-two">
          <div class="shot">${img1 ? `<img id="g1" alt="" src="${escapeAttr(img1)}" />` : `<div class="mini" style="padding:16px">لا توجد صور</div>`}</div>
          <div class="shot">${img2 ? `<img id="g2" alt="" src="${escapeAttr(img2)}" />` : `<div class="mini" style="padding:16px">—</div>`}</div>
        </div>
        ${images.length > 2
          ? `<div class="thumbs" id="thumbs">
              ${images.map((src, i) =>
                `<img class="${i === 0 ? "active" : ""}" data-src="${escapeAttr(src)}" alt="" src="${escapeAttr(src)}" />`
              ).join("")}
            </div>`
          : `<div style="height:2px"></div>`}
      </div>
      <div>
        <div class="h2">${escapeHtml(p.name)}</div>
        <div class="desc">${escapeHtml(p.description || "")}</div>

        <div style="margin-top:14px;font-weight:900">المقاس</div>
        <div class="sizes" id="sizes">
          ${(p.sizes || []).map((s) =>
            `<button type="button" class="size-btn" data-size="${escapeAttr(s.label)}">${escapeHtml(s.label)}</button>`
          ).join("")}
        </div>

        <div class="row2">
          <div class="price-row">
            ${priceInfo.hasDiscount
              ? `<div class="price was" id="pWas">${fmtEGP(priceInfo.was)}</div>`
              : `<div id="pWas" style="display:none"></div>`}
            <div class="price ${priceInfo.hasDiscount ? "sale" : ""}" id="pNow">${fmtEGP(priceInfo.now)}</div>
          </div>
          <div class="qty" aria-label="Quantity">
            <button type="button" id="qPlus">+</button>
            <span id="qVal">1</span>
            <button type="button" id="qMinus">−</button>
          </div>
        </div>

        <div class="mini" style="margin-top:6px;display:flex;gap:8px;align-items:center">
          <span style="color:var(--teal2);font-weight:900">✓</span>
          <span>متوفر</span>
        </div>

        <div style="display:flex;gap:10px;align-items:stretch;margin-top:14px;flex-wrap:wrap">
          <button id="addBtn" class="btn" type="button" style="margin:0;flex:1;min-width:220px" disabled>إضافة للسلة</button>
          <button id="favBtn" class="fav" type="button" aria-label="Favorite">♡</button>
        </div>

        <div class="features">
          <div class="feature"><span>🛡️</span> <b>جودة عالية</b> <span>خامة ممتازة</span></div>
          <div class="feature"><span>🧵</span> <b>تفصيل محكم</b> <span>خياطة قوية</span></div>
          <div class="feature"><span>📦</span> <b>إصدار محدود</b> <span>تصميم حصري</span></div>
        </div>
      </div>
    </div>
  `;

  wireGallery();
  wireProductControls();
  show(backdrop, true);
  show(modal, true);
}

function wireGallery() {
  const thumbs = qs("#thumbs", modalBody);
  const imgA = qs("#g1", modalBody);
  const imgB = qs("#g2", modalBody);
  if (!thumbs || !imgA) return;
  thumbs.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    const src = img.getAttribute("data-src") || "";
    imgA.src = src;
    if (imgB) imgB.src = src;
    qsa("img", thumbs).forEach((x) => x.classList.toggle("active", x === img));
  });
}

function wireProductControls() {
  const sizesEl = qs("#sizes", modalBody);
  const addBtn  = qs("#addBtn", modalBody);
  const favBtn  = qs("#favBtn", modalBody);
  const qVal    = qs("#qVal", modalBody);
  const qPlus   = qs("#qPlus", modalBody);
  const qMinus  = qs("#qMinus", modalBody);
  const pNow    = qs("#pNow", modalBody);
  const pWas    = qs("#pWas", modalBody);

  let selected = "";
  let qty = 1;

  sizesEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    selected = btn.getAttribute("data-size") || "";
    qsa(".size-btn", sizesEl).forEach((b) => b.classList.toggle("active", b === btn));
    if (addBtn) addBtn.disabled = !selected;
  });

  qPlus?.addEventListener("click", () => {
    qty = clampInt(qty + 1, 1, 99);
    if (qVal) qVal.textContent = String(qty);
  });
  qMinus?.addEventListener("click", () => {
    qty = clampInt(qty - 1, 1, 99);
    if (qVal) qVal.textContent = String(qty);
  });

  addBtn?.addEventListener("click", () => {
    if (!activeProduct || !selected) {
      addBtn.classList.remove("shake");
      void addBtn.offsetWidth;
      addBtn.classList.add("shake");
      return;
    }
    const cart = addToCart({ productId: activeProduct.id, size: selected, qty });
    syncCartUI(cart);
    closeProductModal();
    openDrawer();
  });

  favBtn?.addEventListener("click", () => {
    favBtn.classList.toggle("active");
    favBtn.textContent = favBtn.classList.contains("active") ? "♥" : "♡";
  });
}

function closeProductModal() {
  show(backdrop, false);
  show(modal, false);
}

// ── Cart ──
let drawerOpened = false;
let drawerCloseTimer = null;
let drawerTransitionToken = 0;
const DRAWER_ANIMATION_MS = 320;

function bindCart() {
  // Toggle: نفس الزر يفتح ويقفل
  cartBtn.addEventListener("click", () => {
    if (drawerOpened) closeDrawer();
    else openDrawer();
  });

  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  continueBtn?.addEventListener("click", closeDrawer);
  modalClose.addEventListener("click", closeProductModal);
  backdrop.addEventListener("click", closeProductModal);

  // مهم جدا: نخفي الدروار تماما عند بداية التحميل
  drawer.hidden = true;
  drawerBackdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
}

function openDrawer() {
  drawerTransitionToken += 1;

  if (drawerCloseTimer) {
    clearTimeout(drawerCloseTimer);
    drawerCloseTimer = null;
  }

  renderCart();
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");

  requestAnimationFrame(() => {
    show(drawerBackdrop, true);
    drawer.classList.add("show");
  });

  drawerOpened = true;
}

function closeDrawer() {
  if (!drawerOpened) return;

  const transitionToken = ++drawerTransitionToken;

  drawer.classList.remove("show");
  show(drawerBackdrop, false);
  drawerOpened = false;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");

  drawerCloseTimer = setTimeout(() => {
    if (transitionToken !== drawerTransitionToken) return;
    drawer.hidden = true;
    drawerBackdrop.hidden = true;
    drawerCloseTimer = null;
  }, DRAWER_ANIMATION_MS + 80);
}

function syncCartUI(cart = getCart()) {
  const count = cartCount(cart);
  if (cartBadge) {
    cartBadge.textContent = String(count);
    cartBadge.style.display = count > 0 ? "" : "none";
  }
  if (cartCountEl) cartCountEl.textContent = `${count} عنصر`;
}

function renderCart() {
  const cart = getCart();
  const byId = new Map(products.map((p) => [p.id, p]));

  show(cartEmpty, cart.length === 0);
  cartList.innerHTML = "";
  let total = 0;

  for (const item of cart) {
    const p = byId.get(item.productId);
    const unit = p ? (Number(p.salePrice) || Number(p.basePrice) || 0) : 0;
    const sub  = unit * (item.qty || 1);
    total += sub;

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      ${p?.cardImage
        ? `<img class="cart-item-img" src="${escapeAttr(p.cardImage)}" alt="" />`
        : `<div class="cart-item-img"></div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(p?.name || "منتج")}</div>
        <div class="cart-item-meta">المقاس: ${escapeHtml(item.size)} • الكمية: ${item.qty || 1}</div>
        <div class="cart-item-price">${fmtEGP(sub)}</div>
      </div>
      <button class="cart-item-remove" data-pid="${escapeAttr(item.productId)}" data-size="${escapeAttr(item.size)}" title="حذف">✕</button>
    `;
    cartList.appendChild(row);
  }

  cartTotal.textContent = fmtEGP(total);

  cartList.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-item-remove");
    if (!btn) return;
    const pid  = btn.getAttribute("data-pid");
    const size = btn.getAttribute("data-size");
    const updated = updateQty(pid, size, 0);
    syncCartUI(updated);
    renderCart();
  }, { once: true });
}

// ── Tracking ──
function bindProductModal() {
  // already bound in bindCart
}

function bindTracking() {
  trackBtn.addEventListener("click", () => {
    show(trackBackdrop, true);
    show(trackModal, true);
    trackId.value = "";
    trackErr.style.display = "none";
    trackResult.innerHTML = "";
    setTimeout(() => trackId.focus(), 100);
  });

  const closeTrack = () => {
    show(trackBackdrop, false);
    show(trackModal, false);
  };

  trackClose.addEventListener("click", closeTrack);
  trackBackdrop.addEventListener("click", closeTrack);

  trackId.addEventListener("keydown", (e) => { if (e.key === "Enter") doTrack(); });
  trackGo.addEventListener("click", doTrack);
}

async function doTrack() {
  const id = trackId.value.trim();
  trackErr.style.display = "none";
  trackResult.innerHTML = "";

  if (!id) {
    trackErr.textContent = "يرجى إدخال رقم الطلب";
    trackErr.style.display = "block";
    return;
  }

  trackGo.disabled = true;
  trackGo.textContent = "جاري البحث...";

  try {
    const data = await api(`/api/orders/${encodeURIComponent(id)}`);
    const o = data.order;
    const statusLabel = {
      pending:"في انتظار التأكيد", confirmed:"تم التأكيد",
      processing:"قيد التجهيز", shipped:"تم الشحن",
      delivered:"تم التسليم", cancelled:"ملغي",
    }[o.status] || o.status;

    trackResult.innerHTML = `
      <div style="border:1px solid rgba(20,184,166,.2);border-radius:14px;padding:16px;background:rgba(13,148,136,.05)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:900;font-family:monospace;color:var(--teal2)">${escapeHtml(o.id)}</div>
          <div class="order-status ${o.status}">${escapeHtml(statusLabel)}</div>
        </div>
        <div class="mini" style="margin-bottom:10px">تاريخ الطلب: ${new Date(o.createdAt).toLocaleDateString("ar-EG")}</div>
        ${(o.history || []).map((h) => `
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;padding:8px;border-radius:10px;background:rgba(255,255,255,.03)">
            <span style="color:var(--teal2);font-size:16px">•</span>
            <div>
              <div style="font-weight:700;font-size:13px">${escapeHtml(h.status)}</div>
              ${h.note ? `<div class="mini">${escapeHtml(h.note)}</div>` : ""}
              <div class="mini">${new Date(h.at).toLocaleString("ar-EG")}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    trackErr.textContent = err.message || "رقم الطلب غير موجود";
    trackErr.style.display = "block";
  } finally {
    trackGo.disabled = false;
    trackGo.textContent = "تتبع";
  }
}

// ── Help / Feedback ──
function bindHelp() {
  // Open/close
  helpBtn.addEventListener("click", openHelp);

  const closeHelp = () => {
    show(helpBackdrop, false);
    show(helpModal, false);
    resetHelp();
  };

  helpClose.addEventListener("click", closeHelp);
  helpBackdrop.addEventListener("click", closeHelp);

  // Step 1: choose type
  qs("#chooseComplaint").addEventListener("click", () => {
    qs("#helpStep1").style.display = "none";
    qs("#helpStepComplaint").style.display = "block";
  });
  qs("#chooseSuggestion").addEventListener("click", () => {
    qs("#helpStep1").style.display = "none";
    qs("#helpStepSuggestion").style.display = "block";
  });

  // Back buttons
  qs("#backFromComplaint").addEventListener("click", () => {
    qs("#helpStepComplaint").style.display = "none";
    qs("#helpStep1").style.display = "block";
  });
  qs("#backFromSuggestion").addEventListener("click", () => {
    qs("#helpStepSuggestion").style.display = "none";
    qs("#helpStep1").style.display = "block";
  });

  // Send complaint
  qs("#sendComplaint").addEventListener("click", async () => {
    const orderId = qs("#complaintOrderId").value.trim();
    const message = qs("#complaintMsg").value.trim();
    const errEl   = qs("#complaintErr");

    errEl.style.display = "none";

    if (!orderId) {
      errEl.textContent = "يرجى إدخال رقم الطلب";
      errEl.style.display = "block";
      return;
    }
    if (!message || message.length < 5) {
      errEl.textContent = "يرجى كتابة تفاصيل الشكوى (5 أحرف على الأقل)";
      errEl.style.display = "block";
      return;
    }

    await submitFeedback("complaint", message, orderId, errEl, "sendComplaint");
  });

  // Send suggestion
  qs("#sendSuggestion").addEventListener("click", async () => {
    const orderId = qs("#suggestionOrderId").value.trim();
    const message = qs("#suggestionMsg").value.trim();
    const errEl   = qs("#suggestionErr");

    errEl.style.display = "none";

    if (!message || message.length < 5) {
      errEl.textContent = "يرجى كتابة الاقتراح (5 أحرف على الأقل)";
      errEl.style.display = "block";
      return;
    }

    await submitFeedback("suggestion", message, orderId, errEl, "sendSuggestion");
  });

  // Success close
  qs("#helpSuccessClose").addEventListener("click", () => {
    show(helpBackdrop, false);
    show(helpModal, false);
    resetHelp();
  });
}

async function submitFeedback(type, message, orderId, errEl, btnId) {
  const btn = qs(`#${btnId}`);
  btn.disabled = true;
  btn.textContent = "جاري الإرسال...";

  try {
    await api("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type, message, orderId: orderId || null }),
    });
    // Show success
    qs("#helpStep1").style.display = "none";
    qs("#helpStepComplaint").style.display = "none";
    qs("#helpStepSuggestion").style.display = "none";
    qs("#helpSuccess").style.display = "block";
  } catch (err) {
    errEl.textContent = err.message || "حدث خطأ، حاول مرة أخرى";
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = type === "complaint" ? "إرسال الشكوى" : "إرسال الاقتراح";
  }
}

function openHelp() {
  resetHelp();
  show(helpBackdrop, true);
  show(helpModal, true);
}

function resetHelp() {
  qs("#helpStep1").style.display = "block";
  qs("#helpStepComplaint").style.display = "none";
  qs("#helpStepSuggestion").style.display = "none";
  qs("#helpSuccess").style.display = "none";
  qs("#complaintOrderId").value = "";
  qs("#complaintMsg").value = "";
  qs("#suggestionOrderId").value = "";
  qs("#suggestionMsg").value = "";
  qs("#complaintErr").style.display = "none";
  qs("#suggestionErr").style.display = "none";
}

// ── Helpers ──
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("'","&#39;"); }
