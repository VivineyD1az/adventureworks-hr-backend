const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');

// Pantalla "Employee Directory"
router.get('/', employeeController.listarEmpleados);
router.get('/:id', employeeController.obtenerEmpleado);
router.post('/', employeeController.crearEmpleado); // boton "Onboard Employee"
router.put('/:id', employeeController.actualizarEmpleado);
router.delete('/:id', employeeController.desactivarEmpleado); // baja logica

module.exports = router;
