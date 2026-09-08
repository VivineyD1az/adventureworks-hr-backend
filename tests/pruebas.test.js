const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const mockQueryResults = [];
const mockRequestFactory = jest.fn();
const mockGetPool = jest.fn();

jest.mock('../config/db', () => ({
	getPool: mockGetPool,
	ensureAdventureWorksExtensions: jest.fn(),
	sql: {
		Int: 'Int',
		SmallInt: 'SmallInt',
		TinyInt: 'TinyInt',
		NVarChar: 'NVarChar',
		VarChar: 'VarChar',
		Char: jest.fn(() => 'Char'),
		Bit: 'Bit',
		Date: 'Date',
		Money: 'Money',
		Time: 'Time',
		Xml: 'Xml',
		ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' },
		Request: jest.fn(function Request() {
			return mockRequestFactory();
		}),
		Transaction: jest.fn(function Transaction() {
			this.begin = jest.fn();
			this.commit = jest.fn();
			this.rollback = jest.fn();
		}),
	},
}));

const app = require('../app');

function queueResults(...results) {
	mockQueryResults.push(...results);
}

function createRequest() {
	return {
		input: jest.fn(function input() {
			return this;
		}),
		query: jest.fn(async () => mockQueryResults.shift() || { recordset: [], rowsAffected: [0] }),
	};
}

function configurePool() {
	mockRequestFactory.mockImplementation(createRequest);
	mockGetPool.mockResolvedValue({ request: createRequest });
}

function authHeader() {
	return `Bearer ${jwt.sign({ businessEntityId: 1 }, 'dev-secret-change-me')}`;
}

beforeEach(() => {
	mockQueryResults.length = 0;
	mockRequestFactory.mockReset();
	mockGetPool.mockReset();
	configurePool();
});

describe('infraestructura HTTP', () => {
	test('responde health y raiz', async () => {
		await request(app).get('/api/health').expect(200, {
			exito: true,
			mensaje: 'API HumanResources - AdventureWorks funcionando correctamente',
		});

		const response = await request(app).get('/');
		expect(response.body.health).toBe('/api/health');
	});

	test('devuelve 404 para rutas inexistentes', async () => {
		const response = await request(app).get('/api/no-existe');
		expect(response.status).toBe(404);
		expect(response.body).toEqual({ exito: false, mensaje: 'Ruta no encontrada' });
	});

	test('traduce errores de SQL y errores inesperados', async () => {
		queueResults({ recordset: [] });
		mockGetPool.mockRejectedValueOnce({ number: 2627, message: 'duplicado' });
		const duplicate = await request(app).get('/api/turnos');
		expect(duplicate.status).toBe(409);

		mockGetPool.mockRejectedValueOnce(new Error('fallo general'));
		const internal = await request(app).get('/api/turnos');
		expect(internal.status).toBe(500);
		expect(internal.body.exito).toBe(false);
	});
});

describe('autenticacion', () => {
	test('valida credenciales incompletas y usuarios no permitidos', async () => {
		const missing = await request(app).post('/api/auth/login').send({ loginId: 'ken0' });
		expect(missing.status).toBe(400);

		const forbidden = await request(app).post('/api/auth/login').send({ loginId: 'otro', password: 'secret' });
		expect(forbidden.status).toBe(403);
		expect(mockGetPool).not.toHaveBeenCalled();
	});

	test('protege perfil y rechaza tokens ausentes o invalidos', async () => {
		await request(app).get('/api/auth/perfil').expect(401);
		const invalid = await request(app).get('/api/auth/perfil').set('Authorization', 'Bearer invalido');
		expect(invalid.status).toBe(401);
		expect(invalid.body.mensaje).toBe('Token inválido o expirado');
	});

	test('obtiene perfil y valida cambio de password', async () => {
		queueResults({ recordset: [{ BusinessEntityID: 1, LoginID: 'ken0' }] });
		const profile = await request(app).get('/api/auth/perfil').set('Authorization', authHeader());
		expect(profile.status).toBe(200);
		expect(profile.body.datos.BusinessEntityID).toBe(1);

		const missing = await request(app).put('/api/auth/cambiar-password')
			.set('Authorization', authHeader()).send({ passwordActual: 'a' });
		expect(missing.status).toBe(400);
	});

	test('inicia sesion y cambia la contraseña correctamente', async () => {
		const passwordHash = await bcrypt.hash('secret123', 4);
		queueResults({ recordset: [{
			BusinessEntityID: 1,
			LoginID: 'adventure-works\\ken0',
			JobTitle: 'Developer',
			PasswordHash: passwordHash,
			MustChangePassword: 1,
			FirstName: 'Ken',
			LastName: 'Sanchez',
		}] });
		const login = await request(app).post('/api/auth/login').send({ loginId: 'KEN0', password: 'secret123' });
		expect(login.status).toBe(200);
		expect(login.body.datos.empleado.loginId).toBe('ken0');

		queueResults(
			{ recordset: [{ PasswordHash: passwordHash }] },
			{ rowsAffected: [1] },
		);
		const changed = await request(app).put('/api/auth/cambiar-password')
			.set('Authorization', authHeader())
			.send({ passwordActual: 'secret123', passwordNueva: 'newsecret' });
		expect(changed.status).toBe(200);
		expect(changed.body.mensaje).toBe('Contraseña actualizada correctamente');
	});
});

describe('empleados', () => {
	test('lista con paginacion y obtiene detalle con pagos', async () => {
		queueResults(
			{ recordset: [{ idEmpleado: 1, nombre: 'Ken', totalRegistros: 1 }] },
			{ recordset: [{ idEmpleado: 1, nombre: 'Ken' }] },
			{ recordset: [{ fechaCambio: '2026-01-01', tarifa: 20 }] },
		);
		const list = await request(app).get('/api/empleados?estado=activo&pagina=2&limite=10');
		expect(list.status).toBe(200);
		expect(list.body.paginacion).toEqual({ total: 1, pagina: 2, limite: 10, totalPaginas: 1 });
		const detail = await request(app).get('/api/empleados/1');
		expect(detail.body.datos.historialPagos).toHaveLength(1);
	});

	test('devuelve 404 al consultar o actualizar empleado inexistente', async () => {
		queueResults({ recordset: [] });
		expect((await request(app).get('/api/empleados/999')).status).toBe(404);

		queueResults({ rowsAffected: [0] });
		expect((await request(app).put('/api/empleados/999').send({ cargo: 'x' })).status).toBe(404);
	});

	test('valida onboarding y desactivacion de empleado inexistente', async () => {
		const missing = await request(app).post('/api/empleados').send({ nombre: 'Ken' });
		expect(missing.status).toBe(400);

		queueResults({ recordset: [] });
		const response = await request(app).delete('/api/empleados/999');
		expect(response.status).toBe(404);
	});

	test('crea y desactiva un empleado mediante transacciones', async () => {
		queueResults(
			{ recordset: [{ BusinessEntityID: 42 }] },
			{ recordset: [] },
			{ recordset: [] },
			{ recordset: [] },
			{ recordset: [] },
		);
		const created = await request(app).post('/api/empleados').send({
			nombre: 'Ken', apellido: 'Sanchez', loginId: 'ken0', cargo: 'Developer',
			idDepartamento: 1, idTurno: 1, tarifa: 25,
		});
		expect(created.status).toBe(201);
		expect(created.body.datos.idEmpleado).toBe(42);

		queueResults(
			{ recordset: [{ CurrentFlag: 1 }] },
			{ rowsAffected: [1] },
			{ rowsAffected: [1] },
		);
		const deactivated = await request(app).delete('/api/empleados/42');
		expect(deactivated.status).toBe(200);
	});
});

describe('departamentos y turnos', () => {
	test('lista departamentos agrupados y calcula resumen', async () => {
		queueResults(
			{ recordset: [{ idDepartamento: 1, division: 'Engineering', nombre: 'Research', totalEmpleados: 2, turnosActivos: 'Day, Night' }] },
			{ recordset: [{ totalHeadcount: 2, turnosActivos: 3 }] },
			{ recordset: [{ presupuestoMensualEstimado: 1234.6 }] },
		);
		const response = await request(app).get('/api/departamentos');
		expect(response.status).toBe(200);
		expect(response.body.datos.divisiones.Engineering[0].turnosActivos).toEqual(['Day', 'Night']);
		expect(response.body.datos.resumen.presupuestoMensualEstimado).toBe(1235);
	});

	test('ejecuta CRUD de departamento y turno', async () => {
		queueResults({ recordset: [{ idDepartamento: 1, nombre: 'Sales' }] });
		expect((await request(app).get('/api/departamentos/1')).status).toBe(200);
		queueResults({ recordset: [{ DepartmentID: 9 }] });
		expect((await request(app).post('/api/departamentos').send({ nombre: 'QA', division: 'Engineering' })).status).toBe(201);
		queueResults({ rowsAffected: [1] }, { rowsAffected: [1] });
		expect((await request(app).put('/api/departamentos/1').send({ nombre: 'QA' })).status).toBe(200);
		expect((await request(app).delete('/api/departamentos/1')).status).toBe(200);

		queueResults({ recordset: [{ idTurno: 1, nombre: 'Day', totalEmpleadosAsignados: 2 }] });
		expect((await request(app).get('/api/turnos')).status).toBe(200);
		queueResults({ recordset: [{ idTurno: 1, nombre: 'Day' }] });
		expect((await request(app).get('/api/turnos/1')).status).toBe(200);
		queueResults({ recordset: [{ ShiftID: 4 }] });
		expect((await request(app).post('/api/turnos').send({ nombre: 'Late', horaInicio: '15:00', horaFin: '23:00' })).status).toBe(201);
		queueResults({ rowsAffected: [1] }, { rowsAffected: [1] });
		expect((await request(app).put('/api/turnos/1').send({ nombre: 'Updated' })).status).toBe(200);
		expect((await request(app).delete('/api/turnos/1')).status).toBe(200);
	});

	test('valida altas y fechas de asignaciones', async () => {
		expect((await request(app).post('/api/departamentos').send({ nombre: 'x' })).status).toBe(400);
		expect((await request(app).post('/api/turnos').send({ nombre: 'x' })).status).toBe(400);
		expect((await request(app).post('/api/departamentos/1/asignaciones').send({ idEmpleado: 1, idTurno: 1, fechaInicio: 'mal' })).status).toBe(400);
		expect((await request(app).post('/api/departamentos/1/asignaciones').send({ idEmpleado: 1, idTurno: 1, fechaInicio: '2026-02-02', fechaFin: '2026-01-01' })).status).toBe(400);
		expect((await request(app).put('/api/departamentos/1/asignaciones/1').send({})).status).toBe(400);
	});

	test('lista empleados de departamento y maneja asignaciones ausentes', async () => {
		queueResults({ recordset: [{ idEmpleado: 1, nombreCompleto: 'Ken 0' }] });
		expect((await request(app).get('/api/departamentos/1/empleados')).status).toBe(200);
		queueResults({ rowsAffected: [0] }, { rowsAffected: [0] });
		expect((await request(app).put('/api/departamentos/1/asignaciones/1').send({ idTurno: 2 })).status).toBe(404);
		expect((await request(app).delete('/api/departamentos/1/asignaciones/1')).status).toBe(404);
	});

	test('asigna y actualiza un empleado en una transaccion', async () => {
		queueResults(
			{ recordset: [{ empleadoValido: 1, departamentoValido: 1, turnoValido: 1, asignacionActual: 0 }] },
			{ rowsAffected: [1] },
			{ rowsAffected: [1] },
		);
		const assigned = await request(app).post('/api/departamentos/1/asignaciones').send({
			idEmpleado: 1, idTurno: 2, fechaInicio: '2026-01-01',
		});
		expect(assigned.status).toBe(201);

		queueResults({ rowsAffected: [1] });
		const updated = await request(app).put('/api/departamentos/1/asignaciones/1').send({ idTurno: 3 });
		expect(updated.status).toBe(200);
	});
});

describe('dashboard', () => {
	test('expone estadisticas y distribuciones', async () => {
		queueResults(
			{ recordset: [{ total: 10, activos: 8, inactivos: 2 }] },
			{ recordset: [{ promedioDias: 16.25 }] },
			{ recordset: [{ total: 3, enEntrevistaFinal: 1 }] },
			{ recordset: [{ total: 5 }] },
			{ recordset: [{ total: 4 }] },
			{ recordset: [{ total: 3 }] },
			{ recordset: [{ total: 2, pendientesAprobacion: 1 }] },
			{ recordset: [{ division: 'Engineering', departamento: 'Research', totalEmpleados: 2 }] },
			{ recordset: [{ genero: 'M', total: 2 }] },
			{ recordset: [{ estadoCivil: 'S', total: 2 }] },
		);
		const stats = await request(app).get('/api/dashboard/stats');
		expect(stats.body.datos.balanceVacacionesPromedioDias).toBe(16.3);
		expect((await request(app).get('/api/dashboard/distribucion-departamentos')).status).toBe(200);
		expect((await request(app).get('/api/dashboard/distribucion-genero')).status).toBe(200);
		expect((await request(app).get('/api/dashboard/estado-civil')).status).toBe(200);
	});

	test('expone listados recientes, cumpleaños y hoja de vida', async () => {
		queueResults(
			{ recordset: [{ idEmpleado: 1 }] },
			{ recordset: [{ idCandidato: 1 }] },
			{ recordset: [{ hojaDeVida: '<resume />' }] },
			{ recordset: [{ idEmpleado: 1 }] },
		);
		expect((await request(app).get('/api/dashboard/contrataciones-recientes')).status).toBe(200);
		expect((await request(app).get('/api/dashboard/candidatos-recientes')).status).toBe(200);
		expect((await request(app).get('/api/dashboard/candidatos/1/hoja-de-vida')).body.datos.hojaDeVida).toBe('<resume />');
		expect((await request(app).get('/api/dashboard/proximos-cumpleanos')).status).toBe(200);
	});

	test('informa cuando un candidato no tiene hoja de vida', async () => {
		queueResults({ recordset: [] });
		expect((await request(app).get('/api/dashboard/candidatos/1/hoja-de-vida')).status).toBe(404);
	});
});

describe('candidatos', () => {
	test('agrupa pipeline y valida operaciones', async () => {
		queueResults({ recordset: [
			{ idCandidato: 1, etapa: 'Applied' },
			{ idCandidato: 2, etapa: 'Hired' },
		] });
		const pipeline = await request(app).get('/api/candidatos');
		expect(pipeline.body.datos.Applied).toHaveLength(1);
		expect(pipeline.body.resumen.totalActivos).toBe(1);

		expect((await request(app).post('/api/candidatos').send({})).status).toBe(400);
		expect((await request(app).put('/api/candidatos/1/etapa').send({ etapa: 'Unknown' })).status).toBe(400);
		expect((await request(app).post('/api/candidatos/1/contratar').send({ nombre: 'Ken' })).status).toBe(400);
	});

	test('obtiene, crea, cambia etapa y elimina candidato', async () => {
		queueResults({ recordset: [{ idCandidato: 1, etapa: 'Applied' }] });
		expect((await request(app).get('/api/candidatos/1')).status).toBe(200);
		queueResults({ recordset: [{ JobCandidateID: 3 }] });
		expect((await request(app).post('/api/candidatos').send({ cargoAplicado: 'Developer' })).status).toBe(201);
		queueResults({ rowsAffected: [1] }, { rowsAffected: [1] });
		expect((await request(app).put('/api/candidatos/1/etapa').send({ etapa: 'Interviewed' })).status).toBe(200);
		expect((await request(app).delete('/api/candidatos/1')).status).toBe(200);
	});

	test('devuelve 404 para candidato inexistente', async () => {
		queueResults({ recordset: [] });
		expect((await request(app).get('/api/candidatos/999')).status).toBe(404);
		queueResults({ rowsAffected: [0] });
		expect((await request(app).put('/api/candidatos/999/etapa').send({ etapa: 'Offer' })).status).toBe(404);
		queueResults({ rowsAffected: [0] });
		expect((await request(app).delete('/api/candidatos/999')).status).toBe(404);
	});

	test('contrata un candidato y crea su empleado', async () => {
		queueResults(
			{ recordset: [{ JobCandidateID: 1, AppliedRole: 'Developer', RecruitmentStage: 'Offer' }] },
			{ recordset: [{ BusinessEntityID: 77 }] },
			{ recordset: [] },
			{ recordset: [] },
			{ recordset: [] },
			{ recordset: [] },
			{ rowsAffected: [1] },
		);
		const response = await request(app).post('/api/candidatos/1/contratar').send({
			nombre: 'Ken', apellido: 'Sanchez', loginId: 'ken0', idDepartamento: 1, idTurno: 1, tarifa: 25,
		});
		expect(response.status).toBe(201);
		expect(response.body.datos.idEmpleado).toBe(77);
	});
});
