// Mercado Pago avisa acá cada vez que cambia una order (API de Orders, evento "Order").
// Confirmamos el pago directamente con Mercado Pago (así nadie puede falsear el aviso)
// y, si está aprobado, mandamos los links de descarga al cliente y un aviso a Nico.
const { CATALOGO, mp, enviarEmail, linksDe, fmt, esc } = require("./_lib");

function idDeLaOrder(req) {
  const q = req.query || {};
  const b = typeof req.body === "string" ? safeJSON(req.body) : req.body || {};
  const tipo = b.type || b.topic || q.type || q.topic;
  if (tipo && tipo !== "order") return null;
  return (b.data && b.data.id) || q["data.id"] || null;
}
const safeJSON = (s) => { try { return JSON.parse(s); } catch (e) { return {}; } };

function emailCliente({ nombre, productos, pedido }) {
  const saludo = nombre ? "¡Hola " + esc(nombre.split(" ")[0]) + "!" : "¡Hola!";
  const bloques = productos.map((p) => {
    const botones = p.links.length
      ? p.links.map((l, i) =>
          '<a href="' + esc(l) + '" style="display:inline-block;background:#1e4982;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin:6px 6px 0 0">Descargar' + (p.links.length > 1 ? " parte " + (i + 1) : "") + "</a>"
        ).join("")
      : '<p style="margin:6px 0 0;color:#555">Este lo preparo a mano: te lo mando en unas horas a este mismo mail.</p>';
    return '<div style="border:1px solid #e6e1d6;border-radius:18px;padding:18px 20px;margin:0 0 12px"><b style="font-size:16px;color:#122e54">' + esc(p.nombre) + "</b><br>" + botones + "</div>";
  }).join("");

  return '<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">' +
    '<div style="max-width:560px;margin:0 auto;padding:28px 18px">' +
    '<div style="text-align:center;margin-bottom:22px"><span style="display:inline-block;background:#ffe500;color:#ffffff;font-weight:900;font-size:22px;letter-spacing:.04em;padding:8px 20px;border-radius:14px;text-shadow:0 1px 2px rgba(0,0,0,.25)">PROYECTA +</span></div>' +
    '<div style="background:#ffffff;border-radius:22px;padding:28px 24px">' +
    '<h1 style="margin:0 0 8px;font-size:22px;color:#122e54">' + saludo + " Gracias por tu compra</h1>" +
    '<p style="margin:0 0 20px;line-height:1.5">Tu pago ya se acreditó. Acá tenés tus archivos, descargalos y guardalos en tu compu o en tu Drive:</p>' +
    bloques +
    '<p style="margin:20px 0 0;line-height:1.5;font-size:14px">¿Algún problema con la descarga o una duda con el material? Respondé este mail o escribime por WhatsApp al <a href="https://wa.me/5493425104877" style="color:#1e4982">342 510-4877</a>.</p>' +
    '<p style="margin:14px 0 0;font-size:14px">Tenés <b>7 días de garantía</b>: si no te sirve, te devuelvo el 100%.</p>' +
    '<p style="margin:18px 0 0">Nico<br><span style="color:#777;font-size:13px">Proyecta +</span></p>' +
    "</div>" +
    '<p style="text-align:center;color:#999;font-size:12px;margin-top:16px">Pedido ' + esc(pedido) + " · Los links son para uso personal, por favor no los compartas.</p>" +
    "</div></body></html>";
}

function emailAviso({ pago, nombre, email, productos, faltan }) {
  const filas = productos.map((p) => "<li>" + esc(p.nombre) + (p.links.length ? "" : " <b style=\"color:#c0392b\">(sin link: mandalo a mano)</b>") + "</li>").join("");
  return '<div style="font-family:Arial,sans-serif;line-height:1.5">' +
    "<h2 style=\"margin:0 0 6px\">Nueva venta: " + fmt(pago.monto) + "</h2>" +
    "<p>" + esc(nombre || "(sin nombre)") + " · <a href=\"mailto:" + esc(email) + "\">" + esc(email) + "</a></p>" +
    "<ul>" + filas + "</ul>" +
    (faltan ? '<p style="color:#c0392b"><b>Ojo:</b> hay productos sin link cargado en ENTREGAS. Al cliente le dijimos que se los mandás en unas horas.</p>' : "<p>Los archivos ya se mandaron solos.</p>") +
    '<p style="color:#777;font-size:13px">Order MP ' + esc(pago.id) + " · pedido " + esc(pago.ref) + " · " + esc(pago.medio) + (pago.cuotas > 1 ? " en " + pago.cuotas + " cuotas" : "") + "</p></div>";
}

module.exports = async (req, res) => {
  const id = idDeLaOrder(req);
  if (!id) return res.status(200).json({ ok: true, ignorado: true });

  try {
    const order = await mp("/v1/orders/" + encodeURIComponent(id));
    // "processed" = cobrada y acreditada
    if (order.status !== "processed") return res.status(200).json({ ok: true, estado: order.status });

    const [codigo, emailRef] = String(order.external_reference || "").split("|");
    const email = (order.payer && order.payer.email) || emailRef;
    const nombre = (order.payer && order.payer.first_name) || "";
    const ids = (order.items || []).map((x) => x.external_code).filter(Boolean);
    if (!email || !ids.length) {
      console.error("Order cobrada sin datos del pedido", id, JSON.stringify(order).slice(0, 300));
      return res.status(200).json({ ok: true, sinDatos: true });
    }
    const pagoMP = ((order.transactions && order.transactions.payments) || [])[0] || {};
    const pago = {
      id: order.id,
      monto: +(order.total_paid_amount || order.total_amount || 0),
      ref: codigo || order.id,
      medio: (pagoMP.payment_method && pagoMP.payment_method.type) || "",
      cuotas: (pagoMP.payment_method && pagoMP.payment_method.installments) || 1,
    };

    const productos = ids.map((pid) => ({ id: pid, nombre: (CATALOGO[pid] || {}).nombre || pid, links: linksDe(pid) }));
    const faltan = productos.some((p) => !p.links.length);
    const pedido = pago.ref;

    // La clave evita mandar dos veces el mismo mail si Mercado Pago repite el aviso
    await enviarEmail({
      to: email,
      subject: "Tus archivos de Proyecta + 📩",
      html: emailCliente({ nombre, productos, pedido }),
      clave: "entrega-" + id,
    });
    await enviarEmail({
      to: process.env.MAIL_AVISO || "hola@proyectamas.com.ar",
      subject: (faltan ? "⚠️ " : "") + "Venta " + fmt(pago.monto) + ": " + productos.map((p) => p.nombre).join(" + "),
      html: emailAviso({ pago, nombre, email, productos, faltan }),
      replyTo: email,
      clave: "aviso-" + id,
    });

    res.status(200).json({ ok: true, enviado: true });
  } catch (e) {
    console.error("webhook:", e.message);
    // 500 hace que Mercado Pago vuelva a intentar más tarde
    res.status(500).json({ error: "reintentar" });
  }
};
