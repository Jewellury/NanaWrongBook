# Stage 3 v3-revised（收敛版）：AI 错题卡片闭环方案

> 关联规格: [doc/plan/stage3-ai-integration-plan.md](stage3-ai-integration-plan.md)（v3 原版，本文件替代其 §1/§3/§5/§6/§7/§15/§18）
> 关联参考: [doc/reference/TECH_PLAN_v2.md](../reference/TECH_PLAN_v2.md)、[doc/reference/OPS_handbook.md](../reference/OPS_handbook.md)
> Spike 结果: [doc/research/spike-v3-report.md](../research/spike-v3-report.md)
> 产品手册: [doc/product/nana-user-manual-v1-draft.md](../product/nana-user-manual-v1-draft.md)（需同步更新）
> 种子数据: [doc/research/seed_graph_batch1.ts](../research/seed_graph_batch1.ts)（48 节点定义源）
> 计划日期: 2026-07-04（初版）→ 2026-07-05（收敛版修订）
> 计划者: plan-agent
> 版本: **v3-revised 收敛版 r5（基于评审 5+4 项反馈 + 产品推演 6 项修订 + Round UI-0 排查 6 项回填）**
> 边界: **错题卡片闭环**——拍题 → AI 识别题面摘要+课本分类+轻反馈 → 持久化 → 题目汇总列表 → 可打印。**不做深度诊断、不做 Newman 归因、不写 StudentNodeState、不让节点变绿。**

---

## 0. 变更摘要

### 0.1 收敛版 r1（5 项反馈）

| # | 评审反馈 | 处置 |
|---|---------|------|
| 1 | 不扩展 CaseKnowledgeTag | **改为新增 `CaseTextbookTopicTag` 独立表**，CaseKnowledgeTag 保持原样不扩展 |
| 2 | TextbookTopic seed 必须完整 | **§3 提供完整 16 个 TextbookTopic + 48 节点映射**，不再写"后续补充" |
| 3 | 收窄 v1 范围 | **裁剪/旋转、疑似重复题提醒、完整 OCR、Problem/Attempt 全部移出 v1** |
| 4 | UI 文案不用"识别出的题目" | **统一改为"AI 摘要"/"这题大概在问"** |
| 5 | 统一 schema 变更描述 | **§2 明确：新增 4 张表、不扩展 CaseKnowledgeTag、Case 加 2 个 relation** |

### 0.3 推演修订 r4（产品推演反馈）

| # | 反馈 | 决策 |
|---|------|------|
| 12 | 前端改版不能直接执行，要先排查修改点 | **新增 Round UI-0 前端修改点排查**，execute 前必须先输出排查清单 |
| 13 | "AI 初步诊断"说法需全局清零 | **全局替换为轻反馈语义**，新增合格/不合格示例 |
| 14 | 题目汇总主卡偏"数据表"，需从复习视角重排 | **主卡默认不展示原图和时间**，展开后才显示辅助信息 |
| 15 | 打印页偏"后台日志"，需弱化技术元信息 | **默认不打印时间/置信度/source**，保留小题图 |
| 16 | 需明确 OCR v2 候选路线 | **新增 v2 候选：AI 题面文本（可编辑 OCR）**，先做 Spike |
| 17 | 列表 API 不得返回 base64 题图 | **原图必须详情懒加载**，列表 API 只返回摘要文本 |

### 0.4 Round UI-0 排查回填 r5（2026-07-05）

| # | 排查结论 | 回填位置 |
|---|---------|----------|
| 18 | 打印预览新建 `/nana/print-preview`，不复用上游 error-items 页 | §14.5.4 结论 1、§14 文件清单 |
| 19 | LightFeedback 不扩展，Stage 3 新建 `ai-result-panel.tsx` | §14.5.4 结论 2、§14 文件清单 |
| 20 | 列表/summary API 只返回轻量字段，不得返回 base64 | §14.5.4 结论 3、§15 Round 2 |
| 21 | 异步整理状态查询契约（4 步流程） | §14.5.4 结论 4、§10 状态机 |
| 22 | Round 1-5 文件清单+风险等级更新（3 项高风险） | §14 文件清单、§15 实施顺序 |
| 23 | 验收标准新增 #22 批量拍题不被阻塞 + #23 三态可见 | §13 验收标准 |

### 0.2 收敛版 r2（4 项反馈）

| # | 评审反馈 | 处置 |
|---|---------|------|
| 6 | CaseTextbookTopicTag.source 收窄 | **只允许 manual / vlm**，移除 asr/rule/pending，代码层加白名单+测试 |
| 7 | CaseAiResult.textbookTopicId 加 FK | **加 FK 到 TextbookTopic(id)**，TextbookTopic 是 Nana 自有新表，不违反铁律 3 |
| 8 | Round 0 不能直接执行 migrate | **改为 `--create-only`**，生成后交用户确认，seed 在 migration 执行后才跑 |
| 9 | TextbookTopic seed 标明覆盖范围 | **标明覆盖当前 48 个系统节点，非完整教材目录**，UI 未覆盖章节显示"暂未覆盖" |
| 10 | 课本章节数据不准确 | **TB-015/TB-016 复数从必修一改为必修第二册**（人教A版(2019)复数属必修第二册第七章） |
| 11 | nextActionSuggestion 没闭环 | **全链路补齐**：JSON schema + prompt + Zod + /process 返回 + 落库 + UI + 测试 |

---

## 1. v1 范围（收敛后）

### 1.1 v1 必做

| 能力 | 说明 |
|------|------|
| TextbookTopic 课本章节 | 16 个章节，覆盖必修一 5 章全部 48 节点 |
| CaseAiResult 持久化 | AI 摘要、课本分类、轻反馈全部落库 |
| AI 错题卡片 | 拍题后展示 AI 摘要 + 课本分类 + 轻反馈 |
| 题目汇总列表 | 按课本章节分组的错题卡片列表，替代图谱为默认视图 |
| 手动修正课本分类 | 用户可改 AI 给的课本分类 |
| 手动修正题面摘要 | 用户可编辑 AI 摘要 |
| 浏览器打印 | CSS `@media print` + `window.print()` |

### 1.2 v1 延后（明确移出）

| 能力 | 延后理由 |
|------|---------|
| 图片裁剪 | 已有 `react-image-crop` 依赖，但接入采集页非闭环必需 |
| 图片旋转 | Canvas transform 可实现，但同上 |
| 涂抹/马赛克 | v1 不做图片编辑 |
| 疑似重复题提醒 | 文本相似度算法+UI 交互，非闭环核心 |
| 完整 OCR | v1 用 questionSummary 一句话摘要够用 |
| Problem/Attempt 模型 | v1 仍 1 Case = 1 拍题 |
| PDF 导出 | 浏览器打印另存为 PDF 够用 |
| 完整解题步骤 | v1 只做轻反馈，不误导 |
| 图片 embedding 去重 | 过重 |
| recognizedQuestionText | v1 不做完整 OCR，此字段从 JSON schema 中移除 |

### 1.2.1 v2 候选：AI 题面文本（可编辑 OCR）

> v1 不承诺"完整 OCR"。以下为 v2 候选路线，先做 Spike 验证再决定是否纳入。

| 阶段 | 内容 | 产出 |
|------|------|------|
| v2 Spike | 用现有真实题图样本（至少 20 张）测试题面还原准确率、公式错误率、手写/印刷混合效果 | Spike 报告（准确率、错误模式、是否可上线） |
| v2 候选 A | 如果 Spike 通过，做"AI 题面文本（可编辑）"：用户可修正 OCR 结果，用于打印简洁版和重复题识别 | recognizedQuestionText 字段重新引入 |
| v2 候选 B | 如果 Spike 部分通过，做"AI 题面文本（只读参考）"：展示但不作为正式文本 | 只展示不编辑 |
| v2 不做 | 如果 Spike 不通过，继续用 questionSummary 一句话摘要 | 维持 v1 |

**措辞铁律**：
- v1 UI 中**绝不暗示已完整识别题面**
- "AI 摘要"就叫"AI 摘要"，不叫"识别出的题目""题面文本""OCR 结果"
- v2 上线前不提前承诺"以后会做 OCR"

### 1.3 严禁边界（守 OPS §4）

- ❌ 严禁输出"已诊断""薄弱""掌握""得分"
- ❌ 严禁"AI 初步诊断"说法——v1 只做**轻反馈**，不做任何形式的诊断
- ❌ 严禁 AI 给出确定性诊断（只做"可能属于"）
- ❌ 严禁 AI 解题或给答案
- ❌ 严禁节点因拍题变绿（只写 CaseKnowledgeTag，不写 StudentNodeState）
- ✅ AI 反馈用"AI 想对你说""可能的方向""下一步可以"措辞

**合格示例**：
- ✅ "这题大概在考一元二次不等式。可以重点检查移项后不等号方向有没有变化。"
- ✅ "这题可能和函数单调性有关。下一步可以回看函数增减性的判断方法，再检查区间端点。"

**不合格示例**：
- ❌ "你的薄弱点是一元二次不等式。"
- ❌ "已诊断：函数单调性掌握不足。"
- ❌ "这道题正确解法如下……"

---

## 2. 数据模型（统一描述）

### 2.1 Schema 变更总览

| 变更类型 | 对象 | 说明 |
|---------|------|------|
| **新增表** | `TextbookTopic` | 课本章节（16 条种子数据） |
| **新增表** | `TextbookNodeMapping` | 课本章节↔系统节点映射（48 条） |
| **新增表** | `CaseAiResult` | AI 分析结果持久化（1:1 关联 Case） |
| **新增表** | `CaseTextbookTopicTag` | Case↔课本章节挂载（类似 CaseKnowledgeTag，但独立表） |
| **不扩展** | `CaseKnowledgeTag` | 保持原样，继续只表示系统 KnowledgeNode |
| **加 relation** | `Case` 模型 | 新增 `aiResult CaseAiResult?` 和 `textbookTopicTags CaseTextbookTopicTag[]`（仅 Prisma 关系声明，Case 表本身不加列） |
| **加 relation** | `TextbookTopic` 模型 | 新增 `mappings` 和 `caseTags` 反向关系 |
| **声明不使用** | Artifact type | "ai_question_summary" 声明但 v1 不用，questionSummary 存 CaseAiResult |

### 2.2 为什么不扩展 CaseKnowledgeTag

评审反馈 1 明确要求：CaseKnowledgeTag 继续只表示系统 KnowledgeNode。

**理由**：
1. **职责单一**：CaseKnowledgeTag 的语义是"Case → KnowledgeNode"，每条记录的 `nodeId` 指向 48 个系统节点之一。加 `textbookTopicId` 会让同一张表承载两种不同语义的挂载。
2. **查询清晰**：题目汇总列表需要按 TextbookTopic 分组查询，独立表可以直接 `WHERE textbookTopicId = ?`，不需要在 CaseKnowledgeTag 里加 `WHERE textbookTopicId IS NOT NULL` 过滤。
3. **回滚独立**：如果 TextbookTopic 方案需要回滚，只需 DROP 新表，不影响 CaseKnowledgeTag 已有数据。

### 2.3 新增表定义

#### TextbookTopic（课本章节）

```prisma
model TextbookTopic {
  id          String   @id          // "TB-001" 等
  name        String                // "集合的概念"（课本小节名）
  chapter     String                // "第一章 集合与常用逻辑用语"
  section     String                // "1.1 集合的概念"
  stage       String                // "必修一"
  order       Int      @default(0)  // 排序用
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  mappings    TextbookNodeMapping[]
  caseTags    CaseTextbookTopicTag[]
  aiResults   CaseAiResult[]  // ← 反向关系（CaseAiResult.textbookTopicId FK）

  @@index([stage, order])
}
```

#### TextbookNodeMapping（课本章节↔系统节点映射）

```prisma
model TextbookNodeMapping {
  textbookTopicId String
  nodeId          String
  textbookTopic   TextbookTopic @relation(fields: [textbookTopicId], references: [id], onDelete: Cascade)
  // nodeId 松挂接 KnowledgeNode（无 FK，与 CaseKnowledgeTag 同款，守铁律 3）

  @@id([textbookTopicId, nodeId])
  @@index([nodeId])
}
```

#### CaseAiResult（AI 分析结果持久化）

```prisma
model CaseAiResult {
  id              String   @id @default(cuid())
  caseId          String   @unique  // 1:1，一个 case 只存最新一次 AI 结果
  case            Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)

  // AI 识别结果
  questionSummary       String?   // AI 生成的一句话题目摘要
  questionSummaryEdited Boolean  @default(false)  // 用户是否手动纠错
  transcript            String?   // 转写文字快照（从 Artifact 同步）

  // AI 课本分类结果
  textbookTopicId       String?   // 最高置信课本分类（给用户看）
  textbookTopic         TextbookTopic? @relation(fields: [textbookTopicId], references: [id], onDelete: SetNull)  // FK：TextbookTopic 是 Nana 自有新表，不违反铁律 3
  textbookTopicConfidence Float   @default(0.0)
  textbookTopicEdited   Boolean  @default(false)  // 用户是否手动修正

  // AI 轻反馈
  initialFeedback       String?   // 鼓励文案
  possibleMistakeReason String?   // 可能的错因（不诊断，只提示方向）
  nextActionSuggestion  String?   // 建议下一步

  // 元数据
  audioStatus           String   @default("skipped")  // success | skipped | failed | timeout
  processingStatus      String   @default("pending")  // success | failed | timeout | pending
  error                 String?  // 失败原因
  tokenUsage            String?  // JSON: {promptTokens, completionTokens, totalTokens}

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([textbookTopicId])
}
```

> **为什么 CaseAiResult.textbookTopicId 加 FK**：TextbookTopic 是 Nana 自有新表（非上游 wrong-notebook 表），加 FK 不违反铁律 3。FK 约束确保 textbookTopicId 必须指向真实存在的 TextbookTopic 记录，防止 AI 返回脏 topicId 或手动写入错误 ID。`onDelete: SetNull` 确保 TextbookTopic 被删除时 CaseAiResult 记录不丢失（只清空分类字段）。

> **注意**：v1 移除了 `recognizedQuestionText` 字段（完整 OCR 延后，不需要预留空字段）。

#### CaseTextbookTopicTag（Case↔课本章节挂载）

```prisma
model CaseTextbookTopicTag {
  id              String   @id @default(cuid())
  caseId          String
  case            Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  textbookTopicId String
  textbookTopic   TextbookTopic @relation(fields: [textbookTopicId], references: [id], onDelete: Cascade)
  source          String   // "manual" | "vlm"（代码层白名单，详见 §2.6）
  confidence      Float    @default(0.0)  // manual=1.0，vlm 给概率
  note            String?
  createdAt       DateTime @default(now())

  @@unique([caseId, textbookTopicId, source])
  @@index([caseId])
  @@index([textbookTopicId])
}
```

### 2.6 CaseTextbookTopicTag.source 白名单

**只允许两个值**：`"manual"` | `"vlm"`。不预留 asr/rule/pending。

**理由**：v1 的课本分类只有两个写入来源——AI 自动挂（vlm）和用户手动修正（manual）。预留未使用的 source 会导致代码层白名单松散、测试覆盖不到真实约束。

**代码层约束**（execute 时实现）：
```typescript
// src/lib/nana/textbook-topic-tag-source.ts
export const TEXTBOOK_TOPIC_TAG_SOURCES = ["manual", "vlm"] as const;
export type TextbookTopicTagSource = (typeof TEXTBOOK_TOPIC_TAG_SOURCES)[number];

export function isValidSource(value: string): value is TextbookTopicTagSource {
  return (TEXTBOOK_TOPIC_TAG_SOURCES as readonly string[]).includes(value);
}
```

**测试层约束**（§12.2 新增测试用例）：
```typescript
// process-api.test.ts 新增：
// 16. CaseTextbookTopicTag.source 只接受 manual/vlm，写入非法值时拒绝
```

### 2.4 Case 模型扩展（加 relation，不加列）

```prisma
model Case {
  // ... 现有字段不变 ...
  aiResult          CaseAiResult?           // ← 新增 1:1 关系
  textbookTopicTags CaseTextbookTopicTag[]  // ← 新增 1:N 关系
}
```

> **说明**：这两个 relation 字段不产生 Case 表的新列——FK 在 CaseAiResult.caseId 和 CaseTextbookTopicTag.caseId 侧。Case 表的数据库结构不变，只改 Prisma schema 声明。

### 2.5 Artifact type 白名单

```
现有: "question_image" | "audio_note" | "audio_meta" | "transcript"
不新增: v1 的 questionSummary/feedback 全部存 CaseAiResult 表，不用 Artifact
```

---

## 3. TextbookTopic 种子数据

### 3.1 覆盖范围声明

**重要**：本批 16 个 TextbookTopic 覆盖的是**当前知识图谱中已定义的 48 个系统节点**，不是完整的高中数学教材目录。

- 当前系统节点仅来自 `seed_graph_batch1.ts`：5 个地基层 + 30 个 M1 节点 + 13 个 M2a 节点
- 必修一教材实际包含更多章节（如第三章 3.3 幂函数、3.4 函数的应用等），但当前知识图谱尚未建对应节点
- 后续知识图谱扩展时（新增 M2b/M3/M4 等主线节点），需同步追加 TextbookTopic

**UI 和文档措辞要求**：
- ❌ 不写"已覆盖必修一全部章节"
- ✅ 写"当前覆盖 48 个系统知识点对应的课本章节"
- ✅ 题目汇总页的 TextbookTopic 选择器中，未覆盖的章节不出现（只展示有节点的 topic）
- ✅ AI 分类如果返回清单外的 topicId，代码层过滤掉，题目归入"未分类/暂未覆盖"

### 3.2 数据来源

种子数据基于 `doc/research/seed_graph_batch1.ts` 中已定义的 48 个 KnowledgeNode：
- foundationExtra: 5 个（BG100-104）
- M1nodes: 30 个（M1-04 ~ M1-33）
- M2aNodes: 13 个（已列出的关键节点）

教材依据：人教 A 版（2019 新版）高中数学。其中 TB-001~TB-014 属必修第一册，TB-015~TB-016 属必修第二册（复数在必修第二册第七章，不是必修第一册）。

### 3.3 TextbookTopic 列表（16 个，覆盖当前 48 个系统节点）

| ID | chapter | section | name | stage | order | 映射节点 |
|----|---------|---------|------|-------|:-----:|---------|
| TB-001 | 第一章 集合与常用逻辑用语 | 1.1 集合的概念 | 集合的概念 | 必修一 | 1 | M1-04, M1-05, M1-06, M1-07, M1-08 |
| TB-002 | 第一章 集合与常用逻辑用语 | 1.2 集合间的基本关系 | 集合间的基本关系 | 必修一 | 2 | M1-09, M1-10, M1-31 |
| TB-003 | 第一章 集合与常用逻辑用语 | 1.3 集合的基本运算 | 集合的基本运算 | 必修一 | 3 | M1-11, M1-12, M1-13, M1-14, BG102 |
| TB-004 | 第一章 集合与常用逻辑用语 | 1.4 充分条件与必要条件 | 充分条件与必要条件 | 必修一 | 4 | M1-15 |
| TB-005 | 第一章 集合与常用逻辑用语 | 1.5 全称量词与存在量词 | 全称量词与存在量词 | 必修一 | 5 | M1-16, M1-17, M1-18, M1-19 |
| TB-006 | 第二章 一元二次函数、方程和不等式 | 2.1 等式性质与不等式性质 | 等式性质与不等式性质 | 必修一 | 6 | M1-20, M1-21 |
| TB-007 | 第二章 一元二次函数、方程和不等式 | 2.2 基本不等式 | 基本不等式 | 必修一 | 7 | M1-22, M1-23, M1-33, BG104 |
| TB-008 | 第二章 一元二次函数、方程和不等式 | 2.3 一元二次不等式 | 一元二次不等式 | 必修一 | 8 | M1-24, M1-25, M1-32, BG100, BG101 |
| TB-009 | 第三章 函数的概念与性质 | 3.1 函数的概念及其表示 | 函数的概念及其表示 | 必修一 | 9 | M2a-01, M2a-03, M2a-04, M2a-09, M2a-51, BG103 |
| TB-010 | 第三章 函数的概念与性质 | 3.2 函数的基本性质 | 函数的基本性质 | 必修一 | 10 | M2a-13, M2a-17 |
| TB-011 | 第四章 指数函数与对数函数 | 4.2 指数函数 | 指数函数 | 必修一 | 11 | M2a-32, M2a-33 |
| TB-012 | 第四章 指数函数与对数函数 | 4.3 对数 | 对数 | 必修一 | 12 | M2a-38 |
| TB-013 | 第四章 指数函数与对数函数 | 4.4 对数函数 | 对数函数 | 必修一 | 13 | M2a-42 |
| TB-014 | 第四章 指数函数与对数函数 | 4.5 函数的应用（零点） | 函数的应用（零点） | 必修一 | 14 | M2a-48, M2a-49 |
| TB-015 | 第七章 复数 | 7.1 复数的概念 | 复数的概念 | 必修第二册 | 15 | M1-26, M1-27, M1-28 |
| TB-016 | 第七章 复数 | 7.2 复数的四则运算 | 复数的四则运算 | 必修第二册 | 16 | M1-29, M1-30 |

### 3.4 映射覆盖验证

| 统计项 | 数量 |
|--------|:----:|
| TextbookTopic 总数 | 16 |
| 映射条目总数 | 48 |
| 覆盖的 KnowledgeNode | 48 / 48（100%） |
| 每节点平均映射到 TextbookTopic 数 | 1.0 |
| 覆盖必修一全部章节 | ❌ 否（只覆盖当前知识图谱已有节点的章节） |

> **说明**：每个 KnowledgeNode 恰好映射到 1 个 TextbookTopic。地基层节点（BG100-104）按其 `stage` 字段归入对应章节：
> - BG100（韦达定理）→ TB-008（2.3 一元二次不等式，因为 `stage = "九上/必修一"`，韦达定理是二次方程根的工具）
> - BG101（解一元二次不等式）→ TB-008（`stage = "必修一2.3"`）
> - BG102（区间表示法）→ TB-003（1.3 集合运算，区间与集合互化）
> - BG103（整体换元）→ TB-009（3.1 函数概念，换元是函数概念基础）
> - BG104（二次函数闭区间最值）→ TB-007（2.2 基本不等式，最值问题）

### 3.5 种子脚本方案

新建 `prisma/seed_textbook_topics.ts`，幂等导入：

```typescript
// 种子数据结构（完整，直接可用）
const textbookTopics = [
  { id: "TB-001", name: "集合的概念", chapter: "第一章 集合与常用逻辑用语",
    section: "1.1 集合的概念", stage: "必修一", order: 1 },
  { id: "TB-002", name: "集合间的基本关系", chapter: "第一章 集合与常用逻辑用语",
    section: "1.2 集合间的基本关系", stage: "必修一", order: 2 },
  { id: "TB-003", name: "集合的基本运算", chapter: "第一章 集合与常用逻辑用语",
    section: "1.3 集合的基本运算", stage: "必修一", order: 3 },
  { id: "TB-004", name: "充分条件与必要条件", chapter: "第一章 集合与常用逻辑用语",
    section: "1.4 充分条件与必要条件", stage: "必修一", order: 4 },
  { id: "TB-005", name: "全称量词与存在量词", chapter: "第一章 集合与常用逻辑用语",
    section: "1.5 全称量词与存在量词", stage: "必修一", order: 5 },
  { id: "TB-006", name: "等式性质与不等式性质", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.1 等式性质与不等式性质", stage: "必修一", order: 6 },
  { id: "TB-007", name: "基本不等式", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.2 基本不等式", stage: "必修一", order: 7 },
  { id: "TB-008", name: "一元二次不等式", chapter: "第二章 一元二次函数、方程和不等式",
    section: "2.3 一元二次不等式", stage: "必修一", order: 8 },
  { id: "TB-009", name: "函数的概念及其表示", chapter: "第三章 函数的概念与性质",
    section: "3.1 函数的概念及其表示", stage: "必修一", order: 9 },
  { id: "TB-010", name: "函数的基本性质", chapter: "第三章 函数的概念与性质",
    section: "3.2 函数的基本性质", stage: "必修一", order: 10 },
  { id: "TB-011", name: "指数函数", chapter: "第四章 指数函数与对数函数",
    section: "4.2 指数函数", stage: "必修一", order: 11 },
  { id: "TB-012", name: "对数", chapter: "第四章 指数函数与对数函数",
    section: "4.3 对数", stage: "必修一", order: 12 },
  { id: "TB-013", name: "对数函数", chapter: "第四章 指数函数与对数函数",
    section: "4.4 对数函数", stage: "必修一", order: 13 },
  { id: "TB-014", name: "函数的应用（零点）", chapter: "第四章 指数函数与对数函数",
    section: "4.5 函数的应用（零点）", stage: "必修一", order: 14 },
  { id: "TB-015", name: "复数的概念", chapter: "第七章 复数",
    section: "7.1 复数的概念", stage: "必修第二册", order: 15 },
  { id: "TB-016", name: "复数的四则运算", chapter: "第七章 复数",
    section: "7.2 复数的四则运算", stage: "必修第二册", order: 16 },
];

const textbookNodeMappings = [
  // TB-001 集合的概念
  { textbookTopicId: "TB-001", nodeId: "M1-04" },
  { textbookTopicId: "TB-001", nodeId: "M1-05" },
  { textbookTopicId: "TB-001", nodeId: "M1-06" },
  { textbookTopicId: "TB-001", nodeId: "M1-07" },
  { textbookTopicId: "TB-001", nodeId: "M1-08" },
  // TB-002 集合间的基本关系
  { textbookTopicId: "TB-002", nodeId: "M1-09" },
  { textbookTopicId: "TB-002", nodeId: "M1-10" },
  { textbookTopicId: "TB-002", nodeId: "M1-31" },
  // TB-003 集合的基本运算
  { textbookTopicId: "TB-003", nodeId: "M1-11" },
  { textbookTopicId: "TB-003", nodeId: "M1-12" },
  { textbookTopicId: "TB-003", nodeId: "M1-13" },
  { textbookTopicId: "TB-003", nodeId: "M1-14" },
  { textbookTopicId: "TB-003", nodeId: "BG102" },
  // TB-004 充分条件与必要条件
  { textbookTopicId: "TB-004", nodeId: "M1-15" },
  // TB-005 全称量词与存在量词
  { textbookTopicId: "TB-005", nodeId: "M1-16" },
  { textbookTopicId: "TB-005", nodeId: "M1-17" },
  { textbookTopicId: "TB-005", nodeId: "M1-18" },
  { textbookTopicId: "TB-005", nodeId: "M1-19" },
  // TB-006 等式性质与不等式性质
  { textbookTopicId: "TB-006", nodeId: "M1-20" },
  { textbookTopicId: "TB-006", nodeId: "M1-21" },
  // TB-007 基本不等式
  { textbookTopicId: "TB-007", nodeId: "M1-22" },
  { textbookTopicId: "TB-007", nodeId: "M1-23" },
  { textbookTopicId: "TB-007", nodeId: "M1-33" },
  { textbookTopicId: "TB-007", nodeId: "BG104" },
  // TB-008 一元二次不等式
  { textbookTopicId: "TB-008", nodeId: "M1-24" },
  { textbookTopicId: "TB-008", nodeId: "M1-25" },
  { textbookTopicId: "TB-008", nodeId: "M1-32" },
  { textbookTopicId: "TB-008", nodeId: "BG100" },
  { textbookTopicId: "TB-008", nodeId: "BG101" },
  // TB-009 函数的概念及其表示
  { textbookTopicId: "TB-009", nodeId: "M2a-01" },
  { textbookTopicId: "TB-009", nodeId: "M2a-03" },
  { textbookTopicId: "TB-009", nodeId: "M2a-04" },
  { textbookTopicId: "TB-009", nodeId: "M2a-09" },
  { textbookTopicId: "TB-009", nodeId: "M2a-51" },
  { textbookTopicId: "TB-009", nodeId: "BG103" },
  // TB-010 函数的基本性质
  { textbookTopicId: "TB-010", nodeId: "M2a-13" },
  { textbookTopicId: "TB-010", nodeId: "M2a-17" },
  // TB-011 指数函数
  { textbookTopicId: "TB-011", nodeId: "M2a-32" },
  { textbookTopicId: "TB-011", nodeId: "M2a-33" },
  // TB-012 对数
  { textbookTopicId: "TB-012", nodeId: "M2a-38" },
  // TB-013 对数函数
  { textbookTopicId: "TB-013", nodeId: "M2a-42" },
  // TB-014 函数的应用（零点）
  { textbookTopicId: "TB-014", nodeId: "M2a-48" },
  { textbookTopicId: "TB-014", nodeId: "M2a-49" },
  // TB-015 复数的概念
  { textbookTopicId: "TB-015", nodeId: "M1-26" },
  { textbookTopicId: "TB-015", nodeId: "M1-27" },
  { textbookTopicId: "TB-015", nodeId: "M1-28" },
  // TB-016 复数的四则运算
  { textbookTopicId: "TB-016", nodeId: "M1-29" },
  { textbookTopicId: "TB-016", nodeId: "M1-30" },
];
// 合计：16 topics + 48 mappings
```

### 3.6 AI 双输出策略

**v1 双输出**：AI 同时返回 `textbookTopicCandidates` 和 `knowledgeNodeCandidates`。

- 用户侧（汇总列表、手动挂分类下拉框）默认展示 TextbookTopic
- 系统内部（知识地图、诊断引擎）用 KnowledgeNode
- 两者通过 TextbookNodeMapping 连接
- 高置信自动挂两层：
  - CaseKnowledgeTag 写 nodeId（source="vlm"）
  - CaseTextbookTopicTag 写 textbookTopicId（source="vlm"）
  - CaseAiResult 写 textbookTopicId（最高置信候选）

---

## 4. Case Analyzer JSON Schema（修订）

### 4.1 新 JSON 结构（7 字段）

```json
{
  "transcript": "",
  "questionSummary": "",
  "textbookTopicCandidates": [
    { "topicId": "TB-010", "confidence": 0.85, "reason": "题目涉及函数单调性判断" }
  ],
  "knowledgeNodeCandidates": [
    { "nodeId": "M2a-13", "confidence": 0.85, "reason": "题目涉及用定义判断单调性" }
  ],
  "initialFeedback": "",
  "possibleMistakeReason": "",
  "nextActionSuggestion": ""
}
```

### 4.2 字段说明

| 字段 | 类型 | 说明 | v1 持久化 |
|------|------|------|:---------:|
| transcript | string | 转写文字（无音频为空） | ✅ → Artifact + CaseAiResult |
| questionSummary | string | AI 一句话题目摘要 | ✅ → CaseAiResult |
| textbookTopicCandidates | array | 课本分类候选（0-3 个） | ✅ 高置信 → CaseAiResult + CaseTextbookTopicTag |
| knowledgeNodeCandidates | array | 系统节点候选（0-3 个） | ✅ 高置信 → CaseKnowledgeTag |
| initialFeedback | string | 鼓励文案 | ✅ → CaseAiResult |
| possibleMistakeReason | string | 可能的错因提示（不诊断） | ✅ → CaseAiResult |
| nextActionSuggestion | string | 建议下一步（复看课本章节+小动作，不承诺视频链接） | ✅ → CaseAiResult |

### 4.3 提示词（修订）

```
你是高中数学错题采集助手。请看这道数学题的图片{若有音频则为学生口述思路}, 返回结构化 JSON。

【你的任务】
1. 如果有音频，转写学生语音为 transcript（口语，保留"嗯/然后"等）。无音频则 transcript 留空字符串。
2. 用一句话概括题目大意 questionSummary（若公式看不清就描述可见部分，不要编造）。
3. 从下面的课本章节清单里选出最多 3 个相关分类 textbookTopicCandidates，禁止发明清单外的 topicId：
<TextbookTopic 列表动态注入>
   每个给 confidence(0~1) 和一句 reason。
4. 从下面的系统知识点清单里选出最多 3 个相关知识点 knowledgeNodeCandidates，禁止发明清单外的 nodeId：
<48 节点列表动态注入>
   每个给 confidence(0~1) 和一句 reason。
5. 给一句温和、鼓励式的 initialFeedback（面向学生，不透露答案对错，不批评）。
6. possibleMistakeReason：如果从图片或音频中能看到明显的错误痕迹，用一句话提示可能的方向（如"可能在符号变换时出了差错"）。不确定则留空。不做诊断，不给确定性结论。
7. nextActionSuggestion：给一句具体的下一步建议，格式为"回看 XX 课本章节 + 一个小动作"（如"回看 2.3 一元二次不等式，重点检查移项后不等号方向"）。**不要写"看视频"**——v1 没有资源库，不承诺视频链接。不确定则留空。

【纪律】
- 只做"大致属于哪几个知识点"的判断，不做深度归因
- 不解题、不给答案
- topicId 必须从课本章节清单中选，不能自创
- nodeId 必须从系统知识点清单中选，不能自创
- 如果图片不清晰或不是数学题，textbookTopicCandidates 和 knowledgeNodeCandidates 都返回空数组
- possibleMistakeReason 不做确定性诊断，用"可能""也许"等措辞
- 严禁使用"诊断""薄弱""掌握""得分"等词汇

【输出格式（严格 JSON，不要 markdown 代码块）】
{
  "transcript": "",
  "questionSummary": "",
  "textbookTopicCandidates": [{"topicId": "TB-010", "confidence": 0.85, "reason": "题目涉及函数单调性判断"}],
  "knowledgeNodeCandidates": [{"nodeId": "M2a-13", "confidence": 0.85, "reason": "题目涉及用定义判断单调性"}],
  "initialFeedback": "",
  "possibleMistakeReason": "",
  "nextActionSuggestion": ""
}
```

### 4.4 Zod Schema

```typescript
const TextbookCandidateSchema = z.object({
  topicId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const NodeCandidateSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const CaseAnalyzerSchema = z.object({
  transcript: z.string(),
  questionSummary: z.string(),
  textbookTopicCandidates: z.array(TextbookCandidateSchema).max(3),
  knowledgeNodeCandidates: z.array(NodeCandidateSchema).max(3),
  initialFeedback: z.string(),
  possibleMistakeReason: z.string(),
  nextActionSuggestion: z.string(),
});
```

### 4.5 lib 接口

```typescript
export interface CaseAnalyzerInput {
  imageDataUrl: string;
  audioBase64?: string;
  audioFormat?: string;
  nodes: { id: string; name: string }[];
  textbookTopics: { id: string; name: string; chapter: string; section: string }[];
}

export interface TextbookCandidate {
  topicId: string;
  confidence: number;
  reason: string;
}

export interface CaseAnalyzerResult {
  transcript: string;
  questionSummary: string;
  textbookTopicCandidates: TextbookCandidate[];
  knowledgeNodeCandidates: CaseAnalyzerCandidate[];
  initialFeedback: string;
  possibleMistakeReason: string;
  nextActionSuggestion: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}
```

---

## 5. 页面信息架构

### 5.1 知识地图页 IA 重构

**当前**：
```
/nana/knowledge-map
  ├─ 图谱/列表 切换（segControl）
  └─ "最近拍过" 浮层入口按钮（角落，不显眼）
```

**修订为**：
```
/nana/knowledge-map
  ├─ 顶部三 tab（平级）
  │   ├─ "题目汇总"（默认 tab，手机端默认打开）
  │   ├─ "图谱"
  │   └─ "列表"
  └─ 各 tab 内容
      ├─ 题目汇总：按课本章节分组的错题卡片列表
      ├─ 图谱：现有 KnowledgeMapCanvas
      └─ 列表：现有 KnowledgeMapListView
```

### 5.2 手机端默认视图

**手机和桌面都默认进"题目汇总"**

理由：
1. 第一阶段用户批量拍题后，最想看的是"我拍了哪些题、按什么类分好了"
2. 抽象图谱对基础薄弱的孩子认知负荷太高
3. 题目汇总直接展示 AI 整理结果，信任建立更快
4. 图谱作为"看整体情况"的次级视图，需要时再切
5. 桌面端同样默认"题目汇总"——核心价值是"我拍的题被整理好了"，而非图谱
6. 图谱是第二视图，手机和桌面一致

### 5.3 "题目汇总"列表设计

**主卡默认展示（复习视角，不展示原图和时间等弱信息）**：

```
题目汇总
├─ 按课本章节分组（TextbookTopic.chapter → section）
│   ├─ 第一章 集合与常用逻辑用语
│   │   ├─ 1.1 集合的概念（3 道）
│   │   │   └─ 主卡：课本分类 + AI 摘要 + AI 想对你说 + 下一步可以 + [展开看原题] [改分类]
│   │   └─ 1.3 集合的基本运算（1 道）
│   │       └─ ...
│   └─ 第三章 函数概念与性质
│       └─ 3.2 函数的基本性质（2 道）
│           └─ ...
├─ 未分类/暂未覆盖（textbookTopicId 为空，或题目属于当前 48 节点未覆盖的章节）
│   └─ 分组提示："这类题还没放进当前知识地图，先帮你收在这里。"
│   └─ ...
└─ 打印/导出按钮
```

**主卡默认展示字段（从孩子复习视角重排）**：

| 序号 | 展示项 | 说明 |
|------|--------|------|
| 1 | 课本章节/分类 | 这题属于哪章哪节 |
| 2 | AI 摘要 | 这题大概在问什么 |
| 3 | AI 想对你说 | 轻反馈（鼓励） |
| 4 | 下一步可以 | 回看章节 + 一个检查动作 |
| 5 | 操作按钮 | [展开看原题] / [改分类] |

**展开后展示（辅助信息，懒加载）**：

| 展示项 | 说明 |
|--------|------|
| 原题图 | 懒加载，点"展开看原题"才请求 |
| 有语音记录标记 | 🎙 图标 |
| 转写内容 | 如有 |
| 拍摄时间 | Case.createdAt |
| 整理时间 | CaseAiResult.updatedAt |
| AI 候选分类及置信度 | 如需要 |
| 修改摘要入口 | [编辑] |

**空值隐藏规则**：
- `possibleMistakeReason` 为空 → **不展示"可能的方向"区块**
- `nextActionSuggestion` 为空 → **不展示"下一步可以"区块**
- 原图**不得在汇总列表接口中返回 base64**，只能详情懒加载

### 5.4 每道题卡展示项

**主卡默认展示（v1 修订：从复习视角重排，不展示原图和时间）**：

| 展示项 | 数据来源 | v1 |
|--------|----------|:--:|
| 课本分类 | CaseAiResult.textbookTopicId → TextbookTopic.name | ✅ |
| AI 摘要 | CaseAiResult.questionSummary | ✅ |
| AI 想对你说 | CaseAiResult.initialFeedback | ✅ |
| 下一步可以 | CaseAiResult.nextActionSuggestion | ✅ |
| [展开看原题] 按钮 | 点击后懒加载原图 | ✅ |
| [改分类] 按钮 | 点击 → 弹出 TextbookTopic 选择器 | ✅ |

**展开后展示（辅助信息）**：

| 展示项 | 数据来源 | v1 |
|--------|----------|:--:|
| 原题图 | Artifact(question_image)，懒加载 | ✅ |
| 可能的方向 | CaseAiResult.possibleMistakeReason（空时隐藏） | ✅ |
| 有语音记录标记 | CaseAiResult.transcript 非空 → 🎙 | ✅ |
| 转写内容 | CaseAiResult.transcript | ✅ |
| 拍摄时间 | Case.createdAt | ✅ |
| 整理时间 | CaseAiResult.updatedAt | ✅ |
| AI 候选角标 | "AI 候选" / "手动" | ✅ |
| 修改摘要入口 | [编辑] → 编辑 questionSummary | ✅ |

> **设计理由**：主卡是孩子复习时一眼扫过的列表，不应被原图和时间等弱信息干扰。原图懒加载也减少列表 API 负载。展开后才是完整信息，供需要细看时使用。

### 5.5 图谱模式

图谱模式不删除，但：
- 从默认视图降为三 tab 之一
- 图谱中节点的"收过题"琥珀色反馈保留
- 图谱仍展示 48 个 KnowledgeNode（不展示 TextbookTopic）

---

## 6. 拍图识别与纠错

### 6.1 展示 AI 识别结果（文案修订）

拍题保存后 → /process 返回 → 采集页展示：

```
┌──────────────────────────────┐
│ [题图预览]                     │
│                              │
│ AI 摘要：                     │
│ "已知函数f(x)=a-2/(2^x+1)..."  │ ← questionSummary
│ [编辑]                        │ ← 用户可纠错
│                              │
│ 可能属于：函数的基本性质        │ ← textbookTopic
│ [改分类]                      │ ← 用户可修正
│                              │
│ AI 想对你说：                  │
│ "你在这道题上写了很详细的推导…"  │ ← initialFeedback
│                              │
│ 可能的方向：                   │
│ "可能在符号变换时出了差错"       │ ← possibleMistakeReason
│                              │
│ 下一步：                      │
│ "回看 3.2 函数的基本性质，     │ ← nextActionSuggestion
└──────────────────────────────┘
```

### 6.2 UI 文案对照（评审反馈 4）

| 场景 | 旧文案（废弃） | 新文案（v1） | 说明 |
|------|--------------|-------------|------|
| AI 摘要标签 | "AI 看到的题目：" | **"AI 摘要："** | 不说"识别出" |
| AI 摘要为空 | "这道题不太好概括" | **"这题不太好概括，可以自己写一句"** | 给出路 |
| AI 摘要替代说法 | — | **"这题大概在问"** | 另一种友好说法 |
| 用户纠错后 | "已更新" | **"已更新"** | 不变 |
| 题目汇总标签 | — | **"AI 摘要"** | 汇总页题卡标签 |

> **核心原则**：v1 只有 questionSummary（一句话摘要），不是完整 OCR，所以 UI 绝不写"识别出的题目""AI 看到的题目""题目原文"等暗示完整识别的措辞。统一用"AI 摘要"或"这题大概在问"。

### 6.3 用户纠错落库

**编辑 questionSummary**：
- 用户点击"编辑" → 文本框可编辑 → 保存
- 落库：`CaseAiResult.questionSummary = 新文本`, `questionSummaryEdited = true`
- 原始 AI 生成的不保留历史（v1 只存最新版）

**修正课本分类**：
- 用户点击"改分类" → 弹出 TextbookTopic 选择器（按 chapter 分组）
- 落库：`CaseAiResult.textbookTopicId = 新ID`, `textbookTopicEdited = true`
- 同时写一条 `CaseTextbookTopicTag(source="manual", textbookTopicId=新ID)`

---

## 7. 持久化策略

### 7.1 落库矩阵

| 数据 | v1 持久化 | 存储位置 |
|------|:---------:|----------|
| transcript | ✅ | Artifact.content + CaseAiResult.transcript |
| questionSummary | ✅ | CaseAiResult.questionSummary |
| initialFeedback | ✅ | CaseAiResult.initialFeedback |
| possibleMistakeReason | ✅ | CaseAiResult.possibleMistakeReason |
| nextActionSuggestion | ✅ | CaseAiResult.nextActionSuggestion |
| knowledgeNodeCandidates (≥0.5) | ✅ | CaseKnowledgeTag(source="vlm") |
| knowledgeNodeCandidates (<0.5) | ❌ | — |
| textbookTopicCandidates (≥0.5) | ✅ | CaseAiResult.textbookTopicId + CaseTextbookTopicTag(source="vlm") |
| textbookTopicCandidates (<0.5) | ❌ | — |
| token usage | ✅ | CaseAiResult.tokenUsage（JSON） |

### 7.2 CaseAiResult 写入时机

```
/process 端点执行流程：
1. Case Analyzer 调用成功
2. upsert CaseAiResult（caseId 关联）：
   - questionSummary = result.questionSummary
   - transcript = result.transcript（非空时）
   - textbookTopicId = 最高置信候选（≥0.5 时）
   - textbookTopicConfidence = 对应置信度
   - initialFeedback = result.initialFeedback
   - possibleMistakeReason = result.possibleMistakeReason
   - nextActionSuggestion = result.nextActionSuggestion
   - audioStatus = 推导
   - processingStatus = "success"
3. transcript 回写 Artifact（同 v3 原版逻辑）
4. knowledgeNodeCandidates (≥0.5) → upsert CaseKnowledgeTag(source="vlm")
5. textbookTopicCandidates (≥0.5) → upsert CaseTextbookTopicTag(source="vlm", textbookTopicId=...)
```

### 7.3 重复 /process 处理

- CaseAiResult 是 upsert（caseId @unique），重复调覆盖最新结果
- CaseKnowledgeTag upsert（同 v3 原版）
- CaseTextbookTopicTag upsert
- `questionSummaryEdited = true` 的记录被覆盖时，用户编辑内容丢失 → **v1 限制**：如果 `questionSummaryEdited === true`，不覆盖 questionSummary 字段
- `textbookTopicEdited === true` 时同理

---

## 8. 打印/导出汇总

### 8.1 v1 方案：浏览器打印样式

**不引入 PDF 库**，用 CSS `@media print` + `window.print()` 实现。

### 8.2 入口

| 端 | 入口 |
|----|------|
| 手机端 | 题目汇总页右上角"打印"按钮 → 跳转 `/nana/print-preview` |
| 桌面端 | 同上，或直接 `Ctrl+P` |

### 8.3 打印内容

**v1 修订：从孩子复习视角重排，不是后台日志。**

默认打印展示：

| 序号 | 展示项 | 说明 |
|------|--------|------|
| 1 | 课本章节 | 分组标题 |
| 2 | AI 摘要 | 这题大概在问什么 |
| 3 | 原题图缩略图 | 保留（v1 没有完整 OCR，原图是重要参考），但缩略、弱化，不占太大空间 |
| 4 | AI 想对你说 | 轻反馈 |
| 5 | 下一步可以 | 回看章节 + 检查动作 |

默认不打印或弱化：

| 展示项 | 处理 |
|--------|------|
| 拍摄时间 | 不打印 |
| 整理时间 | 不打印 |
| 置信度 | 不打印 |
| source（vlm/manual） | 不打印 |
| 是否有语音记录 | 不打印 |
| 技术状态字段 | 不打印 |
| 转写内容 | 不打印（太长，复习不需要） |

```
我的错题汇总 — 按课本章节整理
生成时间：2026-07-05

第一章 集合与常用逻辑用语
─────────────────────────────
1.1 集合的概念

  ┌─────────┐  AI 摘要：已知集合A={1,2,3}...
  │ [题图]   │  AI 想对你说：你很仔细地列举了...
  └─────────┘  下一步：回看 1.1 集合的概念，检查元素互异性

3.2 函数的基本性质

  ┌─────────┐  AI 摘要：判断f(x)=x²-2x...
  │ [题图]   │  AI 想对你说：这道题你尝试了...
  └─────────┘  下一步：回看 3.2 函数的基本性质，重点检查单调性判断步骤
```

> **设计理由**：打印页是给孩子复习用的，不是后台日志。技术元信息（时间、置信度、source）对孩子复习没有价值，反而干扰。原图保留是因为 v1 没有完整 OCR，题图是重要参考。

### 8.4 打印样式规则

- `@media print`：隐藏所有交互按钮（编辑/改分类/展开看原题）
- 题图缩略图 `max-width: 180px; max-height: 120px; object-fit: contain;`（缩略弱化，足够辨认题面又不会撑爆复习清单）
- 字号适配 A4 纸
- 分页：按课本章节分组，**不强制每章分页**（A4 省纸）；章节标题 `break-after: avoid`；题卡 `page-break-inside: avoid`（尽量不跨页）
- 未分类/暂未覆盖题放最后
- `possibleMistakeReason` / `nextActionSuggestion` 为空时打印页也隐藏对应行
- **不打印**：拍摄时间、整理时间、置信度、source、转写内容、技术状态字段

### 8.5 v1 不做

- ❌ PDF 生成（浏览器打印另存为 PDF 够用）
- ❌ 模板自定义
- ❌ 选择性打印（v1 全部打印，v2 加勾选）
- ❌ "简洁版/带题图版"切换（v2 候选）

---

## 9. AI 反馈边界

### 9.1 产品边界

| 能力 | v1 | 说明 |
|------|:--:|------|
| 题目摘要 | ✅ | AI 看懂了题 |
| 课本分类 | ✅ | 大致属于哪章哪节 |
| 轻反馈 | ✅ | 鼓励 + 可能方向 |
| 完整解题步骤 | ❌ | 不做，避免误导 |
| 答案 | ❌ | 不做 |
| 深度归因 | ❌ | 不做 |

### 9.2 轻反馈字段定义

| 字段 | 说明 | 文案示例 |
|------|------|---------|
| initialFeedback | 鼓励文案，面向学生 | "你在这道题上写了很详细的推导过程，这个习惯很好。" |
| possibleMistakeReason | 可能的错因方向（不诊断） | "可能在符号变换时出了差错，可以检查一下这一步。" |
| nextActionSuggestion | 建议下一步 | "回看 2.3 一元二次不等式，重点检查移项后不等号方向。" |

### 9.3 严禁输出

- ❌ "你掌握了XXX" / "你没掌握XXX"
- ❌ "这道题你做对了/做错了"
- ❌ "你的薄弱点是XXX"
- ❌ "得分：XX分"
- ❌ "已诊断：XXX"
- ❌ 严禁输出视频链接或"看视频"建议（v1 没有资源库）
- ❌ 完整解题步骤和答案

---

## 10. 前端状态与文案

### 10.1 采集页状态机（v1 异步整理修订）

**v1 确认：异步整理**。保存成功后显示"正在整理"，但允许继续拍下一道。题目汇总里显示"整理中/已整理/整理失败"。

```
idle
  → saving (POST /cases)
  → saved (201，caseId 返回)
    ├─ 显示"正在整理这题…"，同时显示 [再拍一道] [去题目汇总]
    │   ↑ 允许用户不等整理完就走，整理在后台继续
    │
    → processing (后台调 POST /cases/:id/process，前端轮询 3s 间隔，最多 60s)
    → processed (轮询收到结果，或题目汇总里刷新看到)
      ├─ success + 有摘要 + 有分类 → "整理好了 · 可能属于：函数的基本性质"
      │   └─ 展示 AI 摘要 + 课本分类 + 轻反馈 + [编辑] + [改分类]
      │   └─ possibleMistakeReason 非空时展示"可能的方向"，为空时隐藏区块
      │   └─ nextActionSuggestion 非空时展示"下一步"，为空时隐藏区块
      ├─ success + 有摘要 + 无分类 → "整理好了，但不太好分类，可以手动选"
      ├─ success + 无摘要 + 有分类 → "可能属于：XXX"（AI 没看懂题面但判断了分类）
      ├─ success + 都无 → "整理好了，但不太好分类，可以手动整理"
      ├─ failed → "识别没接上，可以手动整理"
      └─ timeout → "整理花的时间有点久，可以稍后在题目汇总里看"
          ↑ 超 60s 触发，不让孩子盯着 spinner
  → error
```

**题目汇总页每题卡状态标记**：
| processingStatus | 展示 |
|------------------|------|
| pending | "整理中…" |
| success | 不显示（正常展示 AI 结果） |
| failed | "整理没接上，可以手动整理" |
| timeout | "整理花的时间有点久，可以稍后回看" |

### 10.2 UI 文案（守 OPS §4）

| 状态 | 文案 |
|------|------|
| processing | "正在整理这题…" |
| processing + 用户可离开 | 显示 [再拍一道] [去题目汇总] |
| success + 摘要 + 分类 | "整理好了 · 可能属于：XXX" |
| success + 摘要 + 无分类 | "整理好了，但不太好分类，可以手动选" |
| success + 无摘要 + 分类 | "可能属于：XXX" |
| success + 都无 | "整理好了，但不太好分类，可以手动整理" |
| failed | "识别没接上，可以手动整理" |
| timeout | "整理花的时间有点久，可以稍后在题目汇总里看" |
| 用户纠错后 | "已更新" |

**轮询规则**：3 秒间隔，最多 60 秒（约 20 次）。超 60 秒显示 timeout 文案，不再轮询。

### 10.3 题目汇总页文案

| 元素 | 文案 |
|------|------|
| 页面标题 | "题目汇总" |
| 分组标题 | "第一章 集合与常用逻辑用语" / "未分类/暂未覆盖" |
| 题卡摘要标签 | "AI 摘要" |
| 题卡分类标签 | "课本分类" |
| 题卡反馈标签 | "AI 想对你说" |
| 题卡错因标签 | "可能的方向" |
| 题卡建议标签 | "下一步" |
| 题卡整理状态 | "整理中…" / 不显示（已整理）/ "整理没接上" |
| 题卡时间 | "拍摄于 7月3日" |
| 有转写标记 | "有语音记录" 图标 |
| 无转写标记 | 不显示 |
| 打印按钮 | "打印/导出" |

---

## 11. /process 端点

### 11.1 端点契约

```
POST /api/nana/cases/:id/process

响应 (200):
{
  status: "success" | "failed" | "timeout",
  audioStatus: "success" | "skipped" | "failed" | "timeout",
  questionSummary?: string,
  textbookTopic?: { id, name, confidence },
  feedback?: string,
  possibleMistakeReason?: string,
  nextActionSuggestion?: string,
  transcript?: string,
  tags: CaseKnowledgeTag[],
  textbookTopicCandidates?: TextbookCandidate[],
  knowledgeNodeCandidates?: CaseAnalyzerCandidate[],
  error?: string,
}
```

### 11.2 落库流程

```typescript
// /process 成功后：
// 1. upsert CaseAiResult
await prisma.caseAiResult.upsert({
  where: { caseId: id },
  create: {
    caseId: id,
    questionSummary: result.questionSummary,
    transcript: result.transcript || null,
    textbookTopicId: topTopic?.topicId,
    textbookTopicConfidence: topTopic?.confidence ?? 0,
    initialFeedback: result.initialFeedback,
    possibleMistakeReason: result.possibleMistakeReason,
    nextActionSuggestion: result.nextActionSuggestion,
    audioStatus: audioSkipped ? "skipped" : "success",
    processingStatus: "success",
    tokenUsage: result.usage ? JSON.stringify(result.usage) : null,
  },
  update: {
    // 如果用户已纠错 questionSummary，不覆盖该字段
    questionSummary: existing?.questionSummaryEdited
      ? existing.questionSummary
      : result.questionSummary,
    questionSummaryEdited: existing?.questionSummaryEdited ?? false,
    transcript: result.transcript || null,
    textbookTopicId: existing?.textbookTopicEdited
      ? existing.textbookTopicId
      : topTopic?.topicId,
    textbookTopicEdited: existing?.textbookTopicEdited ?? false,
    initialFeedback: result.initialFeedback,
    possibleMistakeReason: result.possibleMistakeReason,
    nextActionSuggestion: result.nextActionSuggestion,
    audioStatus: audioSkipped ? "skipped" : "success",
    processingStatus: "success",
    tokenUsage: result.usage ? JSON.stringify(result.usage) : null,
  },
});

// 2. transcript 回写 Artifact（同 v3 原版）
// 3. CaseKnowledgeTag upsert（nodeId，不加 textbookTopicId）
// 4. CaseTextbookTopicTag upsert（textbookTopicId）
```

---

## 12. 测试方案

### 12.1 测试分层

| 层级 | 范围 | 工具 | CI |
|------|------|------|:--:|
| 单元测试 | case-analyzer.ts（7 字段 JSON 解析） | vitest + mock | ✅ |
| 单元测试 | TextbookTopic 映射逻辑 | vitest | ✅ |
| 集成测试 | /process 端点（CaseAiResult 持久化） | vitest + mock | ✅ |
| 集成测试 | 题目汇总列表 API | vitest + mock | ✅ |
| 集成测试 | 用户纠错 → CaseAiResult 更新 | vitest + mock | ✅ |
| Smoke test | 真实 provider 端到端 | 手动脚本 | ❌ |

### 12.2 关键测试用例

```typescript
// case-analyzer.test.ts 新增：
// 11. textbookTopicCandidates 解析 + topicId 白名单过滤
// 12. questionSummary 非空返回
// 13. possibleMistakeReason 可为空字符串
// 14. nextActionSuggestion 可为空字符串，非空时有内容
// 15. AI 返回清单外 topicId → 代码层过滤掉，不落库

// process-api.test.ts 新增：
// 11. CaseAiResult 持久化：questionSummary + textbookTopicId + feedback + nextActionSuggestion
// 12. 重复 /process：用户纠错的 questionSummary 不被覆盖
// 13. 重复 /process：用户修正的 textbookTopicId 不被覆盖
// 14. CaseTextbookTopicTag 写入（高置信 vlm）
// 15. CaseKnowledgeTag 不含 textbookTopicId（确认未扩展）
// 16. CaseTextbookTopicTag.source 只接受 manual/vlm，非法值拒绝
// 17. CaseAiResult.textbookTopicId FK 约束：写入不存在的 topicId 时拒绝
// 18. CaseAiResult 持久化包含 nextActionSuggestion 字段

// case-summary-api.test.ts 新增：
// 1. 按课本章节分组返回
// 2. 未分类 case 放最后
// 3. 每题包含 questionSummary + textbookTopic + feedback + 时间
// 4. 未覆盖章节的 case 归入"未分类/暂未覆盖"分组
```

### 12.3 CI 规则

- 真实 provider **不进 CI**（同 v3 原版）
- CI 只跑 mock 测试
- DATABASE_URL 白名单不变

---

## 13. v1 验收标准

| # | 验收项 | 操作步骤 | 预期结果 |
|---|--------|----------|----------|
| 1 | 拍题后保存成功 | 拍题 → 收好 → 等待 | "正在收…" → caseId 返回 |
| 2 | AI 返回题目摘要 | 等 /process 完成 | 显示 "AI 摘要：…" |
| 3 | AI 返回课本分类 | 等 /process 完成 | 显示 "可能属于：XXX"（课本章节名） |
| 4 | AI 返回系统节点候选 | 查 CaseKnowledgeTag | source="vlm" 记录存在 |
| 5 | 高置信自动挂载 | confidence ≥ 0.5 | CaseKnowledgeTag + CaseTextbookTopicTag + CaseAiResult 持久化 |
| 6 | 低置信提示人工确认 | confidence < 0.5 | 不自动挂，即时返回候选 |
| 7 | 历史题汇总能看到这道题 | 题目汇总页 | 题卡显示在对应课本章节分组下 |
| 8 | 汇总按课本章节分组 | 题目汇总页 | 按 TextbookTopic.chapter 分组 |
| 9 | 每题能看到完整信息 | 题目汇总页题卡展开 | 主卡显示分类+摘要+反馈+下一步；展开后显示题图+时间+标签 |
| 10 | 用户能手动修正课本分类 | 点"改分类" → 选新分类 | CaseAiResult.textbookTopicId + CaseTextbookTopicTag 更新 |
| 11 | 用户能编辑题面摘要 | 点"编辑" → 改文字 → 保存 | CaseAiResult.questionSummary 更新 |
| 12 | 知识地图仍保留系统节点 | 知识地图 → 图谱 | 48 节点不变，不因拍题变绿 |
| 13 | 可打印/导出汇总 | 题目汇总 → 打印 | 浏览器打印样式按章节分组 |
| 14 | 失败/超时有诚实文案 | mock 报错 → /process | "识别没接上，可以手动整理" |
| 15 | 音频 skipped 有文案 | webm 录音 → /process | "语音暂未转写" |
| 16 | 用户纠错不被覆盖 | 纠错后重试 /process | 用户编辑的 questionSummary 保留 |
| 17 | CaseKnowledgeTag 未扩展 | 查 schema | 无 textbookTopicId 字段 |
| 18 | CaseTextbookTopicTag.source 只允许 manual/vlm | 尝试写入非法 source | 代码层拒绝 |
| 19 | CaseAiResult.textbookTopicId 有 FK 约束 | 写入不存在的 topicId | 数据库拒绝 |
| 20 | 未覆盖章节归入未分类 | 拍一道当前 48 节点覆盖外的题 | 题目汇总页显示在"未分类/暂未覆盖" |
| 21 | 真实 provider 不进 CI | CI 日志 | 只跑 mock |
| 22 | 批量拍题不被 AI 整理阻塞 | 连续拍 3 道题，每道保存后立即拍下一道 | 每道保存后 ≤2s 即可继续拍，不等 AI 整理完成；3 道题的整理状态在题目汇总页分别可见 |
| 23 | 整理三态在题目汇总可见 | 拍题后进入题目汇总页 | 整理中显示"整理中…"；已整理显示 AI 结果；整理失败显示"整理没接上，可以手动整理" |

### 构建验收

- [ ] `npm.cmd run build` 通过
- [ ] 单元测试全部通过
- [ ] `prisma migrate dev --create-only` 生成 migration SQL（仅生成，交用户确认）
- [ ] 用户确认后执行 `prisma migrate dev`（执行 migration）
- [ ] `git status` 干净

---

## 14. 文件变更清单

> **Round UI-0 排查后更新**（2026-07-05）：标注排查发现的风险等级调整和新文件。

| 文件 | 操作 | 说明 | 风险 |
|------|------|------|:--:|
| `prisma/schema.prisma` | **修改（⚠️新增表）** | 新增 4 表 + Case 加 relation | 中 |
| `prisma/seed_textbook_topics.ts` | **新增** | TextbookTopic 种子数据（16 topics + 48 mappings） | 低 |
| `src/lib/nana/case-analyzer.ts` | **新增** | 一体化 Case Analyzer（6 字段） | 低 |
| `src/app/api/nana/cases/[id]/process/route.ts` | **新增** | POST 触发整理 + GET 查询状态（轮询用） | 中 |
| `src/app/api/nana/cases/[id]/ai-result/route.ts` | **新增** | GET/PATCH AI 结果（用户纠错用） | 低 |
| `src/app/api/nana/cases/summary/route.ts` | **新增** | 题目汇总列表 API（按课本章节分组，轻量字段） | 中 |
| `src/app/api/nana/cases/route.ts` | **修改** | GET 列表扩展返回 aiSummary/textbookChapter/processStatus | 中 |
| `src/app/api/diagnosis/map/route.ts` | **修改** | caseEvidenceCount 改 distinct caseId | 低 |
| `src/app/nana/page.tsx` | **修改** | 首页文案微调（"拍题"/"题目汇总"） | 低 |
| `src/app/nana/knowledge-map/page.tsx` | **修改** | 三 tab IA 重构（默认题目汇总） | 中 |
| `src/components/nana/knowledge-map/case-summary-view.tsx` | **新增** | 题目汇总视图组件 | 中 |
| `src/components/nana/knowledge-map/case-card.tsx` | **新增** | 题卡组件（主卡+展开，非横向小卡） | 高 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | **修改** | 主卡重排：横向小卡→纵向大卡+展开 | 高 |
| `src/app/nana/capture/page.tsx` | **修改** | 状态机重写：同步停留→异步整理+轮询 | 高 |
| `src/components/nana/capture/ai-result-panel.tsx` | **新增** | AI 结果展示+纠错面板（5 字段+空值隐藏） | 中 |
| `src/components/nana/capture/light-feedback.tsx` | **不改** | 保留不动，不扩展（排查结论 2） | — |
| `src/lib/nana/nana-api-client.ts` | **修改** | 加 processCase / getProcessStatus / getAiResult / getSummary | 低 |
| `src/app/nana/print-preview/page.tsx` | **新增** | Nana 专用打印预览页（不复用上游，排查结论 1） | 高 |
| `src/app/print-preview/page.tsx` | **不改** | 上游打印页保留不动，不混用 | — |
| `.env.example` | **修改（⚠️上游文件）** | 追加 VOLCENGINE_* | 低 |
| `src/__tests__/unit/nana/case-analyzer.test.ts` | **新增** | mock 测试 | 低 |
| `src/__tests__/integration/nana/process-api.test.ts` | **新增** | 集成测试 | 低 |
| `src/__tests__/integration/nana/case-summary-api.test.ts` | **新增** | 汇总 API 测试 | 低 |

> **涉及 Prisma schema 结构改动**（新增 4 表 + Case 加 relation 声明）。
> **不扩展 CaseKnowledgeTag**（保持原样）。
> **涉及上游文件修改**：`.env.example` 追加。
> **不修改上游已有 model 的字段**。
> **Round UI-0 排查新增风险标注**：题目汇总主卡重排（高）、拍题页状态机重写（高）、打印预览新建（高）为三个最高风险项。

---

## 14.5 Round UI-0 / 前端修改点排查

> **目的**：execute-agent 开始写代码前，必须先对照手机端线性流程图（见产品手册），排查现有前端修改点，输出排查清单。**这一步只排查不写代码。**
>
> **触发条件**：Round 0 审计通过后、Round 1 开始前。
> **产出物**：一份前端修改点排查文档（存 `doc/executionlog/`），列出每个页面的现有代码位置、需要改什么、哪些可复用、哪些需新增。
> **门禁**：排查清单交用户确认后，才能进入 Round 1-5 的前端开发。

### 14.5.1 排查范围（7 个维度）

#### 1. 首页入口

| 排查项 | 检查内容 |
|--------|---------|
| 三入口文案 | 现有首页卡片文案是否与产品手册一致（"拍题""题目汇总""周末小检查"） |
| 优先级 | 拍题和题目汇总是否排在前两个 |
| 重复入口 | 是否存在重复的"看看知识地图"入口（应合并为"题目汇总"入口） |

#### 2. 拍题页

| 排查项 | 检查内容 |
|--------|---------|
| 保存后状态展示 | 保存成功后显示"正在整理"，但允许继续拍下一道（异步整理已确认） |
| 轮询机制 | 3 秒轮询一次，最多 60 秒；超 60 秒提示"整理花的时间有点久，可以稍后在题目汇总里看" |
| 题目汇总状态标记 | 每题卡需显示整理状态：整理中/已整理/整理失败 |
| 异步整理选项 | **已确认：v1 做异步整理**。保存成功后显示"正在整理"，但允许继续拍下一道；题目汇总里显示"整理中/已整理/整理失败" |

#### 3. AI 结果卡

| 排查项 | 检查内容 |
|--------|---------|
| 采集页展示字段 | 哪些字段在采集页展示（AI 摘要、课本分类、AI 想对你说、可能的方向、下一步可以） |
| 空值隐藏 | 哪些字段为空时隐藏区块（possibleMistakeReason、nextActionSuggestion、aiMessage） |
| 修改摘要/改分类入口 | 编辑和改分类按钮的位置和交互方式 |

#### 4. 知识地图页 IA

| 排查项 | 检查内容 |
|--------|---------|
| 默认 tab | 手机和桌面默认 tab 是否都为"题目汇总" |
| 图谱/列表降级 | 图谱和列表是否降为第二、第三视图（不再是默认） |
| 现有代码 | `knowledge-map/page.tsx` 现有 segControl 结构，改三 tab 的工作量 |

#### 5. 题目汇总

| 排查项 | 检查内容 |
|--------|---------|
| 主卡默认展示 | 主卡默认展示什么（课本分类、AI 摘要、AI 想对你说、下一步可以、操作按钮） |
| 展开后展示 | 展开后展示什么（原题图懒加载、语音标记、转写、时间、修改摘要入口） |
| 原图懒加载 | 原图是否懒加载（列表 API 不返回 base64 题图） |
| 手动改分类入口 | 改分类按钮位置和交互 |
| 现有组件 | 是否有可复用的题卡组件，还是需要全新建 |

#### 6. 打印预览

| 排查项 | 检查内容 |
|--------|---------|
| 默认打印字段 | 默认打印什么（课本章节、AI 摘要、题图缩略图、AI 想对你说、下一步可以） |
| 隐藏字段 | 哪些字段不打印（时间、置信度、source、转写、技术状态） |
| 题图缩略图 | 是否包含原图缩略图（保留但缩略弱化） |
| 现有打印页 | 是否有现有 print-preview 页面可复用 |

#### 7. API/数据依赖

| 排查项 | 检查内容 |
|--------|---------|
| 可复用 API | 哪些现有 API 可复用（`/api/nana/cases` CRUD、`/api/diagnosis/map`） |
| 需新增 API | 哪些需要新增（`/api/nana/cases/summary` 汇总列表、`/api/nana/cases/:id/process`、`/api/nana/cases/:id/ai-result`） |
| 需扩展 API | 哪些需要扩展（`/api/nana/cases` 列表需按课本章节分组返回） |
| **列表 API 性能** | **列表 API 不得返回 base64 题图，原图必须详情懒加载**——这是硬约束 |

### 14.5.2 排查输出格式

```markdown
# 前端修改点排查清单

## 1. 首页入口
- 现有文件：`src/app/nana/page.tsx`
- 现有结构：...
- 需要修改：...
- 可复用：...
- 风险：低/中/高

## 2. 拍题页
...
（依次 7 个维度）
```

### 14.5.3 门禁

- 排查清单完成后交**用户确认**
- 用户确认后才能进入 Round 1-5 前端开发
- 如果排查发现现有代码结构与计划冲突较大，**停下来回 plan-agent 重新评估**

### 14.5.4 排查结论（2026-07-05 完成）

> 排查清单已输出至 `doc/executionlog/round-ui0-frontend-audit.md`，以下为需回填到计划的 6 项结论。

#### 结论 1：打印预览——新建 `/nana/print-preview`，不复用上游

现有 `src/app/print-preview/page.tsx` 基于上游 `error-items` 系统（`ErrorItem` 类型，含 `questionText`/`answerText`/`analysis`/`originalImageUrl` 等字段），与 Nana cases 数据模型（`Case` + `Artifact` base64 题图 + `CaseKnowledgeTag`）完全不同。

**决策**：新建 `src/app/nana/print-preview/page.tsx`，不复用、不修改上游打印页。现有打印页服务于上游错题本功能，不应混用。

#### 结论 2：LightFeedback 不作为既有组件扩展——Stage 3 新建 AI 结果组件

`src/components/nana/capture/light-feedback.tsx` 虽然存在但**从未被拍题页实际使用**（拍题页"帮你整理" tab 是占位文本）。现有组件仅 2 字段（hint + relatedTags），调用规则版 `/feedback` 端点（不调 LLM）。

**决策**：不扩展 `light-feedback.tsx`。Stage 3 新建 `src/components/nana/capture/ai-result-panel.tsx`，从零实现 5 字段展示（aiSummary/textbookChapter/aiMessage/possibleMistakeReason/nextActionSuggestion）+ 空值隐藏 + 编辑/改分类入口。原 `light-feedback.tsx` 保留不动（不删不改），避免破坏潜在引用。

#### 结论 3：列表/summary API 只返回轻量字段——不得返回 base64 原图

现有 `GET /api/nana/cases` 列表仅 select `{ id, createdAt, artifacts: { select: { type } } }`，不返回 content 字段——**此约束已被现有代码满足**。

Stage 3 扩展后的列表/summary API 返回字段明确为：

```typescript
// GET /api/nana/cases（列表）和 GET /api/nana/cases/summary（按章节分组）
{
  id: string,
  createdAt: string,
  hasImage: boolean,
  hasAudio: boolean,
  // Stage 3 新增轻量字段：
  aiSummary: string | null,           // CaseAiResult.questionSummary
  textbookChapter: string | null,     // TextbookTopic.chapter + TextbookTopic.name
  processStatus: "pending" | "processing" | "success" | "failed",
}
```

**硬约束**：列表/summary API 绝不返回 `artifacts.content`（base64 题图）。原图必须通过 `GET /api/nana/cases/:id` 详情懒加载。

#### 结论 4：异步整理状态查询契约

保存 case 后用户可立即继续拍下一道，AI 整理在后台异步进行。状态查询通过以下契约实现：

```
1. POST /api/nana/cases → 201 + { id, ... }
   前端拿到 caseId，后台调 POST /api/nana/cases/:id/process

2. 前端轮询 GET /api/nana/cases/:id/process（3s 间隔，最多 60s）
   返回 { status: "processing" | "success" | "failed" | "timeout" }
   - 收到 success/failed → 停止轮询，更新该题状态
   - 超 60s → 停止轮询，显示 timeout 文案

3. 题目汇总页通过 GET /api/nana/cases/summary 获取每题 processStatus
   - 不依赖轮询，进入页面时一次性加载
   - processStatus = "processing" → 显示"整理中…"
   - processStatus = "success" → 显示 AI 结果
   - processStatus = "failed" → 显示"整理没接上，可以手动整理"

4. AI 结果卡通过 GET /api/nana/cases/:id/ai-result 获取完整 5 字段
   - 仅在 processStatus = "success" 时调用
   - 支持 PATCH /api/nana/cases/:id/ai-result 用户纠错
```

**关键约束**：批量拍题时，每拍一道保存成功后立即允许下一拍，不被 AI 整理（~30s）阻塞。整理状态在题目汇总页和 AI 卡片中通过上述 API 查询。

#### 结论 5：Round 1-5 文件清单和风险等级（更新后）

见 §14 文件变更清单（已更新）和 §15 实施顺序（已更新）。

#### 结论 6：验收标准补充

见 §13 验收标准（已补充 #22 批量拍题不被阻塞 + #23 三态可见）。

---

## 15. 实施顺序

```
Round UI-0: 前端修改点排查（只排查不写代码）
  ├─ 对照手机端线性流程图，逐页排查 7 个维度
  ├─ 输出排查清单 → 存 doc/executionlog/
  └─ ⏸️ 停下来：交用户确认后才能进 Round 0/1

Round 0: Schema SQL + 种子数据草案（前置，不碰任何业务代码）
  ├─ prisma/schema.prisma 新增 4 表 + Case 加 relation
  ├─ npx prisma migrate dev --name stage3_revised_ai_card --create-only
  │   ↑ 只生成 migration SQL，不执行（高危操作守铁律 1）
  ├─ ⏸️ 停下来：把生成的 migration SQL 交用户确认
  │
  │  ─── 审计闸门：Round 0 审计通过前，不写任何业务代码 ───
  │
  ├─ ✅ 用户确认 + 审计通过后：npx prisma migrate dev（执行 migration）
  ├─ prisma/seed_textbook_topics.ts 种子数据（16 topics + 48 mappings）
  │   ↑ 只在 migration 执行成功后才能跑（表必须已存在）
  │   ↑ seed 必须走 Prisma upsert，不能裸 SQL INSERT（updatedAt 无默认值）
  ├─ npx prisma db seed（或 tsx prisma/seed_textbook_topics.ts）
  └─ 验证：npx prisma studio 看到新表有数据

Round 1: Case Analyzer lib + mock 单测（低风险，Round 0 审计通过后才开始）
  ├─ case-analyzer.ts（6 字段 + 双候选）
  ├─ case-analyzer.test.ts
  └─ npm.cmd run build + test

Round 2: /process 端点 + GET 状态查询 + 集成测试（中风险）
  ├─ process/route.ts（POST 触发整理 + GET 查询状态轮询用，CaseAiResult 持久化）
  ├─ ai-result/route.ts（GET/PATCH 纠错）
  ├─ cases/route.ts 修改（GET 列表扩展轻量字段，排查结论 3）
  ├─ map/route.ts 改（distinct caseId）
  └─ process-api.test.ts

Round 3: 题目汇总 API + 视图（高风险——主卡重排）
  ├─ cases/summary/route.ts（轻量字段，不返回 base64）
  ├─ case-summary-view.tsx + case-card.tsx（纵向大卡+展开，非横向小卡）
  ├─ recent-cases-list.tsx 修改（主卡重排：横向小卡→纵向大卡）
  ├─ knowledge-map/page.tsx 三 tab 重构（默认题目汇总）
  └─ case-summary-api.test.ts

Round 4: 采集页异步整理 + AI 结果面板（高风险——状态机重写）
  ├─ capture/page.tsx 状态机重写：同步停留→异步整理+3s/60s 轮询
  ├─ ai-result-panel.tsx（5 字段+空值隐藏+编辑/改分类，排查结论 2）
  ├─ nana-api-client.ts 扩展（processCase/getProcessStatus/getAiResult/getSummary）
  └─ 首页文案微调 page.tsx（低风险，可并入本轮）

Round 5: 打印预览 + .env.example + 验收（高风险——数据源不同）
  ├─ nana/print-preview/page.tsx（Nana 专用，不复用上游，排查结论 1）
  ├─ .env.example 追加
  └─ npm.cmd run build + test
```

> **Round 0 分两步**：先生成 migration SQL（`--create-only`）→ 交用户确认 + 审计通过 → 确认后才执行 migration + 跑 seed。
> **Round 0 边界**：只做 schema 文件 + migration SQL + seed 脚本。不写任何业务代码（case-analyzer / API / 组件）。
> **Round 0 审计通过前不进 Round 1**。v1 范围大，严格按 Round 切，每轮审计/确认后才进下一轮。
> **每个 Round 完成后跑 build + test，确认通过再进下一个。**
> **seed 必须走 Prisma upsert**：migration SQL 中 `updatedAt` 无 DEFAULT，裸 SQL INSERT 会失败，Prisma 自动填 `@updatedAt`。
> **Round UI-0 是前置门禁**：前端修改点排查清单未交用户确认前，不进 Round 3-5 的前端开发。Round 0-2 可并行推进。

---

## 16. Migration SQL（仅生成，不执行）

```sql
-- Migration: stage3_revised_ai_card
-- 日期: 2026-07-05
-- 说明: 新增 4 表（TextbookTopic / TextbookNodeMapping / CaseAiResult / CaseTextbookTopicTag）
--       不扩展 CaseKnowledgeTag
--       Case 表本身不加列（relation FK 在子表侧）

-- 1. TextbookTopic
CREATE TABLE "TextbookTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "TextbookTopic_stage_order_idx" ON "TextbookTopic"("stage", "order");

-- 2. TextbookNodeMapping
CREATE TABLE "TextbookNodeMapping" (
    "textbookTopicId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    PRIMARY KEY ("textbookTopicId", "nodeId"),
    FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic"("id") ON DELETE CASCADE
);
CREATE INDEX "TextbookNodeMapping_nodeId_idx" ON "TextbookNodeMapping"("nodeId");

-- 3. CaseAiResult（textbookTopicId 加 FK 到 TextbookTopic，Nana 自有新表不违反铁律 3）
CREATE TABLE "CaseAiResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL UNIQUE,
    "questionSummary" TEXT,
    "questionSummaryEdited" BOOLEAN NOT NULL DEFAULT 0,
    "transcript" TEXT,
    "textbookTopicId" TEXT,
    "textbookTopicConfidence" REAL NOT NULL DEFAULT 0.0,
    "textbookTopicEdited" BOOLEAN NOT NULL DEFAULT 0,
    "initialFeedback" TEXT,
    "possibleMistakeReason" TEXT,
    "nextActionSuggestion" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'skipped',
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "tokenUsage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE,
    FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic"("id") ON DELETE SET NULL
);
CREATE INDEX "CaseAiResult_textbookTopicId_idx" ON "CaseAiResult"("textbookTopicId");

-- 4. CaseTextbookTopicTag
CREATE TABLE "CaseTextbookTopicTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "textbookTopicId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE,
    FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CaseTextbookTopicTag_caseId_textbookTopicId_source_key" ON "CaseTextbookTopicTag"("caseId", "textbookTopicId", "source");
CREATE INDEX "CaseTextbookTopicTag_caseId_idx" ON "CaseTextbookTopicTag"("caseId");
CREATE INDEX "CaseTextbookTopicTag_textbookTopicId_idx" ON "CaseTextbookTopicTag"("textbookTopicId");

-- 注意：CaseKnowledgeTag 不做任何修改
-- 注意：Case 表本身不加列（FK 在 CaseAiResult.caseId 和 CaseTextbookTopicTag.caseId 侧）
-- 注意：CaseAiResult.textbookTopicId 有 FK 到 TextbookTopic(id)，onDelete SetNull
-- 注意：CaseTextbookTopicTag.source 只允许 'manual' | 'vlm'（代码层白名单强制）
-- 注意：updatedAt 无 DEFAULT，裸 SQL INSERT 会失败；seed 必须走 Prisma upsert（@updatedAt 自动填充）
```

### 回滚 SQL

```sql
-- 回滚 migration:
DROP TABLE IF EXISTS "CaseTextbookTopicTag";
DROP TABLE IF EXISTS "CaseAiResult";
DROP TABLE IF EXISTS "TextbookNodeMapping";
DROP TABLE IF EXISTS "TextbookTopic";
-- CaseKnowledgeTag 无需回滚（未修改）
-- Case 表无需回滚（未加列）
```

---

## 17. 回滚方案

### 17.1 代码回滚

```bash
# git revert 对应 commit
git revert <stage3-revised-first>..<stage3-revised-last>
git push origin main
# 等 CI → 服务器 pull + up
```

### 17.2 数据回滚

```sql
-- 清除 v3-revised 写入的数据（保留 Case/Artifact/manual 标签）：
DELETE FROM CaseTextbookTopicTag;
DELETE FROM CaseAiResult;
DELETE FROM CaseKnowledgeTag WHERE source = 'vlm';

-- 如需完全回滚 schema：
DROP TABLE IF EXISTS CaseTextbookTopicTag;
DROP TABLE IF EXISTS CaseAiResult;
DROP TABLE IF EXISTS TextbookNodeMapping;
DROP TABLE IF EXISTS TextbookTopic;
```

### 17.3 功能降级

如果上线后发现 AI 候选质量不够：
1. 前端把 VLM 标签改为"仅供参考，需手动确认"
2. 降低 `VLM_CONFIDENCE_THRESHOLD` 到 0.9
3. 完全禁用 /process 端点

---

## 18. 对 v3 原版章节处置

| v3 原版章节 | 处置 | 说明 |
|------------|------|------|
| §0 v3 核心变更 | **保留** | v3 vs v2 对比仍有效 |
| §1 大白话概述 | **替换** | 从"AI 挂知识点"改为"错题卡片闭环" |
| §2 现有代码盘点 | **补充** | 新增 TextbookTopic 相关组件 |
| §3 Case Analyzer lib 契约 | **替换** | 6 字段 JSON + 双候选 |
| §4 音频 skipped 规则 | **保留** | 不变 |
| §5 /process 端点设计 | **替换** | CaseAiResult 持久化 |
| §6 落库策略 | **替换** | 全部持久化 + CaseAiResult + CaseTextbookTopicTag |
| §7 前端状态和文案 | **替换** | 采集页 AI 结果展示 + 题目汇总 |
| §8 失败处理 | **保留+补充** | 新增 CaseAiResult 失败状态 |
| §9 环境变量 | **保留** | 不变 |
| §10 测试方案 | **替换** | 新增测试用例 |
| §11 成本和限流 | **保留** | 不变（token 增加约 15%） |
| §12 不写 StudentNodeState | **保留** | 不变 |
| §13 回滚方式 | **替换** | 见 §17 |
| §14 文件变更清单 | **替换** | 见 §14 |
| §15 验收标准 | **替换** | 见 §13 |
| §16 实施顺序 | **替换** | 见 §15 |
| §17 前置确认项 | **替换** | 见 §19 |
| §18 即时展示与持久化边界 | **替换** | 全部持久化 |

---

## 19. 前置确认项

> 以下项在 execute-agent 执行前需要确认：

1. ✅ Spike 已验证（Lite 一体化可行）
2. ✅ 音频格式已验证
3. ✅ source 白名单已收窄（CaseTextbookTopicTag 只允许 manual/vlm）
4. ✅ **TextbookTopic 种子数据**：本方案 §3 已提供 16 个章节 + 48 节点映射，标明覆盖当前系统节点而非完整教材
5. ⬜ **Schema migration 确认**：新增 4 表（§16），`--create-only` 生成后交用户确认再执行
6. ⬜ **生产环境环境变量**：服务器 .env 需配置 VOLCENGINE_* 变量
7. ⬜ **产品手册同步更新**：用户手册和行为手册需同步更新
8. ✅ **Round UI-0 前端修改点排查**：排查清单已完成（`doc/executionlog/round-ui0-frontend-audit.md`），6 项结论已回填至本计划 §14.5.4
9. ✅ **异步整理选项确认**：v1 做异步整理，保存后允许继续拍，题目汇总显示整理状态
10. ✅ **打印题图缩略图尺寸**：`max-width: 180px; max-height: 120px; object-fit: contain;`
11. ✅ **轮询间隔**：3 秒起步，最多 60 秒，超时提示"稍后在题目汇总里看"
12. ✅ **Round UI-0 前端修改点排查**：排查清单已完成，6 项结论已回填（排查结论 1-6）

---

> 本方案 Round UI-0 排查已完成并回填。**Round 0（Schema）可启动**——异步整理契约、前端/API 修改点已排查清楚。
