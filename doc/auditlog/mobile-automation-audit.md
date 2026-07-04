# Nana 移动端 E2E 自动化 · 审计报告

> 关联计划: doc/plan/mobile-automation-test-plan.md
> 执行日志: 本轮 5 commits (34b4d92..5b61920)
> 审计日期: 2026-07-04
> PR: [#1 dev→main](https://github.com/Jewellury/NanaWrongBook/pull/1)

## 审计结论（大白话）

**总体判定：✅ 通过**

本轮移动端 E2E 自动化方案安全、隔离干净、不碰生产。测试用临时账号在 CI 临时数据库里跑，fixture 图片已人工确认无隐私，原始大图未入 git。3025 端口改动只影响本地，CI 中仍用 3000。Smoke workflow 只读、凭证只来自 GitHub Secrets。`.catpaw/` 和 stage3 计划均未混入本轮提交。CI 4 项全绿。可以合 dev→main。

## 检查清单

### 审计点 1: CI E2E 是否只用临时环境和临时账号，不碰生产 ✅

- CI `e2e-test` job（ci.yml:92-136）使用 `DATABASE_URL: "file:./e2e.db"`，独立临时数据库
- 测试代码（nana-main-flow.spec.ts:21-27）用 `e2e_${Date.now()}` 生成临时账号，每次运行不同
- CI 环境的 `NEXTAUTH_URL: "http://127.0.0.1:3000"`，指向 CI runner 本地，不连生产
- 无任何对生产域名/数据库的引用

### 审计点 2: Smoke workflow 是否只读，凭证只来自 GitHub Secrets ✅

- smoke-test.yml 的凭证全部来自 `${{ secrets.E2E_SMOKE_EMAIL }}` / `${{ secrets.E2E_SMOKE_PASSWORD }}` / `${{ secrets.E2E_BASE_URL }}`，无硬编码
- smoke 测试代码（nana-smoke-readonly.spec.ts）流程：登录→/nana→三入口→知识地图，全读无写
- `test.skip(!SMOKE_EMAIL || !SMOKE_PASSWORD)` 确保无凭证时跳过而非崩溃
- 触发方式 `workflow_dispatch`（手动），不会自动跑

### 审计点 3: fixture 是否无隐私，原始大图是否未入 git ✅

- fixture README（tests/fixtures/nana/cases/README.md）记录：3 张图片经人工目视确认无学生姓名、学校、班级、手机号
- `tilted-partial.jpg` 含空白姓名/学号栏但未填写，不构成隐私
- 原始大图目录 `doc/research/vision-samples/handheld/` 在 `.gitignore` 中（第76行），`git log` 确认无提交记录
- 入 git 的 fixture 均为压缩版（122KB/130KB/171KB），总计 414KB

### 审计点 4: 3025 端口改动是否不影响 CI 和现有 E2E ✅

- `playwright.config.ts:7` — `const E2E_PORT = process.env.CI ? 3000 : 3025;`
- CI 中 `process.env.CI = true` → 用 3000，与 ci.yml 的 `NEXTAUTH_URL` 一致
- 本地非 CI → 用 3025，避免与开发服务器 3000 冲突
- `webServer.command` 在 CI 中用 `npm run start`（生产构建），本地用 `npx next dev -p 3025`
- 上游 chromium project 的 `testIgnore: ['**/ci/**', '**/smoke/**']` 不受影响
- CI E2E Tests 通过证实无影响

### 审计点 5: 新增 E2E 是否稳定、不过度依赖脆弱文案 ✅

**已修复的脆弱 locator（本轮 main fix）：**
- ~~`getByText('先拍一下这道题')`~~ → `getByText('点这里拍照，或从相册选')`：副标题是空状态独有文案，避免同页面多元素歧义
- ~~`getByText('最近拍过的题')`~~ → `getByRole('heading', { name: '最近拍过的题' }).first()`：用 heading role 排除按钮，.first() 定位抽屉标题
- dialog 处理从 `page.on` 改为 `page.once`，放在注册 submit 前，精准处理单次 alert 不吞后续

**仍依赖文案的 locator（可接受）：**
- `getByText('拍一道题')` / `getByText('看看知识地图')` / `getByText('周末小检查')` — 首页三入口文案，OPS 手册级别约定，变更概率低
- `getByText('点这里拍照，或从相册选')` — 拍题页副标题，UI 稳定区
- `getByRole('button', { name: '收好这道题' })` — 保存按钮，核心操作文案
- `getByText('已收好')` — 成功提示前缀
- `getByAltText('这道题的原图')` — 题图 alt 属性

**判定：** 所有 locator 均使用 role/alt/text 语义定位，无 CSS class 或 XPath 脆弱选择器。依赖的文案均为产品核心措辞（OPS 手册约束），可接受。

**后续建议（不阻塞本轮）：** 补一条点击"最近拍过"入口按钮打开浮层的测试路径，当前用 `?openCases=1` URL 参数作为稳定路径。

### 审计点 6: .env.e2e.example 是否不含真实凭证 ✅

- `.env.e2e.example` 中 `E2E_SMOKE_EMAIL=` 和 `E2E_SMOKE_PASSWORD=` 均为空值
- `E2E_BASE_URL=https://nana.nanatop.xyz` 是公开域名，非敏感信息
- 文件头注释明确说明"真实凭证只能放在 .env.e2e.local 或 GitHub Secrets 中"
- `.gitignore` 第34行 `.env*` 排除所有 env 文件，第36-37行白名单放行 `.env.example` / `.env.test.example` / `.env.e2e.example`

### 审计点 7: 本轮是否没有混入 stage3 和 .catpaw/ ✅

- `git diff 34b4d92..5b61920 --name-only` 列出 11 个文件，无 `doc/plan/stage3-ai-integration-plan.md`，无 `.catpaw/` 内任何文件
- `.catpaw/` 已加入 `.gitignore`（本轮 commit 5b61920），后续不会出现在 untracked
- `doc/plan/stage3-ai-integration-plan.md` 仍为 untracked，未被任何 commit 包含
- `.gitignore` diff 仅新增 `.catpaw/` 一行，无其他改动

### 审计点 8: CI 4 项绿灯结果 ✅

PR #1 CI 检查结果（2026-07-04）：

| Check | 状态 | 耗时 |
|-------|------|------|
| CI/Unit Tests | ✅ 通过 | 45s |
| CI/Integration Tests | ✅ 通过 | 42s |
| CI/Build Check | ✅ 通过 | 57s |
| CI/E2E Tests | ✅ 通过 | 2m6s |
| CI/Docker Build & Push | ⏭️ 跳过 | — (仅 tag push 触发) |

CI 链路：Unit Tests → Integration Tests → Build Check → E2E Tests，全部通过。
本地验证：`npm run build` 通过，`npx playwright test --project=mobile-chrome` 1 passed (1.2m)。

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2（后续） | 补"最近拍过"入口按钮点击路径测试 | e2e/ci/nana-main-flow.spec.ts | 下一轮新增独立 test case，点击浮层入口按钮而非 URL 参数 |
| — | 无阻塞问题 | — | — |

## 本轮 commit 清单

| Commit | Message |
|--------|---------|
| `f645898` | test-e2e-nana-mobile-automation-degraded-v1-fixture-and-main-flow-and-smoke-readonly |
| `21db004` | test: 修复 nana-main-flow E2E strict mode locator 歧义，dialog 改用 once 精准处理 |
| `fdc8a2e` | test: E2E 本地端口改用 3025 避免与开发服务器 3000 冲突 |
| `ec01706` | test: 修正 .env.e2e.example smoke 加载说明，更新 fixture README 图片描述 |
| `5b61920` | chore: 将 .catpaw/ 加入 .gitignore 避免干扰收口判断 |

## 下一步

审计通过。可合 PR #1 dev→main，触发 build-and-push workflow 构建镜像推 GHCR，然后按部署流程备份 + pull 镜像部署。
