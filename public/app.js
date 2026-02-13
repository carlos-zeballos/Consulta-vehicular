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
      if (!response.ok || !payload?.formAction || !payload?.fields) {
        throw new Error(payload?.message || 'No se pudo iniciar el pago');
      }

      const orderId = payload?.fields?.vads_order_id;
      if (orderId) {
        try {
          localStorage.setItem('izipay_last_order_id', String(orderId));
        } catch (_) {}
      }

      setStatus('Redirigiendo a la pasarela de pago...', 'info');
      buildAndSubmitForm(payload.formAction, payload.fields);
    } catch (error) {
      console.error('[IZIPAY] Error init:', error);
      setStatus(error.message || 'No se pudo iniciar el pago.', 'error');
    }
  });
})();