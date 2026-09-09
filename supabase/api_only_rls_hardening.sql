-- 悬赏令：前后端分离后的 Supabase RLS 加固脚本
-- 执行前提：前端已经改为调用 Node HTTP API，不再直接读写 Supabase 表。
-- 效果：删除旧的 Public policies，避免 anon key 直接读写用户、任务、配置、绑定和登录会话表。

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE douyu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bind_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- API-only 模式：前端不再直接访问 Supabase 表，所有业务读写统一走 Node API。
-- 因此删除旧的 Public policies；service role 后端仍可访问，anon key 不再具备表级读写能力。
DROP POLICY IF EXISTS "Public read users" ON users;
DROP POLICY IF EXISTS "Public insert users" ON users;
DROP POLICY IF EXISTS "Public update users" ON users;
DROP POLICY IF EXISTS "Public delete users" ON users;

DROP POLICY IF EXISTS "Public read settings" ON settings;
DROP POLICY IF EXISTS "Public update settings" ON settings;
DROP POLICY IF EXISTS "Public insert settings" ON settings;

DROP POLICY IF EXISTS "Public read challenges" ON challenges;
DROP POLICY IF EXISTS "Public insert challenges" ON challenges;
DROP POLICY IF EXISTS "Public update challenges" ON challenges;
DROP POLICY IF EXISTS "Public delete challenges" ON challenges;

DROP POLICY IF EXISTS "Public read follow_orders" ON follow_orders;
DROP POLICY IF EXISTS "Public insert follow_orders" ON follow_orders;
DROP POLICY IF EXISTS "Public update follow_orders" ON follow_orders;
DROP POLICY IF EXISTS "Public delete follow_orders" ON follow_orders;

DROP POLICY IF EXISTS "Public read douyu_profiles" ON douyu_profiles;
DROP POLICY IF EXISTS "Public insert douyu_profiles" ON douyu_profiles;
DROP POLICY IF EXISTS "Public update douyu_profiles" ON douyu_profiles;
DROP POLICY IF EXISTS "Public delete douyu_profiles" ON douyu_profiles;

DROP POLICY IF EXISTS "Public read bind_sessions" ON bind_sessions;
DROP POLICY IF EXISTS "Public insert bind_sessions" ON bind_sessions;
DROP POLICY IF EXISTS "Public update bind_sessions" ON bind_sessions;
DROP POLICY IF EXISTS "Public delete bind_sessions" ON bind_sessions;

DROP POLICY IF EXISTS "Public read auth_sessions" ON auth_sessions;
DROP POLICY IF EXISTS "Public insert auth_sessions" ON auth_sessions;
DROP POLICY IF EXISTS "Public update auth_sessions" ON auth_sessions;
DROP POLICY IF EXISTS "Public delete auth_sessions" ON auth_sessions;

SELECT 'api-only rls hardening completed' AS status;
