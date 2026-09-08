Actúa como un Ingeniero de Software experto en arquitecturas SaaS Multi-tenant y pasarelas de pago. Necesito implementar la verificación automática de Pago Móvil usando la API de Pabilo en mi ruta de `/ventas`.

Estructura del Sistema:
1. Yo soy el dueño del SaaS y tengo una única API_KEY global de Pabilo guardada en mi `.env`.
2. Cada comercio (Tenant) tiene configurados sus propios datos de Pago Móvil en su documento/registro (banco, teléfono, cédula). El dinero va directo a ellos, yo no toco fondos.
3. El endpoint de Pabilo requiere consultar dinámicamente las cuentas o mapear los campos requeridos para el banco del Tenant antes de disparar el POST de verificación.

Archivos de contexto: @route_ventas @database_config @checkout_component

Necesito que generes dos bloques de código integrados con mis archivos:

1. CONTROLADOR BACKEND (Ruta POST /api/ventas/verificar-pago):
   - Recibe del frontend: `tenantId`, `referencia`, `monto`, `telefonoPagador`, `cedulaPagador` (objeto tipo/número) y `bancoOrigen`.
   - Busca en la base de datos los datos de Pago Móvil del `tenantId` para saber a qué cuenta se destinó el pago.
   - Consume la API de Pabilo enviando el header 'appKey' con mi clave global.
   - Construye dinámicamente el body para el endpoint `POST https://api.pabilo.app/userbankpayment/{userBankId}/betaserio` (o el equivalente genérico/móvil_pay según la documentación de Pabilo).
   - Lógica de negocio obligatoria: Solo aprobar la venta en mi Base de Datos si Pabilo responde con `"status": "verified"` Y `"is_new": true`. Si `is_new` es false, rechazar por intento de fraude (referencia duplicada).

2. COMPONENTE FRONTEND (Vista de /ventas):
   - Un formulario limpio que se active al seleccionar "Pago Móvil".
   - Muestra textualmente los datos de Pago Móvil del comercio para que el usuario transfiera en vivo.
   - Campos de captura para el comprador: Referencia (Input numérico), Monto, Banco Origen (Select), Teléfono Origen y Cédula.
   - Manejo de estados (loading, success, error) y llamadas al endpoint del backend que creaste arriba.

Por favor, escribe el código modular, limpio, adaptándote exactamente al ODM/ORM y frameworks que ves en mis archivos.