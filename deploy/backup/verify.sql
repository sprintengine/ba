-- Checks a restored database looks like bookanything's (restore.sh runs it). Fails loudly when something is missing.
\set ON_ERROR_STOP on

DO $$
DECLARE
    changesets int;
    exclusions int;
    rls_tables int;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
        RAISE EXCEPTION 'btree_gist is missing: the booking exclusion constraint cannot exist';
    END IF;
    SELECT count(*) INTO changesets FROM databasechangelog;
    IF changesets = 0 THEN
        RAISE EXCEPTION 'no applied migrations recorded';
    END IF;
    SELECT count(*) INTO exclusions FROM pg_constraint
     WHERE contype = 'x' AND conrelid = 'public.booking_allocations'::regclass;
    IF exclusions = 0 THEN
        RAISE EXCEPTION 'the double-booking exclusion constraint on booking_allocations is missing';
    END IF;
    SELECT count(*) INTO rls_tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity;
    IF rls_tables = 0 THEN
        RAISE EXCEPTION 'no table has row-level security forced';
    END IF;
    RAISE NOTICE 'ok: % changesets, exclusion constraint present, % tables with forced row-level security',
        changesets, rls_tables;
END
$$;

SELECT (SELECT id FROM databasechangelog ORDER BY orderexecuted DESC LIMIT 1) AS last_changeset,
       (SELECT count(*) FROM businesses) AS businesses,
       (SELECT count(*) FROM bookings) AS bookings,
       (SELECT max(created_at) FROM bookings) AS newest_booking;
