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
| **成功条件** | 点击 → 2s 内到达 /nana/capture，页面有题图占位区和录音按钮 |
| **失败降级** | 未登录 → 跳登录页 |
| **当前实现** | ✅ 已实现 |
| **测试层** | CI 闭环（R1a） |

### CL-02：题图能预览，保存后不能丢失

| 维度 | 说明 |
|------|------|
| **用户目标** | 拍照/上传题图后看到预览；保存后题图持久存储 |
| **页面反馈** | 题图区域显示缩略预览；可重拍替换 |
| **API/落库** | `POST /api/nana/cases` → Case + Artifact(type=question_image, content=base64) |
| **成功条件** | 预览出现；保存后 DB 有 Artifact 记录；重新打开页面仍可访问原图 |
| **失败降级** | 图片 >3MB → 前端提示"材料太大，请重新拍一张" |
| **当前实现** | ✅ 已实现 |
| **测试层** | CI 闭环（R1a） |

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
| **用户目标** | AI 整理完成后，孩子看到：题目摘要、课本章节分类、轻反馈、下一步建议；"可能的方向"有则显示 |
| **页面反馈** | AI 结果卡分区显示各字段；possibleMistakeReason 为空时隐藏该区块 |
| **API/落库** | CaseAiResult: questionSummary / textbookTopicId / initialFeedback / possibleMistakeReason(可空) / nextActionSuggestion |
| **成功条件** | questionSummary 非空；initialFeedback 非空；nextActionSuggestion 非空；possibleMistakeReason 可空（空时隐藏不报错） |
| **失败降级** | AI 整理失败 → processingStatus=failed，显示"整理没成功，可以重试" |
| **当前实现** | ✅ 已实现（case-analyzer.ts 返回 7 字段，process/route.ts 持久化） |
| **测试层** | CI 闭环（R1a）+ Provider Smoke（R4） |

### CL-07：AI 高置信时同时写 TextbookTopic 与 KnowledgeNode 标签

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 有把握时自动分类到课本章节，同时映射到系统知识点（孩子不可见） |
| **页面反馈** | AI 结果卡显示课本章节名；汇总页该题归入对应章节 |
| **API/落库** | CaseAiResult.textbookTopicId 非空 + CaseTextbookTopicTag(source=vlm) + CaseKnowledgeTag(source=vlm) |
| **成功条件** | 置信度 ≥ 0.5 → CaseTextbookTopicTag 和 CaseKnowledgeTag 同时存在；textbookTopicId 在 16 个种子章节范围内；nodeId 在 48 个系统节点范围内 |
| **失败降级** | 无（高置信时必须写入） |
| **当前实现** | ✅ 已实现（process/route.ts: `HIGH_CONFIDENCE_THRESHOLD = 0.5`，persistAiResult 事务中双写） |
| **测试层** | CI 闭环（R1a）DB 验证 |

### CL-08：低置信时进入"未分类/暂未覆盖"，不制造假分类

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 不确定时诚实告知"暂未覆盖"，不编造分类 |
| **页面反馈** | 汇总页该题归入"未分类"组（topic=null，排在最后） |
| **API/落库** | CaseAiResult.textbookTopicId = null；无 CaseTextbookTopicTag；无 CaseKnowledgeTag |
| **成功条件** | 置信度 < 0.5 → textbookTopicId=null；无 vlm 标签；汇总页 topic=null 分组有此题 |
| **失败降级** | 无（低置信诚实降级本身就是降级路径） |
| **当前实现** | ✅ 已实现（process/route.ts: 低置信候选不自动挂 tag） |
| **测试层** | CI 闭环（R1a） |

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

### CL-10：题目汇总默认打开，按课本章节分组，原图默认折叠

| 维度 | 说明 |
|------|------|
| **用户目标** | 进入 /nana 后默认看到题目汇总，按课本章节分组排列，不需展开就能扫题 |
| **页面反馈** | 汇总 tab 默认选中；题目按章节分组（chapter + section）；原图默认折叠，点击展开 |
| **API/落库** | `GET /api/nana/cases/summary` → `{ groups: [{ topic, cases }] }`，未分类组排最后 |
| **成功条件** | 多道题正确分入各自章节组；同一章节的题在一起；未分类题在最后；原图不默认展开 |
| **失败降级** | 无 CaseAiResult 的题 → processStatus=pending，归入未分类 |
| **当前实现** | ✅ 已实现（summary/route.ts 按 TextbookTopic 分组） |
| **测试层** | CI 闭环（R1a） |

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

### CL-12：知识地图出现琥珀"收过题"，但 StudentNodeState 不变绿

| 维度 | 说明 |
|------|------|
| **用户目标** | 拍过题的知识点在地图上有琥珀色标记，但不假装"已掌握" |
| **页面反馈** | 知识地图中收过题的节点有琥珀色环 + "收过题"标签；无绿色"掌握"节点 |
| **API/落库** | `GET /api/diagnosis/map` → `caseEvidenceCount > 0` 的节点有琥珀标记；StudentNodeState 无新增记录 |
| **成功条件** | 挂过 CaseKnowledgeTag 的节点 caseEvidenceCount > 0；StudentNodeState 记录数不变（beforeCount == afterCount）；status 合法值为 stable/uncertain/gap/untested（无 mastered） |
| **失败降级** | 无（琥珀证据是正交弱标记，不改 status） |
| **当前实现** | ✅ 已实现（map/route.ts: `caseEvidenceCount` 聚合，不写 StudentNodeState） |
| **测试层** | CI 闭环（R1a）DB 验证 |

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

### CL-14：AI、网络或音频失败后，题仍在、状态诚实、可以重试

| 维度 | 说明 |
|------|------|
| **用户目标** | AI 整理失败时，题不丢，看到诚实的失败状态，可以点重试 |
| **页面反馈** | AI 整理区显示"整理没成功，可以重试" + 重试按钮；题图和录音仍在 |
| **API/落库** | CaseAiResult.processingStatus = "failed"；Case + Artifact 仍存在 |
| **成功条件** | 失败时 processingStatus=failed；重试 POST /process 成功后 processingStatus=success；题图不丢 |
| **失败降级** | 此 CL 本身就是降级路径的验证 |
| **当前实现** | ✅ 已实现（process/route.ts: `persistFailedResult`；capture/page.tsx: `handleRetryProcess`） |
| **测试层** | CI 闭环（R1a，低置信/失败场景） |

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

### CL-16：不同用户之间题图、录音、AI 结果和汇总严格隔离

| 维度 | 说明 |
|------|------|
| **用户目标** | 用户 A 看不到用户 B 的题、录音、AI 结果、汇总 |
| **页面反馈** | 每个用户只看到自己的数据 |
| **API/落库** | 所有 Nana API 用 `where: { studentId: session.user.id }` 过滤 |
| **成功条件** | 用户 A 拍题后，用户 B 的 summary / map / case list 中无 A 的数据 |
| **失败降级** | 无（隔离是硬性安全要求） |
| **当前实现** | ✅ 已实现（所有 /api/nana/cases 路由均用 `session.user.id` 过滤） |
| **测试层** | CI 闭环（R1a，跨用户场景） |

---

## 4. 测试场景覆盖矩阵

| # | 场景 | 覆盖的 CL | 测试层 | 轮次 | 说明 |
|---|------|-----------|--------|------|------|
| S1 | 清晰题图 + 录音：完整成功路径 | CL-01~CL-08, CL-10~CL-12, CL-15 | CI 闭环 | R1a | 黄金路径，假 Provider 高置信 |
| S2 | 清晰题图、不录音 | CL-03, CL-04, CL-06 | CI 闭环 | R1a | 验证语音确实可选 |
| S3 | 音频失败、图片成功 | CL-05, CL-14 | CI 闭环 | R1a | 假 Provider 返回 audioStatus=failed，题图结果正常 |
| S4 | 倾斜/不完整图片：低置信、诚实降级 | CL-06, CL-08, CL-14 | CI 闭环 | R1a | 假 Provider 低置信 → 未分类 |
| S5 | AI 分类错误后手动纠正 | CL-09, CL-10 | CI 闭环 | R1b | 依赖 TD-006；验证纠正后汇总更新（不含打印） |
| S6 | 三个不同章节的题 | CL-07, CL-10, CL-11, CL-12 | CI 闭环 | R1a | 验证真正的章节分组 |
| S7 | 连续拍三题 | CL-04, CL-15 | CI 闭环 | R1a | 验证不被 AI 等待阻塞、无竞态 |
| S8 | 30 题数据集 | CL-10, CL-11, CL-12 | CI 闭环 | R1d | 验证汇总速度、滚动和图谱性能 |
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
| CL-10 | ✓ | | | | ✓ | ✓ | | ✓ | | |
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
| CL-10 | ✓ | ✓ | | ✓ | | |
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

> **v1 最小错题集闭环尚未完成。** CL-09、CL-13 未实现，其余条目多数仍待本框架验证。
> "代码存在"不等于"验收通过"——下表四级状态如实反映当前进度。

### 6.2 实现状态明细（r3.1 四级状态）

| CL | 代码存在 | 确定性测试通过 | 真实 Provider 通过 | 真机通过 | 实现位置 |
|----|:--------:|:--------------:|:-------------------:|:--------:|----------|
| CL-01 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `/nana/page.tsx` 拍题入口 |
| CL-02 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `capture/page.tsx` + `POST /api/nana/cases` |
| CL-03 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `capture/page.tsx` + `case-analyzer.ts` |
| CL-04 | ✅ | ❌ 待 R1a | — | ❌ 待发版 | `capture/page.tsx: setSaveState` 在 `triggerCaseProcess` 前 |
| CL-05 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `case-analyzer.ts: audioTranscodeFailed` + `deriveAudioStatus` |
| CL-06 | ✅ | ❌ 待 R1a | ❌ 待 R4 | ❌ 待发版 | `case-analyzer.ts` 7 字段 + `process/route.ts` 持久化 |
| CL-07 | ✅ | ❌ 待 R1a | ❌ 待 R4 | — | `process/route.ts: HIGH_CONFIDENCE_THRESHOLD=0.5` 双写 |
| CL-08 | ✅ | ❌ 待 R1a | ❌ 待 R4 | — | `process/route.ts: persistAiResult` 低置信不挂 tag |
| CL-09 | ❌ 未实现 | — | — | — | **TD-006**：无 PATCH/PUT API、无"改分类" UI |
| CL-10 | ✅ | ❌ 待 R1a | — | — | `summary/route.ts` 按 TextbookTopic 分组 |
| CL-11 | ✅ | ❌ 待 R1a | — | — | `summary/route.ts` groups 结构 |
| CL-12 | ✅ | ❌ 待 R1a | — | — | `map/route.ts: caseEvidenceCount` + 不写 StudentNodeState |
| CL-13 | ❌ 未实现 | — | — | — | **Nana 打印页**：无 `/nana/print-preview` 路由 |
| CL-14 | ✅ | ❌ 待 R1a | ❌ 待 R4 | — | `process/route.ts: persistFailedResult` + `handleRetryProcess` |
| CL-15 | ✅ | ❌ 待 R1a | — | — | `capture/page.tsx: currentCaseIdRef + abortControllerRef` |
| CL-16 | ✅ | ❌ 待 R1a | — | — | 所有路由 `where: { studentId: session.user.id }` |

> **状态含义说明：**
> - **代码存在** = 找得到实现代码（不等于验收通过）
> - **确定性测试通过** = 假 Provider + 临时 DB 的 CI 闭环已验证
> - **真实 Provider 通过** = 豆包真实质量已验证（R4 Smoke）
> - **真机通过** = 手机权限和体感已验证（发版前抽检）

### 6.3 未实现项与阻塞

| CL | 阻塞项 | 阻塞轮次 | 影响 |
|----|--------|----------|------|
| CL-09 | **TD-006**：无 PATCH/PUT API、无"改分类" UI、双写口径未统一 | R1b | 手动纠错路径无法测试 |
| CL-13 | **Nana 打印页**：无 `/nana/print-preview` 路由 | R1c | 打印预览验证无法做 |

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
