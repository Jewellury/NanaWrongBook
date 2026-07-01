# 第一版错题采集+识别+知识地图挂载 · Stage 2（挂载骨架）执行日志

> 关联计划: doc/plan/capture-map-v1-plan.md（§4 Stage 2 S2-1~S2-5、§7.1、§12.5、§12.6）
> 开始时间: 2026-07-01 20:30
> 执行代理: execute-agent
> 范围: **仅 Stage 2**（Case↔知识点挂载骨架 + 手动分类；不接真 AI）
> 用户确认: "确认可以执行这个 migration" + 两条执行要求（tags API 必须过归属过滤 / source 代码层限制并写测试）

---

## 执行记录

### S2-1 执行 migration（用户已确认）
- 做了什么:
  - migration SQL 已在前置任务由 `--create-only` 生成（`prisma/migrations/20260701123326_add_case_knowledge_tag/migration.sql`），内容为纯 `CREATE TABLE CaseKnowledgeTag` + 3 个索引（caseId / nodeId / [caseId,nodeId,source] 唯一），无数据迁移、无删除。
  - 用 `npx prisma migrate deploy`（非交互、不会 reset，铁律 1 安全路径）应用 pending migration。
  - `npx prisma generate` 重新生成 client（CaseKnowledgeTag model 进入类型）。
  - `npx prisma migrate status` → `Database schema is up to date!`（无 pending）。
  - **test.db 单独 apply**：测试用 test.db 与 dev.db 是不同文件，对 test.db 也跑了 `DATABASE_URL=file:./data/test/test.db npx prisma migrate deploy`，使 CaseKnowledgeTag 表在测试库内可用（否则集成测试 prisma 写入会 500 "no such table"）。
- 涉及文件: `prisma/migrations/20260701123326_add_case_knowledge_tag/migration.sql`（执行，未改）、`prisma/schema.prisma`（前置任务已加 model + Case 反向关系，本次仅随 generate）
- 结果: ✅ 完成

### S2-2 挂载/分类 lib 骨架（§12.6）
- 做了什么:
  - 新增 `src/lib/nana/case-classify.ts`。
  - `classifyCase(caseId)`：Stage 2 诚实返回 `{ tags: [], status: "pending", note: "识别稍后接入" }`，不调 VLM（Stage 3 才接）。
  - `tagCaseManually(caseId, nodeId, userId, note?)`：恒用 `source="manual"`、`confidence=1.0`；签名**不暴露 source 入参**（防伪造）；必先过 `assertCaseOwnership`（findFirst `{id, studentId}`，不满足抛 `CaseOwnershipError`）；唯一约束冲突（Prisma P2002）转 `CaseTagExistsError`。
  - `listTagsForCase(caseId, userId)`：先过归属校验，再查 tag（**绝不裸查**，评审需求 #1）。
  - `ALLOWED_SOURCES` 白名单 + `assertValidSource`（评审需求 #2：代码层限制）。
  - 两个错误类型 `CaseOwnershipError`/`CaseTagExistsError`，供 API 层映射 404/409。
- 设计决策（偏离记录 #1）：`classifyCase` **不写 source="pending" 占位 tag**。理由见下方偏离记录。
- 涉及文件: `src/lib/nana/case-classify.ts`（新增）
- 结果: ✅ 完成

### S2-3 挂载/读取 tags API（§12.5 + 评审需求 #1/#2）
- 做了什么:
  - 新增 `src/app/api/nana/cases/[id]/tags/route.ts`，GET + POST。
  - **GET** `/api/nana/cases/:id/tags`：鉴权（401）→ 调 `listTagsForCase`（lib 内做归属校验，归属不满足→404，沿用 G1 不返回 403 防 id 枚举）→ 返回 `{ tags }`。
  - **POST** `/api/nana/cases/:id/tags`：鉴权（401）→ 入参校验（nodeId 非空字符串→400）→ `prisma.knowledgeNode.findUnique` 校验 nodeId 真实存在（不存在→400，防脏挂；nodeId 松挂接无 FK 故显式查）→ 调 `tagCaseManually`（归属校验 + 写入，source 恒 manual）→ 201；冲突→409；**body 里的 source 字段被完全忽略**（评审需求 #2）。
  - `src/lib/nana/nana-api-client.ts` 新增 `listCaseTags(caseId)`、`tagCaseManually(caseId, nodeId, note?)` + `CaseKnowledgeTagResponse` 类型。
- 涉及文件: `src/app/api/nana/cases/[id]/tags/route.ts`（新增）、`src/lib/nana/nana-api-client.ts`
- 结果: ✅ 完成

### S2-4 知识地图显示标签 + 人工挂载
- 做了什么:
  - `src/components/nana/knowledge-map/recent-cases-list.tsx` 改造：列表项改为可点击（button），选中后在其下方展开 `CaseTagPanel`。
  - `CaseTagPanel`：懒加载该 case 的标签（`listCaseTags`，带归属过滤）；已挂标签显示为节点名 chip（manual 标签附"手动"小字）；未挂显示"未分类"chip；提供 `<select>`（48 节点）+ "挂上"按钮调 `tagCaseManually`，成功刷新标签，409 显示"这个已经挂过了"，其它失败显示"没挂上，稍后再试"（不假装成功，铁律 6）。
  - **数据来源决策（偏离记录 #2）**：48 节点由知识地图页面（已加载 `/api/diagnosis/map`）作为 `nodes` props 传入 RecentCasesList，不另起"列出全部节点"端点；标签走点击懒加载而非列表端点扩展返回 tags[]。
  - `src/app/nana/knowledge-map/page.tsx`：从 `mapData.nodes` 派生 `{id, name}[]` 传给 `<RecentCasesList nodes={...} />`。
- 措辞合规（OPS §4）：人工标签显示节点名 + "手动"；未分类显示"未分类"；按钮文案"挂上"；**无 诊断/已诊断/薄弱/得分/掌握/失败**；Stage 2 无真 AI，不说"AI 已识别/已分类"。
- 涉及文件: `src/components/nana/knowledge-map/recent-cases-list.tsx`、`src/app/nana/knowledge-map/page.tsx`
- 结果: ✅ 完成

### S2-5 测试（评审需求 #2 source 白名单 + #1 归属）
- 做了什么:
  - 新增 `src/__tests__/unit/nana/case-classify.test.ts`（12 tests，mock `@/lib/prisma` 验 lib 逻辑）：
    - `classifyCase` 返回 pending 契约 + 不触发 prisma（不写占位 tag）；
    - `assertValidSource`/`ALLOWED_SOURCES` 白名单（manual/vlm/asr/rule/pending）+ 拒绝非法/空/大小写错误的 source；
    - `tagCaseManually` 归属通过→以 source=manual/confidence=1.0 写入；非 owner→抛 `CaseOwnershipError` 且不写；恒 manual（签名无 source 入参）；P2002→`CaseTagExistsError`；note 可选传入；
    - `listTagsForCase` 归属通过/失败。
  - 扩 `src/__tests__/integration/nana/case-api.test.ts`（14→27 tests，+13）：
    - GET tags：owner 200（空标签）、跨用户 404、未授权 401、回归反映已挂 manual 标签；
    - POST tags：owner 201（source=manual/confidence=1.0）、缺失 nodeId 400、nodeId 空串 400、不存在 nodeId 400、重复挂同节点 409、**body 传 source="vlm" 落库仍 manual（评审需求 #2）**、跨用户 404、未授权 401。
  - 集成测试用真实 PrismaClient 连 test.db；`cleanupTestData` 显式加 `caseKnowledgeTag.deleteMany`（虽有 cascade，显式清符合铁律 6 逐表清理习惯）；`beforeAll` 取一个真实 KnowledgeNode id 供 tags 测试。
  - 用 `vi.hoisted` 解决 `case-classify.test.ts` 的 vi.mock 工厂 hoisting 引用问题（遇错已修，见"遇到的问题"）。
- 涉及文件: `src/__tests__/unit/nana/case-classify.test.ts`（新增）、`src/__tests__/integration/nana/case-api.test.ts`
- 结果: ✅ 完成（nana 套件 96 tests passed，无回归）

---

## 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | §12.6 / DP1：`classifyCase` 可选写 source="pending" 占位 tag（"或不写，见 DP1 细节"） | **不写** pending 占位 tag，pending 仅作为返回状态 | pending 表示"还不知道挂哪个节点"，没有 nodeId 可挂；塞无意义占位行不如用「无 tag」表达"未分类"（列表 API 已用 tagStatus="untagged"）。表更干净，Stage 3 VLM 有候选时才写真 source="vlm" 标签。计划原文留了"或不写"的选项，故属微调 | 否 |
| 2 | S2-4 未指定标签/节点数据获取方式（开放选择） | 48 节点由知识地图页面 props 传入；标签点击懒加载（不扩展列表端点返回 tags[]） | 页面已加载 `/api/diagnosis/map`（含 48 节点），复用即可，避免新增"列出全部节点"端点；标签是详情级数据，放列表会爆体积 + N+1，点击懒加载更合理 | 否 |
| 3 | §12.6 `ClassifyResult` 接口为 `{ tags, status }` | 额外加 `note?: string` 字段 | 计划 S2-2 文字明确要返回 `note: "识别稍后接入"`；接口补 note 字段承载该文案，与计划意图一致 | 否 |
| 4 | 集成测试覆盖跨用户"403/404" | 一律用 404（沿用 G1 已批准模式：不返回 403 防 case id 枚举） | 计划 §8.3 Stage 2 写"403/404"含糊，但 G1（Phase 1.5 已评审通过）已裁定跨用户一律 404。与既有 `cases/[id]` route 一致 | 否 |

---

## 上游文件修改

> **无。** 所有改动落在 nana 自有目录（`src/app/api/nana/cases/`、`src/app/nana/`、`src/components/nana/`、`src/lib/nana/`、`src/__tests__/`）+ nana 自有 model（`Case` 反向关系字段、新增 `CaseKnowledgeTag` model）。未触碰任何 wrong-notebook 上游 model/文件（User / ErrorItem / KnowledgeTag / KnowledgeNode 字段均零改动；CaseKnowledgeTag.nodeId 为松挂接无 FK，与 MistakeNode/ErrorRecord 同款，守铁律 3）。

---

## 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| `npx`（无 .cmd）被 git-bash 路由到 WSL 报 `execvpe(/bin/bash) failed` | 改用 `npx.cmd`（Windows 约定，与 AGENTS.md 的 `npm.cmd` 一致） |
| 集成测试 tags 相关全 500（`no such table: CaseKnowledgeTag`） | 根因：migration 只 apply 到 dev 库，**test.db 是独立文件未含新表**。对 test.db 单独跑 `DATABASE_URL=file:./data/test/test.db npx prisma migrate deploy` 后通过 |
| `case-classify.test.ts` vi.mock 工厂引用顶层 `const` 报 `Cannot access 'mockCaseFindFirst' before initialization` | vi.mock 工厂被 hoist 到顶层，早于 const 初始化。改用 `vi.hoisted(() => ({...}))` 声明 mock 函数，工厂内引用 hoisted 变量 |
| `npm.cmd run build > NUL` 在 git-bash 里创建了字面量 `NUL` 文件（Windows 设备名在 bash 下变普通文件） | `rm -f NUL` 清理（已清）；后续 build 验证改用 `> /dev/null` 思路或直接看 stdout |

---

## 环境发现（如实记录，铁律 6）

| 现象 | 说明 |
|------|------|
| `.env` 的 `DATABASE_URL="file:/app/data/dev.db"` 是 Docker 容器内路径 | 本地非 Docker 运行 `prisma migrate deploy` 时，该路径解析到 **`E:\app\data\dev.db`**（盘符相对，项目仓库外的游离 DB），而非项目 `data/dev.db`。本次 S2-1 第一次 migrate deploy 即落到该游离 DB（已 apply CaseKnowledgeTag）。**项目真实 dev 库 `E:\nana\data\dev.db` 未被触碰**（mtime 6月29日 08:50，今日未变）。这是项目既有环境配置（本地 dev 走 Docker），非本次引入，未改动该配置（铁律 5）。生产/CI 在容器内 `/app/data/dev.db` 路径正确，无影响。 |

---

## 完成状态

- [x] 所有任务完成（S2-1 ~ S2-5）
- [x] migration 已执行：`20260701123326_add_case_knowledge_tag`，`prisma migrate status` = up to date；test.db 同步 apply
- [x] 代码已提交（见下方 commit；尚未 push）
- [x] 本地 `npm.cmd run build` 通过（exit 0）
- [x] 本地相关窄范围测试已运行：
  - `DATABASE_URL=file:./data/test/test.db npx vitest run src/__tests__/unit/nana src/__tests__/integration/nana` → **96 tests passed**（8 files）
  - Stage 1 基线 71 → 96（+12 case-classify 单测 +13 tags 集成测试），无回归
  - 测试在 test.db（guard-db 白名单 `file:./data/test/test.db`）运行，`./data/dev.db` 未被触碰
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用时：本地运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` 退出码 0
  - **本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行**
- [ ] GitHub Actions 测试容器通过后，才允许部署（待 dev→main 合并触发 CI）
- [x] 确认测试在安全路径运行：本地用 test.db，`./data/dev.db` 与项目真实数据未被触碰
- [x] 可进入审计阶段

---

## 评审需求达成确认

- **需求 #1（归属过滤）**：tags API GET/POST 全部经 `Case.studentId` 归属校验（lib `assertCaseOwnership` + API 层映射 404）；**绝不在无归属上下文裸查 CaseKnowledgeTag**。集成测试覆盖：owner 200/201、跨用户 404、未授权 401。
- **需求 #2（source 白名单 + 测试）**：`ALLOWED_SOURCES` + `assertValidSource` 在 lib 代码层限制；POST 端点 **不接受 body 的 source**（服务端恒 "manual"，VLM/ASR 由 Stage 3 服务端写入）。单测覆盖白名单 + 非法拒绝；集成测试覆盖 "body 传 source=vlm 落库仍 manual"。

---

## 措辞合规自检（OPS §4）

新增/修改的用户可见字符串扫描（recent-cases-list / knowledge-map page）：
- **禁用词**：诊断 / 已诊断 / 薄弱 / 得分 / 掌握 / 未掌握 / 失败 → 用户可见文案中**均无出现**。
- Stage 2 诚实措辞：未挂标签显示"未分类"；人工标签显示节点名 + "手动"；按钮"挂上"；提示"已挂上 / 这个已经挂过了 / 没挂上，稍后再试"；`classifyCase` 返回 note 仅用于内部状态，不展示"AI 已识别"。
- 知识地图沿用既有已批准措辞（"已点亮"/"下一个"/"未探索"/"光点"）。

---

## schema 结构确认

- 仅新增 1 张表 `CaseKnowledgeTag`（nana 自有）+ `Case` 反向关系字段（nana 自有 model）。
- 未触碰任何 wrong-notebook 上游 model（铁律 3）。`nodeId` 松挂接无 FK，与 `MistakeNode`/`ErrorRecord` 同款。
- migration 为纯 `CREATE TABLE` + 索引，无数据迁移、无删除，可安全回退（drop 新表）。

---

## 下一步

- 本 Stage 2 = "挂载骨架版"，可进入 audit-agent。
- 部署仍按：dev→main 合并 → GitHub Actions 测试容器门禁通过 → 备份生产 SQLite → 上线。**本次不部署。**
- Stage 3（真实 ASR + VLM）是 v1 闭环必需项，依赖 Stage 2；启动前需确认生产环境 `VOLCENGINE_API_KEY` 等密钥就绪。
