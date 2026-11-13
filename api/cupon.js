// Valida un código de descuento. Los de la Red necesitan el email de la cuenta.
const { cuponValido } = require("./_lib");

module.exports = async (req, res) => {
  const c = await cuponValido(req.query && req.query.c, req.query && req.query.e, false);
  res.setHeader("Cache-Control", "no-store");
  if (!c) return res.status(404).json({ ok: false });
  res.status(200).json({ ok: true, codigo: c.codigo, porcentaje: c.porcentaje });
};
