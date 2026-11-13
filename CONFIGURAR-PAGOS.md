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

## Compras en Meta desde el servidor (opcional, recomendado)
Además del Pixel de la página de gracias, la tienda le avisa la compra a Meta desde el servidor
cuando Mercado Pago confirma el pago. Así la compra se cuenta aunque el cliente no vuelva a la web.

1. Meta → Administrador de eventos → tu Pixel → Configuración → API de conversiones → **Generar token de acceso**.
2. En Vercel → Settings → Environment Variables: `META_CAPI_TOKEN` con ese token (Production). Redeploy.

Los dos avisos llevan el mismo id (`compra-` + código del pedido): Meta cuenta la compra una sola vez.

## Códigos de descuento
- **Códigos de la Red (RED-XXXXXX):** cada registrado en red.proyectamas.com.ar tiene el suyo. Solo vale pagando con el email de su cuenta, y los archivos llegan a ese email. Lo valida la base de la Red (función `validar_cupon_red`); cada uso queda anotado en `red_cupones_usos`. El porcentaje se cambia en la tabla `red_beneficios` (`cupon_tienda_pct`). Para anular un código: `red_cupones.activo = false`.
- **Códigos generales (opcional):** variable `CUPONES` en Vercel, ej. `{"NAVIDAD10": 10}`. Estos sí los puede usar cualquiera.
- No se suman con la promo vigente: se aplica el descuento más alto.
