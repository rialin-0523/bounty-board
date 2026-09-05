-- ============================================================
-- 悬赏令：斗鱼账号绑定 + 用户登录 增量数据库脚本
-- ============================================================
-- 使用场景：仓库/线上 Supabase 已经有 challenges、follow_orders 等任务表时，只执行本文件。
-- 不会删除旧表，不会清空旧数据。
-- 执行位置：Supabase Dashboard -> SQL Editor。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
CREATE INDEX IF NOT EXISTS idx_bind_sessions_user_id ON bind_sessions(user_id);

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
CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users(created_at DESC);

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

DROP TRIGGER IF EXISTS update_bind_sessions_updated_at ON bind_sessions;
CREATE TRIGGER update_bind_sessions_updated_at
  BEFORE UPDATE ON bind_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_users_updated_at ON app_users;
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE douyu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bind_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE app_users IS '悬赏令用户账号表：用户名、密码哈希、斗鱼 UID/昵称/头像/等级/粉丝牌等正式用户信息。只允许服务端 service role/secret key 写入和读取。';
COMMENT ON TABLE bind_sessions IS '斗鱼绑定识别码会话表：记录 2 分钟验证码、命中弹幕和本次绑定状态。';
COMMENT ON TABLE douyu_profiles IS '斗鱼弹幕用户资料缓存表：按房间和 UID/昵称记录最近看到的头像、等级和粉丝牌资料。';
COMMENT ON TABLE auth_sessions IS '长期登录会话表：只存 session token 的哈希，不存明文 token。';

SELECT 'binding increment completed' AS status;
