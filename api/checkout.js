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

    const { items, total, promo } = await armarPedido(body.items);
    const ref = "PM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

    const pref = await mp("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((x) => ({
          id: x.id,
          title: x.nombre + (promo ? " (" + promo.porcentaje + "% OFF)" : ""),
          quantity: 1,
          unit_price: x.precio,
          currency_id: "ARS",
          category_id: "learnings",
        })),
        payer: { email, name: nombre || undefined },
        external_reference: ref,
        metadata: { pedido: ref, items: items.map((x) => x.id).join(","), email, nombre },
        notification_url: SITE + "/api/webhook-mp",
        back_urls: {
          success: SITE + "/gracias?v=" + total,
          pending: SITE + "/gracias?estado=pendiente",
          failure: SITE + "/gracias?estado=error",
        },
        auto_return: "approved",
        payment_methods: { installments: 3 },
        statement_descriptor: "PROYECTAMAS",
      }),
    });

    res.status(200).json({ url: pref.init_point, pedido: ref, total });
  } catch (e) {
    console.error("checkout:", e.message);
    res.status(500).json({ error: "No se pudo iniciar el pago" });
  }
};
