# 第一版错题采集+识别+知识地图挂载 · Stage 2（挂载骨架）· 审计报告

> 关联计划: doc/plan/capture-map-v1-plan.md（§4 Stage 2 S2-1~S2-5、§7.1、§12.5、§12.6、§8.3）
> 执行日志: doc/executionlog/capture-map-v1-stage2-log.md
> 审计日期: 2026-07-01
> 审计范围: **仅 Stage 2**（commits `9d3aa8e` / `324df02` / `36e928d`）；Stage 1 已审通过，Stage 3/4 未执行，不在范围内
> 基线 commit: `15610b0`（Stage 1 审计通过的 HEAD）

---

## 审计结论（大白话）

**总体判定：✅ 通过**

这一轮做的是"挂载骨架"——让一道错题能挂到知识点上，但还不接真 AI。代码质量不错，安全关把得严，跟计划基本一致。

具体说：
- **最关键的归属安全做到了**：不管读还是写标签，都先查"这道题是不是你本人的"（通过 `Case.studentId`），不是你的就返回 404。绝不会让你看到或改动别人的标签。这一点测试也覆盖了（跨用户 404、未登录 401 都有）。
- **来源防伪造做到了**：标签的来源（manual/vlm/asr…）服务端写死成 "manual"，前端 body 里就算塞 `source:"vlm"` 也会被无视，落库永远是 manual。有专门测试验证。
- **数据库改动干净**：只新增了一张 `CaseKnowledgeTag` 表 + Case 上加了个反向关系字段。**没动任何上游 wrong-notebook 的表**（User/ErrorItem/KnowledgeNode 等全没碰），符合"不改上游表结构"铁律。migration 内容是用户已确认过的纯 CREATE TABLE。
- **构建通过、96 个测试全绿**（我自己重跑了一遍，数字对得上）。
- **措辞合规**：界面文字没有出现"诊断/薄弱/掌握/失败"这些禁用词。Stage 2 没接真 AI，界面也老老实实说"未分类/手动挂上"，没假装"AI 已识别"。
- **4 条偏离记录我都复核了，全是真微调**，不影响验收。

有 2 个很小的观察项（P2，不挡本轮通过），见问题清单。另外 `.env` 的 DATABASE_URL 路径问题按你的指示只作登记、不当 blocker。

**结论：Stage 2 可以进入 CI 门禁（dev→main 合并触发 GitHub Actions 测试容器），CI 通过后即可部署。** Stage 3（真实 ASR+VLM）才是 v1 闭环必需项，依赖本 Stage。

---

## 检查清单

### ✅ Check 1：migration 只新增 CaseKnowledgeTag，未触碰上游 model

- [x] migration.sql 内容 = 纯 `CREATE TABLE CaseKnowledgeTag` + 3 个索引（caseId / nodeId / [caseId,nodeId,source] 唯一）。**无 DROP / DELETE / ALTER 任何其它表**。(`prisma/migrations/20260701123326_add_case_knowledge_tag/migration.sql:1-20`)
- [x] `git diff 15610b0..HEAD -- prisma/schema.prisma` 只有两处改动：
  - `Case` model 加反向关系 `knowledgeTags CaseKnowledgeTag[]`（Case 是 nana 自有 model）
  - 文件末尾新增 `CaseKnowledgeTag` model
  - **User / ErrorItem / KnowledgeTag / KnowledgeNode / Mistake / MistakeNode / Artifact 等上游/既有 model 零字段改动**（grep 确认这些 model 定义行未被 diff 触及）。
- [x] `nodeId` 为松挂接 `String`（无 FK 到 KnowledgeNode），与既有 `MistakeNode.nodeId` / `ErrorRecord` 同款；migration 里 FK 只建在 `caseId → Case(id) ON DELETE CASCADE`。守铁律 3。

**判定：✅ 通过**

### ✅ Check 2：tags API 所有读写都过 Case.studentId 归属，跨用户 404

- [x] GET `/api/nana/cases/:id/tags` → 调 `listTagsForCase(id, session.user.id)`；lib 内 `assertCaseOwnership` 先 `findFirst({where:{id, studentId:userId}})`，不命中抛 `CaseOwnershipError` → API 映射 **404**。(`src/lib/nana/case-classify.ts:98-106`、`162-167`；`src/app/api/nana/cases/[id]/tags/route.ts:44-55`)
- [x] POST 同理 → `tagCaseManually(id, nodeId, session.user.id, note)` 先过 `assertCaseOwnership`，不命中 → **404**。(`case-classify.ts:119-155`；`route.ts:96-101`)
- [x] **无任何裸查 CaseKnowledgeTag 的路径**：唯一两处 `caseKnowledgeTag.findMany` / `.create` 都在 `assertCaseOwnership` 之后。POST 里的 `knowledgeNode.findUnique` 是查知识点主表（公开的节点 id 存在性校验），不是查 tag，不构成越权。
- [x] 跨用户一律 404（非 403），沿用 G1 已批准模式，防 case id 枚举。

**判定：✅ 通过**

### ✅ Check 3：source 只能服务端 "manual"，body 的 source 被忽略

- [x] POST handler 解构 `const { nodeId, note } = body ?? {}` —— **不读取 `source`**。(`route.ts:72-73`)
- [x] `tagCaseManually` 签名 `(caseId, nodeId, userId, note?)` —— **无 source 入参**；函数体 `const source: TagSource = "manual"` 硬编码。(`case-classify.ts:119-127`)
- [x] `ALLOWED_SOURCES` 白名单 + `assertValidSource` 存在并被调用。(`case-classify.ts:24-41`)

**判定：✅ 通过**

### ✅ Check 4：nodeId 校验 / 重复 409 / 未授权 401 / 跨用户 404 均有测试

集成测试 `src/__tests__/integration/nana/case-api.test.ts`（27 tests，Stage 2 新增 13 个 tags 用例）：
- [x] GET tags：owner 200 空（:355）、跨用户 404（:365）、未授权 401（:376）、反映已挂 manual 标签（:483）
- [x] POST tags：owner 201 且 source=manual/confidence=1.0（:389）、缺失 nodeId 400（:402）、空串 nodeId 400（:410）、不存在 nodeId 400（:418）、重复挂同节点 409（:428）、**body 传 source="vlm" 落库仍 manual**（:439，评审需求 #2）、跨用户 404（:459）、未授权 401（:470）

单元测试 `src/__tests__/unit/nana/case-classify.test.ts`（12 tests）：
- [x] `assertValidSource` 拒绝非法 `'evil'` / 空 `''` / 大小写错 `'MANUAL'`（:88-92）
- [x] tagCaseManually 归属通过/失败、恒 manual、P2002→CaseTagExistsError、note 可选

所有用例都显式 `expect(res.status).toBe(...)` 断言状态码，不是"不抛错就算过"。**计数核对：单测 12 + 集成 27 - 14(Stage1基线) = +25，与日志 +12/+13 一致；总 96 与我重跑结果一致。**

**判定：✅ 通过**

### ✅ Check 5：知识地图列表 + 标签面板不泄露 base64、不跨账号

- [x] 横向列表数据来自 `listMyCases()`（S1-3，服务端 `where:{studentId: session.user.id}` 归属过滤），只返回 `hasImage` 标志，**不返回 base64**（`cases/route.ts:48-73` 只 `select: { type: true }`）。UI 用 `ImageIcon` 占位，不渲染图。(`recent-cases-list.tsx:146-150`)
- [x] 标签面板 `CaseTagPanel` 调 `listCaseTags(caseId)` —— 服务端过 `assertCaseOwnership`，**跨账号拿不到别人的 tag**。
- [x] 面板渲染：节点名 chip + "手动"小字，无 base64、无图。
- [x] 跨账号路径不可能：列表已按 studentId 过滤，面板再按 caseId+userId 校验，双重把关。

**判定：✅ 通过**

### ✅ Check 6：4 条偏离记录复核——全部真微调

| # | 偏离 | 复核结论 |
|---|------|----------|
| 1 | `classifyCase` 不写 source="pending" 占位 tag | ✅ **真微调**。计划 §12.6 / DP1 原文留了"或不写"选项。pending 语义="不知道挂哪个节点"，没有 nodeId 可挂；用「无 tag」表达未分类比塞假行干净。不影验收。 |
| 2 | 48 节点由页面 props 传入；标签点击懒加载 | ✅ **真微调**。S2-4 计划未指定数据获取方式（开放）。复用已加载的 `/api/diagnosis/map` 节点，避免新增端点；标签懒加载避免列表 N+1 爆体积。合理工程取舍。 |
| 3 | `ClassifyResult` 接口加 `note?` 字段 | ✅ **真微调**（实为补齐）。计划 S2-2 文字明确要返回 `note:"识别稍后接入"`，接口补字段承载该文案，与计划意图一致。 |
| 4 | 跨用户返回 404 而非 403 | ✅ **真微调**。G1（Phase 1.5 已评审通过）已裁定跨用户一律 404 防 id 枚举；既有 `cases/[id]` route 同款。计划 §8.3"403/404"含糊，以更早的 G1 裁定为准。 |

**判定：✅ 通过（4/4 均为真微调，无"大偏离伪装"）**

### ✅ Check 7：build + nana vitest 96 passed 可复现

- [x] `npm.cmd run build` → **exit 0**（Compiled successfully in 17.8s，56 pages generated）。
- [x] `DATABASE_URL=file:./data/test/test.db npx vitest run src/__tests__/unit/nana src/__tests__/integration/nana` → **Test Files 8 passed / Tests 96 passed**，与执行日志声明完全一致。
- [x] test.db 路径在 guard-db 白名单内（`src/__tests__/setup/guard-db.ts:15-18`：`file:./data/test/test.db` ✅、`file:/app/data/test.db` ✅）；dev.db 不在白名单。
- [x] `data/dev.db` mtime = **6月29日 08:50**（今日 7月1日未变），证实本轮未触碰生产 dev 库。

**判定：✅ 通过**

---

### 计划一致性

- [x] S2-1 model + migration 完成（用户确认路径走 `--create-only` → 过目 → `migrate deploy`，铁律 1 合规）
- [x] S2-2 `case-classify.ts` 骨架（classifyCase pending + tagCaseManually + listTagsForCase）
- [x] S2-3 tags API（GET/POST，归属校验 + source 恒 manual + nodeId 存在性校验）
- [x] S2-4 知识地图标签 chip + 人工挂载面板
- [x] S2-5 单测 + 集成测试（12 + 13 = +25）
- [x] 未偏离计划（4 条偏离均为已记录且属真微调）

### 代码质量

- [x] 无明显 bug：错误类型（CaseOwnershipError/CaseTagExistsError）与 API 状态码映射清晰
- [x] 错误处理到位：400/401/404/409/500 各有路径，铁律 6 显式失败（重复→409、脏挂→400、非 owner→404，均有可读 message）
- [x] 代码风格与既有 nana 目录一致（createLogger、findFirst 归属、NextResponse.json 模式同 G1/G2）

### 安全性

- [x] 无密钥泄露（grep `API_KEY|SECRET|PASSWORD|TOKEN|BEGIN PRIVATE` 在改动文件中无命中）
- [x] 无 SQL 注入风险（全部走 prisma 参数化查询，无裸 SQL）
- [x] 用户输入有校验（nodeId 非空 + 存在性；source 服务端硬编码不接受 body）
- [x] 本轮未向生产库 `./data/dev.db` 写入测试数据（mtime 证实 6月29日未变）

### 上游兼容性

- [x] 未修改上游已有数据库表结构（schema diff 仅 Case 反向字段 + 新 model）
- [x] 无上游文件修改（所有改动落在 nana 自有目录：`src/app/api/nana/cases/`、`src/app/nana/`、`src/components/nana/`、`src/lib/nana/`、`src/__tests__/`）
- [x] 新增文件在独立路径

### Agent 同步一致性

- [x] `node scripts/check-agent-sync.js` → **OK: 3/3 agents in sync**（exit 0）

### 措辞合规（OPS §4）

- [x] 改动文件的用户可见 UI 字符串扫描：禁用词（诊断/已诊断/薄弱/得分/掌握/未掌握/失败）**仅出现在代码注释和 server-side logger/Error 文案中**，不渲染给用户。
- [x] 用户可见文案："未分类"、"挂上"、"已挂上"、"这个已经挂过了"、"没挂上，稍后再试"、"加载中…"、"没拉到，下拉刷新试试"、"先选一个知识点" —— 均合规。
- [x] Stage 2 无真 AI，界面未出现"AI 已识别/已分类"；人工标签只显示节点名 + "手动"小字。

### 测试

- [x] 本地 `npm.cmd run build` 通过
- [x] 本地 nana 窄范围测试 96 passed（unit + integration）
- [ ] 本地 Docker 测试容器：**本地 Docker Desktop 不可用，未跑**（执行日志已记录，门禁交由 GitHub Actions）—— 符合 AGENTS.md CI 镜像路线
- [x] 测试使用 test.db（guard-db 白名单生效），未触碰 `./data/dev.db`
- [x] 无"退回生产容器跑测试"记录
- [x] DB 护栏断言 `src/__tests__/setup/guard-db.ts` 存在且生效
- [ ] GitHub Actions 测试容器门禁：待 dev→main 合并触发（本轮不部署，符合计划）

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | 横向列表项的 chip **恒显示"未分类"**（`recent-cases-list.tsx:155-157` 硬编码），即使该 case 已被人工挂过标签。用户挂完后在列表里仍看到"未分类"，只有点开面板才看到真标签。属 S2-4 偏离 #2（懒加载）的副作用——列表端点未返回 tagCount/tagStatus 真值（`cases/route.ts:68-72` 恒 0/'untagged'）。 | `recent-cases-list.tsx:155`、`cases/route.ts:68` | 未来打磨：列表端点 join 一下 `CaseKnowledgeTag` 计数，让 chip 在 tagCount>0 时显示"已挂 N 个"或第一个节点名。**不挡本轮**（计划未强制列表级标签反映，偏离 #2 已批）。 |
| P2 | POST tags 的 `note` 字段未做类型校验（只校验了 nodeId）。若客户端传 `note: {evil:1}` 等 non-string，prisma.create 会抛类型错误 → 落到 generic catch → 500。功能上"显式失败"不静默，但 500 比 400 友好度低。 | `src/app/api/nana/cases/[id]/tags/route.ts:73` | 可选：加 `if (note !== undefined && typeof note !== "string") return 400`。低优先。 |
| P2（观察，非 blocker） | `.env` 的 `DATABASE_URL="file:/app/data/dev.db"` 是 Docker 容器内路径，本地非 Docker 运行 prisma 时解析到仓库外游离 DB `E:\app\data\dev.db`，而非项目 `data/dev.db`。 | `.env` | 按用户指示：**登记为后续配置治理项，不在本轮处理**。已核实项目真实 `data/dev.db`（mtime 6月29日）本轮未被触碰；生产/CI 在容器内路径正确，无影响。 |

---

## 用户验证指南（Stage 2 部署后手动验证）

> 部署前提：dev→main 合并 → GitHub Actions 测试容器门禁通过 → 备份生产 SQLite → 上线。

1. 打开 `http://localhost:3001`（或生产域名）登录测试账号
2. 进 `/nana/capture` 拍一道题（或用已有 case），保存
3. 进 `/nana/knowledge-map`：
   - 上方"最近拍过的题"横向列表应能看到刚拍的题（chip 显示"未分类"）
   - **点击该题卡片** → 下方展开标签面板
4. 标签面板：
   - 未挂时显示"未分类"chip + 下拉选知识点 + "挂上"按钮
   - 从下拉选一个知识点（如"函数概念"）→ 点"挂上"
   - **期望**：面板出现绿色 chip 显示节点名 + "手动"小字；下方提示"已挂上"
5. 重复挂同一个知识点 → **期望**提示"这个已经挂过了"（409）
6. **跨账号隔离验证**：换另一个测试账号登录，访问同一知识地图 → 列表只看到自己的题；即便知道对方 caseId，直接 `GET /api/nana/cases/<对方caseId>/tags` 应返回 **404**（可用浏览器 devtools Network 或 curl 验）
7. **source 防伪造验证**（可选，技术验证）：用 curl 对自己的 case POST `{nodeId, source:"vlm"}` → 返回 201，但响应 `source` 字段为 `"manual"`（body 的 source 被无视）
8. 全页扫视：不应出现"诊断/已诊断/薄弱/得分/掌握/失败/AI 已识别"等字样

---

## 附录：审计执行命令记录

| 命令 | 结果 |
|------|------|
| `node scripts/check-agent-sync.js` | OK: 3/3 agents in sync |
| `git diff 15610b0..HEAD --stat` | 10 files, +1093/-34 |
| `git diff 15610b0..HEAD --name-only` | 全部落在 nana 自有目录 + schema/migration/log |
| `git diff 15610b0..HEAD -- prisma/schema.prisma` | 仅 Case 反向字段 + 新 CaseKnowledgeTag model |
| `git diff 15610b0..HEAD -- prisma/migrations/` | 纯 CREATE TABLE + 3 索引 |
| grep 禁用词（改动文件） | 仅命中代码注释 / logger / Error 文案，无用户可见字符串违规 |
| grep 密钥（改动文件） | 无命中 |
| `npm.cmd run build` | exit 0，56 pages |
| `DATABASE_URL=file:./data/test/test.db npx vitest run ...` | 8 files / 96 tests passed |
| `ls data/dev.db` | mtime 6月29日 08:50（本轮未触碰） |
