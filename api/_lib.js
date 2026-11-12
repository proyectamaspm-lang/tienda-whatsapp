// Funciones compartidas por /api/checkout y /api/webhook-mp.
// Los archivos de /api que empiezan con "_" no se publican como página ni como función.
const vm = require("vm");
const CATALOGO = require("./_catalogo");

const SITE = (process.env.SITE_URL || "https://tienda.proyectamas.com.ar").replace(/\/$/, "");
const PROMOS_URL = "https://www.proyectamas.com.ar/js/promos.js";

// Mismos productos con dos códigos (el viejo de Shopify y el nuevo)
const ALIAS = { "50392094081381": "biblioteca-proyecta-mas" };
const normalizar = (id) => ALIAS[id] || id;

function activo() {
  return !!(process.env.MP_ACCESS_TOKEN && process.env.RESEND_API_KEY);
}

// ---------- Promo vigente (la misma que muestran las páginas) ----------
let cachePromo = { t: 0, promo: null };
async function promoVigente() {
  if (Date.now() - cachePromo.t < 5 * 60 * 1000) return cachePromo.promo;
  let promo = null;
  try {
    const r = await fetch(PROMOS_URL, { cache: "no-store" });
    if (r.ok) {
      const ctx = { window: {}, document: { querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} }, console };
      ctx.self = ctx.window;
      vm.runInNewContext(await r.text(), ctx, { timeout: 500 });
      const p = ctx.window.PROMO || ctx.PROMO || null;
      if (p && +p.porcentaje > 0) {
        const fin = new Date(p.hasta).getTime();
        if (!isNaN(fin) && Date.now() < fin) promo = { porcentaje: +p.porcentaje, etiqueta: p.etiqueta || "Promo" };
      }
    }
  } catch (e) {
    console.error("No pude leer promos.js:", e.message);
  }
  cachePromo = { t: Date.now(), promo };
  return promo;
}

// Arma la lista de productos con el precio final (igual que la web: descuento redondeado por producto)
async function armarPedido(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 60) throw new Error("Pedido vacío");
  const vistos = new Set();
  const promo = await promoVigente();
  const items = [];
  for (const crudo of ids) {
    const id = normalizar(String(crudo));
    if (vistos.has(id)) continue;
    vistos.add(id);
    const prod = CATALOGO[id];
    if (!prod) throw new Error("Producto desconocido: " + id);
    const precio = promo ? Math.round((prod.precio * (100 - promo.porcentaje)) / 100) : prod.precio;
    items.push({ id, nombre: prod.nombre, precio });
  }
  return { items, total: items.reduce((a, x) => a + x.precio, 0), promo };
}

// ---------- Links de entrega (variable ENTREGAS en Vercel, nunca en el código público) ----------
function linksDe(id) {
  let mapa = {};
  try { mapa = JSON.parse(process.env.ENTREGAS || "{}"); } catch (e) { console.error("ENTREGAS no es un JSON válido"); }
  // Se puede cargar por código o por el nombre del producto tal cual figura en el catálogo
  const prod = CATALOGO[normalizar(id)] || {};
  const v = mapa[id] || mapa[normalizar(id)] || mapa[prod.nombre];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string" && /^https?:\/\//.test(x));
}

// ---------- Mercado Pago ----------
async function mp(path, opts = {}) {
  const r = await fetch("https://api.mercadopago.com" + path, {
    ...opts,
    headers: { Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Mercado Pago " + r.status + ": " + JSON.stringify(data).slice(0, 300));
  return data;
}

// ---------- Email (Resend) ----------
async function enviarEmail({ to, subject, html, replyTo, clave }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
      ...(clave ? { "Idempotency-Key": clave } : {}),
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Proyecta + <entregas@news.proyectamas.com.ar>",
      to: [to],
      reply_to: replyTo || process.env.MAIL_AVISO || "hola@proyectamas.com.ar",
      subject,
      html,
    }),
  });
  const data = await r.json().catch(() => ({}));
  // 409 = ese email ya se mandó (Mercado Pago repite avisos): está bien
  if (!r.ok && r.status !== 409) throw new Error("Resend " + r.status + ": " + JSON.stringify(data).slice(0, 300));
  return data;
}

// ---------- Meta: compra avisada desde el servidor (API de conversiones) ----------
// Se activa sola cuando está la variable META_CAPI_TOKEN en Vercel. Si falta, no hace nada.
// Lleva el mismo id de evento que la página de gracias, así Meta no la cuenta dos veces.
const crypto = require("crypto");
const sha = (t) => crypto.createHash("sha256").update(String(t).trim().toLowerCase()).digest("hex");
async function avisarCompraMeta({ pedido, email, nombre, monto, ids, fecha }) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { omitido: true };
  const pixel = process.env.META_PIXEL_ID || "1619971716531777";
  const user_data = { em: [sha(email)] };
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (partes[0]) user_data.fn = [sha(partes[0])];
  if (partes.length > 1) user_data.ln = [sha(partes[partes.length - 1])];
  user_data.country = [sha("ar")];
  const r = await fetch("https://graph.facebook.com/v21.0/" + pixel + "/events?access_token=" + encodeURIComponent(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{
        event_name: "Purchase",
        event_time: Math.floor((fecha ? new Date(fecha).getTime() : Date.now()) / 1000) || Math.floor(Date.now() / 1000),
        event_id: "compra-" + pedido,
        action_source: "website",
        event_source_url: SITE + "/gracias",
        user_data,
        custom_data: { currency: "ARS", value: Math.round(monto * 100) / 100, content_type: "product", content_ids: ids, num_items: ids.length, order_id: pedido },
      }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Meta " + r.status + ": " + JSON.stringify(data).slice(0, 300));
  return data;
}

const fmt = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = { SITE, CATALOGO, activo, armarPedido, linksDe, mp, enviarEmail, avisarCompraMeta, fmt, esc, normalizar };
