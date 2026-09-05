# 悬赏令技术接手说明

## 1. 项目是什么

这是一个 React + Vite + Supabase PostgreSQL 的武侠风任务悬赏平台，带斗鱼账号绑定和长期登录能力。

当前代码已经把两条主线合并：

- 主分支 v3 任务系统：`users`、`settings`、`created_by`、隐藏任务可见性、黑名单、最低斗鱼等级。
- 斗鱼绑定系统：2 分钟识别码、指定直播间弹幕命中、斗鱼资料回写、用户名密码注册、长期登录 Cookie。

## 2. 运行结构

- 前端：`src/`
- 后端：`server/`
- 数据库迁移：`supabase/migration.sql`
- 已有数据库增量脚本：`supabase/binding_increment.sql`

## 3. 关键规则

### 3.1 用户表

当前统一以 `users` 为准，字段同时承载：

- 站内账号：`username`、`username_normalized`、`password_salt`、`password_hash`
- 斗鱼资料：`douyu_uid`、`douyu_nickname`、`douyu_avatar`、`douyu_level`、`douyu_badge_name`、`douyu_badge_level`
- 权限状态：`is_blacklisted`、`last_login_at`

`app_users` 只应视作旧数据迁移痕迹，不再作为主代码依赖。

### 3.2 配置表

- `settings.min_douyu_level` 控制最低斗鱼等级。
- 后台“配置管理” tab 修改后，发布、跟单、添加隐藏任务都会受影响。

### 3.3 任务可见性

- `created_by` 必须写入任务和跟单。
- 隐藏任务只对创建者自己、以及主任务创建者可见。
- 首页和详情页都按登录用户做可见性过滤。

### 3.4 斗鱼绑定

- 用户点击生成识别码后，后端生成 6 位码，TTL 2 分钟。
- 后端只在存在有效绑定码时监听斗鱼弹幕。
- 命中后回写 UID / 昵称 / 头像 / 等级 / 粉丝牌等级，再让用户设置站内用户名和密码。
- 完成后创建 `auth_sessions`，Cookie 保持长期登录。

## 4. 启动方式

```bash
npm install
npm run server
npm run dev
```

生产部署默认前台地址：`https://xd.miyang.cloud/`，后台地址：`https://xd.miyang.cloud/xiaoyangadmin/`。当前服务器上 HTTP 已通，HTTPS 证书待后续补齐。

## 5. 修改后要检查的文件

- `src/lib/api.js`
- `src/pages/HomePage.jsx`
- `src/pages/PublishPage.jsx`
- `src/pages/ChallengeDetail.jsx`
- `src/Admin.jsx`
- `src/components/Layout.jsx`
- `server/store.mjs`
- `supabase/migration.sql`
- `supabase/binding_increment.sql`
- `README.md`

## 6. 验证清单

```bash
npm run build
npm run lint
node --check server/index.mjs
node --check server/douyu.mjs
node --check server/store.mjs
node --check server/auth.mjs
```

## 7. 当前注意点

- 后端需要 `SUPABASE_SECRET_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY`。
- 斗鱼监听只在有有效绑定码时启动，空闲会自动停。
- 如果主分支数据库还没有 `users` / `settings` / `created_by`，先跑 `supabase/binding_increment.sql` 或直接按 `supabase/migration.sql` 初始化。
