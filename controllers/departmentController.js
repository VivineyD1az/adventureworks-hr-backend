const { sql, getPool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/departamentos
// Devuelve los departamentos agrupados por GroupName (Executive, Sales & Marketing, etc.)
// con el conteo de empleados actuales y los turnos activos en ese departamento
const listarDepartamentos = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      d.DepartmentID AS idDepartamento,
      d.Name AS nombre,
      d.GroupName AS division,
      COUNT(DISTINCT CASE WHEN edh.EndDate IS NULL THEN edh.BusinessEntityID END) AS totalEmpleados,
      (
        SELECT STRING_AGG(turno.NombreTurno, ', ')
        FROM (
          SELECT DISTINCT s2.Name AS NombreTurno
          FROM HumanResources.EmployeeDepartmentHistory edh2
          INNER JOIN HumanResources.Shift s2 ON s2.ShiftID = edh2.ShiftID
          WHERE edh2.DepartmentID = d.DepartmentID AND edh2.EndDate IS NULL
        ) AS turno
      ) AS turnosActivos
    FROM HumanResources.Department d
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
      ON edh.DepartmentID = d.DepartmentID AND edh.EndDate IS NULL
    GROUP BY d.DepartmentID, d.Name, d.GroupName
    ORDER BY d.GroupName, d.Name
  `);

  // Agrupamos por division (GroupName) para que el frontend arme las secciones "Executive", "Engineering", etc.
  const agrupado = {};
  for (const fila of resultado.recordset) {
    if (!agrupado[fila.division]) agrupado[fila.division] = [];
    agrupado[fila.division].push({
      idDepartamento: fila.idDepartamento,
      nombre: fila.nombre,
      totalEmpleados: fila.totalEmpleados,
      turnosActivos: fila.turnosActivos ? fila.turnosActivos.split(', ') : [],
    });
  }

  // Estadisticas generales de la pantalla (Total Headcount, Active Shifts, Payroll Budget)
  const stats = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM HumanResources.Employee WHERE CurrentFlag = 1) AS totalHeadcount,
      (SELECT COUNT(*) FROM HumanResources.Shift) AS turnosActivos
  `);

  // Payroll Budget estimado: tarifa vigente de cada empleado activo * 160 horas/mes (aprox.)
  const payroll = await pool.request().query(`
    SELECT SUM(ultimaTarifa.Rate) * 160 AS presupuestoMensualEstimado
    FROM (
      SELECT eph.BusinessEntityID, eph.Rate,
             ROW_NUMBER() OVER (PARTITION BY eph.BusinessEntityID ORDER BY eph.RateChangeDate DESC) AS rn
      FROM HumanResources.EmployeePayHistory eph
      INNER JOIN HumanResources.Employee e ON e.BusinessEntityID = eph.BusinessEntityID
      WHERE e.CurrentFlag = 1
    ) AS ultimaTarifa
    WHERE ultimaTarifa.rn = 1
  `);

  res.json({
    exito: true,
    datos: {
      resumen: {
        totalHeadcount: stats.recordset[0].totalHeadcount,
        turnosActivos: stats.recordset[0].turnosActivos,
        // Nota: "Vacant Positions" no existe en el esquema de AdventureWorks, no se puede calcular sin una tabla de vacantes.
        presupuestoMensualEstimado: Math.round(payroll.recordset[0].presupuestoMensualEstimado || 0),
      },
      divisiones: agrupado,
    },
  });
});

// GET /api/departamentos/:id
const obtenerDepartamento = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.SmallInt, req.params.id)
    .query('SELECT DepartmentID AS idDepartamento, Name AS nombre, GroupName AS division FROM HumanResources.Department WHERE DepartmentID = @id');

  if (resultado.recordset.length === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Departamento no encontrado' });
  }
  res.json({ exito: true, datos: resultado.recordset[0] });
});

// GET /api/departamentos/:id/empleados  (boton "Manage Assignments")
const listarEmpleadosDelDepartamento = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.SmallInt, req.params.id)
    .query(`
      SELECT
        e.BusinessEntityID AS idEmpleado,
        p.FirstName + ' ' + p.LastName AS nombreCompleto,
        e.JobTitle AS cargo,
        s.Name AS turno,
        edh.StartDate AS fechaAsignacion
      FROM HumanResources.EmployeeDepartmentHistory edh
      INNER JOIN HumanResources.Employee e ON e.BusinessEntityID = edh.BusinessEntityID
      INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
      LEFT JOIN HumanResources.Shift s ON s.ShiftID = edh.ShiftID
      WHERE edh.DepartmentID = @id AND edh.EndDate IS NULL
      ORDER BY nombreCompleto
    `);
  res.json({ exito: true, datos: resultado.recordset });
});

// POST /api/departamentos/:id/asignaciones
// Reasigna un empleado a este departamento/turno (cierra la asignacion anterior y crea una nueva)
const asignarEmpleado = asyncHandler(async (req, res) => {
  const { idEmpleado, idTurno } = req.body;
  const idDepartamento = req.params.id;

  if (!idEmpleado || !idTurno) {
    return res.status(400).json({ exito: false, mensaje: 'idEmpleado e idTurno son obligatorios' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input('idEmpleado', sql.Int, idEmpleado)
      .query(`
        UPDATE HumanResources.EmployeeDepartmentHistory
        SET EndDate = GETDATE(), ModifiedDate = GETDATE()
        WHERE BusinessEntityID = @idEmpleado AND EndDate IS NULL
      `);

    await new sql.Request(transaction)
      .input('idEmpleado', sql.Int, idEmpleado)
      .input('idDepartamento', sql.SmallInt, idDepartamento)
      .input('idTurno', sql.TinyInt, idTurno)
      .query(`
        INSERT INTO HumanResources.EmployeeDepartmentHistory
          (BusinessEntityID, DepartmentID, ShiftID, StartDate, ModifiedDate)
        VALUES
          (@idEmpleado, @idDepartamento, @idTurno, GETDATE(), GETDATE())
      `);

    await transaction.commit();
    res.status(201).json({ exito: true, mensaje: 'Empleado reasignado correctamente' });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

// POST /api/departamentos
const crearDepartamento = asyncHandler(async (req, res) => {
  const { nombre, division } = req.body;
  if (!nombre || !division) {
    return res.status(400).json({ exito: false, mensaje: 'nombre y division son obligatorios' });
  }
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('nombre', sql.NVarChar, nombre)
    .input('division', sql.NVarChar, division)
    .query(`
      INSERT INTO HumanResources.Department (Name, GroupName, ModifiedDate)
      OUTPUT INSERTED.DepartmentID
      VALUES (@nombre, @division, GETDATE())
    `);
  res.status(201).json({ exito: true, datos: { idDepartamento: resultado.recordset[0].DepartmentID } });
});

// PUT /api/departamentos/:id
const actualizarDepartamento = asyncHandler(async (req, res) => {
  const { nombre, division } = req.body;
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.SmallInt, req.params.id)
    .input('nombre', sql.NVarChar, nombre)
    .input('division', sql.NVarChar, division)
    .query(`
      UPDATE HumanResources.Department
      SET Name = COALESCE(@nombre, Name), GroupName = COALESCE(@division, GroupName), ModifiedDate = GETDATE()
      WHERE DepartmentID = @id
    `);
  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Departamento no encontrado' });
  }
  res.json({ exito: true, mensaje: 'Departamento actualizado correctamente' });
});

// DELETE /api/departamentos/:id
const eliminarDepartamento = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.SmallInt, req.params.id)
    .query('DELETE FROM HumanResources.Department WHERE DepartmentID = @id');

  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Departamento no encontrado' });
  }
  res.json({ exito: true, mensaje: 'Departamento eliminado correctamente' });
});

module.exports = {
  listarDepartamentos,
  obtenerDepartamento,
  listarEmpleadosDelDepartamento,
  asignarEmpleado,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
};
