-- 悬赏令：任务有效期增量脚本
-- 执行位置：Supabase Dashboard -> SQL Editor
-- 先执行本文件，再部署包含任务时效功能的新后端。
-- 历史任务统一按创建时间起算 3 小时，因此会显示为“已到期”；不会删除任何任务或跟单记录。

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS validity_hours INTEGER;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE challenges
  DROP CONSTRAINT IF EXISTS challenges_validity_hours_check;

ALTER TABLE challenges
  ADD CONSTRAINT challenges_validity_hours_check
  CHECK (validity_hours IN (3, 5, 8, 12, 24));

UPDATE challenges
SET
  validity_hours = COALESCE(validity_hours, 3),
  expires_at = COALESCE(expires_at, created_at + INTERVAL '3 hours')
WHERE validity_hours IS NULL OR expires_at IS NULL;

ALTER TABLE challenges
  ALTER COLUMN validity_hours SET DEFAULT 3,
  ALTER COLUMN validity_hours SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);
