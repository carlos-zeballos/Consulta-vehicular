/**
 * Mercado Pago Handler
 * Integración con Mercado Pago SDK
 */

const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configuración desde variables de entorno
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const MERCADOPAGO_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || '';
const BASE_URL = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
const PRICE_CENTS = Number.isFinite(Number(process.env.PRICE_CENTS))
  ? Math.round(Number(process.env.PRICE_CENTS))
  : 1500;

// Inicializar cliente de Mercado Pago
let client = null;
let preference = null;

if (MERCADOPAGO_ACCESS_TOKEN) {
  try {
    client = new MercadoPagoConfig({ accessToken: MERCADOPAGO_ACCESS_TOKEN });
    preference = new Preference(client);
    console.log('[MERCADOPAGO] ✅ Cliente inicializado correctamente');
  } catch (error) {
    console.error('[MERCADOPAGO] ❌ Error inicializando cliente:', error.message);
  }
} else {
  console.warn('[MERCADOPAGO] ⚠️  MERCADOPAGO_ACCESS_TOKEN no configurado');
}

/**
 * Crear preferencia de pago
 */
async function createPreference(email, amount = null) {
  if (!preference) {
    throw new Error('Mercado Pago no está configurado. Verifica MERCADOPAGO_ACCESS_TOKEN en .env');
  }

  const finalAmount = amount || (PRICE_CENTS / 100); // Convertir centavos a soles

  try {
    const preferenceData = {
      body: {
        items: [
          {
            title: 'Informe Vehicular Completo',
            quantity: 1,
            unit_price: finalAmount,
            currency_id: 'PEN'
          }
        ],
        payer: {
          email: email
        },
        back_urls: {
          success: `${BASE_URL}/pago-ok?preference_id={preference_id}`,
          failure: `${BASE_URL}/pago-error?preference_id={preference_id}`,
          pending: `${BASE_URL}/pago-ok?preference_id={preference_id}`
        },
        auto_return: 'approved',
        notification_url: `${BASE_URL}/api/mercadopago/webhook`,
        statement_descriptor: 'CONSULTA VEHICULAR',
        external_reference: `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
    };

    console.log('[MERCADOPAGO] Creando preferencia de pago...');
    const response = await preference.create(preferenceData);

    if (response && response.id) {
      console.log(`[MERCADOPAGO] ✅ Preferencia creada: ${response.id}`);
      
      // Generar orderId para tracking
      const orderId = `MP-${response.id}`;
      
      return {
        success: true,
        preferenceId: response.id,
        orderId: orderId,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point,
        publicKey: MERCADOPAGO_PUBLIC_KEY
      };
    } else {
      throw new Error('No se recibió ID de preferencia de Mercado Pago');
    }
  } catch (error) {
    console.error('[MERCADOPAGO] ❌ Error creando preferencia:', error.message);
    if (error.response) {
      console.error('[MERCADOPAGO] Detalles:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Verificar estado de pago
 */
async function getPaymentStatus(paymentId) {
  if (!client) {
    throw new Error('Mercado Pago no está configurado');
  }

  try {
    const axios = require('axios');
    const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      }
    });

    return {
      id: response.data.id,
      status: response.data.status,
      status_detail: response.data.status_detail,
      transaction_amount: response.data.transaction_amount,
      currency_id: response.data.currency_id,
      date_created: response.data.date_created,
      date_approved: response.data.date_approved,
      payer: response.data.payer
    };
  } catch (error) {
    console.error('[MERCADOPAGO] ❌ Error obteniendo estado de pago:', error.message);
    throw error;
  }
}

module.exports = {
  createPreference,
  getPaymentStatus,
  isConfigured: () => !!preference,
  getPublicKey: () => MERCADOPAGO_PUBLIC_KEY
};
