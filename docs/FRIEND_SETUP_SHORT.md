# 发给合作开发者的简短执行版

请先合并 PR：

- https://github.com/rialin-0523/bounty-board/pull/2

然后按下面顺序做：

1. 不要清空现有 Supabase 数据库。
2. 如果当前 Supabase 已经有 `challenges`、`follow_orders` 等任务表，只在 SQL Editor 执行：

```text
supabase/binding_increment.sql
```

3. 配置后端环境变量，至少需要：

```bash
SUPABASE_URL=现有 Supabase 项目 URL
SUPABASE_SECRET_KEY=后端私密 key
DOUYU_BIND_ROOM_ID=63136
COOKIE_SECURE=true
```

本地测试时 `COOKIE_SECURE=false`。

4. 启动后端：

```bash
npm install
npm run server
```

5. 启动/部署前端：

```bash
npm run dev
# 或
npm run build
```

6. 验证 `/bind`：生成识别码，用斗鱼账号发弹幕，完成用户名密码设置。

必须检查 Supabase：

- `app_users.douyu_uid` 有值，且同一个 UID 不会重复。
- `bind_sessions` 有 matched/completed 记录。
- `auth_sessions` 有登录记录。

详细文档看：

```text
docs/TECHNICAL_HANDOFF.md
```
