# 项目进展审查报告 · 审计报告

> 审计对象: doc/plan/project-progress-review-2026-06-20.md
> 审计日期: 2026-06-20
> 审计人: audit-agent

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

这份进展审查报告整体靠谱，主干事实（M1-M3c 已完成、前端未建、基础设施就绪）都能在代码和文件中找到证据。但存在 **3 处事实错误**、**1 处遗漏** 和 **1 处表述不足**，需要修正后再作为正式进展报告使用。

核心问题：报告中 M2 节的实现文件指错了（状态机在 `session-machine.ts`，不是 `diagnosis-orchestrator.ts`）；附录中 `knowledge-graph.ts` 实际文件名是 `graph.ts`；DECISIONS.md 实际有 15 项裁决，报告说 10 项漏了 5 项；5 个计划的执行日志缺失但报告标了"已执行"。这些问题不影响整体判断方向，但作为正式审查报告不可接受。

## 检查清单

### 计划一致性
- [x] 各模块进展描述与 progress.md 一致
- [x] 里程碑状态正确（M1/M2/M3a/M3c 完成，M3b/M4 未启动）
- [x] 下一步建议合理

### 代码质量（事实核查）
- [x] 报告声称的关键文件均存在且可验证
- [x] 110/110 测试计数可验证（test:all 脚本累计值确为 110）
- [x] Prisma 中 8 张新表全部确认存在

### 安全性
- [x] 无敏感信息泄露
- [x] 无密钥暴露

### 上游兼容性
- [x] 前端方案已识别 146+ 上游文件和「碰不得」清单
- [x] 风险 1 准确指出了上游冲突风险

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0, 3/3 OK）

### 测试验证
- [x] 测试文件均存在（unit + integration 共 33 个文件）
- [x] test:all 脚本累计覆盖值确为 110（graph 26 + M2 31 + M3a 18 + M3c 35）
- [!] 本次审计未能实际执行 `npx vitest run`（WSL 环境限制），测试通过性的"110/110"结论依赖 progress.md 中上一轮审计记录，可信但未经本次实时验证

## 问题清单

| 严重度 | 问题 | 所在位置 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | **M2 实现文件指错**：报告 2.2 节说状态机在 `lib/diagnosis-orchestrator.ts`，实际 8 步状态机在 `lib/session-machine.ts`。`diagnosis-orchestrator.ts` 是 M3c 的 5 个纯逻辑编排函数 | 第 33 行 | 改为"状态机在 `lib/session-machine.ts`；编排器在 `lib/diagnosis-orchestrator.ts`（5 个纯逻辑函数，24 用例）" |
| P1 | **附录文件路径错误**：报告 191 行写 `lib/knowledge-graph.ts`，实际文件名是 `lib/graph.ts`。不存在 `knowledge-graph.ts` 这个文件 | 第 191 行 | 改为 `lib/graph.ts` |
| P2 | **决策数量少报**：报告 3.1 节说"10 项已裁决"，但 DECISIONS.md 中 D-1 到 D-15 共 15 项裁决（不含门禁），差了 5 项。报告本身的表格也只列了 D-1~D-10 | 第 77 行 | 改为"15 项已裁决"并补全 D-11~D-15 |
| P2 | **决策编号内容错位**：报告表格中 D-7 写的是"DeepSeek 主 AI + Claude/Codex 评审"，但 DECISIONS.md 中 D-7 实际是"KST-lite 只传播一层 dependents"；DeepSeek 决策是 D-14。D-6 报告写"纸质包 PDF/打印双通道"，实际 D-6 是"纸质包 frontier 优先 + gap 补位"。D-8 报告写"SQLite 单文件"，实际 D-8 是"当前不调 LLM" | 第 88-90 行 | 重新对齐决策编号与 DECISIONS.md 原文 |
| P2 | **执行日志缺失未标注**：6 个标注"✅ 已执行"的计划中，5 个缺少对应的执行日志（executionlog/）：M3-node-extraction、M3a-tracking-skeleton、prompt-revision、three-agent-prompt-revision、opencode-dual-runtime。仅有 M3a 和 prompt-revision 有审计报告。报告未说明这些日志缺失的原因 | 第四部分 | 补充说明：这些项目是"轻量执行"或"嵌入其他轮次"，日志合并/未单独产出 |
| P3 | **M1 配题信息归属模糊**：报告 2.1 节 M1 下列出"配题：地基层 BG001-104、M1 节点 30+4、M2a 节点 50+1…"，但 Item 表和配题实际是在 M3a/M3b 阶段完成的，M1 阶段仅完成 KnowledgeNode/Edge 的图谱结构 | 第 28 行 | 标注配题产出来源（M3a 种子导入）以区分 M1 边界 |

## 遗漏说明

1. **doc/reference/ 新增文件未盘点**：git status 显示 `codex_long_term_memory.md`、`codex_memory_decisions/`、`fof-semantic-mvp-dual-runtime-audit-notes.md`、`installed-skills-catalog.md` 四个新文件/目录，报告未提及。如果是有意不纳入，应注明。

2. **doc/research/ 目录庞大但仅列了 4 项**：除 VLM 转写、竞品调研、拍照指南、Codex 交接外，还有大量真题解析 docx、提取页图片、调研报告等材料未在报告盘点中体现。

3. **设计债归属错位**：DECISIONS.md 中两项设计债（TD-1, TD-2）标注为 `proposed`，但 progress.md M3c 轮将其标注为"在册"，报告 3.2 节也标 `proposed`，这倒是一致的。但报告未说明谁负责何时处理这些设计债。

## 用户验证指南

报告本身不需要运行验证。若要验证报告中关键文件：

1. 确认 `lib/session-machine.ts` 存在（19 行，状态枚举）—— 这才是 M2 状态机
2. 确认 `lib/diagnosis-orchestrator.ts` 存在（5 个 export function）—— 这是 M3c 编排器
3. 确认 `lib/graph.ts` 存在（不是 knowledge-graph.ts）
4. 确认 `doc/DECISIONS.md` 有 15 项 D-N 决策（不是 10 项）
5. 在 WSL 中运行 `npx vitest run` 验证 110/110 实际是否通过
