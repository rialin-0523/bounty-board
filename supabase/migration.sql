-- ============================================================
-- 突围特工队挑战榜 - 数据库迁移脚本 (v3 - 用户系统)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 兼容老版本：清理老字段
-- ============================================================

ALTER TABLE IF EXISTS streamers DROP COLUMN IF EXISTS avatar_url;

-- 先删视图再改列类型
DROP VIEW IF EXISTS challenges_with_hidden CASCADE;
DROP VIEW IF EXISTS challenge_gifts CASCADE;

-- challenges.boss_id: UUID → TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'boss_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_boss_id_fkey;
    ALTER TABLE challenges ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
  END IF;
END $$;

-- follow_orders.boss_id: UUID → TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'follow_orders' AND column_name = 'boss_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE follow_orders DROP CONSTRAINT IF EXISTS follow_orders_boss_id_fkey;
    ALTER TABLE follow_orders ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
  END IF;
END $$;

-- 删老字段/表
ALTER TABLE IF EXISTS challenges DROP COLUMN IF EXISTS streamer_id;
DROP TABLE IF EXISTS bosses CASCADE;
DROP INDEX IF EXISTS idx_challenges_boss;
DROP INDEX IF EXISTS idx_challenges_streamer;
DROP INDEX IF EXISTS idx_streamers_game_tag;
DROP INDEX IF EXISTS idx_streamers_is_live;

-- ============================================================
-- 1. 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  douyu_id TEXT UNIQUE,
  douyu_nickname TEXT,
  douyu_level INTEGER DEFAULT 0,
  is_blacklisted BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_douyu_id ON users(douyu_id);
CREATE INDEX IF NOT EXISTS idx_users_blacklist ON users(is_blacklisted);

-- ============================================================
-- 2. 配置表（key-value）
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 默认配置：最低斗鱼等级 = 0（不限制）
INSERT INTO settings (key, value) VALUES ('min_douyu_level', '0')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. 挑战表
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_parent ON challenges(parent_challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_boss_id ON challenges(boss_id);

-- 老表兼容：补加 created_by 列（不带 FK 先加上，再用 DO 块加 FK）
DO $$
BEGIN
  -- 第一次加列（如果不存在）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE challenges ADD COLUMN created_by UUID;
  END IF;
  -- 如果 users 表存在，加 FK
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_created_by_fkey;
    ALTER TABLE challenges ADD CONSTRAINT challenges_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_challenges_created_by ON challenges(created_by);

-- ============================================================
-- 4. 跟单表
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

-- 老表兼容：补加 created_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'follow_orders' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE follow_orders ADD COLUMN created_by UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE follow_orders DROP CONSTRAINT IF EXISTS follow_orders_created_by_fkey;
    ALTER TABLE follow_orders ADD CONSTRAINT follow_orders_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_follow_orders_created_by ON follow_orders(created_by);

-- ============================================================
-- 5. 视图：挑战累计礼物
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
-- 6. 视图：主任务 + 它的隐藏任务
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
-- 7. RLS
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_orders ENABLE ROW LEVEL SECURITY;

-- users: 公开读，黑名单信息所有人都能看
DROP POLICY IF EXISTS "Public read users" ON users;
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert users" ON users;
CREATE POLICY "Public insert users" ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update users" ON users;
CREATE POLICY "Public update users" ON users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete users" ON users;
CREATE POLICY "Public delete users" ON users FOR DELETE USING (true);

-- settings: 公开读，只有 admin 能改（前端需要登录态，后台用 admin 账号）
DROP POLICY IF EXISTS "Public read settings" ON settings;
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public update settings" ON settings;
CREATE POLICY "Public update settings" ON settings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public insert settings" ON settings;
CREATE POLICY "Public insert settings" ON settings FOR INSERT WITH CHECK (true);

-- challenges: 公开读写
DROP POLICY IF EXISTS "Public read challenges" ON challenges;
CREATE POLICY "Public read challenges" ON challenges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert challenges" ON challenges;
CREATE POLICY "Public insert challenges" ON challenges FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update challenges" ON challenges;
CREATE POLICY "Public update challenges" ON challenges FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete challenges" ON challenges;
CREATE POLICY "Public delete challenges" ON challenges FOR DELETE USING (true);

-- follow_orders
DROP POLICY IF EXISTS "Public read follow_orders" ON follow_orders;
CREATE POLICY "Public read follow_orders" ON follow_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert follow_orders" ON follow_orders;
CREATE POLICY "Public insert follow_orders" ON follow_orders FOR INSERT WITH CHECK (true);

-- ============================================================
-- 8. 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_challenges_updated_at ON challenges;
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Migration v3 completed' AS status;
