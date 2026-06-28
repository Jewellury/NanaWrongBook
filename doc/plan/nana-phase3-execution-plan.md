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
- 创建新 session 按钮 → 跳转 `POST /api/diagnosis/session-items` 或先跳转到选择主线页面
- 无 session 时显示空状态："还没有做过诊断"

**注意**：session 创建需要 `mainlineId`。首期可以让用户选择主线（如"函数"、"三角"），或硬编码为 M2a（函数主线，最高权重基础线）。建议首期做**主线选择页**或直接硬编码 M2a。

### 1.2 Session 流程页

**文件**：`src/app/nana/session/[id]/page.tsx`（"use client"）

**流程**：
```
调用 POST /api/diagnosis/session-items → 获取题单
→ 逐个展示答题卡片（参考 05-quiz.html）
→ 全部答完后调用 POST /api/diagnosis/submit-answers
→ BKT+KST 更新 → 跳转报告页
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
- 所有题答完（或部分跳过）→ 调用 `POST /api/diagnosis/submit-answers`
- body: `{ sessionId, studentId, mainlineId, answers: [{ nodeId, itemId, correct }] }`
- **注意**：`submit-answers` 需要每道题的 `correct`（对/错）。前端需让学生提交答案后由系统判对错。首期可以：
  - 选择题：后端已有答案，前端提交选择后后端判对错
  - 填空/解答：暂时手动标记或直接设为考后核对（首期暂不自动判）

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

- [ ] `/nana/session` 列表页可访问
- [ ] 答题流程完整：显示题目 → 选择/输入 → 提交 → 下一题
- [ ] 跳过按钮温和接住（文案正确）
- [ ] 进度点显示正确
- [ ] 零新 API（全复用已有）
- [ ] P4 措辞全部合规
- [ ] 测试通过 + build 通过

---

## Commit ②：批次诊断报告页

### 2.1 报告页

**文件**：`src/app/nana/session/[id]/report/page.tsx`（"use client"）

**数据来源**：`GET /api/diagnosis/sessions/[id]` 获取 session 详情（含 probes + errors）

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

**报告逻辑**（前端聚合，不调新 API）：
1. **知识点列表**：从 session 的 `records` 中提取所有 `nodeId`，去重后显示（口语化名称，从 KnowledgeNode.name 映射）
2. **错因模式**：从 session 的 `errors` 中提取 `errorType`，统计出现最多的模式
3. **补救建议**：基于知识点列表生成简单建议（首期用模板规则："建议先搞定[第一期错误的节点]……"）

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
| 知识点状态 | "需要看看" / "留意一下" | "薄弱点" / "未掌握" / "gap" |
| 错因区 | "做题时有什么规律" | "错因分析" / "错误模式" |
| 建议区 | "从哪里开始补" | "补救计划" / "纠正方案" |
| 按钮 | "生成纸质包 ↗" | "生成 PDF" |

### 2.5 Commit ② 验收

- [ ] session 完成后自动跳转报告页
- [ ] 报告显示知识点卡片（口语化名称 + 判定标准）
- [ ] 报告显示错因模式文字
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

**设计说明**：已有纸质包页面功能完整（封面 + 练习区 + 答案分页），无需重写。新文件只做路由包装。

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

- [ ] **Commit ①** — Session 答题 UI 流程走通（创建→答题→提交）
- [ ] **Commit ②** — 批次诊断报告页展示知识点 + 错因模式 + 建议
- [ ] **Commit ③** — 纸质包路由包装 + session 列表 + 全流程闭环
- [ ] **P4 措辞全局检查** — 无"薄弱点""未掌握""正确率""BKT""KST"
- [ ] **零新 API**（全复用已有 `api/diagnosis/*`）
- [ ] **零上游表修改**
- [ ] **Docker 测试容器** — test:all 通过
- [ ] **Build** — exit code 0
