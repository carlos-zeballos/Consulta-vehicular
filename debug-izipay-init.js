/**
 * Script para debuggear el endpoint /api/izipay/init
 * Ejecutar en el servidor: node debug-izipay-init.js
 */

require('dotenv').config();
const crypto = require('crypto');

// Cargar variables de entorno
const IZIPAY_SITE_ID = process.env.IZIPAY_SITE_ID || "";
const IZIPAY_CTX_MODE = String(process.env.IZIPAY_CTX_MODE || "TEST").toUpperCase();
const IZIPAY_TEST_KEY = process.env.IZIPAY_TEST_KEY || "";
const IZIPAY_PROD_KEY = process.env.IZIPAY_PROD_KEY || "";
const PRICE_CENTS = Number.isFinite(Number(process.env.PRICE_CENTS)) ? Math.round(Number(process.env.PRICE_CENTS)) : 1500;
const CURRENCY_NUM = String(process.env.CURRENCY_NUM || "604");
const BASE_URL = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || "http://localhost:3000";

console.log("═══════════════════════════════════════════════════");
console.log("  DEBUG: CONFIGURACIÓN IZIPAY");
console.log("═══════════════════════════════════════════════════");
console.log("");
console.log(`IZIPAY_SITE_ID: ${IZIPAY_SITE_ID ? '✅ Configurado' : '❌ NO configurado'}`);
console.log(`IZIPAY_CTX_MODE: ${IZIPAY_CTX_MODE}`);
console.log(`IZIPAY_TEST_KEY: ${IZIPAY_TEST_KEY ? '✅ Configurado (' + IZIPAY_TEST_KEY.length + ' caracteres)' : '❌ NO configurado'}`);
console.log(`IZIPAY_PROD_KEY: ${IZIPAY_PROD_KEY ? '✅ Configurado (' + IZIPAY_PROD_KEY.length + ' caracteres)' : '❌ NO configurado'}`);
console.log(`PRICE_CENTS: ${PRICE_CENTS}`);
console.log(`CURRENCY_NUM: ${CURRENCY_NUM}`);
console.log(`BASE_URL: ${BASE_URL}`);
console.log("");

// Función para obtener la llave según el modo
function getIzipayKey(ctxMode) {
  const mode = String(ctxMode || IZIPAY_CTX_MODE || "TEST").toUpperCase();
  return mode === "PRODUCTION" ? IZIPAY_PROD_KEY : IZIPAY_TEST_KEY;
}

const key = getIzipayKey(IZIPAY_CTX_MODE);
console.log(`Llave a usar (${IZIPAY_CTX_MODE}): ${key ? '✅ Presente' : '❌ Ausente'}`);
console.log("");

// Simular generación de orderId y transId
function buildIzipayOrderId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `IZI-${timestamp.toString(36).toUpperCase()}-${random}`;
}

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

function nextIzipayTransId() {
  // Simular contador
  const counter = Math.floor(Math.random() * 1000000);
  return String(counter).padStart(6, "0");
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

// Generar datos de prueba
const orderId = buildIzipayOrderId();
const transDate = formatIzipayUtcDate();
const transId = nextIzipayTransId();
const amount = Math.max(1, Math.round(PRICE_CENTS));

console.log("═══════════════════════════════════════════════════");
console.log("  SIMULACIÓN DE PAGO");
console.log("═══════════════════════════════════════════════════");
console.log(`orderId: ${orderId}`);
console.log(`transId: ${transId}`);
console.log(`transDate: ${transDate}`);
console.log(`amount: ${amount}`);
console.log("");

// Crear campos
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

if (!BASE_URL.includes('localhost')) {
  fields.vads_url_check = `${BASE_URL}/api/izipay/ipn`;
}

const signature = computeIzipaySignature(fields, key);

console.log("═══════════════════════════════════════════════════");
console.log("  CAMPOS GENERADOS");
console.log("═══════════════════════════════════════════════════");
Object.entries(fields).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});
console.log("");
console.log(`signature: ${signature ? '✅ Generada (' + signature.length + ' caracteres)' : '❌ NO generada'}`);
console.log("");

// Verificar que todos los campos requeridos están presentes
const requiredFields = [
  'vads_action_mode',
  'vads_amount',
  'vads_ctx_mode',
  'vads_currency',
  'vads_page_action',
  'vads_payment_config',
  'vads_return_mode',
  'vads_site_id',
  'vads_trans_date',
  'vads_trans_id',
  'vads_version',
  'vads_order_id',
  'vads_url_return',
  'vads_url_success',
  'vads_url_error'
];

console.log("═══════════════════════════════════════════════════");
console.log("  VERIFICACIÓN DE CAMPOS REQUERIDOS");
console.log("═══════════════════════════════════════════════════");
requiredFields.forEach(field => {
  const exists = fields[field] !== undefined && fields[field] !== null && fields[field] !== '';
  console.log(`${field}: ${exists ? '✅' : '❌ AUSENTE'}`);
});

console.log("");
console.log("═══════════════════════════════════════════════════");
console.log("  URL DE PAGO");
console.log("═══════════════════════════════════════════════════");
console.log(`Form Action: https://secure.micuentaweb.pe/vads-payment/`);
console.log("");
console.log("✅ Si todos los campos están ✅, el problema puede ser:");
console.log("   1. TransId duplicado en Izipay");
console.log("   2. Firma incorrecta (verificar llave)");
console.log("   3. Site ID incorrecto");
console.log("   4. Configuración en Back Office de Izipay");
