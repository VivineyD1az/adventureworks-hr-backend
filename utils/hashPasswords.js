const bcrypt = require("bcrypt");
const { getPool } = require("../config/db");

const SALT_ROUNDS = 10;

async function asignarPasswordsIniciales() {
  try {
    const pool = await getPool();

    const { recordset: empleados } = await pool.request().query(`
      SELECT BusinessEntityID, LoginID, NationalIDNumber
      FROM HumanResources.Employee
      WHERE PasswordHash IS NULL
        AND CurrentFlag = 1
    `);

    console.log(`Empleados sin contraseña asignada: ${empleados.length}`);

    for (const emp of empleados) {
      const hash = await bcrypt.hash(String(emp.NationalIDNumber), SALT_ROUNDS);

      await pool
        .request()
        .input("BusinessEntityID", emp.BusinessEntityID)
        .input("PasswordHash", hash)
        .query(`
          UPDATE HumanResources.Employee
          SET PasswordHash = @PasswordHash,
              MustChangePassword = 1
          WHERE BusinessEntityID = @BusinessEntityID
        `);

      console.log(`OK -> ${emp.LoginID}`);
    }

    console.log("Listo. Todos los empleados activos ya tienen contraseña inicial.");
    process.exit(0);
  } catch (err) {
    console.error("Error asignando contraseñas iniciales:", err);
    process.exit(1);
  }
}

asignarPasswordsIniciales();