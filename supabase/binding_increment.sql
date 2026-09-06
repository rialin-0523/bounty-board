-- ============================================================
-- 悬赏令：斗鱼账号绑定 + v3 用户系统 增量数据库脚本
-- ============================================================
-- 使用场景：仓库/线上 Supabase 已经有 challenges、follow_orders 等任务表时，只执行本文件。
-- 不会删除旧表，不会清空旧数据。
-- 说明：当前代码以 users / settings / created_by 为准；如果旧库里还有 app_users，优先迁移到 users。
-- 执行位置：Supabase Dashboard -> SQL Editor。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'app_users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'users'
  ) THEN
    ALTER TABLE app_users RENAME TO users;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT,
  username_normalized TEXT,
  password_salt TEXT,
  password_hash TEXT,
  douyu_uid TEXT UNIQUE,
  douyu_nickname TEXT,
  douyu_avatar TEXT DEFAULT '',
  douyu_level INTEGER DEFAULT 0,
  douyu_badge_name TEXT DEFAULT '',
  douyu_badge_level INTEGER DEFAULT 0,
  is_blacklisted BOOLEAN DEFAULT false,
  bind_session_id UUID,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_normalized TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_uid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_nickname TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_avatar TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_badge_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS douyu_badge_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bind_session_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_douyu_id ON users(douyu_uid);
CREATE INDEX IF NOT EXISTS idx_users_blacklist ON users(is_blacklisted);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized ON users(username_normalized);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_length_check') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_username_length_check
      CHECK (username IS NULL OR char_length(trim(username)) BETWEEN 2 AND 20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_password_hash_not_empty_check') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_password_hash_not_empty_check
      CHECK (
        password_salt IS NULL OR password_hash IS NULL
        OR (length(password_salt) >= 16 AND length(password_hash) >= 64)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_douyu_required_check') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_douyu_required_check
      CHECK (
        (douyu_uid IS NULL AND douyu_nickname IS NULL)
        OR (length(trim(douyu_uid)) > 0 AND length(trim(douyu_nickname)) > 0)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES ('min_douyu_level', '0')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE challenges ADD COLUMN created_by UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_created_by_fkey;
    ALTER TABLE challenges ADD CONSTRAINT challenges_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_challenges_created_by ON challenges(created_by);

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
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bind_sessions_day_code ON bind_sessions(code_day, code_normalized);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_status_expires ON bind_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_room ON bind_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_bind_sessions_user_id ON bind_sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_challenges_updated_at ON challenges;
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bind_sessions_updated_at ON bind_sessions;
CREATE TRIGGER update_bind_sessions_updated_at
  BEFORE UPDATE ON bind_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auth_sessions_updated_at ON auth_sessions;
CREATE TRIGGER update_auth_sessions_updated_at
  BEFORE UPDATE ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE douyu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bind_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read users" ON users;
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert users" ON users;
CREATE POLICY "Public insert users" ON users FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update users" ON users;
CREATE POLICY "Public update users" ON users FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete users" ON users;
CREATE POLICY "Public delete users" ON users FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read settings" ON settings;
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public update settings" ON settings;
CREATE POLICY "Public update settings" ON settings FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public insert settings" ON settings;
CREATE POLICY "Public insert settings" ON settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read challenges" ON challenges;
CREATE POLICY "Public read challenges" ON challenges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert challenges" ON challenges;
CREATE POLICY "Public insert challenges" ON challenges FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update challenges" ON challenges;
CREATE POLICY "Public update challenges" ON challenges FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete challenges" ON challenges;
CREATE POLICY "Public delete challenges" ON challenges FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read follow_orders" ON follow_orders;
CREATE POLICY "Public read follow_orders" ON follow_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert follow_orders" ON follow_orders;
CREATE POLICY "Public insert follow_orders" ON follow_orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read douyu_profiles" ON douyu_profiles;
CREATE POLICY "Public read douyu_profiles" ON douyu_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert douyu_profiles" ON douyu_profiles;
CREATE POLICY "Public insert douyu_profiles" ON douyu_profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update douyu_profiles" ON douyu_profiles;
CREATE POLICY "Public update douyu_profiles" ON douyu_profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public read bind_sessions" ON bind_sessions;
CREATE POLICY "Public read bind_sessions" ON bind_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert bind_sessions" ON bind_sessions;
CREATE POLICY "Public insert bind_sessions" ON bind_sessions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update bind_sessions" ON bind_sessions;
CREATE POLICY "Public update bind_sessions" ON bind_sessions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public read auth_sessions" ON auth_sessions;
CREATE POLICY "Public read auth_sessions" ON auth_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert auth_sessions" ON auth_sessions;
CREATE POLICY "Public insert auth_sessions" ON auth_sessions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update auth_sessions" ON auth_sessions;
CREATE POLICY "Public update auth_sessions" ON auth_sessions FOR UPDATE USING (true);

SELECT 'binding increment completed' AS status;
