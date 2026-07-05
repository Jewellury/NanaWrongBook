# Stage 3 v3-revised Round 2 P1 修复审计报告

> **审计时间**：2026-07-05
> **审计范围**：Round 2 P1 修复（commit `81d8a4a`）
> **审计文件**：
> - `src/app/api/nana/cases/[id]/process/route.ts`
> - `src/__tests__/integration/nana/process-api.test.ts`
> **审计结论**：❌ **不通过**，发现 3 个 P1 问题，须修复后重新审计

---

## 逐项审计结果

### 审计项 1：POST 响应返回持久化数据 ✅ 通过

**代码位置**：`route.ts` L332-365

`persistAiResult()` 返回值是 `prisma.caseAiResult.findUnique()` 的重新查询结果（L216-225），包含 DB 实际值。POST 响应中 `questionSummary`、`textbookTopic`、`feedback` 等字段均取自 `persistedAiResult.*`，不再引用 `result.*`（AI 原始返回）。

**结论**：响应确实返回持久化后的数据。

---

### 审计项 2：用户编辑保护 ✅ 通过

**代码位置**：`route.ts` L142-151（upsert update 分支）

```typescript
questionSummary: existing?.questionSummaryEdited ? undefined : result.questionSummary,
textbookTopicId: existing?.textbookTopicEdited ? undefined : topTopic?.topicId,
```

当 `questionSummaryEdited=true` 或 `textbookTopicEdited=true` 时，Prisma update 中对应字段设为 `undefined`（不更新）。POST 响应使用重新查询的 `persistedAiResult`，其中保留了用户编辑的值。

测试 #5（L298-324）和 #5b（L327-353）验证了 DB 层保护。测试 "POST 响应返回持久化后的数据"（L554-606）验证了响应层保护——但因测试数据问题失败（见 P1-3）。

**结论**：逻辑正确，DB 和响应都保留用户编辑。

---

### 审计项 3：清理旧 CaseTextbookTopicTag(source="vlm") ✅ 逻辑正确

**代码位置**：`route.ts` L118-123

```typescript
if (!existing?.textbookTopicEdited) {
    await prisma.caseTextbookTopicTag.deleteMany({
      where: { caseId, source: "vlm" },
    });
}
```

用户未编辑时，先 delete 所有 vlm 课本标签，再 upsert 新的高置信标签。若第二次运行全部低置信/空候选，旧标签被删除且不新建——行为正确。

**但**：清理和写入不在事务中（见 P1-2），存在半状态风险。

**结论**：清理逻辑正确，但缺少事务保护。

---

### 审计项 4：清理旧 CaseKnowledgeTag(source="vlm") ❌ P1 失败

**问题**：代码中 **完全没有** `CaseKnowledgeTag` 的 `deleteMany` 操作。

`persistAiResult()` L179-193 只对高置信候选做 `upsert`（创建或更新），从不删除旧标签。这意味着：

- 第一次 /process 创建 `CaseKnowledgeTag(nodeId=A, source="vlm")`
- 第二次 /process 返回 `nodeId=B`，会创建 `CaseKnowledgeTag(nodeId=B, source="vlm")`
- **旧的 nodeId=A 标签永远残留**，不会被清理

这与 `CaseTextbookTopicTag` 的清理逻辑不对称，是审计重点第 4 项明确要求的场景。

**修复建议**：在 L118 清理块中增加：
```typescript
await prisma.caseKnowledgeTag.deleteMany({
  where: { caseId, source: "vlm" },
});
```

---

### 审计项 5：source="manual" 标签保护 ✅ 通过

`deleteMany` 的 where 条件限定 `source: "vlm"`，不会触及 `source: "manual"` 的标签。测试 #510-552 验证了课本标签的手动保护（但因 TB-020 不存在而失败，非逻辑问题）。

**结论**：manual 标签保护逻辑正确。

---

### 审计项 6：事务原子性 ❌ P1 失败

**问题**：`persistAiResult()` 中的 5 步操作全部是独立的 Prisma 调用，**没有** `prisma.$transaction()` 包裹：

1. `deleteMany` CaseTextbookTopicTag（L120）
2. `upsert` CaseAiResult（L126）
3. `findFirst` + `update`/`create` Artifact transcript（L163-176）
4. `upsert` CaseKnowledgeTag × N（L180-193）
5. `upsert` CaseTextbookTopicTag × N（L197-213）

如果步骤 1 成功（旧标签已删除）但步骤 2 失败（CaseAiResult 未更新），数据库将处于半状态：旧标签已删、新结果未存。

**修复建议**：将整个 `persistAiResult` 包裹在 `prisma.$transaction(async (tx) => { ... })` 中，所有 Prisma 调用改用 `tx` 前缀。

---

### 审计项 7：集成测试覆盖 ⚠️ 部分通过

**已有覆盖**：
- ✅ 课本标签清理（不同高置信候选）：L463-508
- ✅ 手动课本标签保护：L510-552
- ✅ POST 响应返回持久化数据：L554-606
- ✅ 用户摘要保护：L298-324
- ✅ 用户分类保护：L327-353

**缺失覆盖**：
- ❌ 知识点标签清理（因功能缺失，测试也缺失）
- ❌ 低置信/空候选时旧课本标签清理（现有测试只换了高置信候选，没测低置信场景）
- ❌ 手动知识点标签保护
- ❌ 事务原子性 / 半状态防护

---

### 审计项 8：构建和测试 ❌ P1 失败

**构建**：`npm run build` ✅ 通过（33.9s 编译成功，56/56 静态页面生成）

**集成测试**：`npx vitest run process-api.test.ts` ❌ **3 failed / 14 passed**

3 个失败测试均因使用 `TB-020` 作为 `textbookTopicId`，但该 ID 不存在于种子数据中（种子数据只有 TB-001 ~ TB-016）。`CaseTextbookTopicTag` 有 FK 约束指向 `TextbookTopic.id`，插入失败导致整个 POST 返回 500 内部错误。

| 失败测试 | 行号 | 失败原因 |
|----------|------|----------|
| "清理旧的 source='vlm' 标签" | L463 | 第二次 mock 使用 TB-020，FK 约束失败 |
| "手动添加的标签不受影响" | L510 | 第二次 mock 使用 TB-020，FK 约束失败 |
| "POST 响应返回持久化后的数据" | L554 | 第二次 mock 使用 TB-020，FK 约束失败 |

**修复建议**：将测试中的 `TB-020` 改为种子数据中存在的 ID（如 `TB-009` 或 `TB-011`）。

---

### 审计项 9：commit message ⚠️ 轻微问题

当前 commit message：
```
修复 Stage 3 v3-revised Round 2 P1 问题：POST 响应返回持久化数据，重复运行清理旧 vlm 标签
```

- ✅ 无括号（符合 PowerShell 规则）
- ⚠️ 未使用 conventional commit 前缀（其他 commit 用 `feat:`、`docs:`），建议改为 `fix: Stage 3 v3-revised Round 2 P1 ...`

**结论**：轻微问题，不阻塞。

---

## P1 问题汇总

| # | 问题 | 位置 | 修复建议 |
|---|------|------|----------|
| P1-1 | CaseKnowledgeTag(source="vlm") 无清理逻辑 | route.ts L179-193 | 增加 `deleteMany({ where: { caseId, source: "vlm" } })` |
| P1-2 | persistAiResult 无事务包裹 | route.ts L109-226 | 用 `prisma.$transaction()` 包裹所有 DB 操作 |
| P1-3 | 3 个测试使用不存在的 TB-020 | test.ts L492, L535, L586 | 改为种子数据中存在的 ID（如 TB-009） |

---

## 审计结论

**❌ 不通过。** 发现 3 个 P1 问题，须修复后重新提交审计。

修复顺序建议：
1. P1-1：补上 CaseKnowledgeTag 清理逻辑
2. P1-2：用 `$transaction` 包裹 `persistAiResult`
3. P1-3：修复测试数据（TB-020 → 存在的 ID）
4. 补充缺失测试：低置信清理、知识点标签清理、手动知识点标签保护
5. 重新运行 `npm run build` + 集成测试
6. 重新提交审计

**在以上 P1 问题修复并重新审计通过前，不得进入 Round 3。**
