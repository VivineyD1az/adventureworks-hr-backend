const express = require("express");
const router = express.Router();

const { login, perfil, cambiarPassword } = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

// Pública
router.post("/login", login);

// Protegidas
router.get("/perfil", authMiddleware, perfil);
router.put("/cambiar-password", authMiddleware, cambiarPassword);

module.exports = router;