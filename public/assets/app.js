export function origin() {
  if (typeof window === "undefined") return "";
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}

export function appUrl(path = "/") {
  return new URL(path, `${origin()}/`).toString();
}

export async function api(path, options = {}) {
  const res = await fetch(appUrl(path), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || "حصل خطأ";
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const EGP = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

export function fmtEGP(n) {
  const v = Number(n) || 0;
  return EGP.format(v);
}

const CART_KEY = "md_cart_v1";

export function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const cart = raw ? JSON.parse(raw) : [];
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

export function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function cartCount(cart = getCart()) {
  return cart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

export function addToCart(item) {
  const cart = getCart();
  const idx = cart.findIndex(
    (c) => c.productId === item.productId && c.size === item.size
  );
  if (idx >= 0) {
    cart[idx].qty = clampInt((cart[idx].qty || 1) + item.qty, 1, 99);
  } else {
    cart.push({
      productId: item.productId,
      size: item.size,
      qty: clampInt(item.qty, 1, 99),
    });
  }
  setCart(cart);
  return cart;
}

export function updateQty(productId, size, qty) {
  const cart = getCart();
  const idx = cart.findIndex((c) => c.productId === productId && c.size === size);
  if (idx < 0) return cart;
  const next = clampInt(qty, 0, 99);
  if (next <= 0) cart.splice(idx, 1);
  else cart[idx].qty = next;
  setCart(cart);
  return cart;
}

export function clampInt(v, min, max) {
  const n = Number.isFinite(v) ? Math.floor(v) : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function qs(sel, el = document) {
  return el.querySelector(sel);
}

export function qsa(sel, el = document) {
  return Array.from(el.querySelectorAll(sel));
}

export function show(el, on) {
  if (!el) return;
  el.classList.toggle("show", !!on);
}

export function bytesToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

// ── Cloudflare Turnstile ──
let _tsToken = "";
let _tsWidgetId = null;

export function renderTurnstile(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const siteKey = document.querySelector('meta[name="cf-ts-key"]')?.content || "";
  if (!siteKey || !window.turnstile) return;
  if (_tsWidgetId !== null) {
    try { window.turnstile.reset(_tsWidgetId); } catch {}
  }
  _tsToken = "";
  _tsWidgetId = window.turnstile.render(el, {
    sitekey: siteKey,
    callback: (t) => { _tsToken = t; },
    "expired-callback": () => { _tsToken = ""; },
    "error-callback": () => { _tsToken = ""; },
    theme: "dark",
    size: "compact",
  });
}

export function getTsToken() { return _tsToken; }

export function waitForTurnstile(fn) {
  if (window.turnstile) { fn(); return; }
  const start = Date.now();
  const id = setInterval(() => {
    if (window.turnstile) { clearInterval(id); fn(); }
    else if (Date.now() - start > 8000) { clearInterval(id); }
  }, 150);
}
