import { api, bytesToDataUrl, fmtEGP, qs, qsa, show } from "./app.js";

const root = qs("#root");

let state = {
  view: "login", // login | products | orders | feedback | stats
  products: [],
  orders: [],
  feedback: [],
  discountCodes: [],
  stats: null,
  activeNav: "products",
};

renderLogin();

// ══════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════
function renderLogin() {
  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:18px">
      <div class="panel" style="width:min(420px,92vw);text-align:center">
        <div class="logo" style="margin:0 auto 6px;font-size:46px">MD</div>
        <div class="mini" style="margin-bottom:16px">لوحة التحكم</div>
        <div class="field" id="fPass" style="text-align:right">
          <label for="pass">كلمة المرور</label>
          <input id="pass" type="password" autocomplete="current-password" />
          <div class="err">الصفحة غير متاحة</div>
        </div>
        <button id="loginBtn" class="btn" type="button">دخول</button>
      </div>
    </div>
  `;

  const pass = qs("#pass");
  const loginBtn = qs("#loginBtn");
  pass.focus();
  pass.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  loginBtn.addEventListener("click", doLogin);

  async function doLogin() {
    clearBad();
    loginBtn.disabled = true;
    loginBtn.textContent = "جاري...";
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: pass.value }),
      });
      await loadAll();
      state.view = "products";
      renderShell();
      renderProducts();
    } catch (e) {
      markBad("fPass", e.message || "الصفحة غير متاحة");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "دخول";
    }
  }
}

// ══════════════════════════════════════════
//  SHELL
// ══════════════════════════════════════════
function renderShell() {
  const newFeedback = state.feedback.filter(f => f.status === "new").length;

  root.innerHTML = `
    <div class="admin-wrap">
      <aside class="sidebar">
        <div class="brand" style="justify-content:flex-start;margin-bottom:16px">
          <div>
            <div class="logo">MD</div>
            <small>CONTROL PANEL</small>
          </div>
        </div>
        <button id="navProducts" class="btn sidebtn ${state.activeNav==='products'?'active':''}" type="button">📦 إدارة المنتجات</button>
        <button id="navDiscounts" class="btn sidebtn ${state.activeNav==='discounts'?'active':''}" type="button">🏷️ إدارة الخصومات</button>
        <button id="navStats"    class="btn sidebtn ${state.activeNav==='stats'?'active':''}"    type="button">📊 الإحصائيات</button>
        <button id="navFeedback" class="btn sidebtn ${state.activeNav==='feedback'?'active':''}" type="button">
          💬 الشكاوي والاقتراحات
          ${newFeedback > 0 ? `<span style="background:var(--danger);color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:900;margin-right:4px">${newFeedback}</span>` : ""}
        </button>
        <button id="navOrders"   class="btn sidebtn ${state.activeNav==='orders'?'active':''}"   type="button">🛒 إدارة الطلبات</button>
        <div style="flex:1"></div>
        <button id="logout" class="btn danger sidebtn" type="button">تسجيل خروج</button>
        <div class="mini" style="margin-top:10px;line-height:1.6;text-align:center">
          الوصول لهذه الصفحة سري.
        </div>
      </aside>
      <section class="content">
        <div id="view"></div>
      </section>
    </div>
    <div id="backdrop" class="backdrop"></div>
    <section id="modal" class="modal" role="dialog" aria-modal="true">
      <div class="modal-inner">
        <div class="modal-close">
          <div id="modalTitle" style="font-weight:900">—</div>
          <button id="modalX" class="xbtn" type="button">✕</button>
        </div>
        <div id="modalBody"></div>
      </div>
    </section>
  `;

  // Nav events
  qs("#navProducts").addEventListener("click", async () => {
    state.activeNav = "products"; await loadProducts(); renderShell(); renderProducts();
  });
  qs("#navDiscounts").addEventListener("click", async () => {
    state.activeNav = "discounts"; await loadDiscountCodes(); renderShell(); renderDiscountCodes();
  });
  qs("#navOrders").addEventListener("click", async () => {
    state.activeNav = "orders"; await loadOrders(); renderShell(); renderOrders();
  });
  qs("#navStats").addEventListener("click", async () => {
    state.activeNav = "stats"; await loadStats(); renderShell(); renderStats();
  });
  qs("#navFeedback").addEventListener("click", async () => {
    state.activeNav = "feedback"; await loadFeedback(); renderShell(); renderFeedback();
  });
  qs("#logout").addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } finally {
      state = { view: "login", products: [], orders: [], feedback: [], discountCodes: [], stats: null, activeNav: "products" };
      renderLogin();
    }
  });

  const backdrop = qs("#backdrop");
  const modal = qs("#modal");
  qs("#modalX").addEventListener("click", () => { show(backdrop, false); show(modal, false); });
  backdrop.addEventListener("click", () => { show(backdrop, false); show(modal, false); });
}

// ══════════════════════════════════════════
//  LOAD DATA
// ══════════════════════════════════════════
async function loadAll() {
  await Promise.all([loadProducts(), loadOrders(), loadStats(), loadFeedback(), loadDiscountCodes()]);
}
async function loadProducts() {
  const d = await api("/api/admin/products"); state.products = d.products || [];
}
async function loadOrders() {
  const d = await api("/api/admin/orders"); state.orders = d.orders || [];
}
async function loadStats() {
  const d = await api("/api/admin/stats"); state.stats = d.stats || null;
}
async function loadFeedback() {
  const d = await api("/api/admin/feedback"); state.feedback = d.feedback || [];
}
async function loadDiscountCodes() {
  const d = await api("/api/admin/discount-codes"); state.discountCodes = d.codes || [];
}

// ══════════════════════════════════════════
//  PRODUCTS VIEW  (improved cards)
// ══════════════════════════════════════════
function renderProducts() {
  const view = qs("#view");
  view.innerHTML = `
    <div class="toolbar">
      <div>
        <div style="font-weight:900;font-size:18px">📦 إدارة المنتجات</div>
        <div class="mini">${state.products.length} منتج</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="search" placeholder="بحث بالاسم..." style="width:200px" />
        <select id="filter" style="width:150px">
          <option value="all">الكل</option>
          <option value="published">منشور</option>
          <option value="draft">مسودة</option>
          <option value="hidden">مخفي</option>
          <option value="sale">به تخفيض</option>
        </select>
        <button id="create" class="btn" type="button" style="margin:0;width:auto;padding:10px 20px">＋ منتج جديد</button>
      </div>
    </div>
    <div id="pGrid" class="admin-grid"></div>
  `;

  qs("#create").addEventListener("click", () => openProductEditor(null));
  qs("#search").addEventListener("input", renderProductGrid);
  qs("#filter").addEventListener("change", renderProductGrid);
  renderProductGrid();
}

function renderProductGrid() {
  const q = qs("#search")?.value.trim().toLowerCase() || "";
  const f = qs("#filter")?.value || "all";
  const grid = qs("#pGrid");
  grid.innerHTML = "";

  const list = state.products.filter((p) => {
    if (q && !String(p.name || "").toLowerCase().includes(q)) return false;
    if (f === "all") return true;
    if (f === "sale") return p.salePrice && p.basePrice && p.salePrice < p.basePrice;
    return p.visibility === f;
  });

  if (!list.length) {
    grid.innerHTML = `<div class="muted-box" style="grid-column:1/-1;text-align:center;padding:40px">لا توجد نتائج.</div>`;
    return;
  }

  list.forEach((p, i) => {
    const hasSale = p.salePrice && p.basePrice && p.salePrice < p.basePrice;
    const statusMap = { published: "منشور", draft: "مسودة", hidden: "مخفي" };
    const el = document.createElement("article");
    el.className = "admin-product-card";
    el.style.animationDelay = `${i * 50}ms`;

    el.innerHTML = `
      ${hasSale ? `<div class="chip" style="position:absolute;top:10px;right:10px;left:auto">تخفيض</div>` : ""}
      <div style="position:relative;overflow:hidden">
        ${p.cardImage
          ? `<img class="admin-card-image" alt="${escapeAttr(p.name)}" src="${escapeAttr(p.cardImage)}" loading="lazy" />`
          : `<div class="admin-card-no-image">🖼️ لا توجد صورة</div>`}
      </div>
      <div class="admin-card-body">
        <div class="admin-card-name" title="${escapeAttr(p.name)}">${escapeHtml(p.name)}</div>
        <div class="admin-card-meta">
          <span class="status-badge status-${p.visibility}">${statusMap[p.visibility] || p.visibility}</span>
          <span class="mini">•</span>
          <span class="mini">${(p.sizes || []).length} مقاس</span>
        </div>
        <div class="admin-card-price">
          ${hasSale ? `<span class="admin-card-price-old">${fmtEGP(p.basePrice)}</span>` : ""}
          ${fmtEGP(p.salePrice || p.basePrice || 0)}
        </div>
        ${p.sizes?.length ? `
          <div class="admin-card-sizes">
            ${p.sizes.slice(0,5).map(s => `<span class="admin-size-tag">${escapeHtml(s.label)}</span>`).join("")}
            ${p.sizes.length > 5 ? `<span class="admin-size-tag">+${p.sizes.length - 5}</span>` : ""}
          </div>
        ` : ""}
        <div class="admin-card-actions">
          <button class="btn" data-act="edit" type="button">✏️ تعديل</button>
          <button class="btn danger" data-act="del" type="button">🗑️ حذف</button>
        </div>
      </div>
    `;

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const act = b.getAttribute("data-act");
      if (act === "edit") openProductEditor(p);
      if (act === "del") deleteProduct(p);
    });

    grid.appendChild(el);
  });
}

function cardPreviewMarkup(src, kind = "existing") {
  if (!src) {
    return `<div class="admin-image-empty">لا توجد صورة محددة</div>`;
  }

  return `
    <div class="admin-image-preview admin-image-preview-card">
      <img
        src="${escapeAttr(src)}"
        alt=""
        data-card-preview="true"
        data-kind="${escapeAttr(kind)}"
        data-src="${escapeAttr(src)}"
      />
      <button type="button" class="admin-image-remove rm-card-img" aria-label="حذف الصورة">✕</button>
    </div>
  `;
}

function detailPreviewMarkup(src, kind = "existing", idx = "") {
  const wrapperAttrs = kind === "existing"
    ? `data-detail-idx="${escapeAttr(String(idx))}"`
    : `data-new="true"`;
  const imgAttrs = kind === "existing"
    ? `data-existing="true" data-src="${escapeAttr(src)}"`
    : `data-new="true" data-src="${escapeAttr(src)}"`;

  return `
    <div class="admin-image-preview admin-image-preview-detail" ${wrapperAttrs}>
      <img src="${escapeAttr(src)}" alt="" ${imgAttrs} />
      <button type="button" class="admin-image-remove rm-detail-img" aria-label="حذف الصورة">✕</button>
    </div>
  `;
}

// ══════════════════════════════════════════
//  DISCOUNTS VIEW
// ══════════════════════════════════════════
function renderDiscountCodes() {
  const view = qs("#view");
  view.innerHTML = `
    <div class="toolbar">
      <div>
        <div style="font-weight:900;font-size:18px">🏷️ إدارة الخصومات</div>
        <div class="mini">${state.discountCodes.length} كود خصم</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="discountSearch" placeholder="بحث بالكود..." style="width:220px" />
        <button id="refreshDiscounts" class="btn" type="button" style="margin:0;width:auto;padding:10px 16px">🔄 تحديث</button>
        <button id="createDiscount" class="btn" type="button" style="margin:0;width:auto;padding:10px 18px">＋ إنشاء كود</button>
      </div>
    </div>
    <div id="discountGrid" class="admin-grid"></div>
  `;

  qs("#discountSearch").addEventListener("input", renderDiscountGrid);
  qs("#refreshDiscounts").addEventListener("click", async () => {
    await loadDiscountCodes();
    renderDiscountGrid();
  });
  qs("#createDiscount").addEventListener("click", () => openDiscountEditor(null));
  renderDiscountGrid();
}

function renderDiscountGrid() {
  const q = qs("#discountSearch")?.value.trim().toLowerCase() || "";
  const grid = qs("#discountGrid");
  grid.innerHTML = "";

  const list = state.discountCodes.filter((entry) => {
    if (!q) return true;
    return String(entry.code || "").toLowerCase().includes(q);
  });

  if (!list.length) {
    grid.innerHTML = `<div class="muted-box" style="grid-column:1/-1;text-align:center;padding:40px">لا توجد أكواد خصم.</div>`;
    return;
  }

  list.forEach((entry, i) => {
    const exhausted = entry.exhausted || entry.remainingUses <= 0;
    const active = entry.isActive !== false && !exhausted;
    const el = document.createElement("article");
    el.className = "admin-product-card";
    el.style.animationDelay = `${i * 40}ms`;
    el.innerHTML = `
      <div class="admin-card-body" style="gap:12px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div>
            <div class="admin-card-name" dir="ltr">${escapeHtml(entry.code)}</div>
            <div class="mini">${active ? "نشط" : exhausted ? "منتهي" : "متوقف"} • خصم ${entry.discountPercent}%</div>
          </div>
          <span class="status-badge ${active ? "status-published" : "status-hidden"}">${active ? "نشط" : exhausted ? "منتهي" : "متوقف"}</span>
        </div>

        <div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0">
          <div class="stat-card" style="padding:14px;min-height:auto">
            <div class="stat-value" style="font-size:20px">${entry.usedCount}</div>
            <div class="stat-label">تم الاستخدام</div>
          </div>
          <div class="stat-card" style="padding:14px;min-height:auto">
            <div class="stat-value" style="font-size:20px">${entry.remainingUses}</div>
            <div class="stat-label">المتبقي</div>
          </div>
          <div class="stat-card" style="padding:14px;min-height:auto">
            <div class="stat-value" style="font-size:20px">${entry.maxUses}</div>
            <div class="stat-label">الحد الأقصى</div>
          </div>
        </div>

        <div class="mini" style="line-height:1.8">
          <div>تاريخ الإنشاء: ${entry.createdAt ? new Date(entry.createdAt).toLocaleString("ar-EG") : "—"}</div>
          <div>آخر استخدام: ${entry.lastUsedAt ? new Date(entry.lastUsedAt).toLocaleString("ar-EG") : "لم يُستخدم بعد"}</div>
        </div>

        <div class="admin-card-actions">
          <button class="btn" data-act="edit" type="button">✏️ تعديل</button>
          <button class="btn secondary" data-act="reset" type="button">↺ تصفير</button>
          <button class="btn danger" data-act="del" type="button">🗑️ حذف</button>
        </div>
      </div>
    `;

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "edit") openDiscountEditor(entry);
      if (act === "reset") resetDiscountCode(entry);
      if (act === "del") deleteDiscountCode(entry);
    });

    grid.appendChild(el);
  });
}

function openDiscountEditor(entry) {
  const backdrop = qs("#backdrop");
  const modal = qs("#modal");
  const title = qs("#modalTitle");
  const body = qs("#modalBody");
  const code = entry || {};

  title.textContent = entry ? "تعديل كود الخصم" : "إنشاء كود خصم";

  body.innerHTML = `
    <div style="display:grid;gap:14px">
      <div class="field">
        <label>كود الخصم *</label>
        <input id="discountCodeValue" value="${escapeAttr(code.code || "")}" placeholder="مثال: SAVE10" dir="ltr" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field">
          <label>نسبة الخصم % *</label>
          <input id="discountPercentValue" type="number" min="1" max="100" value="${code.discountPercent || ""}" />
        </div>
        <div class="field">
          <label>عدد الاستخدامات *</label>
          <input id="discountMaxUsesValue" type="number" min="1" value="${code.maxUses || ""}" />
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:10px;font-weight:700">
        <input id="discountActiveValue" type="checkbox" ${entry ? (code.isActive !== false ? "checked" : "") : "checked"} style="width:auto" />
        الكود نشط
      </label>
      <div class="mini" style="line-height:1.8">
        <div>المستخدمون حالياً: ${code.usedCount || 0}</div>
        <div>المتبقي حالياً: ${code.remainingUses ?? code.maxUses ?? 0}</div>
      </div>
      <div class="err" id="discountEditorErr" style="display:none;padding:8px 12px;background:rgba(239,68,68,.1);border-radius:10px"></div>
      <button id="saveDiscountCode" class="btn" type="button">${entry ? "💾 حفظ التعديلات" : "✨ إنشاء الكود"}</button>
    </div>
  `;

  qs("#saveDiscountCode", body).addEventListener("click", () => saveDiscountCode(entry?.id || null));

  show(backdrop, true);
  show(modal, true);
}

async function saveDiscountCode(existingId) {
  const body = qs("#modalBody");
  const errEl = qs("#discountEditorErr", body);
  const saveBtn = qs("#saveDiscountCode", body);

  errEl.style.display = "none";

  const payload = {
    code: qs("#discountCodeValue", body).value.trim().toUpperCase(),
    discountPercent: Number(qs("#discountPercentValue", body).value) || 0,
    maxUses: Number(qs("#discountMaxUsesValue", body).value) || 0,
    isActive: qs("#discountActiveValue", body).checked,
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "جاري الحفظ...";

  try {
    if (existingId) {
      await api(`/api/admin/discount-codes/${existingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("✅ تم تحديث كود الخصم");
    } else {
      await api("/api/admin/discount-codes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("✨ تم إنشاء كود الخصم");
    }

    await loadDiscountCodes();
    show(qs("#backdrop"), false);
    show(qs("#modal"), false);
    renderDiscountCodes();
  } catch (e) {
    errEl.textContent = e.message || "حصل خطأ أثناء حفظ الكود";
    errEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = existingId ? "💾 حفظ التعديلات" : "✨ إنشاء الكود";
  }
}

async function resetDiscountCode(entry) {
  if (!confirm(`هل تريد تصفير استخدامات الكود ${entry.code}؟`)) return;
  try {
    await api(`/api/admin/discount-codes/${entry.id}/reset`, {
      method: "POST",
      body: "{}",
    });
    await loadDiscountCodes();
    renderDiscountCodes();
    showToast("↺ تم تصفير عدد الاستخدامات");
  } catch (e) {
    alert(e.message || "تعذر تصفير الكود");
  }
}

async function deleteDiscountCode(entry) {
  if (!confirm(`هل تريد حذف كود الخصم ${entry.code} نهائياً؟`)) return;
  try {
    await api(`/api/admin/discount-codes/${entry.id}`, {
      method: "DELETE",
    });
    await loadDiscountCodes();
    renderDiscountCodes();
    showToast("🗑️ تم حذف كود الخصم");
  } catch (e) {
    alert(e.message || "تعذر حذف الكود");
  }
}

// ══════════════════════════════════════════
//  ORDERS VIEW
// ══════════════════════════════════════════
function renderOrders() {
  const view = qs("#view");
  view.innerHTML = `
    <div class="toolbar">
      <div>
        <div style="font-weight:900;font-size:18px">🛒 إدارة الطلبات</div>
        <div class="mini">${state.orders.length} طلب</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="orderSearch" placeholder="ابحث برقم الطلب أو اسم العميل..." style="width:260px" />
        <select id="orderStatus" style="width:150px">
          <option value="all">كل الحالات</option>
          <option value="pending">في انتظار التأكيد</option>
          <option value="confirmed">تم التأكيد</option>
          <option value="processing">قيد التجهيز</option>
          <option value="shipped">تم الشحن</option>
          <option value="delivered">تم التسليم</option>
          <option value="cancelled">ملغي</option>
        </select>
        <button id="refreshOrders" class="btn" type="button" style="margin:0;width:auto;padding:10px 16px">🔄 تحديث</button>
      </div>
    </div>
    <div id="ordersGrid" class="orders-grid"></div>
  `;

  qs("#orderSearch").addEventListener("input", renderOrdersGrid);
  qs("#orderStatus").addEventListener("change", renderOrdersGrid);
  qs("#refreshOrders").addEventListener("click", async () => {
    await loadOrders(); renderOrdersGrid();
  });
  renderOrdersGrid();
}

function renderOrdersGrid() {
  const q = qs("#orderSearch")?.value.trim().toLowerCase() || "";
  const st = qs("#orderStatus")?.value || "all";
  const grid = qs("#ordersGrid");
  grid.innerHTML = "";

  const list = state.orders.filter((o) => {
    if (st !== "all" && o.status !== st) return false;
    if (q) {
      const hay = `${o.id} ${o.customer?.name || ""} ${o.customer?.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!list.length) {
    grid.innerHTML = `<div class="muted-box" style="text-align:center;padding:40px">لا توجد طلبات.</div>`;
    return;
  }

  list.forEach((o, i) => {
    const statusLabel = {
      pending:"في انتظار التأكيد", confirmed:"تم التأكيد",
      processing:"قيد التجهيز", shipped:"تم الشحن",
      delivered:"تم التسليم", cancelled:"ملغي",
    }[o.status] || o.status;

    const el = document.createElement("div");
    el.className = "order-card";
    el.style.animationDelay = `${i * 40}ms`;
    el.innerHTML = `
      <div class="order-card-header">
        <div>
          <div class="order-id">${escapeHtml(o.id)}</div>
          <div class="order-date">${new Date(o.createdAt).toLocaleDateString("ar-EG", {year:"numeric",month:"long",day:"numeric"})}</div>
        </div>
        <div class="order-status ${o.status}">${escapeHtml(statusLabel)}</div>
      </div>
      <div class="order-card-body">
        <div class="order-info-item">
          <div class="order-info-label">👤 العميل</div>
          <div class="order-info-value">${escapeHtml(o.customer?.name || "—")}</div>
        </div>
        <div class="order-info-item">
          <div class="order-info-label">📞 الهاتف</div>
          <div class="order-info-value" dir="ltr">${escapeHtml(o.customer?.phone || "—")}</div>
        </div>
        <div class="order-info-item">
          <div class="order-info-label">📍 المحافظة</div>
          <div class="order-info-value">${escapeHtml(o.customer?.governorate || "—")}</div>
        </div>
        <div class="order-info-item">
          <div class="order-info-label">🛍️ المنتجات</div>
          <div class="order-info-value">${(o.items || []).length} منتج</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="order-total">${fmtEGP(o.total || 0)}</div>
        <button class="btn" data-act="view" type="button" style="margin:0;width:auto;padding:8px 18px;font-size:13px">عرض التفاصيل</button>
      </div>
    `;
    const orderActions = el.querySelector("[data-act='view']")?.parentElement;
    if (orderActions) {
      orderActions.style.display = "flex";
      orderActions.style.gap = "8px";
      orderActions.style.flexWrap = "wrap";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn danger";
      deleteBtn.type = "button";
      deleteBtn.dataset.act = "delete";
      deleteBtn.style.margin = "0";
      deleteBtn.style.width = "auto";
      deleteBtn.style.padding = "8px 18px";
      deleteBtn.style.fontSize = "13px";
      deleteBtn.textContent = "حذف الطلب";
      orderActions.appendChild(deleteBtn);
    }

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn?.dataset.act === "delete") {
        openDeleteOrderModal(o);
        return;
      }
      if (btn?.dataset.act === "view" || !btn) {
        openOrderModal(o);
      }
    });
    grid.appendChild(el);
  });
}

function openOrderModal(o) {
  const backdrop = qs("#backdrop");
  const modal    = qs("#modal");
  const title    = qs("#modalTitle");
  const body     = qs("#modalBody");

  title.textContent = `طلب رقم: ${o.id}`;

  const statusLabel = {
    pending:"في انتظار التأكيد", confirmed:"تم التأكيد",
    processing:"قيد التجهيز", shipped:"تم الشحن",
    delivered:"تم التسليم", cancelled:"ملغي",
  };

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div>
        <div style="font-weight:900;margin-bottom:12px;color:var(--teal2)">بيانات العميل</div>
        <div class="panel" style="padding:14px;gap:8px;display:grid">
          <div><span class="mini">الاسم: </span><b>${escapeHtml(o.customer?.name||"—")}</b></div>
          <div><span class="mini">الهاتف: </span><b dir="ltr">${escapeHtml(o.customer?.phone||"—")}</b></div>
          ${o.customer?.phone2 ? `<div><span class="mini">هاتف احتياطي: </span><b dir="ltr">${escapeHtml(o.customer.phone2)}</b></div>` : ""}
          <div><span class="mini">المحافظة: </span><b>${escapeHtml(o.customer?.governorate||"—")}</b></div>
          <div><span class="mini">المنطقة: </span><b>${escapeHtml(o.customer?.area||"—")}</b></div>
          <div><span class="mini">العنوان: </span><b>${escapeHtml(o.customer?.address||"—")}</b></div>
        </div>
      </div>
      <div>
        <div style="font-weight:900;margin-bottom:12px;color:var(--teal2)">تحديث الحالة</div>
        <div class="panel" style="padding:14px">
          <select id="newStatus" style="margin-bottom:10px">
            ${["pending","confirmed","processing","shipped","delivered","cancelled"].map(s =>
              `<option value="${s}" ${o.status===s?"selected":""}>${statusLabel[s]||s}</option>`
            ).join("")}
          </select>
          <input id="statusNote" placeholder="ملاحظة (اختياري)" style="margin-bottom:10px" />
          <button id="updateStatus" class="btn" type="button" style="margin:0">تحديث الحالة</button>
        </div>
      </div>
    </div>

    <div style="margin-top:18px">
      <div style="font-weight:900;margin-bottom:12px;color:var(--teal2)">المنتجات في الطلب</div>
      <div style="display:grid;gap:8px">
        ${(o.items||[]).map(item => `
          <div class="order-card" style="cursor:default;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:700">${escapeHtml(item.name||"—")}</div>
                <div class="mini">المقاس: ${escapeHtml(item.size||"—")} • الكمية: ${item.qty||1}</div>
              </div>
              <div style="font-weight:900;color:var(--gold)">${fmtEGP(item.subtotal||0)}</div>
            </div>
          </div>
        `).join("")}
      </div>
      <div style="text-align:left;margin-top:10px">
        <span style="font-weight:900;font-size:18px;color:var(--gold)">الإجمالي: ${fmtEGP(o.total||0)}</span>
      </div>
    </div>

    ${(o.history||[]).length ? `
      <div style="margin-top:18px">
        <div style="font-weight:900;margin-bottom:12px;color:var(--teal2)">سجل الحالات</div>
        <div style="display:grid;gap:8px">
          ${o.history.map(h => `
            <div style="padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:center">
              <div>
                <div class="order-status ${h.status}" style="display:inline-block">${statusLabel[h.status]||h.status}</div>
                ${h.note ? `<div class="mini" style="margin-top:4px">${escapeHtml(h.note)}</div>` : ""}
              </div>
              <div class="mini">${new Date(h.at).toLocaleString("ar-EG")}</div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;

  qs("#updateStatus", body).addEventListener("click", async () => {
    const newSt  = qs("#newStatus", body).value;
    const note   = qs("#statusNote", body).value.trim();
    const btn    = qs("#updateStatus", body);
    btn.disabled = true; btn.textContent = "جاري...";
    try {
      await api(`/api/admin/orders/${o.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newSt, note }),
      });
      await loadOrders();
      show(backdrop, false); show(modal, false);
      renderOrders();
      showToast("✅ تم تحديث حالة الطلب");
    } catch(e) {
      alert(e.message || "حصل خطأ");
    } finally {
      btn.disabled = false; btn.textContent = "تحديث الحالة";
    }
  });

  show(backdrop, true);
  show(modal, true);
}

function openDeleteOrderModal(o) {
  const backdrop = qs("#backdrop");
  const modal    = qs("#modal");
  const title    = qs("#modalTitle");
  const body     = qs("#modalBody");

  title.textContent = `حذف الطلب: ${o.id}`;
  body.innerHTML = `
    <div class="confirm-delete-wrap">
      <div class="confirm-delete-warning">
        سيتم حذف هذا الطلب نهائيا من لوحة التحكم ومن صفحة تتبع الطلبات، ولا يمكن التراجع عن العملية.
      </div>
      <div class="panel confirm-delete-panel">
        <div class="mini">رقم الطلب المطلوب حذفه</div>
        <div class="confirm-delete-order-id">${escapeHtml(o.id)}</div>
        <label for="deleteOrderConfirmInput" class="confirm-delete-label">
          اكتب رقم الطلب بالكامل لتأكيد الحذف
        </label>
        <input
          id="deleteOrderConfirmInput"
          dir="ltr"
          autocomplete="off"
          spellcheck="false"
          placeholder="${escapeAttr(o.id)}"
        />
        <div id="deleteOrderError" class="err" style="display:none"></div>
        <div class="confirm-delete-actions">
          <button id="confirmDeleteOrderBtn" class="btn danger" type="button" disabled>تأكيد الحذف</button>
          <button id="cancelDeleteOrderBtn" class="btn secondary" type="button">إلغاء</button>
        </div>
      </div>
    </div>
  `;

  const input = qs("#deleteOrderConfirmInput", body);
  const confirmBtn = qs("#confirmDeleteOrderBtn", body);
  const cancelBtn = qs("#cancelDeleteOrderBtn", body);
  const errEl = qs("#deleteOrderError", body);

  const syncDeleteState = () => {
    confirmBtn.disabled = input.value.trim() !== o.id;
    errEl.style.display = "none";
  };

  input.addEventListener("input", syncDeleteState);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!confirmBtn.disabled) confirmBtn.click();
  });

  cancelBtn.addEventListener("click", () => {
    show(backdrop, false);
    show(modal, false);
  });

  confirmBtn.addEventListener("click", async () => {
    if (input.value.trim() !== o.id) {
      syncDeleteState();
      return;
    }

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    input.disabled = true;
    confirmBtn.textContent = "جاري الحذف...";

    try {
      await api(`/api/admin/orders/${o.id}`, { method: "DELETE" });
      await loadOrders();
      show(backdrop, false);
      show(modal, false);
      renderOrders();
      showToast("🗑️ تم حذف الطلب نهائيا");
    } catch (e) {
      errEl.textContent = e.message || "حصل خطأ أثناء حذف الطلب";
      errEl.style.display = "block";
      confirmBtn.disabled = input.value.trim() !== o.id;
      cancelBtn.disabled = false;
      input.disabled = false;
      confirmBtn.textContent = "تأكيد الحذف";
      input.focus();
    }
  });

  show(backdrop, true);
  show(modal, true);
  input.focus();
  syncDeleteState();
}

// ══════════════════════════════════════════
//  FEEDBACK VIEW
// ══════════════════════════════════════════
function renderFeedback() {
  const view = qs("#view");
  const total       = state.feedback.length;
  const complaints  = state.feedback.filter(f => f.type === "complaint").length;
  const suggestions = state.feedback.filter(f => f.type === "suggestion").length;
  const newCount    = state.feedback.filter(f => f.status === "new").length;

  view.innerHTML = `
    <div class="toolbar">
      <div>
        <div style="font-weight:900;font-size:18px">💬 الشكاوي والاقتراحات</div>
        <div class="mini">${total} رسالة • ${newCount} جديدة</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="feedbackSearch" placeholder="بحث..." style="width:200px" />
        <button id="refreshFeedback" class="btn" type="button" style="margin:0;width:auto;padding:10px 16px">🔄 تحديث</button>
      </div>
    </div>

    <div class="filter-tabs" id="feedbackTabs">
      <button class="filter-tab active" data-filter="all">الكل (${total})</button>
      <button class="filter-tab" data-filter="complaint">😤 شكاوي (${complaints})</button>
      <button class="filter-tab" data-filter="suggestion">💡 اقتراحات (${suggestions})</button>
      <button class="filter-tab" data-filter="new">🆕 جديدة (${newCount})</button>
    </div>

    <div id="feedbackGrid" class="feedback-grid"></div>
  `;

  let activeFilter = "all";

  qs("#feedbackTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    activeFilter = tab.getAttribute("data-filter");
    qsa(".filter-tab", qs("#feedbackTabs")).forEach(t => t.classList.toggle("active", t === tab));
    renderFeedbackGrid(activeFilter, qs("#feedbackSearch").value.trim().toLowerCase());
  });

  qs("#feedbackSearch").addEventListener("input", (e) => {
    renderFeedbackGrid(activeFilter, e.target.value.trim().toLowerCase());
  });

  qs("#refreshFeedback").addEventListener("click", async () => {
    await loadFeedback(); renderFeedback();
  });

  renderFeedbackGrid("all", "");
}

function renderFeedbackGrid(filter, q) {
  const grid = qs("#feedbackGrid");
  grid.innerHTML = "";

  const list = state.feedback.filter(f => {
    if (filter === "all") { /* no type filter */ }
    else if (filter === "new") { if (f.status !== "new") return false; }
    else { if (f.type !== filter) return false; }

    if (q) {
      const hay = `${f.message||""} ${f.orderId||""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!list.length) {
    grid.innerHTML = `<div class="muted-box" style="text-align:center;padding:40px">لا توجد نتائج.</div>`;
    return;
  }

  const typeLabel  = { complaint:"شكوى", suggestion:"اقتراح" };
  const statusLabel= { new:"جديدة", read:"مقروءة", resolved:"محلولة" };

  list.forEach((f, i) => {
    const el = document.createElement("div");
    el.className = `feedback-card ${f.type}`;
    el.style.animationDelay = `${i * 40}ms`;

    el.innerHTML = `
      <div class="feedback-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="feedback-type-badge ${f.type}">${f.type === "complaint" ? "😤" : "💡"} ${typeLabel[f.type]||f.type}</span>
          <span class="feedback-status ${f.status}">${statusLabel[f.status]||f.status}</span>
        </div>
        <div class="feedback-date">${new Date(f.createdAt).toLocaleString("ar-EG")}</div>
      </div>

      ${f.orderId ? `
        <div style="margin-bottom:8px">
          <span class="mini">رقم الطلب: </span>
          <span class="feedback-order-link" data-orderid="${escapeAttr(f.orderId)}">${escapeHtml(f.orderId)}</span>
        </div>
      ` : ""}

      <div class="feedback-message">${escapeHtml(f.message)}</div>

      <div class="feedback-actions">
        ${f.status !== "read"     ? `<button class="btn secondary" data-act="read"     data-id="${f.id}" type="button">✓ تحديد كمقروء</button>` : ""}
        ${f.status !== "resolved" ? `<button class="btn success-btn" data-act="resolve" data-id="${f.id}" type="button">✅ محلولة</button>` : ""}
        ${f.orderId ? `<button class="btn" data-act="vieworder" data-orderid="${escapeAttr(f.orderId)}" type="button">🔍 عرض الطلب</button>` : ""}
        <button class="btn danger" data-act="delete" data-id="${f.id}" type="button">🗑️ حذف</button>
      </div>
    `;

    // order link click
    el.querySelector(".feedback-order-link")?.addEventListener("click", async () => {
      const order = state.orders.find(o => o.id === f.orderId);
      if (order) {
        openOrderModal(order);
      } else {
        // reload orders and try again
        await loadOrders();
        const o2 = state.orders.find(o => o.id === f.orderId);
        if (o2) openOrderModal(o2);
        else showToast("❌ الطلب غير موجود");
      }
    });

    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      const id  = btn.getAttribute("data-id");
      const oid = btn.getAttribute("data-orderid");

      if (act === "read") {
        await updateFeedbackStatus(id, "read");
      } else if (act === "resolve") {
        await updateFeedbackStatus(id, "resolved");
      } else if (act === "delete") {
        if (!confirm("هل تريد حذف هذه الرسالة؟")) return;
        try {
          await api(`/api/admin/feedback/${id}`, { method: "DELETE" });
          await loadFeedback();
          renderShell();
          renderFeedback();
          showToast("🗑️ تم الحذف");
        } catch(e) { alert(e.message); }
      } else if (act === "vieworder") {
        const order = state.orders.find(o => o.id === oid) || await fetchOrder(oid);
        if (order) openOrderModal(order);
        else showToast("❌ الطلب غير موجود");
      }
    });

    grid.appendChild(el);
  });
}

async function updateFeedbackStatus(id, status) {
  try {
    await api(`/api/admin/feedback/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    await loadFeedback();
    renderShell();
    renderFeedback();
    showToast("✅ تم التحديث");
  } catch(e) { alert(e.message); }
}

async function fetchOrder(id) {
  try {
    const d = await api(`/api/admin/orders/${id}`);
    return d.order || null;
  } catch { return null; }
}

// ══════════════════════════════════════════
//  STATS VIEW
// ══════════════════════════════════════════
function renderStats() {
  const s = state.stats;
  const view = qs("#view");
  if (!s) {
    view.innerHTML = `<div class="muted-box" style="text-align:center;padding:40px">لا توجد إحصائيات.</div>`;
    return;
  }

  view.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-weight:900;font-size:18px;margin-bottom:4px">📊 الإحصائيات</div>
      <div class="mini">نظرة عامة على المتجر</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="animation-delay:0ms">
        <div class="stat-icon">📦</div>
        <div class="stat-value">${s.totalProducts}</div>
        <div class="stat-label">إجمالي المنتجات</div>
      </div>
      <div class="stat-card" style="animation-delay:60ms">
        <div class="stat-icon">✅</div>
        <div class="stat-value">${s.publishedProducts}</div>
        <div class="stat-label">منتجات منشورة</div>
      </div>
      <div class="stat-card" style="animation-delay:120ms">
        <div class="stat-icon">🛒</div>
        <div class="stat-value">${s.totalOrders}</div>
        <div class="stat-label">إجمالي الطلبات</div>
      </div>
      <div class="stat-card" style="animation-delay:180ms">
        <div class="stat-icon">⏳</div>
        <div class="stat-value">${s.pendingOrders}</div>
        <div class="stat-label">طلبات معلقة</div>
      </div>
      <div class="stat-card" style="animation-delay:240ms">
        <div class="stat-icon">🎉</div>
        <div class="stat-value">${s.deliveredOrders}</div>
        <div class="stat-label">طلبات مسلّمة</div>
      </div>
      <div class="stat-card" style="animation-delay:300ms">
        <div class="stat-icon">❌</div>
        <div class="stat-value">${s.cancelledOrders}</div>
        <div class="stat-label">طلبات ملغاة</div>
      </div>
      <div class="stat-card" style="animation-delay:360ms;border-color:rgba(212,175,55,.3)">
        <div class="stat-icon">💰</div>
        <div class="stat-value" style="color:var(--gold)">${fmtEGP(s.totalRevenue)}</div>
        <div class="stat-label">إجمالي الإيرادات</div>
      </div>
      <div class="stat-card" style="animation-delay:420ms">
        <div class="stat-icon">💬</div>
        <div class="stat-value">${s.totalFeedback}</div>
        <div class="stat-label">إجمالي الرسائل</div>
      </div>
      <div class="stat-card" style="animation-delay:480ms;border-color:rgba(239,68,68,.2)">
        <div class="stat-icon">😤</div>
        <div class="stat-value" style="color:#f87171">${s.complaints}</div>
        <div class="stat-label">شكاوي</div>
      </div>
      <div class="stat-card" style="animation-delay:540ms">
        <div class="stat-icon">💡</div>
        <div class="stat-value">${s.suggestions}</div>
        <div class="stat-label">اقتراحات</div>
      </div>
    </div>

    ${s.newFeedback > 0 ? `
      <div class="panel" style="border-color:rgba(234,179,8,.3);background:rgba(234,179,8,.05);display:flex;align-items:center;gap:12px;padding:16px">
        <span style="font-size:24px">🔔</span>
        <div>
          <div style="font-weight:900">لديك ${s.newFeedback} رسالة جديدة</div>
          <div class="mini">شكاوي أو اقتراحات تنتظر مراجعتك</div>
        </div>
        <button class="btn" type="button" id="goToFeedback" style="margin:0;width:auto;padding:8px 16px">عرض الرسائل</button>
      </div>
    ` : ""}
  `;

  qs("#goToFeedback")?.addEventListener("click", async () => {
    state.activeNav = "feedback";
    await loadFeedback();
    renderShell();
    renderFeedback();
  });
}

// ══════════════════════════════════════════
//  PRODUCT EDITOR MODAL
// ══════════════════════════════════════════
function openProductEditor(product) {
  const backdrop = qs("#backdrop");
  const modal    = qs("#modal");
  const title    = qs("#modalTitle");
  const body     = qs("#modalBody");

  title.textContent = product ? "تعديل المنتج" : "إنشاء منتج جديد";

  const p = product || {};
  const sizes = p.sizes || [];

  body.innerHTML = `
    <div style="display:grid;gap:14px">
      <div class="field" id="fName">
        <label>اسم المنتج *</label>
        <input id="pName" value="${escapeAttr(p.name||"")}" placeholder="اسم المنتج" />
        <div class="err">يرجى إدخال الاسم</div>
      </div>
      <div class="field">
        <label>الوصف</label>
        <textarea id="pDesc" rows="3" style="resize:vertical">${escapeHtml(p.description||"")}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="field" id="fBase">
          <label>السعر الأصلي *</label>
          <input id="pBase" type="number" min="0" value="${p.basePrice||""}" />
          <div class="err">يرجى إدخال السعر</div>
        </div>
        <div class="field">
          <label>سعر التخفيض (اختياري)</label>
          <input id="pSale" type="number" min="0" value="${p.salePrice||""}" />
        </div>
        <div class="field">
          <label>الحالة</label>
          <select id="pVis">
            <option value="draft"     ${(p.visibility||"draft")==="draft"?"selected":""}>مسودة</option>
            <option value="published" ${p.visibility==="published"?"selected":""}>منشور</option>
            <option value="hidden"    ${p.visibility==="hidden"?"selected":""}>مخفي</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>صورة البطاقة الرئيسية</label>
        <input id="pCardImg" type="file" accept="image/*" style="padding:8px" />
        <div
          id="cardPreview"
          class="admin-image-grid"
          data-had-existing="${p.cardImage ? "true" : "false"}"
          style="margin-top:8px"
        >
          ${cardPreviewMarkup(p.cardImage || "", p.cardImage ? "existing" : "none")}
        </div>
      </div>

      <div class="field">
        <label>صور التفاصيل (يمكن اختيار أكثر من صورة)</label>
        <input id="pDetailImgs" type="file" accept="image/*" multiple style="padding:8px" />
        <div id="detailPreviews" class="admin-image-grid" style="margin-top:8px">
          ${(p.detailImages||[]).map((src, idx) => `
            <div style="position:relative;display:inline-block" data-detail-idx="${idx}">
              <img src="${escapeAttr(src)}" style="height:60px;border-radius:8px;object-fit:cover;display:block" data-existing="true" data-src="${escapeAttr(src)}" />
              <button type="button" class="rm-detail-img" data-idx="${idx}" style="position:absolute;top:-6px;left:-6px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(239,68,68,.9);color:#fff;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">✕</button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label>المقاسات</label>
        <div id="sizesContainer">
          ${sizes.map((s, i) => sizeRow(s.label, s.stock, i)).join("")}
        </div>
        <button id="addSize" class="btn secondary" type="button" style="margin-top:8px;width:auto;padding:8px 18px">＋ إضافة مقاس</button>
      </div>

      <div class="err" id="editorErr" style="display:none;padding:8px 12px;background:rgba(239,68,68,.1);border-radius:10px"></div>

      <button id="saveProduct" class="btn" type="button" style="font-size:16px">
        ${product ? "💾 حفظ التعديلات" : "✨ إنشاء المنتج"}
      </button>
    </div>
  `;

  let sizeIdx = sizes.length;
  const cardInput = qs("#pCardImg", body);
  const cardPreview = qs("#cardPreview", body);
  const originalCardImage = p.cardImage || "";

  function renderCardPreview(kind = originalCardImage ? "existing" : "none", src = originalCardImage || "") {
    cardPreview.innerHTML = cardPreviewMarkup(src, kind);
  }

  qs("#addSize", body).addEventListener("click", () => {
    const c = qs("#sizesContainer", body);
    const div = document.createElement("div");
    div.innerHTML = sizeRow("", 0, sizeIdx++);
    c.appendChild(div.firstElementChild);
  });

  qs("#sizesContainer", body).addEventListener("click", (e) => {
    if (e.target.classList.contains("rm-size")) {
      e.target.closest(".size-row")?.remove();
    }
  });

  cardInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await bytesToDataUrl(file);
    renderCardPreview("new", url);
  });

  cardPreview.addEventListener("click", (e) => {
    if (!e.target.closest(".rm-card-img")) return;

    const activePreview = qs("[data-card-preview='true']", cardPreview);
    const activeKind = activePreview?.dataset.kind || "none";
    cardInput.value = "";

    if (activeKind === "new" && originalCardImage) {
      renderCardPreview("existing", originalCardImage);
      return;
    }

    renderCardPreview("none", "");
  });

  qs("#pDetailImgs", body).addEventListener("change", async (e) => {
    const prev = qs("#detailPreviews", body);
    for (const file of e.target.files) {
      const url = await bytesToDataUrl(file);
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:relative;display:inline-block";
      wrapper.setAttribute("data-new", "true");
      wrapper.innerHTML = `
        <img src="${url}" style="height:60px;border-radius:8px;object-fit:cover;display:block" data-new="true" />
        <button type="button" class="rm-detail-img" style="position:absolute;top:-6px;left:-6px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(239,68,68,.9);color:#fff;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">✕</button>
      `;
      wrapper.querySelector(".rm-detail-img").addEventListener("click", () => wrapper.remove());
      prev.appendChild(wrapper);
    }

    e.target.value = "";
  });

  // Remove existing detail images
  qs("#detailPreviews", body).addEventListener("click", (e) => {
    const btn = e.target.closest(".rm-detail-img");
    if (!btn) return;
    btn.closest("[data-detail-idx]")?.remove();
  });

  qs("#saveProduct", body).addEventListener("click", () => saveProduct(product?.id || null));

  show(backdrop, true);
  show(modal, true);
}

function sizeRow(label, stock, idx) {
  return `
    <div class="size-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input placeholder="المقاس (مثل: S, M, L)" value="${escapeAttr(label)}"
        style="flex:1" data-role="size-label" data-idx="${idx}" />
      <input type="number" placeholder="المخزون" value="${stock||0}" min="0"
        style="width:100px" data-role="size-stock" data-idx="${idx}" />
      <button class="btn danger rm-size" type="button" style="margin:0;width:auto;padding:8px 12px">✕</button>
    </div>
  `;
}

async function saveProduct(existingId) {
  const body    = qs("#modalBody");
  const errEl   = qs("#editorErr", body);
  const saveBtn = qs("#saveProduct", body);
  errEl.style.display = "none";

  const name     = qs("#pName", body).value.trim();
  const desc     = qs("#pDesc", body).value.trim();
  const basePrice= Number(qs("#pBase", body).value) || 0;
  const salePriceRaw = qs("#pSale", body).value;
  const salePrice= salePriceRaw ? Number(salePriceRaw) : null;
  const visibility= qs("#pVis", body).value;

  if (!name) { errEl.textContent = "يرجى إدخال اسم المنتج"; errEl.style.display = "block"; return; }
  if (!basePrice) { errEl.textContent = "يرجى إدخال السعر الأصلي"; errEl.style.display = "block"; return; }

  // Sizes
  const sizeRows = qsa(".size-row", body);
  const sizes = [];
  for (const row of sizeRows) {
    const label = row.querySelector("[data-role='size-label']")?.value.trim();
    const stock = Number(row.querySelector("[data-role='size-stock']")?.value) || 0;
    if (label) sizes.push({ label, stock });
  }

  // Card image
  const cardPreview = qs("#cardPreview", body);
  const activeCardPreview = qs("[data-card-preview='true']", cardPreview);
  const hadExistingCardImage = cardPreview.dataset.hadExisting === "true";
  let cardImage = undefined;
  if (activeCardPreview?.dataset.kind === "new") {
    cardImage = activeCardPreview.dataset.src || activeCardPreview.getAttribute("src");
  } else if (!activeCardPreview && hadExistingCardImage) {
    cardImage = null;
  }

  // Detail images: collect remaining existing + newly added
  const detailPreviews = qs("#detailPreviews", body);
  const keptExisting = Array.from(detailPreviews.querySelectorAll("img[data-existing='true']"))
    .map(img => img.getAttribute("data-src")).filter(Boolean);
  const newPreviews = Array.from(detailPreviews.querySelectorAll("[data-new='true'] img[data-new='true']"));
  const newImages = await Promise.all(
    newPreviews.map(img => {
      // Convert data URL back — we already have the data URL as img.src
      return Promise.resolve(img.dataset.src || img.src);
    })
  );
  const detailImages = [...keptExisting, ...newImages];

  const payload = { name, description: desc, basePrice, salePrice, visibility, sizes };
  if (cardImage !== undefined) payload.cardImage = cardImage;
  payload.detailImages = detailImages;

  saveBtn.disabled = true;
  saveBtn.textContent = "جاري الحفظ...";

  try {
    if (existingId) {
      await api(`/api/admin/products/${existingId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("✅ تم حفظ التعديلات");
    } else {
      await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
      showToast("✨ تم إنشاء المنتج");
    }
    await loadProducts();
    show(qs("#backdrop"), false);
    show(qs("#modal"), false);
    renderShell();
    renderProducts();
  } catch(e) {
    errEl.textContent = e.message || "حصل خطأ";
    errEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = existingId ? "💾 حفظ التعديلات" : "✨ إنشاء المنتج";
  }
}

async function deleteProduct(p) {
  if (!confirm(`هل تريد حذف "${p.name}"؟`)) return;
  try {
    await api(`/api/admin/products/${p.id}`, { method: "DELETE" });
    await loadProducts();
    renderProducts();
    showToast("🗑️ تم حذف المنتج");
  } catch(e) { alert(e.message); }
}

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

function markBad(fieldId, msg) {
  const el = qs(`#${fieldId}`);
  if (!el) return;
  el.classList.add("bad");
  const errEl = el.querySelector(".err");
  if (errEl && msg) errEl.textContent = msg;
}

function clearBad() {
  qsa(".bad").forEach(el => el.classList.remove("bad"));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("'","&#39;"); }
