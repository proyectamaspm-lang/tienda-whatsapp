// La web pregunta acá si el cobro automático está activo.
// Mientras falten las claves en Vercel, los botones siguen yendo a WhatsApp como siempre.
const { activo } = require("./_lib");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=60");
  res.status(200).json({ activo: activo() });
};
