const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getPool } = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const SALT_ROUNDS = 10;

const loginUser = async ({ loginId, password }) => {
  if (!loginId || !password) {
    return {
      statusCode: 400,
      body: {
        exito: false,
        datos: null,
        mensaje: "LoginID y contraseña son obligatorios",
      },
    };
  }

  const pool = await getPool();

  const { recordset } = await pool
    .request()
    .input("LoginID", loginId)
    .query(`
      SELECT
        e.BusinessEntityID,
        e.LoginID,
        e.JobTitle,
        e.PasswordHash,
        e.NationalIDNumber,
        e.MustChangePassword,
        e.CurrentFlag,
        p.FirstName,
        p.LastName
      FROM HumanResources.Employee e
      INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
      WHERE e.LoginID = @LoginID
    `);

  const empleado = recordset[0];

  if (!empleado) {
    return {
      statusCode: 401,
      body: {
        exito: false,
        datos: null,
        mensaje: "Credenciales inválidas",
      },
    };
  }

  let passwordValida = false;

  if (empleado.PasswordHash) {
    passwordValida = await bcrypt.compare(password, empleado.PasswordHash);
  } else if (empleado.NationalIDNumber) {
    passwordValida = String(password) === String(empleado.NationalIDNumber);
  }

  if (!passwordValida) {
    return {
      statusCode: 401,
      body: {
        exito: false,
        datos: null,
        mensaje: "Credenciales inválidas",
      },
    };
  }

  const token = jwt.sign(
    {
      businessEntityId: empleado.BusinessEntityID,
      loginId: empleado.LoginID,
      jobTitle: empleado.JobTitle,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    statusCode: 200,
    body: {
      exito: true,
      datos: {
        token,
        mustChangePassword: !!empleado.MustChangePassword,
        empleado: {
          businessEntityId: empleado.BusinessEntityID,
          loginId: empleado.LoginID,
          nombre: `${empleado.FirstName} ${empleado.LastName}`,
          cargo: empleado.JobTitle,
        },
      },
      mensaje: "Login exitoso",
    },
  };
};

const getPerfilUsuario = async (businessEntityId) => {
  const pool = await getPool();

  const { recordset } = await pool
    .request()
    .input("BusinessEntityID", businessEntityId)
    .query(`
      SELECT e.BusinessEntityID, e.LoginID, e.JobTitle, p.FirstName, p.LastName
      FROM HumanResources.Employee e
      INNER JOIN Person.Person p ON p.BusinessEntityID = e.BusinessEntityID
      WHERE e.BusinessEntityID = @BusinessEntityID
    `);

  const empleado = recordset[0];

  return {
    statusCode: 200,
    body: {
      exito: true,
      datos: empleado,
      mensaje: null,
    },
  };
};

const cambiarPasswordUsuario = async ({ businessEntityId, passwordActual, passwordNueva }) => {
  if (!passwordActual || !passwordNueva) {
    return {
      statusCode: 400,
      body: {
        exito: false,
        datos: null,
        mensaje: "Debes enviar la contraseña actual y la nueva",
      },
    };
  }

  if (passwordNueva.length < 8) {
    return {
      statusCode: 400,
      body: {
        exito: false,
        datos: null,
        mensaje: "La nueva contraseña debe tener al menos 8 caracteres",
      },
    };
  }

  const pool = await getPool();

  const { recordset } = await pool
    .request()
    .input("BusinessEntityID", businessEntityId)
    .query(`
      SELECT PasswordHash, NationalIDNumber FROM HumanResources.Employee
      WHERE BusinessEntityID = @BusinessEntityID
    `);

  const empleado = recordset[0];

  if (!empleado) {
    return {
      statusCode: 401,
      body: {
        exito: false,
        datos: null,
        mensaje: "No se pudo verificar la contraseña actual",
      },
    };
  }

  let passwordValida = false;

  if (empleado.PasswordHash) {
    passwordValida = await bcrypt.compare(passwordActual, empleado.PasswordHash);
  } else if (empleado.NationalIDNumber) {
    passwordValida = String(passwordActual) === String(empleado.NationalIDNumber);
  }

  if (!passwordValida) {
    return {
      statusCode: 401,
      body: {
        exito: false,
        datos: null,
        mensaje: "La contraseña actual es incorrecta",
      },
    };
  }

  const nuevoHash = await bcrypt.hash(passwordNueva, SALT_ROUNDS);

  await pool
    .request()
    .input("BusinessEntityID", businessEntityId)
    .input("PasswordHash", nuevoHash)
    .query(`
      UPDATE HumanResources.Employee
      SET PasswordHash = @PasswordHash,
          MustChangePassword = 0
      WHERE BusinessEntityID = @BusinessEntityID
    `);

  return {
    statusCode: 200,
    body: {
      exito: true,
      datos: null,
      mensaje: "Contraseña actualizada correctamente",
    },
  };
};

module.exports = {
  loginUser,
  getPerfilUsuario,
  cambiarPasswordUsuario,
};
