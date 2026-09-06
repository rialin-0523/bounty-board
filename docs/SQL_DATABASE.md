# 悬赏令 SQL 数据库说明

这份文档给朋友改数据库用。当前项目使用的是 **Supabase PostgreSQL**，核心数据都在 `users / settings / challenges / follow_orders / douyu_profiles / bind_sessions / auth_sessions` 这些表里。

## 先说结论

- **正式业务库是 SQL**，而且是 PostgreSQL。
- **用户主身份认斗鱼 UID**，不是昵称。
- **普通前台不允许手填斗鱼资料**，斗鱼资料只能由绑定接口抓取，或者管理员在后台通过接口修正。
- **旧表 `app_users` 不再作为主表**，当前代码以 `users` 为准。
- 绑定功能要先有下面这些表：`bind_sessions`、`auth_sessions`、`douyu_profiles`。

## 推荐执行顺序

### 1）如果是旧库增量更新
先执行：

```sql
supabase/binding_increment.sql
```

这个脚本会：

- 把旧的 `app_users` 尽量迁到 `users`
- 补 `users / settings / created_by`
- 补绑定相关表
- 给现有表加索引、触发器和 RLS

### 2）如果是全新数据库
执行：

```sql
supabase/migration.sql
```

这个脚本会一次性建好完整结构。

---

## 1. users

统一用户表，既存站内账号，也存斗鱼资料。

### 主要字段

- `id`：UUID 主键
- `username`：站内用户名
- `username_normalized`：用户名归一化字段，唯一
- `password_salt`：密码盐
- `password_hash`：密码哈希
- `douyu_uid`：斗鱼 UID，唯一
- `douyu_nickname`：斗鱼昵称
- `douyu_avatar`：斗鱼头像链接
- `douyu_level`：斗鱼等级
- `douyu_badge_name`：粉丝牌名称
- `douyu_badge_level`：粉丝牌等级
- `is_blacklisted`：是否拉黑
- `bind_session_id`：绑定会话 ID
- `last_login_at`：最后登录时间
- `created_at` / `updated_at`

### 关键约束

- `username_normalized` 唯一
- `douyu_uid` 唯一
- 用户名长度建议 2-20
- 斗鱼 UID 和昵称必须一起存在

### 用途

- 用户注册
- 用户登录
- 斗鱼资料主记录
- 黑名单

---

## 2. settings

配置表，key-value 结构。

### 主要字段

- `key`
- `value`
- `updated_at`

### 当前最重要的配置

- `min_douyu_level`：最低斗鱼等级

### 用途

控制用户能不能发任务、跟单、发隐藏任务。

---

## 3. challenges

主任务表。

### 主要字段

- `id`
- `boss_id`
- `title`
- `description`
- `condition_desc`
- `gift_type`
- `gift_quantity`
- `is_hidden`
- `parent_challenge_id`
- `created_by`
- `status`
- `created_at` / `updated_at`

### 关键约束

- `gift_type` 只能是：`飞机`、`火箭`、`币`
- `gift_quantity > 0`
- `status` 只能是：`active`、`completed`、`cancelled`
- `created_by` 外键指向 `users.id`

### 用途

- 发布主任务
- 管理隐藏任务归属

---

## 4. follow_orders

跟单表。

### 主要字段

- `id`
- `challenge_id`
- `boss_id`
- `gift_type`
- `gift_quantity`
- `created_by`
- `created_at`

### 关键约束

- `challenge_id` 外键指向 `challenges.id`
- `created_by` 外键指向 `users.id`
- `gift_type` 同样限制为：`飞机`、`火箭`、`币`
- `gift_quantity > 0`

### 用途

- 跟单记录
- 记录是谁创建的跟单

---

## 5. douyu_profiles

斗鱼弹幕资料缓存表。

### 主要字段

- `id`
- `room_id`
- `profile_key`
- `uid`
- `name`
- `level`
- `avatar`
- `badge_name`
- `badge_level`
- `first_seen_at`
- `previous_last_seen_at`
- `last_seen_at`
- `message_count`
- `created_at` / `updated_at`

### 关键约束

- `(room_id, profile_key)` 唯一
- 常用索引：
  - `room_id + uid`
  - `room_id + name`

### 用途

- 绑定时临时缓存斗鱼发言人的资料
- 方便后面补资料、回看

---

## 6. bind_sessions

绑定识别码会话表。

### 主要字段

- `id`
- `room_id`
- `code`
- `code_normalized`
- `code_day`
- `status`
- `expires_at`
- `matched_at`
- `matched_uid`
- `matched_name`
- `matched_avatar`
- `matched_level`
- `matched_badge_name`
- `matched_badge_level`
- `matched_message`
- `user_id`
- `completed_at`
- `created_at` / `updated_at`

### 关键约束

- `status` 只能是：`pending`、`matched`、`completed`、`expired`、`cancelled`
- `(code_day, code_normalized)` 唯一
- `user_id` 外键指向 `users.id`

### 用途

- 2 分钟识别码
- 绑定流程状态流转
- 防止同一天重复生成相同识别码

---

## 7. auth_sessions

长期登录会话表。

### 主要字段

- `id`
- `user_id`
- `session_token_hash`
- `expires_at`
- `created_at`
- `last_seen_at`
- `revoked_at`
- `updated_at`

### 关键约束

- `session_token_hash` 唯一
- `user_id` 外键指向 `users.id`

### 用途

- 浏览器长期登录
- 只存 token 哈希，不存明文 token

---

## 8. 你朋友最可能会改的地方

### A. 想补测试数据
直接往 `users` 插一条即可，但注意：

- `douyu_uid` 不能重复
- `username_normalized` 不能重复
- `douyu_uid` 和 `douyu_nickname` 最好一起填

### B. 想改绑定逻辑
看这三个表：

- `bind_sessions`
- `douyu_profiles`
- `auth_sessions`

### C. 想改最低斗鱼等级限制
改：

- `settings.min_douyu_level`

### D. 想改“谁能看隐藏任务”
看：

- `challenges.created_by`
- `follow_orders.created_by`
- 以及前端的可见性过滤逻辑

---

## 9. 当前项目里最重要的几个规则

1. **斗鱼 UID 是主身份**，昵称可变。
2. **用户端不能自己手填斗鱼资料**。
3. **管理员可以在后台手工修正斗鱼资料**。
4. **绑定码有效期 2 分钟**。
5. **绑定码同一天不能重复生成相同值**。
6. **登录状态走 `auth_sessions`**。
7. **旧 `app_users` 只当迁移痕迹**，不要再回退回去。

---

## 10. 项目里对应的 SQL 文件

- `supabase/migration.sql`
- `supabase/binding_increment.sql`

如果你朋友要直接改库，优先看这两个文件。

