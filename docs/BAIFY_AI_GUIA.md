# BaiFy AI — Dónde íbamos y qué preguntar (free vs pago)

## Roadmap (estado actual)

| Fase | Qué es | Estado |
|------|--------|--------|
| 0 | Rol, personalidad, reglas multi-tenant | Hecho |
| 1 | Redis: tenant + snapshot en el prompt | Hecho |
| 2 | Tools: productos, clientes, stock bajo, alertas inventario | Hecho |
| 3 | Tools: ventas por periodo, top productos, alertas cuentas | Hecho |
| 4 | Ventas recientes, buscar comprobante, moneda formateada, rutas app | Hecho |
| 5 | Afinar prompt + modo free (2 tools/msg) | Hecho (esta guía) |
| 6 | FAQ ampliado, más contexto estático (sin Firestore) | Hecho (`baifyAiPrompt.js`) |
| 7 | Fine-tuning / RAG documentación | Solo si más adelante lo necesitas |

**“Entrenar”** aquí = mejorar **prompt + snapshot + tools**, no subir un modelo custom a Google.

## Formato de respuestas (obligatorio en el prompt)

| Regla | Detalle |
|--------|---------|
| Emojis | Prohibidos en respuestas del asistente (emoticonos y símbolos decorativos). |
| Longitud | Máximo 2–3 oraciones o ~50 palabras; sin saludos ni muletillas. |
| Estilo | Guía general: texto breve. **Reportes de ventas:** viñetas (Ingreso, Ventas, Ticket) + top numerado con **negritas** (mismo color del texto, más peso). |
| Prioridad | Estas reglas **prevalecen** sobre el resto del prompt (incluido el FAQ interno y el antiguo estilo “estructurado con viñetas/negritas”, que se quitó a propósito). |

Implementación: `backend/utils/baifyAiPrompt.js` → bloque `REGLAS DE FORMATO OBLIGATORIAS`.

---

## Límite real en plan FREE (Google)

- ~**20 llamadas API / minuto** por modelo (`gemini-3.6-flash`).
- **Cada mensaje tuyo** puede usar **2–4+ llamadas** (respuesta + tools + reintentos).
- BaiFy limita **20 mensajes / día / usuario** (default; `BAIFY_AI_MAX_USER_MESSAGES_PER_DAY`) y ~**4 / minuto** (anti-ráfaga). Requiere **Upstash Redis**.

Por eso en free debes **espaciar** mensajes y preferir **una pregunta clara** por envío.

Variables útiles en `backend/.env`:

```env
BAIFY_AI_FREE_TIER=1
BAIFY_AI_MAX_TOOL_CALLS=2
BAIFY_AI_ENABLE_TOOLS=1
GEMINI_MODEL=gemini-3.6-flash
```

Cuando actives **billing** en Google: `BAIFY_AI_FREE_TIER=0` y `BAIFY_AI_MAX_TOOL_CALLS=4`.

---

## Qué SÍ puedes preguntar en plan FREE

Funciona bien si **esperas la respuesta** y no spameas el chat.

### Sin tools (solo snapshot + guía) — más barato en cuota

- “¿Cómo registro una venta en el POS?”
- “¿Qué métodos de pago acepta el POS?” / “¿Cómo funciona **Préstamo**?”
- “¿Cómo imprimo el ticket?” (impresión vía navegador)
- “¿Dónde veo comprobantes?” / “¿Qué pasa si elimino un comprobante?”
- “¿Qué significa stock bajo?” / “¿Dónde cambio el umbral?” (Dashboard)
- “¿Cómo funcionan **Cuentas** por cobrar?” / abonos
- “¿Qué es el programa de **puntos**?” (concepto; saldo concreto → 1 tool)
- “¿Dónde configuro RIF/logo?” (/settings)
- “Resumen general de mi negocio” (usa cifras del snapshot)
- “¿Cuántas unidades tengo en total?” / “¿Cuánto llevo vendido histórico?” (snapshot)

### Con 1 tool — ideal en free

- “Busca el producto **camisa top**” / “SKU 1298”
- “Cliente cédula **30363552**”
- “Productos con **stock bajo**”
- “**Ventas del mes**” (una tool)
- “**Top 5 productos** del mes” (una tool)
- “**Ventas del mes y top 5**” → usa `getSalesReport` (una tool)
- “**Últimas 5 ventas**”
- “Busca comprobante **FAC-…**”

### Con caché de notificaciones (0 Firestore extra)

Abre **Notificaciones** en la app una vez, luego:

- “¿Qué **alertas de inventario** tengo?”
- “¿Alertas de **cuentas** o clientes?”

---

## Qué va MAL o es frágil en plan FREE

| Tipo de pregunta | Por qué |
|------------------|---------|
| Muchas preguntas seguidas en 1 min | Agota cuota Gemini |
| “Ventas + top + clientes + stock” en un mensaje | Pide demasiadas tools (máx. 2 en free) |
| Análisis muy largos / informes huge | Muchos tokens = más costo y más lento |
| “Lista **todos** mis productos/clientes” | No está pensado; usa pantallas de la app |
| Métricas exactas al centavo con BCV USD | `getSalesStats` completo no está en tools; resumen usa Bs. históricos |
| Uso intensivo tipo “chat todo el día” | Necesitas **billing** |

---

## Qué mejora al PAGAR (billing Google)

| En free | Con ~$10+ billing |
|---------|-------------------|
| Cuota ~20 req/min | Límites mucho más altos |
| 2 tools / mensaje (recomendado) | 4 tools / mensaje cómodo |
| Probar con calma | Varios usuarios / comercio usando el chat |
| Errores quota frecuentes | Uso normal de producción |

**No arregla solo con pago:** errores de red (`ECONNRESET`) — ahí revisa VPN/internet.

---

## Ejemplos copy-paste (free)

1. `Hola, ¿qué puedes hacer por mi negocio?`
2. `¿Cómo voy en ventas e inventario según el resumen?`
3. `Ventas del mes y top 5 productos`
4. `¿Stock bajo?`
5. `Busca cliente cédula XXXXX`
6. `SKU del producto [nombre]`

**Espera 30–60 s entre pruebas** si viste error de cuota.

---

## Fase 6 — FAQ estático (hecho)

El bot lleva en el system prompt el bloque `BAIFY_AI_STATIC_FAQ` (POS, pagos, comprobantes, impresión, inventario, crédito, cuentas, puntos, métricas, notificaciones, settings, roles). **0 tools** para esas preguntas.

**Opcional después:** página de Ayuda en la app que replique el mismo texto.

## Siguiente paso posible (Fase 7+)

- Fine-tuning o RAG con manual PDF (solo si hace falta).
- Tool de configuración de fidelización cuando exista UI admin.
