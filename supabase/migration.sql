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

-- 2. challenges: 先迁移数据，再删字段
-- 2.1 boss_id 从 UUID 引用变成 TEXT 存昵称
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'boss_id'
    AND data_type = 'uuid'
  ) THEN
    UPDATE challenges c
    SET boss_id = COALESCE(b.nickname, b.douyu_id, 'unknown')
    FROM bosses b
    WHERE c.boss_id = b.id;
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_boss_id_fkey;
    ALTER TABLE challenges ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
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
    UPDATE follow_orders f
    SET boss_id = COALESCE(b.nickname, b.douyu_id, 'unknown')
    FROM bosses b
    WHERE f.boss_id = b.id;
    ALTER TABLE follow_orders DROP CONSTRAINT IF EXISTS follow_orders_boss_id_fkey;
    ALTER TABLE follow_orders ALTER COLUMN boss_id TYPE TEXT USING boss_id::TEXT;
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

-- ============================================================
-- 7. 斗鱼绑定与账号体系
-- ============================================================
CREATE TABLE IF NOT EXISTS douyu_profiles (
  room_id TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  uid TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  level INTEGER,
  avatar TEXT NOT NULL DEFAULT '',
  badge_name TEXT NOT NULL DEFAULT '',
  badge_level INTEGER NOT NULL DEFAULT 0,
  first_seen_at BIGINT NOT NULL DEFAULT 0,
  previous_last_seen_at BIGINT NOT NULL DEFAULT 0,
  last_seen_at BIGINT NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, profile_key)
);

CREATE INDEX IF NOT EXISTS idx_douyu_profiles_room_uid ON douyu_profiles(room_id, uid);
CREATE INDEX IF NOT EXISTS idx_douyu_profiles_room_name ON douyu_profiles(room_id, name);

CREATE TABLE IF NOT EXISTS bind_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_normalized TEXT NOT NULL,
  code_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'completed', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  matched_at TIMESTAMPTZ,
  matched_uid TEXT,
  matched_name TEXT,
  matched_avatar TEXT DEFAULT '',
  matched_level INTEGER,
  matched_badge_name TEXT DEFAULT '',
  matched_badge_level INTEGER DEFAULT 0,
  matched_message JSONB,
  user_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bind_sessions_day_code ON bind_sessions(code_day, code_normalized);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_status_expires ON bind_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_room ON bind_sessions(room_id);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  douyu_uid TEXT NOT NULL UNIQUE,
  douyu_name TEXT NOT NULL,
  douyu_avatar TEXT NOT NULL DEFAULT '',
  douyu_level INTEGER,
  douyu_badge_name TEXT NOT NULL DEFAULT '',
  douyu_badge_level INTEGER NOT NULL DEFAULT 0,
  bind_session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_douyu_name ON app_users(douyu_name);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

DROP TRIGGER IF EXISTS update_bind_sessions_updated_at ON bind_sessions;
CREATE TRIGGER update_bind_sessions_updated_at
  BEFORE UPDATE ON bind_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_users_updated_at ON app_users;
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Migration v3 completed' AS status;

-- ============================================================
-- 8. 账号绑定安全补强（PostgreSQL / SQL）
-- ============================================================
-- 说明：Supabase 底层是成熟的 PostgreSQL，这里用 SQL 约束保证关键数据不只靠前端判断。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_username_length_check') THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_username_length_check
      CHECK (char_length(trim(username)) BETWEEN 2 AND 20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_password_hash_not_empty_check') THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_password_hash_not_empty_check
      CHECK (length(password_salt) >= 16 AND length(password_hash) >= 64);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_douyu_required_check') THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_douyu_required_check
      CHECK (length(trim(douyu_uid)) > 0 AND length(trim(douyu_name)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_user_id ON bind_sessions(user_id);

ALTER TABLE douyu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bind_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE app_users IS '悬赏令用户账号表：用户名、密码哈希、斗鱼 UID/昵称/头像/等级/粉丝牌等正式用户信息。只允许服务端 service role 写入和读取。';
COMMENT ON TABLE bind_sessions IS '斗鱼绑定识别码会话表：记录 2 分钟验证码、命中弹幕和本次绑定状态。';
COMMENT ON TABLE douyu_profiles IS '斗鱼弹幕用户资料缓存表：按房间和 UID/昵称记录最近看到的头像、等级和粉丝牌资料。';
COMMENT ON TABLE auth_sessions IS '长期登录会话表：只存 session token 的哈希，不存明文 token。';

SELECT 'Migration v4 account hardening completed' AS status;
