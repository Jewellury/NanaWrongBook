# 第 1 阶段执行计划 · 审计报告

> 关联计划: doc/plan/nana-phase1-execution-plan.md
> 对照源: doc/plan/nana-master-plan.md, doc/plan/nana-development-phases.md §1
> 对照架构: doc/plan/frontend-architecture-plan.md, doc/plan/capture-to-diagnosis-closed-loop-redesign.md
> 对照总纲: doc/reference/TECH_PLAN_v2.md, doc/reference/OPS_handbook.md §4
> 审计日期: 2026-06-27

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

这份执行计划质量很高，可以交给 execute-agent 开工了。以下是我的判断：

**👍 做得好的地方：**
- 4 个 commit 的拆分合理，每个 commit 的验收标准清晰可测
- 完全遵守 P4 前台不评判原则——专门的文案例行检查表、轻反馈有不确定性措辞、"不是终诊"反复强调
- Prisma schema 完全遵守铁律 3（不改上游表），studentId 不加 relation 的做法和上游 ErrorRecord 一致
- API handler 模板和现有代码风格一模一样（import、鉴权、try/catch、logger）
- 文件变更清单完整，新增/修改/碰不得分得很清楚
- 明确了零上游修改，冲突风险极低

**⚠️ 需要留意的小问题（建议执行前修，但不阻塞）：**
1. **标题数字矛盾**：§0 说"5 个 commit"，但实际只有 4 个——改成 4 就行
2. **ActionCard/RecapBar/EmptyHint 组件没写放哪**——这三个组件描述中有，但文件变更清单里没有对应文件，执行时可能歧义
3. **`test:nana` 脚本命名和现有习惯不完全一致**——现有里程碑脚本都指向具体文件，计划用了目录路径
4. **依赖关系表述简化过头**：说 ①→②→③→④，但 ① 和 ② 实际上可以并行（② 不依赖 ① 的 API）

**没有发现**：安全隐患、密钥泄露、上游文件被错标可改、设计原则违反、闭环重设计冲突。

---

## 检查清单

### 计划一致性
- [✅] 实现了 master-plan + development-phases §1 中 P0/P1 全部任务（case/artifact API + 采集壳 + 单题轻反馈）
- [✅] 未偏离总纲设计原则（P1-P5 全部遵守）
- [✅] 未引入"不做"清单中的能力（block editor、FSRS、全自动变式等）

### 内部一致性
- [✅] 4 个 commit 的拆分逻辑清晰，每个都独立可验证
- [⚠️] 依赖关系表述 ①→②→③→④ 是简化版——实际 ① 和 ② 可并行（② 不调用 ① 的任何 API，只调用已有的 `/api/diagnosis/map`）。这不影响执行，但值得备注
- [✅] 每个 commit 的验收标准可衡量、可测试
- [✅] 文件变更清单中的文件在对应 commit 描述中都有出现
- [✅] API 请求/响应字段一致（POST 和 GET 的 case 结构一致，feedback 的输入输出匹配）
- [⚠️] §0 标题说"5 个 commit"，但正文 §1 说"4 个 commit"且实际只有 4 个——**数字矛盾，应改为 4**

### 与总纲一致性
- [✅] 遵守 P1（图为真相源）——题图固定可见的设计
- [✅] 遵守 P2（结构先于模型）——反馈用规则版 stub 而非 LLM
- [✅] 遵守 P4（前台不评判）——有专门文案例行检查表，措辞全部守规矩
- [✅] 遵守铁律 3（不改上游表结构）——明确标注，Case/Artifact 无 Prisma relation 到上游 User
- [✅] 遵守铁律 4（密钥不入 git）——无任何密钥出现
- [✅] 优先级与 master-plan P0/P1 一致
- [✅] 不包含 master-plan 中明确不做的能力

### 与前端架构方案一致性
- [✅] 路由命名空间使用 `/nana`（匹配 frontend-architecture-plan §3.1）
- [✅] 组件目录在 `src/components/nana/` 下（匹配 §3.2）
- [✅] 段级 layout 用 `src/app/nana/layout.tsx`（匹配 §3.1）
- [✅] 碰不得清单全部遵守
- [⚠️] `case-card.tsx`（frontend-architecture-plan §3.2 列在 capture 组件中）未出现在执行计划的文件变更清单中——但 Phase 1 确实用不上，可在 Phase 2 补充

### 与闭环重设计一致性
- [✅] 单题轻反馈定位正确：情绪闭环，不是教学闭环
- [✅] 遵守"不伪装成终诊、含不确定性表达"
- [✅] 与 `capture-to-diagnosis-closed-loop-redesign.md` 优先级表完全一致（P0: case API + 采集壳，P1: 轻反馈）
- [✅] 不包含方法族地图前台化、Newman UI、ASR 后端、全自动变式等暂缓/不做内容

### 技术细节正确性

#### Prisma Schema
- [✅] 使用 `@id @default(cuid())` 主键，与现有 schema 一致
- [✅] 使用 String 类型而非 enum（SQLite 不支持 enum）
- [✅] 不使用 Json 类型（SQLite 不支持，现有 ErrorRecord 用 String 存 JSON）
- [✅] `studentId` 不加 Prisma relation，同 `ErrorRecord.mistakeId` 做法
- [✅] `@@index([caseId])` 加索引

#### API Handler
- [✅] Import 路径与现有代码完全一致（`@/lib/prisma`, `@/lib/auth`, `next-auth`, `@/lib/api-errors`, `@/lib/logger`）
- [✅] 鉴权模式一致：`getServerSession(authOptions)` → `return unauthorized()`
- [✅] 错误处理模式一致：try/catch → logger.error → internalError
- [✅] Next.js 15+ `params: Promise<{id: string}>` 模式正确（与现有 `sessions/[id]` 一致）

#### 测试
- [✅] 单测测 API 客户端逻辑（mock fetch）
- [✅] 集成测测路由 handler（遵循 M3c 集成测试模式：mock next/server + next-auth + logger + api-errors，使用真实 PrismaClient）
- [⚠️] 组件级测试（VoiceRecorder/QuestionImageViewer/TranscriptionPanel）未包含——这是合理的 Phase 1 范围取舍

#### Package.json Scripts
- [⚠️] `test:nana:unit`/`test:nana:integration` 使用目录路径（`vitest run src/__tests__/unit/nana`），而现有里程碑脚本（`test:m2:unit`, `test:m3c:unit`）使用具体文件路径。方向一致但习惯不同。建议统一风格。

### 完整性检查
- [⚠️] ActionCard、RecapBar、EmptyHint 三个组件在 §3.2 有描述但未出现在文件变更清单中——建议在 commit ② 中明确其文件位置（可内联在 `src/app/nana/page.tsx` 或放在 `src/components/nana/shared/`）
- [✅] 测试覆盖合理：case API 客户端 + case API 路由 + feedback 规则 + feedback API
- [✅] 仅 `package.json` 被修改（追加 scripts），无其他上游文件被改

### 偏离复核
- 本审计为纯文档审计，执行日志未产生，无需偏离复核

### 上游兼容性
- [✅] 未修改上游已有数据库表结构
- [✅] 仅 `package.json` 需追加 scripts（最小化修改，commit ①）
- [✅] 新增文件全部在独立目录（`src/app/api/nana/`, `src/app/nana/`, `src/components/nana/`, `src/lib/nana/`, `src/__tests__/*/nana/`）

### Agent 同步一致性
- 跳过（文档审计，非代码变更；已在 plan-agent 轮验证过）

### 测试
- 跳过（无代码变更可跑）

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | §0 标题说"5 个 commit"但实际只有 4 个 | §0 元数据行 | 将 `预计工期：5 个 commit` 改为 `4 个 commit` |
| P1 | ActionCard/RecapBar/EmptyHint 三个组件有描述无文件位置 | §3.2 组件列表 / §6 文件变更清单 | 在 §3.2 或 §6 中明确其文件路径（建议 `src/components/nana/shared/action-card.tsx` 等，或注明"内联在 page.tsx"） |
| P2 | `test:nana:unit` 使用目录路径，与现有 `test:m2:unit` 等使用文件路径的习惯不一致 | §2.6 package.json scripts | 建议改为指向具体文件：`vitest run src/__tests__/unit/nana/case-api.test.ts`，或在后面扩展时统一 |
| P2 | 依赖关系图写为线性 ①→②→③→④，但实际 ① 和 ② 可独立并行 | §1 拆分策略 | 建议加备注说明"① 和 ② 无技术依赖，可并行执行；③ 依赖 ①+②；④ 依赖 ③" |
| P2 | `test:all` 更新内容未具体写出 | §2.6 | 建议写明追加内容：`&& npm run test:nana:unit && npm run test:nana:integration` |
| P3 | `case-card.tsx` 在 frontend-architecture-plan 中列出，执行计划未包含 | — | 非阻塞，可在 Phase 2 补充。建议在 §6 文件清单备注"Phase 1 暂不需要" |

---

## 逐项详细审计记录

### 1. 内部一致性详细审计

#### 1.1 Commit 依赖关系

计划描述：`①→②→③→④`

实际技术依赖：
```
① Prisma + case API  ──────────┐
                                ├──→ ③ 采集壳 UI ←── ④ 轻反馈
② 首页 + nana layout ──────────┘
```

- ② 的首页只调用已有 `/api/diagnosis/map`，完全不依赖 ①
- ③ 需要 ①（创建 case）和 ②（从首页导航）
- ④ 需要 ③（LightFeedback 组件骨架）

**判定**：线性表述是简化，不影响执行。建议加脚注说明 ①② 可并行。

#### 1.2 API 字段一致性

| Item | 请求 | 响应 | 一致性 |
|------|------|------|:------:|
| POST /api/nana/cases | `artifacts: [{type, content, seq?}]` | `{id, studentId, createdAt, artifacts: [{id, type, content, seq}]}` | ✅ seq 可选→必填（默认 0），合理 |
| GET /api/nana/cases/:id | — | 同 POST 响应（含 artifacts） | ✅ 明确标注"同 POST" |
| POST /api/nana/cases/:id/feedback | `{transcript, aiSummary?}` | `{hint, relatedTags, isPreliminary: true}` | ✅ 清晰一致 |

### 2. P4 前台不评判专项检查

逐条对照 OPS_handbook.md §4 措辞铁律：

| 铁律 | 计划中表现 | 判定 |
|------|-----------|:----:|
| 不出现"错""失败""得分""未掌握""正确率" | 专门的文案例行检查表 §3.2，commit ④ 验收标准重申 | ✅ |
| 按钮措辞不带评判 | "拍一下这道题""说说看""我听完了""再拍一道" | ✅ |
| 轻反馈不伪装成终诊 | "这只是初步线索，不是最终判断""再拍几道后我们一起看" | ✅ |
| 不出现掌握度/百分比/分数 | commit ④ 验收标准明确禁止 | ✅ |
| 无红色/橙色警告 | 设计基底 bg-[#FBF7F0] 奶油色 | ✅ |

### 3. Prisma Schema 与现有风格对比

| 特征 | 现有 schema（ErrorRecord、DiagnosisSession 等） | 计划（Case/Artifact） | 一致性 |
|------|-----------------------------------------------|---------------------|:------:|
| 主键 | `@id @default(cuid())` | 同左 | ✅ |
| relation 到上游 | 存在不带 relation 的字段（`ErrorRecord.mistakeId String?` 带 comment） | `studentId String // → 上游 User.id` — 同款做法 | ✅ |
| SQLite 兼容 | 不用 Json 类型（`dialogueLog String?` 存 JSON 字符串） | 不用 Json 类型 | ✅ |
| 索引 | `@@index([...])` | `@@index([caseId])` | ✅ |
| comment 标注 | "// → 上游 ErrorItem.id" | "// → 上游 User.id" | ✅ |

### 4. API Handler 与现有风格对比

```typescript
// 现有 sessions/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:diagnosis:sessions');

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();
  try { /* ... */ } catch (error) {
    logger.error('...', error);
    return internalError();
  }
}
```

```typescript
// 计划 cases/route.ts（§2.2）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases');

export async function POST(req: Request) {
  // ...鉴权 → 校验 → prisma → logger → 返回
}
```

**判定**：风格完全一致。✓

### 5. 轻反馈关键词规则审查

规则：
- "定义域"/"值域" → hint 含"定义域优先意识" ✅
- "完全平方"/"配方"/"平方" → hint 含"完全平方公式的灵活运用" ✅
- "算错"/"算不对"/"算不出来" → hint "没关系"（安慰但不掩盖） ✅
- 无匹配 → 默认 "再拍几道后我们一起看看" ✅

所有 hint 含不确定性表述（"可能"、"ただの线索"、"再拍几道后我们一起看"），符合 P4。✓

---

## 用户验证指南（执行阶段使用）

### Commit ① 验证
1. `npx prisma migrate dev` 创建 migration，确认只新增 Case + Artifact 表
2. `curl -X POST http://localhost:3000/api/nana/cases -H "Content-Type: application/json" -d '{"artifacts":[{"type":"image","content":"url1"}]}'` → 201 + case id
3. `curl http://localhost:3000/api/nana/cases/{id}` → 200 + case 含 artifacts
4. `npm run test:nana:unit && npm run test:nana:integration`

### Commit ② 验证
1. 未登录访问 `/nana` → 重定向到 `/login`
2. 登录后访问 `/nana` → 看到两个行动卡 +（有记录时）recap bar /（无记录时）空提示
3. 行动卡措辞："拍一下这道题""补一段你当时怎么想的"
4. 点击"拍一下这道题" → 跳转到 `/nana/capture`（可能 404，等 commit ③）

### Commit ③ 验证
1. 访问 `/nana/capture` → 题图在上半屏固定
2. 点击录音 → 波形动画 + mock 转写文字流
3. 点击"我听完了" → 自动切到"帮你整理"tab + 轻反馈动画（0.3s fade-in）
4. "再拍一道"按钮可重置，已拍计数递增
5. 累积 3 道后显示"开始诊断"链接

### Commit ④ 验证
1. 在采集壳录完音 → 3 秒内出现轻反馈文字
2. 关键词触发正确（说"配方法"→ 配方法 hint）
3. 始终显示"只是初步线索"或等价措辞
4. 不出现"终诊""诊断结论""判断""掌握度""百分比"
5. `npm run test:all` 通过

---

## 结论

**⚠️ 有条件通过**。主要问题已在"问题清单"中列出（2 个 P1 + 3 个 P2 + 1 个 P3），建议 execute-agent 在开始执行前修复：

1. **必改**（P1）：标题"5 个 commit"→"4 个 commit"
2. **必改**（P1）：明确 ActionCard/RecapBar/EmptyHint 的文件位置
3. **建议改**（P2）：`test:nana:*` 脚本路径与现有风格对齐
4. **建议改**（P2）：依赖关系加备注说明 ① ② 可并行

其余内容高质量，可以直接投入执行。
