/*
  MIGRACION: Soporte para el Pipeline de Reclutamiento (pantalla "Recruitment")
  ---------------------------------------------------------------------------
  La tabla HumanResources.JobCandidate original de AdventureWorks NO tiene
  una columna que indique en que etapa del proceso esta el candidato
  (Applied / Interviewed / Offer / Hired). Como el diseno la necesita,
  agregamos 2 columnas nuevas SIN romper la estructura original.

  Ejecuta este script UNA sola vez sobre tu base de datos restaurada,
  usando SSMS o sqlcmd, antes de correr el backend.
*/

USE AdventureWorks2025; 
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('HumanResources.JobCandidate')
    AND name = 'RecruitmentStage'
)
BEGIN
    ALTER TABLE HumanResources.JobCandidate
    ADD RecruitmentStage NVARCHAR(20) NOT NULL
        CONSTRAINT DF_JobCandidate_RecruitmentStage DEFAULT ('Applied')
        CONSTRAINT CK_JobCandidate_RecruitmentStage
            CHECK (RecruitmentStage IN ('Applied', 'Interviewed', 'Offer', 'Hired', 'Rejected'));
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('HumanResources.JobCandidate')
    AND name = 'AppliedRole'
)
BEGIN
    -- Rol/cargo al que aplica el candidato (el mockup lo muestra: "Senior Frontend Dev", etc.)
    ALTER TABLE HumanResources.JobCandidate
    ADD AppliedRole NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('HumanResources.JobCandidate')
    AND name = 'Rating'
)
BEGIN
    -- Calificacion mostrada en las tarjetas del mockup (ej. 4.8, 4.2)
    ALTER TABLE HumanResources.JobCandidate
    ADD Rating DECIMAL(2,1) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_EmployeeDepartmentHistory_Active'
      AND object_id = OBJECT_ID('HumanResources.EmployeeDepartmentHistory')
)
BEGIN
    CREATE UNIQUE INDEX UX_EmployeeDepartmentHistory_Active
    ON HumanResources.EmployeeDepartmentHistory (BusinessEntityID)
    WHERE EndDate IS NULL;
END
GO

PRINT 'Migracion completada correctamente.';
