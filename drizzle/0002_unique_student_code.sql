DROP INDEX IF EXISTS "membership_org_student_code_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "membership_student_code_idx"
  ON "organization_memberships" USING btree ("student_code");
