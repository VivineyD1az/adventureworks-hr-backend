const { sql, getPool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const ETAPAS_VALIDAS = ['Applied', 'Interviewed', 'Offer', 'Hired', 'Rejected'];

// GET /api/candidatos
// Devuelve los candidatos agrupados por etapa, como en las columnas del Kanban del mockup
const listarPipeline = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      JobCandidateID AS idCandidato,
      BusinessEntityID AS idEmpleadoReferido,
      AppliedRole AS cargoAplicado,
      Rating AS calificacion,
      RecruitmentStage AS etapa,
      ModifiedDate AS ultimaActualizacion
    FROM HumanResources.JobCandidate
    ORDER BY
      CASE RecruitmentStage
        WHEN 'Applied' THEN 1
        WHEN 'Interviewed' THEN 2
        WHEN 'Offer' THEN 3
        WHEN 'Hired' THEN 4
        ELSE 5
      END,
      ModifiedDate DESC
  `);

  const agrupado = { Applied: [], Interviewed: [], Offer: [], Hired: [], Rejected: [] };
  for (const fila of resultado.recordset) {
    agrupado[fila.etapa]?.push(fila);
  }

  res.json({
    exito: true,
    datos: agrupado,
    resumen: {
      totalActivos: resultado.recordset.filter((c) => c.etapa !== 'Hired' && c.etapa !== 'Rejected').length,
      applied: agrupado.Applied.length,
      interviewed: agrupado.Interviewed.length,
      offer: agrupado.Offer.length,
      hired: agrupado.Hired.length,
    },
  });
});

// GET /api/candidatos/:id
const obtenerCandidato = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query(`
      SELECT
        JobCandidateID AS idCandidato,
        BusinessEntityID AS idEmpleadoReferido,
        AppliedRole AS cargoAplicado,
        Rating AS calificacion,
        RecruitmentStage AS etapa,
        CAST(Resume AS NVARCHAR(MAX)) AS hojaDeVida,
        ModifiedDate AS ultimaActualizacion
      FROM HumanResources.JobCandidate
      WHERE JobCandidateID = @id
    `);

  if (resultado.recordset.length === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Candidato no encontrado' });
  }
  res.json({ exito: true, datos: resultado.recordset[0] });
});

// POST /api/candidatos  (boton "New Job Posting" / candidato aplica a una vacante)
const crearCandidato = asyncHandler(async (req, res) => {
  const { cargoAplicado, hojaDeVida } = req.body;
  if (!cargoAplicado) {
    return res.status(400).json({ exito: false, mensaje: 'cargoAplicado es obligatorio' });
  }

  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('cargoAplicado', sql.NVarChar, cargoAplicado)
    .input('hojaDeVida', sql.Xml, hojaDeVida || null)
    .query(`
      INSERT INTO HumanResources.JobCandidate (BusinessEntityID, Resume, AppliedRole, RecruitmentStage, ModifiedDate)
      OUTPUT INSERTED.JobCandidateID
      VALUES (NULL, @hojaDeVida, @cargoAplicado, 'Applied', GETDATE())
    `);

  res.status(201).json({ exito: true, datos: { idCandidato: resultado.recordset[0].JobCandidateID } });
});

// PUT /api/candidatos/:id/etapa  (mover la tarjeta entre columnas del Kanban)
const cambiarEtapa = asyncHandler(async (req, res) => {
  const { etapa } = req.body;
  if (!ETAPAS_VALIDAS.includes(etapa)) {
    return res.status(400).json({
      exito: false,
      mensaje: `etapa invalida. Valores permitidos: ${ETAPAS_VALIDAS.join(', ')}`,
    });
  }

  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .input('etapa', sql.NVarChar, etapa)
    .query(`
      UPDATE HumanResources.JobCandidate
      SET RecruitmentStage = @etapa, ModifiedDate = GETDATE()
      WHERE JobCandidateID = @id
    `);

  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Candidato no encontrado' });
  }
  res.json({ exito: true, mensaje: `Candidato movido a la etapa "${etapa}"` });
});

// POST /api/candidatos/:id/contratar  (boton "Hire Candidate")
// Convierte al candidato en un Employee real: crea Person + Employee + asignacion de depto/turno + pago
const contratarCandidato = asyncHandler(async (req, res) => {
  const { nombre, apellido, loginId, numeroIdentificacion, fechaNacimiento, idDepartamento, idTurno, tarifa } = req.body;

  if (!nombre || !apellido || !loginId || !idDepartamento || !idTurno || !tarifa) {
    return res.status(400).json({
      exito: false,
      mensaje: 'Faltan campos obligatorios: nombre, apellido, loginId, idDepartamento, idTurno, tarifa',
    });
  }

  const pool = await getPool();

  const candidato = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query('SELECT JobCandidateID, AppliedRole, RecruitmentStage FROM HumanResources.JobCandidate WHERE JobCandidateID = @id');

  if (candidato.recordset.length === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Candidato no encontrado' });
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const entidadNueva = await new sql.Request(transaction).query(`
      INSERT INTO Person.BusinessEntity (rowguid, ModifiedDate)
      OUTPUT INSERTED.BusinessEntityID
      VALUES (NEWID(), GETDATE())
    `);
    const idNuevoEmpleado = entidadNueva.recordset[0].BusinessEntityID;

    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevoEmpleado)
      .input('nombre', sql.NVarChar, nombre)
      .input('apellido', sql.NVarChar, apellido)
      .query(`
        INSERT INTO Person.Person (BusinessEntityID, PersonType, NameStyle, FirstName, LastName, EmailPromotion, rowguid, ModifiedDate)
        VALUES (@id, 'EM', 0, @nombre, @apellido, 0, NEWID(), GETDATE())
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevoEmpleado)
      .input('numeroIdentificacion', sql.NVarChar, numeroIdentificacion || String(idNuevoEmpleado).padStart(9, '0'))
      .input('loginId', sql.NVarChar, loginId)
      .input('cargo', sql.NVarChar, candidato.recordset[0].AppliedRole || 'Sin especificar')
      .input('fechaNacimiento', sql.Date, fechaNacimiento || '1990-01-01')
      .query(`
        INSERT INTO HumanResources.Employee
          (BusinessEntityID, NationalIDNumber, LoginID, JobTitle, BirthDate, MaritalStatus,
           Gender, HireDate, SalariedFlag, VacationHours, SickLeaveHours, CurrentFlag, rowguid, ModifiedDate)
        VALUES
          (@id, @numeroIdentificacion, @loginId, @cargo, @fechaNacimiento, 'S', 'M', GETDATE(), 0, 0, 0, 1, NEWID(), GETDATE())
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevoEmpleado)
      .input('idDepartamento', sql.SmallInt, idDepartamento)
      .input('idTurno', sql.TinyInt, idTurno)
      .query(`
        INSERT INTO HumanResources.EmployeeDepartmentHistory (BusinessEntityID, DepartmentID, ShiftID, StartDate, ModifiedDate)
        VALUES (@id, @idDepartamento, @idTurno, GETDATE(), GETDATE())
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevoEmpleado)
      .input('tarifa', sql.Money, tarifa)
      .query(`
        INSERT INTO HumanResources.EmployeePayHistory (BusinessEntityID, RateChangeDate, Rate, PayFrequency, ModifiedDate)
        VALUES (@id, GETDATE(), @tarifa, 2, GETDATE())
      `);

    // Vincula el candidato con el nuevo empleado y lo mueve a la etapa "Hired"
    await new sql.Request(transaction)
      .input('idCandidato', sql.Int, req.params.id)
      .input('idEmpleado', sql.Int, idNuevoEmpleado)
      .query(`
        UPDATE HumanResources.JobCandidate
        SET BusinessEntityID = @idEmpleado, RecruitmentStage = 'Hired', ModifiedDate = GETDATE()
        WHERE JobCandidateID = @idCandidato
      `);

    await transaction.commit();

    res.status(201).json({
      exito: true,
      mensaje: 'Candidato contratado y convertido en empleado correctamente',
      datos: { idEmpleado: idNuevoEmpleado },
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

// DELETE /api/candidatos/:id
const eliminarCandidato = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query('DELETE FROM HumanResources.JobCandidate WHERE JobCandidateID = @id');

  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Candidato no encontrado' });
  }
  res.json({ exito: true, mensaje: 'Candidato eliminado correctamente' });
});

module.exports = {
  listarPipeline,
  obtenerCandidato,
  crearCandidato,
  cambiarEtapa,
  contratarCandidato,
  eliminarCandidato,
};
