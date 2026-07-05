# Stage 3 v3-revised Round 2 P1 修复复审报告

> **复审时间**：2026-07-05
> **复审范围**：commit `2f0f26c` — fix stage3-r2: 清理旧 vlm 标签并用事务保护 process 持久化
> **前置审计**：[stage3-revised-round2-p1-fix-audit.md](stage3-revised-round2-p1-fix-audit.md)（commit `81d8a4a`，❌ 不通过，3 个 P1）
> **审计文件**：
> - `src/app/api/nana/cases/[id]/process/route.ts`
> - `src/__tests__/integration/nana/process-api.test.ts`
> **审计结论**：✅ **通过**

---

## 逐项复审

### 1. $transaction 包裹 ✅

`persistAiResult` 全部 DB 操作在 `prisma.$transaction(async (tx) => {...})` 中，所有调用用 `tx.` 前缀。

**验证**：
- L119: `return prisma.$transaction(async (tx) => {`
- L123: `tx.caseTextbookTopicTag.deleteMany`
- L126: `tx.caseKnowledgeTag.deleteMany`
- L131: `tx.caseAiResult.upsert`
- L168: `tx.artifact.findFirst` / `tx.artifact.update` / `tx.artifact.create`
- L184: `tx.caseKnowledgeTag.upsert`
- L202: `tx.caseTextbookTopicTag.upsert`

---

### 2. CaseKnowledgeTag 清理 ✅

事务内同时清理 `tx.caseTextbookTopicTag.deleteMany` 和 `tx.caseKnowledgeTag.deleteMany`，仅在 `!existing?.textbookTopicEdited` 时执行。

**验证**（L122-128）：
```typescript
if (!existing?.textbookTopicEdited) {
  await tx.caseTextbookTopicTag.deleteMany({
    where: { caseId, source: "vlm" },
  });
  await tx.caseKnowledgeTag.deleteMany({
    where: { caseId, source: "vlm" },
  });
}
```

---

### 3. manual 标签保护 ✅

`deleteMany` 的 where 限定 `source: "vlm"`，manual 标签不受影响。

---

### 4. POST 响应基于持久化数据 ✅

响应字段全部取自 `persistedAiResult.*`（上一轮已确认，本轮未改动）。

---

### 5. 测试数据修复 ✅

`beforeAll` 动态取 2 个 TextbookTopic，`TB-020` 全部替换为 `validTopicId2`，无残留。

**验证**：grep `TB-020` 无匹配。

---

### 6. 新增测试覆盖 ✅

| 测试 | 行号 | 覆盖点 |
|------|------|--------|
| 低置信重跑清理 vlm 标签（课本+知识点） | L516-561 | 第二次 mock 低置信候选，验证旧 vlm 标签被清除 |
| manual 标签保护（课本+知识点） | L563-624 | 预置 manual 标签，重跑后 manual 标签不受影响 |
| POST 响应返回持久化数据 | L626-678 | 验证响应字段取自 DB 而非 AI 原始返回 |

---

### 7. 构建和测试 ✅

| 验证项 | 结果 |
|--------|:----:|
| `npm run build` | ✅ 编译成功，56/56 页面生成 |
| `npx vitest run` | ✅ 18/18 通过，0 失败 |

---

### 8. commit message ✅

`fix stage3-r2: 清理旧 vlm 标签并用事务保护 process 持久化` — 无括号，有 `fix` 前缀，符合规范。

---

## P1 问题修复确认

| # | 原问题 | 修复方式 | 状态 |
|---|--------|----------|:----:|
| P1-1 | CaseKnowledgeTag(source="vlm") 无清理逻辑 | 事务内增加 `tx.caseKnowledgeTag.deleteMany` | ✅ |
| P1-2 | persistAiResult 无事务包裹 | 全部包进 `prisma.$transaction(async (tx) => {...})` | ✅ |
| P1-3 | 3 个测试使用不存在的 TB-020 | `beforeAll` 动态取 TextbookTopic，替换为 `validTopicId2` | ✅ |

---

## 审计结论

**✅ 通过。** 上一轮审计发现的 3 个 P1 问题全部修复，构建和测试全绿。可以进入 Round 3。
