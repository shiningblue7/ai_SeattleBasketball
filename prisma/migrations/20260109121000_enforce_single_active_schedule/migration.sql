-- Ensure there can only be one active schedule at a time.
-- 1) Cleanup: if multiple schedules are active, keep the most recent one active and deactivate the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY date DESC, "createdAt" DESC) AS rn
  FROM "Schedule"
  WHERE active = true
)
UPDATE "Schedule"
SET active = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Enforce: partial unique index so only one row can have active=true.
-- This works because the index only applies to rows where active is true.
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_active_true_unique"
ON "Schedule" ((1))
WHERE active = true;
