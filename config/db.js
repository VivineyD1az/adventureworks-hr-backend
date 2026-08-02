const sql = require('mssql');
require('dotenv').config();

// Configuracion de conexion a SQL Server usando autenticacion SQL (usuario/password)
const dbConfig = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    instanceName: process.env.DB_INSTANCE || undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Pool de conexiones reutilizable en toda la app (patron recomendado por mssql)
let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then((pool) => {
        console.log('Conectado correctamente a SQL Server:', process.env.DB_DATABASE);
        return pool;
      })
      .catch((err) => {
        console.error('Error al conectar a SQL Server:', err.message);
        poolPromise = null; // permite reintentar en la siguiente peticion
        throw err;
      });
  }
  return poolPromise;
}

async function ensureAdventureWorksExtensions() {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('HumanResources.Employee', 'PasswordHash') IS NULL
    BEGIN
      ALTER TABLE HumanResources.Employee ADD PasswordHash VARCHAR(100) NULL;
    END;

    IF COL_LENGTH('HumanResources.Employee', 'MustChangePassword') IS NULL
    BEGIN
      ALTER TABLE HumanResources.Employee ADD MustChangePassword BIT NOT NULL CONSTRAINT DF_Employee_MustChangePassword DEFAULT 1;
    END;

    IF COL_LENGTH('HumanResources.Employee', 'AccountLocked') IS NULL
    BEGIN
      ALTER TABLE HumanResources.Employee ADD AccountLocked BIT NOT NULL CONSTRAINT DF_Employee_AccountLocked DEFAULT 0;
    END;

    IF COL_LENGTH('HumanResources.JobCandidate', 'RecruitmentStage') IS NULL
    BEGIN
      ALTER TABLE HumanResources.JobCandidate ADD RecruitmentStage NVARCHAR(20) NOT NULL CONSTRAINT DF_JobCandidate_RecruitmentStage DEFAULT ('Applied');
    END;

    IF COL_LENGTH('HumanResources.JobCandidate', 'AppliedRole') IS NULL
    BEGIN
      ALTER TABLE HumanResources.JobCandidate ADD AppliedRole NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('HumanResources.JobCandidate', 'Rating') IS NULL
    BEGIN
      ALTER TABLE HumanResources.JobCandidate ADD Rating DECIMAL(2,1) NULL;
    END;
  `);
}

module.exports = { sql, getPool, ensureAdventureWorksExtensions };
