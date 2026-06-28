# 第 3 阶段执行计划：批次诊断报告 + Session UI

> 性质：`/plan` 阶段产出。面向 execute-agent 的可执行规格。
> 依赖总纲：`nana-master-plan.md`、`nana-development-phases.md` §3
> 产生日期：2026-06-28

---

## 目标

串接 M3c 已有的全部后端 API，实现"答题 → 提交 → 批次诊断报告 → 纸质包"完整流程。

## 前置条件

- 第 1 阶段完成（`/nana` 首页已有入口）
- 后端 API 全部就绪：`POST /api/diagnosis/session-items`、`POST /api/diagnosis/submit-answers`、`GET /api/diagnosis/sessions/[id]`、`GET /api/diagnosis/paper-pack`
- 诊断编排器就绪：`lib/diagnosis-orchestrator.ts`
- 纸质包页面已有：`src/app/diagnosis/paper-pack/page.tsx`（242 行）
- Mockup 可用：`05-quiz.html`（答题 UI）

## 拆分策略（3 个 commit）

```
Commit ①: Session 流程 UI（答题 + 提交 + 跳过）
Commit ②: 批次诊断报告页（知识点 + 错因模式 + 补救建议）
Commit ③: 纸质包预览 + session 列表页
```

---

## Commit ①：Session 流程 UI

### 1.1 Session 列表页

**文件**：`src/app/nana/session/page.tsx`（"use client"）

**功能**：
- 显示历史 session 卡片列表（每项：日期 + 题目数 + 状态）
- 创建新 session 按钮 → 调用 `POST /api/diagnosis/session-items`
- 无 session 时显示空状态："还没有做过检查"

**主线选择**：首期**硬编码 M2a**（函数主线，高考最高权重基础线）。UI 文案："先从函数这条线看看"（守 P4）。后续再升级为主线选择页。

### 1.2 Session 流程页

**文件**：`src/app/nana/session/[id]/page.tsx`（"use client"）

**流程**：
```
调用 POST /api/diagnosis/session-items → 获取题单 + answerKey
→ 逐个展示答题卡片（参考 05-quiz.html）
→ 全部答完后进入"核对一下"步骤
→ 学生/大人看着 answerKey 逐道核对，标记"这道过了"或"这道还卡着"
→ 调用 POST /api/diagnosis/submit-answers 提交 { correct: boolean }
→ BKT+KST 更新 → 跳转报告页
```

**为什么不自判**：`POST /api/diagnosis/submit-answers` 的 `answers` 数组要求前端直接提交每道题的 `correct: boolean`（答对/答错）。后端不做判分。因此必须在答题后增加"核对一下"步骤由学生/大人手动标记。

**"核对一下"步骤**（新增）：
```
所有题答完后，进入核对模式：
  逐题显示：
    - 题目内容（只读）
    - 参考答案（来自 session-items 返回的 answerKey）
    - 两个按钮：[这道过了 ✓] [这道还卡着 ✗]
  全部标记完后 → 调用 submit-answers
```

**布局**（参考 `05-quiz.html`）：
```
┌─────────────────────────────┐
│  ← 返回  周末小测            │
│  随时可以先歇会儿            │
├─────────────────────────────┤
│  ● ● ○ ○  第 3 个，共 4 个   │  ← 进度点
├─────────────────────────────┤
│  题目内容                    │
│  (选择题选项或填空输入)      │
│                             │
│  [还没学这个，先跳过]        │
│  [记一下这道] ← 提交         │
└─────────────────────────────┘
```

**组件**：`QuestionCard`
- Props: `{ stem: string, type: "mcq" | "fill" | "open", onSubmit: (answer: string) => void, onSkip: () => void }`
- 选择题：四个选项（A/B/C/D），点击选中后高亮
- 填空/解答：textarea 输入区 + "手写在纸上？拍下来也行" 提示
- 跳过按钮："还没学这个，先跳过"（温和接住）
- 提交按钮："记一下这道"（非"提交答案"或"判分"）
- 进度点：已完成=绿点，当前=大绿点，未做=灰点

**跳过接纳态**（参考 `05-quiz.html` 帧 3）：
- 点击跳过 → 显示"好，先帮你收起来了。等你把前面几步点亮，再回头看它，会比现在轻松很多。"
- "已收起"按钮标记

**提交逻辑**：
- 所有题答完 → 进入"核对一下"模式（见上方流程）
- 学生/大人对照 answerKey 逐道标记"这道过了 ✓"或"这道还卡着 ✗"
- 全部标记完后 → 调用 `POST /api/diagnosis/submit-answers`
- body: `{ sessionId, studentId, mainlineId: "M2a", answers: [{ nodeId, itemId, correct: boolean }] }`

### 1.3 P4 措辞检查

| 位置 | 必须用 | 禁用 |
|------|--------|------|
| 页面标题 | "周末小测" / "小检查" | "诊断测验" / "考试" |
| 提交按钮 | "记一下这道" | "提交答案" / "判分" |
| 跳过按钮 | "还没学这个，先跳过" | "放弃" / "跳过" |
| 跳过后 | "好，先帮你收起来了" | "已跳过 1 题" |
| 进度提示 | "第 3 个，共 4 个" | "进度 75%" |
| 副标题 | "就当和我一起把把脉，看看现在走到哪了" | "诊断你的薄弱知识点" |

### 1.4 Commit ① 验收

- [ ] `/nana/session` 列表页可访问（空状态"还没有做过检查"）
- [ ] 答题流程完整：获取题单 → 逐题展示 → 全部答完 → 核对一下（逐道标记"这道过了"/"这道还卡着"）→ 提交
- [ ] 跳过按钮温和接住（文案正确）
- [ ] 进度点显示正确
- [ ] 零新 API（全复用已有）
- [ ] P4 措辞全部合规
- [ ] 测试通过 + build 通过

---

## Commit ②：批次诊断报告页

### 2.1 报告页

**文件**：`src/app/nana/session/[id]/report/page.tsx`（"use client"）

**数据来源**（两路并行）：
1. `GET /api/diagnosis/sessions/[id]` — 获取 session records（答题记录）
2. `GET /api/diagnosis/map?studentId=xxx` — 获取节点字典（nodeId → name/judgeCriteria/status）。Phase 2 已扩展此 API

**注意**：`sessions/[id]` 只返回 `records` 中的 `nodeId`/`correct`/`durationS`，不含 `KnowledgeNode.name`。必须并行调用 `map` API 将 `nodeId` 映射为口语化名称。

**内容组织**（首期不做错因模式，因为 submit-answers 不创建 ErrorRecord）：
```
┌─────────────────────────────┐
│  ✅ 这一轮看完了             │
├─────────────────────────────┤
│ 📊 我们看了什么              │
│  ┌─ 知识点卡片 ───────────┐ │
│  │  ● 求函数定义域         │ │
│  │  这道已经过了 ✓         │ │
│  └────────────────────────┘ │
│  ┌─ 知识点卡片 2 ──────────┐ │
│  │  ● 配方法               │ │
│  │  这道还卡着 ✗           │ │
│  └────────────────────────┘ │
├─────────────────────────────┤
│ 📝 做题时看到的信号           │
│  "这 4 道题集中在            │
│   '求函数定义域'和           │
│   '配方法'这两个点上"        │
│  (首期为知识点级统计，        │
│   不做错因定性)              │
├─────────────────────────────┤
│ 🎯 先从这里补                │
│  "建议先搞定'求函数定义域'   │
│   —这是后面所有函数题的      │
│    基础"                    │
├─────────────────────────────┤
│  [生成纸质包 ↗]             │
│  [看看我的知识地图 ↗]        │
└─────────────────────────────┘
```

**内容组织**：
```
┌─────────────────────────────┐
│  ✅ session 完成！           │
├─────────────────────────────┤
│ 📊 这轮我们看了什么           │
│  ┌─ 知识点卡片 ───────────┐ │
│  │  ● 求函数定义域         │ │
│  │  判定：能求简单解析式    │ │
│  │  状态：需要关注         │ │
│  └────────────────────────┘ │
│  ┌─ 知识点卡片 2 ──────────┐ │
│  │  ...                    │ │
│  └────────────────────────┘ │
├─────────────────────────────┤
│ 📝 做题时有什么规律          │
│  "你这几道题都在配完平方     │
│   后算错了，可能和计算       │
│   习惯有关"                 │
├─────────────────────────────┤
│ 🎯 从哪里开始补              │
│  "建议先搞定'求函数定义域'   │
│   —这是后面所有函数题的      │
│    基础"                    │
├─────────────────────────────┤
│  [生成纸质包 ↗]             │
│  [看看我的知识地图 ↗]        │
└─────────────────────────────┘
```

**报告逻辑**（首期知识点级，不做错因定性）：
1. **知识点列表**：从 session 的 `records` 提取所有 `nodeId` → 从 `map` API 响应获取 `name`/`judgeCriteria` → 按 `correct` 分组展示（"这道已经过了"/"这道还卡着"）
2. **做题时看到的信号**：统计哪些知识点出现频率高，给出简单文字（如"这 N 道题集中在 XX 和 YY 这两个点上"），**不做错因定性**（因为 submit-answers 不创建 ErrorRecord，真实错因分析需要 Newman-lite 启用后才有）
3. **补救建议**：基于"还卡着"的知识点列表生成建议（"建议先搞定 XX——这是 YY 的基础"）

**约束**：
- 不暴露后端术语（BKT/KST/masteryProb/tier）
- 不出现"薄弱点""缺陷""未掌握"等评判词
- 知识点用口语名称（如"求函数定义域"而非"M2a-03"）
- 不出现数字百分比

### 2.2 组件

**文件**：`src/components/nana/session/report-knowledge-card.tsx`

知识点卡片：名称 + 判定标准 + 状态标注（"需要看看"/"留意一下"）

**文件**：`src/components/nana/session/report-pattern-card.tsx`

错因模式卡片：模式描述文字 + 示例

### 2.3 与知识地图联动
- 报告页底部"看看我的知识地图"链接 → `/nana/knowledge-map`
- 点击知识点卡片跳转到地图并定位到该节点（可选，首期可先用简单链接）

### 2.4 P4 措辞检查

| 位置 | 必须用 | 禁用 |
|------|--------|------|
| 标题 | "这轮我们看了什么" | "诊断报告" / "分析结果" |
| 知识状态 | "这道已经过了 ✓" / "这道还卡着 ✗" | "薄弱点" / "未掌握" / "gap" |
| 信号区 | "做题时看到的信号" | "错因分析" / "错误模式" |
| 建议区 | "先从这里补" | "补救计划" / "纠正方案" |
| 按钮 | "生成纸质包 ↗" | "生成 PDF" |

### 2.5 Commit ② 验收

- [ ] session 完成后自动跳转报告页
- [ ] 报告显示知识点卡片（口语化名称 + "这道已经过了"/"这道还卡着"）
- [ ] 报告显示"做题时看到的信号"（知识点级统计，非错因定性）
- [ ] 报告包含"先从这里补"建议
- [ ] 不出现后端术语（BKT/KST/masteryProb）
- [ ] 不出现"薄弱点""未掌握""错因分析"等词
- [ ] 报告包含"从哪里开始补"建议
- [ ] 不出现后端术语（BKT/KST/masteryProb）
- [ ] 不出现"薄弱点""未掌握"等词
- [ ] P4 措辞全部合规
- [ ] 测试通过 + build 通过

---

## Commit ③：纸质包预览 + session 列表

### 3.1 纸质包页（/nana/paper-pack）

**文件**：`src/app/nana/paper-pack/page.tsx`

在已有 `src/app/diagnosis/paper-pack/page.tsx`（242 行）基础上包一层：
- 复用已有组件和 `@media print` 规则
- 统一 `/nana` 路由入口
- 页面标题：复用已有封面样式

**设计说明**：已有纸质包页面功能完整（封面 + 练习区 + 答案分页 + `@media print`），无需重写。新文件只做路由包装。

### 3.2 P4 措辞检查（纸质包）

已有纸质包页面 `src/app/diagnosis/paper-pack/page.tsx` 中的文案需要逐项检查是否与 Nana 口径一致：

| 位置 | 当前文案 | 建议改为 | 原因 |
|------|---------|---------|------|
| 封面标题 | "周中微练" / 可能含"知识点"字样的标题 | "这周的小练习" | 避免"知识"评测感，换成行动用语 |
| 练习区头部 | "巩固练习" | "再练练这几道" | "巩固"暗示"你没掌握" |
| 页眉/页脚 | 如含"PDF"、"诊断"、"评估"字样的文案 | 去掉或替换 | 前台不暴露后端概念 |

具体修改以实际页面文案为准，一一检查后调整。

### 3.2 Session 列表页完善

**文件**：`src/app/nana/session/page.tsx`（如 Commit ① 未完成则补充）

- 列表完整展示
- 每个 session 卡片：创建日期 + 题目数 + 状态 + "查看报告"链接

### 3.3 整体集成

- `/nana/session` → 选择主线 → 答题 → 提交 → `/nana/session/[id]/report` → 生成纸质包 → `/nana/paper-pack`
- `/nana/capture` 采集壳累积 ≥3 道后"开始诊断"链接 → `/nana/session`

### 3.4 P4 措辞检查

纸质包已有措辞已合规（"本周题目"、"提示"、"参考答案"），不需修改。

### 3.5 Commit ③ 验收

- [ ] `/nana/paper-pack` 可访问，复用已有打印页
- [ ] session 列表页显示历史记录
- [ ] 全流程走通：首页 → session → 答题 → 报告 → 纸质包
- [ ] P4 措辞全部合规
- [ ] 测试通过 + build 通过

---

## 文件变更清单

### 新增文件

| 文件 | Commit | 说明 |
|------|:--:|------|
| `src/app/nana/session/page.tsx` | ① | session 列表页 |
| `src/app/nana/session/[id]/page.tsx` | ① | session 答题流程页 |
| `src/components/nana/session/question-card.tsx` | ① | 答题卡片组件 |
| `src/components/nana/session/session-flow.tsx` | ① | Session 流程编排 |
| `src/app/nana/session/[id]/report/page.tsx` | ② | 批次诊断报告页 |
| `src/components/nana/session/report-knowledge-card.tsx` | ② | 知识点卡片组件 |
| `src/components/nana/session/report-pattern-card.tsx` | ② | 错因模式卡片组件 |
| `src/app/nana/paper-pack/page.tsx` | ③ | 纸质包路由包装 |

### 修改文件

| 文件 | Commit | 修改内容 |
|------|:--:|----------|
| `src/lib/nana/nana-api-client.ts` | ① | 追加 session API 调用方法 |
| `package.json` | — | 如需新依赖 |

### 碰不得文件（同第 1 阶段）

`src/app/layout.tsx`、`src/app/globals.css`、`src/app/page.tsx`、所有 `src/components/ui/`、所有 `src/lib/` 只 import 不改。

---

## 整体验收

- [ ] **Commit ①** — Session 答题 UI 流程走通（题单→答题→核对→提交）
- [ ] **Commit ②** — 报告页展示知识点+"信号"+"先从这里补"，不做错因定性
- [ ] **Commit ③** — 纸质包路由包装 + session 列表 + 全流程闭环
- [ ] **P4 措辞全局检查** — 无"薄弱点""未掌握""正确率""BKT""KST""PDF""诊断报告"
- [ ] **零新 API**（全复用已有 `api/diagnosis/*`）
- [ ] **零上游表修改**
- [ ] **Docker 测试容器** — test:all 通过
- [ ] **Build** — exit code 0
