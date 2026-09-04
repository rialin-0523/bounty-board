-- ============================================================
-- 突围特工队挑战榜 - 数据库迁移脚本 (v2 - 简化版)
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 兼容老版本：清理老字段和老表
-- ============================================================

-- 1. streamers 不再被前端使用（保留表和数据，删 avatar_url 字段）
ALTER TABLE IF EXISTS streamers DROP COLUMN IF EXISTS avatar_url;

-- 1.5 先删掉所有依赖视图（视图依赖 boss_id 改类型时会被阻拦）
DROP VIEW IF EXISTS challenges_with_hidden CASCADE;
DROP VIEW IF EXISTS challenge_gifts CASCADE;

-- 2. challenges: 先迁移数据，再删字段
-- 2.1 boss_id 从 UUID 引用变成 TEXT 存昵称
-- 先把列类型改成 TEXT（UUID → TEXT 转换），再 UPDATE 值，再 drop FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'boss_id'
    AND data_type = 'uuid'
  ) THEN
    -- 先删 FK
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_boss_id_fkey;
    -- 把列类型改成 TEXT（UUID 会转成字符串形式）
    ALTER TABLE challenges ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
    -- 再 UPDATE 把值替换成老板昵称
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bosses') THEN
      UPDATE challenges c
      SET boss_id = COALESCE(b.nickname, b.douyu_id, 'unknown')
      FROM bosses b
      WHERE c.boss_id::UUID = b.id;
    END IF;
  END IF;
END $$;

-- 2.2 follow_orders 同样处理
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'follow_orders' AND column_name = 'boss_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE follow_orders DROP CONSTRAINT IF EXISTS follow_orders_boss_id_fkey;
    ALTER TABLE follow_orders ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bosses') THEN
      UPDATE follow_orders f
      SET boss_id = COALESCE(b.nickname, b.douyu_id, 'unknown')
      FROM bosses b
      WHERE f.boss_id::UUID = b.id;
    END IF;
  END IF;
END $$;

-- 2.3 删 challenges.streamer_id（不需要了）
ALTER TABLE IF EXISTS challenges DROP COLUMN IF EXISTS streamer_id;

-- 3. 删 bosses 表（不再需要）
DROP TABLE IF EXISTS bosses CASCADE;

-- 4. 删掉旧的索引
DROP INDEX IF EXISTS idx_challenges_boss;
DROP INDEX IF EXISTS idx_challenges_streamer;
DROP INDEX IF EXISTS idx_streamers_game_tag;
DROP INDEX IF EXISTS idx_streamers_is_live;

-- ============================================================
-- 1. 挑战表（主任务 + 隐藏任务）
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  condition_desc TEXT,
  gift_type TEXT NOT NULL CHECK (gift_type IN ('飞机', '火箭', '币')),
  gift_quantity INTEGER NOT NULL CHECK (gift_quantity > 0),
  is_hidden BOOLEAN DEFAULT false,
  parent_challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_parent ON challenges(parent_challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_boss_id ON challenges(boss_id);

-- ============================================================
-- 2. 跟单表
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  boss_id TEXT NOT NULL,
  gift_type TEXT NOT NULL CHECK (gift_type IN ('飞机', '火箭', '币')),
  gift_quantity INTEGER NOT NULL CHECK (gift_quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_orders_challenge ON follow_orders(challenge_id);

-- ============================================================
-- 3. 视图：挑战累计礼物
-- ============================================================
CREATE OR REPLACE VIEW challenge_gifts AS
SELECT
  c.id AS challenge_id,
  c.gift_type,
  c.gift_quantity AS base_quantity,
  COALESCE(SUM(f.gift_quantity) FILTER (WHERE f.gift_type = c.gift_type), 0) AS follow_same_quantity,
  COALESCE(SUM(f.gift_quantity), 0) AS follow_total_quantity,
  c.gift_quantity + COALESCE(SUM(f.gift_quantity) FILTER (WHERE f.gift_type = c.gift_type), 0) AS total_same_quantity
FROM challenges c
LEFT JOIN follow_orders f ON f.challenge_id = c.id
GROUP BY c.id, c.gift_type, c.gift_quantity;

-- ============================================================
-- 4. 视图：主任务 + 隐藏任务
-- ============================================================
CREATE OR REPLACE VIEW challenges_with_hidden AS
SELECT
  c.*,
  (
    SELECT json_agg(h.* ORDER BY h.created_at)
    FROM challenges h
    WHERE h.parent_challenge_id = c.id AND h.is_hidden = true
  ) AS hidden_challenges
FROM challenges c
WHERE c.is_hidden = false OR c.parent_challenge_id IS NULL;

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read challenges" ON challenges;
CREATE POLICY "Public read challenges" ON challenges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read follow_orders" ON follow_orders;
CREATE POLICY "Public read follow_orders" ON follow_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert challenges" ON challenges;
CREATE POLICY "Public insert challenges" ON challenges FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update challenges" ON challenges;
CREATE POLICY "Public update challenges" ON challenges FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete challenges" ON challenges;
CREATE POLICY "Public delete challenges" ON challenges FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public insert follow_orders" ON follow_orders;
CREATE POLICY "Public insert follow_orders" ON follow_orders FOR INSERT WITH CHECK (true);

-- ============================================================
-- 6. 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_challenges_updated_at ON challenges;
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Migration v2 completed' AS status;
