# 悬赏令技术接手说明

## 1. 项目是什么

这是一个 React + Vite + Supabase PostgreSQL 的武侠风任务悬赏平台，带斗鱼账号绑定和长期登录能力；当前已适配大访问量场景下的 GitHub Pages 前端、独立 HTTP API、独立斗鱼 Worker 分离部署。

当前代码已经把两条主线合并：

- 主分支 v3 任务系统：`users`、`settings`、`created_by`、隐藏任务可见性、黑名单、最低斗鱼等级。
- 斗鱼绑定系统：2 分钟识别码、指定直播间弹幕命中、斗鱼资料回写、用户名密码注册、长期登录 Cookie。

## 2. 运行结构

- 前端：`src/`
- 后端 API：`server/index.mjs`
- 斗鱼 Worker：`server/worker.mjs`
- 数据库迁移：`supabase/migration.sql`
- 已有数据库增量脚本：`supabase/binding_increment.sql`

## 3. 关键规则

### 3.1 用户表

当前统一以 `users` 为准，字段同时承载：

- 站内账号：`username`、`username_normalized`、`password_salt`、`password_hash`
- 斗鱼资料：`douyu_uid`、`douyu_nickname`、`douyu_avatar`、`douyu_level`、`douyu_badge_name`、`douyu_badge_level`；普通前台只读，后台可通过接口手动修正。
- 权限状态：`is_blacklisted`、`last_login_at`

`app_users` 只应视作旧数据迁移痕迹，不再作为主代码依赖。

### 3.2 配置表

- `settings.min_douyu_level` 控制最低斗鱼等级。
- 后台“配置管理” tab 修改后，发布、跟单、添加隐藏任务都会受影响。
- 后台“用户管理” tab 通过 `POST /api/admin/users/douyu-profile` 手动修正斗鱼资料，普通用户端不提供手填入口。
- 后台预录入的“仅斗鱼资料用户”（无用户名、无密码）可以被后续弹幕绑定流程补全为正式账号；已有用户名或密码的同 UID 用户仍会被视为已绑定。后台按 UID 修正已绑定用户时，只更新斗鱼资料，不会清空用户名和密码哈希。

### 3.3 任务可见性

- `created_by` 必须写入任务和跟单。
- 普通用户的 `boss_id` / `created_by` 必须由后端按登录 Cookie 自动写入，不能相信前端表单或浏览器请求传来的身份字段；管理员后台仍可手动维护任务显示信息。
- 隐藏任务只对创建者自己、以及主任务创建者可见。
- 首页和详情页都按登录用户做可见性过滤。

### 3.4 斗鱼绑定

- 用户点击生成识别码后，HTTP API 生成 6 位码，TTL 2 分钟。
- 斗鱼 Worker 独立运行，只在存在有效绑定码时连接斗鱼 TCP 8601。
- 未命中的普通弹幕直接丢弃，不写数据库。
- 命中后才回写 UID / 昵称 / 头像 / 等级 / 粉丝牌等级，再让用户设置站内用户名和密码。
- 完成后创建 `auth_sessions`，Cookie 保持长期登录。

### 3.5 前后端分离

- 前端请求统一走 `src/lib/http.js`。
- GitHub Pages 构建时配置 `VITE_API_BASE_URL=https://api.xd.miyang.cloud`。
- `src/lib/http.js` 只在有 body 时带 JSON `Content-Type`，GET 不带，避免跨域 API 在大访问量下产生额外 CORS 预检压力。
- 前端不再直接调用 Supabase 表，避免隐藏任务、用户、后台配置只靠前端过滤。
- 后台登录改为后端校验，并由后端写入 HttpOnly 管理员 Cookie；管理员密码不应出现在前端 bundle。

## 4. 启动方式

```bash
npm install
# 终端 1：HTTP API
npm run server:api
# 终端 2：斗鱼 Worker
npm run worker:douyu
# 终端 3：前端开发服务
npm run dev
```

推荐生产部署：前台 `https://xd.miyang.cloud/` 由 GitHub Pages 托管，API `https://api.xd.miyang.cloud/api/...` 由服务器 Nginx 反代到 `127.0.0.1:8788`，斗鱼 Worker 独立 systemd 常驻。旧的服务器同域前端部署只作为应急口径。当前服务器已有 `xd.miyang.cloud` HTTPS 证书；正式切 Pages 后还需要为 `api.xd.miyang.cloud` 单独配置 DNS、证书和 Nginx。发布页的老板信息会自动读取登录用户，不再手动输入；前端顶部也不再显示后台管理入口。

## 5. 修改后要检查的文件

- `src/lib/api.js`
- `src/pages/HomePage.jsx`
- `src/pages/PublishPage.jsx`
- `src/pages/ChallengeDetail.jsx`
- `src/Admin.jsx`
- `src/components/Layout.jsx`
- `server/store.mjs`
- `server/data.mjs`
- `server/worker.mjs`
- `supabase/migration.sql`
- `supabase/binding_increment.sql`
- `docs/SQL_DATABASE.md`
- `README.md`

## 6. 验证清单

```bash
npm run build
npm run lint
node --check server/index.mjs
node --check server/douyu.mjs
node --check server/store.mjs
node --check server/data.mjs
node --check server/worker.mjs
node --check server/auth.mjs
```

## 7. 当前注意点

- 后端需要 `SUPABASE_SECRET_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY`。
- 斗鱼监听只在有有效绑定码时启动，空闲会自动停。
- 如果主分支数据库还没有 `users` / `settings` / `created_by`，先跑 `supabase/binding_increment.sql` 或直接按 `supabase/migration.sql` 初始化。

## 8. 分离部署重点提醒

详细看 `docs/GITHUB_PAGES_API_WORKER_SPLIT.md`。以后大访问量前台默认优先考虑 GitHub Pages / CDN；斗鱼 TCP 弹幕监听默认不要和 HTTP API 放在同一个 Node 进程。
