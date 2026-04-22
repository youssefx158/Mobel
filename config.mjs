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
  sessionMaxAgeHours: 24,
  lockoutMaxAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleMinutes: 60,
  geminiApiKey: String(process.env.GEMINI_API_KEY || "").trim(),
  geminiModel: String(process.env.GEMINI_MODEL || "gemini-2.5-flash-image").trim(),
  // Edit this fixed prompt text when you want to change the generated design direction.
  geminiDesignPrompt: String(
    process.env.GEMINI_DESIGN_PROMPT ||
      "Create a professional, high-end product photography mockup showcasing TWO premium black hoodies designed from scratch and displayed together in a stunning studio environment. This is a photorealistic, 4K quality image that should look like a luxury brand's professional product showcase.\n\n*BACKGROUND AND LIGHTING SETUP:*\nAnalyze the provided reference images and select an appropriate background color that best complements the character aesthetic and design theme. The background should feature a sophisticated gradient with two complementary tones, creating a premium atmosphere that matches the character's signature colors or personality. Implement professional three-point lighting with dynamic colored lights that match the selected background theme and illuminate the hoodies to perfectly showcase the fabric texture and design details. Create soft, elongated shadows beneath the hoodies that give depth and dimension, making them appear suspended and floating gracefully in mid-air within a professional studio space. The overall lighting should be sophisticated and emphasize every detail of the garments.\n\n*FIRST HOODIE (LEFT SIDE) - BACK VIEW WITH LARGE DESIGN:*\nDesign a premium black hoodie from scratch shown from the BACK. Print the SECOND provided reference image large and prominently on the entire back. The design occupies 60-70% of the hoodie's back area in a striking and professional manner. The printed artwork is crisp, vibrant, and displays exactly as shown in the reference image. The design is positioned centrally on the back, displayed prominently and clearly so the full image is visible in its entirety. The hoodie should be positioned and angled to perfectly showcase the back view with this large design. The hoodie fabric should be premium quality black material with realistic texture and stitching details visible.\n\n*SECOND HOODIE (RIGHT SIDE) - FRONT VIEW WITH LOGO DESIGN:*\nDesign a premium black hoodie from scratch shown from the FRONT. Print the FIRST provided reference image on the upper right section of the chest area as a smaller, logo-like element. The design is proportionally smaller (approximately 20-25% of the chest area) and serves as an elegant branding element. It's strategically placed on the upper right portion of the chest in a professional and eye-catching manner. The printed image is rendered with perfect clarity and detail exactly as shown in the reference. The hoodie should be positioned and angled to display the front view with this chest logo clearly. The hoodie fabric should be premium quality black material with realistic texture and stitching details visible.\n\n*OVERALL COMPOSITION AND TECHNICAL SPECIFICATIONS:*\nBoth hoodies are created with premium black fabric with realistic texture. They appear to be floating and suspended in the air with a PROFESSIONAL DYNAMIC ANGLE - the first hoodie (left) tilted slightly backward showing the back design, the second hoodie (right) tilted slightly forward showing the front design. Each hoodie displays a natural, professional standing posture with BOTH HANDS POSITIONED IN THE FRONT POCKETS, creating a clean and polished look. The composition shows both hoodies standing side by side with professional angled positioning that creates visual interest and depth, while maintaining elegance. The balance between the two pieces is perfect and aesthetically pleasing with dynamic but sophisticated positioning. The image quality is ULTRA 4K (8K minimum resolution) with exceptional detail and clarity. Use professional product photography styling comparable to luxury fashion brands. Every detail is crisp, sharp, and crystal clear: fabric texture, stitching, print quality, shadows, highlights, depth, and color accuracy. Render with maximum detail level, ultra-high resolution, and studio-grade photography quality.\n\n*COLOR PALETTE AND DESIGN QUALITY:*\nThe hoodies are rendered in rich, deep black premium fabric. The printed designs feature vibrant colors exactly as shown in the reference images. The printing quality appears flawless and professional, as if done by the highest-end print facilities. The designs are clear and striking even from distance, maintaining full visibility and impact.\n\n*LIGHTING AND ATMOSPHERE:*\nSoft, professional lighting creates gentle highlights on the fabric edges giving a sense of movement and dynamism. The shadows are carefully crafted to appear natural and professional. The background color should be intelligently selected to match and enhance the character theme from the reference images, creating a cohesive and sophisticated aesthetic while maintaining a premium feel. Subtle atmospheric elements enhance the floating effect. The overall lighting scheme makes the hoodies appear three-dimensional, luxurious, and desirable.\n\n*FINAL OUTPUT:*\nDeliver a single, professional, ULTRA HIGH-QUALITY image (8K resolution minimum) that showcases both hoodies in their full glory with maximum detail and clarity. The image should be so visually striking, sharp, and professionally executed with exceptional clarity that viewers immediately want to purchase these hoodies. The design, composition, lighting, and execution should all scream premium quality, attention to detail, and professional studio-grade photography. Use maximum rendering quality, highest detail level, and crystal-clear image output."
  ).trim(),
  paths: {
    appRoot: APP_ROOT,
    publicDir: resolvePathFromEnv("PUBLIC_DIR", ["public"]),
    dataDir: resolvePathFromEnv("DATA_DIR", ["data"]),
    uploadsDir: resolvePathFromEnv("UPLOADS_DIR", ["public", "uploads"]),
  },
};
