const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

// Pantalla "Recruitment Pipeline"
router.get('/', candidateController.listarPipeline);
router.get('/:id', candidateController.obtenerCandidato);
router.post('/', candidateController.crearCandidato);
router.put('/:id/etapa', candidateController.cambiarEtapa); // mover tarjeta en el Kanban
router.post('/:id/contratar', candidateController.contratarCandidato); // boton "Hire Candidate"
router.delete('/:id', candidateController.eliminarCandidato);

module.exports = router;
