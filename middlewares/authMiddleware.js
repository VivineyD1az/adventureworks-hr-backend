const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/**
 * Protege rutas: exige header  Authorization: Bearer <token>
 * Si el token es válido, adjunta los datos del empleado en req.usuario
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      exito: false,
      datos: null,
      mensaje: "Token no proporcionado",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload; // { businessEntityId, loginId, jobTitle }
    next();
  } catch (err) {
    return res.status(401).json({
      exito: false,
      datos: null,
      mensaje: "Token inválido o expirado",
    });
  }
}

module.exports = authMiddleware;