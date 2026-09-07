const express = require('express');
const cors = require('cors');
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

app.get('/api/health', (req, res) => {
  res.json({ exito: true, mensaje: 'API HumanResources - AdventureWorks funcionando correctamente' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/empleados', employeeRoutes);
app.use('/api/departamentos', departmentRoutes);
app.use('/api/turnos', shiftRoutes);
app.use('/api/candidatos', candidateRoutes);

app.use((req, res) => {
  res.status(404).json({ exito: false, mensaje: 'Ruta no encontrada' });
});

app.use(errorHandler);

module.exports = app;
