const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');

router.get('/', shiftController.listarTurnos);
router.get('/:id', shiftController.obtenerTurno);
router.post('/', shiftController.crearTurno);
router.put('/:id', shiftController.actualizarTurno);
router.delete('/:id', shiftController.eliminarTurno);

module.exports = router;
