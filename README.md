# 悬赏令 - 户外团播任务接单平台

武侠风格的任务悬赏展示平台

## 技术栈
- React + Vite
- Supabase (数据库 + 存储)

## 功能
- 前台展示：武侠风悬赏令列表，支持按状态/揭榜人/类型筛选
- 后台管理：任务 CRUD、揭榜人管理

## 环境变量
创建 `.env` 文件：
```
VITE_SUPABASE_URL=https://tbtvgdeljiiwzixwiwue.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_CVVMEJT6cC1ho_s0URwf3g_DsATUGJP
```

## 本地运行
```bash
npm install
npm run dev
```

## 部署
1. Push 到 GitHub
2. 连接 Vercel 自动部署
3. 配置环境变量