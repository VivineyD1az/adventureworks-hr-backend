const { sql, getPool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/empleados
// Soporta filtros: ?departamento=&turno=&estado=&busqueda=&pagina=&limite=
const listarEmpleados = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const {
    departamento,
    turno,
    estado, // 'activo' | 'inactivo'
    busqueda,
    pagina = 1,
    limite = 20,
  } = req.query;

  const offset = (Number(pagina) - 1) * Number(limite);
  const request = pool.request();

  let condiciones = [];

  if (departamento) {
    request.input('departamento', sql.NVarChar, departamento);
    condiciones.push('d.Name = @departamento');
  }
  if (turno) {
    request.input('turno', sql.NVarChar, turno);
    condiciones.push('s.Name = @turno');
  }
  if (estado === 'activo') {
    condiciones.push('e.CurrentFlag = 1');
  } else if (estado === 'inactivo') {
    condiciones.push('e.CurrentFlag = 0');
  }
  if (busqueda) {
    request.input('busqueda', sql.NVarChar, `%${busqueda}%`);
    condiciones.push(`(
      p.FirstName LIKE @busqueda OR
      p.LastName LIKE @busqueda OR
      e.LoginID LIKE @busqueda OR
      e.JobTitle LIKE @busqueda OR
      CAST(e.BusinessEntityID AS NVARCHAR) LIKE @busqueda
    )`);
  }

  const whereClause = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  request.input('offset', sql.Int, offset);
  request.input('limite', sql.Int, Number(limite));

  const query = `
    SELECT
      e.BusinessEntityID AS idEmpleado,
      p.FirstName AS nombre,
      p.LastName AS apellido,
      e.LoginID AS loginId,
      e.JobTitle AS cargo,
      d.Name AS departamento,
      s.Name AS turno,
      e.HireDate AS fechaContratacion,
      e.NationalIDNumber AS numeroIdentificacion,
      CASE WHEN e.CurrentFlag = 1 THEN 'ACTIVE' ELSE 'TERMINATED' END AS estado,
      COUNT(*) OVER() AS totalRegistros
    FROM HumanResources.Employee e
    INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
      ON edh.BusinessEntityID = e.BusinessEntityID AND edh.EndDate IS NULL
    LEFT JOIN HumanResources.Department d ON d.DepartmentID = edh.DepartmentID
    LEFT JOIN HumanResources.Shift s ON s.ShiftID = edh.ShiftID
    ${whereClause}
    ORDER BY e.BusinessEntityID
    OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
  `;

  const resultado = await request.query(query);
  const total = resultado.recordset[0]?.totalRegistros || 0;

  res.json({
    exito: true,
    datos: resultado.recordset.map(({ totalRegistros, ...resto }) => resto),
    paginacion: {
      total,
      pagina: Number(pagina),
      limite: Number(limite),
      totalPaginas: Math.ceil(total / Number(limite)),
    },
  });
});

// GET /api/empleados/:id
const obtenerEmpleado = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query(`
      SELECT
        e.BusinessEntityID AS idEmpleado,
        p.FirstName AS nombre,
        p.LastName AS apellido,
        e.LoginID AS loginId,
        e.JobTitle AS cargo,
        e.NationalIDNumber AS numeroIdentificacion,
        e.BirthDate AS fechaNacimiento,
        e.MaritalStatus AS estadoCivil,
        e.Gender AS genero,
        e.HireDate AS fechaContratacion,
        e.SalariedFlag AS asalariado,
        e.VacationHours AS horasVacaciones,
        e.SickLeaveHours AS horasIncapacidad,
        CASE WHEN e.CurrentFlag = 1 THEN 'ACTIVE' ELSE 'TERMINATED' END AS estado,
        d.DepartmentID AS idDepartamento,
        d.Name AS departamento,
        s.ShiftID AS idTurno,
        s.Name AS turno
      FROM HumanResources.Employee e
      INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
      LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
        ON edh.BusinessEntityID = e.BusinessEntityID AND edh.EndDate IS NULL
      LEFT JOIN HumanResources.Department d ON d.DepartmentID = edh.DepartmentID
      LEFT JOIN HumanResources.Shift s ON s.ShiftID = edh.ShiftID
      WHERE e.BusinessEntityID = @id
    `);

  if (resultado.recordset.length === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado' });
  }

  // Historial de pagos del empleado
  const historialPagos = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .query(`
      SELECT RateChangeDate AS fechaCambio, Rate AS tarifa, PayFrequency AS frecuenciaPago
      FROM HumanResources.EmployeePayHistory
      WHERE BusinessEntityID = @id
      ORDER BY RateChangeDate DESC
    `);

  res.json({
    exito: true,
    datos: { ...resultado.recordset[0], historialPagos: historialPagos.recordset },
  });
});

// POST /api/empleados  (boton "Onboard Employee")
// Crea Person + Employee + EmployeeDepartmentHistory + EmployeePayHistory en una sola transaccion
const crearEmpleado = asyncHandler(async (req, res) => {
  const {
    nombre,
    apellido,
    loginId,
    cargo,
    numeroIdentificacion,
    fechaNacimiento,
    estadoCivil, // 'S' | 'M'
    genero, // 'M' | 'F'
    fechaContratacion,
    asalariado = false,
    idDepartamento,
    idTurno,
    tarifa,
    frecuenciaPago = 2, // 1=mensual, 2=quincenal segun AdventureWorks
  } = req.body;

  if (!nombre || !apellido || !loginId || !cargo || !idDepartamento || !idTurno || !tarifa) {
    return res.status(400).json({
      exito: false,
      mensaje: 'Faltan campos obligatorios: nombre, apellido, loginId, cargo, idDepartamento, idTurno, tarifa',
    });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1) Person.BusinessEntity (fila base requerida por la llave foranea de Person.Person)
    const entidadNueva = await new sql.Request(transaction).query(`
      INSERT INTO Person.BusinessEntity (rowguid, ModifiedDate)
      OUTPUT INSERTED.BusinessEntityID
      VALUES (NEWID(), GETDATE())
    `);
    const idNuevo = entidadNueva.recordset[0].BusinessEntityID;

    // 2) Person.Person
    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevo)
      .input('nombre', sql.NVarChar, nombre)
      .input('apellido', sql.NVarChar, apellido)
      .query(`
        INSERT INTO Person.Person
          (BusinessEntityID, PersonType, NameStyle, FirstName, LastName, EmailPromotion, rowguid, ModifiedDate)
        VALUES
          (@id, 'EM', 0, @nombre, @apellido, 0, NEWID(), GETDATE())
      `);

    // 3) HumanResources.Employee
    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevo)
      .input('numeroIdentificacion', sql.NVarChar, numeroIdentificacion || String(idNuevo).padStart(9, '0'))
      .input('loginId', sql.NVarChar, loginId)
      .input('cargo', sql.NVarChar, cargo)
      .input('fechaNacimiento', sql.Date, fechaNacimiento || '1990-01-01')
      .input('estadoCivil', sql.Char(1), estadoCivil || 'S')
      .input('genero', sql.Char(1), genero || 'M')
      .input('fechaContratacion', sql.Date, fechaContratacion || new Date())
      .input('asalariado', sql.Bit, asalariado)
      .query(`
        INSERT INTO HumanResources.Employee
          (BusinessEntityID, NationalIDNumber, LoginID, JobTitle, BirthDate, MaritalStatus,
           Gender, HireDate, SalariedFlag, VacationHours, SickLeaveHours, CurrentFlag, rowguid, ModifiedDate)
        VALUES
          (@id, @numeroIdentificacion, @loginId, @cargo, @fechaNacimiento, @estadoCivil,
           @genero, @fechaContratacion, @asalariado, 0, 0, 1, NEWID(), GETDATE())
      `);

    // 4) HumanResources.EmployeeDepartmentHistory (asignacion inicial de depto/turno)
    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevo)
      .input('idDepartamento', sql.SmallInt, idDepartamento)
      .input('idTurno', sql.TinyInt, idTurno)
      .query(`
        INSERT INTO HumanResources.EmployeeDepartmentHistory
          (BusinessEntityID, DepartmentID, ShiftID, StartDate, ModifiedDate)
        VALUES
          (@id, @idDepartamento, @idTurno, GETDATE(), GETDATE())
      `);

    // 5) HumanResources.EmployeePayHistory (tarifa inicial)
    await new sql.Request(transaction)
      .input('id', sql.Int, idNuevo)
      .input('tarifa', sql.Money, tarifa)
      .input('frecuenciaPago', sql.TinyInt, frecuenciaPago)
      .query(`
        INSERT INTO HumanResources.EmployeePayHistory
          (BusinessEntityID, RateChangeDate, Rate, PayFrequency, ModifiedDate)
        VALUES
          (@id, GETDATE(), @tarifa, @frecuenciaPago, GETDATE())
      `);

    await transaction.commit();

    res.status(201).json({
      exito: true,
      mensaje: 'Empleado creado correctamente',
      datos: { idEmpleado: idNuevo },
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

// PUT /api/empleados/:id
// Actualiza datos basicos del empleado (no reasigna departamento/turno; para eso ver departmentController)
const actualizarEmpleado = asyncHandler(async (req, res) => {
  const { cargo, numeroIdentificacion, estadoCivil, genero, asalariado, horasVacaciones, horasIncapacidad } = req.body;

  const pool = await getPool();
  const resultado = await pool
    .request()
    .input('id', sql.Int, req.params.id)
    .input('cargo', sql.NVarChar, cargo)
    .input('numeroIdentificacion', sql.NVarChar, numeroIdentificacion)
    .input('estadoCivil', sql.Char(1), estadoCivil)
    .input('genero', sql.Char(1), genero)
    .input('asalariado', sql.Bit, asalariado)
    .input('horasVacaciones', sql.SmallInt, horasVacaciones)
    .input('horasIncapacidad', sql.SmallInt, horasIncapacidad)
    .query(`
      UPDATE HumanResources.Employee
      SET
        JobTitle = COALESCE(@cargo, JobTitle),
        NationalIDNumber = COALESCE(@numeroIdentificacion, NationalIDNumber),
        MaritalStatus = COALESCE(@estadoCivil, MaritalStatus),
        Gender = COALESCE(@genero, Gender),
        SalariedFlag = COALESCE(@asalariado, SalariedFlag),
        VacationHours = COALESCE(@horasVacaciones, VacationHours),
        SickLeaveHours = COALESCE(@horasIncapacidad, SickLeaveHours),
        ModifiedDate = GETDATE()
      WHERE BusinessEntityID = @id
    `);

  if (resultado.rowsAffected[0] === 0) {
    return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado' });
  }

  res.json({ exito: true, mensaje: 'Empleado actualizado correctamente' });
});

// DELETE /api/empleados/:id
// Baja logica: marca CurrentFlag=0 y cierra el registro de EmployeeDepartmentHistory abierto
const desactivarEmpleado = asyncHandler(async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const empleado = await new sql.Request(transaction)
      .input('id', sql.Int, req.params.id)
      .query('SELECT CurrentFlag FROM HumanResources.Employee WHERE BusinessEntityID = @id');

    if (empleado.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado' });
    }

    await new sql.Request(transaction)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE HumanResources.Employee
        SET CurrentFlag = 0, ModifiedDate = GETDATE()
        WHERE BusinessEntityID = @id
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE HumanResources.EmployeeDepartmentHistory
        SET EndDate = GETDATE(), ModifiedDate = GETDATE()
        WHERE BusinessEntityID = @id AND EndDate IS NULL
      `);

    await transaction.commit();
    res.json({ exito: true, mensaje: 'Empleado desactivado (baja logica) correctamente' });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

module.exports = {
  listarEmpleados,
  obtenerEmpleado,
  crearEmpleado,
  actualizarEmpleado,
  desactivarEmpleado,
};
