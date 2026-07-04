# 移动端自动化测试方案（降阶实施版）

> **类型**：plan-agent 产出 · 已通过评审，按降阶方案实施
> **创建时间**：2026-07-04
> **降阶更新**：2026-07-04 — 避免一次性引入过多测试基础设施
> **目标**：减少每次部署后的人工手机点测，建立三层自动化测试体系

---

## 0. 降阶策略

原方案 5 个 Phase 一次铺开，风险在于测试基础设施引入过快、调试成本高。
降阶后按"最小可用 → 逐步加"推进：

| 阶段 | 原方案 | 降阶后 | 状态 |
|------|--------|--------|:----:|
| Phase 1 | 素材准备 | **不变**：目视确认 + 压缩 3 张 fixture | ⬜ 待执行 |
| Phase 2 | DELETE API + Helper | **拆分**：先出 API 方案文档+审计点，不直接实现 | ⬜ 待出文档 |
| Phase 3 | 8 个 CI E2E spec | **先做 1 条主链路**，稳定后再加 | ⬜ 待执行 |
| Phase 4 | 6 项 Smoke（含写操作） | **先做只读 Smoke**（登录+首页+知识地图），写操作等 DELETE API 审计通过 | ⬜ 待执行 |
| Phase 5 | 人工验收清单 | 推迟，等前 4 阶段稳定 | ⬜ 推迟 |

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

基于 `handheld-report.md` 的 AI 逐条分析报告挑选：

| Fixture 用途 | 源文件 | 大小 | 选择理由 |
|-------------|--------|------|---------|
| **清晰题图（无手写）** | `微信图片_20260620133628_621_23.jpg` | 818 KB | 纯印刷题面，无手写，完整可识别 |
| **有手写痕迹** | `微信图片_20260620134151_628_23.jpg` | 861 KB | 有详细手写解答，题面+手写共存 |
| **稍微模糊/倾斜** | `微信图片_20260620134556_637_23.jpg` | 695 KB | 只拍到部分题目/倾斜，但内容可识别 |

### 1.3 隐私检查流程

> **铁律：目视确认无隐私后才压缩入库。**

**检查清单**（逐张确认）：
- [ ] 无学生姓名
- [ ] 无学校名称 / 校徽
- [ ] 无班级信息
- [ ] 无手机号 / 微信号
- [ ] 无其他可识别个人身份的信息

**如发现隐私**：
1. 优先换一张同类图片
2. 如必须使用，先打码（遮挡隐私区域）
3. 打码后重新目视确认

### 1.4 压缩与放置

**目标**：每张 ≤ 200 KB，3 张总计 ≤ 600 KB

**脚本**：`scripts/prepare-e2e-fixtures.ts`（已创建，使用 sharp）

**输出**：
```
tests/
  fixtures/
    nana/
      cases/
        clear-printed.jpg       # 清晰印刷题图
        with-handwriting.jpg    # 含手写解答
        tilted-partial.jpg      # 倾斜/不完整但可识别
        README.md               # fixture 说明
```

**Git 策略**：
- `tests/fixtures/nana/cases/*.jpg` → **提交到 git**（体积小，CI 需要）
- `doc/research/vision-samples/handheld/` → **保持 .gitignore 排除**

---

## 2. 三层测试架构

### 2.1 架构总览

```
push main → CI 构建 → ┌─ Layer 1: CI E2E ──→ 镜像推送
                      │   (门禁：失败阻塞)

服务器 pull ────────→ └─ Layer 2: 生产 Smoke ──→ 验收
                      │   (门禁：失败告警)

                      └─ Layer 3: 人工真机 ──→ 签发
                          (非门禁：抽检)
```

### 2.2 Layer 1：CI E2E（部署前门禁）

**运行位置**：GitHub Actions `ci.yml` 的 `e2e-test` job

**环境**：
- 临时 SQLite（`e2e.db`），每次 CI 全新创建
- `npm run build` + `npm run start` 启动生产构建
- Playwright Pixel 7 视口（模拟移动端）

**测试账号**：CI 内自动注册临时用户（不使用生产账号）

**降阶覆盖范围**：

| 版本 | 覆盖内容 | 状态 |
|------|---------|:----:|
| **v1（本轮）** | 1 条主链路：登录→/nana→上传→保存→知识地图→最近题→题图详情 | ⬜ |
| v2（后续） | 加 handwriting / tilted fixture 上传 | ⬜ |
| v3（后续） | 加挂知识点流程 | ⬜ |

**v1 主链路测试步骤**：
```
1. 注册临时用户并登录
2. 验证直跳 /nana
3. 验证首页三入口可见（拍一道题 / 看看知识地图 / 周末小检查）
4. 进入拍题页 /nana/capture
5. setInputFiles 上传 clear-printed.jpg
6. 点击"收好这道题"
7. 验证"已收好"提示出现
8. 跳转 /nana/knowledge-map?openCases=1
9. 验证知识地图加载完成
10. 验证最近题浮层已展开
11. 点击第一个 case 卡片
12. 验证题图详情加载
```

**阻塞规则**：CI E2E 失败 → **阻塞镜像推送和部署**

### 2.3 Layer 2：生产 Smoke Test（部署后验证）

**运行位置**：GitHub Actions `smoke-test.yml`，`workflow_dispatch` 手动触发

**凭证**：通过 GitHub Secrets 注入（`E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD`），**不写入代码/文档/commit**

**降阶覆盖范围**：

| 版本 | 覆盖内容 | 前置条件 | 状态 |
|------|---------|---------|:----:|
| **v1（本轮）** | 只读：登录→/nana→三入口可见→知识地图可打开 | 无 | ⬜ |
| v2（后续） | 加：上传+保存 case | DELETE API 审计通过 | ⬜ |
| v3（后续） | 加：最近题浮层+清理 | DELETE API 已实现 | ⬜ |

**v1 只读 Smoke 步骤**：
```
1. 用测试账号登录（凭证从 env 读取）
2. 验证直跳 /nana
3. 验证首页三入口可见
4. 进入知识地图
5. 验证地图加载完成
```

**阻塞规则**：Smoke 失败 → **告警但不自动回滚**，人工判断

### 2.4 Layer 3：人工真机验收

**保留 4 项**（无法自动化）：

| # | 验收项 | 原因 |
|---|--------|------|
| M1 | 相机调起 + 真实拍照 | Playwright 不能调起真实后置相机 |
| M2 | 麦克风录音 | getUserMedia 在无头浏览器中受限 |
| M3 | 真实手机浏览器手感 | 触摸滚动、安全区域、输入法弹出 |
| M4 | 微信内置浏览器兼容性 | X5 内核特殊行为 |

**执行频率**：大版本发布前，非每次部署

---

## 3. 测试覆盖矩阵（降阶版）

| 需求 | Layer 1 v1 | Layer 2 v1 | Layer 3 | 后续 |
|------|:---:|:---:|:---:|------|
| 登录后直跳 /nana | ✅ | ✅ | — | |
| 首页三入口可见 | ✅ | ✅ | — | |
| 上传清晰题图 | ✅ | — | ✅（真实相机） | L2 v2 |
| 上传手写题图 | — | — | — | L1 v2 |
| 上传模糊/倾斜题图 | — | — | — | L1 v2 |
| 保存 case 成功 | ✅ | — | ✅ | L2 v2 |
| 知识地图可打开 | ✅ | ✅ | ✅ | |
| 最近题浮层可打开 | ✅ | — | ✅ | L2 v3 |
| 题图详情可加载 | ✅ | — | ✅ | |
| 挂知识点流程 | — | — | — | L1 v3 |
| 测试数据清理 | N/A | — | — | L2 v3（需 DELETE API） |

---

## 4. DELETE API 方案（先出文档，不实现）

> ⚠️ 这是生产数据删除能力，必须审计通过后才能实现。

### 4.1 API 契约

```
DELETE /api/nana/cases/[id]
```

**鉴权**：`session.user.id` 必须等于 `case.studentId`

**事务内操作**（Prisma `$transaction`）：
1. 删除该 case 的所有 `Artifact`
2. 删除该 case 的所有 `CaseKnowledgeTag`（schema 已有 `onDelete: Cascade`，但显式删更安全）
3. 删除 `Case` 本身

**返回**：`204 No Content`

**错误码**：
- `401` — 未授权（无 session）
- `404` — case 不存在或不属于当前用户（**不返回 403，避免 case id 枚举**）

### 4.2 审计检查点

| # | 审计项 | 验证方法 |
|---|--------|---------|
| A1 | 只能删除自己的 case | cross-user 请求返回 404 |
| A2 | 跨用户返回 404（非 403） | 防止 case id 枚举 |
| A3 | 事务内清理 Artifact + CaseKnowledgeTag + Case | 删后查询三表均无残留 |
| A4 | 不提供批量删除 | 无 `DELETE /api/nana/cases`（无 id）端点 |
| A5 | 不碰 User / KnowledgeNode / StudentNodeState | 只删 Case 及其子表 |
| A6 | 未认证返回 401 | 无 session 时 401 |
| A7 | case 不存在返回 404 | 随机 id 返回 404 |

### 4.3 测试覆盖要求

```
owner 200 → 删自己的 case，返回 204，删后 GET 返回 404
cross-user 404 → 用户 A 删用户 B 的 case，返回 404
unauth 401 → 无 session 请求，返回 401
```

### 4.4 实施时机

DELETE API **审计通过后**才实施。实施后才能解锁：
- Smoke v2（上传+保存 case）
- Smoke v3（最近题+清理）

---

## 5. 凭证安全方案

### 5.1 铁律

> **测试账号凭证不得出现在代码、文档、commit message、聊天中。**
> 只能通过 GitHub Secrets 或 `.env.e2e.local`（本地）读取。

### 5.2 各层凭证来源

| 层 | 凭证来源 | 说明 |
|----|---------|------|
| Layer 1 (CI) | CI 内自动注册临时用户 | 不需要外部凭证 |
| Layer 2 (Smoke) | GitHub Secrets → 环境变量 | `E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD` |
| Layer 2 (本地调试) | `.env.e2e.local` → `process.env` | 文件已被 `.gitignore` 排除 |
| Layer 3 (人工) | 用户手动输入 | 不自动化 |

### 5.3 检查清单

- [x] `.env.e2e.local` 已被 `.gitignore` 的 `.env*` 规则覆盖
- [x] `.env.e2e.example` 已创建（空值模板）
- [x] `.gitignore` 已加 `!.env.e2e.example` 例外
- [x] 文档中不出现明文邮箱/密码
- [ ] commit message 不含凭证（每次提交时检查）
- [ ] Playwright trace/report 不泄露凭证（用变量传值，不硬编码）

---

## 6. 降阶实施计划

### Phase 1：素材准备（本轮执行）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 1.1 用户目视检查 3 张候选图片 | 确认无隐私 | 用户执行 |
| 1.2 运行 `scripts/prepare-e2e-fixtures.ts` | `tests/fixtures/nana/cases/*.jpg` | sharp 压缩到 ≤200KB |
| 1.3 生成 fixture README | `tests/fixtures/nana/cases/README.md` | 来源、用途、隐私状态 |

### Phase 2：DELETE API 方案文档（本轮执行，不实现）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 2.1 输出 API 契约 + 审计点 | 本文档 §4 | 已完成 |
| 2.2 用户审计确认 | 审计通过后交 execute-agent | 不在本轮 |

### Phase 3：单条 CI E2E 主链路（本轮执行）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 3.1 更新 `playwright.config.ts` | 新增 mobile-chrome project | Pixel 7 视口 |
| 3.2 编写 `e2e/ci/nana-main-flow.spec.ts` | 1 条主链路 spec | 覆盖 §2.2 v1 的 12 步 |
| 3.3 本地验证 | spec 可跑通 | `npx playwright test --project=mobile-chrome` |

### Phase 4：只读版生产 Smoke（本轮执行）

| 步骤 | 产出 | 说明 |
|------|------|------|
| 4.1 编写 `e2e/smoke/nana-smoke-readonly.spec.ts` | 只读 Smoke spec | 登录+首页+知识地图 |
| 4.2 新增 `.github/workflows/smoke-test.yml` | Smoke workflow | workflow_dispatch 触发 |
| 4.3 用户配置 GitHub Secrets | E2E_SMOKE_EMAIL/PASSWORD/BASE_URL | 用户在 GitHub 设置 |

### Phase 5：人工验收清单（推迟）

等前 4 阶段稳定后再做。

---

## 7. 失败阻塞规则

| 测试层 | 失败后果 | 回滚？ |
|--------|---------|--------|
| Layer 1 (CI E2E) | **阻塞镜像推送** | N/A（未部署） |
| Layer 2 (Smoke v1 只读) | **告警** | 人工决定 |
| Layer 3 (人工) | **阻塞签发** | 人工决定 |

---

## 8. Playwright 技术要点

### 8.1 移动视口配置

```typescript
// playwright.config.ts 新增 project
{
  name: 'mobile-chrome',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:3000',
  },
  testDir: './e2e/ci',
},
{
  name: 'smoke',
  use: {
    ...devices['Pixel 7'],
    baseURL: process.env.E2E_BASE_URL ?? 'https://nana.nanatop.xyz',
  },
  testDir: './e2e/smoke',
  retries: 0,
},
```

### 8.2 文件上传（主链路核心步骤）

```typescript
await page.goto('/nana/capture');
// 点击"先拍一下这道题"按钮触发 input
await page.getByRole('button', { name: '先拍一下这道题' }).click();
// setInputFiles 上传 fixture
const fixturePath = path.join(__dirname, '../fixtures/nana/cases/clear-printed.jpg');
await page.setInputFiles('input[type="file"]', fixturePath);
// 等待图片预览
await expect(page.getByRole('img', { name: '刚拍的题图' })).toBeVisible({ timeout: 5000 });
```

### 8.3 保存 Case 验证

```typescript
await page.getByRole('button', { name: '收好这道题' }).click();
await expect(page.getByText('已收好')).toBeVisible({ timeout: 10000 });
```

### 8.4 知识地图 + 最近题浮层

```typescript
await page.goto('/nana/knowledge-map?openCases=1');
await expect(page.getByRole('heading', { name: '我的知识地图' })).toBeVisible({ timeout: 10000 });
await expect(page.getByText('最近拍过的题')).toBeVisible({ timeout: 5000 });
```

### 8.5 题图详情加载

```typescript
// 点击 case 卡片展开详情
await page.locator('button').filter({ hasText: /\d+月\d+日/ }).first().click();
// 等待题图加载（alt="这道题的原图"）
await expect(page.getByAltText('这道题的原图')).toBeVisible({ timeout: 10000 });
```

---

## 9. 关键决策记录

| # | 决策 | 理由 |
|---|------|------|
| D1 | CI E2E 用自动注册临时用户 | CI 环境隔离，不触碰生产数据 |
| D2 | 生产 Smoke 用专用测试账号（GitHub Secrets） | 凭证不入代码 |
| D3 | DELETE API 先出方案，审计通过后再实现 | 生产数据删除能力需审慎 |
| D4 | Fixture 压缩到 ≤200KB 提交到 git | CI 需要本地 fixture |
| D5 | 原始手持照片保持 .gitignore 排除 | 体积大+潜在隐私 |
| D6 | Phase 3 先做 1 条主链路 | 避免一次写 8 个 spec 调试成本高 |
| D7 | Phase 4 先做只读 Smoke | 写操作需 DELETE API 支持清理 |
| D8 | 使用 Pixel 7 视口 | Playwright 内置设备配置 |
| D9 | Smoke 失败不自动回滚 | 可能是测试本身问题 |
