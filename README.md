# 🖼️ Image Background Remover

基于 Next.js + Remove.bg API 的 AI 背景移除网站。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key（本地开发）

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

---

## 📦 部署

### 方案 A：Cloudflare Pages（推荐）

#### 步骤 1：在 Cloudflare Dashboard 创建项目

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages**
2. 点击 **Create a project** → **Connect to GitHub**
3. 授权 GitHub，选择仓库 **`hwbyl59/remove-bg-app`**
4. 设置构建参数：

   | 设置项 | 值 |
   |--------|-----|
   | **Project name** | `remove-bg-app` |
   | **Production branch** | `master` |
   | **Build command** | `npm run build` |
   | **Build output目录** | `.next` |
   | **Root directory** | `/` |

5. 点击 **Save and Deploy**

#### 步骤 2：配置环境变量（重要！）

在 Cloudflare Pages 项目设置中添加：

| 变量名 | 值 | 类型 |
|--------|-----|------|
| `REMOVE_BG_API_KEY` | 你的 Remove.bg API Key | **Secret** |

> Pages → remove-bg-app → **Settings** → **Environment Variables** → 添加变量，类型选 **Secret**

#### 步骤 3：等待部署完成

Cloudflare 会自动从 GitHub 构建并部署，每次 push 到 master 分支自动更新。

---

### 方案 B：Vercel（备选）

```bash
npm i -g vercel
vercel
```

在 Vercel 控制台添加环境变量 `REMOVE_BG_API_KEY`。

---

## 📁 项目结构

```
├── app/
│   ├── api/remove-bg/route.js   ← Next.js API（Vercel 部署时使用）
│   ├── page.js                   ← 前端界面
│   ├── layout.js
│   └── globals.css
├── functions/                   ← Cloudflare Pages Functions（Cloudflare 部署时使用）
│   ├── _shared.ts
│   └── api/remove-bg.ts        ← 后端 API
├── wrangler.toml               ← Cloudflare Pages 配置
├── tsconfig.json               ← TypeScript 配置
├── .env.local.example          ← 环境变量模板
├── .env.local                   ← 本地 API Key（不提交 Git）
└── package.json
```

**部署说明：**  
- Cloudflare Pages → 使用 `functions/` 目录（Workers 运行时）  
- Vercel / 本地开发 → 使用 `app/api/` 目录（Node.js 运行时）

## ⚠️ 安全注意

- **不要把 API Key 提交到 GitHub**，`.env.local` 已在 `.gitignore` 中忽略
- API Key 只存在于后端，前端代码无法访问
- 处理完成的图片**不存储**，每次请求独立完成

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 前端框架 | Next.js 14 (App Router) |
| 样式 | Tailwind CSS |
| 后端 | Next.js API Route（Vercel）或 Cloudflare Pages Functions |
| AI API | Remove.bg |
| 部署 | Cloudflare Pages / Vercel |
