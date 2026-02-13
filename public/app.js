(() => {
  const form = document.getElementById('comprar-form');
  const statusBox = document.getElementById('status');
  if (!form || !statusBox) return;

  const setStatus = (message, type) => {
    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
  };

  const buildAndSubmitForm = (formAction, fields) => {
    const formEl = document.createElement('form');
    formEl.method = 'POST';
    formEl.action = formAction;

    Object.entries(fields || {}).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value == null ? '' : String(value);
      formEl.appendChild(input);
    });

    document.body.appendChild(formEl);
    formEl.submit();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById('email');
    const email = emailInput && emailInput.value ? emailInput.value.trim() : '';

    setStatus('Preparando tu pago seguro...', 'info');

    try {
      const response = await fetch('/api/izipay/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {})
      });

      const payload = await response.json();
      
      // Debug: mostrar respuesta en consola
      console.log('[IZIPAY] Respuesta del servidor:', payload);
      
      if (!response.ok || !payload?.formAction || !payload?.fields) {
        console.error('[IZIPAY] Respuesta inválida:', payload);
        throw new Error(payload?.message || 'No se pudo iniciar el pago');
      }

      // Verificar que los campos críticos estén presentes
      const requiredFields = ['vads_site_id', 'vads_trans_id', 'vads_order_id', 'signature'];
      const missingFields = requiredFields.filter(field => !payload.fields[field]);
      
      if (missingFields.length > 0) {
        console.error('[IZIPAY] Campos faltantes:', missingFields);
        throw new Error(`Campos faltantes en la respuesta: ${missingFields.join(', ')}`);
      }

      const orderId = payload?.fields?.vads_order_id;
      if (orderId) {
        try {
          localStorage.setItem('izipay_last_order_id', String(orderId));
        } catch (_) {}
      }

      console.log('[IZIPAY] Redirigiendo a Izipay con orderId:', orderId);
      setStatus('Redirigiendo a la pasarela de pago...', 'info');
      
      // Pequeño delay para asegurar que el mensaje se vea
      setTimeout(() => {
        buildAndSubmitForm(payload.formAction, payload.fields);
      }, 500);
    } catch (error) {
      console.error('[IZIPAY] Error init:', error);
      setStatus(error.message || 'No se pudo iniciar el pago.', 'error');
    }
  });
})();