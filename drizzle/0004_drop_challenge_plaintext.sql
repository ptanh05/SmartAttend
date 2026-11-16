-- SEC: attendance challenge codes must not be stored in plaintext.
-- New rows are written with code = NULL (the code is derived from
-- SESSION_SECRET + session id + sequence, see lib/attendance/challenge.ts).
-- This clears legacy plaintext values. value_hash is untouched, so codes that
-- students already hold still verify until they expire; an active legacy
-- challenge is simply re-rotated on the next teacher poll.
-- The column itself is kept for rollback compatibility; drop it in a later
-- migration once this release is stable.
UPDATE "attendance_challenges" SET "code" = NULL WHERE "code" IS NOT NULL;
