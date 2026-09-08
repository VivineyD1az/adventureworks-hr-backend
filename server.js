require('dotenv').config();

const { getPool, ensureAdventureWorksExtensions } = require('./config/db');
const app = require('./app');

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 4000;

function startServer(port, host) {
  const server = app.listen(port, host, () => {
    const actualPort = server.address().port;
    console.log(`Servidor backend corriendo en http://localhost:${actualPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`El puerto ${port} ya está en uso. Cierra el proceso que lo ocupa o cambia la configuración.`);
      process.exit(1);
      return;
    }

    console.error('No se pudo iniciar el servidor.');
    console.error(err.message);
    process.exit(1);
  });
}

// Verifica la conexion a la BD antes de levantar el servidor
getPool()
  .then(async () => {
    await ensureAdventureWorksExtensions();
    startServer(PORT, HOST);
  })
  .catch((err) => {
    console.error('No se pudo iniciar el servidor porque fallo la conexion a la base de datos.');
    console.error(err.message);
    process.exit(1);
  });
