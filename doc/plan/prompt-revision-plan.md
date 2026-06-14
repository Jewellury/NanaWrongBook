# 三代理提示词修订 + DB 护栏 · 开发计划

> 关联提案: doc/plan/three-agent-prompt-revision-plan.md
> 触发来源: M2 生产库污染事故复盘（doc/reference/M2-prod-contamination-postmortem.md）
> 计划日期: 2026-06-14
> 预计影响: src/__tests__/setup/guard-db.ts（新增）、vitest.config.ts（修改）、.claude/commands/（修改 3 个文件）

## 1. 大白话概述

M2 事故暴露了两类问题：①测试可能连到生产库；②审计不会检查"测试在哪个库过的"。本轮用三个小改动把这两个洞都堵上。

1. **DB 护栏**：在所有测试启动前加一道硬拦截——DATABASE_URL 不在白名单里就直接崩。以后谁手滑在 prod 容器跑测试，第一秒就挂，根本写不进 dev.db。
2. **审计补检**：在 audit 模板的"测试"和"安全性"检查清单里各加一条——"测试在安全路径跑的？""生产库被写了吗？"
3. **TDD 注记**：在 plan 和 execute 模板里加一行提醒——逻辑重的模块可以标"测试先行"。

三个改动都很小：一个 15 行的 TS 文件 + 三份 markdown 各改几行。但护栏 + 审计补检合在一起，能把 M2 那种事故从"靠人记"变成"结构上不可能"。

## 2. 任务分解

- [ ] 任务1: DB 护栏断言 + vitest 挂载（涉及文件: src/__tests__/setup/guard-db.ts、vitest.config.ts）
- [ ] 任务2: audit.md 补两条检查——安全路径验证 + 生产库未写入（涉及文件: .claude/commands/audit.md）
- [ ] 任务3: plan.md + execute.md 加 TDD 注记（涉及文件: .claude/commands/plan.md、.claude/commands/execute.md）

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| src/__tests__/setup/guard-db.ts | 新增 | DB 护栏断言（白名单模式） |
| vitest.config.ts | 修改 | setupFiles 数组加 guard-db.ts |
| .claude/commands/audit.md | 修改 | "测试"节 + "安全性"节各加一条检查 |
| .claude/commands/plan.md | 修改 | "验收标准"节加 TDD 策略注记 |
| .claude/commands/execute.md | 修改 | "工作流"加第 2 步（测试先行任务） |

## 4. 验收标准

- [ ] 用 `DATABASE_URL=file:/app/data/dev.db npx vitest run` 跑任意测试，第一秒崩，报错含 "🛑 测试禁止连接非测试库"
- [ ] 用正常 `.env.test`（指向 test.db）跑测试，护栏不误拦
- [ ] audit.md 检查清单里能看到"确认测试在安全路径运行"和"生产库未写入"两条
- [ ] plan.md 验收标准节能看到 TDD 策略注记
- [ ] execute.md 工作流能看到第 2 步"对标注测试先行的任务：先写失败测试 → 实现 → 重构"

## 5. 设计决策

### 决策①：白名单模式（非黑名单子串匹配）

外部提案原写 `!url.includes('test')`，太松——有人把生产库改名 `test-data.db` 就穿帮。

改用白名单：

```typescript
const ALLOWED_DATABASE_URLS = [
  'file:/app/data/test.db',    // Docker 测试容器内路径
  'file:./data/test/test.db',  // 本地相对路径
];
```

不在白名单就直接崩。白名单是唯一真相源——万一以后路径变了被误拦，只准加白名单条目，绝不准松成子串匹配或关掉检查。空值也会被白名单挡下。

### 决策②：护栏放在 setupFiles 最前面

`vitest.config.ts` 的 `setupFiles` 是数组，按顺序执行。`guard-db.ts` 必须放在第一个：

```typescript
setupFiles: ['./src/__tests__/setup/guard-db.ts', './src/__tests__/setup.ts'],
```

这样在任何其他 setup（包括 Prisma 连接）之前就崩——连库都没打开就拦住了。

### 决策③：不改 execute.md 已有的 5 条守门规则

`execute.md` 在事故修复时已加入的"测试只走测试容器""新增 test:* 同步 test:all"等规则原封不动。本轮只在工作流里插入第 2 步（TDD 注记），不影响已有规则。

## 6. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| 护栏误拦正常测试 | 白名单路径与实际不符 | 落地后用正常 `.env.test` 跑一次确认不误拦；万一误拦，只加白名单条目 |
| vitest.config.ts 是上游文件 | setupFiles 改动要最小化 | 只在数组首位插一行 `guard-db.ts`，不重排已有条目 |
| 三个 command 文件同步改 | 可能忘记改某个文件 | 同 commit 提交，审计逐文件检查 |

## 7. 技术附录

### 7.1 guard-db.ts

```typescript
/**
 * DB 护栏断言 —— 测试禁止连接生产库
 *
 * 在任何测试启动前执行。DATABASE_URL 不在白名单中时，
 * 立即抛出错误，拒绝运行。白名单是唯一真相源：
 * 绝不准松成子串匹配或关掉检查。
 *
 * 对应事故：M2 生产库污染（doc/reference/M2-prod-contamination-postmortem.md）
 */

const ALLOWED_DATABASE_URLS = [
  'file:/app/data/test.db',    // Docker 测试容器内路径
  'file:./data/test/test.db',  // 本地相对路径
];

const url = (process.env.DATABASE_URL ?? '').trim();

if (!ALLOWED_DATABASE_URLS.includes(url)) {
  throw new Error(
    `🛑 测试禁止连接非测试库。\n` +
    `当前 DATABASE_URL="${url || '(空)'}"\n` +
    `白名单: ${ALLOWED_DATABASE_URLS.join(', ')}\n` +
    `如果你确信需要加新路径，请修改本文件的白名单数组，不要关掉检查。`
  );
}
```

### 7.2 vitest.config.ts 改动

```typescript
setupFiles: [
  './src/__tests__/setup/guard-db.ts',  // 必须第一个——在任何连接前拦截
  './src/__tests__/setup.ts',
],
```

### 7.3 audit.md 改动

**"测试"节追加**（第 60 行后）：
```markdown
- [ ] 确认测试在安全路径运行：执行日志中最后一次成功测试经 docker-compose.test.yml 跑，写入 ./data/test/test.db，./data/dev.db 未被触碰
- [ ] DB 护栏断言（src/__tests__/setup/guard-db.ts）存在且生效
```

**"安全性"节追加**（第 46 行后）：
```markdown
- [ ] 本轮未向生产库 ./data/dev.db 写入任何测试数据（必要时抽查关键表行数）
```

### 7.4 plan.md 改动

**"验收标准"节追加**（第 44 行后）：
```markdown
> 测试策略：逻辑重的模块（状态机、错因归因规则、图遍历、BKT 计算）应在本节标注"测试先行"；
> 纯样板（Prisma schema、直通 CRUD 路由）测试后置即可，不强制 TDD。
```

### 7.5 execute.md 改动

**"工作流"节插入第 2 步**（第 68 行后）：
```markdown
2. 对计划中标注"测试先行"的任务：先写出会失败的测试 → 再写实现让它转绿 → 重构。
   其余任务可测试后置。无论先后，完成判定都以测试在安全路径上真跑通为准。
```

（原工作流第 2-4 步顺延为 3-5 步。）

### 7.6 验证护栏故意触发

护栏落地后，故意用生产库 URL 跑一次确认崩溃：

```bash
cd e:/nana && DATABASE_URL=file:/app/data/dev.db npx vitest run src/__tests__/unit/session-machine.test.ts
```

预期输出：
```
🛑 测试禁止连接非测试库。
当前 DATABASE_URL="file:/app/data/dev.db"
白名单: file:/app/data/test.db, file:./data/test/test.db
```

### 7.7 commit 计划

单 commit 提交全部改动（3 个文件新改 + 2 个文件修改，变更量小）：

```
feat: DB 护栏断言 + audit 安全补检 + TDD 注记
- src/__tests__/setup/guard-db.ts: 白名单模式，禁止测试连非 test 库
- vitest.config.ts: setupFiles 首位挂载 guard-db.ts
- audit.md: 测试节 + 安全性节各加一条生产库检查
- plan.md: 验收标准加 TDD 策略注记
- execute.md: 工作流加测试先行步骤
```
