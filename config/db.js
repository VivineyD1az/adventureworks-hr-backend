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

module.exports = { sql, getPool };
