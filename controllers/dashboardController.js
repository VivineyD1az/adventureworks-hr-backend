const { sql, getPool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/dashboard/stats
// Tarjetas superiores: Total Empleados, Total Departamentos, Total Turnos, Total Candidatos
const obtenerEstadisticas = asyncHandler(async (req, res) => {
  const pool = await getPool();

  const totalEmpleados = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN CurrentFlag = 1 THEN 1 ELSE 0 END) AS activos,
      SUM(CASE WHEN CurrentFlag = 0 THEN 1 ELSE 0 END) AS inactivos
    FROM HumanResources.Employee
  `);

  const balanceVacaciones = await pool.request().query(`
    SELECT AVG(CAST(VacationHours AS FLOAT)) / 8.0 AS promedioDias
    FROM HumanResources.Employee
    WHERE CurrentFlag = 1
  `);

  const candidatosActivos = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN RecruitmentStage = 'Interviewed' THEN 1 ELSE 0 END) AS enEntrevistaFinal
    FROM HumanResources.JobCandidate
    WHERE RecruitmentStage NOT IN ('Hired', 'Rejected')
  `);

  // Total de candidatos sin importar la etapa (incluye contratados y rechazados)
  const totalCandidatos = await pool.request().query(`
    SELECT COUNT(*) AS total FROM HumanResources.JobCandidate
  `);

  const totalDepartamentos = await pool.request().query(`
    SELECT COUNT(*) AS total FROM HumanResources.Department
  `);

  const totalTurnos = await pool.request().query(`
    SELECT COUNT(*) AS total FROM HumanResources.Shift
  `);

  // "Shift Changes": usamos como proxy los registros de EmployeeDepartmentHistory
  // creados en los ultimos 7 dias (cambio de departamento/turno)
  const cambiosTurno = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN EndDate IS NULL THEN 1 ELSE 0 END) AS pendientesAprobacion
    FROM HumanResources.EmployeeDepartmentHistory
    WHERE StartDate >= DATEADD(DAY, -7, (SELECT MAX(StartDate) FROM HumanResources.EmployeeDepartmentHistory))
  `);

  res.json({
    exito: true,
    datos: {
      totalEmpleados: {
        total: totalEmpleados.recordset[0].total,
        activos: totalEmpleados.recordset[0].activos,
        inactivos: totalEmpleados.recordset[0].inactivos,
      },
      totalDepartamentos: totalDepartamentos.recordset[0].total,
      totalTurnos: totalTurnos.recordset[0].total,
      totalCandidatos: totalCandidatos.recordset[0].total,
      balanceVacacionesPromedioDias: Number(
        (balanceVacaciones.recordset[0].promedioDias || 0).toFixed(1)
      ),
      candidatosActivos: {
        total: candidatosActivos.recordset[0].total,
        enEntrevistaFinal: candidatosActivos.recordset[0].enEntrevistaFinal,
      },
      cambiosTurno: {
        total: cambiosTurno.recordset[0].total,
        pendientesAprobacion: cambiosTurno.recordset[0].pendientesAprobacion,
      },
    },
  });
});

// GET /api/dashboard/distribucion-departamentos
const distribucionPorDepartamento = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT d.GroupName AS division, d.Name AS departamento, COUNT(edh.BusinessEntityID) AS totalEmpleados
    FROM HumanResources.Department d
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
      ON edh.DepartmentID = d.DepartmentID AND edh.EndDate IS NULL
    GROUP BY d.GroupName, d.Name
    ORDER BY d.GroupName, totalEmpleados DESC
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/dashboard/distribucion-genero
const distribucionPorGenero = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT Gender AS genero, COUNT(*) AS total
    FROM HumanResources.Employee
    WHERE CurrentFlag = 1
    GROUP BY Gender
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/dashboard/estado-civil
const distribucionPorEstadoCivil = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT MaritalStatus AS estadoCivil, COUNT(*) AS total
    FROM HumanResources.Employee
    WHERE CurrentFlag = 1
    GROUP BY MaritalStatus
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/dashboard/contrataciones-recientes
const contratacionesRecientes = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT TOP 5
      e.BusinessEntityID AS idEmpleado,
      p.FirstName AS nombre,
      p.LastName AS apellido,
      p.FirstName + ' ' + p.LastName AS nombreCompleto,
      e.JobTitle AS cargo,
      d.Name AS departamento,
      e.HireDate AS fechaContratacion
    FROM HumanResources.Employee e
    INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
      ON edh.BusinessEntityID = e.BusinessEntityID AND edh.EndDate IS NULL
    LEFT JOIN HumanResources.Department d ON d.DepartmentID = edh.DepartmentID
    ORDER BY e.HireDate DESC
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/dashboard/candidatos-recientes  ("Ultimos Candidatos Registrados")
const candidatosRecientes = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT TOP 5
      jc.JobCandidateID AS idCandidato,
      COALESCE(jc.CandidateName, p.FirstName + ' ' + p.LastName, 'Candidato sin nombre registrado') AS nombre,
      jc.AppliedRole AS cargoAplicado,
      jc.RecruitmentStage AS etapa,
      CASE WHEN jc.Resume IS NOT NULL THEN 1 ELSE 0 END AS tieneHojaDeVida,
      jc.ModifiedDate AS fechaRegistro
    FROM HumanResources.JobCandidate jc
    LEFT JOIN Person.Person p ON p.BusinessEntityID = jc.BusinessEntityID
    ORDER BY jc.ModifiedDate DESC
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

// GET /api/dashboard/candidatos/:id/hoja-de-vida  (boton "ver"/"descargar" hoja de vida)
const hojaDeVidaCandidato = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query(`
      SELECT CAST(Resume AS NVARCHAR(MAX)) AS hojaDeVida
      FROM HumanResources.JobCandidate
      WHERE JobCandidateID = @id
    `);

  if (resultado.recordset.length === 0 || !resultado.recordset[0].hojaDeVida) {
    return res.status(404).json({ exito: false, mensaje: 'Este candidato no tiene hoja de vida registrada' });
  }

  res.json({ exito: true, datos: { hojaDeVida: resultado.recordset[0].hojaDeVida } });
});

// GET /api/dashboard/proximos-cumpleanos
const proximosCumpleanos = asyncHandler(async (req, res) => {
  const pool = await getPool();
  // Compara mes/dia de BirthDate contra la fecha actual, ignorando el anio
  const resultado = await pool.request().query(`
    SELECT TOP 10
      e.BusinessEntityID AS idEmpleado,
      p.FirstName + ' ' + p.LastName AS nombreCompleto,
      d.Name AS departamento,
      e.BirthDate AS fechaNacimiento,
      DATEDIFF(
        DAY,
        CAST(GETDATE() AS DATE),
        DATEADD(
          YEAR,
          CASE WHEN DATEFROMPARTS(YEAR(GETDATE()), MONTH(e.BirthDate), DAY(e.BirthDate)) < CAST(GETDATE() AS DATE)
               THEN YEAR(GETDATE()) + 1 - YEAR(e.BirthDate)
               ELSE YEAR(GETDATE()) - YEAR(e.BirthDate)
          END,
          e.BirthDate
        )
      ) AS diasFaltantes
    FROM HumanResources.Employee e
    INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
      ON edh.BusinessEntityID = e.BusinessEntityID AND edh.EndDate IS NULL
    LEFT JOIN HumanResources.Department d ON d.DepartmentID = edh.DepartmentID
    WHERE e.CurrentFlag = 1
    ORDER BY diasFaltantes ASC
  `);
  res.json({ exito: true, datos: resultado.recordset });
});

module.exports = {
  obtenerEstadisticas,
  distribucionPorDepartamento,
  distribucionPorGenero,
  distribucionPorEstadoCivil,
  contratacionesRecientes,
  candidatosRecientes,
  hojaDeVidaCandidato,
  proximosCumpleanos,
};