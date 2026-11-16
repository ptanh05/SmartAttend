-- Race-condition fix: at most one open (draft/active/paused) attendance
-- session per course section.
--
-- SAFETY: this migration does NOT modify data. If duplicates already exist it
-- aborts with an explicit error so an operator can decide how to resolve them
-- (see docs/SECURITY_FIX_REPORT.md, "Triển khai an toàn"). Find them with:
--   SELECT section_id, array_agg(id), count(*)
--   FROM attendance_sessions
--   WHERE status IN ('draft','active','paused')
--   GROUP BY section_id HAVING count(*) > 1;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "attendance_sessions"
    WHERE "status" IN ('draft', 'active', 'paused')
    GROUP BY "section_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate open attendance sessions exist for at least one section; resolve them before applying 0005.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_one_open_per_section_idx"
  ON "attendance_sessions" USING btree ("section_id")
  WHERE "status" IN ('draft', 'active', 'paused');
