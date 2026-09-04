-- ============================================================
-- 突围特工队挑战榜 - 数据库迁移脚本
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 主播表
-- ============================================================
CREATE TABLE IF NOT EXISTS streamers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL,
  douyu_id TEXT,                 -- 主播斗鱼ID（可选）
  avatar_url TEXT,               -- 主播头像
  game_tag TEXT NOT NULL,        -- 游戏标签：CS2 / 户外 / 主机其他游戏 / 主机游戏 ...
  level TEXT,                    -- 等级：LV115 / LV102 ...
  room_id TEXT,                  -- 直播间ID（数字）
  rush_coin INTEGER DEFAULT 0,   -- Rush币
  rush_value INTEGER DEFAULT 0,  -- Rush值
  is_live BOOLEAN DEFAULT true,  -- 是否直播中
  description TEXT,              -- 简介/备注
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streamers_game_tag ON streamers(game_tag);
CREATE INDEX IF NOT EXISTS idx_streamers_is_live ON streamers(is_live);

-- ============================================================
-- 2. 老板表（以斗鱼ID为主键）
-- ============================================================
CREATE TABLE IF NOT EXISTS bosses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  douyu_id TEXT NOT NULL UNIQUE,  -- 斗鱼ID（必须，唯一）
  nickname TEXT,                  -- 老板昵称（可选）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 挑战表（主任务 + 隐藏任务统一用一张表）
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID REFERENCES streamers(id) ON DELETE CASCADE,
  boss_id UUID REFERENCES bosses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  condition_desc TEXT,                        -- 挑战条件（如"套圈数量最多"）
  gift_type TEXT NOT NULL CHECK (gift_type IN ('飞机', '火箭', '币')),
  gift_quantity INTEGER NOT NULL CHECK (gift_quantity > 0),
  is_hidden BOOLEAN DEFAULT false,            -- 是否为隐藏任务
  parent_challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,  -- 隐藏任务关联的主任务
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_streamer ON challenges(streamer_id);
CREATE INDEX IF NOT EXISTS idx_challenges_parent ON challenges(parent_challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_boss ON challenges(boss_id);

-- 限制：parent_challenge_id 必须是 is_hidden = false 的主任务
-- 通过应用层控制，DB 不强制

-- ============================================================
-- 4. 跟单表（bosses 给现有挑战加礼物）
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  boss_id UUID REFERENCES bosses(id) ON DELETE SET NULL,
  gift_type TEXT NOT NULL CHECK (gift_type IN ('飞机', '火箭', '币')),
  gift_quantity INTEGER NOT NULL CHECK (gift_quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_orders_challenge ON follow_orders(challenge_id);

-- ============================================================
-- 5. 视图：挑战累计礼物（含跟单）
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
-- 7. RLS（Row Level Security）- 默认开启简单策略
-- ============================================================
ALTER TABLE streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_orders ENABLE ROW LEVEL SECURITY;

-- 公开读
DROP POLICY IF EXISTS "Public read streamers" ON streamers;
CREATE POLICY "Public read streamers" ON streamers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read bosses" ON bosses;
CREATE POLICY "Public read bosses" ON bosses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read challenges" ON challenges;
CREATE POLICY "Public read challenges" ON challenges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read follow_orders" ON follow_orders;
CREATE POLICY "Public read follow_orders" ON follow_orders FOR SELECT USING (true);

-- 公开写（开发用，后续在 Admin 后台用 service_role 替换）
DROP POLICY IF EXISTS "Public insert challenges" ON challenges;
CREATE POLICY "Public insert challenges" ON challenges FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update challenges" ON challenges;
CREATE POLICY "Public update challenges" ON challenges FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete challenges" ON challenges;
CREATE POLICY "Public delete challenges" ON challenges FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public insert follow_orders" ON follow_orders;
CREATE POLICY "Public insert follow_orders" ON follow_orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update streamers" ON streamers;
CREATE POLICY "Public update streamers" ON streamers FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public insert streamers" ON streamers;
CREATE POLICY "Public insert streamers" ON streamers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete streamers" ON streamers;
CREATE POLICY "Public delete streamers" ON streamers FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public upsert bosses" ON bosses;
CREATE POLICY "Public upsert bosses" ON bosses FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update bosses" ON bosses;
CREATE POLICY "Public update bosses" ON bosses FOR UPDATE USING (true);

-- ============================================================
-- 8. 触发器：updated_at 自动更新
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_streamers_updated_at ON streamers;
CREATE TRIGGER update_streamers_updated_at
  BEFORE UPDATE ON streamers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_challenges_updated_at ON challenges;
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. 存储桶：avatars（如果之前没建）
-- ============================================================
-- 在 Supabase Dashboard > Storage 手动创建 buckets:
-- - avatars (公开读)
-- - challenge-images (公开读，可选)

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration completed' AS status;
