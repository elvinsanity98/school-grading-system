-- Supabase publishes every table of the "public" schema through its web API (PostgREST), and the
-- publishable ("anon") key that opens it is public by design. Without this migration anybody who
-- knows the project address could read and change learners' records.
--
-- The application connects with the database owner's login, which bypasses row-level security, so
-- turning RLS on with no policies closes the web API completely and changes nothing for the app.
--
-- Every future migration that adds a table must do the same (tests/postgres.test.ts checks this).
DO $$
DECLARE
  t record;
  r text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- Belt and braces: also remove table privileges from the web-API roles wherever those roles exist
  -- (they do on Supabase, not on plain PostgreSQL), including for tables created later.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
