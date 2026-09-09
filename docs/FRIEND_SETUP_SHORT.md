# 发给合作开发者的简短执行版

请先把主分支最新代码和当前绑定代码一起合并到数据库对应版本，然后按下面顺序做：

1. 不要清空现有 Supabase 数据库。
2. 如果当前数据库还没有 `users` / `settings` / `created_by` / 斗鱼绑定相关表，请优先执行：

```text
supabase/binding_increment.sql
```

3. 生产后端环境变量至少需要：

```bash
SUPABASE_URL=现有 Supabase 项目 URL
SUPABASE_SECRET_KEY=后端私密 key
DOUYU_BIND_ROOM_ID=63136
DOUYU_DANMAKU_HOSTS=danmuproxy.douyu.com,openbarrage.douyutv.com
BIND_SERVER_ALLOW_ORIGIN=https://xd.miyang.cloud,http://127.0.0.1:5173,http://localhost:5173
BIND_SERVER_BASE_URL=https://api.xd.miyang.cloud
COOKIE_SECURE=true
COOKIE_SAME_SITE=Lax
ADMIN_CREDENTIALS=管理员1:密码1,管理员2:密码2
ADMIN_SESSION_SECRET=一串足够长的随机字符串
```

本地测试时 `COOKIE_SECURE=false`。

4. 本地启动三部分：

```bash
npm install
npm run server:api      # HTTP API
npm run worker:douyu    # 斗鱼 TCP Worker
npm run dev             # 前端开发服务
```

5. 大访问量生产部署：

- 前端用 GitHub Pages，工作流在 `.github/workflows/deploy-pages.yml`。
- Pages 构建时 `VITE_API_BASE_URL=https://api.xd.miyang.cloud`。
- 服务器只保留 API 和 Worker，systemd 模板在 `deploy/systemd/`。
- API Nginx 模板在 `deploy/nginx/api.xd.miyang.cloud.conf`。
- 切完后停用旧的 `bounty-board-bind.service`，避免两个斗鱼监听器同时跑。

2026-09-09 当前状态：

- 服务器侧已经完成：`api.xd.miyang.cloud` DNS、HTTPS、`bounty-board-api.service`、`bounty-board-douyu-worker.service` 都已生效。
- GitHub Pages 还未完成：当前协作者权限是 `WRITE`，不能替仓库管理员启用 Pages；需要仓库管理员在 Settings → Pages 选择 GitHub Actions，绑定 `xd.miyang.cloud` 并开启 Enforce HTTPS。
- Pages 未启用前不要把 `xd.miyang.cloud` 的 DNS 从服务器 A 记录切到 GitHub Pages CNAME。

6. 验证 `/bind`：生成识别码，用斗鱼账号发弹幕，完成用户名密码设置。

必须检查 Supabase：

- `users.douyu_uid` 有值，且同一个 UID 不会重复。
- `bind_sessions` 有 matched/completed 记录。
- `auth_sessions` 有登录记录。
- `challenges.created_by` 和 `follow_orders.created_by` 有写入。
- `settings.min_douyu_level` 能正常读取 / 修改。
- 普通前台发布、跟单、添加隐藏任务时不出现老板ID手填框；后端会按登录 Cookie 自动写 `boss_id` / `created_by`。

详细文档看：

```text
docs/TECHNICAL_HANDOFF.md
docs/GITHUB_PAGES_API_WORKER_SPLIT.md
```
