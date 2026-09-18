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
- 已上线库的任务时效增量脚本：`supabase/task_expiration_increment.sql`
- 性能与防重复提交增量脚本：`supabase/performance_increment.sql`

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
- 任务创建时必须从五档有效期 `3 / 5 / 8 / 12 / 24` 中选择，默认 3 小时，并写入 `validity_hours` 和 `expires_at`。
- API 读取任务时动态计算 `effective_status=expired`，不靠定时任务改数据库；已到期任务不能跟单、不能添加隐藏任务、普通用户不能再修改。管理员可勾选“重新开始计算有效期”，从当前时间重设期限。
- 普通用户的 `boss_id` / `created_by` 必须由后端按登录 Cookie 自动写入，不能相信前端表单或浏览器请求传来的身份字段；管理员后台仍可手动维护任务显示信息。
- 隐藏任务只对创建者自己、以及主任务创建者可见。
- 首页和详情页都按登录用户做可见性过滤。
- 未登录只能打开 `/login` 和 `/bind`；任务首页、任务详情、发布页及对应 API 都要求站内登录。管理员使用独立管理员 Cookie，不受普通用户 API 门禁影响。

### 3.4 斗鱼绑定

- 用户点击生成识别码后，HTTP API 生成 6 位码，TTL 2 分钟。
- 斗鱼 Worker 独立运行，只在存在有效绑定码时连接斗鱼 TCP 8601。
- 未命中的普通弹幕直接丢弃，不写数据库。
- 命中后才回写 UID / 昵称 / 头像 / 等级 / 粉丝牌等级，再让用户设置站内用户名和密码。
- 完成后创建 `auth_sessions`，Cookie 保持长期登录。

### 3.5 前后端分离

- 前端请求统一走 `src/lib/http.js`。
- `src/App.jsx` 使用 React 路由懒加载；首页首屏不加载后台、绑定、发布、详情和登录页代码。
- `GET /api/challenges/with-hidden` 会同时返回可见任务的 `follow_summary`，首页不再针对每个任务单独请求跟单数据，避免任务数量增长导致请求数量线性放大。
- 首页打开后每 10 秒静默轮询一次这个批量接口；浏览器切到后台时暂停，重新回到前台时立即检查。轮询期间保留现有任务，不显示首屏加载遮罩，避免用户看到页面闪烁。
- GitHub Pages 构建时配置 `VITE_API_BASE_URL=https://api.xd.miyang.cloud`。
- `src/lib/http.js` 只在有 body 时带 JSON `Content-Type`，GET 不带，避免跨域 API 在大访问量下产生额外 CORS 预检压力。
- `src/lib/http.js` 的请求使用 `cache: no-store`，Node API 的 JSON 响应返回 `Cache-Control: no-store, max-age=0`；任务列表不能依赖浏览器或代理缓存。
- 前端不再直接调用 Supabase 表，避免隐藏任务、用户、后台配置只靠前端过滤。
- 后台登录改为后端校验，并由后端写入 HttpOnly 管理员 Cookie；管理员密码不应出现在前端 bundle。
- `src/lib/http.js` 默认 15 秒超时；API 限制 JSON 请求体 256 KB、Node 请求超时 15 秒，并按来源 IP 对登录、绑定码、任务、跟单和后台接口限流，超限返回 429。
- 详情页统一请求 `GET /api/challenges/:id/detail?followLimit=50`，一次返回可见任务关系、数据库汇总和限量跟单记录，避免详情页 N+1 请求。
- 跟单请求由前端生成 `request_id`；执行 `supabase/performance_increment.sql` 后，数据库唯一索引保证重复提交不会产生重复记录。SQL 未执行前后端会自动退回兼容模式。

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
- 为已有生产任务加时效时，先执行 `supabase/task_expiration_increment.sql`，再部署 API；否则新 API 写入 `validity_hours / expires_at` 会失败。
- `supabase/performance_increment.sql` 需由数据库维护者在 Supabase SQL Editor 执行；执行前先确认历史数据无重复的非空 `request_id`。
- 不要把详情页恢复为“任务详情 + 全部任务 + 每个隐藏任务跟单”的串行请求链；必须继续使用详情聚合接口。
- 如果以后重新编写首页任务接口，必须保留 `follow_summary` 的批量返回；不要恢复“列表接口 + 每个任务一个跟单请求”的 N+1 请求模式。
- 首页自动刷新只用于展示层；不要把“浏览器轮询”误当成斗鱼弹幕监听。斗鱼 TCP 监听仍由独立 Worker 负责，不能为了刷新任务把 Worker 合回 HTTP API。

## 8. 分离部署重点提醒

详细看 `docs/GITHUB_PAGES_API_WORKER_SPLIT.md`。以后大访问量前台默认优先考虑 GitHub Pages / CDN；斗鱼 TCP 弹幕监听默认不要和 HTTP API 放在同一个 Node 进程。前端页面继续保持路由懒加载，任务统计优先使用批量接口。

## 9. 最近一次部署记录

- GitHub `main` 合并提交：`36620317752fc80cd18a5fbaee13385f3d52c3ac`。
- GitHub Pages Actions：运行 `35248698651`，结果为 success。
- VPS：`111.229.102.231` 已部署优化提交 `5f679b4` 对应代码。
- 服务：`bounty-board-api.service`、`bounty-board-douyu-worker.service` active；旧 `bounty-board-bind.service` inactive。
- 公网验证：`https://api.xd.miyang.cloud/api/health` 返回 200；`/api/challenges/with-hidden` 返回 `follow_summary` 和生命周期字段；前台已返回优化后的入口 bundle。
- 2026-09-19 首页自动刷新修复已合并到 `main`，合并提交 `5553e5a`；Pages Actions `35378965625` 成功，线上 HomePage chunk 已包含 `visibilitychange` 和 10 秒轮询逻辑。
- API 已热修部署 `Cache-Control: no-store, max-age=0`，部署前备份：`/opt/bounty-board/backups/pre-deploy-auto-refresh-20260918T175604Z`；数据库未修改，斗鱼 Worker 未重启。
- 管理员验证：`yjw1018594399` 和 `苦瓜` 两个超级管理员均可登录，用户管理接口正常返回记录。
- 回滚备份：`/opt/bounty-board/backups/pre-deploy-20260917T165158Z-5f679b4/source.tar.gz`。
