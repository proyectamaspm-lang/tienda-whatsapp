# Pago automático con Mercado Pago + entrega por mail

Mientras falten las claves, la tienda funciona igual que siempre (todo por WhatsApp).
Cuando cargás las 3 variables obligatorias en Vercel, se activa solo.

## Cómo funciona
1. El cliente toca **Comprar ya** (o el carrito), deja nombre y email y paga en Mercado Pago.
2. Mercado Pago avisa a `/api/webhook-mp` (evento **Order**), la web confirma el cobro con Mercado Pago.
3. Se manda solo el mail con los links de Drive al cliente, y un aviso de la venta a hola@.
4. El cliente vuelve a `/gracias`.

## Variables en Vercel (Settings → Environment Variables)
| Nombre | Qué va |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token de producción de Mercado Pago (Developers → Tus integraciones → Credenciales) |
| `RESEND_API_KEY` | API key de Resend |
| `ENTREGAS` | Los links de Drive en una línea, formato `{"Nombre del producto": "link", ...}`. Si un producto lleva varios links: `["link1","link2"]` |
| `MAIL_FROM` (opcional) | Remitente. Por defecto `Proyecta + <entregas@news.proyectamas.com.ar>` |
| `MAIL_AVISO` (opcional) | A dónde llega el aviso de cada venta. Por defecto `hola@proyectamas.com.ar` |

Después de guardar las variables: **Deployments → ⋯ → Redeploy**.

## Aviso de pagos en Mercado Pago (obligatorio)
Se usa Checkout Pro con la **API de Orders**. En Mercado Pago Developers → tu aplicación →
**Webhooks → Configurar notificaciones** → pestaña **Modo productivo**:
- URL: `https://tienda.proyectamas.com.ar/api/webhook-mp`
- Evento: **Order (Mercado Pago)**
- Guardar.

Los nombres de producto válidos para `ENTREGAS` están en `api/_catalogo.js`.
Si un producto no tiene link cargado, igual se cobra: al cliente le llega "te lo mando en unas horas" y a vos un aviso para mandarlo a mano.

## Precios
El servidor cobra los precios de `api/_catalogo.js` y aplica la promo vigente de `promos.js`.
Si cambiás un precio en las páginas, cambialo también en `api/_catalogo.js`.
