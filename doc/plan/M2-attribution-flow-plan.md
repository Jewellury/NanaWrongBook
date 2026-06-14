# M2 归因流程骨架 · 开发计划

> 关联规格: doc/reference/TECH_PLAN_v2.md §4.2（Newman流程）、§6.2（周末session状态机）
> 计划日期: 2026-06-14
> 预计影响: prisma/schema.prisma（追加 3 表）、lib/session-machine.ts（新增）、src/app/api/diagnosis/（新增）、测试文件

## 1. 大白话概述

M1 把知识图谱建好了。M2 要做的：给图谱上的诊断服务搭骨架——"诊断对话怎么开、每一轮追问记在哪、最后结论写在哪"。

具体三件事：
1. **建 3 张新表**：诊断会话（DiagnosisSession）、探针答题记录（ProbeRecord）、错因归因记录（ErrorRecord）。这些是后续 Newman 归因的数据底座。
2. **写一个会话状态机**：周末诊断流程有 8 个步骤——从"批量拍照"到"生成下周纸质包"。状态机负责管这些步骤间的跳转规则，确保不会跳过必要步骤。
3. **开基础 API 路由**：创建诊断会话、记录探针答题结果、记录归因结论。先只做数据存取，不接 AI。

本轮**不做**的事：不调 LLM 做 Newman 追问、不写 UI 界面、不做地图可视化、不做 BKT 追踪、不做探针下探自动化、不做 PDF 生成。纯数据层 + 状态机 + 基础 API。

## 2. 任务分解

- [ ] 任务1: 追加 3 张 Prisma 表（DiagnosisSession / ProbeRecord / ErrorRecord）+ 迁移
- [ ] 任务2: 会话状态机 lib/session-machine.ts
- [ ] 任务3: 基础 API 路由（POST/GET sessions、POST probes、POST errors）
- [ ] 任务4: 单元测试（状态机） + 集成测试（API 路由）

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| prisma/schema.prisma | 修改（末尾追加） | 新增 3 个 model，不改已有部分 |
| prisma/migrations/* | 自动生成 | Prisma migrate 产出 |
| lib/session-machine.ts | 新增 | 周末 session 状态机 |
| src/app/api/diagnosis/sessions/route.ts | 新增 | POST 创建会话 + GET 列表 |
| src/app/api/diagnosis/sessions/[id]/route.ts | 新增 | GET 单个会话详情 |
| src/app/api/diagnosis/sessions/[id]/probes/route.ts | 新增 | POST 记录探针结果 |
| src/app/api/diagnosis/sessions/[id]/errors/route.ts | 新增 | POST 记录归因结论 |
| src/__tests__/unit/session-machine.test.ts | 新增 | 状态机单元测试 |
| src/__tests__/integration/diagnosis-api.test.ts | 新增 | API 集成测试 |
| package.json | 修改 | 新增 test:m2:unit / test:m2:integration 脚本 |

## 4. 验收标准

- [ ] 3 张新表建在数据库里，迁移执行成功
- [ ] `session-machine` 状态转换逻辑正确：非法跳转抛错，合法路径走通
- [ ] `POST /api/diagnosis/sessions` 能创建 initial 或 weekend 类型会话
- [ ] `POST /api/diagnosis/sessions/:id/probes` 能记录一道探针题的作答
- [ ] `POST /api/diagnosis/sessions/:id/errors` 能记录一条 Newman 归因（含 stage/tag/rootNodeId）
- [ ] `GET /api/diagnosis/sessions/:id` 返回会话 + 全部探针记录 + 全部错误记录
- [ ] `test:m2:unit` 和 `test:m2:integration` 全部通过（测试容器退出码 0）

## 5. 设计决策

### 决策①：ErrorRecord 的 dialogueLog 存储

`dialogueLog` 是 Newman 追问的对话链，TECH_PLAN_v2 schema 定义为 `Json`。但 SQLite 不支持 Prisma `Json` 类型——M1 已验证这个坑（videoLinks 被迫从 `Json?` 改 `String?`）。本轮直接用 `String?` 存 JSON 字符串，写入时 `JSON.stringify()`，读取时 `JSON.parse()`。

### 决策②：ErrorRecord 的 mistakeId 指向 ErrorItem

与 M1 的 MistakeNode 一致——`mistakeId` 实际指向既有 `ErrorItem.id`。本轮只存字段，不建 Prisma-level relation（因为不能改上游 ErrorItem 模型加 back-reference）。靠 comment 明确映射关系。

### 决策③：session 状态机不持久化 state 字段

不在 DiagnosisSession 表里加 `state` 字段——状态由调用的先后顺序自然决定：
- POST /sessions → "idle"
- POST probes → 记录追加
- POST errors → 记录追加，结束后 session 关闭

好处：零额外状态同步成本。后续如果真需要持久化状态（比如跨天恢复下次继续），再加字段不迟。

### 决策④：API 路由不接 AI

M2 的 API 只做数据存取——创建会话、记录探针、记录归因。Newman 追问和归因逻辑在 M3 或后续轮次接入。这样 M2 就能独立验收：拿 curl 或测试脚本发 JSON 就能跑通。

### 决策⑤：鉴权

沿用 wrong-notebook 既有模式：`getServerSession(authOptions)` + `unauthorized()`。不做新的鉴权方案。

### 决策⑥：test:m2 脚本

沿用容器分层方案的模式，新增两个 package.json scripts：
- `test:m2:unit` → `vitest run src/__tests__/unit/session-machine.test.ts`
- `test:m2:integration` → `vitest run src/__tests__/integration/diagnosis-api.test.ts`

测试容器通过这两个脚本验收 M2。

## 6. 风险与注意事项

| 风险 | 影响 | 对策 |
|------|------|------|
| `dialogueLog` 用 `String?` 存 JSON | 读取方需要 `JSON.parse()`，多一步 | M1 videoLinks 也是同样处理，模式统一 |
| ErrorRecord 不建与 ErrorItem 的 Prisma relation | join 查询不能直接 `.include`，需手动查 | 标注在注释中；M2 阶段用不到跨表 join |
| API 路由新增 auth 依赖 | 测试需要 session 模拟 | 集成测试可直接调 Prisma 旁路鉴权，或 mock session |
| API 路由在 Next.js App Router 下 | 路由文件结构有约束 | 按既有 `src/app/api/error-items/` 模式组织 |

## 7. 技术附录

### 7.1 Prisma Schema 追加（3 张新表）

在 `prisma/schema.prisma` **末尾**追加：

```prisma
// ============================================================
// M2 归因流程（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型
// 对应 TECH_PLAN_v2 §3.5
// ============================================================

model DiagnosisSession {
  id        String   @id @default(cuid())
  studentId String
  kind      String   // "initial" | "weekend"
  startedAt DateTime @default(now())
  endedAt   DateTime?
  records   ProbeRecord[]
  errors    ErrorRecord[]
}

model ProbeRecord {
  id        String   @id @default(cuid())
  sessionId String
  session   DiagnosisSession @relation(fields: [sessionId], references: [id])
  itemId    String?  // 题目 ID（对应后续 Item 表，本期可为 null）
  nodeId    String?  // 关联的知识节点 ID
  correct   Boolean  // 是否答对
  durationS Int?     // 作答耗时（秒）
  createdAt DateTime @default(now())
}

model ErrorRecord {
  id          String   @id @default(cuid())
  sessionId   String
  session     DiagnosisSession @relation(fields: [sessionId], references: [id])
  mistakeId   String?  // → 上游 ErrorItem.id（不改其表，comment 标注）
  nodeId      String?  // 关联的知识节点 ID
  newmanStage String?  // "reading" | "comprehension" | "transformation" | "process" | "encoding"
  errorType   String?  // 一级标签: 概念性 | 程序性 | 计算性 | 符号表示 | 条件前提缺口 | 完备性缺口
  crossTag    String?  // 跨章复用标签: 定义域优先 | 等价变形守恒 | 完备分类 | 取等可达 | 对象类型意识
  rootNodeId  String?  // 定位到的病根节点 ID → KnowledgeNode.id
  dialogueLog String?  // 追问对话链 JSON 字符串（SQLite 不支持 Json 类型，见 M1 videoLinks）
  confirmed   String   @default("pending") // "pending" | "slip_confirmed" | "gap_confirmed"
  createdAt   DateTime @default(now())
}
```

### 7.2 会话状态机（lib/session-machine.ts）

```typescript
// 周末 session 的 8 个阶段（对应 TECH_PLAN_v2 §6.2）
export type SessionStep =
  | 'batch_photo'      // 批量拍照
  | 'question_review'  // 题面确认
  | 'auto_triage'      // 自动分诊（挑 2-3 道深诊）
  | 'redo_oral'        // 重做口述
  | 'newman_inquiry'   // Newman 追问
  | 'probe_drill'      // 探针下探（必要时）
  | 'map_update'       // 地图更新
  | 'weekly_pdf';      // 生成纸质包

// 合法的下一步映射
const NEXT_STEPS: Record<SessionStep, SessionStep[]> = {
  batch_photo:      ['question_review'],
  question_review:  ['auto_triage'],
  auto_triage:      ['redo_oral'],
  redo_oral:        ['newman_inquiry'],
  newman_inquiry:   ['probe_drill', 'map_update'], // 探针是可选的
  probe_drill:      ['map_update'],
  map_update:       ['weekly_pdf'],
  weekly_pdf:       [], // 终态
};

export class SessionMachine {
  private current: SessionStep;

  constructor(startAt: SessionStep = 'batch_photo') {
    this.current = startAt;
  }

  get step(): SessionStep { return this.current; }

  canTransitionTo(next: SessionStep): boolean {
    return NEXT_STEPS[this.current]?.includes(next) ?? false;
  }

  advance(next: SessionStep): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(
        `非法状态跳转: "${this.current}" → "${next}"。` +
        `允许的下一步: ${NEXT_STEPS[this.current]?.join(', ') ?? '无（终态）'}`
      );
    }
    this.current = next;
  }

  isComplete(): boolean { return this.current === 'weekly_pdf'; }
}
```

### 7.3 API 路由设计

```
POST   /api/diagnosis/sessions             创建会话
       body: { studentId, kind: "weekend" }
       → { id, studentId, kind, startedAt }

GET    /api/diagnosis/sessions             列出会话（按 studentId query）
GET    /api/diagnosis/sessions/[id]         会话详情（含 probes + errors）

POST   /api/diagnosis/sessions/[id]/probes  记录探针结果
       body: { nodeId?, itemId?, correct, durationS? }
       → { id, sessionId, correct, ... }

POST   /api/diagnosis/sessions/[id]/errors  记录归因结论
       body: { mistakeId?, nodeId?, newmanStage?, errorType?, crossTag?, rootNodeId?, dialogueLog? }
       → { id, sessionId, newmanStage, ... }
```

### 7.4 新增 package.json scripts

```json
"test:m2:unit": "vitest run src/__tests__/unit/session-machine.test.ts",
"test:m2:integration": "vitest run src/__tests__/integration/diagnosis-api.test.ts"
```

### 7.5 commit 拆分计划

| # | commit 消息 | 内容 | 可独立验证 |
|---|------------|------|:--:|
| ① | `feat(m2): 新增诊断会话 Prisma schema + 迁移` | schema 追加 + migration | `prisma migrate dev` 成功 |
| ② | `feat(m2): 新增会话状态机` | lib/session-machine.ts | 可单独 import |
| ③ | `feat(m2): 新增诊断会话 API 路由` | 4 个路由文件 | curl POST/GET 返回 JSON |
| ④ | `test(m2): 新增 M2 单元测试 + 集成测试` | 测试文件 + test:m2 scripts | test:m2:unit && test:m2:integration 通过 |
