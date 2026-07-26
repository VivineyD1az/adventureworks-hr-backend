const { sql, getPool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/turnos
const listarTurnos = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      s.ShiftID AS idTurno,
      s.Name AS nombre,
      s.StartTime AS horaInicio,
      s.EndTime AS horaFin,
      COUNT(DISTINCT CASE WHEN edh.EndDate IS NULL THEN edh.BusinessEntityID END) AS totalEmpleadosAsignados
    FROM HumanResources.Shift s
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh ON edh.ShiftID = s.ShiftID
    GROUP BY s.ShiftID, s.Name, s.StartTime, s.EndTime
    ORDER BY s.ShiftID
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/turnos/:id
const obtenerTurno = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.TinyInt, req.params.id)
    .query('SELECT ShiftID AS idTurno, Name AS nombre, StartTime AS horaInicio, EndTime AS horaFin FROM HumanResources.Shift WHERE ShiftID = @id');

  if (resultado.recordset.length === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Turno no encontrado' });
  }
  res.json({ exito: true, datos: resultado.recordset[0] });
});

// POST /api/turnos
const crearTurno = asyncHandler(async (req, res) => {
  const { nombre, horaInicio, horaFin } = req.body;
  if (!nombre || !horaInicio || !horaFin) {
    return res.status(400).json({ exito: false, mensaje: 'nombre, horaInicio y horaFin son obligatorios' });
  }
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('nombre', sql.NVarChar, nombre)
    .input('horaInicio', sql.Time, horaInicio)
    .input('horaFin', sql.Time, horaFin)
    .query(`
      INSERT INTO HumanResources.Shift (Name, StartTime, EndTime, ModifiedDate)
      OUTPUT INSERTED.ShiftID
      VALUES (@nombre, @horaInicio, @horaFin, GETDATE())
    `);
  res.status(201).json({ exito: true, datos: { idTurno: resultado.recordset[0].ShiftID } });
});

// PUT /api/turnos/:id
const actualizarTurno = asyncHandler(async (req, res) => {
  const { nombre, horaInicio, horaFin } = req.body;
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.TinyInt, req.params.id)
    .input('nombre', sql.NVarChar, nombre)
    .input('horaInicio', sql.Time, horaInicio)
    .input('horaFin', sql.Time, horaFin)
    .query(`
      UPDATE HumanResources.Shift
      SET
        Name = COALESCE(@nombre, Name),
        StartTime = COALESCE(@horaInicio, StartTime),
        EndTime = COALESCE(@horaFin, EndTime),
        ModifiedDate = GETDATE()
      WHERE ShiftID = @id
    `);
  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Turno no encontrado' });
  }
  res.json({ exito: true, mensaje: 'Turno actualizado correctamente' });
});

// DELETE /api/turnos/:id
const eliminarTurno = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.TinyInt, req.params.id)
    .query('DELETE FROM HumanResources.Shift WHERE ShiftID = @id');

  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Turno no encontrado' });
  }
  res.json({ exito: true, mensaje: 'Turno eliminado correctamente' });
});

module.exports = { listarTurnos, obtenerTurno, crearTurno, actualizarTurno, eliminarTurno };
