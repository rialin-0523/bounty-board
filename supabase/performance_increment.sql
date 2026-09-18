-- 悬赏令：访问性能与防重复提交增量脚本
-- 执行位置：Supabase Dashboard -> SQL Editor
-- 说明：代码可先部署；本文件需数据库维护者执行后，索引和幂等约束才生效。
CREATE INDEX IF NOT EXISTS idx_challenges_parent_challenge_id
  ON challenges(parent_challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_created_at
  ON challenges(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_orders_challenge_created
  ON follow_orders(challenge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_orders_created_by
  ON follow_orders(created_by);

-- 详情页读取汇总时直接使用数据库聚合，避免 Node 拉取整张跟单表再计算。
CREATE OR REPLACE VIEW follow_order_summaries AS
SELECT
  challenge_id,
  COUNT(*)::INTEGER AS follow_count,
  COALESCE(SUM(gift_quantity) FILTER (WHERE gift_type = '飞机'), 0)::INTEGER AS airplane_quantity,
  COALESCE(SUM(gift_quantity) FILTER (WHERE gift_type = '火箭'), 0)::INTEGER AS rocket_quantity,
  COALESCE(SUM(gift_quantity) FILTER (WHERE gift_type = '币'), 0)::INTEGER AS coin_quantity
FROM follow_orders
GROUP BY challenge_id;

ALTER TABLE follow_orders
  ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_orders_request_id
  ON follow_orders(request_id)
  WHERE request_id IS NOT NULL;
