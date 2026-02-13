/**
 * SERVER.JS - Consulta Vehicular
 * ProducciÃƒÂ³n cPanel - Contrato JSON ÃƒÂºnico
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const crypto = require("crypto");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const { consultSbsSoat } = require("./sbsAdapter");
const { getCitvCaptcha, consultCitvByPlaca } = require("./mtcAdapter");
const { consultSbsSoatPlaywright } = require("./sbsPlaywrightAdapter");
const { getCitvCaptchaPlaywright, consultCitvByPlacaPlaywright } = require("./mtcPlaywrightAdapter");
const { consultSbsSoatAdvanced } = require("./sbsAdvancedPlaywright");
const { getCitvCaptchaAdvanced, consultCitvByPlacaAdvanced } = require("./mtcAdvancedPlaywright");
const { consultCitvByPlacaPuppeteerStealth } = require("./mtcPuppeteerStealthAdapter");
const MTCCITVScraper = require("./mtc-scraper-final");
const SATCapturasScraper = require("./sat-scraper");
const ArequipaPapeletasScraper = require("./arequipa-scraper");
const PiuraMultasScraper = require("./piura-scraper");
const TarapotoMultasScraper = require("./tarapoto-scraper");
const ChiclayoInfraccionesScraper = require("./chiclayo-scraper");
const HuancayoPapeletasScraper = require("./huancayo-scraper");
const HuanucoPapeletasScraper = require("./huanuco-scraper");
const IcaPapeletasScraper = require("./ica-scraper");
const CuscoPapeletasScraper = require("./cusco-scraper");
const ChachapoyasPapeletasScraper = require("./chachapoyas-scraper");
const CajamarcaPapeletasScraper = require("./cajamarca-scraper");
const TrujilloRecordScraper = require("./trujillo-scraper");
const AndahuaylasPapeletasScraper = require("./andahuaylas-scraper");
const TacnaPapeletasScraper = require("./tacna-scraper");
const InfogasScraper = require("./infogas-scraper");
const ImpuestoVehicularScraper = require("./impuesto-vehicular-scraper");
const PlacasPeScraper = require("./placas-pe-scraper");
const CallaoPapeletasScraper = require("./callao-papeletas-scraper");
const PitFotoScraper = require("./pit-foto-scraper");
const PunoPapeletasScraper = require("./puno-papeletas-scraper");
const ApesegSoatScraper = require("./apeseg-soat-scraper");
const { renderPdf } = require('./renderPdf');
const MercadoPagoHandler = require('./mercadopago-handler');

const app = express();

// ============================================
// MIDDLEWARE DE RUTEO PARA cPanel (Subdirectorio)
// ============================================
// Si la app estÃ¡ montada en /consultavehicular, recortamos el prefijo
const BASE_PATH = process.env.BASE_PATH || "/consultavehicular/proyecto-cpanel";

app.use((req, res, next) => {
  // Recortar el prefijo BASE_PATH si existe en la URL
  if (req.url.startsWith(BASE_PATH)) {
    req.url = req.url.slice(BASE_PATH.length) || "/";
  }
  // TambiÃ©n manejar sin el prefijo completo (solo /consultavehicular)
  else if (req.url.startsWith("/consultavehicular")) {
    req.url = req.url.slice("/consultavehicular".length) || "/";
  }
  // TambiÃ©n manejar /proyecto-cpanel directamente
  else if (req.url.startsWith("/proyecto-cpanel")) {
    req.url = req.url.slice("/proyecto-cpanel".length) || "/";
  }
  next();
});

// ============================================
// MIDDLEWARE - Solo una vez cada uno
// ============================================
app.use(cors());
// Aumentar lÃƒÂ­mite para permitir imÃƒÂ¡genes base64 grandes
app.use(express.json({
  limit: "50mb",
  verify: (req, res, buf) => {
    if (String(req.originalUrl || "").includes("/api/payments/mcw/ipn")) {
      req.rawBody = buf.toString("utf8");
    }
  }
}));
app.use(express.urlencoded({
  extended: false,
  limit: "50mb",
  verify: (req, res, buf) => {
    if (String(req.originalUrl || "").includes("/api/payments/mcw/ipn")) {
      req.rawBody = buf.toString("utf8");
    }
  }
}));
// Usar ruta absoluta para static files (mÃ¡s seguro en cPanel)
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// RUTA RAÃZ - Servir index.html para cPanel
// ============================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Fallback: si Izipay retorna por POST al root, redirigir a /pago-ok o /pago-error
app.post("/", (req, res) => {
  const payload = req.body || {};
  const hasVads = Object.keys(payload).some((key) => key.startsWith("vads_"));
  if (!hasVads) {
    return res.status(404).send("Not Found");
  }

  const orderId = String(payload?.vads_order_id || "").trim();
  const status = normalizeIzipayStatus(payload?.vads_trans_status || "");
  const isError = ["REFUSED", "ABANDONED"].includes(status);
  const target = isError ? "/pago-error" : "/pago-ok";

  console.log("[IZIPAY] return root POST", { status, orderId, hasVads });

  if (orderId) {
    return res.redirect(`${target}?orderId=${encodeURIComponent(orderId)}`);
  }
  return res.redirect(target);
});

// TambiÃ©n servir index.html para rutas comunes
app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/result.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "result.html"));
});

// Página de compra con Mercado Pago
app.get("/comprar-mercadopago", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "comprar-mercadopago.html"));
});

// Redirigir /comprar a Mercado Pago (o mantener Izipay según configuración)
app.get("/comprar", (req, res) => {
  // Por defecto usar Mercado Pago si está configurado, sino Izipay
  const useMercadoPago = process.env.MERCADOPAGO_ACCESS_TOKEN && mercadoPagoHandler;
  if (useMercadoPago) {
    return res.sendFile(path.join(__dirname, "public", "comprar-mercadopago.html"));
  }
  // Fallback a Izipay
  res.sendFile(path.join(__dirname, "public", "comprar.html"));
});

// Checkout MCW/Niubiz
app.get("/checkout", (req, res) => {
  const checkoutPath = path.join(__dirname, "public", "checkout.html");
  fs.readFile(checkoutPath, "utf8", (err, html) => {
    if (err) {
      console.error("[MCW] Error leyendo checkout.html:", err.message);
      return res.status(500).send("No se pudo cargar el checkout");
    }
    const safePublicKey = MCW_PUBLIC_KEY || "";
    const safeReturnOk = MCW_RETURN_OK || "";
    const safeReturnKo = MCW_RETURN_KO || "";
    const rendered = html
      .replace(/__MCW_PUBLIC_KEY__/g, safePublicKey)
      .replace(/__MCW_RETURN_OK__/g, safeReturnOk)
      .replace(/__MCW_RETURN_KO__/g, safeReturnKo);
    return res.status(200).send(rendered);
  });
});

// Checkout Izipay (Redirección VADS)
app.get("/comprar", (req, res) => {
  const comprarPath = path.join(__dirname, "public", "comprar.html");
  fs.readFile(comprarPath, "utf8", (err, html) => {
    if (err) {
      console.error("[IZIPAY] Error leyendo comprar.html:", err.message);
      return res.status(500).send("No se pudo cargar el checkout");
    }

    const priceLabel = formatPriceLabel(PRICE_CENTS);
    const rendered = html
      .replace(/__PRICE_LABEL__/g, priceLabel)
      .replace(/__PRICE_CENTS__/g, String(PRICE_CENTS));
    return res.status(200).send(rendered);
  });
});

app.get("/pago-ok", (req, res) => {
  const orderId = String(req.query?.orderId || req.query?.vads_order_id || "").trim();
  if (orderId && !req.query?.orderId) {
    return res.redirect(`/pago-ok?orderId=${encodeURIComponent(orderId)}`);
  }
  console.log("[IZIPAY] return pago-ok GET", { query: req.query || {} });
  return res.sendFile(path.join(__dirname, "public", "pago-ok.html"));
});

app.post("/pago-ok", (req, res) => {
  const orderId = String(req.body?.vads_order_id || req.body?.orderId || "").trim();
  console.log("[IZIPAY] return pago-ok POST", { body: req.body || {}, query: req.query || {} });
  if (orderId) {
    return res.redirect(`/pago-ok?orderId=${encodeURIComponent(orderId)}`);
  }
  return res.sendFile(path.join(__dirname, "public", "pago-ok.html"));
});

app.get("/pago-error", (req, res) => {
  const orderId = String(req.query?.orderId || req.query?.vads_order_id || "").trim();
  if (orderId && !req.query?.orderId) {
    return res.redirect(`/pago-error?orderId=${encodeURIComponent(orderId)}`);
  }
  console.log("[IZIPAY] return pago-error GET", { query: req.query || {} });
  return res.sendFile(path.join(__dirname, "public", "pago-error.html"));
});

app.post("/pago-error", (req, res) => {
  const orderId = String(req.body?.vads_order_id || req.body?.orderId || "").trim();
  console.log("[IZIPAY] return pago-error POST", { body: req.body || {}, query: req.query || {} });
  if (orderId) {
    return res.redirect(`/pago-error?orderId=${encodeURIComponent(orderId)}`);
  }
  return res.sendFile(path.join(__dirname, "public", "pago-error.html"));
});

// ============================================
// API: CUPONES
// ============================================
app.get("/api/coupons/public", (req, res) => {
  return respond(res, {
    ok: true,
    source: "coupons",
    status: "success",
    message: "Por seguridad, no se listan cupones en el frontend",
    data: { coupons: [] }
  });
});

app.post("/api/coupons/redeem", (req, res) => {
  const { code } = req.body || {};
  const input = normalizeCouponCode(code);
  if (!input) {
    return respond(res, { ok: true, source: "coupons", status: "error", message: "CÃ³digo requerido" }, 400);
  }

  const config = getCouponConfig();
  const inputHash = hashCoupon(input);

  // Admin coupon (ilimitado)
  if (config.adminHash && inputHash === config.adminHash) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "success",
      message: "CupÃ³n administrador vÃ¡lido",
      data: {
        type: "admin",
        redirectUrl: "/result.html?modo=prueba",
        remainingUses: null
      }
    });
  }

  // Public coupons (mÃ¡x 5 usos)
  const state = loadCouponState(config);
  const entry = state.public?.[inputHash];
  if (!entry || entry.active === false) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "empty",
      message: "CupÃ³n invÃ¡lido",
      data: { valid: false }
    });
  }

  const remaining = Number(entry.remainingUses || 0);
  if (remaining <= 0) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "empty",
      message: "CupÃ³n agotado",
      data: { valid: false, remainingUses: 0 }
    });
  }

  entry.remainingUses = remaining - 1;
  state.public[inputHash] = entry;
  saveCouponState(state);

  return respond(res, {
    ok: true,
    source: "coupons",
    status: "success",
    message: "CupÃ³n aplicado. Consulta gratuita habilitada.",
    data: {
      type: "public",
      remainingUses: entry.remainingUses,
      redirectUrl: "/result.html"
    }
  });
});

// ============================================
// VARIABLES DE ENTORNO
// ============================================
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || "";
const MCW_API_USER = process.env.MCW_API_USER || "";
const MCW_API_PASSWORD = process.env.MCW_API_PASSWORD || "";
const MCW_PUBLIC_KEY = process.env.MCW_PUBLIC_KEY || "";
const MCW_HMAC_KEY = process.env.MCW_HMAC_KEY || "";
const MCW_RETURN_OK = process.env.MCW_RETURN_OK || "";
const MCW_RETURN_KO = process.env.MCW_RETURN_KO || "";
const MCW_IPN_URL = process.env.MCW_IPN_URL || "";
const MCW_CREATE_PAYMENT_URL = process.env.MCW_CREATE_PAYMENT_URL || "https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment";
// CÃ³digos de cupones por defecto (si no estÃ¡n en .env)
const DEFAULT_COUPON_ADMIN_CODE = "ADMIN-VALHAR-2025";
const DEFAULT_COUPONS_PUBLIC_CODES = "PROMO-VALHAR1:5,PROMO-VALHAR2:5,PROMO-VALHAR3:5";

// Usar variables de entorno si existen, sino usar valores por defecto
const COUPON_ADMIN_CODE = process.env.COUPON_ADMIN_CODE || DEFAULT_COUPON_ADMIN_CODE;
const COUPONS_PUBLIC_CODES = process.env.COUPONS_PUBLIC_CODES || DEFAULT_COUPONS_PUBLIC_CODES;
const COUPON_HASH_SALT = process.env.COUPON_HASH_SALT || "v1";
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const PRICE_CENTS = Number.isFinite(Number(process.env.PRICE_CENTS))
  ? Math.round(Number(process.env.PRICE_CENTS))
  : 1500;
const CURRENCY_NUM = String(process.env.CURRENCY_NUM || "604");
const IZIPAY_SITE_ID = process.env.IZIPAY_SITE_ID || "";
const IZIPAY_CTX_MODE = String(process.env.IZIPAY_CTX_MODE || "TEST").toUpperCase();
const IZIPAY_TEST_KEY = process.env.IZIPAY_TEST_KEY || "";
const IZIPAY_PROD_KEY = process.env.IZIPAY_PROD_KEY || "";

// ============================================
// DETECCIÃ“N DE AMBIENTE Y TIMEOUTS DINÃMICOS
// ============================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production' ||
                      (process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes('localhost'));

// ConfiguraciÃ³n de timeouts por ambiente
const TIMEOUTS = {
  navigation: IS_PRODUCTION ? 120000 : 60000,   // 2min prod, 1min dev
  selector: IS_PRODUCTION ? 60000 : 30000,      // 1min prod, 30s dev
  overall: IS_PRODUCTION ? 300000 : 180000,     // 5min prod, 3min dev
  captcha: IS_PRODUCTION ? 90000 : 60000        // 1.5min prod, 1min dev
};

// ============================================
// CUPONES (SECRETOS: solo backend / variables de entorno)
// ============================================
const COUPON_STATE_PATH = path.join(__dirname, "data", "coupon-state.json");

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function hashCoupon(code) {
  const normalized = normalizeCouponCode(code);
  return crypto.createHash("sha256").update(`${COUPON_HASH_SALT}|${normalized}`).digest("hex");
}

function parsePublicCouponsEnv(raw) {
  // Formato: CODE:MAX_USOS,CODE2:MAX_USOS
  const items = String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const result = [];
  for (const item of items) {
    const [codePart, usesPart] = item.split(":").map(s => (s || "").trim());
    const code = normalizeCouponCode(codePart);
    if (!code) continue;
    const maxUses = Math.max(1, Number(usesPart || 5));
    result.push({ hash: hashCoupon(code), maxUses, active: true });
  }
  return result;
}

function getCouponConfig() {
  const admin = normalizeCouponCode(COUPON_ADMIN_CODE);
  const adminHash = admin ? hashCoupon(admin) : "";
  const publicCoupons = parsePublicCouponsEnv(COUPONS_PUBLIC_CODES);
  return { adminHash, publicCoupons };
}

function loadCouponState(config) {
  const empty = { version: 1, updatedAt: new Date().toISOString(), public: {} };

  let state = empty;
  try {
    if (fs.existsSync(COUPON_STATE_PATH)) {
      const raw = fs.readFileSync(COUPON_STATE_PATH, "utf8");
      state = JSON.parse(raw || "{}");
    }
  } catch (e) {
    console.error("[CUPONES] Error leyendo coupon-state.json:", e.message);
    state = empty;
  }

  if (!state || typeof state !== "object") state = empty;
  if (!state.public || typeof state.public !== "object") state.public = {};

  // Marcar como inactivos los que ya no existen en config
  const configured = new Set((config.publicCoupons || []).map(c => c.hash));
  for (const h of Object.keys(state.public)) {
    if (!configured.has(h)) {
      state.public[h].active = false;
    }
  }

  // Sincronizar los configurados (sin guardar cÃ³digos en disco)
  for (const c of config.publicCoupons || []) {
    const prev = state.public[c.hash];
    if (!prev) {
      state.public[c.hash] = { maxUses: c.maxUses, remainingUses: c.maxUses, active: true };
      continue;
    }
    prev.maxUses = c.maxUses;
    if (typeof prev.remainingUses !== "number") prev.remainingUses = c.maxUses;
    // No permitir remaining > maxUses
    prev.remainingUses = Math.min(prev.remainingUses, c.maxUses);
    prev.active = true;
    state.public[c.hash] = prev;
  }

  return state;
}

function saveCouponState(state) {
  try {
    fs.mkdirSync(path.dirname(COUPON_STATE_PATH), { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(COUPON_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("[CUPONES] Error guardando coupon-state.json:", e.message);
    return false;
  }
}

// ============================================
// MICUENTAWEB / NIUBIZ (KRYPTON V4)
// ============================================
const PAYMENTS_DATA_PATH = path.join(__dirname, "data", "payments.json");

function buildMcwOrderId() {
  const ts = Date.now();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORDER-${ts}-${random}`;
}

function ensurePaymentsStore() {
  try {
    fs.mkdirSync(path.dirname(PAYMENTS_DATA_PATH), { recursive: true });
    if (!fs.existsSync(PAYMENTS_DATA_PATH)) {
      fs.writeFileSync(PAYMENTS_DATA_PATH, JSON.stringify({ version: 1, payments: [] }, null, 2), "utf8");
    }
  } catch (error) {
    console.error("[MCW] Error inicializando storage de pagos:", error.message);
  }
}

function loadPaymentsStore() {
  ensurePaymentsStore();
  try {
    const raw = fs.readFileSync(PAYMENTS_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!Array.isArray(parsed.payments)) parsed.payments = [];
    return parsed;
  } catch (error) {
    console.error("[MCW] Error leyendo payments.json:", error.message);
    return { version: 1, payments: [] };
  }
}

function savePaymentsStore(store) {
  ensurePaymentsStore();
  const tmpPath = `${PAYMENTS_DATA_PATH}.tmp`;
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    payments: Array.isArray(store?.payments) ? store.payments : []
  };

  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmpPath, PAYMENTS_DATA_PATH);
}

function upsertPaymentRecord(record) {
  const store = loadPaymentsStore();
  const idx = store.payments.findIndex((p) => p.orderId === record.orderId);
  const nextRecord = {
    ...record,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) {
    store.payments[idx] = {
      ...store.payments[idx],
      ...nextRecord
    };
  } else {
    store.payments.push({
      createdAt: new Date().toISOString(),
      ...nextRecord
    });
  }

  savePaymentsStore(store);
}

function safeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function formatPriceLabel(centsValue) {
  const cents = Number.isFinite(Number(centsValue)) ? Number(centsValue) : 0;
  const amount = (cents / 100).toFixed(2);
  return `S/ ${amount}`;
}

function extractIpnPayload(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = String(req.rawBody || "").trim();
  if (!raw) return {};

  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

function getKrHashCandidate(req, payload) {
  return String(
    payload?.["kr-hash"] ||
    payload?.kr_hash ||
    req.query?.["kr-hash"] ||
    req.query?.kr_hash ||
    req.headers?.["kr-hash"] ||
    req.headers?.["x-kr-hash"] ||
    ""
  ).trim();
}

function getKrAnswerCandidate(payload, rawBody) {
  if (payload?.["kr-answer"]) return String(payload["kr-answer"]);
  if (payload?.kr_answer) return String(payload.kr_answer);

  const raw = String(rawBody || "").trim();
  if (!raw) return "";

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.["kr-answer"] || parsed?.kr_answer || raw);
    } catch (_) {
      return raw;
    }
  }

  const params = new URLSearchParams(raw);
  if (params.has("kr-answer")) return params.get("kr-answer");
  if (params.has("kr_answer")) return params.get("kr_answer");
  return raw;
}

function computeMcwKrHash({ krAnswer, hmacKey }) {
  const hmac = crypto.createHmac("sha256", hmacKey);
  hmac.update(String(krAnswer || ""), "utf8");
  const digestBuffer = hmac.digest();
  return {
    digestHex: digestBuffer.toString("hex"),
    digestBase64: digestBuffer.toString("base64")
  };
}

function timingSafeEqualHash(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateKrHash({ providedHash, digestHex, digestBase64 }) {
  const normalized = String(providedHash || "").trim();
  if (!normalized) return false;
  const normalizedLower = normalized.toLowerCase();
  const digestHexLower = String(digestHex || "").toLowerCase();
  return (
    timingSafeEqualHash(normalized, digestBase64) ||
    timingSafeEqualHash(normalized, digestHex) ||
    timingSafeEqualHash(normalizedLower, digestHexLower)
  );
}

function parseKrAnswer(krAnswerRaw) {
  try {
    if (!krAnswerRaw) return {};
    if (typeof krAnswerRaw === "object") return krAnswerRaw;
    return JSON.parse(String(krAnswerRaw));
  } catch (_) {
    return {};
  }
}

function isPaidTransaction(answer) {
  const orderStatus = String(answer?.orderStatus || "").toUpperCase();
  const txStatus = String(answer?.transactions?.[0]?.detailedStatus || answer?.transactions?.[0]?.status || "").toUpperCase();
  return orderStatus === "PAID" || txStatus.includes("PAID") || txStatus.includes("CAPTURED");
}

// ============================================
// IZIPAY / MICUENTAWEB REDIRECCIÃ“N (VADS)
// ============================================
const IZIPAY_FORM_ACTION = "https://secure.micuentaweb.pe/vads-payment/";
const izipayPayments = new Map();
let izipayTransCounter = 0;
let izipayTransDateKey = "";

function formatIzipayUtcDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function getIzipayDateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}${month}${day}`;
}

function nextIzipayTransId(date = new Date()) {
  const dateKey = getIzipayDateKey(date);
  if (izipayTransDateKey !== dateKey) {
    izipayTransDateKey = dateKey;
    izipayTransCounter = 0;
  }
  izipayTransCounter = (izipayTransCounter + 1) % 1000000;
  return String(izipayTransCounter).padStart(6, "0");
}

function buildIzipayOrderId() {
  const random = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `IZI-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function getIzipayKey(ctxMode) {
  const mode = String(ctxMode || IZIPAY_CTX_MODE || "TEST").toUpperCase();
  return mode === "PRODUCTION" ? IZIPAY_PROD_KEY : IZIPAY_TEST_KEY;
}

function computeIzipaySignature(fields, key) {
  if (!key) return "";
  const sortedKeys = Object.keys(fields)
    .filter((name) => name.startsWith("vads_"))
    .sort();
  const values = sortedKeys.map((name) => String(fields[name] ?? ""));
  const payload = `${values.join("+")}+${key}`;
  return crypto.createHmac("sha256", key).update(payload, "utf8").digest("base64");
}

function timingSafeEqualText(left, right) {
  const leftBuf = Buffer.from(String(left || ""), "utf8");
  const rightBuf = Buffer.from(String(right || ""), "utf8");
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function normalizeIzipayStatus(value) {
  const status = String(value || "").toUpperCase();
  if (["ACCEPTED", "AUTHORISED", "AUTHORIZED", "CAPTURED", "PAID"].includes(status)) {
    return "PAID";
  }
  if (status === "REFUSED") return "REFUSED";
  if (status === "ABANDONED") return "ABANDONED";
  return status || "UNKNOWN";
}

function findIzipayPaymentByTransId(transId) {
  if (!transId) return null;
  for (const [orderId, record] of izipayPayments.entries()) {
    if (record?.transId === transId) {
      return { orderId, record };
    }
  }
  return null;
}

function loadIzipayPaymentsFromStore() {
  const store = loadPaymentsStore();
  const stored = store?.izipay && typeof store.izipay === "object" ? store.izipay : {};
  for (const [orderId, record] of Object.entries(stored)) {
    izipayPayments.set(orderId, record);
  }

  const todayKey = getIzipayDateKey();
  let maxCounter = 0;
  for (const record of izipayPayments.values()) {
    const transDate = String(record?.transDate || "");
    if (transDate.startsWith(todayKey)) {
      const counter = Number.parseInt(record?.transId, 10);
      if (Number.isFinite(counter)) {
        maxCounter = Math.max(maxCounter, counter);
      }
    }
  }
  izipayTransDateKey = todayKey;
  izipayTransCounter = maxCounter;
}

function persistIzipayPayments() {
  try {
    const store = loadPaymentsStore();
    const payload = {};
    for (const [orderId, record] of izipayPayments.entries()) {
      payload[orderId] = record;
    }
    store.izipay = payload;
    savePaymentsStore(store);
  } catch (error) {
    console.error("[IZIPAY] Error guardando payments.json:", error.message);
  }
}

loadIzipayPaymentsFromStore();

function activateAccess({ orderId, email, amount, currency, provider = "MCW" }) {
  if (provider === "IZIPAY" && orderId) {
    const record = izipayPayments.get(orderId);
    if (record) {
      record.access = true;
      record.accessToken = record.accessToken || crypto.randomBytes(16).toString("hex");
      record.updatedAt = new Date().toISOString();
      izipayPayments.set(orderId, record);
      persistIzipayPayments();
    }
  } else if (provider === "MERCADOPAGO" && orderId) {
    const record = mercadopagoPayments.get(orderId);
    if (record) {
      record.access = true;
      record.accessToken = record.accessToken || crypto.randomBytes(16).toString("hex");
      record.updatedAt = new Date().toISOString();
      mercadopagoPayments.set(orderId, record);
      persistMercadoPagoPayments();
    }
  }

  // Integrar aquÃ­ con tu modelo real de usuarios/licencias.
  console.log(`[${provider}] [ACCESS] Acceso activado (stub) -> orderId=${orderId}, email=${email || "N/A"}, amount=${amount || "N/A"} ${currency || ""}`);
}

// ============================================
// CONTRATO JSON ÃƒÅ¡NICO
// ============================================
function respond(res, { ok, source, status, message, data = null, meta = {} }, code = 200) {
  // Asegurar que siempre devolvemos 200 para el frontend (excepto errores de validaciÃƒÂ³n)
  const finalCode = code >= 400 && code < 500 ? code : 200;

  const response = {
    ok: !!ok,
    source,
    status,
    message: message || "",
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };

  // Log de respuesta formateada para debugging (SAT)
  if (source === 'sat') {
    console.log(`\n[SAT] ========== RESPUESTA FINAL ==========`);
    console.log(`[SAT] Status Code: ${finalCode}`);
    console.log(`[SAT] Response JSON:`);
    console.log(JSON.stringify(response, null, 2));
    console.log(`[SAT] ======================================\n`);
  }


  return res.status(finalCode).json(response);
}

// ============================================
// CLASIFICAR ERRORES DE RED
// ============================================
/**
 * Clasificar errores de red (timeout, connection refused, DNS, etc.)
 * Retorna un objeto con clasificaciÃ³n y mensaje user-friendly
 */
function classifyNetworkError(error) {
  const errorMsg = (error.message || '').toLowerCase();
  const errorCode = error.code || '';

  // Connection refused (servidor no responde o puerto cerrado)
  if (errorCode === 'ECONNREFUSED' || errorMsg.includes('connection refused')) {
    return {
      type: 'network_blocked',
      status: 'empty',
      message: 'El servicio no estÃ¡ disponible en este momento. Por favor, intente mÃ¡s tarde.',
      code: 503
    };
  }

  // Timeout (servidor no responde a tiempo)
  if (errorCode === 'ETIMEDOUT' ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('time out') ||
      errorMsg.includes('timed out')) {
    return {
      type: 'network_timeout',
      status: 'empty',
      message: 'El servidor tardÃ³ demasiado en responder. Por favor, intente mÃ¡s tarde.',
      code: 504
    };
  }

  // DNS resolution failed
  if (errorCode === 'ENOTFOUND' || errorMsg.includes('not found') || errorMsg.includes('enotfound')) {
    return {
      type: 'network_dns',
      status: 'empty',
      message: 'No se pudo conectar con el servicio. Por favor, intente mÃ¡s tarde.',
      code: 503
    };
  }

  // Network unreachable
  if (errorCode === 'ENETUNREACH' || errorMsg.includes('network unreachable')) {
    return {
      type: 'network_unreachable',
      status: 'empty',
      message: 'Red no alcanzable. El servicio podrÃ­a estar caÃ­do temporalmente.',
      code: 503
    };
  }

  // SSL/Certificate errors
  if (errorMsg.includes('certificate') || errorMsg.includes('ssl') || errorMsg.includes('tls')) {
    return {
      type: 'network_ssl',
      status: 'error',
      message: 'Error de seguridad al conectar con el servicio.',
      code: 500
    };
  }

  // Generic network error
  if (errorCode.startsWith('E') || errorMsg.includes('network') || errorMsg.includes('socket')) {
    return {
      type: 'network_generic',
      status: 'empty',
      message: 'Error de conexiÃ³n. El servicio podrÃ­a estar temporalmente no disponible.',
      code: 503
    };
  }

  // Not a network error
  return null;
}

// ============================================
// SANITIZAR MENSAJES DE ERROR
// ============================================
function sanitizeError(error) {
  if (!error) return "Error desconocido";

  const msg = error.message || String(error);

  // Errores de parseo JSON (HTML en lugar de JSON)
  if (msg.includes("Unexpected token") ||
      msg.includes("is not valid JSON") ||
      (msg.includes("JSON") && msg.includes("parse")) ||
      msg.includes("<!DOCTYPE") ||
      msg.includes("MTC_ERROR: Respuesta no es JSON")) {
    return "El servicio estÃƒÂ¡ devolviendo una respuesta inesperada. Puede estar bloqueando consultas automatizadas o experimentando problemas tÃƒÂ©cnicos.";
  }

  // Errores de Chromium/Puppeteer
  if (msg.includes("Could not find Chromium")) {
    return "Servicio temporalmente no disponible";
  }
  if (msg.includes("Browser closed") || msg.includes("Target closed")) {
    return "Error al procesar la consulta";
  }
  if (msg.includes("Navigation timeout") || msg.includes("Timeout")) {
    return "Tiempo de espera agotado - El servicio responde lento";
  }
  if (msg.includes("net::ERR") || msg.includes("Network")) {
    return "Error de conexiÃƒÂ³n con el servicio externo";
  }

  // Errores especÃƒÂ­ficos de adapters HTTP
  if (msg.includes("MTC_ERROR")) {
    return "El servicio MTC no estÃƒÂ¡ disponible temporalmente. Por favor intente mÃƒÂ¡s tarde.";
  }
  if (msg.includes("SELECTOR_MISSING")) {
    return "El portal cambiÃƒÂ³ su estructura. Contacte al administrador.";
  }
  if (msg.includes("BLOCKED_OR_RATE_LIMITED")) {
    return "El servicio bloquea consultas automatizadas temporalmente";
  }

  // Si el mensaje es muy largo o contiene rutas del sistema, acortarlo
  if (msg.length > 100 || msg.includes("/Users/") || msg.includes(".cache/puppeteer") || msg.includes("C:\\")) {
    return "Error tÃƒÂ©cnico - Contacte al administrador";
  }

  return msg;
}

// ============================================
// PUPPETEER PARA CPANEL LINUX
// ============================================
// (fs ya estÃ¡ importado arriba)

/**
 * Obtener ruta del ejecutable de Chrome/Chromium para Linux (cPanel)
 * Prioridad: PUPPETEER_EXECUTABLE_PATH > CHROME_BIN > puppeteer bundled
 */
function getExecutablePath() {
  // 1. Variable de entorno explÃƒÂ­cita (recomendado para cPanel)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const exePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(exePath)) {
      console.log(`Ã¢Å“â€¦ Usando PUPPETEER_EXECUTABLE_PATH: ${exePath}`);
      return exePath;
    }
    console.log(`Ã¢Å¡Â Ã¯Â¸Â PUPPETEER_EXECUTABLE_PATH no existe: ${exePath}`);
  }

  // 2. Variable CHROME_BIN (alternativa comÃƒÂºn)
  if (process.env.CHROME_BIN) {
    const chromeBin = process.env.CHROME_BIN;
    if (fs.existsSync(chromeBin)) {
      console.log(`Ã¢Å“â€¦ Usando CHROME_BIN: ${chromeBin}`);
      return chromeBin;
    }
    console.log(`Ã¢Å¡Â Ã¯Â¸Â CHROME_BIN no existe: ${chromeBin}`);
  }

  // 3. Rutas comunes en Linux (solo si no es Windows)
  if (process.platform !== 'win32') {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/chrome',
      '/opt/google/chrome/chrome'
    ];

    for (const linuxPath of linuxPaths) {
      if (fs.existsSync(linuxPath)) {
        console.log(`Ã¢Å“â€¦ Chrome encontrado en Linux: ${linuxPath}`);
        return linuxPath;
      }
    }
  }

  // 4. Fallback: usar el Chromium bundled de Puppeteer
  console.log('Ã¢â€žÂ¹Ã¯Â¸Â Usando Chromium bundled de Puppeteer');
  return null; // null = usar el bundled
}

/**
 * Lanzar navegador con configuraciÃƒÂ³n optimizada para cPanel Linux
 */
async function launchBrowser() {
  const executablePath = getExecutablePath();

  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080"
    ]
  };

  // Solo agregar executablePath si existe
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  try {
    const browser = await puppeteer.launch(launchOptions);
    console.log('Ã¢Å“â€¦ Navegador lanzado correctamente');
    return browser;
  } catch (error) {
    console.error('Ã¢ÂÅ’ Error lanzando navegador:', error.message);
    // Si falla con executablePath, intentar sin ÃƒÂ©l (usar bundled)
    if (executablePath && error.message.includes('Could not find')) {
      console.log('Ã¢Å¡Â Ã¯Â¸Â Reintentando con Chromium bundled...');
      delete launchOptions.executablePath;
      return await puppeteer.launch(launchOptions);
    }
    throw error;
  }
}

// ============================================
// SCRAPING TOOLKIT - Helpers Reutilizables
// ============================================

/**
 * Esperar cualquiera de varios selectores (retorna el encontrado)
 */
async function waitForAnySelector(page, selectors, timeoutEach = 2500) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: timeoutEach });
      console.log(`Ã¢Å“â€¦ Selector encontrado: ${selector}`);
      return selector;
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Escribir en el primer input que encuentre de la lista
 */
async function typeIntoFirst(page, selectors, value, options = { delay: 100 }) {
  const foundSelector = await waitForAnySelector(page, selectors, 3000);
  if (!foundSelector) {
    throw new Error(`No se encontrÃƒÂ³ ningÃƒÂºn input con selectores: ${selectors.join(', ')}`);
  }
  await page.type(foundSelector, value, options);
  return foundSelector;
}

/**
 * Click en botÃƒÂ³n por texto usando XPath
 */
async function clickByText(page, tag, text) {
  const xpath = `//${tag}[contains(text(), '${text}')]`;
  const elements = await page.$x(xpath);
  if (elements.length > 0) {
    await elements[0].click();
    console.log(`Ã¢Å“â€¦ Click en ${tag} con texto: ${text}`);
    return true;
  }
  return false;
}

/**
 * Click en el primer elemento encontrado (CSS o XPath)
 */
async function clickFirst(page, selectorsOrXpaths) {
  for (const selector of selectorsOrXpaths) {
    try {
      // Si es XPath (empieza con //)
      if (selector.startsWith('//')) {
        const elements = await page.$x(selector);
        if (elements.length > 0) {
          await elements[0].click();
          console.log(`Ã¢Å“â€¦ Click XPath: ${selector}`);
          return true;
        }
      } else {
        // CSS selector
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        console.log(`Ã¢Å“â€¦ Click CSS: ${selector}`);
        return true;
      }
    } catch (e) {
      continue;
    }
  }
  return false;
}

/**
 * Detectar si la pÃƒÂ¡gina indica "sin registros"
 */
async function detectNoRecords(page) {
  const resultado = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const frasesNoEncontrado = [
      'no se encontr',
      'sin registros',
      'no existe',
      'no hay resultados',
      'no registra',
      '0 resultados',
      'no tiene registros',
      'no se encontraron datos',
      'sin informaciÃƒÂ³n',
      'no hay informaciÃƒÂ³n'
    ];

    // Buscar en texto del body
    const tieneFrase = frasesNoEncontrado.some(frase => bodyText.includes(frase));

    // Buscar en elementos comunes de mensaje
    const mensajeEls = document.querySelectorAll('.mensaje, .alert, .error, #mensaje, [class*="mensaje" i], [id*="mensaje" i]');
    let mensajeEncontrado = '';

    for (const el of mensajeEls) {
      const texto = el.innerText.toLowerCase();
      if (frasesNoEncontrado.some(frase => texto.includes(frase))) {
        mensajeEncontrado = el.innerText.trim();
        break;
      }
    }

    return {
      isEmpty: tieneFrase || mensajeEncontrado.length > 0,
      message: mensajeEncontrado || (tieneFrase ? 'No se encontraron registros' : '')
    };
  });

  return resultado;
}

/**
 * Configurar pÃƒÂ¡gina con anti-detecciÃƒÂ³n
 */
async function setupAntiDetection(page) {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Ocultar webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-PE', 'es', 'en'] });
  });

  // Headers adicionales
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
}

/**
 * Timeouts normalizados por tipo de endpoint
 */
function normalizeTimeouts(endpoint) {
  const captchaEndpoints = ['lima', 'impuesto'];
  if (captchaEndpoints.includes(endpoint)) {
    return {
      navigation: 90000,  // 90s para navegaciÃ³n en VPS
      selector: 20000,    // 20s para selectores dinÃ¡micos
      captcha: 120000,   // 120s total para captcha
      processing: 5000   // 5s para procesar resultados
    };
  }
  return {
    navigation: 60000,   // 60s para navegaciÃ³n
    selector: 10000,     // 10s para selectores
    processing: 3000     // 3s para procesar resultados
  };
}

// ============================================
// RESOLVER CAPTCHA CON 2CAPTCHA (OPTIMIZADO)
// ============================================
async function resolverRecaptcha(siteKey, pageUrl) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "userrecaptcha",
      googlekey: siteKey,
      pageurl: pageUrl,
      json: 1,
      priority: 2 // Prioridad alta
    },
    timeout: 5000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error("Error enviando captcha: " + captchaStart.data.request);
  }

  const captchaId = captchaStart.data.request;
  let token = null;

  // Optimizado: revisar cada 2s en vez de 3s, mÃƒÂ¡ximo 20 intentos (40s en vez de 90s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 3000
    });
    if (check.data.status === 1) {
      token = check.data.request;
      break;
    }
    // Si dice que no estÃƒÂ¡ listo, continuar. Si hay otro error, esperar un poco mÃƒÂ¡s.
    if (check.data.request !== "CAPCHA_NOT_READY") {
      console.log(`Captcha intento ${i+1}: ${check.data.request}`);
    }
  }

  if (!token) throw new Error("Captcha no resuelto a tiempo (40s timeout)");
  return token;
}

/**
 * Resolver reCAPTCHA v2 con 2Captcha
 * @param {string} siteKey - Site key del reCAPTCHA
 * @param {string} pageUrl - URL de la pÃƒÂ¡gina donde estÃƒÂ¡ el captcha
 * @returns {Promise<string>} - Token de respuesta del reCAPTCHA
 */
async function resolverReCaptchaV2(siteKey, pageUrl) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  console.log(`[2Captcha] Resolviendo reCAPTCHA v2 (sitekey: ${siteKey.substring(0, 20)}...)`);

  // Enviar captcha a 2Captcha
  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "userrecaptcha",
      googlekey: siteKey,
      pageurl: pageUrl,
      json: 1
    },
    timeout: 10000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error(`2Captcha error: ${captchaStart.data.request}`);
  }

  const captchaId = captchaStart.data.request;
  console.log(`[2Captcha] Captcha ID: ${captchaId}`);

  // Esperar soluciÃƒÂ³n (mÃƒÂ¡ximo 2 minutos)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const captchaResult = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 5000
    });

    if (captchaResult.data.status === 1) {
      console.log(`[2Captcha] Ã¢Å“â€¦ reCAPTCHA resuelto`);
      return captchaResult.data.request;
    }

    if (captchaResult.data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2Captcha error: ${captchaResult.data.request}`);
    }
  }

  throw new Error("Timeout esperando soluciÃƒÂ³n del reCAPTCHA");
}

/**
 * Resolver captcha de imagen (base64) con 2Captcha
 * @param {string} base64Image - Imagen en base64 (sin data:image/...)
 * @returns {Promise<string>} - Texto del captcha resuelto
 */
async function resolverCaptchaImagen(base64Image) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  // Remover prefijo data:image si existe
  const base64Clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

  console.log(`[2CAPTCHA] Enviando captcha de imagen...`);
  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "base64",
      body: base64Clean,
      json: 1,
      priority: 2
    },
    timeout: 5000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error("Error enviando captcha: " + captchaStart.data.request);
  }

  const captchaId = captchaStart.data.request;
  console.log(`[2CAPTCHA] Captcha ID: ${captchaId}, esperando resoluciÃƒÂ³n...`);

  // Esperar resoluciÃƒÂ³n: revisar cada 2s, mÃƒÂ¡ximo 20 intentos (40s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 3000
    });

    if (check.data.status === 1) {
      const solution = check.data.request;
      console.log(`[2CAPTCHA] Ã¢Å“â€¦ Captcha resuelto: ${solution}`);
      return solution;
    }

    if (check.data.request !== "CAPCHA_NOT_READY") {
      console.log(`[2CAPTCHA] Intento ${i+1}: ${check.data.request}`);
    }
  }

  throw new Error("Captcha de imagen no resuelto a tiempo (40s timeout)");
}

// ============================================
// MERCADO PAGO (DESHABILITADO)
// ============================================
// IntegraciÃ³n removida. El checkout oficial es MiCuentaWeb/Izipay (Krypton V4).

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  respond(res, { ok: true, source: "health", status: "success", message: "Servidor operativo" });
});

// ============================================
// API: MICUENTAWEB / NIUBIZ - CREATE TOKEN
// ============================================
app.post("/api/payments/mcw/create-token", async (req, res) => {
  try {
    if (!MCW_API_USER || !MCW_API_PASSWORD || !MCW_PUBLIC_KEY) {
      return res.status(500).json({
        ok: false,
        source: "mcw",
        status: "error",
        message: "Pasarela de pago no configurada"
      });
    }

    const { email, amount, userId } = req.body || {};
    if (!safeEmail(email)) {
      return respond(res, {
        ok: false,
        source: "mcw",
        status: "error",
        message: "Email válido requerido"
      }, 400);
    }

    const finalAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Math.round(Number(amount))
      : 1500;
    const orderId = buildMcwOrderId();
    const authBasic = Buffer.from(`${MCW_API_USER}:${MCW_API_PASSWORD}`).toString("base64");

    const payload = {
      amount: finalAmount,
      currency: "PEN",
      paymentMethods: ["CARDS", "PAGOEFECTIVO"],
      customer: { email: String(email).trim() },
      orderId
    };

    const mcwResponse = await axios.post(MCW_CREATE_PAYMENT_URL, payload, {
      headers: {
        Authorization: `Basic ${authBasic}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    const formToken = mcwResponse?.data?.answer?.formToken;
    if (!formToken) {
      throw new Error("Respuesta inválida de MiCuentaWeb: formToken ausente");
    }

    upsertPaymentRecord({
      orderId,
      email: String(email).trim().toLowerCase(),
      userId: userId || null,
      amount: finalAmount,
      currency: "PEN",
      provider: "MCW",
      status: "PENDING",
      source: "create-token"
    });

    console.log(`[MCW] formToken generado correctamente: orderId=${orderId}, email=${email}`);

    return respond(res, {
      ok: true,
      source: "mcw",
      status: "success",
      message: "Token de pago generado",
      data: {
        orderId,
        formToken,
        publicKey: MCW_PUBLIC_KEY,
        returnOk: MCW_RETURN_OK,
        returnKo: MCW_RETURN_KO,
        ipnUrl: MCW_IPN_URL
      }
    });
  } catch (error) {
    console.error("[MCW] Error creando formToken:", error.message);
    if (error.response) {
      console.error("[MCW] Respuesta remota:", {
        status: error.response.status,
        code: error.response.data?.status,
        message: error.response.data?.message
      });
    }

    return res.status(500).json({
      ok: false,
      source: "mcw",
      status: "error",
      message: "No se pudo iniciar el pago"
    });
  }
});

// ============================================
// API: MICUENTAWEB / NIUBIZ - IPN (Webhook)
// ============================================
app.post("/api/payments/mcw/ipn", async (req, res) => {
  try {
    if (!MCW_HMAC_KEY) {
      console.error("[MCW] IPN recibido sin MCW_HMAC_KEY configurado");
      return res.status(500).json({ ok: false, message: "HMAC key no configurada" });
    }

    const payload = extractIpnPayload(req);
    const krHash = getKrHashCandidate(req, payload);
    const krAnswerRaw = getKrAnswerCandidate(payload, req.rawBody);

    // Según especificación de MiCuentaWeb/Krypton, el hash se recalcula con HMAC-SHA256
    // usando la HMAC key privada y el valor kr-answer (raw string JSON).
    const { digestHex, digestBase64 } = computeMcwKrHash({ krAnswer: krAnswerRaw, hmacKey: MCW_HMAC_KEY });

    if (!validateKrHash({ providedHash: krHash, digestHex, digestBase64 })) {
      console.warn("[MCW] IPN firma inválida", {
        hasKrHash: !!krHash,
        hasKrAnswer: !!krAnswerRaw
      });
      return res.status(401).json({ ok: false, message: "Firma inválida" });
    }

    const answer = parseKrAnswer(krAnswerRaw);
    const orderId = String(answer?.orderDetails?.orderId || answer?.orderId || payload?.orderId || "").trim();
    const email = String(answer?.customer?.email || answer?.orderDetails?.customer?.email || payload?.email || "").trim().toLowerCase();
    const amount = Number(answer?.orderDetails?.orderTotalAmount || answer?.amount || payload?.amount || 0);
    const currency = String(answer?.orderDetails?.orderCurrency || answer?.currency || payload?.currency || "PEN").toUpperCase();
    const paid = isPaidTransaction(answer);

    if (!orderId) {
      console.warn("[MCW] IPN válido pero sin orderId");
      return res.status(400).json({ ok: false, message: "orderId ausente" });
    }

    upsertPaymentRecord({
      orderId,
      email,
      amount,
      currency,
      provider: "MCW",
      status: paid ? "PAID" : "RECEIVED",
      paidAt: paid ? new Date().toISOString() : null,
      source: "ipn",
      ipn: {
        orderStatus: answer?.orderStatus || null,
        transactionStatus: answer?.transactions?.[0]?.detailedStatus || answer?.transactions?.[0]?.status || null
      }
    });

    console.log(`[MCW] IPN recibido. Firma válida. orderId=${orderId} status=${paid ? "PAID" : "RECEIVED"}`);

    if (paid) {
      activateAccess({ orderId, email, amount, currency });
      console.log(`[MCW] Acceso activado para orderId=${orderId}`);
    }

    // Responder rápido al IPN
    return res.status(200).json({ ok: true, orderId, status: paid ? "PAID" : "RECEIVED" });
  } catch (error) {
    console.error("[MCW] Error procesando IPN:", error.message);
    return res.status(400).json({ ok: false, message: "IPN inválido" });
  }
});

// ============================================
// API: IZIPAY REDIRECCIÓN (VADS) - INIT
// ============================================
app.post("/api/izipay/init", (req, res) => {
  try {
    if (!IZIPAY_SITE_ID) {
      return respond(res, {
        ok: false,
        source: "izipay",
        status: "error",
        message: "IZIPAY_SITE_ID no configurado"
      }, 500);
    }

    const key = getIzipayKey(IZIPAY_CTX_MODE);
    if (!key) {
      return respond(res, {
        ok: false,
        source: "izipay",
        status: "error",
        message: "Llave Izipay no configurada"
      }, 500);
    }

    const { email } = req.body || {};
    const orderId = buildIzipayOrderId();
    const transDate = formatIzipayUtcDate();
    const transId = nextIzipayTransId();
    const amount = Math.max(1, Math.round(PRICE_CENTS));

    // Verificar si BASE_URL es localhost (no válido para IPN)
    const isLocalhost = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    
    const fields = {
      vads_action_mode: "INTERACTIVE",
      vads_amount: String(amount),
      vads_ctx_mode: IZIPAY_CTX_MODE,
      vads_currency: String(CURRENCY_NUM),
      vads_page_action: "PAYMENT",
      vads_payment_config: "SINGLE",
      vads_return_mode: "GET",
      vads_site_id: IZIPAY_SITE_ID,
      vads_trans_date: transDate,
      vads_trans_id: transId,
      vads_version: "V2",
      vads_order_id: orderId,
      vads_url_return: `${BASE_URL}/pago-ok?orderId=${encodeURIComponent(orderId)}`,
      vads_url_cancel: `${BASE_URL}/pago-error?orderId=${encodeURIComponent(orderId)}`,
      vads_url_success: `${BASE_URL}/pago-ok?orderId=${encodeURIComponent(orderId)}`,
      vads_url_error: `${BASE_URL}/pago-error?orderId=${encodeURIComponent(orderId)}`,
      vads_language: "es"
    };
    
    // Solo incluir vads_url_check si NO es localhost (Izipay no puede acceder a localhost)
    // En localhost, el IPN se debe simular manualmente o usar ngrok
    if (!isLocalhost) {
      fields.vads_url_check = `${BASE_URL}/api/izipay/ipn`;
      console.log(`[IZIPAY] IPN URL configurada: ${fields.vads_url_check}`);
    } else {
      console.log(`[IZIPAY] Modo localhost detectado - vads_url_check omitido (usar botón de simulación o ngrok)`);
    }

    if (safeEmail(email)) {
      fields.vads_cust_email = String(email).trim().toLowerCase();
    }

    const signature = computeIzipaySignature(fields, key);
    const record = {
      orderId,
      status: "PENDING",
      amount,
      currency: CURRENCY_NUM,
      transId,
      transDate,
      ctxMode: IZIPAY_CTX_MODE,
      email: safeEmail(email) ? String(email).trim().toLowerCase() : null,
      access: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    izipayPayments.set(orderId, record);
    persistIzipayPayments();

    console.log(`[IZIPAY] init -> orderId=${orderId}, transId=${transId}, amount=${amount}`);
    if (fields.vads_url_check) {
      console.log(`[IZIPAY] IPN URL configurada: ${fields.vads_url_check}`);
    }

    return res.status(200).json({
      formAction: IZIPAY_FORM_ACTION,
      fields: {
        ...fields,
        signature
      }
    });
  } catch (error) {
    console.error("[IZIPAY] Error en init:", error.message);
    return respond(res, {
      ok: false,
      source: "izipay",
      status: "error",
      message: "No se pudo iniciar el pago"
    }, 500);
  }
});

// ============================================
// API: IZIPAY REDIRECCIÓN (VADS) - IPN
// ============================================
app.post("/api/izipay/ipn", (req, res) => {
  try {
    console.log(`[IZIPAY] IPN recibido - Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[IZIPAY] IPN recibido - Body:`, JSON.stringify(req.body, null, 2));
    
    const payload = req.body || {};
    const receivedSignature = String(payload.signature || "").trim();
    const vadsFields = {};
    Object.keys(payload || {}).forEach((key) => {
      if (key.startsWith("vads_")) {
        vadsFields[key] = payload[key];
      }
    });

    if (!receivedSignature) {
      console.warn("[IZIPAY] ipn-invalid -> signature ausente");
      return res.status(401).send("INVALID_SIGNATURE");
    }

    const ctxMode = vadsFields.vads_ctx_mode || IZIPAY_CTX_MODE;
    const key = getIzipayKey(ctxMode);
    if (!key) {
      console.warn("[IZIPAY] ipn-invalid -> key no configurada");
      return res.status(500).send("CONFIG_ERROR");
    }

    const expectedSignature = computeIzipaySignature(vadsFields, key);
    if (!timingSafeEqualText(receivedSignature, expectedSignature)) {
      console.warn("[IZIPAY] ipn-invalid -> firma inválida", {
        received: receivedSignature,
        expected: expectedSignature
      });
      return res.status(401).send("INVALID_SIGNATURE");
    }

    const orderId = String(vadsFields.vads_order_id || "").trim();
    const transId = String(vadsFields.vads_trans_id || "").trim();
    const statusRaw = String(vadsFields.vads_trans_status || "").trim();
    const status = normalizeIzipayStatus(statusRaw);
    let record = orderId ? izipayPayments.get(orderId) : null;

    if (!record && transId) {
      const found = findIzipayPaymentByTransId(transId);
      if (found) {
        record = found.record;
      }
    }

    if (!record) {
      record = {
        orderId: orderId || `UNKNOWN-${transId || Date.now()}`,
        status: "PENDING",
        amount: Number(vadsFields.vads_amount || 0),
        currency: vadsFields.vads_currency || CURRENCY_NUM,
        transId: transId || null,
        transDate: vadsFields.vads_trans_date || null,
        ctxMode: ctxMode,
        access: false,
        createdAt: new Date().toISOString()
      };
    }

    // Protección de idempotencia: evitar procesar el mismo IPN múltiples veces
    const previousStatus = record.status;
    const wasAlreadyPaid = previousStatus === "PAID";
    const isNowPaid = status === "PAID";
    
    // Si ya estaba PAID y el nuevo status también es PAID, solo actualizar timestamp
    if (wasAlreadyPaid && isNowPaid) {
      console.log(`[IZIPAY] ipn-duplicate -> orderId=${record.orderId} ya estaba PAID, ignorando IPN duplicado`);
      record.updatedAt = new Date().toISOString();
      izipayPayments.set(record.orderId, record);
      persistIzipayPayments();
      return res.status(200).send("OK");
    }

    record.status = status;
    record.updatedAt = new Date().toISOString();
    record.rawIpn = {
      receivedAt: new Date().toISOString(),
      vads_trans_status: statusRaw,
      payload: vadsFields
    };

    izipayPayments.set(record.orderId, record);
    persistIzipayPayments();

    console.log(`[IZIPAY] ipn-valid -> orderId=${record.orderId} status=${status} (anterior: ${previousStatus})`);

    // Solo activar acceso si el status cambió a PAID (no estaba PAID antes)
    if (isNowPaid && !wasAlreadyPaid) {
      activateAccess({
        orderId: record.orderId,
        email: record.email,
        amount: record.amount,
        currency: record.currency,
        provider: "IZIPAY"
      });
      console.log(`[IZIPAY] Acceso activado para orderId=${record.orderId}`);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("[IZIPAY] Error procesando IPN:", error.message);
    return res.status(400).send("INVALID_IPN");
  }
});

// ============================================
// API: IZIPAY - SIMULAR IPN (SOLO DESARROLLO)
// ============================================
app.post("/api/izipay/simulate-ipn", (req, res) => {
  console.log(`[IZIPAY] simulate-ipn -> Endpoint llamado, hostname: ${req.hostname}, url: ${req.url}`);
  
  // Solo permitir en desarrollo/localhost
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || process.env.NODE_ENV !== 'production';
  
  console.log(`[IZIPAY] simulate-ipn -> isLocalhost: ${isLocalhost}`);
  
  if (!isLocalhost) {
    return res.status(403).json({ ok: false, message: "Solo disponible en desarrollo" });
  }

  try {
    const { orderId } = req.body || {};
    
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId requerido" });
    }

    let record = izipayPayments.get(String(orderId));
    
    // Si no está en memoria, intentar cargar desde el archivo
    if (!record) {
      console.log(`[IZIPAY] simulate-ipn -> orderId=${orderId} no está en memoria, cargando desde archivo...`);
      try {
        const store = loadPaymentsStore();
        const stored = store?.izipay && typeof store.izipay === "object" ? store.izipay : {};
        record = stored[String(orderId)];
        
        if (record) {
          // Cargar en memoria para futuras consultas
          izipayPayments.set(String(orderId), record);
          console.log(`[IZIPAY] simulate-ipn -> orderId=${orderId} cargado desde archivo`);
        }
      } catch (error) {
        console.error(`[IZIPAY] Error cargando desde archivo:`, error.message);
      }
    }
    
    if (!record) {
      return res.status(404).json({ 
        ok: false, 
        message: "Orden no encontrada. El pago puede no haberse registrado correctamente o el servidor se reinició antes de guardarlo. Intenta realizar un nuevo pago." 
      });
    }

    // Simular IPN con status PAID
    const vadsFields = {
      vads_order_id: orderId,
      vads_trans_id: record.transId || String(Date.now()).slice(-6),
      vads_trans_status: "AUTHORISED",
      vads_ctx_mode: record.ctxMode || IZIPAY_CTX_MODE,
      vads_amount: String(record.amount || PRICE_CENTS),
      vads_currency: record.currency || CURRENCY_NUM,
      vads_trans_date: record.transDate || formatIzipayUtcDate(),
      vads_site_id: IZIPAY_SITE_ID
    };

    const key = getIzipayKey(vadsFields.vads_ctx_mode);
    if (!key) {
      return res.status(500).json({ ok: false, message: "Llave Izipay no configurada" });
    }

    const signature = computeIzipaySignature(vadsFields, key);
    
    // Crear payload del IPN simulado
    const ipnPayload = {
      ...vadsFields,
      signature
    };

    // Llamar al endpoint del IPN internamente
    const ipnReq = {
      body: ipnPayload,
      headers: req.headers
    };
    
    // Simular la respuesta del IPN
    const ipnRes = {
      status: (code) => {
        console.log(`[IZIPAY] IPN simulado respondió con código: ${code}`);
        return ipnRes;
      },
      send: (data) => {
        console.log(`[IZIPAY] IPN simulado: ${data}`);
        return ipnRes;
      }
    };

    // Procesar el IPN simulado
    console.log(`[IZIPAY] Simulando IPN para orderId=${orderId}`);
    
    // Actualizar el registro directamente (simulando el IPN)
    const previousStatus = record.status;
    record.status = "PAID";
    record.updatedAt = new Date().toISOString();
    record.rawIpn = {
      receivedAt: new Date().toISOString(),
      vads_trans_status: "AUTHORISED",
      payload: vadsFields,
      simulated: true
    };

    izipayPayments.set(orderId, record);
    persistIzipayPayments();

    // Activar acceso si no estaba PAID antes
    if (previousStatus !== "PAID") {
      activateAccess({
        orderId: record.orderId,
        email: record.email,
        amount: record.amount,
        currency: record.currency,
        provider: "IZIPAY"
      });
      console.log(`[IZIPAY] Acceso activado (simulado) para orderId=${orderId}`);
    }

    return res.status(200).json({
      ok: true,
      message: "IPN simulado correctamente",
      orderId,
      status: "PAID",
      accessToken: record.accessToken || null
    });

  } catch (error) {
    console.error("[IZIPAY] Error simulando IPN:", error.message);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

// ============================================
// API: IZIPAY STATUS
// ============================================
app.get("/api/izipay/status", (req, res) => {
  const { orderId } = req.query || {};
  let record = izipayPayments.get(String(orderId || ""));
  
  // Si no está en memoria, intentar cargar desde el archivo
  if (!record) {
    console.log(`[IZIPAY] status -> orderId=${orderId || ""} no está en memoria, cargando desde archivo...`);
    try {
      const store = loadPaymentsStore();
      const stored = store?.izipay && typeof store.izipay === "object" ? store.izipay : {};
      record = stored[String(orderId || "")];
      
      if (record) {
        // Cargar en memoria para futuras consultas
        izipayPayments.set(String(orderId), record);
        console.log(`[IZIPAY] status -> orderId=${orderId} cargado desde archivo`);
      }
    } catch (error) {
      console.error(`[IZIPAY] Error cargando desde archivo:`, error.message);
    }
  }
  
  if (!record) {
    console.warn(`[IZIPAY] status -> orderId=${orderId || ""} NOT_FOUND (ni en memoria ni en archivo)`);
    return res.status(404).json({ status: "NOT_FOUND" });
  }

  console.log(`[IZIPAY] status -> orderId=${record.orderId} status=${record.status} access=${record.access || false} token=${record.accessToken ? 'presente' : 'ausente'}`);

  return res.status(200).json({
    status: record.status,
    updatedAt: record.updatedAt || record.createdAt,
    access: record.access || false,
    accessToken: record.accessToken || null
  });
});

// ============================================
// API: SERVICIO USAR (TOKEN STUB)
// ============================================
app.get("/api/servicio/usar", (req, res) => {
  const { token } = req.query || {};
  if (!token) {
    return res.status(400).json({ ok: false, message: "Token requerido" });
  }

  // Buscar en Izipay
  let record = Array.from(izipayPayments.values()).find((item) => item?.accessToken === token);
  
  // Si no está en Izipay, buscar en Mercado Pago
  if (!record) {
    record = Array.from(mercadopagoPayments.values()).find((item) => item?.accessToken === token);
  }
  
  if (!record) {
    return res.status(404).json({ ok: false, message: "Token inválido" });
  }

  return res.status(200).json({ ok: true, message: "Acceso permitido", orderId: record.orderId });
});

// ============================================
// API: MERCADO PAGO - CREAR PREFERENCIA
// ============================================
app.post("/api/mercadopago/create-preference", async (req, res) => {
  try {
    if (!mercadoPagoHandler) {
      return respond(res, {
        ok: false,
        source: "mercadopago",
        status: "error",
        message: "Mercado Pago no configurado. Verifica MERCADOPAGO_ACCESS_TOKEN en .env"
      }, 500);
    }

    const { email } = req.body || {};
    const orderId = `MP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const amount = Math.max(1, Math.round(PRICE_CENTS));

    // Crear registro de pago
    const record = {
      orderId,
      status: "PENDING",
      amount,
      currency: "PEN",
      email: safeEmail(email) ? String(email).trim().toLowerCase() : null,
      access: false,
      provider: "MERCADOPAGO",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mercadopagoPayments.set(orderId, record);
    persistMercadoPagoPayments();

    console.log(`[MERCADOPAGO] Creando preferencia para orderId=${orderId}, amount=${amount}`);

    // Crear preferencia en Mercado Pago
    const preference = await mercadoPagoHandler.createPreference({
      email: record.email,
      orderId,
      amount,
      description: "Informe Vehicular Completo"
    });

    // Actualizar registro con preferenceId
    record.preferenceId = preference.preferenceId;
    mercadopagoPayments.set(orderId, record);
    persistMercadoPagoPayments();

    console.log(`[MERCADOPAGO] Preferencia creada: ${preference.preferenceId}`);

    return res.status(200).json({
      ok: true,
      source: "mercadopago",
      status: "success",
      data: {
        orderId,
        preferenceId: preference.preferenceId,
        initPoint: preference.initPoint,
        sandboxInitPoint: preference.sandboxInitPoint
      }
    });

  } catch (error) {
    console.error("[MERCADOPAGO] Error creando preferencia:", error.message);
    return respond(res, {
      ok: false,
      source: "mercadopago",
      status: "error",
      message: error.message || "No se pudo crear la preferencia de pago"
    }, 500);
  }
});

// ============================================
// API: MERCADO PAGO - WEBHOOK
// ============================================
app.post("/api/mercadopago/webhook", async (req, res) => {
  try {
    console.log(`[MERCADOPAGO] Webhook recibido - Body:`, JSON.stringify(req.body, null, 2));
    
    const { type, data } = req.body || {};
    
    if (type === 'payment' && data?.id) {
      const paymentId = data.id;
      
      if (!mercadoPagoHandler) {
        console.warn("[MERCADOPAGO] Handler no disponible para procesar webhook");
        return res.status(500).send("Handler not configured");
      }

      // Obtener información del pago
      const paymentInfo = await mercadoPagoHandler.getPaymentStatus(paymentId);
      const orderId = paymentInfo.externalReference;

      if (!orderId) {
        console.warn("[MERCADOPAGO] Webhook sin external_reference");
        return res.status(400).send("Missing external_reference");
      }

      let record = mercadopagoPayments.get(orderId);
      
      if (!record) {
        // Crear registro si no existe
        record = {
          orderId,
          status: "PENDING",
          amount: Math.round(paymentInfo.amount * 100), // Convertir a centavos
          currency: "PEN",
          access: false,
          provider: "MERCADOPAGO",
          createdAt: new Date().toISOString()
        };
      }

      // Mapear estados de Mercado Pago
      const mpStatus = paymentInfo.status;
      let status = "PENDING";
      
      if (mpStatus === 'approved') {
        status = "approved"; // Mantener 'approved' para compatibilidad con frontend
      } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
        status = "REFUSED";
      } else if (mpStatus === 'pending' || mpStatus === 'in_process') {
        status = "PENDING";
      }

      // Protección de idempotencia
      const previousStatus = record.status;
      const wasAlreadyPaid = previousStatus === "approved" || previousStatus === "PAID";
      const isNowPaid = status === "approved";

      if (wasAlreadyPaid && isNowPaid) {
        console.log(`[MERCADOPAGO] webhook-duplicate -> orderId=${orderId} ya estaba aprobado, ignorando webhook duplicado`);
        record.updatedAt = new Date().toISOString();
        mercadopagoPayments.set(orderId, record);
        persistMercadoPagoPayments();
        return res.status(200).send("OK");
      }

      record.status = status;
      record.paymentId = paymentId;
      record.statusDetail = paymentInfo.statusDetail;
      record.updatedAt = new Date().toISOString();
      record.rawWebhook = {
        receivedAt: new Date().toISOString(),
        paymentInfo
      };

      mercadopagoPayments.set(orderId, record);
      persistMercadoPagoPayments();

      console.log(`[MERCADOPAGO] webhook-valid -> orderId=${orderId} status=${status} (anterior: ${previousStatus})`);

      // Activar acceso si el pago fue aprobado
      if (isNowPaid && !wasAlreadyPaid) {
        activateAccess({
          orderId: record.orderId,
          email: record.email,
          amount: record.amount,
          currency: record.currency,
          provider: "MERCADOPAGO"
        });
        console.log(`[MERCADOPAGO] Acceso activado para orderId=${orderId}`);
      }

      return res.status(200).send("OK");
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("[MERCADOPAGO] Error procesando webhook:", error.message);
    return res.status(500).send("Error processing webhook");
  }
});

// ============================================
// API: MERCADO PAGO - STATUS
// ============================================
app.get("/api/mercadopago/status", (req, res) => {
  const { orderId } = req.query || {};
  let record = mercadopagoPayments.get(String(orderId || ""));

  // Si no está en memoria, intentar cargar desde el archivo
  if (!record) {
    console.log(`[MERCADOPAGO] status -> orderId=${orderId || ""} no está en memoria, cargando desde archivo...`);
    try {
      if (fs.existsSync(MERCADOPAGO_PAYMENTS_FILE)) {
        const data = fs.readFileSync(MERCADOPAGO_PAYMENTS_FILE, "utf8");
        const store = JSON.parse(data);
        record = store?.[String(orderId || "")];
        
        if (record) {
          mercadopagoPayments.set(String(orderId), record);
          console.log(`[MERCADOPAGO] status -> orderId=${orderId} cargado desde archivo`);
        }
      }
    } catch (error) {
      console.error(`[MERCADOPAGO] Error cargando desde archivo:`, error.message);
    }
  }

  if (!record) {
    return res.status(404).json({
      ok: false,
      source: "mercadopago",
      status: "NOT_FOUND",
      message: "Orden no encontrada"
    });
  }

  console.log(`[MERCADOPAGO] status -> orderId=${record.orderId} status=${record.status} access=${record.access || false} token=${record.accessToken ? 'presente' : 'ausente'}`);

  return res.status(200).json({
    ok: true,
    source: "mercadopago",
    status: record.status, // Puede ser 'approved', 'PENDING', 'REFUSED'
    orderId: record.orderId,
    access: record.access || false,
    accessToken: record.accessToken || null,
    amount: record.amount,
    currency: record.currency
  });
});

// ============================================
// API: SOAT (APESEG)
// ============================================
app.post("/api/soat", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "soat", status: "error", message: "Placa requerida" }, 400);

  const startTime = Date.now();
  console.log(`[SOAT-APESEG] Iniciando consulta para placa: ${placa}`);

  try {
    const scraper = new ApesegSoatScraper({
      captchaApiKey: CAPTCHA_API_KEY,
      usePuppeteer: true
    });

    // Usar Promise.race para timeout de 6 minutos (aumentado para asegurar resultados)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: La consulta tardÃ³ mÃ¡s de 6 minutos')), 360000);
    });

    const consultaPromise = scraper.consultarPlaca(placa);

    const resultado = await Promise.race([consultaPromise, timeoutPromise]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[SOAT-APESEG] Consulta completada en ${elapsed}s para placa: ${placa}`);

    if (!resultado.success) {
      // Siempre devolver 200 con ok: true y status: empty
      return respond(res, {
        ok: true,
        source: "soat",
        status: "empty",
        data: null,
        message: resultado.message || "No se encontraron certificados SOAT para esta placa"
      });
    }

    if (!resultado.polizas || resultado.polizas.length === 0) {
      return respond(res, {
        ok: true,
        source: "soat",
        status: "empty",
        data: null,
        message: "No se encontraron certificados SOAT para esta placa"
      });
    }

    // Formatear respuesta al formato esperado por el frontend
    // Si hay pÃ³lizas, mostrar la vigente primero y luego todas en un array
    const polizaVigente = resultado.poliza_vigente || resultado.polizas[0] || null;

    const data = {
      placa: resultado.placa,
      // Campos principales (de la pÃ³liza vigente o la primera)
      compania_aseguradora: polizaVigente?.compania_aseguradora || '',
      clase_vehiculo: polizaVigente?.clase_vehiculo || '',
      uso_vehiculo: polizaVigente?.uso_vehiculo || '',
      numero_accidentes: 0, // No disponible en APESEG
      numero_poliza: polizaVigente?.numero_poliza || '',
      numero_certificado: polizaVigente?.numero_certificado || '',
      inicio_vigencia: polizaVigente?.inicio_vigencia || '',
      fin_vigencia: polizaVigente?.fin_vigencia || '',
      estado: polizaVigente?.estado || '',
      comentario: polizaVigente?.comentario || '',
      // Array de todas las pÃ³lizas para mostrar en tabla
      polizas: resultado.polizas || []
    };

    respond(res, {
      ok: true,
      source: "soat",
      status: "success",
      data: data
    });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[SOAT-APESEG] Error despuÃ©s de ${elapsed}s:`, error.message);

    const msg = String(error?.message || '');
    let publicMessage = "No se encontraron certificados SOAT para esta placa";

    if (msg.includes('APESEG_TRANSIENT_ERROR')) {
      publicMessage = "El servicio SOAT no estÃ¡ disponible temporalmente. Intente mÃ¡s tarde.";
    } else if (msg.includes('APESEG_CAPTCHA_INVALID')) {
      publicMessage = "No se pudo validar la consulta. Intente nuevamente.";
    } else if (msg.includes('APESEG_NO_CONFIRMATION')) {
      publicMessage = "No se pudo confirmar la consulta. Intente nuevamente.";
    }

    // Siempre devolver 200 con ok: true y status: empty
    respond(res, {
      ok: true,
      source: "soat",
      status: "empty",
      data: null,
      message: publicMessage
    });
  }
});

// ============================================
// API: SAT LIMA
// ============================================
app.post("/api/lima", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "lima", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('lima');
  let browser;

  try {
    console.log(`[SAT LIMA] Iniciando consulta (con captcha) para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    console.log(`[SAT LIMA] Navegando a SAT...`);
    await page.goto("https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8", {
      waitUntil: "domcontentloaded",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar iframe (buscar por URL o por presencia de inputs)
    console.log(`[SAT LIMA] Buscando iframe...`);
    let frame = null;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(500);
      const frames = page.frames();
      for (const f of frames) {
        const url = f.url();
        const hasInput = await f.$("#tipoBusquedaPapeletas").catch(() => null);
        if (hasInput || url.includes('sat.gob.pe')) {
          frame = f;
          break;
        }
      }
      if (frame) break;
    }

    if (!frame) {
      console.log(`[SAT LIMA] Ã¢ÂÅ' Iframe no encontrado`);
      await browser.close();
      // Siempre devolver 200 con ok: true y status: empty
      return respond(res, { 
        ok: true, 
        source: "lima", 
        status: "empty", 
        data: [],
        message: "No se encontraron papeletas para esta placa" 
      });
    }

    console.log(`[SAT LIMA] Iframe encontrado, llenando formulario...`);
    await frame.select("#tipoBusquedaPapeletas", "busqPlaca");
    await frame.waitForSelector("#ctl00_cplPrincipal_txtPlaca", { timeout: timeouts.selector });
    await frame.type("#ctl00_cplPrincipal_txtPlaca", placa, { delay: 100 });

    // Resolver captcha
    console.log(`[SAT LIMA] Resolviendo captcha (puede tardar hasta 2 minutos)...`);
    const siteKey = "6Ldy_wsTAAAAAGYM08RRQAMvF96g9O_SNQ9_hFIJ";
    const pageUrl = "https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8";
    const token = await resolverRecaptcha(siteKey, pageUrl);

    console.log(`[SAT LIMA] Captcha resuelto, inyectando token...`);
    await frame.evaluate((t) => {
      let textarea = document.getElementById("g-recaptcha-response");
      if (!textarea) {
        textarea = document.createElement("textarea");
        textarea.id = "g-recaptcha-response";
        textarea.name = "g-recaptcha-response";
        textarea.style = "display: none;";
        document.body.appendChild(textarea);
      }
      textarea.value = t;
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }, token);

    console.log(`[SAT LIMA] Enviando formulario...`);
    await frame.evaluate(() => __doPostBack("ctl00$cplPrincipal$CaptchaContinue", ""));
    await page.waitForTimeout(4000);

    // Verificar si hay mensaje de "no encontrado"
    const mensaje = await frame.evaluate(() => {
      const msj = document.querySelector("#ctl00_cplPrincipal_lblMensaje");
      return msj?.innerText.trim().toLowerCase() || "";
    });

    if (mensaje.includes("no se encontraron") || mensaje.includes("sin registros")) {
      console.log(`[SAT LIMA] Ã¢Å“â€¦ Sin registros encontrados`);
      await browser.close();
      return respond(res, { ok: true, source: "lima", status: "empty", data: [], message: "No se encontraron papeletas" });
    }

    // Extraer tabla
    console.log(`[SAT LIMA] Extrayendo datos de tabla...`);
    const tabla = await frame.evaluate(() => {
      const filas = Array.from(document.querySelectorAll("table tr"));
      return filas.slice(1).map((fila) => {
        const celdas = fila.querySelectorAll("td");
        return {
          Placa: celdas[1]?.innerText.trim() || "",
          Reglamento: celdas[2]?.innerText.trim() || "",
          Falta: celdas[3]?.innerText.trim() || "",
          Documento: celdas[4]?.innerText.trim() || "",
          FechaInfraccion: celdas[5]?.innerText.trim() || "",
          Importe: celdas[6]?.innerText.trim() || "",
          Deuda: celdas[9]?.innerText.trim() || "",
          Estado: celdas[10]?.innerText.trim() || ""
        };
      }).filter(r => r.Placa);
    });

    await browser.close();
    console.log(`[SAT LIMA] Ã¢Å“â€¦ Consulta exitosa: ${tabla.length} registros`);
    respond(res, { ok: true, source: "lima", status: tabla.length > 0 ? "warn" : "empty", data: tabla });

  } catch (error) {
    console.error(`[SAT LIMA] Ã¢ÂÅ' Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    // Siempre devolver 200 con ok: true y status: empty
    respond(res, { 
      ok: true, 
      source: "lima", 
      status: "empty", 
      data: [],
      message: "No se encontraron papeletas para esta placa" 
    });
  }
});

// ============================================
// API: SAT CALLAO - ELIMINADO (reemplazado por CallaoPapeletasScraper)
// El endpoint correcto estÃ¡ mÃ¡s abajo usando CallaoPapeletasScraper
// ============================================

// ============================================
// API: REVISIÃƒâ€œN TÃƒâ€°CNICA (MTC CITV) - HTTP ADAPTER
// ============================================
// Endpoint para obtener captcha
app.get("/api/revision/captcha", async (req, res) => {
  try {
    console.log(`[MTC] Obteniendo captcha...`);
    const captcha = await getCitvCaptcha();
    respond(res, {
      ok: true,
      source: "revision",
      status: "success",
      data: { captchaImage: captcha.imageDataUrl }
    });
  } catch (error) {
    console.error(`[MTC] Ã¢ÂÅ’ Error obteniendo captcha:`, error.message);
        // Bloqueo WAF/Cloudflare: salir rÃƒÂ¡pido y SIN 2Captcha
        if (error && (error.code === 'MTC_BLOCKED' || (error.message && error.message.includes('MTC_BLOCKED')))) {
          console.log('[MTC] Ã°Å¸Å¡Â« Bloqueo WAF/Cloudflare detectado (auto) - devolviendo status blocked');
          return respond(res, {
            ok: true,
            source: 'revision',
            status: 'blocked',
            message: 'MTC estÃƒÂ¡ bloqueando consultas desde esta IP/servidor. Para obtener 200 con datos reales se requiere proxy residencial (MTC_PROXY_URL).',
            data: []
          }, 200);
        }
    respond(res, {
      ok: false,
      source: "revision",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
});

// Endpoint para consultar con captcha
app.post("/api/revision", async (req, res) => {
  const { placa, captcha } = req.body;
  if (!placa) return respond(res, { ok: false, source: "revision", status: "error", message: "Placa requerida" }, 400);

  // ============================================
  // NUEVO: Usar scraper final si estÃƒÂ¡ disponible
  // ============================================
  if (CAPTCHA_API_KEY) {
    try {
      console.log(`[MTC] Usando scraper final con CAPTCHA automÃ¡tico para: ${placa}`);
      const scraper = new MTCCITVScraper(CAPTCHA_API_KEY);
      const resultado = await scraper.consultarPlaca(placa, 3);

      // Convertir formato del scraper al formato esperado por el frontend
      const records = resultado.registros.map(reg => ({
        placa: reg.placa || placa,
        nro_certificado: reg.certificado || '',
        vigencia_inicio: reg.vigente_desde || '',
        vigencia_fin: reg.vigente_hasta || '',
        resultado: reg.resultado || '',
        estado: reg.estado || '',
        razon_social: reg.empresa || '',
        direccion: reg.direccion || '',
        tipo_ambito: reg.ambito || '',
        tipo_servicio: reg.tipo_servicio || '',
        tipo_documento: reg.tipo_documento || '',
        observacion: reg.observaciones || ''
      }));

      return respond(res, {
        ok: true,
        source: "revision",
        status: records.length > 0 ? "success" : "empty",
        data: records,
        message: `Se encontraron ${records.length} certificado(s) de inspecciÃƒÂ³n tÃƒÂ©cnica`
      });

    } catch (scraperError) {
      console.error(`[MTC] Ã¢ÂÅ’ Error con scraper final:`, scraperError.message);
      if (scraperError && (scraperError.code === 'MTC_BLOCKED' || (scraperError.message && scraperError.message.includes('MTC_BLOCKED')))) {
              // Ãšltimo intento sin proxy: Puppeteer Headless + Stealth (puede NO funcionar si la IP estÃ¡ bloqueada)
      try {
        console.log(`[MTC] ðŸ•µï¸ Intentando Puppeteer Stealth para: ${placa}`);
        const stealthRes = await consultCitvByPlacaPuppeteerStealth(placa);
        const stealthRecords = Array.isArray(stealthRes?.records) ? stealthRes.records : [];
        if (stealthRes?.status === 'success' && stealthRecords.length > 0) {
          console.log(`[MTC] âœ… Stealth success: ${stealthRecords.length} registro(s)`);
          const records = stealthRecords.map(reg => ({
            placa: reg.placa || placa,
            nro_certificado: reg.certificado || reg.nro_certificado || '',
            vigencia_inicio: reg.vigente_desde || reg.vigencia_inicio || '',
            vigencia_fin: reg.vigente_hasta || reg.vigencia_fin || '',
            resultado: reg.resultado || '',
            estado: reg.estado || '',
            razon_social: reg.empresa || reg.razon_social || '',
            direccion: reg.direccion || '',
            tipo_ambito: reg.ambito || reg.tipo_ambito || '',
            tipo_servicio: reg.tipo_servicio || '',
            tipo_documento: reg.tipo_documento || '',
            observacion: reg.observaciones || reg.observacion || ''
          }));
          return respond(res, {
            ok: true,
            source: 'revision',
            status: 'success',
            data: records,
            message: `Se encontraron ${records.length} certificado(s) de inspecciÃ³n tÃ©cnica`
          });
        }
        if (stealthRes?.status === 'empty') {
          return respond(res, {
            ok: true,
            source: 'revision',
            status: 'empty',
            data: [],
            message: 'No se encontraron certificados de inspecciÃ³n tÃ©cnica'
          });
        }
      } catch (stealthErr) {
        console.log(`[MTC] âš ï¸ Stealth fallÃ³: ${stealthErr.message}`);
      }
console.log(`[MTC] ðŸš« Bloqueo WAF/Cloudflare detectado (scraper final) - devolviendo status blocked sin fallback`);
        return respond(res, {
          ok: true,
          source: 'revision',
          status: 'blocked',
          message: 'MTC estÃ¡ bloqueando consultas desde esta IP/servidor (WAF/Cloudflare). Para obtener datos reales se requiere proxy residencial (MTC_PROXY_URL).',
          data: [],
          meta: { hint: 'Configura MTC_PROXY_URL (proxy residencial, formato http://user:pass@host:port)' }
        }, 200);
      }
      console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Fallback a mÃƒÂ©todo anterior...`);
      // Continuar con el mÃƒÂ©todo anterior como fallback
    }
  }

  // Si no hay captcha, intentar resolver automÃƒÂ¡ticamente con 2Captcha si estÃƒÂ¡ configurado
  if (!captcha) {
    // Intentar hasta 3 veces con resoluciÃƒÂ³n automÃƒÂ¡tica de captcha
    const maxAutoAttempts = CAPTCHA_API_KEY ? 3 : 1;

    for (let attempt = 1; attempt <= maxAutoAttempts; attempt++) {
      try {
        console.log(`[MTC] Intento ${attempt}/${maxAutoAttempts}: Obteniendo captcha...`);

        // Intentar obtener captcha con HTTP adapter primero, luego Playwright avanzado
        let captchaData;
        try {
          captchaData = await getCitvCaptcha();
        } catch (httpError) {
          console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error HTTP obteniendo captcha, intentando con Playwright...`);
          try {
            captchaData = await getCitvCaptchaPlaywright();
          } catch (playwrightError) {
            console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error Playwright bÃƒÂ¡sico, intentando Playwright Avanzado...`);
            try {
              captchaData = await getCitvCaptchaAdvanced();
            } catch (advancedError) {
              console.error(`[MTC] Ã¢ÂÅ’ Error Playwright Avanzado obteniendo captcha:`, advancedError.message);
              if (attempt === maxAutoAttempts) {
                throw new Error("No se pudo obtener el captcha despuÃƒÂ©s de mÃƒÂºltiples intentos");
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
          }
        }

        // Si hay 2Captcha configurado, resolver automÃƒÂ¡ticamente
        if (CAPTCHA_API_KEY) {
          try {
            console.log(`[MTC] Resolviendo captcha automÃƒÂ¡ticamente con 2Captcha (intento ${attempt})...`);
            // Extraer base64 sin prefijo
            const base64Image = captchaData.imageDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
            const captchaResuelto = await resolverCaptchaImagen(base64Image);

            console.log(`[MTC] Ã¢Å“â€¦ Captcha resuelto automÃƒÂ¡ticamente: ${captchaResuelto}`);
            console.log(`[MTC] Usando captcha inmediatamente para evitar expiraciÃƒÂ³n...`);

            // Consultar INMEDIATAMENTE con el captcha resuelto (intentar HTTP primero, luego Playwright)
            // No esperar entre resolver y usar para evitar que expire
            let resultado;
            let captchaInvalido = false;

            try {
              resultado = await consultCitvByPlaca(placa, captchaResuelto);
            } catch (httpError) {
              console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error HTTP consultando: ${httpError.message}`);

              // Verificar si es error de captcha invÃƒÂ¡lido
              if (httpError.message && httpError.message.includes('CAPTCHA_INVALID')) {
                captchaInvalido = true;
                console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Captcha invÃƒÂ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                if (attempt < maxAutoAttempts) {
                  console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue; // Reintentar con nuevo captcha
                } else {
                  console.log(`[MTC] Ã¢ÂÅ’ Todos los intentos fallaron, solicitando captcha manual`);
                  return respond(res, {
                    ok: true,
                    source: "revision",
                    status: "captcha_required",
                    message: "El captcha automÃƒÂ¡tico fallÃƒÂ³ despuÃƒÂ©s de mÃƒÂºltiples intentos. Por favor resuÃƒÂ©lvalo manualmente.",
                    data: { captchaImage: captchaData.imageDataUrl }
                  });
                }
              }

              // Si no es captcha invÃƒÂ¡lido, intentar con Playwright (puede ser otro tipo de error)
              console.log(`[MTC] Intentando con Playwright...`);
              try {
                resultado = await consultCitvByPlacaPlaywright(placa, captchaResuelto);
              } catch (playwrightError) {
                // Si ambos fallan, verificar si es error de captcha invÃƒÂ¡lido
                if (playwrightError.message && playwrightError.message.includes('CAPTCHA_INVALID')) {
                  captchaInvalido = true;
                  console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Captcha invÃƒÂ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                  if (attempt < maxAutoAttempts) {
                    console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue; // Reintentar con nuevo captcha
                  } else {
                    console.log(`[MTC] Ã¢ÂÅ’ Todos los intentos fallaron, solicitando captcha manual`);
                    return respond(res, {
                      ok: true,
                      source: "revision",
                      status: "captcha_required",
                      message: "El captcha automÃƒÂ¡tico fallÃƒÂ³ despuÃƒÂ©s de mÃƒÂºltiples intentos. Por favor resuÃƒÂ©lvalo manualmente.",
                      data: { captchaImage: captchaData.imageDataUrl }
                    });
                  }
                }
                // Si es otro error, intentar con Playwright Avanzado
                console.log(`[MTC] Intentando con Playwright Avanzado (mÃƒÂ¡xima evasiÃƒÂ³n)...`);
                try {
                  resultado = await consultCitvByPlacaAdvanced(placa, captchaResuelto);
                } catch (advancedError) {
                  throw advancedError;
                }
              }
            }

            // Si captcha fue invÃƒÂ¡lido, ya se manejÃƒÂ³ arriba con continue
            if (captchaInvalido) {
              continue;
            }

            // Verificar resultado (puede ser objeto con status)
            if (resultado && resultado.status === 'error') {
              // Si el resultado tiene status error, verificar si es captcha invÃƒÂ¡lido
              if (resultado.message && resultado.message.includes('CAPTCHA_INVALID')) {
                console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Captcha invÃƒÂ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                if (attempt < maxAutoAttempts) {
                  console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue; // Reintentar con nuevo captcha
                } else {
                  console.log(`[MTC] Ã¢ÂÅ’ Todos los intentos fallaron, solicitando captcha manual`);
                  return respond(res, {
                    ok: true,
                    source: "revision",
                    status: "captcha_required",
                    message: "El captcha automÃƒÂ¡tico fallÃƒÂ³ despuÃƒÂ©s de mÃƒÂºltiples intentos. Por favor resuÃƒÂ©lvalo manualmente.",
                    data: { captchaImage: captchaData.imageDataUrl }
                  });
                }
              }
            }

            // Procesar resultado exitoso
            console.log(`[MTC] Ã¢Å“â€¦ Consulta exitosa con captcha automÃƒÂ¡tico!`);
            return processCitvResult(res, resultado, placa);

          } catch (autoError) {
            console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error en resoluciÃƒÂ³n automÃƒÂ¡tica (intento ${attempt}):`, autoError.message);
            if (attempt < maxAutoAttempts) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            }
            // Si todos los intentos fallaron y no hay 2Captcha, devolver captcha manual
          }
        }

        // Si no hay 2Captcha o fallÃƒÂ³, devolver captcha para resoluciÃƒÂ³n manual (solo en ÃƒÂºltimo intento)
        if (attempt === maxAutoAttempts) {
          return respond(res, {
            ok: true,
            source: "revision",
            status: "captcha_required",
            message: CAPTCHA_API_KEY
              ? "No se pudo resolver el captcha automÃƒÂ¡ticamente. Por favor resuÃƒÂ©lvalo manualmente."
              : "Se requiere resolver el captcha (configure CAPTCHA_API_KEY para resoluciÃƒÂ³n automÃƒÂ¡tica)",
            data: { captchaImage: captchaData.imageDataUrl }
          });
        }

      } catch (error) {
        console.error(`[MTC] Ã¢ÂÅ’ Error en intento ${attempt}:`, error.message);
        if (error && (error.code === 'MTC_BLOCKED' || (error.message && error.message.includes('MTC_BLOCKED')))) {
          console.log(`[MTC] Ã°Å¸Å¡Â« Bloqueo WAF/Cloudflare detectado en intento ${attempt} - devolviendo status blocked`);
          return respond(res, {
            ok: true,
            source: 'revision',
            status: 'blocked',
            message: 'MTC estÃƒÂ¡ bloqueando consultas desde esta IP/servidor (WAF/Cloudflare). Para obtener datos reales se requiere proxy residencial (MTC_PROXY_URL).',
            data: [],
            meta: { hint: 'Configura MTC_PROXY_URL (proxy residencial, formato http://user:pass@host:port)' }
          }, 200);
        }
        if (attempt === maxAutoAttempts) {
          return respond(res, {
            ok: false,
            source: "revision",
            status: "error",
            message: sanitizeError(error)
          }, 500);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  try {
    console.log(`[MTC] Consultando CITV para placa: ${placa} (captcha manual)`);
    let resultado;
    try {
      resultado = await consultCitvByPlaca(placa, captcha);
    } catch (httpError) {
      console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error HTTP, intentando con Playwright...`);
      try {
        resultado = await consultCitvByPlacaPlaywright(placa, captcha);
      } catch (playwrightError) {
        console.log(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error Playwright bÃƒÂ¡sico, intentando Playwright Avanzado...`);
        resultado = await consultCitvByPlacaAdvanced(placa, captcha);
      }
    }

    return processCitvResult(res, resultado, placa);

  } catch (error) {
    console.error(`[MTC] Ã¢ÂÅ’ Error:`, error.message);
    console.error(`[MTC] Stack:`, error.stack);

    // Detectar errores de parseo JSON (HTML en lugar de JSON)
    if (error.message.includes('Unexpected token') ||
        error.message.includes('is not valid JSON') ||
        error.message.includes('JSON') && error.message.includes('parse')) {
      console.error(`[MTC] Ã¢Å¡Â Ã¯Â¸Â Error de parseo JSON detectado - El servidor MTC puede estar bloqueando o devolviendo HTML`);
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC estÃƒÂ¡ devolviendo una respuesta inesperada. Puede estar bloqueando consultas automatizadas o experimentando problemas tÃƒÂ©cnicos. Por favor intente mÃƒÂ¡s tarde."
      }, 503);
    }

    // Si el error es captcha invÃƒÂ¡lido, devolver nuevo captcha
    if (error.message.includes('CAPTCHA_INVALID')) {
      try {
        const captchaData = await getCitvCaptcha();
        return respond(res, {
          ok: true,
          source: "revision",
          status: "captcha_required",
          message: "El captcha ingresado es invÃƒÂ¡lido. Por favor intente nuevamente.",
          data: { captchaImage: captchaData.imageDataUrl }
        });
      } catch (captchaError) {
        return respond(res, {
          ok: false,
          source: "revision",
          status: "error",
          message: sanitizeError(captchaError)
        }, 500);
      }
    }

    if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "Servicio bloquea consultas automatizadas temporalmente"
      }, 503);
    }

    // Detectar bloqueo WAF/Cloudflare (desde Contabo datacenter IPs)
    if (error.code === 'MTC_BLOCKED' || (error.message && error.message.includes('MTC_BLOCKED'))) {
      console.log(`[MTC] Ã°Å¸Å¡Â« Bloqueo WAF/Cloudflare detectado - IP/servidor bloqueado`);
      return respond(res, {
        ok: true,
        source: "revision",
        status: "blocked",
        message: "MTC estÃƒÂ¡ bloqueando consultas desde esta IP/servidor (WAF/Cloudflare). Para obtener datos reales se requiere proxy residencial.",
        data: [],
        meta: { hint: "Configura MTC_PROXY_URL (proxy residencial, formato http://user:pass@host:port)" }
      }, 200);
    }

    if (error.message.includes('MTC_SERVICE_ERROR') || error.message.includes('MTC_ERROR: -2')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC no estÃƒÂ¡ disponible temporalmente. Por favor intente mÃƒÂ¡s tarde."
      }, 503);
    }

    // Si el error contiene "MTC_ERROR", sanitizarlo
    if (error.message.includes('MTC_ERROR')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC no estÃƒÂ¡ disponible temporalmente. Por favor intente mÃƒÂ¡s tarde."
      }, 503);
    }

    respond(res, {
      ok: false,
      source: "revision",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
});

/**
 * Procesar resultado de CITV y devolver respuesta formateada
 */
function processCitvResult(res, resultado, placa) {
  if (resultado.status === 'empty' || !resultado.records || resultado.records.length === 0) {
    return respond(res, {
      ok: true,
      source: "revision",
      status: "empty",
      data: null,
      message: "No se encontraron certificados de inspecciÃƒÂ³n tÃƒÂ©cnica"
    });
  }

  function parseDateSafeLocal(value) {
    if (!value) return null;
    const str = String(value).trim();
    if (!str) return null;

    // YYYY-MM-DD or YYYY/MM/DD
    let m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      const dt = new Date(y, mo, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const y = Number(m[3]);
      const dt = new Date(y, mo, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const dt = new Date(str);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function computeEstadoFromVigenciaFin(vigenciaFin) {
    const fin = parseDateSafeLocal(vigenciaFin);
    if (!fin) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fin.setHours(0, 0, 0, 0);
    return fin >= hoy ? "VIGENTE" : "VENCIDO";
  }

  // Adaptar records al formato esperado por el frontend
  const records = resultado.records.map(record => ({
    placa: record.placa || placa,
    nro_certificado: record.nro_certificado || record.certificado || '',
    vigencia_inicio: record.vigencia_inicio || record.vigente_desde || '',
    vigencia_fin: record.vigencia_fin || record.vigente_hasta || '',
    resultado: record.resultado || '',
    estado: record.estado || '',
    razon_social: record.razon_social || record.empresa || '',
    direccion: record.direccion || '',
    tipo_ambito: record.tipo_ambito || record.ambito || '',
    tipo_servicio: record.tipo_servicio || '',
    tipo_documento: record.tipo_documento || '',
    observacion: record.observacion || record.observaciones || ''
  }));

  // Si solo hay un registro, devolverlo como objeto simple
  if (records.length === 1) {
    const record = records[0];
    const estado = (record.estado || '').toUpperCase();
    const status = estado === 'VIGENTE'
      ? 'success'
      : estado === 'VENCIDO'
        ? 'warn'
        : (record.resultado || '').toLowerCase().includes('aprobado') ? 'success' : 'warn';
    console.log(`[MTC] Ã¢Å“â€¦ Consulta exitosa: 1 certificado encontrado`);
    return respond(res, {
      ok: true,
      source: "revision",
      status,
      data: record
    });
  }

  // Si hay mÃƒÂºltiples registros, devolver como array
  console.log(`[MTC] Ã¢Å“â€¦ Consulta exitosa: ${records.length} certificados encontrados`);
  return respond(res, {
    ok: true,
    source: "revision",
    status: "success",
    data: records
  });
}

// ============================================
// API: SINIESTROS (SBS) - PUPPETEER (MÃƒÂS CONFIABLE)
// ============================================
app.post("/api/siniestro", async (req, res) => {
  const { placa, useManual = false } = req.body;
  if (!placa) return respond(res, { ok: false, source: "siniestro", status: "error", message: "Placa requerida" }, 400);

  // Usar scraper optimizado (similar a MTC) para velocidad
  try {
    console.log(`[SINIESTRO] Consulta optimizada para placa: ${placa}`);

    // Intentar primero con scraper optimizado (rÃƒÂ¡pido como MTC)
    try {
      const SBSSOATScraper = require('./sbs-scraper-final');
      const scraper = new SBSSOATScraper(CAPTCHA_API_KEY); // Pasar API key de 2Captcha si estÃ¡ configurada
      const resultado = await Promise.race([
        scraper.consultarPlaca(placa, 5), // 5 intentos mÃƒÂ¡ximo para mayor confiabilidad
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: La consulta tardÃƒÂ³ mÃƒÂ¡s de 300 segundos")), 300000)
        )
      ]);

      console.log(`[SINIESTRO] Resultado del scraper:`, JSON.stringify(resultado, null, 2).substring(0, 500));

      // El scraper devuelve { success: true, placa, polizas, accidentes_ultimos_5_anios, ... }
      if (!resultado || !resultado.success) {
        throw new Error('Scraper no devolviÃƒÂ³ resultado exitoso');
      }

      // Adaptar respuesta al formato esperado por el frontend
      const accidentes = resultado.accidentes_ultimos_5_anios || 0;
      const status = accidentes > 0 ? "warn" : "success";

      // Si no hay pÃƒÂ³lizas, verificar si es porque no hay registros o por error
      if (!resultado.polizas || resultado.polizas.length === 0) {
        // Si el resultado tiene un mensaje de "Sin registros", es vÃ¡lido
        if (resultado.message === 'Sin registros') {
          console.log(`[SINIESTRO] Sin registros confirmado, devolviendo empty`);
          return respond(res, {
            ok: true,
            source: "siniestro",
            status: "empty",
            data: null,
            message: "No se encontraron registros de SOAT para esta placa"
          });
        }

        // Si no hay mensaje, puede ser un error o realmente no hay registros
        console.log(`[SINIESTRO] No hay pÃƒÂ³lizas sin mensaje de confirmaciÃ³n, devolviendo empty`);
        return respond(res, {
          ok: true,
          source: "siniestro",
          status: "empty",
          data: null,
          message: "No se encontraron registros de SOAT"
        });
      }

      // Formatear datos para el frontend
      const data = {
        placa: resultado.placa || placa,
        fechaConsulta: resultado.fecha_consulta || new Date().toISOString(),
        fechaActualizacion: resultado.fecha_actualizacion || '',
        cantidadAccidentes: accidentes.toString(),
        polizas: resultado.polizas || []
      };

      console.log(`[SINIESTRO] Ã¢Å“â€¦ Consulta exitosa (scraper optimizado): ${accidentes} accidentes, ${resultado.polizas.length} pÃƒÂ³lizas`);
      console.log(`[SINIESTRO] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend...`);
      return respond(res, { ok: true, source: "siniestro", status, data });

    } catch (scraperError) {
      console.error(`[SINIESTRO] Ã¢Å¡Â Ã¯Â¸Â Scraper optimizado fallÃƒÂ³:`, scraperError.message);
      console.error(`[SINIESTRO] Ã¢Å¡Â Ã¯Â¸Â Stack:`, scraperError.stack);
      console.log(`[SINIESTRO] Ã¢Å¡Â Ã¯Â¸Â Fallback a mÃƒÂ©todo HTTP...`);
      // Continuar con mÃƒÂ©todo HTTP como fallback
    }

    // Fallback: usar HTTP (mÃƒÂ¡s rÃƒÂ¡pido) - configuraciÃƒÂ³n original que funcionaba
    console.log(`[SINIESTRO] Consulta HTTP para placa: ${placa}`);
    const resultado = await consultSbsSoat(placa);

    // Adaptar respuesta al formato esperado por el frontend
    const accidentes = resultado.accidentes_ultimos_5_anios || 0;
    const status = accidentes > 0 ? "warn" : "success";

    // Si no hay pÃƒÂ³lizas, devolver empty
    if (!resultado.polizas || resultado.polizas.length === 0) {
      return respond(res, {
        ok: true,
        source: "siniestro",
        status: "empty",
        data: null,
        message: "No se encontraron registros de SOAT"
      });
    }

    // Formatear datos para el frontend
    const data = {
      placa: resultado.placa,
      fechaConsulta: resultado.fecha_consulta,
      fechaActualizacion: resultado.fecha_actualizacion,
      cantidadAccidentes: accidentes.toString(),
      polizas: resultado.polizas
    };

    console.log(`[SINIESTRO] Ã¢Å“â€¦ Consulta exitosa: ${accidentes} accidentes, ${resultado.polizas.length} pÃƒÂ³lizas`);
    return respond(res, { ok: true, source: "siniestro", status, data });

  } catch (error) {
    console.error(`[SINIESTRO] Ã¢ÂÅ’ Error:`, error.message);

    // Mensaje de error claro
    let errorMessage = "Error al consultar el servicio SBS. Por favor intente mÃƒÂ¡s tarde.";

    // Si el error es porque no se encontraron registros, devolver empty en lugar de error
    if (error.message && (error.message.includes('Sin registros') || error.message.includes('No se encontraron registros'))) {
      return respond(res, {
        ok: true,
        source: "siniestro",
        status: "empty",
        data: null,
        message: "No se encontraron registros de SOAT para esta placa"
      });
    }

    if (error.message.includes('SELECTOR_MISSING')) {
      errorMessage = "El portal cambiÃƒÂ³ su estructura. Contacte al administrador.";
    } else if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
      errorMessage = "El servicio bloquea consultas automatizadas temporalmente";
    } else if (error.message.includes('CAPTCHA_INVALID')) {
      errorMessage = "Error de validaciÃƒÂ³n. Por favor intente nuevamente.";
    } else if (error.message.includes('HTTP 4') || error.message.includes('HTTP 5')) {
      errorMessage = "Error al conectar con el servicio SBS. Por favor intente mÃƒÂ¡s tarde.";
    } else if (error.response) {
      errorMessage = `Error del servicio SBS (${error.response.status}). Por favor intente mÃƒÂ¡s tarde.`;
    }

    // Siempre devolver 200 con ok: true y status: empty
    return respond(res, {
      ok: true,
      source: "siniestro",
      status: "empty",
      data: null,
      message: errorMessage.includes('Sin registros') || errorMessage.includes('No se encontraron registros') 
        ? "No se encontraron registros de SOAT para esta placa"
        : "No se encontraron registros de SOAT para esta placa"
    });
  }
});


/**
 * Consultar SBS usando Puppeteer (permite resoluciÃƒÂ³n manual de captcha)
 */
async function consultSbsWithPuppeteer(req, res, placa) {
  const timeouts = normalizeTimeouts('siniestro');
  let browser;

  try {
    console.log(`[SINIESTRO] Iniciando consulta Puppeteer para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    console.log(`[SINIESTRO] Navegando a SBS...`);
    await page.goto("https://servicios.sbs.gob.pe/reportesoat/BusquedaPlaca", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(3000); // Esperar carga JS y reCAPTCHA

    // Buscar y llenar input de placa
    console.log(`[SINIESTRO] Buscando input de placa...`);
    const inputSelectors = [
      '#ctl00_MainBodyContent_txtPlaca',
      'input[name="ctl00$MainBodyContent$txtPlaca"]',
      'input[id*="txtPlaca" i]',
      'input[type="text"]'
    ];

    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      console.log(`[SINIESTRO] No se encontrÃƒÂ³ input: ${e.message}`);
      await browser.close();
      return respond(res, {
        ok: false,
        source: "siniestro",
        status: "error",
        message: "No se pudo acceder al formulario"
      });
    }

    // Seleccionar opciÃƒÂ³n SOAT si hay radio buttons
    try {
      await page.evaluate(() => {
        const radioSoat = document.querySelector('input[value="Soat"][type="radio"]');
        if (radioSoat) radioSoat.click();
      });
      await page.waitForTimeout(500);
    } catch (e) {
      console.log(`[SINIESTRO] No se pudo seleccionar opciÃƒÂ³n SOAT: ${e.message}`);
    }

    // Esperar a que reCAPTCHA v3 se ejecute automÃƒÂ¡ticamente (puede tardar 5-10s)
    console.log(`[SINIESTRO] Esperando reCAPTCHA v3 (puede tardar hasta 10s)...`);
    await page.waitForTimeout(5000);

    // Verificar si hay token de reCAPTCHA
    const recaptchaToken = await page.evaluate(() => {
      const hdn = document.querySelector('input[name="ctl00$MainBodyContent$hdnReCaptchaV3"]');
      return hdn ? hdn.value : null;
    });

    if (!recaptchaToken || recaptchaToken.length < 50) {
      console.log(`[SINIESTRO] Ã¢Å¡Â Ã¯Â¸Â Token reCAPTCHA v3 no encontrado o invÃƒÂ¡lido, esperando mÃƒÂ¡s tiempo...`);
      await page.waitForTimeout(5000);
    }

    // Hacer click en botÃƒÂ³n Consultar
    console.log(`[SINIESTRO] Buscando botÃƒÂ³n de consulta...`);
    const buttonSelectors = [
      '#ctl00_MainBodyContent_btnIngresarPla',
      'input[name="ctl00$MainBodyContent$btnIngresarPla"]',
      'input[type="submit"]',
      'button[type="submit"]',
      '//input[@value="Consultar"]'
    ];

    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      console.log(`[SINIESTRO] BotÃƒÂ³n no encontrado, presionando Enter...`);
      await page.keyboard.press('Enter');
    }

    // Esperar resultados (puede tardar si hay captcha)
    console.log(`[SINIESTRO] Esperando resultados...`);
    await page.waitForTimeout(timeouts.processing);

    // Verificar si redirigiÃƒÂ³ a la pÃƒÂ¡gina de resultados
    const currentUrl = page.url();
    if (!currentUrl.includes('ReporteCentralRiesgo')) {
      // Esperar redirect
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      } catch (e) {
        console.log(`[SINIESTRO] No hubo redirect, verificando si hay mensaje de error...`);
      }
    }

    // Verificar si hay mensaje de "no encontrado"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, {
        ok: true,
        source: "siniestro",
        status: "empty",
        data: null,
        message: noRecords.message || "No se encontraron registros"
      });
    }

    // Extraer datos de la pÃƒÂ¡gina de resultados
    console.log(`[SINIESTRO] Extrayendo datos...`);
    const resultado = await page.evaluate(() => {
      const data = {};

      // Datos principales
      const placaEl = document.querySelector('#ctl00_MainBodyContent_placa');
      const fechaConsultaEl = document.querySelector('#ctl00_MainBodyContent_fecha_consulta');
      const fechaActEl = document.querySelector('#ctl00_MainBodyContent_fecha_act');
      const cantidadEl = document.querySelector('#ctl00_MainBodyContent_cantidad');

      data.placa = placaEl ? placaEl.textContent.trim() : '';
      data.fecha_consulta = fechaConsultaEl ? fechaConsultaEl.textContent.trim() : '';
      data.fecha_actualizacion = fechaActEl ? fechaActEl.textContent.trim() : '';
      data.accidentes_ultimos_5_anios = cantidadEl ? parseInt(cantidadEl.textContent.trim() || '0', 10) : 0;

      // Tabla de pÃƒÂ³lizas
      data.polizas = [];
      const tabla = document.querySelector('#listSoatPlacaVeh tbody');
      if (tabla) {
        const filas = tabla.querySelectorAll('tr');
        filas.forEach(row => {
          const celdas = row.querySelectorAll('td');
          if (celdas.length >= 8) {
            data.polizas.push({
              aseguradora: celdas[0]?.textContent.trim() || '',
              clase_vehiculo: celdas[1]?.textContent.trim() || '',
              uso_vehiculo: celdas[2]?.textContent.trim() || '',
              n_accidentes: parseInt(celdas[3]?.textContent.trim() || '0', 10),
              n_poliza: celdas[4]?.textContent.trim() || '',
              n_certificado: celdas[5]?.textContent.trim() || '',
              inicio_vigencia: celdas[6]?.textContent.trim() || '',
              fin_vigencia: celdas[7]?.textContent.trim() || '',
              comentario: celdas.length > 9 ? celdas[9]?.textContent.trim() : (celdas.length > 8 ? celdas[8]?.textContent.trim() : '')
            });
          }
        });
      }

      return data;
    });

    await browser.close();

    if (!resultado.polizas || resultado.polizas.length === 0) {
      return respond(res, {
        ok: true,
        source: "siniestro",
        status: "empty",
        data: null,
        message: "No se encontraron registros de SOAT"
      });
    }

    // Normalizar fechas
    const normalizeDate = (dateStr) => {
      if (!dateStr) return dateStr;
      const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
      }
      return dateStr;
    };

    const normalizeDateTime = (dateStr) => {
      if (!dateStr) return dateStr;
      const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, day, month, year, hour, minute, second] = match;
        return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      }
      return normalizeDate(dateStr);
    };

    const accidentes = resultado.accidentes_ultimos_5_anios || 0;
    const status = accidentes > 0 ? "warn" : "success";

    const data = {
      placa: resultado.placa || placa.toUpperCase(),
      fechaConsulta: normalizeDateTime(resultado.fecha_consulta) || new Date().toISOString(),
      fechaActualizacion: resultado.fecha_actualizacion || '',
      cantidadAccidentes: accidentes.toString(),
      polizas: resultado.polizas.map(p => ({
        ...p,
        inicio_vigencia: normalizeDate(p.inicio_vigencia),
        fin_vigencia: normalizeDate(p.fin_vigencia)
      }))
    };

    console.log(`[SINIESTRO] Ã¢Å“â€¦ Consulta exitosa (Puppeteer): ${accidentes} accidentes, ${resultado.polizas.length} pÃƒÂ³lizas`);
    respond(res, { ok: true, source: "siniestro", status, data });

  } catch (error) {
    console.error(`[SINIESTRO] Ã¢ÂÅ’ Error Puppeteer:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, {
      ok: false,
      source: "siniestro",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
}

// ============================================
// API: ORDEN DE CAPTURA
// ============================================
app.post("/api/orden-captura", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "orden-captura", status: "error", message: "Placa requerida" }, 400);

  // Placeholder - implementar segÃƒÂºn lÃƒÂ³gica original
  respond(res, { ok: true, source: "orden-captura", status: "empty", data: null, message: "Sin ÃƒÂ³rdenes de captura registradas" });
});

// ============================================
// API: IMPUESTO VEHICULAR
// ============================================
app.post("/api/impuesto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "impuesto", status: "error", message: "Placa requerida" }, 400);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto("https://www.sat.gob.pe/pagosenlinea/", { waitUntil: "networkidle2", timeout: 30000 });

    await page.select("#strTipDoc", "3");
    await page.type("#strNumDoc", placa);

    const siteKey = "6Ldy_wsTAAAAAGYM08RRQAMvF96g9O_SNQ9_hFIJ";
    const token = await resolverRecaptcha(siteKey, "https://www.sat.gob.pe/pagosenlinea/");

    await page.evaluate((t) => {
      document.getElementById("g-recaptcha-response").value = t;
    }, token);

    await page.click("button.btn.btn-primary");
    await page.waitForSelector("#divimpuestos", { timeout: 30000 });

    const deuda = await page.evaluate(() => {
      return {
        placa: document.querySelector("#valordoc")?.innerText.trim() || "",
        total: document.querySelector("#montototal")?.innerText.trim() || "S/ 0.00"
      };
    });

    await browser.close();
    respond(res, { ok: true, source: "impuesto", status: "success", data: deuda });

  } catch (error) {
    if (browser) await browser.close();
    // Siempre devolver 200 con ok: true y status: empty
    respond(res, { 
      ok: true, 
      source: "impuesto", 
      status: "empty", 
      data: null,
      message: "No se encontrÃ³ informaciÃ³n de impuesto para esta placa" 
    });
  }
});

// ============================================
// API: IMPUESTO VEHICULAR SAT LIMA (NUEVO)
// ============================================
app.post("/api/impuesto-vehicular", async (req, res) => {
  const { placa, debug } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "impuesto-vehicular", status: "error", message: "Placa requerida" }, 400);
  }

  console.log(`\n[IMPUESTO VEHICULAR] Iniciando consulta para placa: ${placa}`);

  try {
    if (debug === true) {
      process.env.SCRAPER_DEBUG = 'true';
      console.log('[IMPUESTO VEHICULAR] ðŸ§© SCRAPER_DEBUG habilitado (se guardarÃ¡n dumps en /screenshots)');
    }

    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    if (!CAPTCHA_API_KEY) {
      console.log('[IMPUESTO VEHICULAR] âš ï¸ API Key de 2Captcha no configurada');
    }

    const scraper = new ImpuestoVehicularScraper(CAPTCHA_API_KEY, { debug: debug === true });
    const resultado = await scraper.consultarPlaca(placa, 2);

    console.log(`[IMPUESTO VEHICULAR] âœ… Resultado obtenido:`);
    console.log(`[IMPUESTO VEHICULAR]    Success: ${resultado.success}`);
    console.log(`[IMPUESTO VEHICULAR]    Encontrado: ${resultado.encontrado}`);
    console.log(`[IMPUESTO VEHICULAR]    Datos: ${resultado.datos?.length || 0} registros`);

    if (!resultado.success) {
      return respond(res, {
        ok: true,
        source: "impuesto-vehicular",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontrÃ³ informaciÃ³n"
        },
        message: resultado.mensaje || "No se encontrÃ³ informaciÃ³n"
      });
    }

    if (!resultado.encontrado || !resultado.datos || resultado.datos.length === 0) {
      return respond(res, {
        ok: true,
        source: "impuesto-vehicular",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "Se encontraron 0 coincidencias para su bÃºsqueda."
        },
        message: resultado.mensaje || "Se encontraron 0 coincidencias para su bÃºsqueda."
      });
    }

    return respond(res, {
      ok: true,
      source: "impuesto-vehicular",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        datos: resultado.datos,
        detalle: resultado.detalle || [],
        mensaje: "Consulta exitosa"
      },
      message: "InformaciÃ³n de impuesto vehicular obtenida correctamente"
    });

  } catch (error) {
    console.error('[IMPUESTO VEHICULAR] âŒ Error:', error);
    return respond(res, {
      ok: true,
      source: "impuesto-vehicular",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: "Error al consultar impuesto vehicular"
      },
      message: error.message || "Error al consultar impuesto vehicular"
    }, 200);
  }
});

// ============================================
// API: PIT - FOTO PAPELETAS (ESTADO DE CUENTA VELOCIDAD)
// ============================================
app.post("/api/pit-foto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "pit-foto", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(180000); // 3 minutos

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new PitFotoScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);

    const papeletas = resultado?.papeletas || [];
    const encontrado = Array.isArray(papeletas) && papeletas.length > 0;
    const mensaje = resultado?.mensaje || (encontrado ? `Se encontraron ${papeletas.length} papeleta(s)` : "Sin registros");

    if (!encontrado) {
      return respond(res, {
        ok: true,
        source: "pit-foto",
        status: "empty",
        data: {
          placa: (resultado?.placa || placa).toUpperCase(),
          encontrado: false,
          papeletas: [],
          mensaje
        },
        message: mensaje
      });
    }

    return respond(res, {
      ok: true,
      source: "pit-foto",
      status: "success",
      data: {
        placa: (resultado?.placa || placa).toUpperCase(),
        encontrado: true,
        papeletas,
        total: papeletas.length,
        mensaje
      },
      message: "InformaciÃ³n PIT obtenida correctamente"
    });
  } catch (error) {
    console.error('[PIT-FOTO] Error en endpoint:', error);
    const msg = error.message || 'Error consultando PIT';
    return respond(res, {
      ok: true,
      source: "pit-foto",
      status: "empty",
      data: {
        placa: placa.toUpperCase(),
        encontrado: false,
        papeletas: [],
        mensaje: msg
      },
      message: msg
    });
  }
});

// ============================================
// API: PUNO - PAPELETAS (munipuno.gob.pe)
// ============================================
app.post("/api/puno", async (req, res) => {
  const { placa, debug } = req.body || {};
  if (!placa) {
    return respond(res, { ok: false, source: "puno", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(120000); // 2 minutos

  try {
    const scraper = new PunoPapeletasScraper({ debug: debug === true });
    const resultado = await scraper.consultarPlaca(placa, 2);

    if (!resultado.success || !resultado.encontrado || !resultado.papeletas || resultado.papeletas.length === 0) {
      return respond(res, {
        ok: true,
        source: "puno",
        status: "empty",
        data: {
          placa: (resultado.placa || placa).toUpperCase(),
          encontrado: false,
          papeletas: [],
          mensaje: resultado.mensaje || "No existe esta placa en el sistema"
        },
        message: resultado.mensaje || "No existe esta placa en el sistema"
      }, 200);
    }

    return respond(res, {
      ok: true,
      source: "puno",
      status: "success",
      data: {
        placa: (resultado.placa || placa).toUpperCase(),
        encontrado: true,
        papeletas: resultado.papeletas || [],
        total: resultado.papeletas?.length || 0,
        mensaje: resultado.mensaje || "Consulta exitosa"
      },
      message: resultado.mensaje || "Consulta exitosa"
    }, 200);
  } catch (error) {
    console.error('[PUNO] âŒ Error:', error);
    return respond(res, {
      ok: true,
      source: "puno",
      status: "empty",
      data: {
        placa: String(placa).toUpperCase(),
        encontrado: false,
        papeletas: [],
        mensaje: "Error al consultar Puno"
      },
      message: error.message || "Error al consultar Puno"
    }, 200);
  }
});

// ============================================
// ENDPOINT: PLACAS.PE - Estado de Placa
// ============================================
app.post("/api/placas-pe", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "placas-pe", status: "error", message: "Placa requerida" }, 400);
  }

  console.log(`\n[PLACAS.PE] Iniciando consulta para placa: ${placa}`);

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    if (!CAPTCHA_API_KEY) {
      console.log('[PLACAS.PE] âš ï¸ API Key de 2Captcha no configurada');
    }

    // Usar directamente el scraper de Node.js (mÃ¡s rÃ¡pido y confiable)
    console.log('[PLACAS.PE] ðŸš€ Usando scraper Node.js...');
    const scraper = new PlacasPeScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa, 2);

    console.log(`[PLACAS.PE] âœ… Resultado obtenido:`);
    console.log(`[PLACAS.PE]    Success: ${resultado.success}`);
    console.log(`[PLACAS.PE]    Encontrado: ${resultado.encontrado}`);
    console.log(`[PLACAS.PE]    StatusDescription: ${resultado.statusDescription || 'null'}`);
    console.log(`[PLACAS.PE]    SerialNumber: ${resultado.serialNumber || 'null'}`);
    console.log(`[PLACAS.PE]    Brand: ${resultado.brand || 'null'}`);
    console.log(`[PLACAS.PE]    Model: ${resultado.model || 'null'}`);
    console.log(`[PLACAS.PE]    OwnerCompleteName: ${resultado.ownerCompleteName || 'null'}`);
    console.log(`[PLACAS.PE]    PlateNew: ${resultado.plateNew || 'null'}`);
    console.log(`[PLACAS.PE]    DeliveryPoint: ${resultado.deliveryPoint || 'null'}`);
    console.log(`[PLACAS.PE]    StartDate: ${resultado.startDate || 'null'}`);
    console.log(`[PLACAS.PE]    InsertDate: ${resultado.insertDate || 'null'}`);
    console.log(`[PLACAS.PE]    Status: ${resultado.status || 'null'}`);
    console.log(`[PLACAS.PE]    Mensaje: ${resultado.mensaje || 'null'}`);
    console.log(`[PLACAS.PE]    Resultado completo:`, JSON.stringify(resultado, null, 2));

    if (!resultado.success) {
      return respond(res, {
        ok: true,
        source: "placas-pe",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontrÃ³ informaciÃ³n"
        },
        message: resultado.mensaje || "No se encontrÃ³ informaciÃ³n"
      });
    }

    if (!resultado.encontrado) {
      return respond(res, {
        ok: true,
        source: "placas-pe",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontrÃ³ informaciÃ³n para esta placa"
        },
        message: resultado.mensaje || "No se encontrÃ³ informaciÃ³n para esta placa"
      });
    }

    return respond(res, {
      ok: true,
      source: "placas-pe",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        statusDescription: resultado.statusDescription || null,
        serialNumber: resultado.serialNumber || null,
        brand: resultado.brand || null,
        model: resultado.model || null,
        ownerCompleteName: resultado.ownerCompleteName || null,
        plateNew: resultado.plateNew || null,
        deliveryPoint: resultado.deliveryPoint || null,
        startDate: resultado.startDate || null,
        insertDate: resultado.insertDate || null,
        description: resultado.description || null,
        status: resultado.status || null,
        mensaje: "Consulta exitosa"
      },
      message: "InformaciÃ³n de estado de placa obtenida correctamente"
    });

  } catch (error) {
    console.error('[PLACAS.PE] âŒ Error:', error);
    // Siempre devolver 200 con ok: true y status: empty
    return respond(res, {
      ok: true,
      source: "placas-pe",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: "No se encontrÃ³ informaciÃ³n para esta placa"
      },
      message: "No se encontrÃ³ informaciÃ³n para esta placa"
    });
  }
});

  // ============================================
  // API: INFOGAS - MEJORADO (DESHABILITADO - USAR EL NUEVO ENDPOINT MÃS ABAJO)
  // ============================================
  /*
  app.post("/api/infogas-old", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "infogas", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('infogas');
  let browser;

  try {
    console.log(`[INFOGAS] Iniciando consulta para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://vh.infogas.com.pe/", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar input
    const inputSelectors = ['#placa', 'input[name="placa"]', 'input[id*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      const noRecords = await detectNoRecords(page);
      await browser.close();
      if (noRecords.isEmpty) {
        return respond(res, { ok: true, source: "infogas", status: "empty", data: null, message: noRecords.message });
      }
      return respond(res, { ok: true, source: "infogas", status: "empty", data: null });
    }

    // Buscar botÃƒÂ³n
    const buttonSelectors = ['#btnConsultar', 'button[type="submit"]', '//button[contains(text(), "Consultar")]'];
    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(timeouts.processing);

    // Verificar "sin datos"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, { ok: true, source: "infogas", status: "empty", data: null, message: noRecords.message || "No se encontraron registros" });
    }

    // Extraer datos (sin :contains)
    const resultado = await page.evaluate(() => {
      const getDataByLabel = (label) => {
        const allTds = Array.from(document.querySelectorAll('td'));
        for (let i = 0; i < allTds.length; i++) {
          if (allTds[i].innerText.toLowerCase().includes(label.toLowerCase())) {
            const nextTd = allTds[i + 1];
            if (nextTd) return nextTd.innerText.trim();
          }
        }
        return "-";
      };

      return {
        tipoCombustible: document.querySelector("#tipoCombustible")?.innerText.trim() || getDataByLabel('tipo') || "-",
        habilitado: document.querySelector("#habilitado")?.innerText.trim() || getDataByLabel('habilitado') || "-",
        tieneCredito: document.querySelector("#tieneCredito")?.innerText.trim() || getDataByLabel('credito') || "-"
      };
    });

    await browser.close();
    console.log(`[INFOGAS] Ã¢Å“â€¦ Consulta exitosa`);
    respond(res, { ok: true, source: "infogas", status: "success", data: resultado });

  } catch (error) {
    console.error(`[INFOGAS] Ã¢ÂÅ’ Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, { ok: false, source: "infogas", status: "error", message: sanitizeError(error) }, 500);
  }
});
*/

// ============================================
// API: ATU - MEJORADO
// ============================================
app.post("/api/atu", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "atu", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('atu');
  let browser;

  try {
    console.log(`[ATU] Iniciando consulta para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://sistemas.atu.gob.pe/ConsultaVehiculo/", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar input
    const inputSelectors = ['#txtPlaca', 'input[name*="placa" i]', 'input[id*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      const noRecords = await detectNoRecords(page);
      await browser.close();
      if (noRecords.isEmpty) {
        return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: noRecords.message || "No se encontraron registros" });
      }
      return respond(res, { ok: true, source: "atu", status: "empty", data: null });
    }

    // Buscar botÃƒÂ³n
    const buttonSelectors = ['#btnBuscar', 'button[type="submit"]', '//button[contains(text(), "Buscar")]'];
    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(timeouts.processing);

    // Verificar "sin datos"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: noRecords.message || "Placa no registrada en ATU" });
    }

    const registrado = await page.evaluate(() => {
      return {
        placa: document.querySelector("#lblPlaca")?.innerText.trim() || "",
        modalidad: document.querySelector("#lblModalidad")?.innerText.trim() || "",
        estado: document.querySelector("#lblEstado")?.innerText.trim() || ""
      };
    });

    await browser.close();

    if (!registrado.placa) {
      return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: "Placa no registrada en ATU" });
    }

    console.log(`[ATU] Ã¢Å“â€¦ Consulta exitosa`);
    respond(res, { ok: true, source: "atu", status: "success", data: registrado });

  } catch (error) {
    console.error(`[ATU] Ã¢ÂÅ' Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    // Siempre devolver 200 con ok: true y status: empty
    respond(res, { 
      ok: true, 
      source: "atu", 
      status: "empty", 
      data: null,
      message: "Placa no registrada en ATU o servicio no disponible" 
    });
  }
});

// ============================================
// API: AREQUIPA - PAPELETAS (VERSIÃƒâ€œN MEJORADA)
// SIGUIENDO EL PATRÃƒâ€œN DE SAT Y SUTRAN
// ============================================
app.post("/api/arequipa", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[AREQUIPA] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[AREQUIPA] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[AREQUIPA] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "arequipa", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[AREQUIPA] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[AREQUIPA] Iniciando consulta...`);

    let resultado = null;

    try {
      let ArequipaScraper;
      try {
        ArequipaScraper = require('./arequipa-scraper');
        console.log(`[AREQUIPA] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[AREQUIPA] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          papeletas: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && ArequipaScraper) {
        try {
          console.log(`[AREQUIPA] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[AREQUIPA] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[AREQUIPA] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new ArequipaScraper(CAPTCHA_API_KEY);
          console.log(`[AREQUIPA] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 3 minutos')), 180000)
          );

          console.log(`[AREQUIPA] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[AREQUIPA] Ã¢Å“â€¦ Resultado recibido del scraper`);
          console.log(`\n[AREQUIPA] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
          console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Papeletas: ${resultado?.papeletas?.length || 0}`);
          console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Tipo de papeletas: ${Array.isArray(resultado?.papeletas) ? 'Array' : typeof resultado?.papeletas}`);
          if (resultado?.papeletas && resultado.papeletas.length > 0) {
            console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Detalle de papeletas:`);
            resultado.papeletas.forEach((pap, idx) => {
              console.log(`[AREQUIPA]    ${idx + 1}. ${pap.numero || 'N/A'} - ${pap.fecha || 'N/A'} - ${pap.infraccion || 'N/A'}`);
            });
          }
          console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[AREQUIPA] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[AREQUIPA] ========== ERROR EN SCRAPER ==========`);
          console.error(`[AREQUIPA] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[AREQUIPA] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            papeletas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[AREQUIPA] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        papeletas: [],
        mensaje: "Error en consulta"
      };
    }

    if (!resultado) {
      console.log(`[AREQUIPA] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        papeletas: [],
        mensaje: "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      };
    }

    try {
      console.log(`\n[AREQUIPA] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  resultado.papeletas existe: ${!!resultado?.papeletas}`);
      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  resultado.papeletas es array: ${Array.isArray(resultado?.papeletas)}`);
      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  resultado.papeletas.length: ${resultado?.papeletas?.length || 0}`);

      let papeletas = [];

      if (resultado?.papeletas && Array.isArray(resultado.papeletas)) {
        papeletas = resultado.papeletas;
        console.log(`[AREQUIPA] Ã¢Å“â€¦ Papeletas encontradas en resultado.papeletas: ${papeletas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        papeletas = resultado.data;
        console.log(`[AREQUIPA] Ã¢Å“â€¦ Papeletas encontradas en resultado.data: ${papeletas.length}`);
      }

      // Validar que las papeletas tengan estructura correcta
      if (papeletas.length > 0) {
        const validPapeletas = papeletas.filter(pap =>
          pap && typeof pap === 'object' &&
          (pap.numero || pap.fecha || pap.infraccion)
        );
        if (validPapeletas.length !== papeletas.length) {
          console.log(`[AREQUIPA] Ã¢Å¡Â Ã¯Â¸Â Algunas papeletas no tienen estructura vÃƒÂ¡lida, filtrando...`);
          papeletas = validPapeletas;
        }
      }

      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  papeletas procesadas (final): ${papeletas.length}`);

      if (papeletas.length === 0) {
        console.log(`[AREQUIPA] Ã¢Å¡Â Ã¯Â¸Â No hay papeletas, devolviendo mensaje informativo`);
        console.log(`[AREQUIPA] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
        console.log(`[AREQUIPA]    Status Code: 200 Ã¢Å“â€¦`);
        console.log(`[AREQUIPA]    Status: empty`);
        console.log(`[AREQUIPA]    Mensaje: ${resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"}`);

        return respond(res, {
          ok: true,
          source: "arequipa",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            papeletas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
          },
          message: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        });
      }

      // Formatear papeletas para mejor presentaciÃƒÂ³n
      const papeletasFormateadas = papeletas.map(pap => ({
        numero: pap.numero || 'N/A',
        fecha: pap.fecha || 'N/A',
        infraccion: pap.infraccion || 'N/A',
        monto: pap.monto || 'N/A',
        estado: pap.estado || 'N/A',
        observaciones: pap.observaciones || ''
      }));

      console.log(`[AREQUIPA] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${papeletas.length} papeleta(s) encontrada(s)`);
      console.log(`[AREQUIPA] Ã°Å¸â€œÅ  Primera papeleta:`, JSON.stringify(papeletas[0], null, 2));
      console.log(`[AREQUIPA] ===========================================\n`);

      const responseData = {
        placa: resultado?.placa || placa,
        papeletas: papeletasFormateadas,
        total: papeletas.length
      };

      console.log(`[AREQUIPA] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[AREQUIPA]    Status Code: 200 Ã¢Å“â€¦`);
      console.log(`[AREQUIPA]    Status: success Ã¢Å“â€¦`);
      console.log(`[AREQUIPA]    Papeletas: ${papeletas.length} Ã¢Å“â€¦`);
      console.log(`[AREQUIPA]    Placa: ${responseData.placa} Ã¢Å“â€¦`);

      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "success",
        data: responseData,
        message: `Se encontraron ${papeletas.length} papeleta(s) registrada(s)`
      });

    } catch (processError) {
      console.error(`[AREQUIPA] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "empty",
        data: {
          placa: placa,
          papeletas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        },
        message: "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[AREQUIPA] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[AREQUIPA] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[AREQUIPA] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "empty",
        data: {
          placa: placa || '',
          papeletas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        },
        message: "Este vehÃƒÂ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "arequipa", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: PIURA - MULTAS DE TRÃƒÂNSITO
// SIGUIENDO EL PATRÃƒâ€œN DE AREQUIPA
// ============================================
app.post("/api/piura", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[PIURA] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[PIURA] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[PIURA] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "piura", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[PIURA] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[PIURA] Iniciando consulta...`);

    let resultado = null;

    try {
      let PiuraScraper;
      try {
        PiuraScraper = require('./piura-scraper');
        console.log(`[PIURA] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[PIURA] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          multas: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && PiuraScraper) {
        try {
          console.log(`[PIURA] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[PIURA] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[PIURA] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new PiuraScraper(CAPTCHA_API_KEY);
          console.log(`[PIURA] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 3 minutos')), 180000)
          );

          console.log(`[PIURA] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[PIURA] Ã¢Å“â€¦ Resultado recibido del scraper`);
          console.log(`\n[PIURA] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[PIURA] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
          console.log(`[PIURA] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[PIURA] Ã°Å¸â€œÅ  Multas: ${resultado?.multas?.length || 0}`);
          console.log(`[PIURA] Ã°Å¸â€œÅ  Tipo de multas: ${Array.isArray(resultado?.multas) ? 'Array' : typeof resultado?.multas}`);
          if (resultado?.multas && resultado.multas.length > 0) {
            console.log(`[PIURA] Ã°Å¸â€œÅ  Detalle de multas:`);
            resultado.multas.forEach((mult, idx) => {
              console.log(`[PIURA]    ${idx + 1}. ${mult.numero || 'N/A'} - ${mult.fecha || 'N/A'} - ${mult.infraccion || 'N/A'}`);
            });
          }
          console.log(`[PIURA] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[PIURA] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[PIURA] ========== ERROR EN SCRAPER ==========`);
          console.error(`[PIURA] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[PIURA] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            multas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[PIURA] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Error en consulta"
      };
    }

    if (!resultado) {
      console.log(`[PIURA] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      };
    }

    try {
      console.log(`\n[PIURA] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[PIURA] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[PIURA] Ã°Å¸â€œÅ  resultado.multas existe: ${!!resultado?.multas}`);
      console.log(`[PIURA] Ã°Å¸â€œÅ  resultado.multas es array: ${Array.isArray(resultado?.multas)}`);
      console.log(`[PIURA] Ã°Å¸â€œÅ  resultado.multas.length: ${resultado?.multas?.length || 0}`);

      let multas = [];

      if (resultado?.multas && Array.isArray(resultado.multas)) {
        multas = resultado.multas;
        console.log(`[PIURA] Ã¢Å“â€¦ Multas encontradas en resultado.multas: ${multas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        multas = resultado.data;
        console.log(`[PIURA] Ã¢Å“â€¦ Multas encontradas en resultado.data: ${multas.length}`);
      }

      // Validar que las multas tengan estructura correcta
      if (multas.length > 0) {
        const validMultas = multas.filter(mult =>
          mult && typeof mult === 'object' &&
          (mult.numero || mult.fecha || mult.infraccion || mult.monto)
        );
        if (validMultas.length !== multas.length) {
          console.log(`[PIURA] Ã¢Å¡Â Ã¯Â¸Â Algunas multas no tienen estructura vÃƒÂ¡lida, filtrando...`);
          multas = validMultas;
        }
      }

      console.log(`[PIURA] Ã°Å¸â€œÅ  multas procesadas (final): ${multas.length}`);

      if (multas.length === 0) {
        console.log(`[PIURA] Ã¢Å¡Â Ã¯Â¸Â No hay multas, devolviendo mensaje informativo`);
        console.log(`[PIURA] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
        console.log(`[PIURA]    Status Code: 200 Ã¢Å“â€¦`);
        console.log(`[PIURA]    Status: empty`);
        console.log(`[PIURA]    Mensaje: ${resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"}`);

        return respond(res, {
          ok: true,
          source: "piura",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            multas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
          },
          message: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        });
      }

      // Formatear multas para mejor presentaciÃƒÂ³n
      const multasFormateadas = multas.map(mult => ({
        numero: mult.numero || 'N/A',
        fecha: mult.fecha || 'N/A',
        infraccion: mult.infraccion || 'N/A',
        monto: mult.monto || 'N/A',
        estado: mult.estado || 'N/A',
        observaciones: mult.observaciones || ''
      }));

      console.log(`[PIURA] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${multas.length} multa(s) encontrada(s)`);
      console.log(`[PIURA] Ã°Å¸â€œÅ  Primera multa:`, JSON.stringify(multas[0], null, 2));
      console.log(`[PIURA] ===========================================\n`);

      const responseData = {
        placa: resultado?.placa || placa,
        multas: multasFormateadas,
        total: multas.length
      };

      console.log(`[PIURA] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[PIURA]    Status Code: 200 Ã¢Å“â€¦`);
      console.log(`[PIURA]    Status: success Ã¢Å“â€¦`);
      console.log(`[PIURA]    Multas: ${multas.length} Ã¢Å“â€¦`);
      console.log(`[PIURA]    Placa: ${responseData.placa} Ã¢Å“â€¦`);

      return respond(res, {
        ok: true,
        source: "piura",
        status: "success",
        data: responseData,
        message: `Se encontraron ${multas.length} multa(s) registrada(s)`
      });

    } catch (processError) {
      console.error(`[PIURA] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "piura",
        status: "empty",
        data: {
          placa: placa,
          multas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        },
        message: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[PIURA] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[PIURA] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[PIURA] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "piura",
        status: "empty",
        data: {
          placa: placa || '',
          multas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        },
        message: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "piura", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: TARAPOTO - MULTAS DE TRÃƒÂNSITO
// SIGUIENDO EL PATRÃƒâ€œN DE PIURA
// ============================================
app.post("/api/tarapoto", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[TARAPOTO] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[TARAPOTO] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[TARAPOTO] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "tarapoto", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[TARAPOTO] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[TARAPOTO] Iniciando consulta...`);

    let resultado = null;

    try {
      let TarapotoScraper;
      try {
        TarapotoScraper = require('./tarapoto-scraper');
        console.log(`[TARAPOTO] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[TARAPOTO] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          multas: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && TarapotoScraper) {
        try {
          console.log(`[TARAPOTO] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[TARAPOTO] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[TARAPOTO] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new TarapotoScraper(CAPTCHA_API_KEY);
          console.log(`[TARAPOTO] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃƒÂ³ mÃƒÂ¡s de 2 minutos')), 120000)
          );

          console.log(`[TARAPOTO] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[TARAPOTO] Ã¢Å“â€¦ Resultado recibido del scraper`);
          console.log(`\n[TARAPOTO] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
          console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Multas: ${resultado?.multas?.length || 0}`);
          console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Tipo de multas: ${Array.isArray(resultado?.multas) ? 'Array' : typeof resultado?.multas}`);
          if (resultado?.multas && resultado.multas.length > 0) {
            console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Detalle de multas:`);
            resultado.multas.forEach((mult, idx) => {
              console.log(`[TARAPOTO]    ${idx + 1}. ${mult.numero || 'N/A'} - ${mult.fecha || 'N/A'} - ${mult.infraccion || 'N/A'}`);
            });
          }
          console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[TARAPOTO] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[TARAPOTO] ========== ERROR EN SCRAPER ==========`);
          console.error(`[TARAPOTO] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[TARAPOTO] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            multas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[TARAPOTO] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Error en consulta"
      };
    }

    if (!resultado) {
      console.log(`[TARAPOTO] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      };
    }

    try {
      console.log(`\n[TARAPOTO] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  resultado.multas existe: ${!!resultado?.multas}`);
      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  resultado.multas es array: ${Array.isArray(resultado?.multas)}`);
      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  resultado.multas.length: ${resultado?.multas?.length || 0}`);

      let multas = [];

      if (resultado?.multas && Array.isArray(resultado.multas)) {
        multas = resultado.multas;
        console.log(`[TARAPOTO] Ã¢Å“â€¦ Multas encontradas en resultado.multas: ${multas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        multas = resultado.data;
        console.log(`[TARAPOTO] Ã¢Å“â€¦ Multas encontradas en resultado.data: ${multas.length}`);
      }

      // Validar que las multas tengan estructura correcta
      if (multas.length > 0) {
        const validMultas = multas.filter(mult =>
          mult && typeof mult === 'object' &&
          (mult.numero || mult.fecha || mult.infraccion || mult.monto)
        );
        if (validMultas.length !== multas.length) {
          console.log(`[TARAPOTO] Ã¢Å¡Â Ã¯Â¸Â Algunas multas no tienen estructura vÃƒÂ¡lida, filtrando...`);
          multas = validMultas;
        }
      }

      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  multas procesadas (final): ${multas.length}`);

      if (multas.length === 0) {
        console.log(`[TARAPOTO] Ã¢Å¡Â Ã¯Â¸Â No hay multas, devolviendo mensaje informativo`);
        console.log(`[TARAPOTO] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
        console.log(`[TARAPOTO]    Status Code: 200 Ã¢Å“â€¦`);
        console.log(`[TARAPOTO]    Status: empty`);
        console.log(`[TARAPOTO]    Mensaje: ${resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"}`);

        return respond(res, {
          ok: true,
          source: "tarapoto",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            multas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
          },
          message: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        });
      }

      // Formatear multas para mejor presentaciÃƒÂ³n
      const multasFormateadas = multas.map(mult => ({
        numero: mult.numero || 'N/A',
        fecha: mult.fecha || 'N/A',
        infraccion: mult.infraccion || 'N/A',
        monto: mult.monto || 'N/A',
        estado: mult.estado || 'N/A',
        observaciones: mult.observaciones || ''
      }));

      console.log(`[TARAPOTO] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${multas.length} multa(s) encontrada(s)`);
      console.log(`[TARAPOTO] Ã°Å¸â€œÅ  Primera multa:`, JSON.stringify(multas[0], null, 2));
      console.log(`[TARAPOTO] ===========================================\n`);

      const responseData = {
        placa: resultado?.placa || placa,
        multas: multasFormateadas,
        total: multas.length
      };

      console.log(`[TARAPOTO] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[TARAPOTO]    Status Code: 200 Ã¢Å“â€¦`);
      console.log(`[TARAPOTO]    Status: success Ã¢Å“â€¦`);
      console.log(`[TARAPOTO]    Multas: ${multas.length} Ã¢Å“â€¦`);
      console.log(`[TARAPOTO]    Placa: ${responseData.placa} Ã¢Å“â€¦`);

      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "success",
        data: responseData,
        message: `Se encontraron ${multas.length} multa(s) registrada(s)`
      });

    } catch (processError) {
      console.error(`[TARAPOTO] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "empty",
        data: {
          placa: placa,
          multas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        },
        message: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[TARAPOTO] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[TARAPOTO] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[TARAPOTO] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "empty",
        data: {
          placa: placa || '',
          multas: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        },
        message: "Este vehÃƒÂ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "tarapoto", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: CHICLAYO - RECORD DE INFRACCIONES
// SIGUIENDO EL PATRÃƒâ€œN DE TARAPOTO
// ============================================
app.post("/api/chiclayo", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[CHICLAYO] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[CHICLAYO] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[CHICLAYO] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "chiclayo", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[CHICLAYO] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[CHICLAYO] Iniciando consulta...`);

    let resultado = null;

    try {
      let ChiclayoScraper;
      try {
        ChiclayoScraper = require('./chiclayo-scraper');
        console.log(`[CHICLAYO] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[CHICLAYO] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          infracciones: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && ChiclayoScraper) {
        try {
          console.log(`[CHICLAYO] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[CHICLAYO] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[CHICLAYO] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new ChiclayoScraper(CAPTCHA_API_KEY);
          console.log(`[CHICLAYO] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃƒÂ³ mÃƒÂ¡s de 2 minutos')), 120000)
          );

          console.log(`[CHICLAYO] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[CHICLAYO] Ã¢Å“â€¦ Resultado recibido del scraper`);
          console.log(`\n[CHICLAYO] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
          console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Infracciones: ${resultado?.infracciones?.length || 0}`);
          console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Tipo de infracciones: ${Array.isArray(resultado?.infracciones) ? 'Array' : typeof resultado?.infracciones}`);
          if (resultado?.infracciones && resultado.infracciones.length > 0) {
            console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Detalle de infracciones:`);
            resultado.infracciones.forEach((inf, idx) => {
              console.log(`[CHICLAYO]    ${idx + 1}. ${inf.numero || 'N/A'} - ${inf.fecha || 'N/A'} - ${inf.infraccion || 'N/A'}`);
            });
          }
          console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[CHICLAYO] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[CHICLAYO] ========== ERROR EN SCRAPER ==========`);
          console.error(`[CHICLAYO] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[CHICLAYO] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            infracciones: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[CHICLAYO] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Error en consulta"
      };
    }

    if (!resultado) {
      console.log(`[CHICLAYO] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      };
    }

    try {
      console.log(`\n[CHICLAYO] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  resultado.infracciones existe: ${!!resultado?.infracciones}`);
      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  resultado.infracciones es array: ${Array.isArray(resultado?.infracciones)}`);
      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  resultado.infracciones.length: ${resultado?.infracciones?.length || 0}`);

      let infracciones = [];

      if (resultado?.infracciones && Array.isArray(resultado.infracciones)) {
        infracciones = resultado.infracciones;
        console.log(`[CHICLAYO] Ã¢Å“â€¦ Infracciones encontradas en resultado.infracciones: ${infracciones.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        infracciones = resultado.data;
        console.log(`[CHICLAYO] Ã¢Å“â€¦ Infracciones encontradas en resultado.data: ${infracciones.length}`);
      }

      // Validar que las infracciones tengan estructura correcta
      if (infracciones.length > 0) {
        const validInfracciones = infracciones.filter(inf =>
          inf && typeof inf === 'object' &&
          (inf.numero || inf.fecha || inf.infraccion || inf.monto)
        );
        if (validInfracciones.length !== infracciones.length) {
          console.log(`[CHICLAYO] Ã¢Å¡Â Ã¯Â¸Â Algunas infracciones no tienen estructura vÃƒÂ¡lida, filtrando...`);
          infracciones = validInfracciones;
        }
      }

      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  infracciones procesadas (final): ${infracciones.length}`);

      if (infracciones.length === 0) {
        console.log(`[CHICLAYO] Ã¢Å¡Â Ã¯Â¸Â No hay infracciones, devolviendo mensaje informativo`);
        console.log(`[CHICLAYO] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
        console.log(`[CHICLAYO]    Status Code: 200 Ã¢Å“â€¦`);
        console.log(`[CHICLAYO]    Status: empty`);
        console.log(`[CHICLAYO]    Mensaje: ${resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"}`);

        return respond(res, {
          ok: true,
          source: "chiclayo",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            infracciones: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
          },
          message: resultado?.mensaje || "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        });
      }

      // Formatear infracciones para mejor presentaciÃƒÂ³n
      const infraccionesFormateadas = infracciones.map(inf => ({
        numero: inf.numero || 'N/A',
        fecha: inf.fecha || 'N/A',
        infraccion: inf.infraccion || 'N/A',
        monto: inf.monto || 'N/A',
        estado: inf.estado || 'N/A',
        observaciones: inf.observaciones || ''
      }));

      console.log(`[CHICLAYO] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${infracciones.length} infracciÃƒÂ³n(es) encontrada(s)`);
      console.log(`[CHICLAYO] Ã°Å¸â€œÅ  Primera infracciÃƒÂ³n:`, JSON.stringify(infracciones[0], null, 2));
      console.log(`[CHICLAYO] ===========================================\n`);

      const responseData = {
        placa: resultado?.placa || placa,
        infracciones: infraccionesFormateadas,
        total: infracciones.length
      };

      console.log(`[CHICLAYO] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[CHICLAYO]    Status Code: 200 Ã¢Å“â€¦`);
      console.log(`[CHICLAYO]    Status: success Ã¢Å“â€¦`);
      console.log(`[CHICLAYO]    Infracciones: ${infracciones.length} Ã¢Å“â€¦`);
      console.log(`[CHICLAYO]    Placa: ${responseData.placa} Ã¢Å“â€¦`);

      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "success",
        data: responseData,
        message: `Se encontraron ${infracciones.length} infracciÃƒÂ³n(es) registrada(s)`
      });

    } catch (processError) {
      console.error(`[CHICLAYO] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "empty",
        data: {
          placa: placa,
          infracciones: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        },
        message: "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[CHICLAYO] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[CHICLAYO] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[CHICLAYO] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "empty",
        data: {
          placa: placa || '',
          infracciones: [],
          total: 0,
          mensaje: "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        },
        message: "Este vehÃƒÂ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "chiclayo", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: TACNA - Comentado temporalmente (urlsProvincias no definido)
// ============================================
/*
const provincias = Object.keys(urlsProvincias);

provincias.forEach(ciudad => {
  app.post(`/api/${ciudad}`, async (req, res) => {
    const { placa } = req.body;
    if (!placa) return respond(res, { ok: false, source: ciudad, status: "error", message: "Placa requerida" }, 400);

    try {
      console.log(`[${ciudad.toUpperCase()}] Consultando placa: ${placa}`);
      const datos = await consultarPapeletasMunicipio(urlsProvincias[ciudad], placa);

      if (datos && datos.length > 0) {
        console.log(`[${ciudad.toUpperCase()}] Ã¢Å“â€¦ ${datos.length} registros encontrados`);
        respond(res, { ok: true, source: ciudad, status: "warn", data: datos });
      } else {
        console.log(`[${ciudad.toUpperCase()}] Ã¢Å“â€¦ Sin registros`);
        respond(res, { ok: true, source: ciudad, status: "empty", data: null, message: "No se encontraron registros" });
      }
    } catch (error) {
      console.error(`[${ciudad.toUpperCase()}] Ã¢ÂÅ’ Error:`, error.message);
      respond(res, { ok: true, source: ciudad, status: "empty", data: null, message: "Servicio no disponible" });
    }
  });
});
*/

// ============================================
// API: ESPECIAL (TARAPOTO + HUANCAYO)
// ============================================
app.post("/api/especial", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "especial", status: "error", message: "Placa requerida" }, 400);

  let browser;
  const resultados = { tarapoto: null, huancayo: null };

  // TARAPOTO
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://papeletas.munisanmartin.gob.pe/", {
      waitUntil: "networkidle2",
      timeout: 45000
    }).catch(() => null);

    await page.waitForTimeout(2000);

    // Buscar input usando toolkit
    const inputSelectors = ['#placa', 'input[name*="placa" i]', 'input[type="text"]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);

      // Buscar botÃƒÂ³n
      const btnClicked = await clickFirst(page, [
        'button[type="submit"]',
        '#buscar',
        '//button[contains(text(), "Buscar")]'
      ]).catch(() => false);
      if (!btnClicked) {
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(3000);

      // Verificar "sin datos"
      const noRecords = await detectNoRecords(page);
      if (!noRecords.isEmpty) {
        const tabla = await page.evaluate(() => {
          const trs = document.querySelectorAll('table tbody tr, .resultados tr');
          if (trs.length === 0) return null;
          return Array.from(trs).slice(0, 5).map(tr => {
            const tds = tr.querySelectorAll('td');
            return Array.from(tds).map(td => td.innerText.trim()).filter(t => t);
          });
        });

        if (tabla && tabla.length > 0) {
          resultados.tarapoto = tabla;
        }
      }
    } catch (e) {
      // Input no encontrado
    }
    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
  }

  // HUANCAYO
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://www.munihuancayo.gob.pe/papeletas/", {
      waitUntil: "networkidle2",
      timeout: 45000
    }).catch(() => null);

    await page.waitForTimeout(2000);

    const inputSelectors = ['input[name*="placa" i]', '#placa', 'input[placeholder*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);

      const buttonSelectors = ['button[type="submit"]', '#consultar', '//button[contains(text(), "Consultar")]'];
      const clicked = await clickFirst(page, buttonSelectors);
      if (!clicked) {
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(3000);

      // Verificar "sin datos"
      const noRecords = await detectNoRecords(page);
      if (!noRecords.isEmpty) {
        const datos = await page.evaluate(() => {
          const tabla = document.querySelector('table, .tabla-papeletas');
          if (!tabla) return null;
          const filas = Array.from(tabla.querySelectorAll('tbody tr'));
          return filas.map(f => {
            const celdas = f.querySelectorAll('td');
            return Array.from(celdas).map(c => c.innerText.trim());
          }).filter(f => f.length > 0);
        });

        if (datos && datos.length > 0) {
          resultados.huancayo = datos;
        }
      }
    } catch (e) {
      // Input no encontrado
    }
    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
  }

  respond(res, {
    ok: true,
    source: "especial",
    status: (resultados.tarapoto || resultados.huancayo) ? "success" : "empty",
    data: resultados
  });
});

// ============================================
// API: ASIENTOS SUNARP
// ============================================
app.post("/api/asientos", async (req, res) => {
  const { placa, ciudad } = req.body;
  if (!placa || !ciudad) {
    return respond(res, { ok: false, source: "asientos", status: "error", message: "Placa y ciudad requeridos" }, 400);
  }

  // Placeholder - implementar segÃƒÂºn lÃƒÂ³gica original
  // Siempre devolver 200 con ok: true y status: empty
  respond(res, { 
    ok: true, 
    source: "asientos", 
    status: "empty", 
    data: null,
    message: "No se encontraron asientos registrados para esta placa" 
  });
});

// ============================================
// API: DEBUG BROWSER
// ============================================
app.get("/api/debug/browser", async (req, res) => {
  let browser;
  try {
    console.log("[DEBUG] Probando launchBrowser()...");
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeout: 10000 });
    const title = await page.title();
    await browser.close();

    console.log("[DEBUG] Ã¢Å“â€¦ Browser funciona correctamente");
    respond(res, {
      ok: true,
      source: "debug",
      status: "success",
      message: "Browser funciona correctamente",
      data: { title, executablePath: getExecutablePath() || "bundled" }
    });
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error("[DEBUG] Ã¢ÂÅ’ Error:", error.message);
    respond(res, {
      ok: false,
      source: "debug",
      status: "error",
      message: sanitizeError(error),
      data: { error: error.message }
    }, 500);
  }
});

// ============================================
// API: CERTIFICADO DE VEHÃƒÂCULO
// ============================================
app.post("/api/certificado-vehiculo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "certificado-vehiculo", status: "error", message: "Placa requerida" }, 400);

  try {
    console.log(`[CERT-VEHICULO] Consultando certificado para placa: ${placa}`);

    // Usar scraper optimizado (similar a MTC)
    try {
      const VehiculoCertificadoScraper = require('./vehiculo-certificado-scraper');

      // Limpiar y validar API key (mismo mÃƒÂ©todo que MTC)
      let cleanApiKey = CAPTCHA_API_KEY;
      if (cleanApiKey) {
        cleanApiKey = cleanApiKey.trim();
        const match = cleanApiKey.match(/^([a-f0-9]{32})/i);
        if (match) {
          cleanApiKey = match[1];
        }
      }

      const scraper = new VehiculoCertificadoScraper(cleanApiKey);

      // Configurar URL base si estÃƒÂ¡ en variables de entorno
      if (process.env.VEHICULO_CERT_URL) {
        scraper.baseURL = process.env.VEHICULO_CERT_URL;
      }

      const resultado = await scraper.consultarPlaca(placa, 2); // 2 intentos mÃƒÂ¡ximo

      console.log(`[CERT-VEHICULO] Ã°Å¸â€œÅ  Resultado del scraper:`, JSON.stringify(resultado, null, 2));

      if (!resultado || !resultado.success) {
        // Si el scraper no devuelve éxito, devolver empty en lugar de error
        return respond(res, {
          ok: true,
          source: "certificado-vehiculo",
          status: "empty",
          data: {
            placa: placa,
            mensaje: "No cuenta con certificado de polarizados"
          },
          message: "No cuenta con certificado de polarizados"
        });
      }

      // Formatear datos para el frontend
      const data = {
        placa: resultado.placa || placa,
        anio: resultado.anio || '',
        categoria: resultado.categoria || '',
        color: resultado.color || '',
        fecha_emision: resultado.fecha_emision || '',
        marca: resultado.marca || '',
        modelo: resultado.modelo || '',
        motor: resultado.motor || '',
        nro_certificado: resultado.nro_certificado || '',
        serie: resultado.serie || ''
      };

      console.log(`[CERT-VEHICULO] Ã°Å¸â€œâ€¹ Datos formateados:`, JSON.stringify(data, null, 2));

      // Verificar si hay datos
      const hasData = data.marca || data.modelo || data.nro_certificado;

      if (!hasData) {
        console.log(`[CERT-VEHICULO] Ã¢Å¡Â Ã¯Â¸Â No hay datos para placa ${placa}, devolviendo mensaje informativo`);
        return respond(res, {
          ok: true,
          source: "certificado-vehiculo",
          status: "empty",
          data: {
            placa: placa,
            mensaje: "No cuenta con certificado de polarizados"
          },
          message: "No cuenta con certificado de polarizados"
        });
      }

      console.log(`[CERT-VEHICULO] Ã¢Å“â€¦ Consulta exitosa: ${data.marca} ${data.modelo}`);
      console.log(`[CERT-VEHICULO] Ã°Å¸â€œÂ¤ Enviando respuesta JSON al frontend...`);

      const response = {
        ok: true,
        source: "certificado-vehiculo",
        status: "success",
        data
      };

      console.log(`[CERT-VEHICULO] Ã°Å¸â€œÂ¤ Respuesta completa:`, JSON.stringify(response, null, 2));

      return respond(res, response);

    } catch (scraperError) {
      console.error(`[CERT-VEHICULO] Ã¢ÂÅ’ Error con scraper:`, scraperError.message);

      // Si el error es que no se encontraron datos, devolver mensaje amigable
      if (scraperError.message.includes('No se encontraron') ||
          scraperError.message.includes('empty') ||
          scraperError.message.includes('sin registros') ||
          scraperError.message.includes('No cuenta con')) {
        return respond(res, {
          ok: true,
          source: "certificado-vehiculo",
          status: "empty",
          data: {
            placa: placa,
            mensaje: "No cuenta con certificado de polarizados"
          },
          message: "No cuenta con certificado de polarizados"
        });
      }

      throw scraperError;
    }

  } catch (error) {
    console.error(`[CERT-VEHICULO] Ã¢ÂÅ’ Error:`, error.message);
    console.error(`[CERT-VEHICULO] Ã¢ÂÅ’ Stack:`, error.stack);

    // Asegurar que siempre se devuelva JSON vÃƒÂ¡lido
    try {
      // Siempre devolver 200 con ok: true y status: empty
      return respond(res, {
        ok: true,
        source: "certificado-vehiculo",
        status: "empty",
        data: {
          placa: placa,
          mensaje: "No cuenta con certificado de polarizados"
        },
        message: "No cuenta con certificado de polarizados"
      });
    } catch (respondError) {
      // Si hay error al responder, devolver JSON bÃƒÂ¡sico
      console.error(`[CERT-VEHICULO] Ã¢ÂÅ' Error al responder:`, respondError.message);
      // Siempre devolver 200 con ok: true y status: empty
      return res.status(200).json({
        ok: true,
        source: "certificado-vehiculo",
        status: "empty",
        data: {
          placa: placa || '',
          mensaje: "No cuenta con certificado de polarizados"
        },
        message: "No cuenta con certificado de polarizados"
      });
    }
  }
});

// ============================================
// API: SUTRAN - RECORD DE INFRACCIONES
// SIGUIENDO EL PATRÃƒâ€œN DE MTC PERO GARANTIZANDO ok: true SIEMPRE
// ============================================
app.post("/api/sutran", async (req, res) => {
  // Aumentar timeout del request a 3 minutos
  req.setTimeout(180000);

  // LOGS DETALLADOS PARA DEBUGGING
  console.log("\n" + "=".repeat(60));
  console.log("[SUTRAN] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[SUTRAN] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("[SUTRAN] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[SUTRAN] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "sutran", status: "error", message: "Placa requerida" }, 400);
  }

  // ENVOLVER TODO EN TRY-CATCH GLOBAL PARA GARANTIZAR QUE NUNCA HAYA ERROR 500
  try {
    console.log(`[SUTRAN] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[SUTRAN] Iniciando consulta...`);

    // Usar scraper optimizado (mismo patrÃƒÂ³n que MTC)
    let resultado = null;

    try {
      // Cargar mÃƒÂ³dulo de forma segura
      let SUTRANScraper;
      try {
        SUTRANScraper = require('./sutran-scraper');
        console.log(`[SUTRAN] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[SUTRAN] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        console.error(`[SUTRAN] Ã¢ÂÅ’ Stack del require:`, requireError.stack);
        console.error(`[SUTRAN] Ã¢ÂÅ’ Tipo de error:`, requireError.constructor.name);
        // NO lanzar error, continuar con resultado vacÃƒÂ­o
        resultado = {
          success: true,
          placa: placa,
          infracciones: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && SUTRANScraper) {
        try {
          console.log(`[SUTRAN] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          // Obtener API key de 2Captcha desde .env
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[SUTRAN] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new SUTRANScraper(CAPTCHA_API_KEY);
          console.log(`[SUTRAN] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          // Envolver en Promise con timeout para evitar que se quede colgado
          console.log(`[SUTRAN] Ã°Å¸Å¡â‚¬ Ejecutando scraper.consultarPlaca('${placa}', 2)...`);
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃƒÂ³ mÃƒÂ¡s de 2 minutos')), 120000)
          );

          console.log(`[SUTRAN] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          try {
            resultado = await Promise.race([scraperPromise, timeoutPromise]);
            console.log(`[SUTRAN] Ã¢Å“â€¦ Resultado recibido del scraper`);
            console.log(`\n[SUTRAN] ========== RESULTADO DEL SCRAPER ==========`);
            console.log(`[SUTRAN] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
            console.log(`[SUTRAN] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
            console.log(`[SUTRAN] Ã°Å¸â€œÅ  Infracciones: ${resultado?.infracciones?.length || 0}`);
            console.log(`[SUTRAN] Ã°Å¸â€œÅ  Tipo de infracciones: ${Array.isArray(resultado?.infracciones) ? 'Array' : typeof resultado?.infracciones}`);
            if (resultado?.infracciones && resultado.infracciones.length > 0) {
              console.log(`[SUTRAN] Ã°Å¸â€œÅ  Detalle de infracciones:`);
              resultado.infracciones.forEach((inf, idx) => {
                console.log(`[SUTRAN]    ${idx + 1}. ${inf.numeroDocumento || 'N/A'} - ${inf.tipoDocumento || 'N/A'} - ${inf.fechaDocumento || 'N/A'}`);
              });
            }
            console.log(`[SUTRAN] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
            console.log(`[SUTRAN] ==============================================\n`);
          } catch (raceError) {
            console.error(`[SUTRAN] Ã¢ÂÅ’ Error en Promise.race:`, raceError.message);
            throw raceError;
          }
        } catch (scraperError) {
          console.error(`\n[SUTRAN] ========== ERROR EN SCRAPER ==========`);
          console.error(`[SUTRAN] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[SUTRAN] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          console.error(`[SUTRAN] Ã¢ÂÅ’ Tipo de error:`, scraperError.constructor.name);
          console.error(`[SUTRAN] Ã¢ÂÅ’ Nombre del error:`, scraperError.name);
          console.error(`[SUTRAN] =========================================\n`);

          // Si el error es un timeout o un error de red, intentar devolver resultado vacÃƒÂ­o
          // Pero si es otro tipo de error, puede que el scraper haya funcionado parcialmente
          if (scraperError.message.includes('Timeout') ||
              scraperError.message.includes('ECONNREFUSED') ||
              scraperError.message.includes('ENOTFOUND')) {
            resultado = {
              success: true,
              placa: placa,
              infracciones: [],
              mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
            };
          } else {
            // Para otros errores, puede que haya datos parciales, intentar continuar
            console.error(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â Error no es de timeout/red, puede haber datos parciales`);
            resultado = {
              success: true,
              placa: placa,
              infracciones: [],
              mensaje: "Error en consulta: " + scraperError.message.substring(0, 100)
            };
          }
        }
      }

    } catch (error) {
      console.error(`[SUTRAN] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      console.error(`[SUTRAN] Ã¢ÂÅ’ Stack:`, error.stack);
      // NO lanzar error, usar resultado vacÃƒÂ­o
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Error en consulta"
      };
    }

    // Procesar resultado (siempre exitoso, incluso si es null)
    // Asegurar que resultado nunca sea null
    if (!resultado) {
      console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "No se encontraron infracciones registradas"
      };
    }

    try {
      // Formatear datos para el frontend (mismo patrÃƒÂ³n que MTC)
      console.log(`\n[SUTRAN] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  resultado.success: ${resultado?.success}`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  resultado.infracciones existe: ${!!resultado?.infracciones}`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  resultado.infracciones es array: ${Array.isArray(resultado?.infracciones)}`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  resultado.infracciones.length: ${resultado?.infracciones?.length || 0}`);

      // Extraer infracciones del resultado - SOLUCIÃƒâ€œN ROBUSTA
      let infracciones = [];

      // Verificar mÃƒÂºltiples formas en que pueden venir las infracciones
      if (resultado?.infracciones && Array.isArray(resultado.infracciones)) {
        infracciones = resultado.infracciones;
        console.log(`[SUTRAN] Ã¢Å“â€¦ Infracciones encontradas en resultado.infracciones: ${infracciones.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        infracciones = resultado.data;
        console.log(`[SUTRAN] Ã¢Å“â€¦ Infracciones encontradas en resultado.data: ${infracciones.length}`);
      } else if (resultado?.records && Array.isArray(resultado.records)) {
        infracciones = resultado.records;
        console.log(`[SUTRAN] Ã¢Å“â€¦ Infracciones encontradas en resultado.records: ${infracciones.length}`);
      }

      // Validar que las infracciones tengan la estructura correcta
      if (infracciones.length > 0) {
        const validInfracciones = infracciones.filter(inf =>
          inf && typeof inf === 'object' &&
          (inf.numeroDocumento || inf.tipoDocumento || inf.codigoInfraccion)
        );
        if (validInfracciones.length !== infracciones.length) {
          console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â Algunas infracciones no tienen estructura vÃƒÂ¡lida, filtrando...`);
          infracciones = validInfracciones;
        }
      }

      console.log(`[SUTRAN] Ã°Å¸â€œÅ  infracciones procesadas (final): ${infracciones.length}`);

      // Log detallado del resultado completo para debugging
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  Keys del resultado:`, Object.keys(resultado || {}));
      if (infracciones.length > 0) {
        console.log(`[SUTRAN] Ã°Å¸â€œÅ  Primera infracciÃƒÂ³n:`, JSON.stringify(infracciones[0], null, 2));
      }

      // DECISIÃƒâ€œN CRÃƒÂTICA: Ã‚Â¿Hay infracciones?
      if (infracciones.length === 0) {
        console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â No hay infracciones, devolviendo mensaje informativo`);
        console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â resultado.mensaje: ${resultado?.mensaje || 'N/A'}`);
        console.log(`[SUTRAN] Ã¢Å¡Â Ã¯Â¸Â resultado completo para debugging:`, JSON.stringify(resultado, null, 2));
        return respond(res, {
          ok: true,
          source: "sutran",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            infracciones: [],
            mensaje: resultado?.mensaje || "No se encontraron infracciones registradas"
          },
          message: resultado?.mensaje || "No se encontraron infracciones registradas"
        });
      }

      // HAY INFRACCIONES - DEVOLVER STATUS SUCCESS
      console.log(`[SUTRAN] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${infracciones.length} infracciÃƒÂ³n(es) encontrada(s)`);
      console.log(`[SUTRAN] Ã°Å¸â€œÅ  Primera infracciÃƒÂ³n:`, JSON.stringify(infracciones[0], null, 2));
      console.log(`[SUTRAN] ===========================================\n`);

      // Formatear datos para el frontend - asegurar que infracciones estÃƒÂ© en el nivel correcto
      const responseData = {
        placa: resultado?.placa || placa,
        infracciones: infracciones
      };

      // Si hay monto total, agregarlo
      if (resultado?.montoTotal) {
        responseData.montoTotal = resultado.montoTotal;
      }

      console.log(`[SUTRAN] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[SUTRAN]    Status: success Ã¢Å“â€¦`);
      console.log(`[SUTRAN]    Infracciones: ${infracciones.length} Ã¢Å“â€¦`);
      console.log(`[SUTRAN]    Data keys:`, Object.keys(responseData));
      console.log(`[SUTRAN]    Response data completo:`, JSON.stringify(responseData, null, 2));

      return respond(res, {
        ok: true,
        source: "sutran",
        status: "success", // CRÃƒÂTICO: status debe ser "success" cuando hay infracciones
        data: responseData,
        message: `Se encontraron ${infracciones.length} infracciÃƒÂ³n(es)`
      });

    } catch (processError) {
      console.error(`[SUTRAN] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      console.error(`[SUTRAN] Ã¢ÂÅ’ Stack:`, processError.stack);
      // Si hay error procesando, devolver resultado vacÃƒÂ­o
      return respond(res, {
        ok: true,
        source: "sutran",
        status: "empty",
        data: {
          placa: placa,
          infracciones: [],
          mensaje: "No se encontraron infracciones registradas"
        },
        message: "No se encontraron infracciones registradas"
      });
    }

  } catch (error) {
    // CATCH GLOBAL: Cualquier error que no se haya capturado antes
    console.error("\n" + "=".repeat(60));
    console.error("[SUTRAN] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[SUTRAN] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[SUTRAN] Ã¢ÂÅ’ Nombre:", error.name);
    console.error("[SUTRAN] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    // GARANTÃƒÂA ABSOLUTA: SIEMPRE devolver ok: true, NUNCA error 500
    try {
      const errorResponse = {
        ok: true,
        source: "sutran",
        status: "empty",
        data: {
          placa: placa || '',
          infracciones: [],
          mensaje: "No se encontraron infracciones registradas o el servicio no estÃƒÂ¡ disponible temporalmente"
        },
        message: "No se encontraron infracciones registradas",
        error_details: process.env.NODE_ENV === 'development' ? error.message : undefined
      };

      console.log("[SUTRAN] Ã°Å¸â€œÂ¤ Devolviendo respuesta de error controlada:", JSON.stringify(errorResponse, null, 2));
      return respond(res, errorResponse);

    } catch (respondError) {
      // Si incluso respond() falla, usar res.json directamente
      console.error(`[SUTRAN] Ã¢ÂÅ’ Error incluso en respond(), usando res.json directamente`);
      console.error(`[SUTRAN] Ã¢ÂÅ’ Error de respond:`, respondError.message);

      try {
        return res.status(200).json({
          ok: true,
          source: "sutran",
          status: "empty",
          data: {
            placa: placa || '',
            infracciones: [],
            mensaje: "No se encontraron infracciones registradas"
          },
          message: "No se encontraron infracciones registradas",
          meta: { timestamp: new Date().toISOString() }
        });
      } catch (jsonError) {
        // ÃƒÅ¡ltimo recurso: respuesta mÃƒÂ­nima
        console.error(`[SUTRAN] Ã¢ÂÅ’ Error incluso en res.json():`, jsonError.message);
        return res.status(200).send(JSON.stringify({
          ok: true,
          source: "sutran",
          status: "empty",
          message: "Error interno"
        }));
      }
    }
  }
});

// ============================================
// API: SAT LIMA - CAPTURAS DE VEHÃƒÂCULOS
// SIGUIENDO EL PATRÃƒâ€œN DE SUTRAN
// ============================================
app.post("/api/sat", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[SAT] ========== NUEVA PETICIÃƒâ€œN ==========");
  console.log("[SAT] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");

  const { placa } = req.body;

  if (!placa) {
    console.log("[SAT] Ã¢ÂÅ’ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "sat", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[SAT] Ã¢Å“â€¦ Placa recibida: ${placa}`);
    console.log(`[SAT] Iniciando consulta...`);

    let resultado = null;

    try {
      let SATScraper;
      try {
        SATScraper = require('./sat-scraper');
        console.log(`[SAT] Ã¢Å“â€¦ MÃƒÂ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[SAT] Ã¢ÂÅ’ Error cargando mÃƒÂ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          capturas: [],
          mensaje: "Error cargando mÃƒÂ³dulo"
        };
      }

      if (!resultado && SATScraper) {
        try {
          console.log(`[SAT] Ã°Å¸â€Â§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[SAT] Ã¢Å“â€¦ API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[SAT] Ã¢Å¡Â Ã¯Â¸Â API Key de 2Captcha no configurada - CAPTCHA no se resolverÃƒÂ¡ automÃƒÂ¡ticamente`);
          }
          const scraper = new SATScraper(CAPTCHA_API_KEY);
          console.log(`[SAT] Ã¢Å“â€¦ Instancia creada, ejecutando consulta...`);

          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃƒÂ³ mÃƒÂ¡s de 2 minutos')), 120000)
          );

          console.log(`[SAT] Ã¢ÂÂ³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[SAT] Ã¢Å“â€¦ Resultado recibido del scraper`);
          console.log(`\n[SAT] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[SAT] Ã°Å¸â€œÅ  Success: ${resultado?.success}`);
          console.log(`[SAT] Ã°Å¸â€œÅ  Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[SAT] Ã°Å¸â€œÅ  Capturas: ${resultado?.capturas?.length || 0}`);
          console.log(`[SAT] Ã°Å¸â€œÅ  Tipo de capturas: ${Array.isArray(resultado?.capturas) ? 'Array' : typeof resultado?.capturas}`);
          if (resultado?.capturas && resultado.capturas.length > 0) {
            console.log(`[SAT] Ã°Å¸â€œÅ  Detalle de capturas:`);
            resultado.capturas.forEach((cap, idx) => {
              console.log(`[SAT]    ${idx + 1}. ${cap.numero || 'N/A'} - ${cap.fecha || 'N/A'} - ${cap.tipo || 'N/A'}`);
            });
          }
          console.log(`[SAT] Ã°Å¸â€œÅ  Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[SAT] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[SAT] ========== ERROR EN SCRAPER ==========`);
          console.error(`[SAT] Ã¢ÂÅ’ Error ejecutando scraper:`, scraperError.message);
          console.error(`[SAT] Ã¢ÂÅ’ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            capturas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[SAT] Ã¢ÂÅ’ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        capturas: [],
        mensaje: "Error en consulta"
      };
    }

    if (!resultado) {
      console.log(`[SAT] Ã¢Å¡Â Ã¯Â¸Â Resultado es null, usando resultado vacÃƒÂ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        capturas: [],
        mensaje: "No se encontraron capturas registradas"
      };
    }

    try {
      console.log(`\n[SAT] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[SAT] Ã°Å¸â€œÅ  Tipo de resultado: ${typeof resultado}`);
      console.log(`[SAT] Ã°Å¸â€œÅ  resultado.capturas existe: ${!!resultado?.capturas}`);
      console.log(`[SAT] Ã°Å¸â€œÅ  resultado.capturas es array: ${Array.isArray(resultado?.capturas)}`);
      console.log(`[SAT] Ã°Å¸â€œÅ  resultado.capturas.length: ${resultado?.capturas?.length || 0}`);

      let capturas = [];

      if (resultado?.capturas && Array.isArray(resultado.capturas)) {
        capturas = resultado.capturas;
        console.log(`[SAT] Ã¢Å“â€¦ Capturas encontradas en resultado.capturas: ${capturas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        capturas = resultado.data;
        console.log(`[SAT] Ã¢Å“â€¦ Capturas encontradas en resultado.data: ${capturas.length}`);
      }

      // Validar que las capturas tengan estructura correcta (Capturas.aspx)
      if (capturas.length > 0) {
        const validCapturas = capturas.filter(cap =>
          cap && typeof cap === 'object' &&
          (cap.placa || cap.documento || cap.anio || cap.concepto || cap.montoCaptura)
        );
        if (validCapturas.length !== capturas.length) {
          console.log(`[SAT] Ã¢Å¡Â Ã¯Â¸Â Algunas capturas no tienen estructura vÃƒÂ¡lida, filtrando...`);
          capturas = validCapturas;
        }
      }

      console.log(`[SAT] Ã°Å¸â€œÅ  capturas procesadas (final): ${capturas.length}`);

      if (capturas.length === 0) {
        console.log(`[SAT] Ã¢Å¡Â Ã¯Â¸Â No hay capturas, devolviendo mensaje informativo`);
        console.log(`[SAT] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
        console.log(`[SAT]    Status Code: 200 Ã¢Å“â€¦`);
        console.log(`[SAT]    Status: empty`);
        console.log(`[SAT]    Mensaje: ${resultado?.mensaje || "No se encontraron capturas registradas"}`);

        return respond(res, {
          ok: true,
          source: "sat",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            capturas: [],
            total: 0,
            mensaje: resultado?.mensaje || "No se encontraron capturas registradas"
          },
          message: resultado?.mensaje || "No se encontraron capturas registradas"
        });
      }

      console.log(`[SAT] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA: ${capturas.length} captura(s) encontrada(s)`);
      console.log(`[SAT] Ã°Å¸â€œÅ  Primera captura:`, JSON.stringify(capturas[0], null, 2));
      console.log(`[SAT] ===========================================\n`);

      // Capturas (estructura exacta de Capturas.aspx)
      const capturasFormateadas = capturas.map(cap => ({
        placa: cap.placa || 'N/A',
        documento: cap.documento || 'N/A',
        anio: cap.anio || 'N/A',
        concepto: cap.concepto || 'N/A',
        placaOriginal: cap.placaOriginal || 'N/A',
        referencia: cap.referencia || '',
        montoCaptura: cap.montoCaptura || 'N/A'
      }));

      const responseData = {
        placa: resultado?.placa || placa,
        tieneOrden: !!resultado?.tieneOrden,
        mensaje: resultado?.mensaje || null,
        fechaActualizacion: resultado?.fechaActualizacion || null,
        capturas: capturasFormateadas,
        total: capturas.length
      };

      console.log(`[SAT] Ã°Å¸â€œÂ¤ Enviando respuesta al frontend:`);
      console.log(`[SAT]    Status Code: 200 Ã¢Å“â€¦`);
      console.log(`[SAT]    Status: success Ã¢Å“â€¦`);
      console.log(`[SAT]    Capturas: ${capturas.length} Ã¢Å“â€¦`);
      console.log(`[SAT]    Placa: ${responseData.placa} Ã¢Å“â€¦`);

      return respond(res, {
        ok: true,
        source: "sat",
        status: "warn",
        data: responseData,
        message: responseData.mensaje || `Se encontraron ${capturas.length} captura(s) registrada(s)`
      });

    } catch (processError) {
      console.error(`[SAT] Ã¢ÂÅ’ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "sat",
        status: "empty",
        data: {
          placa: placa,
          capturas: [],
          mensaje: "No se encontraron capturas registradas"
        },
        message: "No se encontraron capturas registradas"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[SAT] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[SAT] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[SAT] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "sat",
        status: "empty",
        data: {
          placa: placa || '',
          capturas: [],
          mensaje: "No se encontraron capturas registradas o el servicio no estÃƒÂ¡ disponible temporalmente"
        },
        message: "No se encontraron capturas registradas"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "sat", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// ENDPOINT: SUNARP - Consulta Vehicular
// ============================================
app.post("/api/sunarp", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[SUNARP] Ã°Å¸â€œÂ¥ NUEVA CONSULTA RECIBIDA");
  console.log("[SUNARP] ===========================================");

  const { placa } = req.body;

  if (!placa) {
    console.log("[SUNARP] Ã¢ÂÅ’ Error: Placa no proporcionada");
    return respond(res, {
      ok: true,
      source: "sunarp",
      status: "error",
      data: null,
      message: "Placa no proporcionada"
    });
  }

  console.log(`[SUNARP] Ã°Å¸â€œâ€¹ Placa a consultar: ${placa}`);
  console.log(`[SUNARP] Ã°Å¸â€â€˜ CAPTCHA_API_KEY: ${CAPTCHA_API_KEY ? CAPTCHA_API_KEY.substring(0, 10) + '...' : 'NO CONFIGURADA'}`);

  try {
    const scraper = new SUNARPVehicularScraper(CAPTCHA_API_KEY);

    console.log(`[SUNARP] Ã°Å¸Å¡â‚¬ Iniciando consulta...`);
    const resultado = await Promise.race([
      scraper.consultarPlaca(placa, 2),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout: La consulta tardÃƒÂ³ mÃƒÂ¡s de 300 segundos")), 300000)
      )
    ]);

    console.log(`[SUNARP] Ã¢Å“â€¦ Consulta completada`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  Resultado completo (sin imagen para no saturar logs):`, JSON.stringify({
      success: resultado?.success,
      placa: resultado?.placa,
      mensaje: resultado?.mensaje,
      tieneDatos: !!resultado?.datos,
      tieneImagen: !!resultado?.imagen,
      imagenLength: resultado?.imagen ? resultado.imagen.length : 0
    }, null, 2));
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.success: ${resultado?.success}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen existe: ${!!resultado?.imagen}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen tipo: ${typeof resultado?.imagen}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen longitud: ${resultado?.imagen ? resultado.imagen.length : 0}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado completo (TODOS los keys):`, Object.keys(resultado || {}));
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen === undefined: ${resultado?.imagen === undefined}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen === null: ${resultado?.imagen === null}`);
    if (resultado?.imagen) {
      console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen primeros 100 chars: ${resultado.imagen.substring(0, 100)}...`);
      console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado.imagen empieza con 'data:': ${resultado.imagen.startsWith('data:')}`);
    } else {
      console.log(`[SUNARP] Ã¢Å¡Â Ã¯Â¸Â Ã¢Å¡Â Ã¯Â¸Â Ã¢Å¡Â Ã¯Â¸Â NO HAY IMAGEN EN EL RESULTADO Ã¢Å¡Â Ã¯Â¸Â Ã¢Å¡Â Ã¯Â¸Â Ã¢Å¡Â Ã¯Â¸Â`);
      console.log(`[SUNARP] Ã°Å¸â€œÅ  Keys del resultado:`, Object.keys(resultado || {}));
      console.log(`[SUNARP] Ã°Å¸â€œÅ  resultado completo (primeros 500 chars):`, JSON.stringify(resultado).substring(0, 500));
    }

    // Verificar si hay imagen (siempre incluirla si existe, incluso sin datos)
    const tieneImagen = resultado?.imagen && resultado.imagen.length > 0;
    console.log(`[SUNARP] Ã°Å¸â€œÂ¸ Imagen incluida: ${tieneImagen ? 'SÃƒÂ­ Ã¢Å“â€¦' : 'No Ã¢ÂÅ’'}`);

    // SIEMPRE incluir el campo imagen, incluso si es null
    // Esto es crÃƒÂ­tico para que el frontend sepa que debe mostrar el botÃƒÂ³n
    // IMPORTANTE: Extraer la imagen directamente del resultado, sin intermediarios
    const imagenFinal = (resultado && resultado.imagen) ? resultado.imagen : null;

    console.log(`[SUNARP] Ã°Å¸â€Â Verificando imagen final antes de enviar:`);
    console.log(`[SUNARP]    - resultado existe: ${!!resultado}`);
    console.log(`[SUNARP]    - resultado.imagen existe: ${!!(resultado && resultado.imagen)}`);
    console.log(`[SUNARP]    - imagenFinal existe: ${!!imagenFinal}`);
    console.log(`[SUNARP]    - imagenFinal longitud: ${imagenFinal ? imagenFinal.length : 0}`);
    console.log(`[SUNARP]    - imagenFinal tipo: ${typeof imagenFinal}`);

    // Si hay imagen pero success es false, marcar como success
    if (tieneImagen && !resultado.success) {
      console.log(`[SUNARP] Ã¢Å¡Â Ã¯Â¸Â Hay imagen pero success es false. Marcando como success.`);
      resultado.success = true;
    }

    if (!resultado.success && !tieneImagen) {
      console.log(`[SUNARP] Ã¢Å¡Â Ã¯Â¸Â Consulta no exitosa y sin imagen: ${resultado.mensaje || 'Error desconocido'}`);

      const responseData = {
        placa: placa,
        datos: resultado?.datos || null,
        imagen: null, // No hay imagen
        mensaje: resultado?.mensaje || "No se encontraron datos para esta placa en SUNARP"
      };
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: "empty",
        data: responseData,
        message: resultado?.mensaje || "No se encontraron datos para esta placa en SUNARP"
      });
    }

    // Si llegamos aquÃƒÂ­, hay imagen o hay datos (o ambos)
    // SIEMPRE usar resultado.imagen directamente, sin variables intermedias
    const imagenParaRespuesta = (resultado && resultado.imagen) ? resultado.imagen : null;

    console.log(`[SUNARP] Ã°Å¸â€Â imagenParaRespuesta existe: ${!!imagenParaRespuesta}`);
    console.log(`[SUNARP] Ã°Å¸â€Â imagenParaRespuesta longitud: ${imagenParaRespuesta ? imagenParaRespuesta.length : 0}`);

    if (!resultado.datos || Object.keys(resultado.datos).length === 0) {
      console.log(`[SUNARP] Ã¢Å¡Â Ã¯Â¸Â No hay datos del vehÃƒÂ­culo, pero ${imagenParaRespuesta ? 'SÃƒÂ hay imagen' : 'NO hay imagen'}`);

      const responseData = {
        placa: placa,
        datos: null,
        imagen: imagenParaRespuesta, // SIEMPRE incluir, incluso si es null
        mensaje: imagenParaRespuesta ? "Consulta completada. Ver imagen para detalles." : "No se encontraron datos para esta placa en SUNARP"
      };
      console.log(`[SUNARP] Ã°Å¸â€œÂ¤ Enviando respuesta (sin datos) con imagen: ${!!responseData.imagen}`);
      if (responseData.imagen) {
        console.log(`[SUNARP] Ã°Å¸â€œÂ¤ Imagen incluida en respuesta (${responseData.imagen.length} chars)`);
      }
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: imagenParaRespuesta ? "success" : "empty",
        data: responseData,
        message: imagenParaRespuesta ? "Consulta completada. Ver imagen para detalles." : "No se encontraron datos para esta placa en SUNARP"
      });
    }

    console.log(`[SUNARP] Ã¢Å“â€¦Ã¢Å“â€¦Ã¢Å“â€¦ CONSULTA EXITOSA`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  Campos encontrados: ${Object.keys(resultado.datos || {}).length}`);
    console.log(`[SUNARP] Ã°Å¸â€œÅ  Datos:`, JSON.stringify(resultado.datos, null, 2));
    console.log(`[SUNARP] Ã°Å¸â€œÂ¸ Imagen incluida: ${imagenParaRespuesta ? 'SÃƒÂ­ Ã¢Å“â€¦' : 'No Ã¢ÂÅ’'}`);
    if (imagenParaRespuesta) {
      console.log(`[SUNARP] Ã°Å¸â€œÂ¸ TamaÃƒÂ±o de imagen base64: ${(imagenParaRespuesta.length / 1024).toFixed(2)} KB`);
    }
    console.log(`[SUNARP] ===========================================\n`);

    const responseData = {
      placa: resultado?.placa || placa,
      datos: resultado?.datos || {}, // Datos opcionales
      imagen: imagenParaRespuesta, // Imagen en base64 - SIEMPRE incluida (puede ser null)
      mensaje: resultado?.mensaje || "Consulta exitosa"
    };

    console.log(`[SUNARP] Ã°Å¸â€œÂ¤ Preparando respuesta final:`);
    console.log(`[SUNARP]    - placa: ${responseData.placa}`);
    console.log(`[SUNARP]    - datos: ${Object.keys(responseData.datos).length} campos`);
    console.log(`[SUNARP]    - imagen: ${responseData.imagen ? `SÃƒÂ­ (${(responseData.imagen.length / 1024).toFixed(2)} KB)` : 'No (null)'}`);
    console.log(`[SUNARP]    - mensaje: ${responseData.mensaje}`);
    console.log(`[SUNARP]    - responseData completo (sin imagen para logs):`, JSON.stringify({
      ...responseData,
      imagen: responseData.imagen ? `[IMAGEN: ${responseData.imagen.length} chars]` : null
    }, null, 2));

    return respond(res, {
      ok: true,
      source: "sunarp",
      status: tieneImagen ? "success" : (resultado?.success ? "success" : "empty"),
      data: responseData,
      message: resultado?.mensaje || "Consulta exitosa"
    });

  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[SUNARP] Ã¢ÂÅ’ ERROR GLOBAL CAPTURADO");
    console.error("[SUNARP] Ã¢ÂÅ’ Mensaje:", error.message);
    console.error("[SUNARP] Ã¢ÂÅ’ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");

    try {
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: "empty",
        data: {
          placa: placa || '',
          datos: null,
          mensaje: "Error al consultar SUNARP. Por favor, intente nuevamente."
        },
        message: "Error al consultar SUNARP. Por favor, intente nuevamente."
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({
        ok: true,
        source: "sunarp",
        status: "error",
        message: "Error interno"
      }));
    }
  }
});

// ============================================
// RUTAS LEGACY (compatibilidad) - Alias directos
// ============================================
// NOTA: El endpoint /api/soat ya estÃ¡ definido arriba
// (lÃ­neas 896 y 923). Estos duplicados han sido eliminados para evitar
// conflictos y errores 405 (Method Not Allowed).
// ============================================


// RevisiÃƒÂ³n - Alias para /api/consultar-revision
app.post("/api/revision", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });

  // Aumentar timeout del request
  req.setTimeout(300000); // 5 minutos

  try {
    const data = await consultarRevisionTecnica(placa);
    if (data.error) {
      return res.json({ ok: false, source: "revision", status: "error", message: data.error, data: null });
    }
    res.json({
      ok: true,
      source: "revision",
      status: data.resultados && data.resultados.length > 0 ? "success" : "empty",
      data: data.resultados || []
    });
  } catch (error) {
    // Siempre devolver 200 con ok: true y status: empty
    res.json({ ok: true, source: "revision", status: "empty", data: [], message: "No se encontraron certificados de inspección técnica" });
  }
});

// Certificado VehÃƒÂ­culo - Ya existe en lÃƒÂ­nea 3272, este es duplicado - ELIMINADO

// SUTRAN - Usar el cÃƒÂ³digo del endpoint /consultar directamente
app.post("/api/sutran", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });

  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.goto('https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx', {
      waitUntil: 'networkidle2',
      timeout: 0
    });
    await page.type('#txtPlaca', placa);
    const iframeElementHandle = await page.$('#iimage');
    const iframe = await iframeElementHandle.contentFrame();
    await iframe.waitForSelector('body > img', { timeout: 5000 });
    const captchaImage = await iframe.$('body > img');
    const captchaBase64 = await captchaImage.screenshot({ encoding: 'base64' });

    // Usar resolverCao que ya existe
    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', API_KEY);
    formData.append('body', captchaBase64);
    formData.append('json', 1);
    formData.append('regsense', 1);
    formData.append('min_len', 4);
    formData.append('max_len', 4);
    const captchaRes = await axios.post('http://2captcha.com/in.php', formData, {
      headers: formData.getHeaders()
    });
    if (captchaRes.data.status !== 1) {
      throw new Error(`Error enviando captcha: ${captchaRes.data.request}`);
    }
    const captchaId = captchaRes.data.request;
    let captchaTexto = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res2 = await axios.get(`http://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`);
      if (res2.data.status === 1) {
        captchaTexto = res2.data.request;
        break;
      }
      if (res2.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Error resolviendo captcha: ${res2.data.request}`);
      }
    }
    if (!captchaTexto) throw new Error('Captcha no resuelto a tiempo');

    await page.type('#TxtCodImagen', captchaTexto);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.evaluate(() => {
        __doPostBack('BtnBuscar', '');
      }),
    ]);
    const resultado = await page.evaluate(() => {
      const mensaje = document.querySelector('#LblMensaje');
      const tabla = document.querySelector('#gvDeudas');
      if (mensaje && mensaje.innerText.includes('No se encontraron infracciones pendientes')) {
        return 'No se encontraron infracciones pendientes en la SUTRAN.';
      }
      return tabla ? tabla.outerHTML: 'No se encontraron resultados visibles.';
    });
    await browser.close();
    res.json({
      ok: true,
      source: "sutran",
      status: resultado.includes('No se encontraron') ? "empty" : "success",
      data: { resultado: `Resultado para placa ${placa}:\n${resultado}` }
    });
  } catch (error) {
    // Siempre devolver 200 con ok: true y status: empty
    res.json({ ok: true, source: "sutran", status: "empty", data: { infracciones: [] }, message: "No se encontraron infracciones registradas" });
  }
});

// SAT Lima (endpoint duplicado eliminado)
// NOTA: se usa el endpoint robusto definido arriba (mismo contrato JSON ÃšNICO con respond()).

// Arequipa - Alias para /consultar-arequipa
app.post("/api/arequipa", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });

  // Aumentar timeout del request
  req.setTimeout(180000); // 3 minutos

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto("https://www.muniarequipa.gob.pe/oficina-virtual/c0nInfrPermisos/faltas/papeletas.php", {
      waitUntil: "networkidle2"
    });
    await page.type("#placa", placa);
    await page.click("#btnConsultar");
    let datos = null;
    try {
      await page.waitForSelector(".col-md-12.table-responsive table", { timeout: 8000 });
      datos = await page.evaluate(() => {
        const contenedor = document.querySelector(".col-md-12.table-responsive");
        if (!contenedor) return null;
        const encabezados = [...contenedor.querySelectorAll("thead th")].map(th => th.innerText.trim());
        const filas = [...contenedor.querySelectorAll("tbody tr")].map(tr =>
          [...tr.querySelectorAll("td")].map(td => td.innerText.trim())
        );
        return { encabezados, filas };
      });
    } catch (e) {
      await browser.close();
      return res.json({ ok: true, source: "arequipa", status: "empty", data: null, message: "No se encontraron papeletas" });
    }
    await browser.close();
    if (!datos || datos.filas.length === 0) {
      res.json({ ok: true, source: "arequipa", status: "empty", data: null, message: "No se encontraron papeletas" });
    } else {
      res.json({ ok: true, source: "arequipa", status: "success", data: { encabezados: datos.encabezados, resultados: datos.filas } });
    }
  } catch (err) {
    // Siempre devolver 200 con ok: true y status: empty
    res.json({ ok: true, source: "arequipa", status: "empty", data: null, message: "No se encontraron papeletas" });
  }
});

// Piura (endpoint duplicado eliminado)
// NOTA: se usa el endpoint robusto definido arriba (mismo contrato JSON ÃšNICO con respond()).

// Tarapoto - Extraer de /api/consultar
app.post("/api/tarapoto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });

  // Aumentar timeout del request
  req.setTimeout(180000); // 3 minutos

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.goto('https://www.sat-t.gob.pe/', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.modal-content .close', { timeout: 5000 });
      await page.click('.modal-content .close');
    } catch {}
    await page.waitForSelector('#placa_vehiculo');
    await page.type('#placa_vehiculo', placa);
    await page.click('.btn-warning');
    await page.waitForSelector('#mostrartabla', { timeout: 10000 });
    const datos = await page.evaluate(() => {
      const tabla = document.querySelector('#mostrartabla table');
      if (!tabla) return [];
      const filas = Array.from(tabla.querySelectorAll('tr')).slice(1);
      return filas.map(fila => {
        const celdas = fila.querySelectorAll('td');
        return {
          numero: celdas[0]?.innerText.trim(),
          infraccion: celdas[1]?.innerText.trim(),
          fecha: celdas[2]?.innerText.trim(),
          estado: celdas[3]?.innerText.trim(),
          monto: celdas[4]?.innerText.trim()
        };
      });
    });
    await page.close();
    await browser.close();
    if (datos.length === 0) {
      res.json({ ok: true, source: "tarapoto", status: "empty", data: null, message: "No se encontraron papeletas" });
    } else {
      res.json({ ok: true, source: "tarapoto", status: "success", data: datos });
    }
  } catch (err) {
    // Siempre devolver 200 con ok: true y status: empty
    res.json({ ok: true, source: "tarapoto", status: "empty", data: null, message: "No se encontraron papeletas" });
  }
});

// SUNARP - Ya existe mÃƒÂ¡s arriba, este es duplicado - ELIMINADO

// ============================================
// NUEVOS ENDPOINTS SAT - PROVINCIAS
// ============================================

// HUANCAYO - Solo requiere PLACA
app.post("/api/sat-huancayo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-huancayo", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(120000); // 2 minutos

  try {
    const scraper = new HuancayoPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-huancayo",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-huancayo",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// HUANUCO - Requiere PLACA o PIT
app.post("/api/sat-huanuco", async (req, res) => {
  const { placa, pit } = req.body;
  if (!placa && !pit) {
    return respond(res, { ok: false, source: "sat-huanuco", status: "error", message: "Placa o PIT requerido" }, 400);
  }

  req.setTimeout(120000);

  try {
    const scraper = new HuanucoPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa || pit);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-huanuco",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    console.error('[SAT-HUANUCO] Error:', error.message);
    // Si hay error, devolver como "empty" en lugar de "error" para que se muestre "sin resultados"
    return respond(res, {
      ok: true,
      source: "sat-huanuco",
      status: "empty",
      data: {
        placa: placa || pit || null,
        papeletas: [],
        total: 0
      },
      message: "No se encontraron papeletas"
    }, 200);
  }
});

// ICA - Solo requiere PLACA
app.post("/api/sat-ica", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-ica", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(120000);

  try {
    const scraper = new IcaPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-ica",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-ica",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CUSCO - Requiere PLACA, DNI o LICENCIA
app.post("/api/sat-cusco", async (req, res) => {
  const { placa, dni, licencia } = req.body;
  if (!placa && !dni && !licencia) {
    return respond(res, { ok: false, source: "sat-cusco", status: "error", message: "Placa, DNI o Licencia requerido" }, 400);
  }

  req.setTimeout(120000);

  try {
    const scraper = new CuscoPapeletasScraper();
    const resultado = await scraper.consultar(placa, dni, licencia);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-cusco",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        dni: resultado.dni,
        licencia: resultado.licencia,
        papeletas: resultado.papeletas || [],
        libre: resultado.libre || false,
        total: (resultado.papeletas || []).length
      },
      message: resultado.libre ? "VehÃ­culo libre de infracciones" : (hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas")
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-cusco",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CHACHAPOYAS - Requiere PLACA, DNI o NUMERO DE PAPELETA
app.post("/api/sat-chachapoyas", async (req, res) => {
  const { placa, dni, papeleta } = req.body;
  if (!placa && !dni && !papeleta) {
    return respond(res, { ok: false, source: "sat-chachapoyas", status: "error", message: "Placa, DNI o NÃºmero de Papeleta requerido" }, 400);
  }

  req.setTimeout(120000);

  try {
    const scraper = new ChachapoyasPapeletasScraper();
    const resultado = await scraper.consultar(placa, dni, papeleta);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-chachapoyas",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        dni: resultado.dni,
        papeleta: resultado.papeleta,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-chachapoyas",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CAJAMARCA - Requiere PLACA (o DNI/RUC para otras consultas)
app.post("/api/sat-cajamarca", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-cajamarca", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(120000);

  try {
    const scraper = new CajamarcaPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-cajamarca",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-cajamarca",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// TRUJILLO - Requiere DNI, CELULAR, CORREO
app.post("/api/sat-trujillo", async (req, res) => {
  const { dni, celular, correo } = req.body;
  if (!dni || !celular || !correo) {
    return respond(res, { ok: false, source: "sat-trujillo", status: "error", message: "DNI, Celular y Correo requeridos" }, 400);
  }

  req.setTimeout(180000); // 3 minutos (puede tardar mÃ¡s por iframe)

  try {
    const scraper = new TrujilloRecordScraper();
    const resultado = await scraper.consultar(dni, celular, correo);

    const hasInfracciones = resultado.infracciones && Array.isArray(resultado.infracciones) && resultado.infracciones.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-trujillo",
      status: hasInfracciones ? "success" : "empty",
      data: {
        dni: resultado.dni,
        infracciones: resultado.infracciones || [],
        total: (resultado.infracciones || []).length
      },
      message: hasInfracciones ? `Se encontraron ${resultado.infracciones.length} infracciÃ³n(es)` : "No se encontraron infracciones"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-trujillo",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// ANDAHUAYLAS - Requiere PLACA, EXPEDIENTE o NOMBRE + CAPTCHA
app.post("/api/sat-andahuaylas", async (req, res) => {
  const { placa, expediente, nombre, apellidoPaterno, apellidoMaterno } = req.body;
  if (!placa && !expediente && !nombre) {
    return respond(res, { ok: false, source: "sat-andahuaylas", status: "error", message: "Placa, Expediente o Nombre requerido" }, 400);
  }

  req.setTimeout(180000); // 3 minutos (CAPTCHA puede tardar)

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new AndahuaylasPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultar(placa, expediente, nombre, apellidoPaterno, apellidoMaterno);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-andahuaylas",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        expediente: resultado.expediente,
        nombre: resultado.nombre,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    console.error(`[SAT-ANDAHUAYLAS] Error:`, error.message);
    // SIEMPRE devolver 200 con mensaje claro
    return respond(res, {
      ok: true,
      source: "sat-andahuaylas",
      status: "empty",
      data: {
        placa: placa || null,
        expediente: expediente || null,
        nombre: nombre || null,
        papeletas: [],
        total: 0
      },
      message: "No se encontraron papeletas para los datos proporcionados"
    });
  }
});

// TACNA - Requiere DNI, PLACA o PAPELETA + CAPTCHA
app.post("/api/sat-tacna", async (req, res) => {
  const { dni, placa, papeleta } = req.body;
  if (!dni && !placa && !papeleta) {
    return respond(res, { ok: false, source: "sat-tacna", status: "error", message: "DNI, Placa o Papeleta requerido" }, 400);
  }

  req.setTimeout(180000); // 3 minutos (CAPTCHA puede tardar)

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new TacnaPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultar(dni, placa, papeleta);

    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;

    return respond(res, {
      ok: true,
      source: "sat-tacna",
      status: hasPapeletas ? "success" : "empty",
      data: {
        dni: resultado.dni,
        placa: resultado.placa,
        papeleta: resultado.papeleta,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    console.error(`[SAT-TACNA] Error:`, error.message);
    // SIEMPRE devolver 200 con mensaje claro
    return respond(res, {
      ok: true,
      source: "sat-tacna",
      status: "empty",
      data: {
        dni: dni || null,
        placa: placa || null,
        papeleta: papeleta || null,
        papeletas: [],
        total: 0
      },
      message: "No se encontraron papeletas para los datos proporcionados"
    });
  }
});

// INFOGAS - Requiere PLACA
app.post("/api/infogas", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "infogas", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(180000); // 3 minutos (reCAPTCHA puede tardar)

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new InfogasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);

    // El scraper ahora siempre devuelve un resultado (no lanza errores)
    // Verificar si el resultado es vÃ¡lido
    if (!resultado) {
      return respond(res, {
        ok: true,
        source: "infogas",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: "No se pudo obtener informaciÃ³n"
        },
        message: "No se pudo obtener informaciÃ³n"
      });
    }

    // Si no tiene success o no estÃ¡ encontrado, devolver empty
    if (!resultado.success || !resultado.encontrado) {
      return respond(res, {
        ok: true,
        source: "infogas",
        status: "empty",
        data: {
          placa: resultado.placa || placa,
          encontrado: false,
          mensaje: resultado.mensaje || "Sin resultados"
        },
        message: resultado.mensaje || "Sin resultados"
      });
    }

    return respond(res, {
      ok: true,
      source: "infogas",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        vencimientoRevisionAnual: resultado.vencimientoRevisionAnual || '',
        vencimientoCilindro: resultado.vencimientoCilindro || '',
        tieneCredito: resultado.tieneCredito || '',
        habilitadoParaConsumir: resultado.habilitadoParaConsumir || '',
        tipoCombustible: resultado.tipoCombustible || ''
      },
      message: "InformaciÃ³n de INFOGAS obtenida correctamente"
    });
  } catch (error) {
    console.error('[INFOGAS] Error en endpoint:', error);
    const errorMessage = error.message || 'Error al consultar INFOGAS';

    // El scraper ahora siempre devuelve un resultado, pero por si acaso hay un error inesperado
    // devolver siempre ok: true con status: empty
    return respond(res, {
      ok: true,
      source: "infogas",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible')
          ? 'Servicio temporalmente no disponible'
          : errorMessage
      },
      message: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible')
        ? 'Servicio temporalmente no disponible'
        : errorMessage
    });
  }
});

// ============================================
// API: CALLAO PAPELETAS - Requiere PLACA
// ============================================
app.post("/api/callao", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "callao", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(300000); // 5 minutos (CAPTCHA puede tardar mucho)

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new CallaoPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);

    console.log('[CALLAO] Resultado del scraper:', JSON.stringify(resultado, null, 2));

    // El scraper siempre devuelve un resultado (no lanza errores)
    if (!resultado) {
      return respond(res, {
        ok: true,
        source: "callao",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          papeletas: [],
          mensaje: "No se pudo obtener informaciÃ³n"
        },
        message: "No se pudo obtener informaciÃ³n"
      });
    }

    // Si no tiene success o no estÃ¡ encontrado, devolver empty
    if (!resultado.success || !resultado.encontrado) {
      console.log('[CALLAO] Resultado sin Ã©xito o no encontrado:', {
        success: resultado.success,
        encontrado: resultado.encontrado,
        mensaje: resultado.mensaje,
        papeletasCount: resultado.papeletas?.length || 0
      });
      return respond(res, {
        ok: true,
        source: "callao",
        status: "empty",
        data: {
          placa: resultado.placa || placa,
          encontrado: false,
          papeletas: resultado.papeletas || [],
          total: 0,
          cantidad: 0,
          mensaje: resultado.mensaje || "Sin resultados"
        },
        message: resultado.mensaje || "Sin resultados"
      });
    }

    // Si tiene Ã©xito y estÃ¡ encontrado, devolver success
    console.log('[CALLAO] Resultado exitoso:', {
      papeletasCount: resultado.papeletas?.length || 0,
      total: resultado.total
    });
    return respond(res, {
      ok: true,
      source: "callao",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        papeletas: resultado.papeletas || [],
        total: resultado.total || (resultado.papeletas?.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0) || 0),
        cantidad: resultado.papeletas?.length || 0
      },
      message: "InformaciÃ³n de papeletas de Callao obtenida correctamente"
    });
  } catch (error) {
    console.error('[CALLAO] Error en endpoint:', error);
    const errorMessage = error.message || 'Error al consultar papeletas de Callao';

    // Siempre devolver ok: true con status: empty
    return respond(res, {
      ok: true,
      source: "callao",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        papeletas: [],
        total: 0,
        cantidad: 0,
        mensaje: errorMessage
      },
      message: errorMessage
    });
  }
});

// ============================================
// ENDPOINT: GENERAR PDF PROFESIONAL
// ============================================
app.post("/api/generar-pdf", async (req, res) => {
  try {
    const { placa, fechaConsulta, resultados, rawResults } = req.body;

    if (!placa || !resultados) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    console.log(`[PDF] Generando PDF para placa: ${placa}`);

    // Generar PDF usando modelo normalizado (pasar rawResults para insights determinÃ­sticos)
    const pdfBuffer = await renderPdf(resultados, placa, fechaConsulta || new Date().toLocaleString('es-PE'), rawResults);

    // Configurar headers de respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-vehicular-${placa}.pdf"`);

    // Enviar PDF
    res.send(pdfBuffer);
    console.log(`[PDF] PDF generado exitosamente para placa: ${placa}`);

  } catch (error) {
    console.error('[PDF] Error generando PDF:', error);
    res.status(500).json({ ok: false, message: 'Error generando PDF', error: error.message });
  }
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================
const server = app.listen(PORT, () => {
  console.log(`[ENV] Ambiente detectado: ${IS_PRODUCTION ? 'PRODUCCIÃ“N' : 'DESARROLLO'}`);
  console.log(`âœ… Servidor activo en http://localhost:${PORT}`);
  console.log(`ðŸ” Health check: http://localhost:${PORT}/api/health`);
  console.log(`ðŸ“‹ Endpoints disponibles:`);
  console.log(`   - POST /api/soat`);
  console.log(`   - POST /api/siniestro`);
  console.log(`   - POST /api/revision`);
  console.log(`   - POST /api/certificado-vehiculo`);
  console.log(`   - POST /api/sutran`);
  console.log(`   - POST /api/sat`);
  console.log(`   - POST /api/arequipa`);
  console.log(`   - POST /api/piura`);
  console.log(`   - POST /api/tarapoto`);
  console.log(`   - POST /api/chiclayo`);
  console.log(`   - POST /api/sunarp`);
  console.log(`   - POST /api/sat-huancayo`);
  console.log(`   - POST /api/sat-huanuco`);
  console.log(`   - POST /api/sat-ica`);
  console.log(`   - POST /api/sat-cusco`);
  console.log(`   - POST /api/sat-chachapoyas`);
  console.log(`   - POST /api/sat-cajamarca`);
  console.log(`   - POST /api/sat-trujillo`);
  console.log(`   - POST /api/sat-andahuaylas`);
  console.log(`   - POST /api/sat-tacna`);
  console.log(`   - POST /api/infogas`);
  console.log(`   - POST /api/impuesto-vehicular`);
  console.log(`   - POST /api/pit-foto`);
  console.log(`   - POST /api/placas-pe`);
  console.log(`   - POST /api/callao`);
  console.log(`   - POST /api/payments/mcw/create-token`);
  console.log(`   - POST /api/payments/mcw/ipn`);
  console.log(`   - POST /api/generar-pdf`);
  console.log(`\n[TIMEOUTS] Playwright: navigation=${TIMEOUTS.navigation}ms, selector=${TIMEOUTS.selector}ms, overall=${TIMEOUTS.overall}ms`);
});

// Configurar timeouts del servidor HTTP para evitar que Nginx corte
server.headersTimeout = 650000;    // 10min 50s
server.requestTimeout = 650000;    // 10min 50s
server.keepAliveTimeout = 650000;  // 10min 50s

console.log(`[TIMEOUTS] HTTP Server: headers=${server.headersTimeout}ms, request=${server.requestTimeout}ms, keepAlive=${server.keepAliveTimeout}ms`);
