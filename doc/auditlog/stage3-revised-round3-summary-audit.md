# Stage 3 v3-revised Round 3 — 题目汇总 API + 列表扩展 + 三 tab 外壳 · 审计报告

> 关联计划: doc/plan/stage3-revised-round3-plan.md
> 执行日志: ⚠️ **缺失**（execute-agent 未产出 `doc/executionlog/stage3-revised-round3-*-log.md`）
> 审计 commit: `ebd056a` — feat stage3-r3: 题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
> 审计日期: 2026-07-06

---

## 审计结论（大白话）

**总体判定：✅ 通过（附 5 个 P2 建议，不阻塞）**

这轮代码做了三件事：新建了一个按课本章节分组的题目汇总 API、给已有列表 API 加了 AI 摘要等轻量字段、把知识地图页改成了三 tab 外壳。

**好的方面**：
- 跨用户隔离正确——只查当前登录用户的 case，不泄露别人的
- 不返回 base64 原图——两个 API 都只 select artifact 的 `type` 字段，不碰 `content`
- 三态映射正确——`success`→已完成、`failed`/`timeout`→需重试、无结果→待处理
- 未分类分组可见——没有课本标签的题归入 `topic=null` 组，显示"未分类/暂未覆盖"
- 措辞合规——"待处理""已完成""需重试"全部符合运营手册要求
- 14 个集成测试全绿，已有的 18 个 process-api 测试无回归
- `npm run build` 通过

**需要注意的**：
1. 计划明确要求切换 tab 时用 `hidden` 保留组件状态（不销毁），实现用了条件渲染（切换 tab 会卸载重装组件，图谱的缩放/平移状态会丢失）。不影响功能，但和计划不一致。
2. `viewMode` 变量定义了但没用到，是死代码。
3. execute-agent 没写执行日志。
4. summary tab 数据加载失败时静默处理，用户看到空白无提示。
5. **架构隐患**：summary/list API 课本分组读的是 `CaseTextbookTopicTag` 表，而 process API 的编辑保护机制保护的是 `CaseAiResult.textbookTopicId` 字段——两者不是同一张表。当前没有手动改课本分类的 API，所以不会触发 bug；但未来实现手动编辑课本分类时，必须写 `CaseTextbookTopicTag` 表才能让 summary 反映。

这些都不影响验收标准，代码可以放心用。

---

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务（summary API / 列表扩展 / 三 tab / API 客户端 / 14 测试）
- [x] 未偏离计划（或偏离已记录且合理）
  - ⚠️ **偏离 1（P2）**：计划 §4.4 要求"切换 tab 时不销毁已加载数据（用 `hidden` 而非条件渲染）"，实现用了 `{activeTab === "xxx" && ...}` 条件渲染。图谱 canvas 切走再切回会重新挂载，丢失缩放/平移状态。数据本身不丢（存在页面级 state），不影响功能。
  - ✅ **偏离 2（合理改进）**：计划 §3.3 建议先查 `textbookTopicId` 再单独查 `TextbookTopic` 取 chapter，实现改用 Prisma 嵌套 include 一步到位，避免了 N+1 查询，更好。

### 代码质量
- [x] 无明显 bug
- [x] 错误处理到位（try-catch + logger.error + internalError 返回）
- [x] 代码风格一致（沿用项目既有 fetch/Prisma/session 模式）
- ⚠️ P2：`page.tsx` line 67 `const viewMode = activeTab === "list" ? "list" : "graph";` 是死代码，定义后未在 JSX 中引用
- ⚠️ P2：summary tab 数据加载失败时 `setSummaryData(null)` 静默处理，用户看到空白无任何错误提示

### 安全性
- [x] 无密钥泄露
- [x] 无 SQL 注入风险（全部 Prisma 参数化查询）
- [x] 用户输入有校验（session.user.id 鉴权 + 401 拦截）
- [x] 本轮未向生产库 `./data/dev.db` 写入任何测试数据（测试使用 `file:./data/test/test.db`，guard-db.ts 护栏生效）

### 偏离复核
- [x] `hidden` vs 条件渲染：判定为 P2 微调——不影响验收标准（三 tab 默认汇总、图谱/列表保留均满足），仅影响图谱 tab 切换时的 canvas 内部状态保留
- [x] 嵌套 include 替代两步查询：合理改进，不视为偏离

### 上游兼容性
- [x] 未修改上游已有数据库表结构（Case/Artifact 均为 Nana 新增 model，非上游 wrong-notebook model）
- [x] 上游文件修改已标注且最小化（`cases/route.ts` 仅扩展 GET handler，POST 不变）
- [x] 新增文件在独立路径（`summary/route.ts` 新文件）

### 部署审计
- N/A（本轮为纯代码开发，未涉及部署/发布/上线）

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0，3/3 agents in sync）

### 测试
- [x] 本地 `npm.cmd run build` 通过（exit 0）
- [x] 本地集成测试通过：`summary-api.test.ts` 14/14 ✅
- [x] 已有测试无回归：`process-api.test.ts` 18/18 ✅
- [x] 测试使用 test.db（`DATABASE_URL=file:./data/test/test.db`），未触碰生产 `./data/dev.db`
- [x] 没有退回生产容器跑测试
- [x] DB 护栏断言（`src/__tests__/setup/guard-db.ts`）存在且生效
- ⚠️ 测试未覆盖 `timeout` → `failed` 映射（代码已实现，但计划 §6.2 也未要求此测试项，一致）

---

## 验收标准逐条核对

| # | 验收项 | 结果 | 证据 |
|---|--------|:----:|------|
| 1 | summary API 跨用户隔离（studentId 归属过滤） | ✅ | `where: { studentId: session.user.id }`；测试 #2 验证 OTHER_USER 数据不出现 |
| 2 | summary/list API 不返回 base64 原图 | ✅ | 两处 `artifacts: { select: { type: true } }` 不选 content；测试 #8 + #14 验证响应不含 'base64' |
| 3 | pending/failed/success 三态正确映射 | ✅ | 代码 `success`→success、`failed`/`timeout`→failed、无 aiResult→pending；测试 #5-7 + #12-13 验证 |
| 4 | 未分类/暂未覆盖分组（topic=null）可见 | ✅ | 无 textbookTopicTag 的 case 归入 `topic: null` 组，前端显示"未分类/暂未覆盖"；测试 #4 验证 |
| 5 | 三 tab 默认汇总，图谱/列表保留 | ✅ | `activeTab` 默认 `"summary"`；图谱 tab 保留 KnowledgeMapCanvas + 浮层按钮；列表 tab 保留 KnowledgeMapListView |
| 6 | npm run build + 集成测试通过 | ✅ | build exit 0；14 集成测试全绿；18 回归测试全绿 |

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | 计划要求 `hidden` 保留组件状态，实现用条件渲染导致图谱 tab 切换丢失缩放/平移状态 | `src/app/nana/knowledge-map/page.tsx` line 313/403/428 | 后续轮次改为 `hidden` className 切换，或使用 CSS `display: none` 保留 DOM |
| P2 | `viewMode` 变量定义后未使用，是死代码 | `src/app/nana/knowledge-map/page.tsx` line 66-67 | 删除 `viewMode` 变量及注释 |
| P2 | summary 加载失败时静默 `setSummaryData(null)`，用户看到空白无提示 | `src/app/nana/knowledge-map/page.tsx` line 125 | 增加 error 状态 + "加载失败，点击重试" 提示 |
| P2 | execute-agent 未产出执行日志 | `doc/executionlog/` | 补写 `stage3-revised-round3-summary-api-log.md` |
| P2 | 架构隐患：summary/list 课本分组读 `CaseTextbookTopicTag` 表，process 编辑保护保护的是 `CaseAiResult.textbookTopicId` 字段——不是同一张表。当前无手动改课本分类 API 不会触发，但未来实现时须确保写 `CaseTextbookTopicTag` 表 | `src/app/api/nana/cases/summary/route.ts` + `cases/route.ts` + `process/route.ts` | 未来实现手动编辑课本分类 API 时，同步写 `CaseTextbookTopicTag(source="manual")`；或 summary 改为优先读 `CaseAiResult.textbookTopicId` |

---

## 评审反馈逐条确认（深入审计）

### 一、API 数据边界

#### 1.1 /summary 是否所有查询都通过 Case.studentId 做归属过滤？

**✅ 通过。**

- `summary/route.ts` line 27-28：`where: { studentId: session.user.id }`——唯一查询入口，所有 case 按 session 用户过滤
- `cases/route.ts` line 49-50：同样 `where: { studentId: session.user.id }`
- 两个 API 都先做 `getServerSession` 鉴权，无 session 直接返回 401
- 测试 #1 验证未登录→401；测试 #2 验证 OTHER_USER 的 case 不出现在 TEST_USER 的 summary 中

**结论**：无裸查、无越权，归属过滤在 Prisma where 层强制。

#### 1.2 /cases 和 /summary 是否绝不返回 Artifact.content / base64？

**✅ 通过。**

- `summary/route.ts` line 33：`artifacts: { select: { type: true } }`——只选 type，不选 content
- `cases/route.ts` line 56：`artifacts: { select: { type: true } }`——同上
- 两个 API 的响应体中只有 `hasImage: boolean`，没有任何 base64 字段
- 测试 #8（summary）：`expect(bodyText).not.toContain('data:image')` + `not.toContain('base64')`
- 测试 #14（list）：同样断言

**结论**：API 层从 Prisma select 就不碰 content，不可能泄露 base64。

#### 1.3 pending / failed / success 三态是否来自真实 CaseAiResult 状态？

**✅ 通过。三态来自数据库真实字段，不是前端猜。**

- `summary/route.ts` line 80-86 + `cases/route.ts` line 84-90：
  ```typescript
  let processStatus = "pending";
  if (c.aiResult) {
    const ps = c.aiResult.processingStatus;  // ← 真实数据库字段
    if (ps === "success") processStatus = "success";
    else if (ps === "failed" || ps === "timeout") processStatus = "failed";
    else processStatus = "pending";
  }
  ```
- 映射规则与计划 §2.5 完全一致
- `processingStatus` 的值由 `/process` API 写入（`persistAiResult` 设 "success"，`persistFailedResult` 设 "failed"）
- 前端只接收 API 返回的 `processStatus` 值映射为文案，不做任何独立判定

**结论**：三态链路完整——process API 写真实状态 → summary/list API 从数据库读 → 前端纯展示。

### 二、分组语义

#### 2.1 textbookTopicId = null 是否稳定归入"未分类/暂未覆盖"？

**✅ 通过。**

- `summary/route.ts` line 89-103：
  ```typescript
  const topTag = c.textbookTopicTags[0];
  const topic = topTag?.textbookTopic ?? null;
  const groupKey = topic?.id ?? "__null__";
  ```
  无 `textbookTopicTag` 的 case → `topTag` 为 undefined → `topic` 为 null → `groupKey` 为 `"__null__"` → 归入 `topic: null` 组
- line 115-119：未分类组排序时 `return 1` 放最后，稳定不漂移
- 前端 `page.tsx` line 339：`group.topic ? group.topic.name : "未分类/暂未覆盖"`
- 测试 #4：无 tag 的 case 验证归入 `topic === null` 组且 `cases.length === 1`

**结论**：null 分组逻辑稳定，前端措辞合规（"未分类/暂未覆盖"，不说"AI 未识别"）。

#### 2.2 用户手动改过分类后，汇总页到底用 CaseAiResult.textbookTopicId 还是 CaseTextbookTopicTag？

**⚠️ 架构隐患（当前不触发，但需记录）。**

深入审查发现两个表职责不同：

| 表/字段 | 用途 | 写入方 | summary/list 读？ |
|---------|------|--------|:-:|
| `CaseTextbookTopicTag` | 课本分类标签（textbookTopicId + source + confidence） | /process API（source="vlm"） | ✅ 两个 API 都读这个 |
| `CaseAiResult.textbookTopicId` | AI 识别的课本分类（冗余快照） | /process API | ❌ 两个 API 都不读 |
| `CaseAiResult.textbookTopicEdited` | 编辑保护标志 | **无 API 设置此标志**（仅测试代码直接写库） | N/A |

关键发现：
1. **summary 和 list API 都读 `Case.textbookTopicTags`（CaseTextbookTopicTag 表）**，不读 `CaseAiResult.textbookTopicId`
2. **当前没有手动改课本分类的 API**：
   - `POST /api/nana/cases/[id]/tags` 写的是 `CaseKnowledgeTag`（知识点标签 nodeId），**不是** `CaseTextbookTopicTag`（课本分类标签 textbookTopicId）
   - 没有任何 API 设置 `CaseAiResult.textbookTopicEdited = true`（只有测试代码直接写库）
3. process API 的 `textbookTopicEdited` 保护机制（line 122-129, 152-154）保护的是 `CaseAiResult.textbookTopicId` 和 `CaseTextbookTopicTag(vlm)` 不被 AI 重跑覆盖

**当前结论**：因为手动改课本分类的 API 不存在，所以"手动改了但汇总不变"的 bug 当前不会触发。

**隐患**：如果未来实现了手动编辑课本分类的 API，且只改 `CaseAiResult.textbookTopicId` 而不写 `CaseTextbookTopicTag` 表，summary 页面不会反映用户的修改。两个表的写入口径必须统一。

**建议**：未来实现手动编辑课本分类时，必须同步写 `CaseTextbookTopicTag(source="manual")` 表；或者 summary 改为优先读 `CaseAiResult.textbookTopicId`。

### 三、前端只是外壳

#### 3.1 三 tab 默认是否真的是"题目汇总"？

**✅ 通过。**

- `page.tsx` line 65：`useState<"summary" | "graph" | "list">("summary")`——默认 summary
- 首次进入页面时 `activeTab === "summary"` 为 true，触发 summary 数据加载（line 120-127）

#### 3.2 图谱/列表原有功能有没有被破坏？

**✅ 通过。**

- 图谱 tab（line 403-425）：完整保留 `KnowledgeMapCanvas` + 浮层入口按钮 + 图例
- 列表 tab（line 428-435）：完整保留 `KnowledgeMapListView`
- 节点详情卡 `KnowledgeDetailCard` 和 `RecentCasesList` 浮层抽屉逻辑保留
- 18 个 process-api 回归测试全绿，确认 API 层无回归
- ⚠️ P2：用了条件渲染而非 `hidden`，切走图谱再切回会重新挂载 canvas，丢失缩放/平移状态。不影响功能正确性。

#### 3.3 "题目汇总"卡片是否没有默认展示原图？

**✅ 通过。**

- 卡片 UI（line 347-393）：只显示 `ImageIcon` 占位图标 + `hasImage` 标志，不展示任何 base64 图片
- API 不返回 `artifact.content`，前端即使想展示也拿不到原图
- 卡片内容：aiSummary 文字 + textbookChapter + processStatus chip + 日期——全是轻量字段
- 不会把手机页面撑慢

### 四、测试覆盖

#### 4.1 14 个测试是否覆盖了评审要求的场景？

| 评审要求 | 对应测试 | 结果 |
|----------|----------|:----:|
| 跨用户 summary 不串数据 | #2 跨用户隔离 | ✅ |
| failed case 出现在汇总中且文案诚实 | #7 processStatus=failed + 前端"需重试" | ✅ |
| pending case 不假装已整理 | #5 processStatus=pending + 前端"待处理" | ✅ |
| 未分类/暂未覆盖分组存在 | #4 未分类分组 topic=null | ✅ |
| list 无 base64 | #14 列表不返回 base64 | ✅ |
| summary 无 base64 | #8 不返回 base64 | ✅ |

**补充确认**：
- **failed 文案诚实**：测试 #7 验证 `item.processStatus === 'failed'`，前端映射为"需重试"（琥珀色），不说"错误"——符合运营手册措辞铁律
- **pending 不假装**：测试 #5 验证 `item.processStatus === 'pending'`，前端映射为"待处理"（灰色），不说"完成"——诚实
- **未测试但代码已实现**：`timeout` → `failed` 映射（计划 §6.2 也未要求此测试项，一致）

**结论**：14 个测试覆盖了评审反馈中提到的全部 5 个场景。

---

## 用户验证指南

1. 打开 http://localhost:3001，登录后进入"我的知识地图"页
2. 默认应看到"汇总" tab，展示按课本章节分组的题目卡片
3. 有题图但无课本标签的题应归入"未分类/暂未覆盖"分组
4. 每张卡片右侧应有状态标签：绿色"已完成" / 琥珀色"需重试" / 灰色"待处理"
5. 切换到"图谱" tab，应看到原有知识图谱画布 + 左下角"最近拍过"浮层按钮
6. 切换到"列表" tab，应看到原有知识点列表视图
7. 切回"汇总" tab，数据应已缓存无需重新加载（但如果切走再切回图谱 tab，缩放/平移状态会重置——这是已知 P2）

---

## 评审确认

> **评审日期**: 2026-07-06
> **评审结论**: ✅ 通过，可进入下一步

评审反馈摘要：
- Round 3 通过，可进入 Round 4 plan
- P2 架构隐患（TD-006）已登记 BACKLOG.md，作为 Round 4 前置约束
- Round 4 建议窄范围：只做"拍题保存后触发整理 / 查询整理状态 / 展示 AI 结果卡"
- Round 4 plan 必须显式带上 TD-006 约束

### 已完成的收口动作

- [x] TD-006 登记到 `doc/BACKLOG.md`（活跃 backlog 区）
- [x] `doc/progress.md` 追加 Round 3 完成记录
- [x] `doc/active_spec.md` 更新为 Round 4 待启动 + 前置约束
