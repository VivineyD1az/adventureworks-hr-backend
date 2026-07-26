// Middleware centralizado de manejo de errores
// Traduce errores comunes de SQL Server a respuestas HTTP entendibles

function errorHandler(err, req, res, next) {
  console.error('Error capturado:', err);

  // Violacion de llave foranea / restriccion (ej. borrar un departamento con empleados asignados)
  if (err.number === 547) {
    return res.status(409).json({
      exito: false,
      mensaje: 'La operacion viola una restriccion de la base de datos (llave foranea o CHECK constraint).',
      detalle: err.message,
    });
  }

  // Violacion de llave unica/duplicada
  if (err.number === 2627 || err.number === 2601) {
    return res.status(409).json({
      exito: false,
      mensaje: 'Ya existe un registro con esos datos (violacion de llave unica).',
      detalle: err.message,
    });
  }

  // Error de conexion a la base de datos
  if (err.code === 'ELOGIN' || err.code === 'ETIMEOUT' || err.code === 'ESOCKET') {
    return res.status(503).json({
      exito: false,
      mensaje: 'No fue posible conectar con SQL Server. Verifica que el servicio este activo y las credenciales del .env',
      detalle: err.message,
    });
  }

  res.status(err.status || 500).json({
    exito: false,
    mensaje: err.message || 'Error interno del servidor',
  });
}

module.exports = errorHandler;
