USE AdventureWorks2025; 
GO

-- 1. Columna para guardar el hash de la contraseña (bcrypt genera hashes de 60 caracteres)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'PasswordHash'
    AND Object_ID = Object_ID(N'HumanResources.Employee')
)
BEGIN
    ALTER TABLE HumanResources.Employee
    ADD PasswordHash VARCHAR(100) NULL;
END
GO
 
-- 2. Columna opcional para forzar cambio de contraseña en el primer login
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'MustChangePassword'
    AND Object_ID = Object_ID(N'HumanResources.Employee')
)
BEGIN
    ALTER TABLE HumanResources.Employee
    ADD MustChangePassword BIT NOT NULL DEFAULT 1;
END
GO
 
-- 3. Columna opcional para bloquear el acceso a un empleado sin tener que darlo de baja (CurrentFlag)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'AccountLocked'
    AND Object_ID = Object_ID(N'HumanResources.Employee')
)
BEGIN
    ALTER TABLE HumanResources.Employee
    ADD AccountLocked BIT NOT NULL DEFAULT 0;
END
GO