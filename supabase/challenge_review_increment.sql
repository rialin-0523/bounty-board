-- 悬赏令：任务审核流程增量脚本
-- 执行位置：Supabase Dashboard -> SQL Editor
-- 业务规则：普通用户发布/修改任务后进入待审核；后台通过后才公开显示；拒绝必须备注原因。

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS review_status TEXT;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

UPDATE challenges
SET review_status = 'approved'
WHERE review_status IS NULL;

ALTER TABLE challenges
  ALTER COLUMN review_status SET DEFAULT 'pending';

ALTER TABLE challenges
  ALTER COLUMN review_status SET NOT NULL;

ALTER TABLE challenges
  DROP CONSTRAINT IF EXISTS challenges_review_status_check;

ALTER TABLE challenges
  ADD CONSTRAINT challenges_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_challenges_review_status
  ON challenges(review_status);

CREATE INDEX IF NOT EXISTS idx_challenges_review_created
  ON challenges(review_status, created_at DESC);

SELECT 'challenge review increment completed' AS status;
