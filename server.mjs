import http from "node:http";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { config } from "./config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = fileUrlToFsPath(config.paths.publicDir);
const storagePaths = await resolveRuntimeStoragePaths();
const DATA_DIR = storagePaths.dataDir;
const UPLOADS_DIR = storagePaths.uploadsDir;

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const DISCOUNT_CODES_FILE = path.join(DATA_DIR, "discount-codes.json");
const CUSTOM_DESIGNS_FILE = path.join(DATA_DIR, "custom-designs.json");
const MAX_IMAGE_BYTES = 2_000_000;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const jsonWriteQueues = new Map();

// ── Signed Token (بيشتغل بدون قاعدة بيانات، وبيصمد بعد restart) ──
const SESSION_KEY = Buffer.from(config.sessionSecret, "utf8");
const SESSION_MAX_MS = config.sessionMaxAgeHours * 60 * 60 * 1000;
const DEVICE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function createSignedToken() {
  const payload = JSON.stringify({ iat: Date.now() });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_KEY).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifySignedToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto.createHmac("sha256", SESSION_KEY).update(b64).digest("base64url");
  if (sig.length !== expectedSig.length) return null;
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (Date.now() - payload.iat > SESSION_MAX_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function createDeviceToken() {
  const payload = JSON.stringify({
    did: crypto.randomBytes(16).toString("base64url"),
    iat: Date.now(),
  });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_KEY).update(`device:${b64}`).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyDeviceToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto.createHmac("sha256", SESSION_KEY).update(`device:${b64}`).digest("base64url");
  if (sig.length !== expectedSig.length) return null;
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload?.did || typeof payload.did !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
const lockouts = new Map(); // ip -> { attempts, lockUntilMs }

await ensureDirs();
await ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", getRequestOrigin(req));
    const method = (req.method || "GET").toUpperCase();

    if (config.forceHttps && shouldRedirectToHttps(req)) {
      return sendRedirect(res, `https://${url.host}${url.pathname}${url.search}`);
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url, method);
      return;
    }

    if (url.pathname === "/md-control-panel" || url.pathname === "/md-control-panel/") {
      await serveFile(res, path.join(PUBLIC_DIR, "admin.html"));
      return;
    }

    if (url.pathname.startsWith("/uploads/")) {
      const rel = url.pathname.replace(/^\/uploads\//, "");
      const abs = safeJoin(UPLOADS_DIR, rel);
      if (!abs) return sendText(res, 400, "Bad request");
      await serveFile(res, abs);
      return;
    }

    const staticPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const abs = safeJoin(PUBLIC_DIR, staticPath);
    if (!abs) return sendText(res, 400, "Bad request");
    await serveFile(res, abs);
  } catch (err) {
    console.error("Request failed:", err);
    sendText(res, 500, "Server error");
  }
});

server.listen(config.port, "0.0.0.0", () => {
  const urls = getServerUrls(config.port);
  console.log(`MD Store: ${urls.store}`);
  console.log(`Admin:    ${urls.admin}`);
  if (urls.networkStore) {
    console.log(`Network:  ${urls.networkStore}`);
    console.log(`Admin LAN:${urls.networkAdmin}`);
  }
  console.log(`App root: ${config.paths.appRoot}`);
  console.log(`Public:   ${PUBLIC_DIR}`);
  console.log(`Data:     ${DATA_DIR}`);
  console.log(`Uploads:  ${UPLOADS_DIR}`);
});

async function handleApi(req, res, url, method) {
  try {
    if (method === "OPTIONS") return sendJson(res, 204, {});

    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });

  // Auth
  if (url.pathname === "/api/admin/login" && method === "POST") {
    const ip = getClientIp(req);
    const lock = lockouts.get(ip);
    if (lock && lock.lockUntilMs > Date.now()) {
      return sendJson(res, 423, { ok: false, message: "الصفحة غير متاحة" });
    }

    const body = await readJsonBody(req, 64_000);
    const password = String(body?.password || "");

    if (password !== config.adminPassword) {
      const next = lock || { attempts: 0, lockUntilMs: 0 };
      next.attempts += 1;
      if (next.attempts >= config.lockoutMaxAttempts) {
        next.lockUntilMs = Date.now() + config.lockoutMinutes * 60_000;
      }
      lockouts.set(ip, next);
      return sendJson(res, 401, { ok: false, message: "الصفحة غير متاحة" });
    }

    lockouts.delete(ip);
    const token = createSignedToken();
    setCookie(res, "mdsid", token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      secure: shouldUseSecureCookie(req),
      maxAge: config.sessionMaxAgeHours * 60 * 60,
    });
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === "/api/admin/logout" && method === "POST") {
    setCookie(res, "mdsid", "", {
      path: "/",
      maxAge: 0,
      secure: shouldUseSecureCookie(req),
    });
    return sendJson(res, 200, { ok: true });
  }

  // Products (public)
  if (url.pathname === "/api/products" && method === "GET") {
    const products = await readProducts();
    const published = products.filter((p) => p.visibility === "published");
    return sendJson(res, 200, { ok: true, products: published });
  }

  if (url.pathname === "/api/discount-codes/preview" && method === "POST") {
    const body = await readJsonBody(req, 256_000);
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    const code = normalizeDiscountCode(body?.code);
    const browserId = normalizeBrowserId(body?.browserId);

    if (!Array.isArray(cart) || cart.length === 0) {
      return sendJson(res, 400, { ok: false, message: "السلة فارغة" });
    }
    if (!code) {
      return sendJson(res, 400, { ok: false, message: "اكتب كود الخصم أولاً" });
    }

    const identity = ensureVisitorIdentity(req, res, browserId);
    const pricing = await calculateOrderPricing(cart, {
      discountCode: code,
      identity,
      req,
      consumeDiscount: false,
    });

    if (pricing.productsNotFound.length) {
      return sendJson(res, 400, {
        ok: false,
        message: "بعض المنتجات غير متاحة الآن",
        productsNotFound: pricing.productsNotFound,
      });
    }
    if (!pricing.discount.ok) {
      return sendJson(res, 400, { ok: false, message: pricing.discount.message });
    }

    return sendJson(res, 200, {
      ok: true,
      preview: {
        code: pricing.discount.code,
        discountPercent: pricing.discount.discountPercent,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        total: pricing.total,
        remainingUses: pricing.discount.remainingUses,
        maxUses: pricing.discount.maxUses,
      },
    });
  }

  // Orders (public)
  if (url.pathname === "/api/orders" && method === "POST") {
    const body = await readJsonBody(req, 256_000);
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    const customer = body?.customer || {};
    const discountCode = normalizeDiscountCode(body?.discountCode);
    const browserId = normalizeBrowserId(body?.browserId);
    const validation = validateOrderInput(cart, customer);
    if (!validation.ok) return sendJson(res, 400, validation);

    const identity = ensureVisitorIdentity(req, res, browserId);
    const { order, productsNotFound, updatedDiscountCodes } = await createOrderWithDiscount(cart, customer, {
      discountCode,
      identity,
      req,
    });
    if (productsNotFound.length) {
      return sendJson(res, 400, {
        ok: false,
        message: "منتجات غير موجودة أو تغيرت",
        productsNotFound,
      });
    }

    const orders = await readOrders();
    orders.unshift(order);
    if (updatedDiscountCodes) {
      await writeJson(DISCOUNT_CODES_FILE, updatedDiscountCodes);
    }

    try {
      await writeJson(ORDERS_FILE, orders);
    } catch (err) {
      if (updatedDiscountCodes && order?.discount?.code) {
        await rollbackDiscountUsage(order.discount.code, order.id);
      }
      throw err;
    }
    return sendJson(res, 201, { ok: true, orderId: order.id });
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9\-]+)$/);
  if (orderMatch && method === "GET") {
    const orderId = orderMatch[1];
    const orders = await readOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return sendJson(res, 404, { ok: false, message: "رقم الطلب غير موجود" });
    return sendJson(res, 200, {
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        history: order.history,
        createdAt: order.createdAt,
      },
    });
  }

  // ===== FEEDBACK (public - submit) =====
  if (url.pathname === "/api/feedback" && method === "POST") {
    const body = await readJsonBody(req, 8_000);
    const type = String(body?.type || "").trim(); // "complaint" | "suggestion"
    const message = String(body?.message || "").trim();
    const orderId = String(body?.orderId || "").trim();

    if (!["complaint", "suggestion"].includes(type)) {
      return sendJson(res, 400, { ok: false, message: "نوع غير صحيح" });
    }
    if (!message || message.length < 5) {
      return sendJson(res, 400, { ok: false, message: "الرسالة قصيرة جداً" });
    }
    if (message.length > 2000) {
      return sendJson(res, 400, { ok: false, message: "الرسالة طويلة جداً" });
    }

    const feedbackList = await readFeedback();
    const id = `F-${crypto.randomBytes(6).toString("base64url")}`;
    const entry = {
      id,
      type,
      message,
      orderId: orderId || null,
      createdAt: new Date().toISOString(),
      status: "new", // new | read | resolved
    };
    feedbackList.unshift(entry);
    await writeJson(FEEDBACK_FILE, feedbackList);
    return sendJson(res, 201, { ok: true, feedbackId: id });
  }

  if (url.pathname === "/api/custom-designs" && method === "POST") {
    const body = await readJsonBody(req, 18_000_000);
    const phone = normalizePhoneNumber(body?.phone);
    const contactDetails = String(body?.contactDetails || "").trim();
    const referenceImages = Array.isArray(body?.images)
      ? body.images.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(body?.referenceImages)
      ? body.referenceImages.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    if (!/^01[0125]\d{8}$/.test(phone)) {
      return sendJson(res, 400, { ok: false, message: "يرجى إدخال رقم موبايل صحيح" });
    }
    if (!contactDetails || contactDetails.length < 6) {
      return sendJson(res, 400, { ok: false, message: "اكتب تفاصيل كافية للتواصل وتأكيد الطلب" });
    }
    if (referenceImages.length !== 2) {
      return sendJson(res, 400, { ok: false, message: "ارفع الصورتين أولاً" });
    }

    const customDesigns = await readCustomDesigns();
    const id = `CD-${crypto.randomBytes(6).toString("base64url").toUpperCase()}`;
    const savedReferenceImages = [];
    for (let i = 0; i < referenceImages.length; i++) {
      const src = referenceImages[i];
      if (!src.startsWith("data:")) {
        return sendJson(res, 400, { ok: false, message: "صيغة الصور غير صحيحة" });
      }
      const saved = await saveDataUrl(src, `${id}-ref-${i + 1}`);
      if (saved) savedReferenceImages.push(saved);
    }

    const entry = {
      id,
      phone,
      contactDetails,
      generatedImage: null,
      generatedText: null,
      referenceImages: savedReferenceImages,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    customDesigns.unshift(entry);
    await writeJson(CUSTOM_DESIGNS_FILE, customDesigns);
    return sendJson(res, 201, { ok: true, designId: id });
  }

  // Admin protected routes
  if (url.pathname.startsWith("/api/admin/")) {
    const auth = requireAdminSession(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, message: "غير مصرح" });
  }

  if (url.pathname === "/api/admin/discount-codes" && method === "GET") {
    const codes = await readDiscountCodes();
    return sendJson(res, 200, {
      ok: true,
      codes: codes.map(formatDiscountCodeForAdmin),
    });
  }

  if (url.pathname === "/api/admin/discount-codes" && method === "POST") {
    const body = await readJsonBody(req, 64_000);
    const now = new Date().toISOString();
    const codes = await readDiscountCodes();
    const payload = normalizeDiscountCodeInput(body, codes);
    if (!payload.ok) return sendJson(res, 400, payload);

    const entry = {
      id: `DC-${crypto.randomBytes(6).toString("base64url")}`,
      code: payload.code,
      discountPercent: payload.discountPercent,
      maxUses: payload.maxUses,
      usageRecords: [],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      isActive: true,
    };
    codes.unshift(entry);
    await writeJson(DISCOUNT_CODES_FILE, codes);
    return sendJson(res, 201, { ok: true, code: formatDiscountCodeForAdmin(entry) });
  }

  const adminDiscountMatch = url.pathname.match(/^\/api\/admin\/discount-codes\/(DC-[A-Za-z0-9\-_]+)$/);
  if (adminDiscountMatch && method === "PUT") {
    const body = await readJsonBody(req, 64_000);
    const id = adminDiscountMatch[1];
    const codes = await readDiscountCodes();
    const idx = codes.findIndex((entry) => entry.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "كود الخصم غير موجود" });

    const payload = normalizeDiscountCodeInput(body, codes, id);
    if (!payload.ok) return sendJson(res, 400, payload);

    codes[idx] = {
      ...codes[idx],
      code: payload.code,
      discountPercent: payload.discountPercent,
      maxUses: payload.maxUses,
      isActive: body?.isActive == null ? codes[idx].isActive !== false : Boolean(body.isActive),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(DISCOUNT_CODES_FILE, codes);
    return sendJson(res, 200, { ok: true, code: formatDiscountCodeForAdmin(codes[idx]) });
  }

  if (adminDiscountMatch && method === "DELETE") {
    const id = adminDiscountMatch[1];
    const codes = await readDiscountCodes();
    const next = codes.filter((entry) => entry.id !== id);
    if (next.length === codes.length) {
      return sendJson(res, 404, { ok: false, message: "كود الخصم غير موجود" });
    }
    await writeJson(DISCOUNT_CODES_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  const adminDiscountResetMatch = url.pathname.match(/^\/api\/admin\/discount-codes\/(DC-[A-Za-z0-9\-_]+)\/reset$/);
  if (adminDiscountResetMatch && method === "POST") {
    const id = adminDiscountResetMatch[1];
    const codes = await readDiscountCodes();
    const idx = codes.findIndex((entry) => entry.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "كود الخصم غير موجود" });

    codes[idx] = {
      ...codes[idx],
      usageRecords: [],
      lastUsedAt: null,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(DISCOUNT_CODES_FILE, codes);
    return sendJson(res, 200, { ok: true, code: formatDiscountCodeForAdmin(codes[idx]) });
  }

  // Admin products
  if (url.pathname === "/api/admin/products" && method === "GET") {
    const products = await readProducts();
    return sendJson(res, 200, { ok: true, products });
  }
  if (url.pathname === "/api/admin/products" && method === "POST") {
    const body = await readJsonBody(req, 2_500_000);
    const products = await readProducts();
    const now = new Date().toISOString();
    const productId = `P-${crypto.randomBytes(6).toString("base64url")}`;
    const product = await normalizeProductInput(productId, body, now);
    products.unshift(product);
    await writeJson(PRODUCTS_FILE, products);
    return sendJson(res, 201, { ok: true, product });
  }
  const prodMatch = url.pathname.match(/^\/api\/admin\/products\/(P-[A-Za-z0-9\-_]+)$/);
  if (prodMatch && method === "PUT") {
    const id = prodMatch[1];
    const body = await readJsonBody(req, 2_500_000);
    const products = await readProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    const now = new Date().toISOString();
    const updated = await normalizeProductInput(id, body, now, products[idx]);
    products[idx] = updated;
    await writeJson(PRODUCTS_FILE, products);
    return sendJson(res, 200, { ok: true, product: updated });
  }
  if (prodMatch && method === "DELETE") {
    const id = prodMatch[1];
    const products = await readProducts();
    const next = products.filter((p) => p.id !== id);
    if (next.length === products.length) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    await writeJson(PRODUCTS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  // Admin orders
  if (url.pathname === "/api/admin/orders" && method === "GET") {
    const orders = await readOrders();
    return sendJson(res, 200, { ok: true, orders });
  }
  const adminOrderMatch = url.pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9\-]+)$/);
  if (adminOrderMatch && method === "GET") {
    const id = adminOrderMatch[1];
    const orders = await readOrders();
    const order = orders.find((o) => o.id === id);
    if (!order) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    return sendJson(res, 200, { ok: true, order });
  }
  if (adminOrderMatch && method === "DELETE") {
    const id = adminOrderMatch[1];
    const orders = await readOrders();
    const next = orders.filter((o) => o.id !== id);
    if (next.length === orders.length) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    await writeJson(ORDERS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }
  const statusMatch = url.pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9\-]+)\/status$/);
  if (statusMatch && method === "PUT") {
    const id = statusMatch[1];
    const body = await readJsonBody(req, 64_000);
    const newStatus = String(body?.status || "").trim();
    const note = String(body?.note || "").trim();
    const VALID = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
    if (!VALID.includes(newStatus)) {
      return sendJson(res, 400, { ok: false, message: "حالة غير صحيحة" });
    }
    const orders = await readOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    orders[idx].status = newStatus;
    orders[idx].history = orders[idx].history || [];
    orders[idx].history.unshift({
      status: newStatus,
      note: note || null,
      at: new Date().toISOString(),
    });
    await writeJson(ORDERS_FILE, orders);
    return sendJson(res, 200, { ok: true, order: orders[idx] });
  }

  // Admin stats
  if (url.pathname === "/api/admin/stats" && method === "GET") {
    const [products, orders, feedbackList, customDesigns] = await Promise.all([
      readProducts(),
      readOrders(),
      readFeedback(),
      readCustomDesigns(),
    ]);
    const totalRevenue = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((s, o) => s + (Number(o.total) || 0), 0);
    const stats = {
      totalProducts: products.length,
      publishedProducts: products.filter((p) => p.visibility === "published").length,
      totalOrders: orders.length,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
      deliveredOrders: orders.filter((o) => o.status === "delivered").length,
      cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
      totalRevenue,
      totalFeedback: feedbackList.length,
      newFeedback: feedbackList.filter((f) => f.status === "new").length,
      complaints: feedbackList.filter((f) => f.type === "complaint").length,
      suggestions: feedbackList.filter((f) => f.type === "suggestion").length,
      totalCustomDesigns: customDesigns.length,
      newCustomDesigns: customDesigns.filter((entry) => entry.status === "new").length,
      confirmedCustomDesigns: customDesigns.filter((entry) => entry.status === "confirmed").length,
    };
    return sendJson(res, 200, { ok: true, stats });
  }

  // ===== Admin Feedback =====
  if (url.pathname === "/api/admin/feedback" && method === "GET") {
    const feedbackList = await readFeedback();
    return sendJson(res, 200, { ok: true, feedback: feedbackList });
  }

  const feedbackStatusMatch = url.pathname.match(/^\/api\/admin\/feedback\/(F-[A-Za-z0-9\-_]+)\/status$/);
  if (feedbackStatusMatch && method === "PUT") {
    const id = feedbackStatusMatch[1];
    const body = await readJsonBody(req, 1_000);
    const newStatus = String(body?.status || "").trim();
    const VALID = ["new", "read", "resolved"];
    if (!VALID.includes(newStatus)) {
      return sendJson(res, 400, { ok: false, message: "حالة غير صحيحة" });
    }
    const feedbackList = await readFeedback();
    const idx = feedbackList.findIndex((f) => f.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    feedbackList[idx].status = newStatus;
    await writeJson(FEEDBACK_FILE, feedbackList);
    return sendJson(res, 200, { ok: true, feedback: feedbackList[idx] });
  }

  const feedbackDeleteMatch = url.pathname.match(/^\/api\/admin\/feedback\/(F-[A-Za-z0-9\-_]+)$/);
  if (feedbackDeleteMatch && method === "DELETE") {
    const id = feedbackDeleteMatch[1];
    const feedbackList = await readFeedback();
    const next = feedbackList.filter((f) => f.id !== id);
    if (next.length === feedbackList.length) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    await writeJson(FEEDBACK_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  // ===== Admin Custom Designs =====
  if (url.pathname === "/api/admin/custom-designs" && method === "GET") {
    const customDesigns = await readCustomDesigns();
    return sendJson(res, 200, { ok: true, customDesigns });
  }

  const customDesignStatusMatch = url.pathname.match(/^\/api\/admin\/custom-designs\/(CD-[A-Za-z0-9\-_]+)\/status$/);
  if (customDesignStatusMatch && method === "PUT") {
    const id = customDesignStatusMatch[1];
    const body = await readJsonBody(req, 8_000);
    const status = String(body?.status || "").trim();
    const validStatuses = ["new", "contacted", "confirmed"];
    if (!validStatuses.includes(status)) {
      return sendJson(res, 400, { ok: false, message: "حالة غير صحيحة" });
    }

    const customDesigns = await readCustomDesigns();
    const idx = customDesigns.findIndex((entry) => entry.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, message: "غير موجود" });

    customDesigns[idx] = {
      ...customDesigns[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(CUSTOM_DESIGNS_FILE, customDesigns);
    return sendJson(res, 200, { ok: true, customDesign: customDesigns[idx] });
  }

  const customDesignDeleteMatch = url.pathname.match(/^\/api\/admin\/custom-designs\/(CD-[A-Za-z0-9\-_]+)$/);
  if (customDesignDeleteMatch && method === "DELETE") {
    const id = customDesignDeleteMatch[1];
    const customDesigns = await readCustomDesigns();
    const next = customDesigns.filter((entry) => entry.id !== id);
    if (next.length === customDesigns.length) return sendJson(res, 404, { ok: false, message: "غير موجود" });
    await writeJson(CUSTOM_DESIGNS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

    return sendJson(res, 404, { ok: false, message: "Not found" });
  } catch (err) {
    console.error(`API error on ${method} ${url.pathname}:`, err);
    const status = Number(err?.statusCode) || (err?.publicMessage ? 400 : 500);
    return sendJson(res, status, {
      ok: false,
      message: getPublicErrorMessage(err),
    });
  }
}

// ==================== DATA HELPERS ====================

async function readJson(file, fallback = []) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  const previous = jsonWriteQueues.get(file) || Promise.resolve();
  const current = previous.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = file + "." + process.pid + ".tmp";
    const json = JSON.stringify(data, null, 2);
    try {
      await fs.writeFile(tmp, json, "utf8");
      await fs.rename(tmp, file);
    } catch (err) {
      // Some hosting filesystems reject atomic rename/replace; fall back to direct write.
      try {
        await fs.writeFile(file, json, "utf8");
      } finally {
        await fs.unlink(tmp).catch(() => {});
      }
      if (!await fileExists(file)) {
        throw createStorageError(file, err);
      }
    }
  });
  const queued = current.catch(() => {});
  jsonWriteQueues.set(file, queued);
  try {
    return await current;
  } finally {
    if (jsonWriteQueues.get(file) === queued) jsonWriteQueues.delete(file);
  }
}

async function readProducts() {
  return readJson(PRODUCTS_FILE, []);
}

async function readOrders() {
  return readJson(ORDERS_FILE, []);
}

async function readFeedback() {
  return readJson(FEEDBACK_FILE, []);
}

async function readCustomDesigns() {
  return readJson(CUSTOM_DESIGNS_FILE, []);
}

async function createOrder(cart, customer) {
  const products = await readProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  const productsNotFound = [];

  for (const line of cart) {
    const p = byId.get(line.productId);
    if (!p || p.visibility !== "published") {
      productsNotFound.push(line.productId);
      continue;
    }
    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const unit = Number(p.salePrice) || Number(p.basePrice) || 0;
    items.push({
      productId: p.id,
      name: p.name,
      size: String(line.size || ""),
      qty,
      unit,
      subtotal: unit * qty,
    });
  }

  if (productsNotFound.length) return { order: null, productsNotFound };

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const id = `ORD-${crypto.randomBytes(5).toString("base64url").toUpperCase()}`;
  const now = new Date().toISOString();
  const order = {
    id,
    status: "pending",
    customer,
    items,
    total,
    createdAt: now,
    history: [{ status: "pending", note: "تم إنشاء الطلب", at: now }],
  };
  return { order, productsNotFound: [] };
}

async function readDiscountCodes() {
  return readJson(DISCOUNT_CODES_FILE, []);
}

async function createOrderWithDiscount(cart, customer, options = {}) {
  const pricing = await calculateOrderPricing(cart, {
    discountCode: options.discountCode,
    identity: options.identity,
    req: options.req,
    consumeDiscount: true,
  });

  if (pricing.productsNotFound.length) {
    return { order: null, productsNotFound: pricing.productsNotFound, updatedDiscountCodes: null };
  }
  if (!pricing.discount.ok) {
    const err = new Error(pricing.discount.message);
    err.publicMessage = pricing.discount.message;
    err.statusCode = 400;
    throw err;
  }

  const id = `ORD-${crypto.randomBytes(5).toString("base64url").toUpperCase()}`;
  const now = new Date().toISOString();
  const order = {
    id,
    status: "pending",
    customer,
    items: pricing.items,
    subtotal: pricing.subtotal,
    discountAmount: pricing.discountAmount,
    total: pricing.total,
    discount: pricing.discount.applied
      ? {
          id: pricing.discount.id,
          code: pricing.discount.code,
          discountPercent: pricing.discount.discountPercent,
          amount: pricing.discountAmount,
        }
      : null,
    createdAt: now,
    history: [{ status: "pending", note: "تم إنشاء الطلب", at: now }],
  };

  if (pricing.updatedDiscountCodes && pricing.discount.id) {
    const codeIdx = pricing.updatedDiscountCodes.findIndex((entry) => entry.id === pricing.discount.id);
    if (codeIdx >= 0) {
      pricing.updatedDiscountCodes[codeIdx] = {
        ...pricing.updatedDiscountCodes[codeIdx],
        lastUsedAt: now,
        updatedAt: now,
        usageRecords: [
          ...(pricing.updatedDiscountCodes[codeIdx].usageRecords || []),
          {
            orderId: id,
            usedAt: now,
            combinedKey: pricing.discount.identityKeys.combinedKey,
            deviceKey: pricing.discount.identityKeys.deviceKey,
            browserKey: pricing.discount.identityKeys.browserKey,
            ipKey: pricing.discount.identityKeys.ipKey,
          },
        ],
      };
    }
  }

  return {
    order,
    productsNotFound: [],
    updatedDiscountCodes: pricing.updatedDiscountCodes,
  };
}

async function calculateOrderPricing(cart, options = {}) {
  const products = await readProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  const productsNotFound = [];

  for (const line of cart) {
    const p = byId.get(line.productId);
    if (!p || p.visibility !== "published") {
      productsNotFound.push(line.productId);
      continue;
    }
    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const unit = Number(p.salePrice) || Number(p.basePrice) || 0;
    items.push({
      productId: p.id,
      name: p.name,
      size: String(line.size || ""),
      qty,
      unit,
      subtotal: unit * qty,
    });
  }

  if (productsNotFound.length) {
    return {
      items: [],
      subtotal: 0,
      discountAmount: 0,
      total: 0,
      discount: { ok: true, applied: false, code: null },
      productsNotFound,
      updatedDiscountCodes: null,
    };
  }

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const discount = await resolveDiscountApplication({
    code: options.discountCode,
    subtotal,
    identity: options.identity,
    req: options.req,
    consumeDiscount: options.consumeDiscount,
  });

  if (!discount.ok) {
    return {
      items,
      subtotal,
      discountAmount: 0,
      total: subtotal,
      discount,
      productsNotFound: [],
      updatedDiscountCodes: null,
    };
  }

  const discountAmount = discount.applied
    ? Math.min(subtotal, Math.round((subtotal * discount.discountPercent) / 100))
    : 0;

  return {
    items,
    subtotal,
    discountAmount,
    total: Math.max(0, subtotal - discountAmount),
    discount,
    productsNotFound: [],
    updatedDiscountCodes: discount.updatedDiscountCodes || null,
  };
}

async function resolveDiscountApplication({ code, subtotal, identity, req, consumeDiscount }) {
  if (!code) {
    return {
      ok: true,
      applied: false,
      code: null,
      discountPercent: 0,
      updatedDiscountCodes: null,
    };
  }

  if (!identity?.deviceKey) {
    return { ok: false, message: "تعذر التحقق من المتصفح الحالي" };
  }
  if (subtotal <= 0) {
    return { ok: false, message: "إجمالي الطلب غير صالح لتطبيق الخصم" };
  }

  const codes = await readDiscountCodes();
  const idx = codes.findIndex((entry) => entry.code === code);
  if (idx < 0) {
    return { ok: false, message: "كود الخصم غير صحيح" };
  }

  const entry = codes[idx];
  const usageRecords = Array.isArray(entry.usageRecords) ? entry.usageRecords : [];
  const usedCount = usageRecords.length;

  if (entry.isActive === false) {
    return { ok: false, message: "كود الخصم متوقف حالياً" };
  }
  if (usedCount >= entry.maxUses) {
    return { ok: false, message: "كود الخصم انتهى" };
  }

  const alreadyUsed = usageRecords.some((record) => {
    if (identity.combinedKey && record.combinedKey === identity.combinedKey) return true;
    if (record.deviceKey === identity.deviceKey) return true;
    if (identity.browserKey && record.browserKey === identity.browserKey) return true;
    if (identity.ipKey && record.ipKey && record.ipKey === identity.ipKey) return true;
    return false;
  });
  if (alreadyUsed) {
    return { ok: false, message: "تم استخدام هذا الكود مسبقاً" };
  }

  const updatedDiscountCodes = consumeDiscount ? codes.map((item, itemIdx) => {
    if (itemIdx !== idx) return item;
    return {
      ...item,
      updatedAt: new Date().toISOString(),
    };
  }) : null;

  return {
    ok: true,
    applied: true,
    id: entry.id,
    code: entry.code,
    discountPercent: Number(entry.discountPercent) || 0,
    maxUses: Number(entry.maxUses) || 0,
    remainingUses: Math.max(0, (Number(entry.maxUses) || 0) - usedCount - (consumeDiscount ? 1 : 0)),
    identityKeys: {
      combinedKey: identity.combinedKey,
      deviceKey: identity.deviceKey,
      browserKey: identity.browserKey,
      ipKey: identity.ipKey,
    },
    updatedDiscountCodes,
  };
}

function formatDiscountCodeForAdmin(entry) {
  const usageRecords = Array.isArray(entry?.usageRecords) ? entry.usageRecords : [];
  const usedCount = usageRecords.length;
  const maxUses = Math.max(1, Number(entry?.maxUses) || 1);
  return {
    id: entry.id,
    code: entry.code,
    discountPercent: Number(entry.discountPercent) || 0,
    maxUses,
    usedCount,
    remainingUses: Math.max(0, maxUses - usedCount),
    isActive: entry.isActive !== false,
    exhausted: usedCount >= maxUses,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    lastUsedAt: entry.lastUsedAt || null,
  };
}

function normalizeDiscountCodeInput(body, existingCodes, currentId = null) {
  const code = normalizeDiscountCode(body?.code);
  const discountPercent = Math.floor(Number(body?.discountPercent) || 0);
  const maxUses = Math.floor(Number(body?.maxUses) || 0);

  if (!code) return { ok: false, message: "اكتب كود الخصم" };
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    return { ok: false, message: "الكود يجب أن يكون من 3 إلى 40 حرفاً أو رقماً فقط" };
  }
  if (discountPercent < 1 || discountPercent > 100) {
    return { ok: false, message: "نسبة الخصم يجب أن تكون بين 1% و 100%" };
  }
  if (maxUses < 1 || maxUses > 100000) {
    return { ok: false, message: "عدد الاستخدامات يجب أن يكون أكبر من 0" };
  }

  const duplicate = existingCodes.find((entry) => entry.code === code && entry.id !== currentId);
  if (duplicate) return { ok: false, message: "كود الخصم موجود بالفعل" };

  return {
    ok: true,
    code,
    discountPercent,
    maxUses,
  };
}

function normalizeDiscountCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeBrowserId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.slice(0, 200);
}

function ensureVisitorIdentity(req, res, browserId = "") {
  const cookieName = "mdvid";
  const existing = verifyDeviceToken(getCookie(req, cookieName));
  const payload = existing || verifyDeviceToken(createAndSetVisitorCookie(req, res, cookieName));
  const normalizedBrowserId = normalizeBrowserId(browserId);
  const deviceId = payload?.did || "";
  const clientIp = getClientIp(req);

  return {
    browserId: normalizedBrowserId,
    deviceId,
    clientIp,
    browserKey: normalizedBrowserId ? sha256(`browser:${normalizedBrowserId}`) : null,
    deviceKey: deviceId ? sha256(`device:${deviceId}`) : null,
    combinedKey: deviceId && normalizedBrowserId ? sha256(`combo:${deviceId}:${normalizedBrowserId}`) : null,
    ipKey: clientIp && clientIp !== "unknown" ? sha256(`ip:${clientIp}`) : null,
  };
}

function createAndSetVisitorCookie(req, res, cookieName) {
  const token = createDeviceToken();
  setCookie(res, cookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: shouldUseSecureCookie(req),
    maxAge: DEVICE_TOKEN_MAX_AGE_SECONDS,
  });
  return token;
}

async function rollbackDiscountUsage(code, orderId) {
  const codes = await readDiscountCodes();
  const idx = codes.findIndex((entry) => entry.code === code);
  if (idx < 0) return;

  codes[idx] = {
    ...codes[idx],
    usageRecords: (codes[idx].usageRecords || []).filter((record) => record.orderId !== orderId),
    updatedAt: new Date().toISOString(),
  };
  codes[idx].lastUsedAt = codes[idx].usageRecords.at(-1)?.usedAt || null;
  await writeJson(DISCOUNT_CODES_FILE, codes);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function normalizeProductInput(id, body, now, existing = null) {
  const name = String(body?.name || "").trim();
  const description = String(body?.description || "").trim();
  const visibility = ["published", "draft", "hidden"].includes(body?.visibility)
    ? body.visibility
    : (existing?.visibility ?? "draft");
  const basePrice = Math.max(0, Number(body?.basePrice) || 0);
  const salePrice = body?.salePrice != null ? Math.max(0, Number(body.salePrice) || 0) : null;

  let cardImage = existing?.cardImage ?? null;
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "cardImage")) {
    if (!body.cardImage) {
      cardImage = null;
    } else if (body.cardImage !== existing?.cardImage) {
      cardImage = await saveDataUrl(body.cardImage, id + "-card");
    }
  }

  const detailImages = [];
  const rawDetails = Array.isArray(body?.detailImages) ? body.detailImages : (existing?.detailImages ?? []);
  for (let i = 0; i < rawDetails.length; i++) {
    const src = rawDetails[i];
    if (!src) continue;
    if (src.startsWith("data:")) {
      detailImages.push(await saveDataUrl(src, `${id}-d${i}`));
    } else {
      detailImages.push(src);
    }
  }

  const sizes = Array.isArray(body?.sizes)
    ? body.sizes.map((s) => ({
        label: String(s.label || "").trim(),
        stock: Math.max(0, Number(s.stock) || 0),
      }))
    : (existing?.sizes ?? []);

  return {
    id,
    name,
    description,
    visibility,
    basePrice,
    salePrice,
    cardImage,
    detailImages,
    sizes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function saveDataUrl(dataUrl, name) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("Invalid image data");
  const ext = getImageExtension(parsed.mimeType);
  if (!ext) throw new Error("Unsupported image type");
  const buf = Buffer.from(parsed.base64, "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  const filename = `${name}-${Date.now()}.${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(dest, buf);
  return `/uploads/${filename}`;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function getImageExtension(mimeType) {
  return ALLOWED_IMAGE_TYPES.get(String(mimeType || "").toLowerCase()) || null;
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

// ==================== VALIDATION ====================

function validateOrderInput(cart, customer) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { ok: false, message: "السلة فارغة" };
  }
  if (!customer.name || String(customer.name).trim().split(/\s+/).filter(Boolean).length < 2) {
    return { ok: false, message: "يرجى إدخال الاسم الثلاثي" };
  }
  const phone = String(customer.phone || "").replace(/\D/g, "");
  if (!/^01[0125]\d{8}$/.test(phone)) {
    return { ok: false, message: "رقم الهاتف غير صحيح" };
  }
  if (!customer.governorate) {
    return { ok: false, message: "يرجى اختيار المحافظة" };
  }
  const phone2 = String(customer.phone2 || "").replace(/\D/g, "");
  if (phone2 && !/^01[0125]\d{8}$/.test(phone2)) {
    return { ok: false, message: "Invalid secondary phone number" };
  }
  if (!String(customer.area || "").trim()) {
    return { ok: false, message: "Area is required" };
  }
  if (!String(customer.building || "").trim()) {
    return { ok: false, message: "Building is required" };
  }
  if (!String(customer.address || "").trim()) {
    return { ok: false, message: "يرجى إدخال العنوان التفصيلي" };
  }
  return { ok: true };
}

// ==================== AUTH ====================

function requireAdminSession(req) {
  const token = getCookie(req, "mdsid");
  const payload = verifySignedToken(token);
  if (!payload) return { ok: false, status: 401 };
  return { ok: true };
}

// ==================== HTTP UTILS ====================

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { ...securityHeaders(), "content-type": "text/plain" });
  res.end(text);
}

function sendRedirect(res, location) {
  res.writeHead(308, {
    ...securityHeaders(),
    location,
    "content-length": 0,
  });
  res.end();
}

async function serveFile(res, abs) {
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
  }[ext] || "application/octet-stream";

  res.writeHead(200, {
    ...securityHeaders(),
    "content-type": mime,
    "content-length": stat.size,
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000",
  });
  const stream = (await import("node:fs")).createReadStream(abs);
  stream.pipe(res);
}

async function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let buf = "";
    let total = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      buf += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(buf || "null"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function getCookie(req, name) {
  const header = req.headers["cookie"] || "";
  for (const part of header.split(";")) {
    const [k, ...vs] = part.trim().split("=");
    if (k.trim() === name) return decodeURIComponent(vs.join("="));
  }
  return null;
}

function setCookie(res, name, value, opts = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.httpOnly) cookie += "; HttpOnly";
  if (opts.secure) cookie += "; Secure";
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
  res.setHeader("set-cookie", cookie);
}

function getRequestOrigin(req) {
  const protocol = getRequestProtocol(req);
  const host =
    String(req.headers["x-forwarded-host"] || "").split(",")[0].trim() ||
    req.headers.host ||
    "localhost";
  return `${protocol}://${host}`;
}

function getRequestProtocol(req) {
  if (config.trustProxy) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (forwardedProto === "https" || forwardedProto === "http") return forwardedProto;

    const cfVisitor = String(req.headers["cf-visitor"] || "");
    if (cfVisitor.includes('"scheme":"https"')) return "https";
    if (cfVisitor.includes('"scheme":"http"')) return "http";
  }

  return req.socket?.encrypted ? "https" : "http";
}

function isSecureRequest(req) {
  return getRequestProtocol(req) === "https";
}

function shouldRedirectToHttps(req) {
  // يعمل redirect فقط لو البروكسي صرّح إن الطلب جاي HTTP
  // ده بيمنع redirect loop لما نوصل مباشرة بـ IP بدون SSL
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwardedProto === "http";
}

function shouldUseSecureCookie(req) {
  return config.forceSecureCookies || isSecureRequest(req);
}

function getClientIp(req) {
  if (config.trustProxy) {
    const cfIp = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cfIp) return cfIp;
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "unknown";
}

function safeJoin(base, rel) {
  const root = path.resolve(base);
  const joined = path.resolve(root, "." + path.sep + rel);
  if (joined !== root && !joined.startsWith(root + path.sep)) return null;
  return joined;
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function fileUrlToFsPath(urlOrString) {
  const s = String(urlOrString);
  if (s.startsWith("file://")) return fileURLToPath(s);
  return s;
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function ensureDataFiles() {
  await ensureJsonFile(PRODUCTS_FILE, []);
  await ensureJsonFile(ORDERS_FILE, []);
  await ensureJsonFile(FEEDBACK_FILE, []);
  await ensureJsonFile(DISCOUNT_CODES_FILE, []);
  await ensureJsonFile(CUSTOM_DESIGNS_FILE, []);
}

async function ensureJsonFile(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, fallback);
  }
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function getServerUrls(port) {
  const networkHost = detectNetworkHost();
  const localBase = `http://localhost:${port}`;
  const networkBase = networkHost ? `http://${networkHost}:${port}` : null;
  const publicBase = config.baseUrl || localBase;
  return {
    store: `${publicBase}/`,
    admin: `${publicBase}/md-control-panel`,
    networkStore: networkBase ? `${networkBase}/` : null,
    networkAdmin: networkBase ? `${networkBase}/md-control-panel` : null,
  };
}

function detectNetworkHost() {
  const nets = os.networkInterfaces();
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return null;
}

async function resolveRuntimeStoragePaths() {
  const dataCandidates = uniquePaths([
    fileUrlToFsPath(config.paths.dataDir),
    path.join(fileUrlToFsPath(config.paths.appRoot), "data"),
    path.join(process.cwd(), "data"),
    path.join(os.tmpdir(), "md-store-data", "data"),
  ]);

  const dataDir = await pickWritableDir(dataCandidates, "data");

  const uploadCandidates = uniquePaths([
    fileUrlToFsPath(config.paths.uploadsDir),
    path.join(dataDir, "uploads"),
    path.join(fileUrlToFsPath(config.paths.appRoot), "public", "uploads"),
    path.join(process.cwd(), "public", "uploads"),
    path.join(os.tmpdir(), "md-store-data", "uploads"),
  ]);

  const uploadsDir = await pickWritableDir(uploadCandidates, "uploads");

  return { dataDir, uploadsDir };
}

async function pickWritableDir(candidates, label) {
  let lastError = null;

  for (const dir of candidates) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const testFile = path.join(dir, `.write-test-${process.pid}-${Date.now()}.tmp`);
      await fs.writeFile(testFile, "ok", "utf8");
      await fs.unlink(testFile);
      return dir;
    } catch (err) {
      lastError = err;
      console.warn(`Storage candidate rejected for ${label}: ${dir}`, err?.message || err);
    }
  }

  throw new Error(
    `No writable ${label} directory found. Last error: ${lastError?.message || "unknown error"}`
  );
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function createStorageError(file, cause) {
  const err = new Error(`Storage write failed for ${file}: ${cause?.message || "unknown error"}`);
  err.code = "STORAGE_WRITE_FAILED";
  err.file = file;
  err.cause = cause;
  return err;
}

function getPublicErrorMessage(err) {
  if (err?.publicMessage) return err.publicMessage;
  if (err?.code === "STORAGE_WRITE_FAILED") {
    return `تعذر حفظ البيانات داخل ${err.file}. تأكد أن مجلد data ومساره على الاستضافة قابلان للكتابة.`;
  }
  return "حدث خطأ داخلي في السيرفر أثناء تنفيذ الطلب";
}
