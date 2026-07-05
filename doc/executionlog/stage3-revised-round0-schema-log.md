# Stage 3 v3-revised Round 0 — Schema + Seed 脚本执行日志

> **轮次**: Round 0（Schema only, create-only）
> **计划**: [stage3-ai-integration-plan-v3-revised.md](../plan/stage3-ai-integration-plan-v3-revised.md) §2 / §3 / §16
> **日期**: 2026-07-05
> **执行者**: execute-agent (Claude)
> **状态**: ✅ migration 已应用 + seed 已灌入 + 验证通过

---

## 0. 执行范围

| 步骤 | 内容 | 状态 |
|------|------|:----:|
| 1 | 修改 `prisma/schema.prisma`：新增 4 表 + Case 加 relation（不加列） | ✅ 完成 |
| 2 | `npx prisma migrate dev --name stage3_revised_ai_card --create-only` | ✅ 完成（仅生成 SQL） |
| 3 | 新增 `prisma/seed_textbook_topics.ts`（16 topics + 48 mappings，upsert） | ✅ 完成 |
| 4 | 交付报告，用户评审通过 | ✅ 完成 |
| 5 | 修复 seed 脚本：数量异常时 throw Error（评审闸门 1） | ✅ 完成 |
| 6 | 显式指定 `DATABASE_URL` 执行 migration（评审闸门 2） | ✅ 完成 |
| 7 | 执行 seed 脚本 | ✅ 完成 |
| 8 | 验证 4 张新表 + 数据条数 | ✅ 完成 |
| 9 | `npm run build`（能跑则跑） | ⚠️ pre-existing 错误，与本次无关 |
| 10 | 提交 schema + migration + seed + executionlog | ✅ 完成 |

**未做的事**（严格守范围）：
- ❌ 未写任何业务代码 / API / 前端组件
- ❌ 未改 `CaseKnowledgeTag` 任何字段
- ❌ 未给 Case 表数据库结构加列

---

## 1. 变更文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | modified | 新增 4 model + Case 加 2 个 Prisma relation 声明 |
| `prisma/migrations/20260705011104_stage3_revised_ai_card/migration.sql` | new | `--create-only` 生成，已应用 |
| `prisma/seed_textbook_topics.ts` | new | 种子脚本，已执行 |
| `doc/executionlog/stage3-revised-round0-schema-log.md` | new | 本执行日志 |

> ⚠️ `doc/plan/stage3-ai-integration-plan-v3-revised.md` 在工作区也有改动，但**不是本轮改动**——是会话前已有的未提交改动（Round UI-0 状态更新 + processingStatus 表格补充）。不在本次 commit 范围内。

---

## 2. Schema diff 摘要

### 2.1 Case 模型（只加 Prisma relation 声明，表结构不加列）

```prisma
 model Case {
   id        String     @id @default(cuid())
   studentId String
   createdAt DateTime   @default(now())
   artifacts Artifact[]
   knowledgeTags CaseKnowledgeTag[]
+  aiResult          CaseAiResult?           // 1:1，FK 在 CaseAiResult.caseId 侧
+  textbookTopicTags CaseTextbookTopicTag[]  // 1:N，FK 在 CaseTextbookTopicTag.caseId 侧
 }
```

- 两个字段都是 Prisma 反向关系声明，不产生 Case 表新列
- FK 分别在 `CaseAiResult.caseId` 和 `CaseTextbookTopicTag.caseId` 侧
- migration SQL 中 Case 表无任何 ALTER

### 2.2 新增 4 个 model

| Model | 用途 | 关键约束 |
|-------|------|----------|
| `TextbookTopic` | 课本章节（16 条种子） | `@@index([stage, order])`，`updatedAt @updatedAt`（无 SQL DEFAULT） |
| `TextbookNodeMapping` | 章节↔节点映射（48 条） | 复合主键 `(textbookTopicId, nodeId)`；`nodeId` 无 FK（松挂接，守铁律 3） |
| `CaseAiResult` | AI 结果持久化（1:1 Case） | `caseId @unique`；`textbookTopicId` FK → TextbookTopic `onDelete: SetNull` |
| `CaseTextbookTopicTag` | Case↔课本章节挂载 | `@@unique([caseId, textbookTopicId, source])`；`source` 代码层白名单 `manual/vlm` |

### 2.3 未改动

- `CaseKnowledgeTag` — 原样不动，不扩展任何字段
- `Case` 表数据库结构 — 不加列（只加 Prisma relation 声明）
- 上游所有 model（User / ErrorItem / KnowledgeNode 等）— 不触及

---

## 3. migration.sql 全文

文件路径：`prisma/migrations/20260705011104_stage3_revised_ai_card/migration.sql`

```sql
-- CreateTable
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

-- CreateTable
CREATE TABLE "TextbookNodeMapping" (
    "textbookTopicId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    PRIMARY KEY ("textbookTopicId", "nodeId"),
    CONSTRAINT "TextbookNodeMapping_textbookTopicId_fkey"
      FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseAiResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "questionSummary" TEXT,
    "questionSummaryEdited" BOOLEAN NOT NULL DEFAULT false,
    "transcript" TEXT,
    "textbookTopicId" TEXT,
    "textbookTopicConfidence" REAL NOT NULL DEFAULT 0.0,
    "textbookTopicEdited" BOOLEAN NOT NULL DEFAULT false,
    "initialFeedback" TEXT,
    "possibleMistakeReason" TEXT,
    "nextActionSuggestion" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'skipped',
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "tokenUsage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaseAiResult_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseAiResult_textbookTopicId_fkey"
      FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseTextbookTopicTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "textbookTopicId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseTextbookTopicTag_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseTextbookTopicTag_textbookTopicId_fkey"
      FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TextbookTopic_stage_order_idx" ON "TextbookTopic"("stage", "order");

-- CreateIndex
CREATE INDEX "TextbookNodeMapping_nodeId_idx" ON "TextbookNodeMapping"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAiResult_caseId_key" ON "CaseAiResult"("caseId");

-- CreateIndex
CREATE INDEX "CaseAiResult_textbookTopicId_idx" ON "CaseAiResult"("textbookTopicId");

-- CreateIndex
CREATE INDEX "CaseTextbookTopicTag_caseId_idx" ON "CaseTextbookTopicTag"("caseId");

-- CreateIndex
CREATE INDEX "CaseTextbookTopicTag_textbookTopicId_idx" ON "CaseTextbookTopicTag"("textbookTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseTextbookTopicTag_caseId_textbookTopicId_source_key"
  ON "CaseTextbookTopicTag"("caseId", "textbookTopicId", "source");
```

---

## 4. Seed 脚本摘要

文件路径：`prisma/seed_textbook_topics.ts`（约 190 行）

### 4.1 数据内容

- **16 个 TextbookTopic**：覆盖当前 48 个系统节点（非完整教材目录）
  - TB-001~TB-014 属必修第一册
  - TB-015~TB-016 属必修第二册（复数在必修第二册第七章）
- **48 条 TextbookNodeMapping**：每个 KnowledgeNode 恰好映射到 1 个 TextbookTopic
  - 地基层 BG100-104 按其 `stage` 字段归入对应章节

### 4.2 实现方式

| 项 | 说明 |
|----|------|
| Prisma 客户端 | `new PrismaClient()`，与 `seed_graph.ts` 同款 |
| 幂等导入 | 全部使用 `prisma.textbookTopic.upsert` / `prisma.textbookNodeMapping.upsert` |
| TextbookTopic upsert key | `where: { id }`，update/create 全字段 |
| TextbookNodeMapping upsert key | `where: { textbookTopicId_nodeId: { ... } }`（复合主键），update 空对象 |
| 结果校验 | 末尾 `prisma.textbookTopic.count()` / `prisma.textbookNodeMapping.count()`，期望 16 / 48 |
| 错误处理 | `main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect())` |

### 4.3 评审闸门 1：数量异常时 throw Error

评审反馈要求：`dbTopicCount` / `dbMappingCount` 数量异常时必须 `throw new Error`，让脚本 `exit 1`，不能只 `console.error`。

**修复前**（只打日志，脚本仍 exit 0）：
```typescript
if (dbTopicCount !== 16) {
  console.error(`⚠️  TextbookTopic 入库数量异常：期望 16，实际 ${dbTopicCount}`);
}
```

**修复后**（throw 让脚本 exit 1）：
```typescript
if (dbTopicCount !== 16) {
  throw new Error(`TextbookTopic 入库数量异常：期望 16，实际 ${dbTopicCount}`);
}
```

`main().catch(e => { console.error(e); process.exit(1); })` 会捕获 throw 并 exit 1。

### 4.4 执行结果

```
✅ TextbookTopic 种子数据导入完成
   TextbookTopic: 16 条（DB 实际: 16 条）
   TextbookNodeMapping: 48 条（DB 实际: 48 条）
```

数量校验通过，未 throw。

---

## 5. 审计自查（逐条对照计划要求）

| # | 审计项 | 结果 | 证据 |
|---|--------|:----:|------|
| 1 | migration SQL 只有 CREATE TABLE / INDEX / FK | ✅ | 无 DROP / ALTER 既有表 |
| 2 | CaseKnowledgeTag 无任何结构变化 | ✅ | schema diff 中未触及该 model |
| 3 | Case 表数据库结构不加列 | ✅ | 只加了 2 个 Prisma relation 声明（无 `@column`），migration SQL 中 Case 表无变化 |
| 4 | CaseAiResult.textbookTopicId FK → TextbookTopic, onDelete SetNull | ✅ | migration.sql: `ON DELETE SET NULL` |
| 5 | CaseTextbookTopicTag.source 代码层只允许 manual/vlm | ✅ | schema 注释标注，DB 层无约束（TEXT NOT NULL），后续 Round 代码层白名单强制 |
| 6 | TextbookNodeMapping.nodeId 不加 FK | ✅ | migration.sql 中只有 textbookTopicId 有 FK，nodeId 无 FK |
| 7 | updatedAt 无 DEFAULT | ✅ | migration.sql: `"updatedAt" DATETIME NOT NULL`（无 DEFAULT CURRENT_TIMESTAMP） |
| 8 | seed 走 Prisma upsert | ✅ | 脚本全部使用 `upsert`，`@updatedAt` 自动填充 |

---

## 6. 风险说明

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| 1 | **updatedAt 裸 SQL INSERT 会失败** | 直接用 SQL 插入 TextbookTopic / CaseAiResult 会因 updatedAt NOT NULL 无 DEFAULT 报错 | seed 脚本用 Prisma upsert（`@updatedAt` 自动填充）；后续业务代码也走 Prisma |
| 2 | **TextbookNodeMapping.nodeId 无 FK** | 如果 KnowledgeNode 被删除，映射记录不会自动清理 | 与 CaseKnowledgeTag / MistakeNode 同款松挂接策略，守铁律 3；清理靠应用层 |
| 3 | **seed 脚本未注册到 package.json** | `npm run seed` 仍跑 `seed_graph.ts`，不会自动跑本脚本 | 按设计：本脚本需手动执行 `npx tsx prisma/seed_textbook_topics.ts`，后续部署时单独编排 |
| 4 | **设计债 #4 游离 DB** | `.env` 的 `DATABASE_URL=file:/app/data/dev.db` 本地解析到 `E:\app\data\dev.db`（仓库外游离 DB） | **已解决**：执行 migration/seed 时显式设 `$env:DATABASE_URL = "file:../data/dev.db"`，指向项目本地 DB |
| 5 | **游离 DB 外部残留** | 首次误操作（`set` 未生效）导致 `E:\app\data\dev.db` 被应用了 stage3 migration，该游离 DB 中存在 4 张新表（空表，无 seed 数据） | **暂不删除**，待用户单独确认是否清理。不影响项目本地 `e:\nana\data\dev.db` 的正确性 |

---

## 7. Migration + Seed 执行记录

### 7.1 评审闸门 2：显式 DATABASE_URL

**问题**：`.env` 的 `DATABASE_URL=file:/app/data/dev.db` 是 Docker 容器路径，本地非 Docker 运行时解析到 `E:\app\data\dev.db`（仓库外游离 DB，设计债 #4）。

**首次执行踩坑**：用 `set DATABASE_URL=...`（PowerShell 中 `set` 不设置环境变量），migration 被应用到了游离 DB `E:\app\data\dev.db`。

**修复**：用 PowerShell 正确语法 `$env:DATABASE_URL = "file:../data/dev.db"`，指向项目本地 `data/dev.db`。

**执行时使用的 DATABASE_URL 形态**：`file:../data/dev.db`（相对 `prisma/schema.prisma` 所在目录，解析为 `e:\nana\data\dev.db`）

### 7.2 Migration 应用

```
命令: $env:DATABASE_URL = "file:../data/dev.db" ; npx prisma migrate dev
目标 DB: e:\nana\data\dev.db

Applying migration `20260627124550_add_case_artifact`
Applying migration `20260701123326_add_case_knowledge_tag`
Applying migration `20260705011104_stage3_revised_ai_card`

Your database is now in sync with your schema.
✔ Generated Prisma Client (v5.22.0)
```

> 注：项目 DB 落后 3 个 migration（含本轮 stage3），一次性全部补齐。此前游离 DB `E:\app\data\dev.db` 也被应用了 stage3 migration（首次踩坑），但不影响项目 DB。

### 7.3 Seed 执行

```
命令: $env:DATABASE_URL = "file:../data/dev.db" ; npx tsx prisma/seed_textbook_topics.ts
目标 DB: e:\nana\data\dev.db

✅ TextbookTopic 种子数据导入完成
   TextbookTopic: 16 条（DB 实际: 16 条）
   TextbookNodeMapping: 48 条（DB 实际: 48 条）
```

### 7.4 验证结果

```
命令: $env:DATABASE_URL = "file:../data/dev.db" ; npx tsx prisma/_verify_stage3.ts

新表: CaseAiResult, CaseTextbookTopicTag, TextbookNodeMapping, TextbookTopic
TextbookTopic: 16
TextbookNodeMapping: 48
```

✅ 4 张新表全部存在，数据条数正确。

### 7.5 Build 结果

```
命令: npm run build
结果: ⚠️ 编译失败（Type error）
```

**失败位置**：`src/lib/nana/asr-transcribe.ts:175` — OpenAI SDK 类型 `"input_audio"` 不匹配

**与本次 schema 变更无关**：该文件不在本轮改动范围内（`git diff --name-only HEAD` 确认），是 pre-existing 错误。`prisma validate` 已通过，Prisma Client 已成功生成。

### 7.6 git status 快照

```
On branch dev
Your branch is up to date with 'origin/dev'.

Changes not staged for commit:
  modified:   prisma/schema.prisma

Untracked files:
  doc/executionlog/stage3-revised-round0-schema-log.md
  prisma/migrations/20260705011104_stage3_revised_ai_card/
  prisma/seed_textbook_topics.ts
```

---

## 8. 下一步

Round 0 已完成。下一步进入 Round 1（业务代码开发），由用户拍板启动。

---

## 9. 回滚方案

如果需要回退本轮改动：

**代码回退**（git revert）：

```bash
git revert <commit-hash>
```

**数据库回退**（migration 已执行，需手动删表）：

```sql
-- 回滚 migration（仅删新表，不影响既有数据）
DROP TABLE IF EXISTS "CaseTextbookTopicTag";
DROP TABLE IF EXISTS "CaseAiResult";
DROP TABLE IF EXISTS "TextbookNodeMapping";
DROP TABLE IF EXISTS "TextbookTopic";
-- CaseKnowledgeTag 无需回滚（未修改）
-- Case 表无需回滚（未加列）
```
