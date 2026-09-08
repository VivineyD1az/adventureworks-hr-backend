const sql = require('mssql');
require('dotenv').config();

// Configuracion de conexion a SQL Server / Azure SQL Database usando autenticacion SQL (usuario/password)
const dbConfig = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    // Azure SQL Database EXIGE conexion cifrada siempre (DB_ENCRYPT=true en el .env)
    encrypt: process.env.DB_ENCRYPT === 'true',
    // En Azure SQL siempre debe ser false (usa certificados validos de Microsoft)
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    // Solo aplica para SQL Server local con instancia con nombre (ej. SQLEXPRESS).
    // En Azure SQL debe quedar vacio/undefined, ya que Azure no usa instancias con nombre.
    instanceName: process.env.DB_INSTANCE || undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  // Azure SQL Database en modo "Sin servidor" (Serverless) se pausa automaticamente
  // cuando no hay actividad. Al reactivarse puede tardar hasta 30 segundos en la
  // primera conexion, por eso usamos timeouts mas generosos que el valor por defecto (15s).
  connectionTimeout: 30000,
  requestTimeout: 30000,
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

// Verifica y crea automaticamente, si hacen falta, las columnas extra que el
// sistema necesita y que no vienen en el AdventureWorks original: login (PasswordHash,
// MustChangePassword, AccountLocked) y reclutamiento (RecruitmentStage, AppliedRole, Rating).
// Se ejecuta una vez al arrancar el servidor, asi nadie se olvida de correr el .sql a mano.
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

    IF COL_LENGTH('HumanResources.JobCandidate', 'CandidateName') IS NULL
    BEGIN
      ALTER TABLE HumanResources.JobCandidate ADD CandidateName NVARCHAR(100) NULL;
    END;
  `);
}

module.exports = { sql, getPool, ensureAdventureWorksExtensions };