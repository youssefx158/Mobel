import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const DEFAULT_PORT = 10955;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── تحميل .env يدوياً بدون أي مكتبة خارجية ──
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      // تجاهل التعليقات والأسطر الفارغة
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key   = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // لا تستبدل القيم الموجودة مسبقاً في البيئة
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env غير موجود — عادي في بيئات الإنتاج التي تضع المتغيرات مباشرة
  }
}

loadEnvFile();

function resolveAppRoot() {
  const raw = process.env.APP_ROOT;
  if (!raw) return __dirname;
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
}

const APP_ROOT = resolveAppRoot();

function resolveInt(envName, fallback, min, max) {
  const raw = process.env[envName];
  const value = Number(raw || fallback);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function resolveBool(envName, fallback = false) {
  const raw = process.env[envName];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function resolvePort() {
  const raw = process.env.PORT;
  const port = Number(raw || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return DEFAULT_PORT;
  return port;
}

function resolveAdminPassword() {
  const pwd = process.env.MD_ADMIN_PASSWORD;
  if (!pwd) {
    console.error("FATAL: MD_ADMIN_PASSWORD environment variable is not set.");
    process.exit(1);
  }
  return pwd;
}

function resolveSessionSecret() {
  const s = process.env.MD_SESSION_SECRET;
  if (!s || s.length < 32) {
    console.error("FATAL: MD_SESSION_SECRET must be set and at least 32 characters.");
    process.exit(1);
  }
  return s;
}

function resolveAdminSecret() {
  const s = process.env.MD_ADMIN_SECRET;
  if (!s || s.length < 16) {
    console.error("FATAL: MD_ADMIN_SECRET must be set and at least 16 characters.");
    process.exit(1);
  }
  return s;
}

function resolvePathFromEnv(envName, fallbackParts) {
  const raw = process.env[envName];
  if (!raw) return path.join(APP_ROOT, ...fallbackParts);
  return path.isAbsolute(raw) ? raw : path.resolve(APP_ROOT, raw);
}

export const config = {
  baseUrl: process.env.BASE_URL || "https://mdstore.website",
  port: resolvePort(),
  adminPassword: resolveAdminPassword(),
  sessionSecret: resolveSessionSecret(),
  adminSecret: resolveAdminSecret(),
  turnstileSecretKey: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "",
  turnstileSiteKey: process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || "",
  lockoutMaxAttempts: 5,
  lockoutMinutes: 15,
  sessionMaxAgeHours: resolveInt("MD_SESSION_MAX_AGE_HOURS", 12, 1, 168),
  forceSecureCookies: resolveBool("FORCE_SECURE_COOKIES", false),
  forceHttps: resolveBool("FORCE_HTTPS", false),
  trustProxy: resolveBool("TRUST_PROXY", true),
  paths: {
    appRoot: APP_ROOT,
    publicDir: resolvePathFromEnv("PUBLIC_DIR", ["public"]),
    dataDir: resolvePathFromEnv("DATA_DIR", ["data"]),
    uploadsDir: resolvePathFromEnv("UPLOADS_DIR", ["public", "uploads"]),
  },
};
