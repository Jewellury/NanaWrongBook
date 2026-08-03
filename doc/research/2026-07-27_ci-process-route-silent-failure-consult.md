# 问题征询：Next.js 16 + Prisma + Playwright + Docker standalone 在 GitHub Actions CI 上 /process route 静默失败

> 日期：2026-07-27
> 项目：NanaWrongBook（fork 自 wrong-notebook，Next.js 16 + Prisma + SQLite）
> 仓库：https://github.com/Jewellury/NanaWrongBook
> PR：#3（dev → main）
> 征询对象：外部 AI 协助诊断
> 作者：项目维护者 + Claude Code（主会话）

---

## 一、项目背景（30 秒看懂）

- **技术栈**：Next.js 16.0.10（Turbopack）+ Prisma + SQLite + Playwright 1.49
- **部署**：Docker（`output: 'standalone'` + `node server.js`），通过 GitHub Actions 构建镜像推 GHCR，服务器 pull 运行
- **测试**：Vitest 单测（CI pass）+ Vitest 集成测试（CI pass）+ Playwright E2E（CI **fail**）
- **CI**：GitHub Actions ubuntu-latest，Node 22，已装 ffmpeg + Playwright browsers

## 二、核心问题

**E2E 测试中 `/api/nana/cases/:id/process` route handler 在 CI 上静默失败——不执行、不报错、不返回。**

具体表现：
1. CL-04 步骤成功：点"收好这道题"→ 461ms 看到"已收好"toast → `POST /api/nana/cases` 成功（Case 入库）
2. CL-05 步骤卡住：等 30s `getByText('AI 摘要')` timeout——因为 `/process` 没返回 AI 结果，前端永远停在"整理中"状态
3. **/process route handler 的 console.log 不出现在 CI 日志**——证明 handler 根本没执行
4. **fake provider（监听 127.0.0.1:3999）只收到 `/__test/register` 请求，没收到 `/chat/completions`**——证明 case-analyzer.ts 没调到 fake provider

## 三、已排查的假设（附证据）

### 假设 1：fake provider 没启动 → ❌ 排除
- CI 日志：`fake provider ready (responded on attempt 2)`（curl 退出码判断）
- fake-provider.log：`fake-provider listening on 3999`
- 诊断 spec（`e2e/ci/_diagnose-audio.spec.ts`）能成功调 fake provider 的 `/__test/register`

### 假设 2：env 没注入给 Next.js → ❌ 排除（已加双重保险）
- ci.yml `e2e-test` job env 段设了 `VOLCENGINE_API_KEY/BASE_URL/LITE_ENDPOINT_ID`
- `playwright.config.ts` 的 `webServer.env` 也显式注入这三个变量
- case-analyzer.ts 第 308 行：`const baseURL = process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"`
- 但 `/process` route 的 `[process-route DEBUG]` console.log 不出现，所以无法确认 case-analyzer 是否被调到

### 假设 3：Next.js standalone 模式不兼容 `next start` → ✅ 部分确认
- `next.config.ts` 配置了 `output: 'standalone'`
- CI 日志出现警告：`⚠ "next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
- 尝试用 `node .next/standalone/server.js` 启动 → 页面空白（缺 `.next/static` 静态资源）
- 加 `cp -r .next/static .next/standalone/.next/static` → 页面加载，但注册提交后不跳转（疑似 DATABASE_URL 相对路径在 standalone CWD 下解析错）
- 加 `DATABASE_URL: file:${process.cwd()}/e2e.db` 绝对路径 → 仍不跳转

### 假设 4：Next.js dev mode 行为异常 → ⚠️ 当前怀疑
- 改用 `npx next dev -p 3000`（开发模式）启动 webServer
- 注册流程通了（用户能创建 + 登录 + 跳 /nana）
- capture 页面加载、题图上传、"已收好"保存都成功
- 但 `/process` 仍然静默失败（handler 不执行）
- **dev mode 在 CI 上首次编译 route 时可能有不可见的时序问题**（本地 dev 没这问题）

### 假设 5：录音步骤导致问题 → ❌ 排除
- 诊断 spec 单独验证 getUserMedia：返回 1 audio track，"我听完了"按钮正常显示
- golden-path 已加 `process.env.CI === 'true'` 跳过录音步骤
- /process 仍然失败——**与录音无关**

### 假设 6：Prisma 数据库连接问题 → ❌ 排除
- CL-04 createCase 成功（Prisma 写入正常）
- 注册/登录都走 Prisma，都成功
- 只有 /process 的 route handler 不执行

## 四、关键代码位置

| 文件 | 行号 | 作用 |
|------|------|------|
| `next.config.ts` | 4 | `output: 'standalone'`（为 Docker 部署优化） |
| `playwright.config.ts` | 45-51 | webServer 配置（当前用 `npx next dev`） |
| `src/app/api/nana/cases/[id]/process/route.ts` | 274-389 | POST handler（调用 case-analyzer.ts） |
| `src/lib/nana/case-analyzer.ts` | 304-319 | 读 `VOLCENGINE_BASE_URL` + 创建 OpenAI client + 调 fake provider |
| `e2e/ci/nana-golden-path.spec.ts` | 252-304 | CL-03/04 步骤（录音跳过 + 保存） |
| `e2e/ci/nana-golden-path.spec.ts` | 310-314 | CL-05 卡住点（`getByText('AI 摘要')` 30s timeout） |
| `.github/workflows/ci.yml` | 149-184 | e2e-test job 配置（Start fake provider + Run Playwright） |
| `scripts/start-fake-provider.ts` | 全文 | fake provider 启动入口（监听 3999） |
| `e2e/helpers/fake-provider-server.ts` | 212-327 | fake provider 实现（OpenAI 兼容接口） |
| `Dockerfile` | 68-69, 101 | 生产部署用 standalone + `node server.js` |

## 五、CI 失败链路（从 fake provider 视角）

```
[正常]  CI Start step → fake provider listening on 3999
[正常]  spec beforeAll → POST /__test/register（注册 fixture 哈希）
[正常]  Playwright 点"收好这道题" → POST /api/nana/cases（Case 创建）
[正常]  前端 toast "已收好"（461ms）
[正常]  前端异步触发 POST /api/nana/cases/:id/process（被 page.waitForRequest 捕获）
[失败]  /process route handler 不执行（console.log 无输出）
[失败]  case-analyzer.ts 不被调用（fake provider 无 /chat/completions 请求）
[失败]  前端等 AI 结果 30s → timeout
```

**关键矛盾**：前端 `page.waitForRequest(/\/process$/)` 成功捕获了请求（CL-04 第 303 行通过），但 route handler 没执行。

## 六、已尝试的修复（按时间顺序）

| # | 修复 | 结果 |
|---|------|------|
| 1 | fake provider 用独立脚本启动（替代 `npx tsx -e`） | ✅ 修对了启动失败 |
| 2 | bash 就绪检查改用 curl 退出码 | ✅ 修对了 "000000" 误判 |
| 3 | spec beforeAll 加端口检测 | ✅ 修对了 EADDRINUSE |
| 4 | webServer.env 显式注入 VOLCENGINE_* | ❌ 无效 |
| 5 | standalone server.js 替代 next start | ❌ 页面空白 |
| 6 | 复制 .next/static 到 standalone | ❌ 注册不跳转 |
| 7 | DATABASE_URL 绝对路径 | ❌ 仍不跳转 |
| 8 | 改用 `npx next dev`（开发模式） | 🟡 注册通了，/process 仍失败 |
| 9 | CI 跳过录音步骤 | 🟡 不再卡录音，卡 /process |
| 10 | /process route 加 console.log 诊断 | ❌ 日志不出现 |

## 七、约束（不可违反）

1. **不改 Prisma schema**（安全铁律）
2. **Dockerfile 不能破坏**（生产部署依赖 standalone 模式）
3. **`next.config.ts` 的 `output: 'standalone'` 最好不要动**（Docker 依赖）——如果必须改，需要提供 Dockerfile 配套修改方案
4. **本地 Docker Desktop 不稳定**（Windows，不能用本地 Docker 跑测试容器）
5. **CI 必须在 GitHub Actions 跑**（不回到本地 Docker 门禁）

## 八、我们考虑的方案（请评估或提供更好的）

### 方案 X：继续在 CI 用 `next start`（非 standalone 路径）
- 改 `playwright.config.ts` webServer.command 回 `npm run start`
- 接受 Next.js 的 standalone 警告，赌它只是警告不影响功能
- **疑虑**：警告明确说"does not work"，之前测试也证实 case-analyzer 读不到 env

### 方案 Y：E2E 跳过 /process 相关断言
- spec 里 CL-05/06/07 加 `if (!CI)` 跳过
- CI 只验证 createCase + 保存 + 录音跳过
- **疑虑**：AI 结果卡链路（case-analyzer → fake provider → DB 落库）完全无自动化覆盖

### 方案 Z：用 vitest 集成测试替代 E2E 覆盖 /process
- 写 vitest 直接调 case-analyzer.ts + fake provider，绕过 Playwright + Next.js route 层
- E2E 只测前端交互（保存、导航、UI 状态）
- **疑虑**：route handler 本身的鉴权、请求解析、事务逻辑不被覆盖

### 方案 W（待评估）：next.config.ts 用环境变量切换 output
```ts
const nextConfig = {
  output: process.env.NEXT_BUILD_STANDALONE === 'false' ? undefined : 'standalone',
  ...
}
```
- CI build 时设 `NEXT_BUILD_STANDALONE=false`，用 `next start` 正常启动
- Docker build 时不设，保持 standalone
- **疑虑**：next.config.ts 在 build 时读 env，需要确认 Next.js 16 行为；另外 CI build 和 webServer 是两个 step，env 要在两个 step 都设

### 方案 V（待评估）：CI 用 `next start` + 移除 output: 'standalone'，Dockerfile 改回传统模式
- `next.config.ts` 移除 `output: 'standalone'`
- Dockerfile 改：复制整个 node_modules + `CMD ["npm", "start"]`
- **疑虑**：Docker 镜像变大（复制整个 node_modules）；Dockerfile 改动需重新验证部署

## 九、我们想问的问题

1. **Next.js 16 + `output: 'standalone'` + Playwright webServer 在 CI 上有已知问题吗？**（特别是 route handler 静默不执行）
2. **`next dev` 在 CI headless 上首次编译 route handler 是否有已知的时序问题？**（本地 dev 没问题，CI 才出现）
3. **方案 W（环境变量切换 output）在 Next.js 16 上可行吗？**有没有更优雅的"CI 用 next start，Docker 用 standalone"分离方案？
4. **方案 Z（vitest 替代）是否是社区常见做法？**Playwright E2E 在 CI 上跑 Next.js API route 是否本来就不可靠？
5. **有没有可能是 NextAuth session 在 dev mode + CI 上的问题？**（/process 第一步是 `getServerSession`，如果 session 拿不到会直接 401，但前端 fetch 不会重试也不会显示错误）

## 十、补充信息

### CI 环境
- GitHub Actions ubuntu-latest（Ubuntu 24.04）
- Node 22.23.1
- Playwright 1.49 + Chromium 143.0.7499.4（非 headless，`isHeadless: false`）
- ffmpeg 已装

### 本地环境
- Windows 10 + Node 22
- Docker Desktop 不稳定（Fast Startup 冲突）
- 本地跑 Playwright 没试过（shell 进程管理在 Git Bash/WSL 下不可靠）

### 最近的 commit（dev 分支）
- `1a8e923` diag: /process route 临时打印 env
- `bbc8df5` fix(e2e): CI 环境跳过录音步骤
- `0173d9c` fix(e2e): CI webServer 统一用 next dev
- `56afc7d` revert: 回滚 fake-provider-server debug 日志
- 完整 git log：`git log origin/main..origin/dev --oneline`（约 15 个 commit）

### 相关文档
- 计划：`doc/plan/nana-test-framework-ci-fix-plan.md`（v1 + v2 修订）
- 审计：`doc/auditlog/nana-test-framework-ci-fix-plan-audit.md`
- 执行日志：`doc/executionlog/nana-test-framework-ci-fix-log.md`
- A-1 原始日志：`doc/executionlog/quality-os-v1-phase-a-a1-log.md`

---

> 任何方向的建议都会帮助：根因诊断、方案选择、我们没考虑到的可能性、或者"这个问题无解，用方案 Y/Z 绕过"的判断。
> 如果需要更多代码片段或 CI 日志，请告知具体位置。
