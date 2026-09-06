const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getPool, ensureAdventureWorksExtensions } = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

const dashboardRoutes = require('./routes/dashboardRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    exito: true,
    mensaje: 'API HumanResources - AdventureWorks funcionando correctamente',
    health: '/api/health',
  });
});

// Ruta de verificacion rapida (util para probar que el servidor esta arriba)
app.get('/api/health', (req, res) => {
  res.json({ exito: true, mensaje: 'API HumanResources - AdventureWorks funcionando correctamente' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/empleados', employeeRoutes);
app.use('/api/departamentos', departmentRoutes);
app.use('/api/turnos', shiftRoutes);
app.use('/api/candidatos', candidateRoutes);

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ exito: false, mensaje: 'Ruta no encontrada' });
});

// Middleware de errores (siempre al final)
app.use(errorHandler);

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
