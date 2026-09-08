const asyncHandler = require("../utils/asyncHandler");
const {
  loginUser,
  getPerfilUsuario,
  cambiarPasswordUsuario,
} = require("../services/authService");

/**
 * POST /api/auth/login
 * Body: { loginId: string, password: string }
 */
const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  return res.status(result.statusCode).json(result.body);
});

/**
 * GET /api/auth/perfil
 * Requiere authMiddleware. Devuelve los datos del usuario autenticado.
 */
const perfil = asyncHandler(async (req, res) => {
  const result = await getPerfilUsuario(req.usuario.businessEntityId);
  return res.status(result.statusCode).json(result.body);
});

/**
 * PUT /api/auth/cambiar-password
 * Requiere authMiddleware. Body: { passwordActual, passwordNueva }
 */
const cambiarPassword = asyncHandler(async (req, res) => {
  const result = await cambiarPasswordUsuario({
    businessEntityId: req.usuario.businessEntityId,
    passwordActual: req.body.passwordActual,
    passwordNueva: req.body.passwordNueva,
  });

  return res.status(result.statusCode).json(result.body);
});

module.exports = { login, perfil, cambiarPassword };