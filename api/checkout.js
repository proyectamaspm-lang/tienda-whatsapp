// Crea el pago en Mercado Pago y devuelve el link para que el cliente pague.
const { SITE, activo, armarPedido, mp } = require("./_lib");

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!activo()) return res.status(503).json({ error: "Cobro automático no configurado" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const nombre = String(body.nombre || "").trim().slice(0, 80);
    if (!EMAIL_OK.test(email)) return res.status(400).json({ error: "Revisá el email" });

    const { items, total, promo, cupon } = await armarPedido(body.items, body.cupon, email, true);
    if (body.cupon && !cupon) return res.status(400).json({ error: "cupon" });
    const codigo = "PM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    // La referencia lleva también el email (respaldo para la entrega), si entra en los 64 caracteres.
    // Mercado Pago solo acepta letras, números, guiones y guion bajo en ese campo: el email va codificado.
    const emailRef = Buffer.from(email).toString("base64url");
    const ref = (codigo + "_" + emailRef).length <= 64 ? codigo + "_" + emailRef : codigo;
    const plata = (n) => n.toFixed(2);

    // Checkout Pro con la API de Orders (la de Preferences se va a dar de baja)
    const order = await mp("/v1/orders", {
      method: "POST",
      headers: { "X-Idempotency-Key": codigo },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        total_amount: plata(total),
        external_reference: ref,
        description: items.length === 1 ? items[0].nombre : "Pedido Proyecta + (" + items.length + " productos)",
        expiration_time: "P1D",
        payer: { email, first_name: nombre || undefined },
        items: items.map((x) => ({
          external_code: x.id,
          title: x.nombre + (promo ? " (" + promo.porcentaje + "% OFF)" : ""),
          quantity: 1,
          unit_price: plata(x.precio),
          category_id: "learnings",
        })),
        config: {
          statement_descriptor: "PROYECTAMAS",
          payment_method: { max_installments: 3 },
          online: {
            success_url: SITE + "/gracias?v=" + total + "&p=" + codigo,
            pending_url: SITE + "/gracias?estado=pendiente",
            failure_url: SITE + "/gracias?estado=error",
            auto_return: "approved",
          },
        },
      }),
    });

    const url = order.checkout_url || (order.checkout_pro && order.checkout_pro.init_point) || order.init_point;
    if (!url) throw new Error("Mercado Pago no devolvió el link de pago: " + JSON.stringify(order).slice(0, 200));
    res.status(200).json({ url, pedido: codigo, total });
  } catch (e) {
    console.error("checkout:", e.message);
    res.status(500).json({ error: "No se pudo iniciar el pago" });
  }
};
