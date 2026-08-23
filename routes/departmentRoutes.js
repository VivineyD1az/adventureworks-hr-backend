const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');

// Pantalla "Departments & Shifts"
router.get('/', departmentController.listarDepartamentos);
router.get('/:id', departmentController.obtenerDepartamento);
router.get('/:id/empleados', departmentController.listarEmpleadosDelDepartamento);
router.post('/:id/asignaciones', departmentController.asignarEmpleado); // "Manage Assignments"
router.put('/:id/asignaciones/:idEmpleado', departmentController.actualizarAsignacion);
router.delete('/:id/asignaciones/:idEmpleado', departmentController.eliminarAsignacion);
router.post('/', departmentController.crearDepartamento);
router.put('/:id', departmentController.actualizarDepartamento);
router.delete('/:id', departmentController.eliminarDepartamento);

module.exports = router;
