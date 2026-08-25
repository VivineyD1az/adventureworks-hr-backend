# Backend HR Management System — AdventureWorks (sector HumanResources)

Backend en **Node.js + Express + SQL Server**, construido sobre el esquema `HumanResources` de AdventureWorks, siguiendo el diseño de las 4 pantallas: Dashboard, Directory, Departments & Shifts y Recruitment.

## 1. Requisitos previos

- Node.js 18+ instalado
- SQL Server 2025 con la base AdventureWorks ya restaurada
- Autenticación SQL habilitada en el servidor (modo mixto)

## 2. Instalación

```bash
cd backend
npm install
```

## 3. Configurar la conexión a la base de datos

```bash
cp .env.example .env
```

Edita `.env` con tus datos reales (servidor, base de datos, usuario y contraseña).

## 4. Ejecutar la migración obligatoria

Antes de correr el backend, ejecuta **una sola vez** el script `db/migrations.sql` en SSMS (o `sqlcmd`) contra tu base de datos. Este script agrega las columnas necesarias para el pipeline de reclutamiento (`RecruitmentStage`, `AppliedRole`, `Rating`) y crea una restricción para impedir que un empleado tenga más de una asignación activa.

## 5. Levantar el servidor

```bash
npm run dev    # con nodemon, recarga automática
# o
npm start
```

Si todo está bien configurado verás:
```
Conectado correctamente a SQL Server: AdventureWorks2022
Servidor backend corriendo en http://localhost:4000
```

Prueba con: `GET http://localhost:4000/api/health`

### Autenticación

El login acepta el usuario corto, por ejemplo `{ "loginId": "ken0", "password": "..." }`, aunque AdventureWorks almacene `adventure-works\\ken0`. También se acepta el LoginID completo. Los usuarios permitidos se configuran opcionalmente con `ALLOWED_LOGINIDS=ken0,terri0` en `.env`.

## 6. Estructura del proyecto

```
backend/
├── config/db.js              # Pool de conexión a SQL Server
├── controllers/               # Lógica de negocio por módulo
├── routes/                    # Definición de endpoints
├── middlewares/errorHandler.js
├── utils/asyncHandler.js
├── db/migrations.sql          # Script de migración (columnas nuevas)
├── server.js                  # Punto de entrada
└── .env.example
```

## 7. Endpoints disponibles

### Dashboard
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/dashboard/stats` | Tarjetas: total empleados, vacaciones, candidatos activos, cambios de turno |
| GET | `/api/dashboard/distribucion-departamentos` | Gráfico de barras por departamento |
| GET | `/api/dashboard/distribucion-genero` | Gráfico circular de género |
| GET | `/api/dashboard/estado-civil` | Gráfico circular de estado civil |
| GET | `/api/dashboard/contrataciones-recientes` | Tabla "Recent Hires" |
| GET | `/api/dashboard/proximos-cumpleanos` | Lista "Upcoming Birthdays" |

### Empleados (Directory)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/empleados?departamento=&turno=&estado=&busqueda=&pagina=&limite=` | Listado con filtros y búsqueda |
| GET | `/api/empleados/:id` | Detalle + historial de pagos |
| POST | `/api/empleados` | Onboarding (crea Person + Employee + asignación + pago) |
| PUT | `/api/empleados/:id` | Editar datos del empleado |
| DELETE | `/api/empleados/:id` | Baja lógica (CurrentFlag = 0) |

### Departamentos y Turnos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/departamentos` | Agrupados por división, con headcount y presupuesto estimado |
| GET | `/api/departamentos/:id` | Detalle |
| GET | `/api/departamentos/:id/empleados` | Empleados asignados |
| POST | `/api/departamentos/:id/asignaciones` | Asignar/reasignar empleado; cierra automáticamente su asignación anterior |
| PUT | `/api/departamentos/:id/asignaciones/:idEmpleado` | Editar turno o fechas de una asignación activa |
| DELETE | `/api/departamentos/:id/asignaciones/:idEmpleado` | Cerrar una asignación activa |
| POST / PUT / DELETE | `/api/departamentos` | CRUD |
| GET / POST / PUT / DELETE | `/api/turnos` | CRUD de turnos |

La asignación recibe `{ "idEmpleado": 1, "idTurno": 2, "fechaInicio": "2026-08-23", "fechaFin": null }`. El `:id` de la ruta es el departamento nuevo. Las fechas son opcionales y usan `YYYY-MM-DD`; `fechaFin: null` mantiene la asignación activa. La operación valida las entidades, cierra la asignación vigente (`EndDate`) e inserta la nueva dentro de una sola transacción.

### Reclutamiento
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/candidatos` | Pipeline agrupado por etapa (Kanban) |
| GET | `/api/candidatos/:id` | Detalle + hoja de vida |
| POST | `/api/candidatos` | Nuevo candidato/aplicación |
| PUT | `/api/candidatos/:id/etapa` | Mover tarjeta entre columnas (`{ "etapa": "Interviewed" }`) |
| POST | `/api/candidatos/:id/contratar` | Botón "Hire Candidate" → crea el Employee real |
| DELETE | `/api/candidatos/:id` | Eliminar candidato |

## 8. Notas importantes para la sustentación

- **RecruitmentStage / AppliedRole / Rating**: columnas agregadas porque el diseño pide un Kanban de reclutamiento que AdventureWorks no soporta nativamente.
- **Payroll Budget**: es una **estimación** (tarifa vigente × 160 horas/mes), no un valor real de nómina, porque AdventureWorks no calcula presupuestos.
- **Vacant Positions**: no se implementó porque no existe ninguna tabla de vacantes en el esquema; se documentó como limitación conocida.
- **Shift Changes (Dashboard)**: se calculó como proxy usando los registros de `EmployeeDepartmentHistory` de los últimos 7 días.
- Todas las respuestas siguen el formato `{ exito: true/false, datos: ..., mensaje: ... }` para que el frontend maneje errores de forma consistente.
