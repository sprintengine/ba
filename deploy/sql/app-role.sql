-- The role the API runs as: an ordinary login role, so row-level security applies to it (roles a managed provider
-- creates for you often have BYPASSRLS, which would switch tenant isolation off). Run as the owner that runs the
-- migrations, before the first deploy and again after it (it is idempotent):
--
--   psql "$OWNER_DATABASE_URL" -f deploy/sql/app-role.sql
--   psql "$OWNER_DATABASE_URL" -c '\password bookanything_app'    -- once: psql hashes it, nothing logs the password
--
-- Default privileges give the role the tables later migrations create, so it is not rerun per deploy.
\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bookanything_app') THEN
        CREATE ROLE bookanything_app LOGIN;
    END IF;
END
$$;
ALTER ROLE bookanything_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT USAGE ON SCHEMA public TO bookanything_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookanything_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO bookanything_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bookanything_app;

-- Objects the owner (whoever runs this, i.e. the migration role) creates from now on.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bookanything_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bookanything_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO bookanything_app;

-- The migration history is the owner's alone (it exists once the first deploy has migrated: hence the second run).
DO $$
BEGIN
    IF to_regclass('public.databasechangelog') IS NOT NULL THEN
        REVOKE ALL ON public.databasechangelog, public.databasechangeloglock FROM bookanything_app;
    END IF;
END
$$;

SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'bookanything_app';
