const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getPool } = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

const dashboardRoutes = require('./routes/dashboardRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const candidateRoutes = require('./routes/candidateRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Ruta de verificacion rapida (util para probar que el servidor esta arriba)
app.get('/api/health', (req, res) => {
  res.json({ exito: true, mensaje: 'API HumanResources - AdventureWorks funcionando correctamente' });
});

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

const PORT = process.env.PORT || 4000;

// Verifica la conexion a la BD antes de levantar el servidor
getPool()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('No se pudo iniciar el servidor porque fallo la conexion a la base de datos.');
    console.error(err.message);
    process.exit(1);
  });
