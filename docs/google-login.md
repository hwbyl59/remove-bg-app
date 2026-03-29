# 谷歌登录功能改造说明

## 背景

原站点为纯静态导出的 Next.js 14 应用，部署在 Cloudflare Pages，无任何用户系统。本次改造在不改变部署架构的前提下，新增谷歌账号登录功能，并实现服务端每日使用次数限制。

---

## 使用规则

| 用户类型 | 每日免费次数 | 计数依据 |
|--------|------------|--------|
| 未登录 | 1 次 | IP 地址 |
| 已登录 | 4 次 | 谷歌账号 ID |

- 每天 **UTC 0 点**自动重置，无需人工干预
- 限制在服务端强制执行，无法通过清除浏览器缓存绕过

---

## 架构设计

```
浏览器 (静态页面)
  │
  ├── Google Identity Services (GIS)   # 客户端登录，获取 ID Token
  │
  └── POST /api/remove-bg
        ├── googleToken (可选)          # 已登录时附带
        │
        └── Cloudflare Pages Function
              ├── 验证 Token → Google tokeninfo API
              ├── 查询 / 更新使用次数 → Cloudflare KV
              └── 代理请求 → Remove.bg API
```

**选型原因：**
- 静态导出（`output: 'export'`）不支持 Next.js 服务端渲染，无法使用 NextAuth.js
- GIS 为纯客户端库，兼容静态页面
- Cloudflare KV 天然集成于 Pages Functions，无需额外数据库

---

## 文件改动清单

### `app/layout.js`
加载 GIS 脚本，放在 layout 层而非 page 层，避免页面重渲染时重复初始化。

```js
import Script from 'next/script';

<Script
  src="https://accounts.google.com/gsi/client"
  strategy="afterInteractive"
/>
```

---

### `app/page.js`

新增状态：

| 状态 | 类型 | 说明 |
|------|------|------|
| `credential` | string \| null | 谷歌 ID Token（JWT） |
| `userEmail` | string \| null | 仅用于界面展示 |
| `usesRemaining` | number \| null | 当日剩余次数 |
| `showLoginPrompt` | boolean | 是否展示登录引导 |

主要逻辑：

- **GIS 初始化**：页面加载后轮询等待 `window.google` 就绪，调用 `renderButton` 渲染登录按钮，`locale: 'en'` 强制英文显示
- **登录回调**：保存 token，解码 JWT payload 取邮箱用于展示（验证在服务端）
- **上传请求**：登录状态下将 `googleToken` 附加到 FormData
- **限流处理**：收到 429 时，根据 `requiresLogin` 字段决定展示登录引导还是"次数用尽"提示
- **次数展示**：从响应头 `X-Uses-Remaining` 读取剩余次数，实时更新徽章

---

### `functions/api/remove-bg.ts`（Cloudflare 生产 API）

核心改动：

**1. Token 验证**
```ts
async function verifyGoogleToken(token: string): Promise<string | null> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );
  // 返回用户唯一 ID (sub)，验证失败返回 null
}
```

**2. KV Key 设计**
```
已登录：user:{googleSub}:{YYYY-MM-DD}
未登录：anon:{CF-Connecting-IP}:{YYYY-MM-DD}
```
Key 包含日期，天然实现每日重置；TTL 设为 2 天，自动清理旧数据。

**3. 限流逻辑**
```
读取 KV 当日计数
  ├── 已达上限 → 返回 429 + { requiresLogin, error }
  └── 未达上限 → 调用 Remove.bg → 成功后计数 +1 → 返回图片 + X-Uses-Remaining 头
```

**4. 本地开发兼容**
通过判断 `env.USAGE_KV` 是否存在来区分环境：生产环境执行限流逻辑，本地开发跳过（Next.js 无 KV）。

---

### `app/api/remove-bg/route.js`（本地开发 API）

接收 `googleToken` 字段但不做任何限流处理，保持本地开发体验不受影响。

---

### `wrangler.toml`

绑定 KV 命名空间：

```toml
[[kv_namespaces]]
binding = "USAGE_KV"
id = "743a3b1efd994abe8ae9b69ffd9ecf7a"
```

---

### `.github/workflows/deploy.yml`

`NEXT_PUBLIC_*` 变量在静态构建时由 Next.js 编译内嵌，必须在 build 步骤注入：

```yaml
- run: npm run build
  env:
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
```

---

## 基础设施配置

### Cloudflare KV
```bash
npx wrangler kv namespace create USAGE_KV
# 将输出的 id 填入 wrangler.toml
```

### GitHub Secrets
| Secret 名称 | 值 |
|------------|---|
| `GOOGLE_CLIENT_ID` | 谷歌 OAuth 客户端 ID |

### Google Cloud Console
1. 进入 [API 凭据页面](https://console.cloud.google.com/apis/credentials)
2. 编辑 OAuth 2.0 客户端
3. **已授权的 JavaScript 来源**中添加：
   - `https://your-project.pages.dev`
   - `http://localhost:3000`（本地开发）

---

## 验证方法

**本地验证（UI 流程）**
```bash
npm run dev
# 访问 http://localhost:3000
# 确认登录按钮渲染、登录/退出流程正常
# Network 面板确认登录后请求含 googleToken 字段
```

**生产验证（限流）**
1. 匿名访问：第 1 次成功，第 2 次收到登录引导
2. 登录后：再可使用 4 次，用尽后提示"次数用尽"
3. 响应头 `X-Uses-Remaining` 随每次请求递减

**KV 数据查询**
```bash
npx wrangler kv key list --namespace-id=743a3b1efd994abe8ae9b69ffd9ecf7a
npx wrangler kv key get "anon:1.2.3.4:2026-03-29" --namespace-id=743a3b1efd994abe8ae9b69ffd9ecf7a
```
