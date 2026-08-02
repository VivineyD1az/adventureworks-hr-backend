const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Pantalla "Dashboard"
router.get('/stats', dashboardController.obtenerEstadisticas);
router.get('/distribucion-departamentos', dashboardController.distribucionPorDepartamento);
router.get('/distribucion-genero', dashboardController.distribucionPorGenero);
router.get('/estado-civil', dashboardController.distribucionPorEstadoCivil);
router.get('/contrataciones-recientes', dashboardController.contratacionesRecientes);
router.get('/candidatos-recientes', dashboardController.candidatosRecientes);
router.get('/candidatos/:id/hoja-de-vida', dashboardController.hojaDeVidaCandidato);
router.get('/proximos-cumpleanos', dashboardController.proximosCumpleanos);

module.exports = router;