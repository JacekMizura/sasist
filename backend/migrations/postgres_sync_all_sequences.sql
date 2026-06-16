-- Idempotent PostgreSQL sequence sync vs MAX(id) for SERIAL/IDENTITY integer PKs.
-- Application startup runs the same logic: backend.db.postgres_sequence_sync
--
-- Diagnostics (products example):
--   SELECT MAX(id) FROM products;
--   SELECT last_value, is_called FROM products_id_seq;
--
-- Manual single-table fix (products):
--   SELECT setval(
--     'products_id_seq',
--     (SELECT COALESCE(MAX(id), 0) + 1 FROM products),
--     false
--   );

DO $sync$
DECLARE
  r RECORD;
  seq_name text;
  max_val bigint;
  last_val bigint;
  called boolean;
  next_val bigint;
  fq_table text;
BEGIN
  FOR r IN
    SELECT
      ns.nspname AS schemaname,
      cl.relname AS tablename,
      att.attname AS columnname
    FROM pg_class cl
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_constraint con ON con.conrelid = cl.oid AND con.contype = 'p'
    CROSS JOIN LATERAL unnest(con.conkey) AS pk_col(attnum)
    JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = pk_col.attnum AND NOT att.attisdropped
    WHERE cl.relkind = 'r'
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND array_length(con.conkey, 1) = 1
  LOOP
    fq_table := format('%I.%I', r.schemaname, r.tablename);
    seq_name := pg_get_serial_sequence(fq_table, r.columnname);
    CONTINUE WHEN seq_name IS NULL;

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %s', r.columnname, fq_table) INTO max_val;

    SELECT s.last_value, s.is_called
      INTO last_val, called
      FROM pg_catalog.pg_sequences s
     WHERE s.schemaname = split_part(seq_name, '.', 1)
       AND s.sequencename = split_part(seq_name, '.', 2);

    IF called THEN
      next_val := last_val + 1;
    ELSE
      next_val := last_val;
    END IF;

    IF max_val = 0 THEN
      IF next_val <> 1 THEN
        PERFORM setval(seq_name::regclass, 1, false);
        RAISE NOTICE 'fixed % (empty) sequence % -> next 1', fq_table, seq_name;
      END IF;
    ELSIF next_val <= max_val THEN
      PERFORM setval(seq_name::regclass, max_val, true);
      RAISE NOTICE 'fixed % max=% sequence % -> next %', fq_table, max_val, seq_name, max_val + 1;
    END IF;
  END LOOP;
END $sync$;
