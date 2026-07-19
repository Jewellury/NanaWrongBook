# Nana v1 最小闭环功能验收契约

> **状态：待用户确认**
> **日期：2026-07-12**
> **关联：** `doc/plan/nana-test-framework-plan.md`（r3 测试计划）、`doc/product/nana-product-behavior-manual-v1.md`（产品行为手册）
> **目的：** 冻结第一版错题集闭环的验收标准。测试框架解决"怎么测"，本文档定义"测什么"和"什么算通过"。

---

## 1. 核心闭环定义

第一版的产品闭环是：**孩子拍下错题 → AI 整理成可复习的错题集**。

```
拍下错题
  ↓
可选讲思路（录音）
  ↓
题图和录音先保存成功（不等 AI）
  ↓
AI 给摘要、转写、课本分类、轻反馈、下一步
  ↓
孩子需要时纠正课本分类（纠错路径，非每题必经）
  ↓
多道错题按课本章节形成汇总
  ↓
可展开原题、查看知识地图证据（辅助解释）
  ↓
打印成可复习的错题集
```

### 1.1 三层能力划分

| 层级 | 功能 | 产品地位 | v1 要求 |
|------|------|----------|---------|
| **核心闭环** | 拍题、保存、AI 整理、自动分类、题目汇总、打印 | 必须完成 | 全部可用 |
| **纠错恢复** | 手动改课本分类、AI 失败重试、低置信未分类、语音失败降级 | 必须覆盖 | 路径走通，状态诚实 |
| **辅助解释** | 知识地图琥珀证据、展开原图、查看系统分类 | 不应阻塞错题集形成 | 有则更好，缺不阻塞 |

### 1.2 关键设计原则

1. **手工挂知识点不是每题必经步骤。** 理想路径是 AI 自动分类；孩子手动分类是纠错与表达自己理解的恢复路径。测试不应把额外劳动固化成产品主流程。
2. **知识地图是辅助解释层。** 错题汇总和打印才是产品结果。测试围绕"孩子最终拿到可复习的错题集"建立，不围绕知识地图有多少节点变色。
3. **保存与 AI 解耦。** 保存成功不等待 AI；AI 失败题仍在、状态诚实、可以重试。

---

## 2. v1 范围排除

以下功能 **v1 不做**，测试计划中不应出现对它们的断言：

- ❌ 完整 OCR（提取题干全文）
- ❌ 完整解题（给出标准答案和步骤）
- ❌ 重复题识别
- ❌ 裁剪涂抹
- ❌ 深度掌握诊断（BKT 点亮节点、masteryProb 变更）
- ❌ 知识点级（KnowledgeNode）手动标注 UI——孩子只面对课本章节

---

## 3. 验收点 CL-01 ～ CL-16

### CL-01：已登录孩子能一键进入拍题

| 维度 | 说明 |
|------|------|
| **用户目标** | 登录后在 /nana 首页看到"拍一道题"入口，点击进入 /nana/capture |
| **页面反馈** | 首页有醒目拍题按钮；点击后到达采集页，看到题图上传/拍照区和录音区 |
| **API/落库** | 无（纯导航） |
| **成功条件** | 点击后到达 /nana/capture，页面有题图占位区和录音按钮——**导航完成 + 关键控件出现**为功能性硬门禁 |
| **失败降级** | 未登录 → 跳登录页 |
| **当前实现** | ✅ 已实现 |
| **测试层** | CI 闭环（R1a） |

> **产品行为 vs 体验目标 vs 测试超时（分层，沿用 CL-04 模式）：**
> - **产品行为（硬门禁）**：点击后能到达 /nana/capture，题图占位区和录音按钮出现
> - **体验目标（采集趋势，不阻塞）**：≤2s 内完成导航
> - **测试超时（硬门禁）**：5s（本地）/ 10s（CI runner），仅判断功能是否彻底卡死
>
> 不把 2s 写成 CI 硬成功条件，否则慢 CI 会制造假失败。

### CL-02：题图能预览，保存后不能丢失

| 维度 | 说明 |
|------|------|
| **用户目标** | 拍照/上传题图后看到预览；保存后题图持久存储 |
| **页面反馈** | 题图区域显示缩略预览；可重拍替换 |
| **API/落库** | `POST /api/nana/cases` → Case + Artifact(type=question_image, content=base64) |
| **成功条件** | 预览出现；保存后 DB 有 Artifact 记录；重新打开页面仍可访问原图 |
| **失败降级** | 普通手机原图先经 `processImageFile` 压缩（maxWidth 1280 / quality 0.7，**目标约 ≤1MB，非绝对保证**——极端图片到最低质量仍可能超过）；**真正硬限制是压缩后图+音频总 payload ≤3MB**——只有图片处理失败，或总 payload 仍超过 3MB，才提示"材料太大，请重新拍一张或录短一些" |
| **当前实现** | ✅ 已实现（`image-utils.ts: processImageFile` 统一压缩；`capture/page.tsx:44 TOTAL_PAYLOAD_LIMIT=3MB` 对压缩后总 payload 预检） |
| **测试层** | CI 闭环（R1a） |

> **关键**：不按原图大小拒绝。原图普遍 >3MB（手机拍照正常），但 `processImageFile` 始终压缩，原图大小不构成拒收理由。3MB 阈值作用于**压缩后总 payload**（图+音频 base64 总和），不是原图，也不是单图绝对大小。**不把 ≤1MB 写成绝对契约**——`compressImage` 会尽力降质量，但极端图片到最低质量后仍可能超过。

### CL-03：录音可选；不录音也能完成闭环

| 维度 | 说明 |
|------|------|
| **用户目标** | 孩子可以不录音直接保存；不录音时 AI 仍正常整理题图 |
| **页面反馈** | 录音 tab 存在但不强制；不录音时保存按钮可用 |
| **API/落库** | 不录音时 Case 无 audio_note Artifact；CaseAiResult.audioStatus = "skipped" |
| **成功条件** | 无 audio_note 时保存成功；AI 返回 questionSummary 等字段；audioStatus = "skipped" |
| **失败降级** | 麦克风权限拒绝 → 提示"没拿到麦克风权限，不录音也能保存这道题" |
| **当前实现** | ✅ 已实现 |
| **测试层** | CI 闭环（R1a） |

### CL-04：保存确认不等待 AI，孩子可以继续拍下一题

| 维度 | 说明 |
|------|------|
| **用户目标** | 点"收好这道题"后快速看到"已收好"，不需要等 AI 整理完 |
| **页面反馈** | 保存按钮 → "saving" → "已收好"（浮动卡）；同时 AI 异步开始整理 |
| **API/落库** | `POST /api/nana/cases` 返回 caseId → 立即显示成功 → `POST /api/nana/cases/:id/process` 异步触发 |
| **成功条件** | 保存成功 → 立即进入"已收好"状态（产品行为）；AI 整理状态异步出现 |
| **失败降级** | 保存失败 → "收的时候出了点问题"，题图数据保留可重试 |
| **当前实现** | ✅ 代码已存在（capture/page.tsx: `setSaveState("saved")` 在 `triggerCaseProcess` 之前） |
| **测试层** | CI 闭环（R1a） |

> **r3.1 修正：产品体验目标 vs 测试超时分离**
>
> | 层级 | 含义 | 阈值 | 门禁类型 |
> |------|------|------|----------|
> | **产品行为** | 保存确认不等待 AI，立即进入已保存状态 | 即时（代码保证 `setSaveState` 在 `triggerCaseProcess` 前） | 功能性硬门禁（无反馈=阻塞） |
> | **体验目标** | 在受控网络下，"已收好"出现的目标耗时 | ≤ 2s | 采集趋势，先不阻塞；积累数据后设滚动基线 |
> | **测试超时** | 判断功能是否彻底卡死的等待上限 | 5s（本地）/ 10s（CI runner） | 超过=测试失败（硬门禁） |
> | **发布门禁** | 超过测试超时 → 阻塞发布；超过体验目标 → 告警不阻塞 | — | 测试超时=阻塞；体验目标=告警 |

### CL-05：有录音时返回真实转写；转写失败不影响题图整理

| 维度 | 说明 |
|------|------|
| **用户目标** | 录了音时 AI 返回转写文字；转写出问题时题图整理仍完成 |
| **页面反馈** | AI 结果卡显示 transcript 内容；转写失败时 audioStatus=failed 但其他字段正常 |
| **API/落库** | CaseAiResult.transcript 非空（成功时）；CaseAiResult.audioStatus = "success" / "failed" |
| **成功条件** | 有录音且转写成功 → transcript 非空、audioStatus=success；转写失败 → audioStatus=failed、questionSummary 等仍非空 |
| **失败降级** | 转码失败（webm→wav）→ audioStatus=failed，不 throw，题图结果正常落库 |
| **当前实现** | ✅ 已实现（case-analyzer.ts: `audioTranscodeFailed` 降级路径 + `deriveAudioStatus`） |
| **测试层** | CI 闭环（R1a）+ Provider Smoke（R4） |

### CL-06：AI 返回摘要、课本分类、轻反馈、可选可能方向、下一步建议

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 整理完成后，孩子看到：题目摘要、课本章节分类（可空，按 CL-08 规则）、轻反馈、下一步建议；"可能的方向"有则显示 |
| **页面反馈** | AI 结果卡分区显示各字段；possibleMistakeReason 为空时隐藏该区块；textbookTopicId 为空时显示"暂未覆盖"占位而非空分类 |
| **API/落库** | CaseAiResult: questionSummary / textbookTopicId（可空）/ initialFeedback / possibleMistakeReason(可空) / nextActionSuggestion |
| **成功条件** | questionSummary 非空；initialFeedback 非空；nextActionSuggestion 非空；possibleMistakeReason 可空（空时隐藏不报错）；textbookTopicId 可空（按 CL-08 规则） |
| **产品表达边界（硬约束）** | ① 页面不得把 `initialFeedback` 表述成完整诊断、标准答案或掌握判定——它是"轻反馈"建议；② 不得把 `nextActionSuggestion` 表述成确定性学习路径；③ 课本分类可空，空时不得编造分类（与 CL-08 一致）；④ 7 字段是**接口契约**，孩子真正关心的是结果卡是否诚实有用——测试既要验证字段完整性，也要验证页面表达不越界 |
| **失败降级** | AI 整理失败 → processingStatus=failed，显示"整理没成功，可以重试" |
| **当前实现** | 🟡 **部分实现**：字段可空（textbookTopicId/possibleMistakeReason）已支持；**但 textbookTopicId 为空时结果卡直接隐藏分类区（`ai-result-card.tsx:93`），未显示"暂未覆盖"占位**——待 A-1 补齐 |
| **测试层** | CI 闭环（R1a）+ Provider Smoke（R4） |

### CL-07：课本分类与系统知识点各自独立判定，合格候选分别写标签

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 有把握时把题分类到课本章节，同时映射到系统知识点（孩子不可见）；两层各自独立判定，不强行绑定 |
| **页面反馈** | AI 结果卡显示课本章节名（高置信时）；汇总页该题归入对应章节 |
| **API/落库** | 课本候选 ≥ 阈值 → `CaseTextbookTopicTag(source=vlm)` + `CaseAiResult.textbookTopicId`；系统节点候选 ≥ 阈值 → `CaseKnowledgeTag(source=vlm)`。两个 for 循环独立判定（`process/route.ts:194` 和 `:211`） |
| **成功条件** | ① 课本候选达阈值 → `CaseTextbookTopicTag` 存在；② 系统节点候选达阈值 → `CaseKnowledgeTag` 存在；③ 两层各有合格候选时"双写同时存在"；④ 允许单边合格（课本合格但节点不合格、或反之）—— 见 CL-08；⑤ ID 必须属于当前有效目录（当前版本：16 个 TextbookTopic / 48 个 KnowledgeNode），**不把 16/48 冻结成永久产品限制**——目录可扩展，契约只要求"属于当前有效集合" |
| **参数说明** | `HIGH_CONFIDENCE_THRESHOLD = 0.5` 是**当前版本策略参数**（`process/route.ts: HIGH_CONFIDENCE_THRESHOLD`），不是永久产品契约；调参时只需更新该常量，本契约的判定逻辑不变 |
| **失败降级** | 无（合格即写，不合格即不写，各自独立） |
| **当前实现** | ✅ 已实现（process/route.ts: 两个独立 for 循环，各自 confidence >= HIGH_CONFIDENCE_THRESHOLD） |
| **测试层** | CI 闭环（R1a）DB 验证 |

### CL-08：低置信时按两层分别诚实降级，不制造假分类

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 不确定时诚实告知"暂未覆盖"，不编造分类；两层各自独立降级 |
| **页面反馈** | 课本未分类时汇总页该题归入"未分类"组（topic=null，排在最后） |
| **API/落库** | **没有任何课本候选达到阈值**（`textbookTopicCandidates` 中无 `confidence >= HIGH_CONFIDENCE_THRESHOLD` 的项）→ `CaseAiResult.textbookTopicId=null` + 无 `CaseTextbookTopicTag(source=vlm)`；**没有任何系统节点候选达到阈值**（`knowledgeNodeCandidates` 中无合格项）→ 不写 `CaseKnowledgeTag(source=vlm)` |
| **成功条件** | ① 没有任何课本候选达到阈值 → textbookTopicId=null + 无 vlm 课本标签 + 汇总页归入未分类；② 没有任何系统节点候选达到阈值 → 无 vlm 节点标签；③ **两层独立判定**——允许"有课本合格候选但无节点合格候选"、"有节点合格候选但无课本合格候选"、"两层都有"、"两层都无"等任意组合；④ 模型最多返回 3 个候选（当前实现），量词是"没有任何候选达到阈值"而非单条候选置信度 |
| **失败降级** | 无（低置信诚实降级本身就是降级路径） |
| **当前实现** | ✅ 已实现（process/route.ts: 低置信候选不挂 tag，两个 for 循环独立；候选量词与代码一致——循环遍历所有候选，无合格项即不写 tag） |
| **测试层** | CI 闭环（R1a） |

> **关键**：CL-07 + CL-08 共同保证"课本层（孩子可见）"和"系统层（孩子不可见）"独立判定、独立降级。把孩子分类层与系统诊断层绑死会导致一层的低置信污染另一层的高置信结果。量词明确为"没有任何候选达到阈值"而非"候选低置信"——避免"一条低、一条高"时语义歧义。

### CL-09：孩子可修改 TextbookTopic；手动结果优先且不会被重跑覆盖

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 分类不对时，孩子能改成正确的课本章节；改完后即使 AI 重跑也不会被覆盖 |
| **页面反馈** | 题目卡片或详情页有"改分类"入口（下拉选择 16 个课本章节）；改完后显示新分类 |
| **API/落库** | `PATCH /api/nana/cases/:id/textbook-topic` → CaseTextbookTopicTag(source=manual) + CaseAiResult.textbookTopicEdited=true |
| **成功条件** | 手动修改后 CaseTextbookTopicTag(source=manual) 存在；重跑 AI 时 `textbookTopicEdited=true` 阻止 vlm 标签覆盖；汇总页以 manual 为权威 |
| **失败降级** | 无（此为纠错路径，本身是恢复手段） |
| **当前实现** | ❌ **未实现**——无 PATCH/PUT API，无"改分类" UI。TD-006 待解决。 |
| **测试层** | CI 闭环（R1b，依赖 TD-006） |

> **关键：** 手动 TextbookTopic 分类是**纠错路径**，不是每题必经步骤。理想路径是 AI 自动分类。测试场景中只在"AI 分类错误后手动纠正"场景使用此功能。

### CL-10a：题目汇总默认打开，AI 自动分类的题按课本章节正确分组

| 维度 | 说明 |
|------|------|
| **用户目标** | 进入知识地图页后默认看到题目汇总，AI 自动分类的题按课本章节分组排列，不需展开就能扫题 |
| **页面反馈** | `/nana/knowledge-map` 默认选中"题目汇总"Tab（**不是 `/nana` 首页直接展示汇总**——`/nana` 是首页三入口）；AI 分类的题归入对应章节组（chapter + section）；原图默认折叠，点击展开 |
| **API/落库** | `GET /api/nana/cases/summary` → `{ groups: [{ topic, cases }] }`，未分类组排最后 |
| **成功条件** | ① 进入 `/nana/knowledge-map` 时默认 Tab=题目汇总；② 多道 AI 分类题正确分入各自章节组；③ 同一章节的题在一起；④ 未分类题在最后；⑤ 原图不默认展开 |
| **失败降级** | 无 CaseAiResult 的题 → processStatus=pending，归入未分类 |
| **当前实现** | ✅ 已实现（summary/route.ts 按 TextbookTopic 分组；/nana/knowledge-map 默认 tab=题目汇总） |
| **测试层** | CI 闭环（R1a） |

### CL-10b：孩子手动改分类后，汇总页以手动结果为权威正确更新

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 分类不对时，孩子手动改成正确章节后，汇总页以手动分类为权威重新分组 |
| **页面反馈** | 手动改完后，汇总页该题归入新的手动章节组；即使 AI 重跑也不被覆盖 |
| **API/落库** | summary 以 `CaseTextbookTopicTag(source=manual)` 为权威来源；`CaseAiResult.textbookTopicEdited=true` 阻止 vlm 标签覆盖 |
| **成功条件** | 手动修改后汇总页该题归入新章节；AI 重跑后汇总仍以 manual 为权威 |
| **失败降级** | 无（此为纠错路径的汇总呈现） |
| **当前实现** | ❌ **未实现**——依赖 TD-006（summary 未以 manual source 为权威 + 无 textbookTopicEdited 保护） |
| **测试层** | CI 闭环（R1b，依赖 TD-006） |

> **拆分说明（2026-07-19）：** 原 CL-10 拆为 CL-10a（AI 自动分类汇总，R1a）+ CL-10b（手动改分类汇总，R1b）。Phase A 冻结 CL-10a；Phase B 冻结 CL-09 + CL-10b。拆分目的：避免"部分冻结"导致无法判断改动是否违反冻结契约。

### CL-11：多道题能形成真正的错题集，而不只是单题卡片

| 维度 | 说明 |
|------|------|
| **用户目标** | 拍 3+ 道不同章节的题后，汇总页显示多个章节分组，每组有对应题目 |
| **页面反馈** | 汇总页有 2+ 章节分组标题，每个分组下有对应题目卡片 |
| **API/落库** | summary API 返回 groups.length ≥ 2（当题目来自不同章节时） |
| **成功条件** | 3 道不同章节题 → 汇总有 3 个分组，每组 1 题；章节标题正确 |
| **失败降级** | 部分题未分类 → 未分类组也有题 |
| **当前实现** | ✅ 已实现 |
| **测试层** | CI 闭环（R1a，三题批量路径） |

### CL-12：知识地图出现琥珀"收过题"，但本次拍题不新增/更新 StudentNodeState

| 维度 | 说明 |
|------|------|
| **用户目标** | 拍过题的知识点在地图上有琥珀色标记，但不因本次拍题假装"已掌握"；用户历史已有的绿色掌握节点保留 |
| **页面反馈** | 知识地图中本次收过题的节点有琥珀色环 + "收过题"标签；**用户历史已有的绿色"掌握"节点允许保留**（可能来自小检查等其它路径）——本条不要求页面"无任何绿色节点" |
| **API/落库** | `GET /api/diagnosis/map` → `caseEvidenceCount > 0` 的节点有琥珀标记；本次拍题过程**不新增、不更新** StudentNodeState |
| **成功条件** | ① 挂过 CaseKnowledgeTag 的节点 caseEvidenceCount > 0；② 拍题前后该用户的 `StudentNodeState` 全量状态不发生新增或更新（beforeCount == afterCount 且现有记录字段值不变）；③ status 合法值为 stable/uncertain/gap/untested（无 mastered）；④ 用户历史已有的绿色节点不因本次拍题消失或变色 |
| **失败降级** | 无（琥珀证据是正交弱标记，不改 status） |
| **当前实现** | ✅ 已实现（map/route.ts: `caseEvidenceCount` 聚合，不写 StudentNodeState） |
| **测试层** | CI 闭环（R1a）DB 验证 |

> **关键修正**：原版要求"页面无绿色掌握节点"是错的——用户可能已通过其它路径（如小检查）点亮节点，本条只关心"本次拍题过程不触发 StudentNodeState 变更"。

### CL-13：打印页按章节组织，只打印题图、摘要、轻反馈和下一步

| 维度 | 说明 |
|------|------|
| **用户目标** | 打开打印预览页，看到按章节分组的错题，每题显示题图+摘要+轻反馈+下一步；点击打印生成可用的 PDF |
| **页面反馈** | /nana/print-preview 页面按 TextbookTopic 分组；每题卡片含题图、questionSummary、initialFeedback、nextActionSuggestion；无技术字段（nodeId、confidence、tokenUsage） |
| **API/落库** | `GET /api/nana/cases/summary`（复用）或专用打印 API |
| **成功条件** | 打印预览按章节分组；只含题图+摘要+轻反馈+下一步；PDF 无裁切/重叠；技术字段不出现 |
| **失败降级** | 无题图的题 → 显示"无图"占位，仍打印摘要 |
| **当前实现** | ❌ **未实现**——无 /nana/print-preview 路由。现有 /print-preview 属上游 wrong-notebook，调 /api/error-items/list，不调 /api/nana/cases |
| **测试层** | CI 闭环（R1c，依赖打印页实现） |

### CL-14：AI 整体失败 vs 音频子失败分别处理；题仍在、状态诚实、可重试（不创重复 Case）

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 整理失败或音频子失败时，题不丢，看到诚实的失败状态，可以点重试；重试不创建重复 Case |
| **页面反馈** | **AI 整体失败**：AI 整理区显示"整理没成功，可以重试" + 重试按钮；题图和录音仍在。**仅音频失败**：AI 结果卡正常显示题图字段，audioStatus=failed 有独立提示，**同时提供同 Case 的转写重试入口**（孩子可点"再试转一次"） |
| **API/落库** | **AI 整体失败**：`CaseAiResult.processingStatus="failed"`，Case + Artifact 仍存在。**仅音频失败**：`CaseAiResult.processingStatus="success"` + `audioStatus="failed"`，题图相关字段（questionSummary 等）正常落库。**重试**：`POST /api/nana/cases/:id/process` 对**同一 Case** 重新触发，不创建新 Case；音频重试成功后 transcript 更新 |
| **成功条件** | ① 整体失败时 processingStatus=failed；② 仅音频失败时 processingStatus=success + audioStatus=failed；③ 重试对同一 Case 触发，Case 数量不增加；④ 重试成功后 processingStatus=success（整体）/ transcript 更新（音频）；⑤ 题图不丢 |
| **范围边界** | ① **初始保存失败**（`POST /api/nana/cases` 失败）属于 **CL-04** 的失败降级，不混入本条；② 本条只处理 Case 已保存后的 AI 整理阶段失败和音频子失败 |
| **失败降级** | 本 CL 本身就是降级路径的验证 |
| **当前实现** | 🟡 **部分实现**：① 整体失败重试已实现（`process/route.ts: persistFailedResult` + `capture/page.tsx: handleRetryProcess`）；② 音频子失败时 `case-analyzer.ts: audioTranscodeFailed` 正确走 success+audioStatus=failed + 题图字段正常落库；**但 audioStatus=failed 时结果卡只有静态提示"语音没转成功"（`ai-result-card.tsx:80-83`），没有重试按钮**——同 Case 的音频重试入口待 A-1 补齐 |
| **测试层** | CI 闭环（R1a，低置信/失败场景） |

> **关键修正**：原版只要求"可重试"，未明确区分整体失败和音频子失败的重试入口。从孩子信任角度，音频子失败也应有可见的重试路径（而非只显示静态失败提示）。A-1 须补齐 audioStatus=failed 的重试按钮，验证重试不新增 Case、成功后 transcript 更新。

### CL-15：连续拍题不存在前一道 AI 结果覆盖后一道的竞态

| 维度 | 说明 |
|------|------|
| **用户目标** | 快速连续拍 3 道题，每道题的 AI 结果不会串到另一道上 |
| **页面反馈** | 每道题保存后独立显示各自的 AI 整理状态和结果 |
| **API/落库** | 每个 Case 有独立的 CaseAiResult；前端 `currentCaseIdRef` 检查 |
| **成功条件** | 连续拍 3 题，每题 AI 结果正确对应各自的 caseId；前端不出现旧请求覆盖新状态 |
| **失败降级** | 用户"再拍一道"时 abort 旧请求 → 旧请求结果被丢弃 |
| **当前实现** | ✅ 已实现（capture/page.tsx: `currentCaseIdRef` + `AbortController` + `abortControllerRef`） |
| **测试层** | CI 闭环（R1a，连续拍题场景） |

### CL-16：不同用户之间题图、录音、AI 结果、汇总和直接接口严格隔离

| 维度 | 说明 |
|------|------|
| **用户目标** | 用户 A 看不到用户 B 的题、录音、AI 结果、汇总；用户 B 直接访问 A 的资源统一返回 404；任何接口不泄漏 A 的题图/录音/base64 |
| **页面反馈** | 每个用户只看到自己的数据 |
| **API/落库** | 所有 Nana API 用 `where: { studentId: session.user.id }` 过滤；按 caseId 直查的接口加归属校验，非本人资源返回 404 |
| **成功条件** | 用户 A 拍题后，用户 B：① `GET /api/nana/cases/summary` 不含 A 的分组；② `GET /api/nana/cases` 列表不含 A 的 Case；③ `GET /api/diagnosis/map` 不含 A 的琥珀证据；④ **直接访问 `GET /api/nana/cases/:A-case-id` 返回 404**；⑤ **直接访问 `POST /api/nana/cases/:A-case-id/process` 返回 404**（不可触发他人 Case 的 AI 整理）；⑥ **直接访问 A 的 tags 接口（textbook-topic / knowledge-tag 等）返回 404**；⑦ 响应体不含 A 的题图、录音、base64 Artifact 内容 |
| **失败降级** | 无（隔离是硬性安全要求） |
| **当前实现** | ✅ 已实现（所有 /api/nana/cases 路由均用 `session.user.id` 过滤；按 caseId 直查接口加归属校验） |
| **测试层** | CI 闭环（R1a，跨用户场景） |

> **关键补充**：除"列表查不到"外，还必须验证**直接接口越权**——B 用 A 的 caseId 直查详情/触发 process/读 tags 一律 404，且响应体不泄漏任何 base64 Artifact 内容。仅验证列表过滤不足以覆盖所有越权路径。

---

## 4. 测试场景覆盖矩阵

| # | 场景 | 覆盖的 CL | 测试层 | 轮次 | 说明 |
|---|------|-----------|--------|------|------|
| S1 | 清晰题图 + 录音：完整成功路径 | CL-01~CL-08, CL-10a, CL-11~CL-12, CL-15 | CI 闭环 | R1a | 黄金路径，假 Provider 高置信 |
| S2 | 清晰题图、不录音 | CL-03, CL-04, CL-06 | CI 闭环 | R1a | 验证语音确实可选 |
| S3 | 音频失败、图片成功 | CL-05, CL-14 | CI 闭环 | R1a | 假 Provider 返回 audioStatus=failed，题图结果正常 |
| S4 | 倾斜/不完整图片：低置信、诚实降级 | CL-06, CL-08, CL-14 | CI 闭环 | R1a | 假 Provider 低置信 → 未分类 |
| S5 | AI 分类错误后手动纠正 | CL-09, CL-10b | CI 闭环 | R1b | 依赖 TD-006；验证纠正后汇总更新（不含打印） |
| S6 | 三个不同章节的题 | CL-07, CL-10a, CL-11, CL-12 | CI 闭环 | R1a | 验证真正的章节分组 |
| S7 | 连续拍三题 | CL-04, CL-15 | CI 闭环 | R1a | 验证不被 AI 等待阻塞、无竞态 |
| S8 | 30 题数据集 | CL-10a, CL-11, CL-12 | CI 闭环 | R1d | 验证汇总速度、滚动和图谱性能 |
| S9 | 打印预览 | CL-13 | CI 闭环 | R1c | 依赖 /nana/print-preview；分页、裁切、技术字段隐藏 |
| S10 | 跨用户访问 | CL-16 | CI 闭环 | R1a | 两个用户互相不可见数据 |

### 场景与 CL 矩阵交叉检查

| CL | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|----|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| CL-01 | ✓ | ✓ | ✓ | ✓ | | | ✓ | | | |
| CL-02 | ✓ | ✓ | ✓ | ✓ | | | ✓ | | | |
| CL-03 | | ✓ | | | | | | | | |
| CL-04 | ✓ | ✓ | | | | | ✓ | | | |
| CL-05 | | | ✓ | | | | | | | |
| CL-06 | ✓ | ✓ | ✓ | ✓ | | | | | | |
| CL-07 | ✓ | | | | | ✓ | | | | |
| CL-08 | | | | ✓ | | | | | | |
| CL-09 | | | | | ✓ | | | | | |
| CL-10a | ✓ | | | | | ✓ | | ✓ | | |
| CL-10b | | | | | ✓ | | | | | |
| CL-11 | ✓ | | | | | ✓ | | ✓ | | |
| CL-12 | ✓ | | | | | ✓ | | ✓ | | |
| CL-13 | | | | | | | | | ✓ | |
| CL-14 | | | ✓ | ✓ | | | | | | |
| CL-15 | ✓ | | | | | | ✓ | | | |
| CL-16 | | | | | | | | | | ✓ |

> 每个至少被 1 个场景覆盖。CL-03（不录音）只在 S2 单独验证，但在 S1 中隐含"有录音也能走通"。

---

## 5. CL 与测试轮次映射

| CL | R1a | R1b | R1c | R1d | R4 | R5 |
|----|:---:|:---:|:---:|:---:|:---:|:---:|
| CL-01 | ✓ | | | | | |
| CL-02 | ✓ | | | | | |
| CL-03 | ✓ | | | | | |
| CL-04 | ✓ | | | | | |
| CL-05 | ✓ | | | | ✓ | |
| CL-06 | ✓ | | | | ✓ | |
| CL-07 | ✓ | | | | ✓ | |
| CL-08 | ✓ | | | | ✓ | |
| CL-09 | | ✓ | | | | |
| CL-10a | ✓ | | | ✓ | | |
| CL-10b | | ✓ | | | | |
| CL-11 | ✓ | | | ✓ | | |
| CL-12 | ✓ | | | ✓ | | |
| CL-13 | | | ✓ | | | |
| CL-14 | ✓ | | | | ✓ | |
| CL-15 | ✓ | | | | | |
| CL-16 | ✓ | | | | | |
| 体验评审 | | | | | | ✓ |

---

## 6. 当前实现状态汇总

### 6.1 总体结论

> **v1 最小错题集闭环尚未完成。** CL-09、CL-10b、CL-13 未实现；CL-06、CL-14 部分实现（缺前端 UI 补齐，A-1 接手）；其余条目多数仍待本框架验证。
> "代码存在"不等于"验收通过"——下表四级状态如实反映当前进度。

### 6.2 实现状态明细（r3.1 四级状态）

> **"代码存在"列图例**：✅ 完整实现 ｜ 🟡 部分实现（缺前端 UI 或边界，A-1 补齐） ｜ ❌ 未实现

| CL | 代码存在 | 确定性测试通过 | 真实 Provider 通过 | 真机通过 | 实现位置 |
|----|:--------:|:--------------:|:-------------------:|:--------:|----------|
| CL-01 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `/nana/page.tsx` 拍题入口 |
| CL-02 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `image-utils.ts: processImageFile` 统一压缩 + `capture/page.tsx: TOTAL_PAYLOAD_LIMIT` 压缩后总 payload 预检 |
| CL-03 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `capture/page.tsx` + `case-analyzer.ts` |
| CL-04 | ✅ | ❌ 待 R1a | — | ❌ 待发版 | `capture/page.tsx: setSaveState` 在 `triggerCaseProcess` 前 |
| CL-05 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `case-analyzer.ts: audioTranscodeFailed` + `deriveAudioStatus` |
| CL-06 | 🟡 部分 | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | 字段可空已支持；`ai-result-card.tsx:93` textbookTopicId 为空时直接隐藏分类区，未显示"暂未覆盖"占位（A-1 补齐） |
| CL-07 | ✅ | ❌ 待 R1a | ❌ 待 R4 | — | `process/route.ts:194/211` 两个独立 for 循环，各自 `confidence >= HIGH_CONFIDENCE_THRESHOLD(0.5)` |
| CL-08 | ✅ | ❌ 待 R1a | ❌ 待 R4 | — | `process/route.ts: persistAiResult` 低置信不挂 tag（两层独立降级） |
| CL-09 | ❌ 未实现 | — | — | — | **TD-006**：无 PATCH/PUT API、无"改分类" UI |
| CL-10a | ✅ | ❌ 待 R1a | — | — | `/nana/knowledge-map` 默认 tab=题目汇总 + `summary/route.ts` 按 TextbookTopic 分组 |
| CL-10b | ❌ 未实现 | — | — | — | **TD-006**：summary 以 `CaseTextbookTopicTag(source=manual)` 为权威 + `textbookTopicEdited=true` 保护 |
| CL-11 | ✅ | ❌ 待 R1a | — | — | `summary/route.ts` groups 结构 |
| CL-12 | ✅ | ❌ 待 R1a | — | — | `map/route.ts: caseEvidenceCount` + 拍题过程不写 StudentNodeState（已有绿色节点保留） |
| CL-13 | ❌ 未实现 | — | — | — | **Nana 打印页**：无 `/nana/print-preview` 路由 |
| CL-14 | 🟡 部分 | ❌ 待 R1a | ❌ 待 R4 | — | 整体失败重试已实现（`persistFailedResult` + `handleRetryProcess`）；音频子失败走 success+audioStatus=failed+题图正常（`audioTranscodeFailed`）；**但 audioStatus=failed 无重试按钮（`ai-result-card.tsx:80-83`）——A-1 补齐** |
| CL-15 | ✅ | ❌ 待 R1a | — | — | `capture/page.tsx: currentCaseIdRef + abortControllerRef` |
| CL-16 | ✅ | ❌ 待 R1a | — | — | 所有路由 `where: { studentId: session.user.id }` + 按 caseId 直查接口归属校验返回 404 |

> **状态含义说明：**
> - **代码存在** = 找得到实现代码（不等于验收通过）
> - **确定性测试通过** = 假 Provider + 临时 DB 的 CI 闭环已验证
> - **真实 Provider 通过** = 豆包真实质量已验证（R4 Smoke）
> - **真机通过** = 手机权限和体感已验证（发版前抽检）

### 6.3 未实现项与阻塞

| CL | 阻塞项 | 阻塞轮次 | 影响 |
|----|--------|----------|------|
| CL-06 | "暂未覆盖"占位未实现：`ai-result-card.tsx:93` textbookTopic=null 时直接隐藏分类区 | R1a（A-1 补齐） | 课本未分类时结果卡无诚实占位 |
| CL-09 | **TD-006**：无 PATCH/PUT API、无"改分类" UI、双写口径未统一 | R1b | 手动纠错路径无法测试 |
| CL-10b | **TD-006**：summary 未以 manual source 为权威、无 textbookTopicEdited 保护 | R1b | 手动改分类后汇总更新无法验证 |
| CL-13 | **Nana 打印页**：无 `/nana/print-preview` 路由 | R1c | 打印预览验证无法做 |
| CL-14 | 音频子失败无重试入口：`ai-result-card.tsx:80-83` audioStatus=failed 时只有静态提示 | R1a（A-1 补齐） | 孩子无法重试失败的转写 |

### 6.4 需额外验证的实现（标记重点）

| 项目 | 当前状态 | 验证重点 |
|------|----------|----------|
| TD-006 | 待解决 | `CaseAiResult.textbookTopicId` 和 `CaseTextbookTopicTag` 双写口径需统一；手动改后 `textbookTopicEdited=true` 阻止覆盖 |
| Nana 打印页 | 未实现 | 新建 `/nana/print-preview`，按 TextbookTopic 分组，只打印题图+摘要+轻反馈+下一步 |
| 真实音频 Smoke | R4 | Provider Smoke 中用 Chromium fake-media + 真实 WAV 验证完整音频链路（录音→转码→转写） |

---

## 7. Fixture 素材组与 TextbookTopic 覆盖范围

> **r3.1 修正：拆分图像质量 fixture 与跨章节 fixture 为两组，不能给一张函数题硬配三角函数 mock 响应。**

### 7.1 素材组 A：图像质量与降级能力（S1-S4）

| Fixture | 图像特征 | 验证目标 | 对应章节 | 对应场景 |
|---------|----------|----------|----------|----------|
| `clear-printed.jpg` | 清晰打印体 | 正常成功路径（高置信、完整字段） | TB-010 函数的基本性质 | S1, S2, S7 |
| `with-handwriting.jpg` | 手写干扰 | 手写干扰下的转写和分类 | TB-010 函数的基本性质 | S1, S3 |
| `tilted-partial.jpg` | 倾斜/不完整 | 低置信、未分类、诚实降级 | TB-010 函数的基本性质 | S4 |

> 这三张素材都偏函数题，用来验证**图像质量和降级能力**，不验证跨章节分类。
> mock 响应中的 topicId 和 nodeId 必须与题图实际内容匹配（都是 TB-010 / M2a-13）。

### 7.2 素材组 B：跨章节分类与汇总（S6, S7）

| Fixture | 图像特征 | 验证目标 | 对应章节 | 对应场景 |
|---------|----------|----------|----------|----------|
| `set-theory.jpg` | 集合运算题 | 跨章节：第一章集合 | TB-003 集合的基本运算 | S6, S7 |
| `inequality.jpg` | 不等式题 | 跨章节：第二章不等式 | TB-008 一元二次不等式 | S6, S7 |
| `function-graph.jpg` | 函数图象题 | 跨章节：第三章函数 | TB-010 函数的基本性质 | S6, S7 |

> 这三张素材来自**不同章节**，用来验证**真正的跨章节分类与汇总分组**。
> mock 响应中的 topicId 和 nodeId 必须与题图实际内容匹配，不能张冠李戴。

### 7.3 16 个 TextbookTopic 覆盖范围

所有 fixture 必须来自当前 16 个 TextbookTopic 覆盖范围，并逐张脱敏确认。

| ID | 名称 | 章节 | Fixture 覆盖 |
|----|------|------|-------------|
| TB-001 | 集合的概念 | 第一章 集合与常用逻辑用语 | 待补充 |
| TB-002 | 集合间的基本关系 | 第一章 | 待补充 |
| TB-003 | 集合的基本运算 | 第一章 | 素材组 B: set-theory.jpg |
| TB-004 | 充分条件与必要条件 | 第一章 | 待补充 |
| TB-005 | 全称量词与存在量词 | 第一章 | 待补充 |
| TB-006 | 等式性质与不等式性质 | 第二章 一元二次函数、方程和不等式 | 待补充 |
| TB-007 | 基本不等式 | 第二章 | 待补充 |
| TB-008 | 一元二次不等式 | 第二章 | 素材组 B: inequality.jpg |
| TB-009 | 函数的概念及其表示 | 第三章 函数的概念与性质 | 待补充 |
| TB-010 | 函数的基本性质 | 第三章 | 素材组 A: clear-printed, with-handwriting, tilted-partial; 素材组 B: function-graph.jpg |
| TB-011 | 指数函数 | 第四章 指数函数与对数函数 | 待补充 |
| TB-012 | 对数 | 第四章 | 待补充 |
| TB-013 | 对数函数 | 第四章 | 待补充 |
| TB-014 | 函数的应用（零点） | 第四章 | 待补充 |
| TB-015 | 复数的概念 | 第七章 复数 | 待补充 |
| TB-016 | 复数的四则运算 | 第七章 | 待补充 |

> **R1a fixture 要求：** 素材组 A（3 张）+ 素材组 B（3 张）= 共 6 张脱敏题图。每张需目视确认无姓名、学校、日期等隐私信息。素材组 A 的 mock 响应统一映射到 TB-010；素材组 B 的 mock 响应分别映射到各自章节。

---

## 8. 术语对齐

| 术语 | 含义 | 孩子可见？ |
|------|------|:----------:|
| TextbookTopic | 课本章节（16 个，如"函数的基本性质"） | 是 |
| KnowledgeNode | 系统知识点（48 个，如"用定义判断单调性"） | 否 |
| Case | 一道错题 | 是（以题目卡片形式） |
| CaseAiResult | AI 整理结果 | 是（以结果卡形式） |
| CaseTextbookTopicTag | 课本章节标签 | 是（以分组形式） |
| CaseKnowledgeTag | 知识点标签 | 否（用于地图琥珀证据） |
| StudentNodeState | 知识点掌握状态 | 否（v1 不变更） |
| processingStatus | AI 整理状态（success/failed/pending/timeout） | 是（以状态标签形式） |

---

> **本文档冻结后，测试计划 r3.1 方可作为执行依据。**
> 用户确认本文档 → 启动 r3.1 修订 → 用户确认 r3.1 → 启动 R1a。
>
> **r3.1 修订要点：**
> 1. CL-04 分离产品体验目标（≤2s 采集趋势）与测试超时（5s/10s 硬门禁）
> 2. 实现状态从"已实现/未实现"改为四级状态表
> 3. S5 去掉 CL-13，打印只归 S9/R1c
> 4. Fixture 拆为素材组 A（图像质量）和素材组 B（跨章节），mock 响应与题图内容一致
> 5. 总体结论明确：v1 最小错题集闭环尚未完成
