# 移动端自动化测试方案

> **类型**：plan-agent 产出 · 待用户确认后交 execute-agent 实施
> **创建时间**：2026-07-04
> **目标**：减少每次部署后的人工手机点测，建立三层自动化测试体系

---

## 1. 素材审查与 Fixture 整理

### 1.1 图片目录扫描结果

**目录**：`E:\nana\doc\research\vision-samples\handheld\`（已在 `.gitignore` 中排除，不入 git）

| 统计项 | 值 |
|--------|-----|
| 文件数量 | 20 张 |
| 格式 | 全部 JPG |
| 总大小 | 15,301,756 字节（≈14.6 MB） |
| 单张范围 | 380 KB – 918 KB |
| 命名模式 | `微信图片_20260620{时分秒}_{序号}_23.jpg` |

### 1.2 Fixture 候选挑选（3 张）

基于 `handheld-report.md` 的 AI 逐条分析报告，按测试需求挑选：

| Fixture 用途 | 源文件 | 大小 | 选择理由（基于报告） |
|-------------|--------|------|---------------------|
| **清晰题图（无手写）** | `微信图片_20260620133628_621_23.jpg` | 818 KB | 报告标注"图片未提供标准答案"，纯印刷题面，无手写痕迹，题面完整可识别 |
| **有手写痕迹** | `微信图片_20260620134151_628_23.jpg` | 861 KB | 报告标注有详细手写解答（含导数推导过程），题面+手写共存，识别成功 |
| **稍微模糊/倾斜** | `微信图片_20260620134556_637_23.jpg` | 695 KB | 报告标注"只拍到大题一部分，题号+(1)在画面外"——采集不完整/倾斜，但内容仍可识别 |

### 1.3 隐私检查

**检查方法**：AI 分析报告中未提及任何姓名、学校、班级、手机号等个人信息。但报告是文本分析，无法替代视觉检查。

**执行要求**：
1. 实施前由用户（或 execute-agent 辅助）逐张目视检查 3 张候选图片
2. 如发现姓名、学校名、班级、手机号等隐私信息：
   - 优先换一张同类图片
   - 如必须使用，先打码处理（遮挡隐私区域）
3. 确认无隐私后方可压缩并放入 `tests/fixtures/nana/cases/`

**当前判定**：⚠️ 待目视确认。报告未发现隐私信号，但需人工最终确认。

### 1.4 压缩与放置

**目标**：每张 fixture 压缩到 ≤ 200 KB，3 张总计 ≤ 600 KB

**压缩方案**：
- 使用 `sharp`（已在 devDependencies 中）编写一次性脚本 `scripts/prepare-e2e-fixtures.ts`
- 输入：`doc/research/vision-samples/handheld/` 中的 3 张候选
- 输出：`tests/fixtures/nana/cases/`，重命名为语义化文件名
- 压缩参数：宽度 ≤ 1280px，JPEG quality 80

**输出文件命名**：

| 源文件 | 输出文件名 |
|--------|-----------|
| `...621_23.jpg` | `clear-printed.jpg` |
| `...628_23.jpg` | `with-handwriting.jpg` |
| `...637_23.jpg` | `tilted-partial.jpg` |

**目录结构**：
```
tests/
  fixtures/
    nana/
      cases/
        clear-printed.jpg      # 清晰印刷题图
        with-handwriting.jpg   # 含手写解答
        tilted-partial.jpg     # 倾斜/不完整但可识别
        README.md              # fixture 说明（来源、用途、隐私状态）
```

**Git 策略**：
- `tests/fixtures/nana/cases/*.jpg` → **提交到 git**（体积小，CI 需要）
- `doc/research/vision-samples/handheld/` → **保持 .gitignore 排除**（原始大图不入库）

---

## 2. 三层测试架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    部署流程                              │
│                                                         │
│  push main → CI 构建 → ┌─ Layer 1: CI E2E ──→ 镜像推送  │
│                        │   (门禁：失败阻塞)              │
│                        │                                │
│  服务器 pull ────────→ └─ Layer 2: 生产 Smoke ──→ 验收   │
│                        │   (门禁：失败告警)              │
│                        │                                │
│                        └─ Layer 3: 人工真机 ──→ 签发    │
│                            (非门禁：抽检)                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Layer 1：CI E2E（部署前门禁）

**运行位置**：GitHub Actions（`.github/workflows/ci.yml` 的 `e2e-test` job）

**运行时机**：push 到 main / PR 到 main

**环境**：
- 临时 SQLite（`e2e.db`），每次 CI 全新创建
- `npm run build` + `npm run start` 启动生产构建
- Playwright chromium（桌面 Chrome 模拟移动视口）

**测试账号**：CI 内自动注册的临时用户（沿用现有 `auth-flow.spec.ts` 模式），不使用生产测试账号

**移动视口模拟**：
```typescript
// playwright.config.ts 新增 project
{
  name: 'mobile-chrome',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:3000',
  },
}
```

**覆盖范围**（第一版 9 项）：

| # | 测试用例 | 对应需求 |
|---|---------|---------|
| 1 | 登录后直跳 /nana | 登录后直跳 /nana |
| 2 | 首页三入口可见（拍一道题 / 看看知识地图 / 周末小检查） | 首页三入口可见 |
| 3 | 拍题页可上传 clear-printed.jpg | 上传清晰题图 |
| 4 | 拍题页可上传 with-handwriting.jpg | 上传有手写痕迹题图 |
| 5 | 拍题页可上传 tilted-partial.jpg | 上传模糊/倾斜题图 |
| 6 | 保存 case 成功（看到"已收好"提示） | 保存 case 成功 |
| 7 | 知识地图可打开（/nana/knowledge-map 加载完成） | 知识地图可打开 |
| 8 | 最近题浮层可打开（?openCases=1 自动展开抽屉） | 最近题浮层可打开 |
| 9 | 题图详情可加载（点最近题卡片 → 题图加载） | 题图详情可加载 |
| 10 | 挂知识点流程可走通（选知识点 → 挂上 → 看到标签 chip） | 挂知识点流程可走通 |

**CI 中不测试的内容**：
- ❌ 测试数据清理（CI 用临时 DB，跑完即销毁，无需清理）

> 注：挂知识点流程在 CI 中可测，因为 CI 已有 `seed_graph.ts` 注入 48 个知识点节点。

**阻塞规则**：CI E2E 失败 → **阻塞镜像推送和部署**

### 2.3 Layer 2：生产 Smoke Test（部署后验证）

**运行位置**：GitHub Actions（新增 workflow 或手动触发）

**运行时机**：服务器 `docker compose up -d` 后自动触发（或手动 dispatch）

**环境**：
- 生产 URL：`https://nana.nanatop.xyz`
- 专用测试账号（凭证通过 GitHub Secrets 注入，**不写入代码/文档/commit**）

**凭证管理**：

| Secret 名 | 用途 | 配置位置 |
|-----------|------|---------|
| `E2E_SMOKE_EMAIL` | 测试账号邮箱 | GitHub Repo Settings → Secrets |
| `E2E_SMOKE_PASSWORD` | 测试账号密码 | GitHub Repo Settings → Secrets |
| `E2E_BASE_URL` | 生产 URL（默认 `https://nana.nanatop.xyz`） | GitHub Repo Settings → Secrets |

本地调试时使用 `.env.e2e.local`（已被 `.gitignore` 的 `.env*` 规则覆盖）：
```bash
# .env.e2e.local（不入 git，仅本地调试用）
E2E_SMOKE_EMAIL=（用户自行填写）
E2E_SMOKE_PASSWORD=（用户自行填写）
E2E_BASE_URL=https://nana.nanatop.xyz
```

**移动视口模拟**：同 Layer 1，Pixel 7 视口

**覆盖范围**（精简版，6 项）：

| # | 测试用例 | 说明 |
|---|---------|------|
| S1 | 用测试账号登录 → 直跳 /nana | 验证认证系统正常 |
| S2 | 首页三入口可见 | 验证首页渲染 |
| S3 | 上传 clear-printed.jpg → 保存 case | 验证拍题+存储链路 |
| S4 | 打开知识地图 | 验证图谱数据加载 |
| S5 | 打开最近题浮层 → 看到刚保存的 case | 验证数据一致性 |
| S6 | 清理本次测试产生的 case | 验证清理（需新增 DELETE API） |

**阻塞规则**：Smoke test 失败 → **告警但不自动回滚**，人工判断是否回滚

### 2.4 Layer 3：人工真机验收（最小范围）

**保留原因**：以下能力无法在 Playwright 桌面浏览器中真实模拟

| # | 验收项 | 为什么不能自动化 |
|---|--------|----------------|
| M1 | 相机调起 + 真实拍照 | Playwright `setInputFiles` 模拟文件上传，不能调起真实后置相机 |
| M2 | 麦克风录音 | `getUserMedia` 在无头浏览器中受限，无法验证真实录音质量 |
| M3 | 真实手机浏览器手感 | 触摸滚动、安全区域（safe-area-inset）、输入法弹出等移动端原生交互 |
| M4 | 微信内置浏览器兼容性 | 微信 X5 内核有特殊行为，无法用 Chromium 模拟 |

**执行频率**：
- 每次大版本发布前（非每次部署）
- 只在 Layer 1 + Layer 2 全过后才做
- 预计 5-10 分钟可完成

**验收清单（打印用）**：
```
□ 手机浏览器打开 nana.nanatop.xyz
□ 登录测试账号
□ 拍题页调起相机，拍一道真实题目
□ 录音功能可用（录 5 秒）
□ 保存 case 成功
□ 知识地图在手机上可滚动/缩放
□ 最近题浮层在手机上可打开/关闭
□ 微信内打开无异常
```

---

## 3. 测试覆盖矩阵

### 3.1 需求 → 测试层映射

| 需求 | Layer 1 (CI) | Layer 2 (Smoke) | Layer 3 (人工) |
|------|:---:|:---:|:---:|
| 登录后直跳 /nana | ✅ | ✅ | — |
| 首页三入口可见 | ✅ | ✅ | — |
| 拍题页可上传测试图片 | ✅（3 种 fixture） | ✅（1 种 fixture） | ✅（真实相机） |
| 保存 case 成功 | ✅ | ✅ | ✅ |
| 知识地图可打开 | ✅ | ✅ | ✅ |
| 最近题浮层可打开 | ✅ | ✅ | ✅ |
| 题图详情可加载 | ✅ | — | ✅ |
| 挂知识点流程可走通 | ✅ | — | — |
| 测试数据可按测试账号清理 | N/A（临时DB） | ✅ | — |
| 相机调起 | — | — | ✅ |
| 麦克风录音 | — | — | ✅ |
| 真实手机浏览器手感 | — | — | ✅ |

### 3.2 各层测试文件组织

```
e2e/
  ci/                          # Layer 1: CI E2E
    nana-login-redirect.spec.ts
    nana-home-entries.spec.ts
    nana-capture-upload.spec.ts
    nana-save-case.spec.ts
    nana-knowledge-map.spec.ts
    nana-recent-cases.spec.ts
    nana-case-detail.spec.ts
    nana-tag-knowledge.spec.ts

  smoke/                       # Layer 2: 生产 Smoke
    nana-smoke.spec.ts         # 单文件，串行执行

  fixtures/
    nana/
      cases/
        clear-printed.jpg
        with-handwriting.jpg
        tilted-partial.jpg
    math_test.png              # 已有 fixture（上游 upload-correction 测试用）

  helpers/
    nana-helpers.ts            # 共享：登录、上传、保存、清理
    smoke-helpers.ts           # Smoke 专用：env 读取、清理

playwright.config.ts           # 更新：新增 mobile-chrome project + smoke project
```

---

## 4. 测试数据清理策略

### 4.1 Layer 1（CI）：无需清理

CI 使用临时 `e2e.db`，每次 CI run 全新创建，跑完随 runner 销毁。

### 4.2 Layer 2（生产 Smoke）：需要清理

**问题**：当前无 `DELETE /api/nana/cases/[id]` 端点，且 `Artifact` 外键为 `ON DELETE RESTRICT`（不能直接删有 Artifact 的 Case）。

**方案**：新增 `DELETE /api/nana/cases/[id]` 端点

```
DELETE /api/nana/cases/[id]
- 鉴权：session.user.id 必须等于 case.studentId（归属校验）
- 事务内操作：
  1. 删除该 case 的所有 Artifact
  2. 删除该 case 的所有 CaseKnowledgeTag（已有 onDelete: Cascade，但显式删更安全）
  3. 删除 Case 本身
- 返回：204 No Content
- 错误：401 未授权 / 404 不存在或不属于自己
```

**清理流程**（Smoke test `afterAll` 钩子）：
1. 登录测试账号
2. `GET /api/nana/cases` 获取本次测试创建的 case 列表
3. 逐个 `DELETE /api/nana/cases/[id]`
4. 验证 `GET /api/nana/cases` 返回空列表（或恢复到测试前状态）

**安全护栏**：
- DELETE 端点只允许删除**自己的** case（`studentId === session.user.id`）
- 不提供批量删除（避免误操作）
- Smoke test 中只删除本次 run 创建的 case（按时间戳过滤）

### 4.3 Layer 3（人工）：不产生持久数据

人工验收如果保存了 case，手动在知识地图最近题中删除（依赖 Layer 2 的 DELETE API）。

---

## 5. 凭证安全方案

### 5.1 铁律

> **测试账号凭证不得出现在代码、文档、commit message、日志中。**
> 只能通过 GitHub Secrets 或 `.env.e2e.local`（本地）读取。

### 5.2 各层凭证来源

| 层 | 凭证来源 | 说明 |
|----|---------|------|
| Layer 1 (CI) | CI 内自动注册临时用户 | 不需要外部凭证 |
| Layer 2 (Smoke) | GitHub Secrets → 环境变量 | `E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD` |
| Layer 2 (本地调试) | `.env.e2e.local` → `process.env` | 文件已被 `.gitignore` 排除 |
| Layer 3 (人工) | 用户手动输入 | 不自动化 |

### 5.3 代码中如何读取

```typescript
// e2e/helpers/smoke-helpers.ts
const SMOKE_EMAIL = process.env.E2E_SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.E2E_SMOKE_PASSWORD;
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz';

if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
  throw new Error('Missing E2E_SMOKE_EMAIL or E2E_SMOKE_PASSWORD. '
    + 'Set them in GitHub Secrets or .env.e2e.local');
}
```

### 5.4 GitHub Actions 中注入

```yaml
# .github/workflows/smoke-test.yml
env:
  E2E_SMOKE_EMAIL: ${{ secrets.E2E_SMOKE_EMAIL }}
  E2E_SMOKE_PASSWORD: ${{ secrets.E2E_SMOKE_PASSWORD }}
  E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
```

### 5.5 检查清单

- [ ] `.env.e2e.local` 已被 `.gitignore` 的 `.env*` 规则覆盖（✅ 已确认）
- [ ] 文档中不出现明文邮箱/密码（✅ 本文档已遵守）
- [ ] commit message 不含凭证
- [ ] Playwright trace/report 不泄露凭证（登录步骤用 `test.skip()` 而非明文填充到 trace 中——实际需用 `page.fill()` 传变量，不硬编码）

---

## 6. 实施步骤

### Phase 1：素材准备（0.5 天）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 1.1 目视检查 3 张候选图片 | 确认无隐私 | 用户执行 |
| 1.2 编写 `scripts/prepare-e2e-fixtures.ts` | 压缩脚本 | sharp 压缩到 ≤200KB |
| 1.3 运行脚本生成 fixture | `tests/fixtures/nana/cases/*.jpg` | 3 张语义化命名 |
| 1.4 编写 fixture README | `tests/fixtures/nana/cases/README.md` | 记录来源、用途、隐私状态 |

### Phase 2：DELETE API + 测试 Helper（0.5 天）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 2.1 新增 `DELETE /api/nana/cases/[id]` | API 端点 | 事务删除 Artifact + Case |
| 2.2 编写 `e2e/helpers/nana-helpers.ts` | 共享工具函数 | login、uploadImage、saveCase、cleanupCases |
| 2.3 编写 `e2e/helpers/smoke-helpers.ts` | Smoke 工具函数 | env 读取、登录、清理 |

### Phase 3：CI E2E 测试（1 天）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 3.1 更新 `playwright.config.ts` | 新增 mobile-chrome project | Pixel 7 视口 |
| 3.2 编写 7 个 CI E2E spec 文件 | `e2e/ci/*.spec.ts` | 覆盖 9 项需求 |
| 3.3 本地跑通 CI E2E | 全绿 | `npx playwright test --project=mobile-chrome` |
| 3.4 更新 `ci.yml` | E2E job 使用 mobile-chrome project | 确保 CI 中跑移动视口 |

### Phase 4：生产 Smoke Test（0.5 天）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 4.1 编写 `e2e/smoke/nana-smoke.spec.ts` | Smoke 单文件 | 6 项，串行 |
| 4.2 新增 `.github/workflows/smoke-test.yml` | Smoke workflow | workflow_dispatch 触发 |
| 4.3 配置 GitHub Secrets | E2E_SMOKE_EMAIL/PASSWORD/BASE_URL | 用户在 GitHub 设置 |
| 4.4 创建 `.env.e2e.example` | 模板文件 | 不含真实凭证 |
| 4.5 部署后手动触发验证 | Smoke 全绿 | 在生产环境验证 |

### Phase 5：人工验收清单（0.5 天）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 5.1 编写人工验收清单文档 | `doc/guide/manual-acceptance-checklist.md` | 打印用清单 |
| 5.2 记录到部署指南 | 更新 `doc/guide/deployment-guide.md` | 加入三层测试说明 |

---

## 7. 失败阻塞规则

### 7.1 决策矩阵

| 测试层 | 失败后果 | 自动/手动 | 回滚？ |
|--------|---------|----------|--------|
| Layer 1 (CI E2E) | **阻塞镜像推送** | 自动 | N/A（未部署） |
| Layer 2 (Smoke) | **告警 + 阻塞验收签发** | 自动告警 | 人工决定 |
| Layer 3 (人工) | **阻塞签发** | 人工 | 人工决定 |

### 7.2 具体规则

**CI E2E 失败**：
- `ci.yml` 的 `e2e-test` job 退出码 ≠ 0
- → Docker build/push job 不执行（`needs: e2e-test`）
- → 代码不进入 main（PR 时）
- → 修复后重新 push

**生产 Smoke 失败**：
- `smoke-test.yml` 退出码 ≠ 0
- → GitHub Actions 发出通知（email / Slack webhook）
- → 部署日志标注"Smoke test 失败，需人工排查"
- → 不自动回滚（可能是测试本身的问题，不一定是部署问题）
- → 人工判断：如果是部署问题 → `docker compose` 回滚到上一版本镜像

**人工验收失败**：
- 验收人标记"不通过"
- → 不签发本次发布
- → 回到开发修复

### 7.3 部署门禁流程图

```
push main
  │
  ├─ CI: unit-test → integration-test → build-check → e2e-test
  │                                                    │
  │                                          ┌─ pass ──→ build-and-push (镜像推送)
  │                                          └─ fail ──→ ⛔ 阻塞
  │
  ├─ 服务器: docker compose pull && up -d
  │
  ├─ Smoke: workflow_dispatch → nana-smoke.spec.ts
  │                                    │
  │                           ┌─ pass ──→ ✅ 部署成功
  │                           └─ fail ──→ ⚠️ 告警，人工排查
  │
  └─ 人工: 验收清单（大版本时）
                    │
           ┌─ pass ──→ ✅ 签发
           └─ fail ──→ ⛔回滚
```

---

## 8. Playwright 技术要点

### 8.1 移动视口配置

```typescript
// playwright.config.ts 新增
projects: [
  // 已有：chromium（上游 E2E 测试用）
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  // 新增：mobile-chrome（nana E2E 测试用）
  {
    name: 'mobile-chrome',
    use: {
      ...devices['Pixel 7'],
      baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    },
    testDir: './e2e/ci',
  },
  // 新增：smoke（生产环境）
  {
    name: 'smoke',
    use: {
      ...devices['Pixel 7'],
      baseURL: process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz',
    },
    testDir: './e2e/smoke',
    retries: 0,  // 生产环境不重试，失败即告警
  },
],
```

### 8.2 文件上传方式

```typescript
// nana 拍题页的 input[type="file"] 是 hidden，需要先点击按钮触发
await page.goto('/nana/capture');

// 点击"先拍一下这道题"按钮触发 input
await page.getByRole('button', { name: '先拍一下这道题' }).click();

// 用 setInputFiles 上传 fixture
const fixturePath = path.join(__dirname, '../fixtures/nana/cases/clear-printed.jpg');
await page.setInputFiles('input[type="file"]', fixturePath);

// 等待图片预览出现
await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({ timeout: 5000 });
```

### 8.3 保存 Case 验证

```typescript
// 点击"收好这道题"
await page.getByRole('button', { name: '收好这道题' }).click();

// 等待成功提示
await expect(page.getByText('已收好')).toBeVisible({ timeout: 10000 });
```

### 8.4 知识地图 + 最近题浮层

```typescript
// 直接带 ?openCases=1 跳转，自动展开最近题抽屉
await page.goto('/nana/knowledge-map?openCases=1');

// 等待地图加载
await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({ timeout: 10000 });

// 验证最近题抽屉已展开
await expect(page.getByText('最近拍过的题')).toBeVisible({ timeout: 5000 });
```

### 8.5 题图详情加载

```typescript
// 在最近题列表中点击第一个 case 卡片
await page.locator('[data-testid="case-card"]').first().click();

// 验证题图加载
await expect(page.getByRole('img', { name: '题图' })).toBeVisible({ timeout: 10000 });
```

### 8.6 挂知识点流程

```typescript
// 前置：已保存一个 case 并跳转到知识地图 ?openCases=1
// 最近题抽屉已展开，case 列表可见

// 1. 点击第一个 case 卡片，展开详情面板
await page.locator('button').filter({ hasText: /\d+月\d+日/ }).first().click();

// 2. 等待详情面板加载（题图 + 标签区）
await expect(page.getByText('知识点')).toBeVisible({ timeout: 10000 });

// 3. 从下拉选择一个知识点（选第一个非空选项）
const select = page.locator('select').first();
await select.selectOption({ index: 1 }); // 跳过"选一个知识点"占位项

// 4. 点击"挂上"按钮
await page.getByRole('button', { name: '挂上' }).click();

// 5. 验证成功提示
await expect(page.getByText('已挂上')).toBeVisible({ timeout: 5000 });

// 6. 验证标签 chip 出现（知识点名称显示在绿色 chip 中）
await expect(page.locator('.bg-\\[\\#EAF2EC\\]')).toBeVisible({ timeout: 3000 });
```

---

## 9. 关键决策记录

| # | 决策 | 理由 |
|---|------|------|
| D1 | CI E2E 用自动注册临时用户，不用生产测试账号 | CI 环境隔离，不触碰生产数据 |
| D2 | 生产 Smoke 用专用测试账号（GitHub Secrets） | 需要真实环境验证，但凭证不入代码 |
| D3 | 新增 `DELETE /api/nana/cases/[id]` 端点 | 当前无删除接口，Artifact 外键 RESTRICT 需事务删除 |
| D4 | Fixture 压缩到 ≤200KB 提交到 git | CI 需要本地 fixture，不能依赖外部存储 |
| D5 | 原始手持照片保持 .gitignore 排除 | 体积大+潜在隐私，不入库 |
| D6 | Layer 1 覆盖"挂知识点流程" | CI 已有 seed_graph.ts 注入 48 节点，流程可测 |
| D7 | Smoke 失败不自动回滚 | 可能是测试本身问题，人工判断更安全 |
| D8 | 使用 Pixel 7 视口模拟移动端 | Playwright 内置设备配置，接近真实手机尺寸 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Fixture 图片含隐私信息 | 法律/道德风险 | 目视检查 + 打码 + 不提交原图 |
| DELETE API 被滥用 | 用户误删数据 | 归属校验 + 不提供批量删除 |
| Smoke test 账号被锁 | 部署验证中断 | 密码不要太简单；失败后人工解锁 |
| 生产环境 case 累积 | 数据库膨胀 | Smoke test afterAll 自动清理 |
| Playwright 移动视口≠真机 | 遗漏移动端 bug | Layer 3 人工真机兜底 |
| CI 时变长 | 开发效率降低 | E2E 只跑 nana 关键路径，不跑全量 |

---

## 附录 A：现有测试基础设施盘点

| 设施 | 状态 | 说明 |
|------|------|------|
| `playwright.config.ts` | ✅ 已有 | chromium project，需新增 mobile-chrome + smoke |
| `e2e/auth-flow.spec.ts` | ✅ 已有 | 登录/注册流程，可参考 |
| `e2e/upload-correction.spec.ts` | ✅ 已有 | 上传图片流程（上游），可参考 setInputFiles 用法 |
| `e2e/fixtures/math_test.png` | ✅ 已有 | 上游测试 fixture |
| `ci.yml` e2e-test job | ✅ 已有 | 需更新 project 选择 |
| `build-and-push.yml` | ✅ 已有 | 部署工作流，需追加 smoke trigger |
| `DELETE /api/nana/cases/[id]` | ❌ 缺失 | 需新增（Phase 2） |
| `tests/fixtures/nana/cases/` | ❌ 缺失 | 需创建（Phase 1） |
| `.env.e2e.example` | ❌ 缺失 | 需创建（Phase 4） |
| Smoke workflow | ❌ 缺失 | 需创建（Phase 4） |

---

> **下一步**：用户确认本方案后，交 execute-agent 按 Phase 1-5 顺序实施。
> 如需调整覆盖范围、优先级或时间线，请在确认前提出。
