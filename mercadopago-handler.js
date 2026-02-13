/**
 * Manejador de Mercado Pago
 * Gestiona la creación de preferencias y webhooks
 */

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

class MercadoPagoHandler {
  constructor(accessToken) {
    // Si no se pasa accessToken, intentar desde process.env
    const token = accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!token) {
      console.warn('[MERCADOPAGO] Access Token no configurado');
    }
    
    this.client = new MercadoPagoConfig({ 
      accessToken: token,
      options: {
        timeout: 5000,
        idempotencyKey: 'abc'
      }
    });
    
    this.preference = new Preference(this.client);
    this.payment = new Payment(this.client);
  }

  /**
   * Crear preferencia de pago
   */
  async createPreference({ email, orderId, amount, description }) {
    try {
      const BASE_URL = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      
      const preferenceData = {
        items: [
          {
            title: description || 'Informe Vehicular',
            quantity: 1,
            unit_price: amount / 100, // Mercado Pago usa decimales, nosotros centavos
            currency_id: 'PEN'
          }
        ],
        back_urls: {
          success: `${BASE_URL}/pago-ok?orderId=${encodeURIComponent(orderId)}`,
          failure: `${BASE_URL}/pago-error?orderId=${encodeURIComponent(orderId)}`,
          pending: `${BASE_URL}/pago-ok?orderId=${encodeURIComponent(orderId)}`
        },
        auto_return: 'approved', // Redirigir automáticamente cuando el pago sea aprobado
        external_reference: orderId, // ID de orden para identificar el pago
        notification_url: `${BASE_URL}/api/mercadopago/webhook`, // URL para webhooks
        payer: email ? {
          email: email
        } : undefined
      };

      console.log(`[MERCADOPAGO] Creando preferencia para orderId=${orderId}, amount=${amount}`);
      
      const preference = await this.preference.create({ body: preferenceData });
      
      console.log(`[MERCADOPAGO] Preferencia creada: ${preference.id}`);
      
      return {
        success: true,
        preferenceId: preference.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point
      };
    } catch (error) {
      console.error('[MERCADOPAGO] Error creando preferencia:', error);
      throw error;
    }
  }

  /**
   * Verificar estado de un pago
   */
  async getPaymentStatus(paymentId) {
    try {
      const payment = await this.payment.get({ id: paymentId });
      
      return {
        id: payment.id,
        status: payment.status,
        statusDetail: payment.status_detail,
        externalReference: payment.external_reference,
        transactionAmount: payment.transaction_amount,
        dateCreated: payment.date_created,
        dateApproved: payment.date_approved
      };
    } catch (error) {
      console.error('[MERCADOPAGO] Error obteniendo estado del pago:', error);
      throw error;
    }
  }

  /**
   * Procesar webhook de Mercado Pago
   */
  async processWebhook(data) {
    try {
      const { type, data: webhookData } = data;
      
      if (type === 'payment') {
        const paymentId = webhookData.id;
        console.log(`[MERCADOPAGO] Webhook recibido - payment_id=${paymentId}`);
        
        const paymentInfo = await this.getPaymentStatus(paymentId);
        
        return {
          success: true,
          paymentId: paymentInfo.id,
          status: paymentInfo.status,
          statusDetail: paymentInfo.statusDetail,
          externalReference: paymentInfo.externalReference,
          amount: paymentInfo.transactionAmount
        };
      }
      
      return { success: false, message: 'Tipo de webhook no manejado' };
    } catch (error) {
      console.error('[MERCADOPAGO] Error procesando webhook:', error);
      throw error;
    }
  }
}

module.exports = MercadoPagoHandler;
