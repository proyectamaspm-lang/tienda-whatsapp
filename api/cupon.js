// Valida un código de descuento sin exponer la lista completa.
const { cuponValido } = require("./_lib");

module.exports = async (req, res) => {
  const c = cuponValido(req.query && req.query.c);
  res.setHeader("Cache-Control", "no-store");
  if (!c) return res.status(404).json({ ok: false });
  res.status(200).json({ ok: true, codigo: c.codigo, porcentaje: c.porcentaje });
};
