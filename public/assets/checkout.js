import { api, fmtEGP, getCart, qs, setCart } from "./app.js";
import { GOVERNORATES } from "./governorates.js";

const summaryEmpty = qs("#summaryEmpty");
const summaryList  = qs("#summaryList");
const summaryTotal = qs("#summaryTotal");
const form         = qs("#form");
const submitBtn    = qs("#submitBtn");
const govSel       = qs("#gov");
const confirmOverlay = qs("#confirm");
const swirl        = qs("#swirl");
const okCard       = qs("#okCard");
const okId         = qs("#okId");
const checkPath    = qs("#checkPath");
const copyBtn      = qs("#copyBtn");

boot();

function boot() {
  // Populate governorates
  govSel.innerHTML =
    `<option value="">اختر المحافظة</option>` +
    GOVERNORATES.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");

  renderSummary().catch(() => {});
  form.addEventListener("submit", onSubmit);

  copyBtn?.addEventListener("click", async () => {
    const id = okId.textContent.trim();
    if (!id) return;
    const copied = await copyText(id);
    copyBtn.textContent = copied ? "✅ تم النسخ" : "انسخ يدويًا";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "نسخ رقم الطلب";
      copyBtn.classList.remove("copied");
    }, 1800);
  });
}

async function renderSummary() {
  const cart = getCart();
  summaryList.innerHTML = "";
  summaryEmpty.style.display = cart.length ? "none" : "";

  let total = 0;
  let products = [];
  try {
    const data = await api("/api/products");
    products = data.products || [];
  } catch {
    products = [];
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of cart) {
    const product = byId.get(item.productId);
    const unit = product ? (Number(product.salePrice) || Number(product.basePrice) || 0) : 0;
    const line = unit * (item.qty || 1);
    total += line;

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      ${product?.cardImage
        ? `<img class="cart-item-img" alt="" src="${escapeAttr(product.cardImage)}" />`
        : `<div class="cart-item-img"></div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(product?.name || "منتج")}</div>
        <div class="cart-item-meta">المقاس: ${escapeHtml(item.size)} • الكمية: ${item.qty || 1}</div>
        <div class="cart-item-price">${fmtEGP(line)}</div>
      </div>
    `;
    summaryList.appendChild(row);
  }

  summaryTotal.textContent = fmtEGP(total);
}

async function onSubmit(e) {
  e.preventDefault();
  clearErrors();

  const cart = getCart();
  if (!cart.length) {
    markBad("fName", "السلة فارغة");
    return;
  }

  const customer = {
    name:        qs("#name").value.trim(),
    phone:       normalizePhone(qs("#phone").value),
    phone2:      normalizePhone(qs("#phone2").value),
    governorate: govSel.value.trim(),
    area:        qs("#area").value.trim(),
    building:    qs("#building").value.trim(),
    address:     qs("#address").value.trim(),
  };

  if (!validate(customer)) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "جاري التأكيد...";
  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({ cart, customer }),
    });
    setCart([]);
    await playConfirm(String(data.orderId || ""));
  } catch (err) {
    alert(err.message || "حصل خطأ");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "✅ تأكيد الطلب";
  }
}

function validate(customer) {
  let ok = true;

  if (customer.name.split(/\s+/).filter(Boolean).length < 2) {
    markBad("fName", "يرجى إدخال الاسم الثلاثي");
    ok = false;
  }
  if (!/^01[0125]\d{8}$/.test(customer.phone)) {
    markBad("fPhone", "أدخل رقم هاتف مصري صحيح");
    ok = false;
  }
  if (customer.phone2 && !/^01[0125]\d{8}$/.test(customer.phone2)) {
    markBad("fPhone2", "رقم غير صحيح");
    ok = false;
  }
  if (!customer.governorate) {
    markBad("fGov", "اختر المحافظة");
    ok = false;
  }
  if (!customer.area) {
    markBad("fArea", "أدخل المنطقة");
    ok = false;
  }
  if (!customer.building) {
    markBad("fBuilding", "أدخل رقم/اسم المبنى");
    ok = false;
  }
  return ok;
}

function markBad(id, msg) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.classList.add("bad");
  const errEl = el.querySelector(".err");
  if (errEl && msg) errEl.textContent = msg;
}

function clearErrors() {
  document.querySelectorAll(".bad").forEach(el => el.classList.remove("bad"));
}

// ── Confirm Animation ──
async function playConfirm(orderId) {
  okId.textContent = orderId;
  confirmOverlay.style.display = "flex";
  okCard.style.opacity = "0";

  const ctx = swirl.getContext("2d");
  const cx = 150, cy = 150;
  const particles = [];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    particles.push({
      x: cx + Math.cos(angle) * 60,
      y: cy + Math.sin(angle) * 60,
      vx: Math.cos(angle) * 2.5,
      vy: Math.sin(angle) * 2.5,
      color: `hsl(${160 + i * 8},80%,60%)`,
      r: 3 + Math.random() * 3,
    });
  }

  const start = performance.now();
  const duration = 900;

  await animateFrame((now) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = t * t * (3 - 2 * t);
    ctx.clearRect(0, 0, 300, 300);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - ease;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    return t >= 1;
  });

  okCard.animate(
    [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 420, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" }
  );
  okCard.style.opacity = "1";

  await wait(100);

  checkPath.animate(
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 520, fill: "forwards" }
  );
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function animateFrame(fn) {
  return new Promise((resolve) => {
    function tick(now) {
      const done = fn(now);
      if (done) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── Phone normalize ──
function normalizePhone(input) {
  const s = String(input || "");
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
  };
  let out = "";
  for (const ch of s) out += map[ch] || ch;
  return out.replace(/[^\d]/g, "");
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.focus(); area.select();
    area.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch { return false; }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("'","&#39;"); }
