# Nana 测试框架 r3 + 验收契约 · 审计报告

> 关联计划: `doc/plan/nana-test-framework-plan.md`（r3）
> 关联规格: `doc/spec/nana-v1-minimum-loop-acceptance.md`（验收契约）
> 执行日志: 无（本轮为文档冻结，无代码变更）
> 审计日期: 2026-07-12
> 审计范围: 验收契约 CL-01～CL-16 实现状态声明 + 测试计划 r3 与契约一致性 + r3 修订项落实

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

两份文档质量很高，核心逻辑经得起代码验证。验收契约中 14 个"已实现"声明全部核实属实，2 个"未实现"声明也准确。r3 测试计划对评审反馈的修正到位，假 Provider 哈希映射方案、ffmpeg 依赖、时间阈值统一等关键问题都解决了。

但有 2 个需要修复的问题：

1. **P1：测试计划遗漏 S7（连续拍题）和 S10（跨用户隔离）的显式任务定义。** 验收契约 §4 矩阵将这两个场景归入 R1a，但测试计划任务分解中没有对应的 spec 任务。需要补充。
2. **P2：假 Provider 哈希映射的描述有歧义。** 计划说"图片内容哈希"，但实际代码哈希的是完整 data URL 字符串（含 `data:image/jpeg;base64,` 前缀）。需明确以免实现时算错。

修复这两个问题后即可启动 R1a。

---

## 检查清单

### 计划一致性
- [x] 验收契约 CL-01～CL-16 与测试计划 r3 场景映射一致
- [x] r3 修订摘要中的 7 项修正均在计划正文中落实
- [ ] **S7（连续拍题）和 S10（跨用户隔离）在测试计划任务分解中缺少显式任务定义** — P1

### 代码声明核实（验收契约 → 代码）

| CL | 契约声明 | 核实结果 | 代码位置 |
|-----|---------|---------|----------|
| CL-04 | `setSaveState("saved")` 在 `triggerCaseProcess` 之前 | ✅ 属实 | `capture/page.tsx:212` 先 `setSaveState("saved")`，`225` 才调 `triggerCaseProcess` |
| CL-05 | `audioTranscodeFailed` 降级 + `deriveAudioStatus` | ✅ 属实 | `case-analyzer.ts:286` 设置 `audioTranscodeFailed`，`441-443` 降级为 `failed`，`141` 导出 `deriveAudioStatus` |
| CL-06 | 7 字段返回 + `process/route.ts` 持久化 | ✅ 属实 | `case-analyzer.ts` 返回 7 字段，`process/route.ts:135-142` upsert CaseAiResult |
| CL-07 | `HIGH_CONFIDENCE_THRESHOLD=0.5` + 双写 tag | ✅ 属实 | `process/route.ts:39` 阈值定义，`196-228` 高置信时双写 CaseKnowledgeTag + CaseTextbookTopicTag |
| CL-08 | 低置信不挂 tag | ✅ 属实 | `process/route.ts:115-116` 过滤 `confidence >= HIGH_CONFIDENCE_THRESHOLD`，低置信不进入 upsert |
| CL-09 | ❌ 未实现：无 PATCH/PUT API | ✅ 属实 | `grep` 确认 `/api/nana/` 下无 `PATCH`/`PUT` 导出 |
| CL-12 | `caseEvidenceCount` 聚合 + 不写 StudentNodeState | ✅ 属实 | `map/route.ts:48-55` groupBy CaseKnowledgeTag 聚合，`172` 返回 count，注释明确"不写 StudentNodeState" |
| CL-13 | ❌ 未实现：无 `/nana/print-preview` | ✅ 属实 | `/nana/` 下无 print-preview 路由；现有 `/print-preview/page.tsx:39` 调 `/api/error-items/list` |
| CL-14 | `persistFailedResult` + `handleRetryProcess` | ✅ 属实 | `process/route.ts:246` persistFailedResult 函数，`337` 调用；`capture/page.tsx:290` handleRetryProcess |
| CL-15 | `currentCaseIdRef` + `AbortController` | ✅ 属实 | `capture/page.tsx:117` currentCaseIdRef，`119` abortControllerRef，`227/233/262/302/307` 多处竞态检查 |
| CL-16 | 所有路由 `where: { studentId: session.user.id }` | ✅ 属实 | `route.ts:50`、`summary/route.ts:28`、`[id]/route.ts:31`、`process/route.ts:280,404` 全部过滤 |

### Schema 声明核实

| 契约/计划声明 | 核实结果 | 代码位置 |
|--------------|---------|----------|
| `processingStatus` 在 `CaseAiResult` 上，不在 `Case` 上 | ✅ 属实 | `schema.prisma:399` 在 `CaseAiResult` model 内 |
| `StudentNodeState.status` 合法值 = `stable/uncertain/gap/untested`，无 `mastered` | ✅ 属实 | `schema.prisma:204` 注释 `// stable|uncertain|gap|untested` |
| `textbookTopicEdited` 字段存在 | ✅ 属实 | `schema.prisma:390` |
| 环境变量名是 `LITE_ENDPOINT_ID`（非 `VOLCENGINE_LITE_ENDPOINT`） | ✅ 属实 | r2 已修正，r3 保持 |

### 代码质量
- [x] 无代码变更（本轮纯文档）
- [x] 伪代码示例风格一致，类型标注清晰

### 安全性
- [x] 无密钥泄露（伪代码中 `VOLCENGINE_API_KEY=fake-key` 是测试用占位）
- [x] 跨用户隔离验证（CL-16）已纳入测试范围
- [x] Provider Smoke 不向生产容器注入 Key（r2 修正，r3 保持）

### 偏离复核
本轮无执行日志，无偏离记录。

### 上游兼容性
- [x] 未修改上游表结构（纯文档）
- [x] 测试计划明确所有新增文件在独立目录（`e2e/`、`tests/fixtures/`、`scripts/`）

### 部署审计
本轮不涉及部署。

### Agent 同步一致性
- [x] 本轮未修改 `doc/agents/`，无需运行 `check-agent-sync.js`

### 测试
- [x] 本轮无代码变更，无需运行测试
- [x] 已有单测/集测（216+18）不在本轮范围（计划 §4.6 已声明）

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | 验收契约 §4 将 S7（连续拍题竞态）和 S10（跨用户隔离）归入 R1a，但测试计划任务分解中没有对应的 spec 任务。S7 和 S10 没有被分配到任何 task 2.x 中。 | `doc/plan/nana-test-framework-plan.md` §3 | 在任务 2.5 后新增任务 2.5b（连续拍题 spec）和 2.5c（跨用户隔离 spec），或将其作为 2.5 的子场景明确写入 |
| P2 | 假 Provider 哈希映射描述有歧义：计划说"预计算每张 fixture 题图的 MD5 哈希"/"图片内容哈希"，但实际代码 `crypto.createHash('md5').update(imageUrl).digest('hex')` 哈希的是完整 data URL 字符串（`data:image/jpeg;base64,...`），不是图片原始字节。实现时如果按"图片内容"理解去算文件 MD5，会与 Provider 端的哈希不匹配。 | `doc/plan/nana-test-framework-plan.md` §3 任务 2.1 + §7.2 | 明确注释：哈希对象是 `case-analyzer.ts` 发送的完整 `image_url.url` 字段值（即 data URL 字符串），不是图片文件原始字节。fixture 哈希表应在测试 setup 阶段读取 fixture 文件 → 转 data URL → 算 MD5 |

---

## 详细审计记录

### A. r3 修订项落实检查

| r3 修订项 | 计划中落实位置 | 状态 |
|-----------|--------------|------|
| 新增验收契约 | §1 前置条件引用 + 全文 CL 映射 | ✅ |
| ffmpeg CI 安装 | §3 任务 2.9 + §7.9 CI yaml `Install ffmpeg` step | ✅ |
| 假 Provider 哈希映射 | §3 任务 2.1 + §7.2 伪代码 | ✅（有 P2 歧义） |
| R1a/R1d 范围去重 | §3 任务 2.8 标注"R1d，不在 R1a 范围" + §7.11 R1a 范围不含 2.8 | ✅ |
| 时间阈值统一 | §4.2 性能表"保存后'已收好' >10s=阻塞(CI)/>5s(本地)" + §7.1 步骤 5 | ✅ |
| Fixture 来源约束 | §3 任务 2.7 + 验收契约 §7 | ✅ |
| 手动分类定位 | 验收契约 §1.2 + CL-09 注释 + 计划 §2.1 | ✅ |

### B. 验收契约交叉检查

**CL 覆盖矩阵完整性：** 验收契约 §4 矩阵中每个 CL 至少被 1 个场景覆盖。✅

**CL 与轮次映射一致性：** §5 矩阵与 §4 场景表一致。R1a 覆盖 14 个已实现 CL，R1b 覆盖 CL-09，R1c 覆盖 CL-13，R1d 覆盖 CL-10/11/12（规模场景）。✅

**实现状态计数：** 契约声称 14/16 已实现。核实：CL-01～CL-08（8个）+ CL-10～CL-12（3个）+ CL-14～CL-16（3个）= 14 个 ✅；CL-09 和 CL-13 未实现 ✅。

### C. 测试计划与契约一致性

| 契约场景 | 测试计划任务 | 状态 |
|---------|------------|------|
| S1 黄金路径 | 任务 2.4 | ✅ |
| S2 不录音 | 任务 2.4（隐含） | ✅ |
| S3 音频失败 | 任务 2.5 | ✅ |
| S4 低置信降级 | 任务 2.5 | ✅ |
| S5 手动纠错 | 任务 2.5 R1b 补充 | ✅ |
| S6 三章节分组 | 任务 2.5 | ✅ |
| S7 连续拍题 | **无显式任务** | ❌ P1 |
| S8 30题规模 | 任务 2.8（R1d） | ✅ |
| S9 打印预览 | 任务 2.5 R1c 补充 | ✅ |
| S10 跨用户 | **无显式任务** | ❌ P1 |

---

## 用户验证指南

本轮为文档审计，无需页面验证。修复 P1 和 P2 后，用户确认契约即可启动 R1a。
