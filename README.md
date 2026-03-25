# 🖼️ Image Background Remover

基于 Next.js + Remove.bg API 的 AI 背景移除网站。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 Remove.bg API Key：

```
REMOVE_BG_API_KEY=your_api_key_here
```

> API Key 获取：https://www.remove.bg/developers  
> 免费额度：每月 50 张

### 3. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000

### 4. 部署到 Vercel（免费）

```bash
npm i -g vercel
vercel
```

在 Vercel 控制台添加环境变量 `REMOVE_BG_API_KEY`，然后 deploy。

## 📁 项目结构

```
├── app/
│   ├── api/remove-bg/route.js   ← 后端 API：接收图片 → 调用 Remove.bg → 返回结果
│   ├── page.js                   ← 前端界面：拖拽上传 + 预览 + 下载
│   ├── layout.js
│   └── globals.css
├── .env.local.example            ← 环境变量模板
├── package.json
└── README.md
```

## ⚠️ 安全注意

- **不要把 API Key 提交到 GitHub**，`.env.local` 已在 `.gitignore` 中忽略
- API Key 只存在于后端，前端代码无法访问
- 处理完成的图片**不存储**，每次请求独立完成

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 样式 | Tailwind CSS |
| AI API | Remove.bg |
| 部署 | Vercel（推荐）或任意 Node.js 主机 |
