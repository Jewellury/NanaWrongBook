# Nana 测试框架修复计划 · A-1 Remediation Plan

> 关联规格: `doc/spec/nana-v1-minimum-loop-acceptance.md`（FREEZE-001，14 条 R1a 主路径已冻结）
> 关联文档: `doc/research/2026-07-28_test-framework-design-and-debug-lessons.md`（被评审的测试框架总结）
> 计划日期: 2026-07-30
> 预计影响: `package.json`、`scripts/`、`e2e/`、`src/__tests__/`、`.github/workflows/ci.yml`、`tsconfig.e2e.json`、`doc/plan/`、`doc/executionlog/`

---

## 1. 大白话概述

这轮不是"再多写几条 E2E"，而是**给测试体系减肥 + 给诊断能力强身**。过去 17 轮 CI 试错才找到"漏跑两条 seed"，问题不在测试数量不够，而在每次失败只能看到"AI 摘要没出现"，不知道故障到底发生在哪一层。

所以我们要做三件事：
1. **统一环境准备入口**：不再让 Integration 和 E2E 各写各的数据库初始化命令，而是只用一个 `npm run test:env:prepare`，在浏览器启动前就把临时数据库、schema、seed、关键环境变量全部检查好，失败就立即停止并给出明确原因。
2. **把一条 648 行的黄金 E2E 拆成职责清晰的三层护栏**：API 契约测试（真实后端 + 假 Provider + 临时 DB）、UI 契约测试（浏览器只验证页面状态，可拦截后端）、全栈 Canary（只保留一条走真实浏览器→真实路由→真实 DB→假 Provider 的单一路径）。
3. **让测试代码也能被类型检查门禁**，并修掉当前监听 `requestfinished` 时把异步响应当同步对象用的 bug，让失败时能直接看到 /process 的 HTTP 状态、业务 status、error、audioStatus 和落库结果。

真实豆包、完整录音链路、性能趋势、AI 体验评审这些继续保留，但**暂时不进入每次 PR 的硬门禁**，等基础测试连续稳定后再恢复。

---

## 2. 任务分解

### 第一阶段：止血与诊断能力修复

- [ ] **任务 1.1**：修复 `e2e/ci/nana-golden-path.spec.ts` 中 `requestfinished` 监听器的异步 bug（涉及文件: `e2e/ci/nana-golden-path.spec.ts`，修改）
  - 将 `req.response()?.status()` 改为 `await req.response()` 后再读 status，或删除 status 输出仅保留 response 事件监听。
  - 同步清理 D1 阶段散落的三事件监听代码，保留 `requestfinished`/`requestfailed`/`response` 但写法正确。

- [ ] **任务 1.2**：新增 `tsconfig.e2e.json`，为 `e2e/` 目录提供独立类型检查（涉及文件: `tsconfig.e2e.json` 新增；`package.json` 修改）
  - 继承 `tsconfig.json`，`include: ["e2e/**/*.ts"]`，`compilerOptions.noEmit: true`。
  - 在 `package.json` 增加 `test:e2e:types` 脚本，并在 CI 的 `e2e-test` job 前增加 `tsc --noEmit -p tsconfig.e2e.json` 门禁。

- [ ] **任务 1.3**：拿到 /process 完整业务响应并在失败时打印分层证据（涉及文件: `e2e/ci/nana-golden-path.spec.ts` 修改；`e2e/helpers/response-logger.ts` 新增）
  - 用 `page.waitForResponse` 捕获 `/process` 响应体，断言：HTTP status、JSON 里的 `status`、`error`、`audioStatus`。
  - 新增辅助函数打印 `CaseAiResult` 是否落库、假 Provider 收到几次 `/chat/completions`。

- [ ] **任务 1.4**：清理本轮诊断遗留的临时代码（涉及文件: `src/app/api/nana/cases/[id]/process/route.ts` 修改；`src/app/nana/capture/page.tsx` 修改；`e2e/ci/_diagnose-audio.spec.ts` 删除）
  - 删除 route.ts 中 `[process-route DEBUG]` 三处 `fs.appendFileSync` 诊断写入。
  - 删除 capture/page.tsx 中 `[ctrl-diag]` 8 处调试日志。
  - 删除 `_diagnose-audio.spec.ts` 临时诊断 spec。
  - 保留 A2 stderr pipe、A3 Dump step、D1 waitForResponse + 三事件监听、D4 APIRequestContext 直调 + retry 作为长期诊断护栏。

### 第二阶段：建立唯一测试环境契约

- [ ] **任务 2.1**：新增 `scripts/test-env-prepare.ts`（或 `.sh`）统一测试环境准备入口（涉及文件: `scripts/test-env-prepare.ts` 新增；`package.json` 修改）
  - 完成：创建临时 SQLite 目录、运行 `prisma db push`、执行全部必需 seed。
  - 验证：KnowledgeNode ≥48、TextbookTopic =16、TextbookNodeMapping =48。
  - 检查：VOLCENGINE_API_KEY、VOLCENGINE_BASE_URL、LITE_ENDPOINT_ID、NEXTAUTH_SECRET、NEXTAUTH_URL、DATABASE_URL 等关键 env 存在且非空。
  - 输出：机器可读 JSON 摘要到 stdout（含表计数、env 检查通过项、用时），任一条件不满足 exit 1。

- [ ] **任务 2.2**：在 `package.json` 注册 `test:env:prepare` 脚本（涉及文件: `package.json` 修改）
  - 本地：调用 tsx 跑 `scripts/test-env-prepare.ts`。
  - CI：Integration/E2E/Canary 全部先执行 `npm run test:env:prepare`。

- [ ] **任务 2.3**：修改 `.github/workflows/ci.yml`，用统一入口替换 line 66-71 和 line 141-151 的重复命令（涉及文件: `.github/workflows/ci.yml` 修改）
  - `integration-test` job 的 Setup test database step 改为 `npm run test:env:prepare`。
  - `e2e-test` job 的 Setup Database step 改为 `npm run test:env:prepare`。
  - 删除两边各自手写的 `prisma db push`/`prisma db seed`/`tsx seed_graph.ts`/`tsx seed_textbook_topics.ts` 组合。

### 第三阶段：假 Provider 精简为固定响应队列

- [ ] **任务 3.1**：重写 `e2e/helpers/fake-provider-server.ts`，取消动态哈希注册（涉及文件: `e2e/helpers/fake-provider-server.ts` 修改；`e2e/helpers/register-fixture.ts` 删除）
  - 新增 `POST /__test/queue` 控制端点：测试预先压入一个固定响应队列（按顺序弹出）。
  - `POST /chat/completions` 每次从队列头部弹出下一个固定响应；队列为空时返回 HTTP 500 + `QUEUE_EMPTY`。
  - 删除 `/__test/register` 和动态 SHA-256 映射逻辑。
  - 删除 `setupFixtureRegistration` 及相关 Playwright 请求拦截注册代码。

- [ ] **任务 3.2**：定义固定响应队列数据结构（涉及文件: `e2e/helpers/fake-provider-server.ts` 修改；`e2e/fixtures/mock-results.ts` 新增或修改）
  - 把 clear-printed、tilted-partial、set-theory、inequality、function-graph 等 mock 结果集中到一个 fixture 文件。
  - 每个队列项包含：`content`（JSON 字符串化的 analyzeCase 结果）、可选 `delayMs`。

### 第四阶段：拆分四条独立护栏

- [ ] **任务 4.1**：建立**领域/集成测试**（涉及文件: `src/__tests__/integration/nana/domain-invariants.test.ts` 新增或从现有拆分）
  - 验证：双层标签双写（CaseTextbookTopicTag + CaseKnowledgeTag）、StudentNodeState 不新增、权限隔离（跨用户不可读）、事务原子性（中间失败回滚）。
  - 不依赖浏览器，直接用 Vitest + 临时 DB + 直接调用 lib/handler。

- [ ] **任务 4.2**：建立**API 契约测试**（涉及文件: `src/__tests__/integration/nana/process-api-contract.test.ts` 新增）
  - 真实 `/api/nana/cases/:id/process` route handler + 临时 DB + 固定响应队列假 Provider。
  - 断言：HTTP 状态 200、响应 JSON `status='success'`、`audioStatus` 符合预期、`CaseAiResult` 落库字段正确、假 Provider 收到 1 次 `/chat/completions`。
  - 覆盖 image-only 路径与 audio 路径（audio 用 fixture 文件替代真实录音）。

- [ ] **任务 4.3**：重写**UI 契约测试**（涉及文件: `e2e/ci/nana-golden-path.spec.ts` 修改或拆分为 `e2e/ci/nana-ui-contract.spec.ts` 新增）
  - 浏览器只验证页面状态：拍题 → 保存 → 出现"已收好" → 轮询中 → 成功/失败页面 → 结果卡展示。
  - 用 `page.route()` 拦截 `/api/nana/cases/*/process`，返回固定成功/失败响应。
  - 不验证 DB 细节，DB 细节由 API 契约测试覆盖。
  - 保留虚拟麦克风配置，但 CI 下 audio 链路仍跳过（因为完整音频链路在 API 契约测试中覆盖，UI 层只验证按钮/状态）。

- [ ] **任务 4.4**：保留并精简**全栈 Canary**（涉及文件: `e2e/ci/nana-canary.spec.ts` 新增）
  - 只保留一条路径：浏览器 → 真实 route → 真实 DB → 假 Provider（不拦截 /process）。
  - 使用固定响应队列，不做动态哈希注册。
  - 仅在 main push / nightly schedule 跑，不作为每次 PR 硬门禁。
  - 断言只保留：流程走通、页面关键文案出现、DB 有 CaseAiResult。

- [ ] **任务 4.5**：调整其他现有 E2E spec（涉及文件: `e2e/ci/nana-batch-path.spec.ts`、`e2e/ci/nana-cross-user.spec.ts`、`e2e/ci/nana-sequential-capture.spec.ts`、`e2e/ci/nana-main-flow.spec.ts` 修改或标记删除）
  - `nana-batch-path.spec.ts`：改为 API 契约测试（批量场景不需要浏览器）。
  - `nana-cross-user.spec.ts`：改为领域/集成测试。
  - `nana-sequential-capture.spec.ts`：保持 `test.fixme` 直到素材组 B fixture 就位；就位后改为 UI 契约测试 + API 契约测试组合。
  - `nana-main-flow.spec.ts`：合并进 Canary 或删除，避免重复。

### 第五阶段：CI workflow 与脚本调整

- [ ] **任务 5.1**：调整 `playwright.config.ts`（涉及文件: `playwright.config.ts` 修改）
  - webServer 启动命令改为先 `npm run test:env:prepare`，再启动 Next.js（或本地脚本同时启动 fake provider + Next.js）。
  - 简化项目配置：保留 mobile-chrome 用于 UI 契约测试和 Canary。
  - 移除为动态哈希注册服务的特殊配置。

- [ ] **任务 5.2**：新增 `scripts/start-test-stack.ts`（可选，涉及文件: `scripts/start-test-stack.ts` 新增）
  - 本地一键启动：test env prepare → fake provider → Next.js dev，供 UI 契约测试和 Canary 使用。
  - CI 可复用同一脚本，避免 yaml 里写多行后台命令。

- [ ] **任务 5.3**：调整 `.github/workflows/ci.yml` job 依赖与触发策略（涉及文件: `.github/workflows/ci.yml` 修改）
  - 保留 unit-test、integration-test、build-check。
  - e2e-test job 拆分为：
    - `ui-contract-test`：push/PR 硬门禁，跑 UI 契约测试。
    - `api-contract-test`：push/PR 硬门禁，跑 API 契约测试（可合并进 integration-test job 也可独立）。
    - `canary-test`：仅在 schedule / main push 触发，跑全栈 Canary。
  - 所有 job 失败时保留 A3 Dump step 和 evidence pack 上传。

### 第六阶段：暂停项与保留项清单

- [ ] **任务 6.1**：将真实 Provider Smoke、完整录音链路 CI 覆盖、AI 体验评分、20 次滚动性能基线明确标记为**暂停进入 PR 硬门禁**（涉及文件: `doc/active_spec.md` 更新；`doc/DECISIONS.md` 追加；`doc/plan/nana-test-framework-remediation-plan.md` 本文件已说明）
  - 保留相关代码/脚本但不在 PR CI 阻塞。
  - 恢复条件：基础测试连续 10 次 CI 无 flaky、失败能在一轮内定位。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/test-env-prepare.ts` | 新增 | 统一测试环境准备入口 |
| `scripts/start-test-stack.ts` | 新增 | 本地/CI 一键启动 test env + fake provider + Next.js |
| `tsconfig.e2e.json` | 新增 | e2e 目录独立类型检查 |
| `e2e/helpers/fake-provider-server.ts` | 重写 | 固定响应队列替代动态哈希注册 |
| `e2e/helpers/register-fixture.ts` | 删除 | 动态哈希注册取消 |
| `e2e/helpers/response-logger.ts` | 新增 | 捕获并打印 /process 完整业务响应 |
| `e2e/fixtures/mock-results.ts` | 新增/修改 | 集中 mock 响应数据 |
| `e2e/ci/nana-golden-path.spec.ts` | 重写/拆分 | 改为 UI 契约测试；修复异步监听 bug |
| `e2e/ci/nana-canary.spec.ts` | 新增 | 唯一不绕后端的全栈 Canary |
| `e2e/ci/nana-batch-path.spec.ts` | 重写 | 改为 API 契约测试 |
| `e2e/ci/nana-cross-user.spec.ts` | 重写 | 改为领域/集成测试 |
| `e2e/ci/nana-sequential-capture.spec.ts` | 修改 | 保持 fixme 待素材就位后重写 |
| `e2e/ci/nana-main-flow.spec.ts` | 删除 | 合并进 Canary 或 UI 契约测试 |
| `e2e/ci/_diagnose-audio.spec.ts` | 删除 | 临时诊断 spec 清理 |
| `src/__tests__/integration/nana/domain-invariants.test.ts` | 新增 | 双层标签、状态不变、权限、事务 |
| `src/__tests__/integration/nana/process-api-contract.test.ts` | 新增 | 真实 /process + 假 Provider + 临时 DB |
| `src/app/api/nana/cases/[id]/process/route.ts` | 修改 | 删除 [process-route DEBUG] 诊断写入 |
| `src/app/nana/capture/page.tsx` | 修改 | 删除 [ctrl-diag] 调试日志 |
| `playwright.config.ts` | 修改 | 简化 webServer、移除哈希注册配置 |
| `.github/workflows/ci.yml` | 修改 | 统一 test:env:prepare、拆分护栏 job |
| `package.json` | 修改 | 新增 test:env:prepare、test:e2e:types 等脚本 |
| `doc/active_spec.md` | 更新 | A-1 状态与暂停项说明 |
| `doc/DECISIONS.md` | 追加 | 新增关于测试护栏分层和暂停项的决策行 |

---

## 4. 验收标准

### 4.1 止血标准（必须先完成）

- [ ] `npx tsc --noEmit -p tsconfig.e2e.json` 通过，`e2e/ci/nana-golden-path.spec.ts` 不再出现 `req.response()?.status()` 未 await 的用法。
- [ ] `npm run test:env:prepare` 在本地和 CI 都能创建新临时 DB、跑完 schema + seed、验证 KnowledgeNode≥48 / TextbookTopic=16 / TextbookNodeMapping=48，任一失败 exit 1 并打印可读摘要。
- [ ] route.ts 和 capture/page.tsx 的诊断日志已清理，`_diagnose-audio.spec.ts` 已删除。

### 4.2 四条护栏标准

| 护栏 | 跑哪些测试 | 通过标准 | PR 硬门禁 |
|------|-----------|---------|----------|
| 领域/集成测试 | `src/__tests__/integration/nana/domain-invariants.test.ts` | 标签双写正确；StudentNodeState 数量不变；跨用户隔离；事务失败回滚 | 是 |
| API 契约测试 | `src/__tests__/integration/nana/process-api-contract.test.ts` | HTTP 200；`status='success'`；`CaseAiResult` 字段与 mock 一致；假 Provider 收到 1 次请求 | 是 |
| UI 契约测试 | `e2e/ci/nana-ui-contract.spec.ts` | 拍题→保存→"已收好"→整理状态→结果卡文案出现；拦截 /process 不崩溃 | 是 |
| 全栈 Canary | `e2e/ci/nana-canary.spec.ts` | 浏览器→真实 route→真实 DB→假 Provider 走通；页面关键文案出现；DB 有结果 | main/nightly 触发 |

### 4.3 CI 标准

- [ ] `.github/workflows/ci.yml` 的 `integration-test` 和 `e2e-test` job 不再手写重复 seed 命令，统一调用 `npm run test:env:prepare`。
- [ ] CI 失败时 A3 Dump step 和 evidence pack 上传仍然保留。
- [ ] `ui-contract-test` 与 `api-contract-test` 在 push/PR 上失败即阻塞合并；`canary-test` 失败只告警不阻塞 PR（但会触发人工检查）。
- [ ] 连续 10 次 CI（含 PR 与 schedule）无 flaky：同一条 spec 在没有代码变更的情况下连续 10 次结果一致。

### 4.4 暂停项标准

- [ ] 真实 Provider Smoke、完整录音链路 CI、AI 体验评分、滚动性能基线相关代码保留但明确从 PR 硬门禁移除，并在 `doc/DECISIONS.md` 中登记恢复条件。

---

## 5. 风险与注意事项

### 5.1 上游文件修改

- `.github/workflows/ci.yml` 追踪自上游 `wrong-notebook`。本次修改属于 Nana 自有增量（补 test env prepare、拆 E2E job），commit message 必须标注 `⚠️上游文件修改`，方便未来 sync-upstream 时识别潜在冲突点。
- `package.json`、`playwright.config.ts` 也有上游继承关系，改动尽量以新增 scripts / 最小增量方式完成，不重排原结构。

### 5.2 安全铁律

- **铁律 3（不改上游表结构）**：本轮只新增测试相关 model 以外的文件，不修改 `prisma/schema.prisma` 中任何已有 model。测试用到的临时表/数据全部在现有表上通过 seed 和事务隔离实现。
- **铁律 4（密钥不入 git）**：`test-env-prepare.ts` 只检查 env 存在性，不打印 env 值；CI 中继续通过 `secrets` 或 GitHub Actions env 注入 `VOLCENGINE_API_KEY` 等敏感变量。
- **铁律 1（破坏性操作须确认）**：删除 `e2e/helpers/register-fixture.ts`、`e2e/ci/_diagnose-audio.spec.ts`、`e2e/ci/nana-main-flow.spec.ts` 属于删除文件，执行前必须向用户说明并确认。

### 5.3 治理约束

- **不新增"假设验证代理"**：按评审要求，三代理保持 plan/execute/audit 不变。本轮通过调整任务状态机来强化诊断纪律：失败 → Diagnosing → 根因证据成立 → Plan → Execute → Audit。
- **不扩大范围到产品功能开发**：本轮不碰 TD-006（手动改课本分类）、打印页、DELETE API、ASR 真实录音质量等产品功能，只修复测试框架和 CI 诊断能力。
- **不修改 `doc/agents/*.md` canonical 文件**：除非用户明确要求调整角色定义，否则本轮只改 `doc/active_spec.md` 和 `doc/DECISIONS.md` 中的状态/决策记录，不触发 agent sync。

### 5.4 技术风险

- **Windows 本地 Docker 仍然不可用**：本地无法跑测试容器，所有容器门禁继续 100% 依赖 GitHub Actions。计划执行时必须在执行日志中诚实记录这一点。
- **Next.js dev mode vs standalone 生产模式差异**：Canary 仍可能暴露生产模式独有的问题，但这不在本轮修复范围内；本轮只确保测试失败时能分层定位。
- **素材组 B fixture 缺失**：`nana-sequential-capture.spec.ts` 的跨章节/竞态场景依赖脱敏题图，教研线未提供前只能保持 `test.fixme`。

---

## 6. 技术附录

### 6.1 `test:env:prepare` 脚本设计

**命令**

```bash
npm run test:env:prepare
```

内部实现（`scripts/test-env-prepare.ts` 伪代码）：

```typescript
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

interface PreflightReport {
  ok: boolean;
  dbPath: string;
  schemaOk: boolean;
  seedOk: boolean;
  counts: {
    knowledgeNode: number;
    textbookTopic: number;
    textbookNodeMapping: number;
  };
  envOk: boolean;
  missingEnv: string[];
  durationMs: number;
}

async function main(): Promise<void> {
  const start = Date.now();
  const report: PreflightReport = {
    ok: false,
    dbPath: process.env.DATABASE_URL || '',
    schemaOk: false,
    seedOk: false,
    counts: { knowledgeNode: 0, textbookTopic: 0, textbookNodeMapping: 0 },
    envOk: false,
    missingEnv: [],
    durationMs: 0,
  };

  try {
    // 1. 检查关键 env
    const required = [
      'DATABASE_URL',
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL',
      'VOLCENGINE_API_KEY',
      'VOLCENGINE_BASE_URL',
      'LITE_ENDPOINT_ID',
    ];
    for (const key of required) {
      if (!process.env[key]) report.missingEnv.push(key);
    }
    report.envOk = report.missingEnv.length === 0;

    // 2. 创建 DB 目录
    const dbUrl = process.env.DATABASE_URL!;
    const dbFile = dbUrl.replace(/^file:/, '').replace(/^\.\//, '');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });

    // 3. schema + seed
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    execSync('npx prisma db seed', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_graph.ts', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_textbook_topics.ts', { stdio: 'inherit' });
    report.schemaOk = true;
    report.seedOk = true;

    // 4. 验证数量
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    report.counts.knowledgeNode = await prisma.knowledgeNode.count();
    report.counts.textbookTopic = await prisma.textbookTopic.count();
    report.counts.textbookNodeMapping = await prisma.textbookNodeMapping.count();
    await prisma.$disconnect();

    report.ok = report.envOk && report.seedOk &&
      report.counts.knowledgeNode >= 48 &&
      report.counts.textbookTopic === 16 &&
      report.counts.textbookNodeMapping === 48;
  } catch (e) {
    report.ok = false;
  } finally {
    report.durationMs = Date.now() - start;
    console.log(JSON.stringify(report));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
```

**输入**：环境变量 `DATABASE_URL` 等。
**输出**：stdout 打印一行 JSON；exit 0 表示通过，exit 1 表示失败。
**验证项**：env 完整、schema 建立、seed 执行、KnowledgeNode≥48、TextbookTopic=16、TextbookNodeMapping=48。

### 6.2 假 Provider 固定响应队列设计

```typescript
// e2e/helpers/fake-provider-server.ts（核心伪代码）
interface QueuedResponse {
  content: string; // JSON.stringify(analyzeCase 结果)
  delayMs?: number;
}

const queue: QueuedResponse[] = [];

function handleControl(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url === '/__test/queue' && req.method === 'POST') {
    const body = await readBody(req);
    queue.push(...body.items);
    res.end(JSON.stringify({ queued: body.items.length, total: queue.length }));
    return;
  }
  if (req.url === '/__test/queue' && req.method === 'DELETE') {
    queue.length = 0;
    res.end(JSON.stringify({ cleared: true }));
    return;
  }
}

function handleChatCompletions(req, res) {
  const item = queue.shift();
  if (!item) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'QUEUE_EMPTY', message: '测试未压入 mock 响应' }));
    return;
  }
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-fake',
      choices: [{ message: { role: 'assistant', content: item.content }, finish_reason: 'stop' }],
    }));
  }, item.delayMs ?? 0);
}
```

测试前置代码：

```typescript
await fetch(`${FAKE_PROVIDER_BASE_URL}/__test/queue`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{ content: JSON.stringify(MOCK_CLEAR_PRINTED), delayMs: 50 }],
  }),
});
```

### 6.3 三类测试的职责边界

| 测试类型 | 验证什么 | 是否启动浏览器 | 是否调真实 /process | 是否查 DB |
|---------|---------|--------------|-------------------|----------|
| 领域/集成测试 | 业务不变量、权限、事务 | 否 | 否（直接调 lib/handler） | 是 |
| API 契约测试 | /process 输入输出与落库 | 否 | 是（HTTP 直调） | 是 |
| UI 契约测试 | 页面状态流转、控件反馈 | 是 | 否（page.route 拦截） | 否 |
| 全栈 Canary | 端到端真实链路 | 是 | 是 | 是 |

### 6.4 `tsconfig.e2e.json` 类型检查方案

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "types": ["@playwright/test", "node"]
  },
  "include": ["e2e/**/*.ts", "e2e/**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
```

`package.json` 脚本：

```json
{
  "scripts": {
    "test:e2e:types": "tsc --noEmit -p tsconfig.e2e.json"
  }
}
```

CI 增加 step（在 Install dependencies 后、Playwright tests 前）：

```yaml
- name: Type-check E2E tests
  run: npm run test:e2e:types
```

### 6.5 诊断监听 bug 修复方式

原错误代码（line 206）：

```typescript
page.on('requestfinished', (req) => {
  if (req.url().includes('/process')) {
    console.log(`[e2e-diag] requestfinished ${req.url()} status=${req.response()?.status()}`);
  }
});
```

修复方式 A（await response）：

```typescript
page.on('requestfinished', async (req) => {
  if (req.url().includes('/process')) {
    const res = await req.response();
    console.log(`[e2e-diag] requestfinished ${req.url()} status=${res?.status()}`);
  }
});
```

修复方式 B（改用 response 事件，删除 requestfinished 中的 status 输出）：

```typescript
page.on('response', (res) => {
  if (res.url().includes('/process')) {
    console.log(`[e2e-diag] response ${res.url()} status=${res.status()}`);
  }
});
```

推荐方式 B，因为 `response` 事件的 `res` 已经是 `Response` 对象，无需 await。

### 6.6 CI workflow 中替换 line 66/141 重复命令

原 `integration-test` job（line 66-71）：

```yaml
- name: Setup test database
  run: |
    mkdir -p data/test
    npx prisma db push
    npx tsx prisma/seed_graph.ts
    npx tsx prisma/seed_textbook_topics.ts
```

改为：

```yaml
- name: Prepare test environment
  run: npm run test:env:prepare
```

原 `e2e-test` job（line 141-151）：

```yaml
- name: Setup Database
  run: |
    npx prisma db push
    npx prisma db seed
    npx tsx prisma/seed_graph.ts
    npx tsx prisma/seed_textbook_topics.ts
```

改为：

```yaml
- name: Prepare test environment
  run: npm run test:env:prepare
```

同时确保 `DATABASE_URL` 在各自 job 的 env 段正确设置。

### 6.7 三代理状态机调整

本轮不新增"假设验证代理"，只把任务状态调整为：

```
失败（Failure）
   ↓
Diagnosing（诊断中）
   ↓ 必须产出：
   · 一句话可证伪的根因假设
   · 一个能区分候选原因的实验
   · 原代码失败 / 修复后通过的回归检查
   ↓
证据成立（Evidence Confirmed）
   ↓
Plan（进入 plan-agent）
   ↓
Execute（执行代理按确认计划施工）
   ↓
Audit（审计代理检查证据链与回归护栏，不只检查是否照计划施工）
```

进入 Plan 前必须具备上述三件证据；否则退回 Diagnosing。探索阶段计划被推翻是正常的，但**在拿到证据前不输出第二份完整修复计划**。

---

> 本计划待用户确认后方可进入执行阶段。
